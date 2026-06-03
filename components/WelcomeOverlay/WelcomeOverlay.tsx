import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'; // Removed Animated temporarily to pass linting
import { Colors, Spacing, BorderRadius, FontSizes } from '@/constants/theme';

interface WelcomeOverlayProps {
  onStart: () => void;
  visible: boolean;
}

/**
 * WelcomeOverlay Component
 *
 * Displays a welcoming call-to-action overlay for children
 * when they first enter the StoryWriter experience.
 */
const WelcomeOverlay: React.FC<WelcomeOverlayProps> = ({ onStart, visible }) => {
  if (!visible) return null;

  return (
    <View style={styles.overlay}>
      <TouchableOpacity
        style={styles.startButton}
        onPress={onStart}
        activeOpacity={0.8}
      >
        <Text style={styles.buttonText}>Create a Story</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-start',
    alignItems: 'center',
    padding: Spacing.lg,
    paddingTop: 175,
  },
  startButton: {
    backgroundColor: Colors.coral,
    paddingVertical: 24,
    paddingHorizontal: 56,
    borderRadius: BorderRadius.large,
    borderWidth: 5,
    borderColor: Colors.darkestGray,
    shadowColor: Colors.black,
    shadowOffset: { width: 6, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 12,
    transform: [{ rotate: '-1deg' }],
  },
  buttonText: {
    color: '#FFFEF7',
    fontSize: FontSizes.enormous,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 1,
    textShadowColor: Colors.darkestGray,
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 0,
  },
});

export default WelcomeOverlay;
