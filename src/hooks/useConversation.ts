import { useState, useEffect, useRef, useCallback } from 'react';
import ElevenLabsService from '@/services/elevenLabsService';
import { ConversationSession, ConversationMessage as ElevenLabsMessage } from '@/types/elevenlabs';
import { useConversationStore } from '@/src/stores/conversationStore';
import { useStoryStore } from '@/src/stores/storyStore';
import { useErrorHandler } from '@/src/hooks/useErrorHandler';
import { ErrorType, ErrorSeverity } from '@/src/utils/errorHandler';
import { conversationLogger, logger, LogCategory } from '@/src/utils/logger';
import { TranscriptProcessor } from '@/src/utils/transcriptProcessor';
import { trackEvent, AnalyticsEvents } from '@/src/utils/analytics';
import { createNarrationPlayer } from '@/services/narration';
import { extractAudioFromMessage } from '@/services/narration/audioDecoder';

export interface ConversationMessage {
  role: 'user' | 'agent';
  content: string;
  timestamp: number;
}

export interface UseConversationReturn {
  startConversation: () => void;
  endConversation: () => void;
  skipConversation: (transcript: string) => void;
  messages: ConversationMessage[];
  currentSpeaker: 'user' | 'agent' | 'none';
  isConnecting: boolean;
  isActive: boolean;
}

