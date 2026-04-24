import React, { forwardRef, useImperativeHandle, useCallback } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useConversationStore } from '@/src/stores/conversationStore';
import { useStoryStore } from '@/src/stores/storyStore';
import { logger } from '@/src/utils/logger';
import AudioVisualizer from '@/components/AudioVisualizer/AudioVisualizer';
import { useConversation } from '@/src/hooks/useConversation';
import { styles } from './ConversationInterface.style';

interface Props {
  disabled?: boolean;
  hideButtons?: boolean;
}

export interface ConversationInterfaceRef {
  startConversation: () => void;
}

const ConversationInterface = forwardRef<ConversationInterfaceRef, Props>(({ disabled = false, hideButtons = false }, ref) => {
  const phase = useConversationStore(s => s.phase);
  const storeEndConversation = useConversationStore(s => s.endConversation);
  const generateStoryAutomatically = useStoryStore(s => s.generateStoryAutomatically);
  const { startConversation, endConversation, currentSpeaker, isConnecting, isActive } = useConversation();

  // Expose startConversation to parent via ref
  useImperativeHandle(ref, () => ({
    startConversation
  }));

  const handleTestMode = useCallback(() => {
    if (disabled) return;

    logger.testEvent('Using test mode - simulating conversation completion');

    const testTranscript = `User: I want a story about a dragon!

Agent: A dragon story sounds fantastic! What kind of dragon should it be? A friendly dragon, a magical dragon, or maybe a dragon with a special job?

User: A friendly dragon who helps people learn to read books

Agent: Oh, I love that idea! A dragon who helps with reading - that's so creative! Where should this helpful dragon live? In a library, a magical forest, or somewhere else special?

User: In a big library with lots and lots of books everywhere

Agent: Perfect! And who should the dragon help? Maybe some children who are learning to read?

User: Yeah! Kids who are scared to read out loud but the dragon makes them feel brave

Agent: That's such a wonderful and heartwarming idea! I think we have everything we need to create your story about a brave, helpful dragon in a magical library. Let me create that story for you now!`;

    storeEndConversation(testTranscript);
    setTimeout(() => {
      void generateStoryAutomatically(testTranscript);
    }, 500);
  }, [disabled, storeEndConversation, generateStoryAutomatically]);

  // Don't render the card at all when buttons are hidden and no active conversation
  if (hideButtons && !isActive && phase !== 'GENERATING') {
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
                (disabled || isConnecting || isActive) && styles.disabledButton
              ]}
              onPress={startConversation}
              disabled={disabled || isConnecting || isActive}
            >
              <Text style={[
                styles.primaryButtonText,
                (disabled || isConnecting || isActive) && styles.disabledButtonText
              ]}>
                {isConnecting ? '🔄 Connecting...' :
                 isActive ? '🎤 Conversation Active' :
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
        {isActive && (
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
              isActive={isActive}
              speaker={currentSpeaker}
            />

            {/* Helper Text */}
            <Text style={styles.helpText}>
              The agent will automatically end the conversation when ready to create your story.
            </Text>

            {/* End Conversation Button */}
            <TouchableOpacity
              style={styles.endButton}
              onPress={endConversation}
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