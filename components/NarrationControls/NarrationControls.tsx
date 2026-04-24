import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useConversationStore } from '@/src/stores/conversationStore';
import { styles } from './NarrationControls.style';

interface NarrationControlsProps {
    /** Callback to handle play button press */
    onPlay: () => void;
    /** Callback to handle pause button press */
    onPause: () => void;
    /** Optional error message to display */
    errorMessage?: string | null;
    /** Optional retry callback (only shown when error can be retried) */
    onRetry?: () => void;
}

export function NarrationControls({ onPlay, onPause, errorMessage, onRetry }: NarrationControlsProps) {
    const isNarrationPlaying = useConversationStore(s => s.isNarrationPlaying);
    const isLoadingAudio = useConversationStore(s => s.isLoadingAudio);
    const isRateLimited = useConversationStore(s => s.isRateLimited);

    return (
        <View style={styles.container}>
            {/* Error Message Display */}
            {errorMessage && (
                <View style={styles.errorContainer}>
                    <Text style={styles.errorText}>{errorMessage}</Text>
                    {onRetry && (
                        <TouchableOpacity
                            onPress={onRetry}
                            style={styles.retryButton}
                            accessible={true}
                            accessibilityLabel="Retry loading audio"
                            accessibilityRole="button"
                        >
                            <Text style={styles.retryButtonText}>🔄 Retry</Text>
                        </TouchableOpacity>
                    )}
                </View>
            )}

            {/* Play/Pause Button */}
            {isLoadingAudio ? (
                <ActivityIndicator size="small" color="#D35400" />
            ) : (
                <TouchableOpacity
                    onPress={isNarrationPlaying ? onPause : onPlay}
                    style={styles.playPauseButton}
                    disabled={isLoadingAudio || isRateLimited}
                    accessible={true}
                    accessibilityLabel={isNarrationPlaying ? "Pause narration" : "Play narration"}
                    accessibilityRole="button"
                >
                    <Text style={styles.playPauseIcon}>
                        {isNarrationPlaying ? '⏸' : '▶️'}
                    </Text>
                </TouchableOpacity>
            )}
        </View>
    );
}