export const useConversation = (): UseConversationReturn => {
  const [isConnecting, setIsConnecting] = useState(false);
  const [conversationSession, setConversationSession] = useState<ConversationSession | null>(null);
  const [currentSpeaker, setCurrentSpeaker] = useState<'user' | 'agent' | 'none'>('none');
  const [messages, setMessages] = useState<ConversationMessage[]>([]);

  const rawMessages = useRef<ConversationMessage[]>([]);
  const flushTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingFlushRef = useRef<boolean>(false);
  const speakerTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const conversationStartTimeRef = useRef<number>(0);

  const phase = useConversationStore(s => s.phase);
  const storeStartConversation = useConversationStore(s => s.startConversation);
  const storeEndConversation = useConversationStore(s => s.endConversation);
  const generateStoryAutomatically = useStoryStore(s => s.generateStoryAutomatically);

  const { handleError } = useErrorHandler({
    showAlert: true,
    useChildFriendlyMessages: true
  });

  const isConversationActive = phase === 'ACTIVE';

  // Message capture debounce (for logging/validation only - does NOT end conversation)
  const scheduleMessageProcessing = useCallback(() => {
    if (flushTimeoutRef.current) {
      clearTimeout(flushTimeoutRef.current);
    }

    flushTimeoutRef.current = setTimeout(() => {
      if (pendingFlushRef.current) {
        pendingFlushRef.current = false;
      }
    }, 2000);
  }, []);

  // Handle end conversation with transcript
  const handleEndConversationInternal = useCallback(async (finalTranscript: string) => {
    const messageList = rawMessages.current;
    const userMessages = messageList.filter(msg => msg.role === 'user');
    const durationSeconds = conversationStartTimeRef.current
      ? Math.round((Date.now() - conversationStartTimeRef.current) / 1000)
      : 0;

    trackEvent(AnalyticsEvents.CONVERSATION_ENDED, {
      end_method: 'auto',
      message_count: messageList.length,
      user_message_count: userMessages.length,
      duration_seconds: durationSeconds,
    });

    if (conversationSession) {
      try {
        await conversationSession.endSession();
      } catch (error) {
        handleError(error, ErrorType.CONVERSATION, ErrorSeverity.LOW, {
          action: 'end_conversation'
        });
      }
    }

    setConversationSession(null);
    storeEndConversation(finalTranscript);

    setTimeout(() => {
      void generateStoryAutomatically(finalTranscript);
    }, 500);
  }, [conversationSession, handleError, storeEndConversation, generateStoryAutomatically]);

  // Validate and process transcript
  const processTranscriptAndEnd = useCallback(() => {
    const messageList = rawMessages.current;
    const finalTranscript = TranscriptProcessor.validateAndProcess(messageList);

    if (!finalTranscript) {
      return;
    }

    pendingFlushRef.current = false;
    void handleEndConversationInternal(finalTranscript);
  }, [handleEndConversationInternal]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (conversationSession) {
        conversationLogger.cleanup({ sessionId: conversationSession.conversation?.conversationId });
        ElevenLabsService.forceCleanup();
      }
      if (speakerTimeoutRef.current) {
        clearTimeout(speakerTimeoutRef.current);
      }
    };
  }, [conversationSession]);

  // Reset messages when starting new conversation
  useEffect(() => {
    if (isConnecting) {
      rawMessages.current = [];
      setMessages([]);
      setCurrentSpeaker('none');
      if (flushTimeoutRef.current) {
        clearTimeout(flushTimeoutRef.current);
        flushTimeoutRef.current = null;
      }
      if (speakerTimeoutRef.current) {
        clearTimeout(speakerTimeoutRef.current);
        speakerTimeoutRef.current = null;
      }
      pendingFlushRef.current = false;
    }
  }, [isConnecting]);


  const startConversation = async () => {
    if (isConnecting || isConversationActive) return;

    setIsConnecting(true);
    storeStartConversation();
    conversationStartTimeRef.current = Date.now();

    try {
      const session = await ElevenLabsService.startConversationAgent({
        onConnect: () => {
          conversationLogger.connected();
          setIsConnecting(false);
          const connectionTimeMs = Date.now() - conversationStartTimeRef.current;
          trackEvent(AnalyticsEvents.CONVERSATION_CONNECTED, { connection_time_ms: connectionTimeMs });
        },

        onDisconnect: () => {
          conversationLogger.disconnected();
          setConversationSession(null);

          if (rawMessages.current.length > 0) {
            const userMessages = rawMessages.current.filter(msg => msg.role === 'user');

            logger.info(LogCategory.CONVERSATION, 'Disconnect with messages - processing transcript as fallback', {
              totalMessages: rawMessages.current.length,
              userMessages: userMessages.length
            });

            if (userMessages.length >= 2) {
              if (flushTimeoutRef.current) {
                clearTimeout(flushTimeoutRef.current);
                flushTimeoutRef.current = null;
              }
              pendingFlushRef.current = false;

              processTranscriptAndEnd();
            } else {
              logger.warn(LogCategory.CONVERSATION, 'Disconnect with insufficient user messages - no story generation', {
                userMessages: userMessages.length,
                minRequired: 2
              });
            }
          }
        },

        onMessage: (message: ElevenLabsMessage) => {
          // Handle audio messages from ElevenLabs
          if (message.type === 'audio' && (message.audio || message.data)) {
            try {
              const audioArray = extractAudioFromMessage(message);
              if (!audioArray) {
                logger.warn(LogCategory.CONVERSATION, 'No audio data found in message');
                return;
              }

              const player = createNarrationPlayer();
              player.playOnce(audioArray).catch(error => {
                logger.error(LogCategory.CONVERSATION, 'Failed to play audio', { error });
              });

              logger.debug(LogCategory.CONVERSATION, 'Playing audio chunk', {
                audioSize: audioArray.length
              });
            } catch (error) {
              logger.error(LogCategory.CONVERSATION, 'Failed to process audio message', { error });
            }
          }

          // Capture messages for real transcript generation
          if (message.source && message.message && message.message.trim()) {
            const role = message.source === 'user' ? 'user' : 'agent';
            const timestamp = Date.now();
            const content = message.message!.trim();

            const newMessage: ConversationMessage = {
              role,
              content,
              timestamp
            };

            rawMessages.current = [...rawMessages.current, newMessage];
            setMessages(rawMessages.current);

            logger.debug(LogCategory.CONVERSATION, `${role} message captured`, {
              fullContent: content,
              messageCount: rawMessages.current.length
            });

            setCurrentSpeaker(role);

            if (speakerTimeoutRef.current) {
              clearTimeout(speakerTimeoutRef.current);
            }

            speakerTimeoutRef.current = setTimeout(() => {
              setCurrentSpeaker('none');
            }, 1500);

            pendingFlushRef.current = true;
            scheduleMessageProcessing();
          }

          // Handle end_conversation tool calls
          if (message.type === 'client_tool_call') {
            const toolCall = message.client_tool_call;

            logger.debug(LogCategory.CONVERSATION, 'Received client tool call', {
              toolName: toolCall?.tool_name,
              messageType: message.type,
              fullMessage: message
            });

            if (toolCall && (toolCall.tool_name === 'end_conversation' || toolCall.tool_name === 'end_call')) {
              logger.info(LogCategory.CONVERSATION, 'Agent called end tool - processing transcript and ending conversation', {
                toolName: toolCall.tool_name,
                messageCount: rawMessages.current.length
              });

              if (flushTimeoutRef.current) {
                clearTimeout(flushTimeoutRef.current);
                flushTimeoutRef.current = null;
              }

              pendingFlushRef.current = false;
              processTranscriptAndEnd();
            }
          } else {
            logger.debug(LogCategory.CONVERSATION, 'Received message', {
              messageType: message.type,
              source: message.source,
              hasContent: !!message.message,
              hasAudio: !!message.audio,
              hasData: !!message.data,
              keys: Object.keys(message)
            });
          }
        },

        onError: (error) => {
          setIsConnecting(false);
          setConversationSession(null);
          trackEvent(AnalyticsEvents.CONVERSATION_CONNECTION_FAILED, {
            error_message: error instanceof Error ? error.message : String(error),
          });
          handleError(error, ErrorType.CONVERSATION, ErrorSeverity.MEDIUM, {
            action: 'conversation_connection'
          });
        },
      });

      setConversationSession(session);
    } catch (error) {
      setIsConnecting(false);
      handleError(error, ErrorType.CONVERSATION, ErrorSeverity.MEDIUM, {
        action: 'start_conversation'
      });
    }
  };

  const skipConversation = useCallback((transcript: string) => {
    void handleEndConversationInternal(transcript);
  }, [handleEndConversationInternal]);

  const endConversation = async () => {
    if (flushTimeoutRef.current) {
      clearTimeout(flushTimeoutRef.current);
      flushTimeoutRef.current = null;
    }
    pendingFlushRef.current = false;

    if (rawMessages.current.length > 0) {
      const messageList = rawMessages.current;
      const userMessages = messageList.filter(msg => msg.role === 'user');

      if (userMessages.length < 2) {
        logger.warn(LogCategory.CONVERSATION, 'Manual end attempted with insufficient user messages', {
          totalMessages: messageList.length,
          userMessages: userMessages.length,
          minRequired: 2
        });
      }

      const finalTranscript = TranscriptProcessor.processTranscript(messageList);

      logger.info(LogCategory.CONVERSATION, 'Manual end with real transcript', {
        messageCount: messageList.length,
        userMessages: userMessages.length,
        transcriptLength: finalTranscript.length,
        fullTranscript: finalTranscript
      });

      await handleEndConversationInternal(finalTranscript);
    }
  };

  return {
    startConversation,
    endConversation,
    skipConversation,
    messages,
    currentSpeaker,
    isConnecting,
    isActive: isConversationActive
  };
};
