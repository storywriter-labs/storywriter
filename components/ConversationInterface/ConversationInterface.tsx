import React, { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import ElevenLabsService from '@/services/elevenLabsService';
import { ConversationSession, ConversationMessage } from '@/types/elevenlabs';
import { useConversationStore } from '@/src/stores/conversationStore';
import { useErrorHandler } from '@/src/hooks/useErrorHandler';
import { ErrorType, ErrorSeverity } from '@/src/utils/errorHandler';
import { conversationLogger, logger, LogCategory } from '@/src/utils/logger';
import { TranscriptNormalizer, DialogueTurn } from '@/src/utils/transcriptNormalizer';
import AudioVisualizer from '@/components/AudioVisualizer/AudioVisualizer';
import { trackEvent, AnalyticsEvents } from '@/src/utils/analytics';
import { styles } from './ConversationInterface.style';

interface Props {
  disabled?: boolean;
  hideButtons?: boolean;
}

export interface ConversationInterfaceRef {
  startConversation: () => void;
}

const ConversationInterface = forwardRef<ConversationInterfaceRef, Props>(({ disabled = false, hideButtons = false }, ref) => {
  const [isConnecting, setIsConnecting] = useState(false);
  const [conversationSession, setConversationSession] = useState<ConversationSession | null>(null);
  const [currentSpeaker, setCurrentSpeaker] = useState<'user' | 'agent' | 'none'>('none');
  const rawMessages = useRef<{role: 'user'|'agent', content: string, timestamp: number}[]>([]);
  const flushTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingFlushRef = useRef<boolean>(false);
  const speakerTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const conversationStartTimeRef = useRef<number>(0);
  
  // Simplified store usage - trust ElevenLabs for conversation management
  const phase = useConversationStore(s => s.phase);
  const storeStartConversation = useConversationStore(s => s.startConversation);
  const storeEndConversation = useConversationStore(s => s.endConversation);
  
  const { handleError } = useErrorHandler({
    showAlert: true,
    useChildFriendlyMessages: true
  });
  
  const isConversationActive = phase === 'ACTIVE';

  // Expose startConversation to parent via ref
  useImperativeHandle(ref, () => ({
    startConversation
  }));

  // Message capture debounce (for logging/validation only - does NOT end conversation)
  const scheduleMessageProcessing = useCallback(() => {
    if (flushTimeoutRef.current) {
      clearTimeout(flushTimeoutRef.current);
    }
    
    // This timeout is only for clearing the pending flag, NOT for ending conversations
    flushTimeoutRef.current = setTimeout(() => {
      if (pendingFlushRef.current) {
        // Simply clear the pending flag - no logging needed
        pendingFlushRef.current = false;
      }
    }, 2000);
  }, []);

  // Validate and process transcript
  const processTranscriptAndEnd = useCallback(() => {
    const messages = rawMessages.current;
    const userMessages = messages.filter(msg => msg.role === 'user');
    
    if (userMessages.length < 2) {
      logger.warn(LogCategory.CONVERSATION, 'Insufficient user messages for story generation', {
        totalMessages: messages.length,
        userMessages: userMessages.length,
        minRequired: 2
      });
      return;
    }

    const dialogueTurns: DialogueTurn[] = messages.map(msg => ({
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp
    }));
    
    const finalTranscript = TranscriptNormalizer.generateTranscript(dialogueTurns);
    
    logger.info(LogCategory.CONVERSATION, 'Generated final transcript with validation passed', {
      originalMessages: messages.length,
      userMessages: userMessages.length,
      processedLength: finalTranscript.length,
      fullTranscript: finalTranscript
    });
    
    pendingFlushRef.current = false;
    void handleEndConversation(finalTranscript);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup on unmount and reset messages when starting new conversation
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
    if (disabled || isConnecting || isConversationActive) return;

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
          
          // If we have messages but the agent didn't explicitly call end_conversation,
          // process the transcript as a fallback
          if (rawMessages.current.length > 0) {
            const userMessages = rawMessages.current.filter(msg => msg.role === 'user');
            
            logger.info(LogCategory.CONVERSATION, 'Disconnect with messages - processing transcript as fallback', {
              totalMessages: rawMessages.current.length,
              userMessages: userMessages.length
            });
            
            if (userMessages.length >= 2) {
              // Cancel any pending timeouts
              if (flushTimeoutRef.current) {
                clearTimeout(flushTimeoutRef.current);
                flushTimeoutRef.current = null;
              }
              pendingFlushRef.current = false;
              
              // Process the transcript
              processTranscriptAndEnd();
            } else {
              logger.warn(LogCategory.CONVERSATION, 'Disconnect with insufficient user messages - no story generation', {
                userMessages: userMessages.length,
                minRequired: 2
              });
            }
          }
        },
        
        onMessage: (message: ConversationMessage) => {
          // Handle audio messages from ElevenLabs
          if (message.type === 'audio' && (message.audio || message.data)) {
            try {
              let audioArray: Uint8Array<ArrayBuffer>;

              if (message.audio) {
                // Base64 encoded audio data
                const audioData = atob(message.audio);
                audioArray = new Uint8Array(audioData.length);
                for (let i = 0; i < audioData.length; i++) {
                  audioArray[i] = audioData.charCodeAt(i);
                }
              } else if (message.data instanceof ArrayBuffer) {
                // Binary audio data
                audioArray = new Uint8Array(message.data);
              } else if (typeof message.data === 'string') {
                // Base64 data field
                const audioData = atob(message.data);
                audioArray = new Uint8Array(audioData.length);
                for (let i = 0; i < audioData.length; i++) {
                  audioArray[i] = audioData.charCodeAt(i);
                }
              } else {
                throw new Error('Unsupported audio data format');
              }
              
              const audioBlob = new Blob([audioArray.buffer as ArrayBuffer], { type: 'audio/mpeg' });
              const audioUrl = URL.createObjectURL(audioBlob);
              
              const audio = new Audio(audioUrl);
              audio.onended = () => {
                URL.revokeObjectURL(audioUrl);
              };
              audio.onerror = (e) => {
                logger.error(LogCategory.CONVERSATION, 'Audio playback error', { error: e });
                URL.revokeObjectURL(audioUrl);
              };
              
              audio.play().catch(error => {
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

            rawMessages.current = [...rawMessages.current, {
              role,
              content,
              timestamp
            }];

            logger.debug(LogCategory.CONVERSATION, `${role} message captured`, {
              fullContent: content,
              messageCount: rawMessages.current.length
            });

            // Update current speaker for audio visualization
            setCurrentSpeaker(role);

            // Clear any existing speaker timeout
            if (speakerTimeoutRef.current) {
              clearTimeout(speakerTimeoutRef.current);
            }

            // Reset speaker to 'none' after 1.5 seconds of no messages
            speakerTimeoutRef.current = setTimeout(() => {
              setCurrentSpeaker('none');
            }, 1500);

            // Schedule message processing check (does not end conversation)
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
              
              // Cancel any pending message processing and end conversation immediately
              if (flushTimeoutRef.current) {
                clearTimeout(flushTimeoutRef.current);
                flushTimeoutRef.current = null;
              }
              
              pendingFlushRef.current = false;
              processTranscriptAndEnd();
            }
          } else {
            // Log all message types to understand what we're receiving
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
        
        // Removed status/mode logging as they provide no value
      });

      setConversationSession(session);
      
    } catch (error) {
      setIsConnecting(false);
      handleError(error, ErrorType.CONVERSATION, ErrorSeverity.MEDIUM, {
        action: 'start_conversation'
      });
    }
  };

  const handleEndConversation = async (finalTranscript: string) => {
    const messages = rawMessages.current;
    const userMessages = messages.filter(msg => msg.role === 'user');
    const durationSeconds = conversationStartTimeRef.current
      ? Math.round((Date.now() - conversationStartTimeRef.current) / 1000)
      : 0;

    trackEvent(AnalyticsEvents.CONVERSATION_ENDED, {
      end_method: 'auto',
      message_count: messages.length,
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
    // Pass the final transcript to the store for story generation
    storeEndConversation(finalTranscript);
  };

  const handleManualEnd = async () => {
    // Cancel any pending debounced flush
    if (flushTimeoutRef.current) {
      clearTimeout(flushTimeoutRef.current);
      flushTimeoutRef.current = null;
    }
    pendingFlushRef.current = false;
    
    // For manual ending, process the captured messages
    if (rawMessages.current.length > 0) {
      const messages = rawMessages.current;
      const userMessages = messages.filter(msg => msg.role === 'user');
      
      if (userMessages.length < 2) {
        logger.warn(LogCategory.CONVERSATION, 'Manual end attempted with insufficient user messages', {
          totalMessages: messages.length,
          userMessages: userMessages.length,
          minRequired: 2
        });
        // Still allow manual end but with warning
      }
      
      const dialogueTurns: DialogueTurn[] = messages.map(msg => ({
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp
      }));
      
      const finalTranscript = TranscriptNormalizer.generateTranscript(dialogueTurns);
      
      logger.info(LogCategory.CONVERSATION, 'Manual end with real transcript', {
        messageCount: messages.length,
        userMessages: userMessages.length,
        transcriptLength: finalTranscript.length,
        fullTranscript: finalTranscript
      });
      
      await handleEndConversation(finalTranscript);
    } else {
      // Fallback to test transcript if no messages captured
      const finalTranscript = generateTestTranscript();
      await handleEndConversation(finalTranscript);
    }
  };

  const handleTestMode = () => {
    if (disabled) return;
    
    logger.testEvent('Using test mode - simulating conversation completion');
    
    // Generate a realistic test transcript and trigger story generation
    const testTranscript = generateTestTranscript();
    storeEndConversation(testTranscript);
  };

  // Generate a realistic test transcript for development/testing
  const generateTestTranscript = (): string => {
    return `User: I want a story about a dragon!

Agent: A dragon story sounds fantastic! What kind of dragon should it be? A friendly dragon, a magical dragon, or maybe a dragon with a special job?

User: A friendly dragon who helps people learn to read books

Agent: Oh, I love that idea! A dragon who helps with reading - that's so creative! Where should this helpful dragon live? In a library, a magical forest, or somewhere else special?

User: In a big library with lots and lots of books everywhere

Agent: Perfect! And who should the dragon help? Maybe some children who are learning to read?

User: Yeah! Kids who are scared to read out loud but the dragon makes them feel brave

Agent: That's such a wonderful and heartwarming idea! I think we have everything we need to create your story about a brave, helpful dragon in a magical library. Let me create that story for you now!`;
  };

  // Don't render the card at all when buttons are hidden and no active conversation
  if (hideButtons && !isConversationActive && phase !== 'GENERATING') {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        {!hideButtons && (
          <>
            {/* Main Conversation Button */}
            <TouchableOpacity
              style={[
                styles.primaryButton,
                (disabled || isConnecting || isConversationActive) && styles.disabledButton
              ]}
              onPress={startConversation}
              disabled={disabled || isConnecting || isConversationActive}
            >
              <Text style={[
                styles.primaryButtonText,
                (disabled || isConnecting || isConversationActive) && styles.disabledButtonText
              ]}>
                {isConnecting ? '🔄 Connecting...' :
                 isConversationActive ? '🎤 Conversation Active' :
                 '🤖 Talk with StoryWriter Agent'}
              </Text>
            </TouchableOpacity>

            {/* Test Button */}
            {__DEV__ && (
              <TouchableOpacity
                style={[styles.testButton, disabled && styles.disabledButton]}
                onPress={handleTestMode}
                disabled={disabled}
              >
                <Text style={[styles.testButtonText, disabled && styles.disabledButtonText]}>
                  🧪 Skip to Story Generation (Test)
                </Text>
              </TouchableOpacity>
            )}
          </>
        )}

        {/* Active Conversation Controls */}
        {isConversationActive && (
          <View style={styles.audioContainer}>
            {/* Microphone Icon */}
            <View style={[
              styles.microphoneIcon,
              currentSpeaker === 'user' && styles.microphoneIconUser,
              currentSpeaker === 'agent' && styles.microphoneIconAgent,
            ]}>
              <Text style={styles.microphoneEmoji}>🎙️</Text>
            </View>

            {/* Speaker Label */}
            <Text style={styles.speakerLabel}>
              {currentSpeaker === 'user' && '🗣️ You are speaking'}
              {currentSpeaker === 'agent' && '🤖 Agent is speaking'}
              {currentSpeaker === 'none' && '👂 Listening...'}
            </Text>

            {/* Audio Visualizer */}
            <AudioVisualizer
              isActive={isConversationActive}
              speaker={currentSpeaker}
            />

            {/* Helper Text */}
            <Text style={styles.helpText}>
              The agent will automatically end the conversation when ready to create your story.
            </Text>

            {/* End Conversation Button */}
            <TouchableOpacity
              style={styles.endButton}
              onPress={handleManualEnd}
            >
              <Text style={styles.endButtonText}>End Conversation</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Status Display */}
        {phase === 'GENERATING' && (
          <View style={styles.processingContainer}>
            <Text style={styles.processingText}>
              ✨ Creating your story from the conversation...
            </Text>
          </View>
        )}
      </View>
    </View>
  );
});

ConversationInterface.displayName = 'ConversationInterface';

export default ConversationInterface;