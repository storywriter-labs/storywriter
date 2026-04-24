import React, { useEffect, useRef, useMemo } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { Colors } from '@/constants/theme';

interface AudioVisualizerProps {
  isActive: boolean;
  speaker: 'user' | 'agent' | 'none';
}

const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ isActive, speaker }) => {
  // Create animated values for each bar
  const bar1 = useRef(new Animated.Value(0.2)).current;
  const bar2 = useRef(new Animated.Value(0.2)).current;
  const bar3 = useRef(new Animated.Value(0.2)).current;
  const bar4 = useRef(new Animated.Value(0.2)).current;
  const bar5 = useRef(new Animated.Value(0.2)).current;
  const bar6 = useRef(new Animated.Value(0.2)).current;
  const bar7 = useRef(new Animated.Value(0.2)).current;

  const bars = useMemo(() => [bar1, bar2, bar3, bar4, bar5, bar6, bar7], [bar1, bar2, bar3, bar4, bar5, bar6, bar7]);

  useEffect(() => {
    if (!isActive || speaker === 'none') {
      // Static flat line - reset all bars to minimal height
      bars.forEach(bar => {
        Animated.timing(bar, {
          toValue: 0.2,
          duration: 300,
          useNativeDriver: false,
        }).start();
      });
      return;
    }

    // Animated soundwaves when someone is speaking
    const animations: Animated.CompositeAnimation[] = [];

    bars.forEach((bar, index) => {
      // Stagger the animations for a wave effect
      const delay = index * 80;

      // Create a looping animation with random-ish heights
      const sequence = Animated.sequence([
        Animated.delay(delay),
        Animated.loop(
          Animated.sequence([
            Animated.timing(bar, {
              toValue: 0.5 + Math.random() * 0.5,
              duration: 200 + Math.random() * 200,
              useNativeDriver: false,
            }),
            Animated.timing(bar, {
              toValue: 0.3 + Math.random() * 0.4,
              duration: 200 + Math.random() * 200,
              useNativeDriver: false,
            }),
            Animated.timing(bar, {
              toValue: 0.6 + Math.random() * 0.4,
              duration: 200 + Math.random() * 200,
              useNativeDriver: false,
            }),
            Animated.timing(bar, {
              toValue: 0.2 + Math.random() * 0.3,
              duration: 200 + Math.random() * 200,
              useNativeDriver: false,
            }),
          ])
        ),
      ]);

      animations.push(sequence);
    });

    // Start all animations
    animations.forEach(animation => animation.start());

    // Cleanup function to stop animations
    return () => {
      animations.forEach(animation => animation.stop());
    };
  }, [isActive, speaker, bars]);

  // Determine color based on speaker
  const getBarColor = () => {
    if (speaker === 'user') return Colors.teal; // Teal for user
    if (speaker === 'agent') return Colors.yellow; // Yellow for agent
    return Colors.lightGray; // Gray for none
  };

  const barColor = getBarColor();

  return (
    <View style={styles.container}>
      {bars.map((bar, index) => (
        <Animated.View
          key={index}
          style={[
            styles.bar,
            {
              backgroundColor: barColor,
              height: bar.interpolate({
                inputRange: [0, 1],
                outputRange: ['10%', '100%'],
              }),
            },
          ]}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 80,
    gap: 6,
    paddingHorizontal: 20,
  },
  bar: {
    width: 8,
    borderRadius: 4,
    minHeight: 8,
  },
});

export default AudioVisualizer;
