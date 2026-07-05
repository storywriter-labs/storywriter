import React, { useRef } from 'react';
import { View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import Layout from '../../components/Layout/Layout';
import { useConversationStore, ConversationPhase } from '@/src/stores/conversationStore';
import { useStoryStore } from '@/src/stores/storyStore';
import StoryContent from '@/components/StoryContent/StoryContent';
import ConversationInterface, { ConversationInterfaceRef } from '@/components/ConversationInterface/ConversationInterface';
import StoryGenerationSplash from '@/components/StoryGenerationSplash/StoryGenerationSplash';
import ErrorBoundary from '@/components/ErrorBoundary/ErrorBoundary';
import BackgroundImage from '@/components/BackgroundImage/BackgroundImage';
import WelcomeOverlay from '@/components/WelcomeOverlay/WelcomeOverlay';
import { trackEvent, AnalyticsEvents } from '@/src/utils/analytics';
import { s } from './StoryScreen.style';

const StoryScreen = () => {
  const isFocused = useIsFocused();
  const story = useStoryStore(s => s.story);
  const phase = useConversationStore(s => s.phase);
  const isGenerating = useStoryStore(s => s.isGenerating);

  const conversationRef = useRef<ConversationInterfaceRef>(null);
  const currentPhase: ConversationPhase = phase;

  // Show welcome overlay when IDLE, user hasn't started, AND screen is focused
  const showWelcome = isFocused && currentPhase === 'IDLE' && !story.content;

  const handleStart = () => {
    trackEvent(AnalyticsEvents.STORY_CREATION_STARTED, { entry_point: 'welcome_overlay' });
    // Start the conversation when the welcome button is clicked
    conversationRef.current?.startConversation();
  };

  // Show story content (without background). Gate the reader on isFocused so an
  // unfocused Lab tab doesn't mount an off-screen BookReader for the in-progress
  // creation's story — that mount fires a STORY_OPENED analytics event and kicks
  // off lazy page-image generation for a reader nobody is looking at (e.g. while
  // browsing another tab). See card #42; the bookshelf reader (card #47) has its
  // own local state and no longer shares this store slice at all.
  if (story.content) {
    return (
      <Layout>
        <View style={s.container}>
          {isFocused && <StoryContent />}
        </View>
      </Layout>
    );
  }

  // Show all other phases with background (IDLE, ACTIVE, GENERATING)
  return (
    <Layout>
      <BackgroundImage opacity={0.6}>
        <View style={s.container}>
          {currentPhase === 'GENERATING' ? (
            <ErrorBoundary>
              <StoryGenerationSplash
                isVisible={isFocused}
              />
            </ErrorBoundary>
          ) : (
            <>
              {(currentPhase === 'IDLE' || currentPhase === 'ACTIVE') && (
                <ConversationInterface
                  ref={conversationRef}
                  disabled={isGenerating}
                  hideButtons={true}
                />
              )}

              <WelcomeOverlay
                visible={showWelcome}
                onStart={handleStart}
              />
            </>
          )}
        </View>
      </BackgroundImage>
    </Layout>
  );
};

export default StoryScreen;