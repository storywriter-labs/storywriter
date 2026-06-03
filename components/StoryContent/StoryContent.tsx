import React from 'react';
import { Text, View, ActivityIndicator, StyleSheet } from 'react-native';
import { useStoryStore } from '@/src/stores/storyStore';
import BookReader from '@/components/BookReader/BookReader';

/**
 * StoryContent Component
 *
 * Displays the generated story text and image as an interactive book with images and text.
 * Uses the BookSpread component to create a realistic book experience.
 * Replaces input UI once the story is ready.
 *
 * @param {boolean} isGenerating - Whether content is still being generated.
 * @param {{ text: string; imageUrl: string | null; title?: string }[]} sections - Generated story sections.
 *
 * @returns Book-like interface for story display.
 */
const StoryContent: React.FC = () => {
  const isGenerating = useStoryStore(s => s.isGenerating);
  const story = useStoryStore(s => s.story);
  const sections = story.sections;

  // 1. LOADING STATE
  if (isGenerating) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#3498db" />
        <Text style={styles.loadingText}>Creating your story...</Text>
      </View>
    );
  }

  // 2. EMPTY STATE
  if (!sections || sections.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.loadingText}>Waiting for story...</Text>
      </View>
    );
  }

  // 3. BOOK MODE (Replaces the old ScrollView loop)
  // We wrap it in a flex:1 View so it takes up ALL available space
  return (
    <View style={styles.fullScreenContainer}>
      <BookReader />
    </View>
  );
};

const styles = StyleSheet.create({
  fullScreenContainer: {
    flex: 1, // Crucial: forces the view to fill the parent
    width: '100%',
    height: '100%',
    backgroundColor: '#FAF9F6', // Match the book paper color
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 300,
  },
  loadingText: {
    marginTop: 20,
    fontSize: 16,
    color: '#666',
  }
});

export default StoryContent;