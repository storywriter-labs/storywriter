import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity } from 'react-native';
import { useConversationStore } from '@/src/stores/conversationStore';
import { trackEvent, AnalyticsEvents } from '@/src/utils/analytics';
import { Colors, FontSizes, Spacing, BorderRadius } from '@/constants/theme';

// --- CONFIGURATION ---
const LOADING_MESSAGES = [
  { text: "Creating your story...", emoji: "✨", duration: 3000 },
  { text: "Adding magical illustrations...", emoji: "🎨", duration: 3500 },
  { text: "Almost ready!", emoji: "🌟", duration: 2000 }
];

const ERROR_MESSAGES = [
  "Oops! Our story machine needs a quick break. Let's try again! 🔧",
  "The story elves are working extra hard! Please wait a moment... 🧝‍♀️",
  "Sometimes even the best storytellers need a moment to think! 📚"
];

// --- SUB-COMPONENT: ERROR VIEW ---
const ErrorView = ({ onRetry }: { onRetry: () => void }) => {
  const randomMsg = ERROR_MESSAGES[Math.floor(Math.random() * ERROR_MESSAGES.length)];

  return (
    <View style={styles.card}>
      <Text style={styles.emojiLarge}>😊</Text>
      <Text style={styles.messageText}>{randomMsg}</Text>
      <TouchableOpacity style={styles.retryButton} onPress={onRetry}>
        <Text style={styles.retryText}>Try Again! 🚀</Text>
      </TouchableOpacity>
    </View>
  );
};

// --- SUB-COMPONENT: LOADING VIEW ---
const LoadingView = () => {
  const [index, setIndex] = useState(0);
  const [bounceAnim] = useState(new Animated.Value(0));

  // 1. Cycle Messages Logic
  useEffect(() => {
    const currentDuration = LOADING_MESSAGES[index].duration;
    const timer = setTimeout(() => {
      setIndex((prev) => (prev + 1) % LOADING_MESSAGES.length);
    }, currentDuration);
    return () => clearTimeout(timer);
  }, [index]);

  // 2. Simple Bounce Animation
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, { toValue: -20, duration: 800, useNativeDriver: true }),
        Animated.timing(bounceAnim, { toValue: 0, duration: 800, useNativeDriver: true })
      ])
    ).start();
  }, [bounceAnim]);

  const current = LOADING_MESSAGES[index];

  return (
    <View style={styles.card}>
      {/* Bouncing Character */}
      <Animated.View style={{ transform: [{ translateY: bounceAnim }] }}>
        <Text style={styles.emojiLarge}>{current.emoji}</Text>
      </Animated.View>

      {/* Message */}
      <Text style={styles.messageText}>{current.text}</Text>

      {/* Simple Progress Dots */}
      <View style={styles.dotContainer}>
        {LOADING_MESSAGES.map((_, i) => (
          <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
        ))}
      </View>

      <Text style={styles.subText}>Your amazing story is coming to life! 🌈</Text>
    </View>
  );
};

// --- MAIN COMPONENT ---
interface Props {
  isVisible: boolean;
}

const StoryGenerationSplash: React.FC<Props> = ({ isVisible }) => {
  const getError = useConversationStore(s => s.getError);
  const retryStoryGeneration = useConversationStore(s => s.retryStoryGeneration);
  const retryCountRef = useRef(0);

  // Check if we have a specific generation error
  const error = getError('story_generation')?.userMessage;

  const handleRetry = () => {
    retryCountRef.current += 1;
    trackEvent(AnalyticsEvents.STORY_GENERATION_RETRIED, {
      retry_count: retryCountRef.current,
    });
    void retryStoryGeneration();
  };

  if (!isVisible) return null;

  return (
    <View style={styles.container}>
      {error ? (
        <ErrorView onRetry={handleRetry} />
      ) : (
        <LoadingView />
      )}
    </View>
  );
};

// --- STYLES ---
const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject, // Covers entire screen
    backgroundColor: 'transparent', // Let background image show through
    zIndex: 999,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  card: {
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.large,
    padding: Spacing.xxxl,
    maxWidth: 600,
    width: '100%',
    alignItems: 'center',
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 12,
    borderWidth: 4,
    borderColor: Colors.yellow,
  },
  emojiLarge: {
    fontSize: FontSizes.enormous,
    marginBottom: Spacing.lg,
  },
  messageText: {
    fontSize: FontSizes.xxxl,
    fontWeight: '600',
    color: Colors.coral,
    textAlign: 'center',
    marginBottom: Spacing.lg,
    minHeight: 60, // Prevents layout jump when text changes
  },
  subText: {
    fontSize: FontSizes.lg,
    color: Colors.teal,
    marginTop: Spacing.lg,
    fontWeight: '600',
  },
  dotContainer: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.lightGray,
  },
  dotActive: {
    backgroundColor: Colors.teal,
    transform: [{ scale: 1.3 }],
  },
  retryButton: {
    backgroundColor: Colors.teal,
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.lg,
    elevation: 5,
    borderWidth: 2,
    borderColor: Colors.tealDark,
  },
  retryText: {
    color: Colors.white,
    fontSize: FontSizes.lg,
    fontWeight: 'bold',
  }
});

export default StoryGenerationSplash;