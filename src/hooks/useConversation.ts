import { useState, useEffect, useRef, useCallback } from 'react';
import ElevenLabsService from '@/services/elevenLabsService';
import { ConversationSession, ConversationMessage as ElevenLabsMessage } from '@/types/elevenlabs';
import { useConversationStore } from '@/src/stores/conversationStore';
import { useStoryStore } from '@/src/stores/storyStore';
import { useErrorStore } from '@/src/stores/errorStore';
import { ErrorHandler, ErrorType, ErrorSeverity, ChildFriendlyErrors } from '@/src/utils/errorHandler';
import { conversationLogger, logger, LogCategory } from '@/src/utils/logger';
import { TranscriptProcessor } from '@/src/utils/transcriptProcessor';
import { trackEvent, AnalyticsEvents } from '@/src/utils/analytics';

export interface ConversationMessage {
  role: 'user' | 'agent';
  content: string;
  timestamp: number;
}

/**
 * Key the conversation failure is filed under in the shared error store, the
 * same way story generation files 'story_generation'. Components read it from
 * there — the failure used to go to Alert.alert, which is an empty function on
 * the web build, so a kid whose conversation dropped out saw nothing (#87).
 */
export const CONVERSATION_ERROR_KEY = 'conversation';

/**
 * Names the agent may use for "I have enough, write the story". Which one it
 * actually calls depends on the ElevenLabs agent config, so both are
 * registered — the SDK matches on the exact name and treats a miss as a fatal
 * error (#111).
 */
export const END_CONVERSATION_TOOL_NAMES = ['end_conversation', 'end_call'] as const;

/**
 * Puts a conversation failure somewhere the UI can find it. The message a kid
 * ends up reading is the child-friendly wording, not the raw provider error.
 */
const reportConversationError = (error: unknown, context: Record<string, unknown>) => {
  const appError = ErrorHandler.fromUnknown(
    error,
    ErrorType.CONVERSATION,
    ErrorSeverity.MEDIUM,
    context
  );

  useErrorStore.getState().addError(CONVERSATION_ERROR_KEY, {
    ...appError,
    userMessage: ChildFriendlyErrors.getRandomMessage('conversation'),
  });
};

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

  // The SDK callbacks below are handed over once, when the session starts, so
  // they close over the state of that render — where the session is still
  // null. Reading it from a ref is what lets the agent-triggered end actually
  // hang up instead of leaving the socket open.
  const conversationSessionRef = useRef<ConversationSession | null>(null);
  const setSession = useCallback((session: ConversationSession | null) => {
    conversationSessionRef.current = session;
    setConversationSession(session);
  }, []);

  const phase = useConversationStore(s => s.phase);
  const storeStartConversation = useConversationStore(s => s.startConversation);
  const storeEndConversation = useConversationStore(s => s.endConversation);
  const setConversationId = useConversationStore(s => s.setConversationId);
  const resetConversation = useConversationStore(s => s.resetConversation);
  const generateStoryAutomatically = useStoryStore(s => s.generateStoryAutomatically);

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

    const session = conversationSessionRef.current;

    if (session) {
      try {
        await session.endSession();
      } catch (error) {
        // Log only, on purpose: we already have the transcript and are about to
        // generate the story, so a failed hang-up is nothing the kid can act on
        // and nothing they should be interrupted about.
        ErrorHandler.handleError(ErrorHandler.fromUnknown(
          error,
          ErrorType.CONVERSATION,
          ErrorSeverity.LOW,
          { action: 'end_conversation' }
        ));
      }
    }

    setSession(null);
    storeEndConversation(finalTranscript);

    setTimeout(() => {
      void generateStoryAutomatically(finalTranscript);
    }, 500);
  }, [setSession, storeEndConversation, generateStoryAutomatically]);

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

  /**
   * Runs when the agent calls its end tool. Returns straight away with the
   * result the SDK sends back to the agent, and lets the hang-up happen on the
   * next tick — closing the socket first would make that send throw, and the
   * SDK turns a throw here back into the error the kid was never meant to see.
   */
  const handleEndConversationTool = useCallback((toolName: string) => {
    logger.info(LogCategory.CONVERSATION, 'Agent called end tool - processing transcript and ending conversation', {
      toolName,
      messageCount: rawMessages.current.length,
    });

    if (flushTimeoutRef.current) {
      clearTimeout(flushTimeoutRef.current);
      flushTimeoutRef.current = null;
    }
    pendingFlushRef.current = false;

    setTimeout(() => {
      processTranscriptAndEnd();
    }, 0);

    return 'Ending the conversation now.';
  }, [processTranscriptAndEnd]);

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
    useErrorStore.getState().removeError(CONVERSATION_ERROR_KEY);
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
          setSession(null);

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

        // The agent's own audio is played by the SDK, and tool calls come in
        // through clientTools below — onMessage only ever carries the agent's
        // and the kid's words.
        onMessage: (message: ElevenLabsMessage) => {
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
          } else {
            logger.debug(LogCategory.CONVERSATION, 'Received message with no usable text', {
              source: message.source,
              keys: Object.keys(message)
            });
          }
        },

        clientTools: Object.fromEntries(
          END_CONVERSATION_TOOL_NAMES.map(toolName => [
            toolName,
            () => handleEndConversationTool(toolName),
          ])
        ),

        // A tool we don't know about means the agent config has moved on
        // without us. Say so in the log, but leave the kid talking — dropping
        // them into the error card over it is worse than ignoring the call.
        onUnhandledClientToolCall: (toolCall) => {
          logger.warn(LogCategory.CONVERSATION, 'Agent called a tool the app does not implement', {
            toolName: toolCall?.tool_name,
            knownTools: END_CONVERSATION_TOOL_NAMES,
          });
        },

        onError: (error) => {
          setIsConnecting(false);
          setSession(null);
          // The session is gone, so drop the phase back to IDLE. Left on ACTIVE
          // the screen keeps showing the mic and "Listening..." for a
          // conversation that isn't there, and the retry below is a no-op.
          resetConversation();
          trackEvent(AnalyticsEvents.CONVERSATION_CONNECTION_FAILED, {
            error_message: error instanceof Error ? error.message : String(error),
          });
          reportConversationError(error, { action: 'conversation_connection' });
        },
      });

      setSession(session);

      try {
        const elevenLabsConversationId = session.getId();
        if (elevenLabsConversationId) {
          setConversationId(elevenLabsConversationId);
        }
      } catch (idError) {
        logger.warn(LogCategory.CONVERSATION, 'Failed to read ElevenLabs conversation ID from session', {
          error: idError instanceof Error ? idError.message : String(idError),
        });
      }
    } catch (error) {
      setIsConnecting(false);
      resetConversation();
      reportConversationError(error, { action: 'start_conversation' });
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
