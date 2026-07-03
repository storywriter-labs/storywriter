import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import { useNarrationStore } from '@/src/stores/narrationStore';
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
    /**
     * When true (web only), the browser blocked autoplay and narration is
     * loaded but waiting on a user gesture. Shows a "Tap to start narration"
     * prompt in place of the play button instead of a generic error.
     */
    showTapToStart?: boolean;
    /** Callback for the tap-to-start prompt (starts the loaded narration). */
    onTapToStart?: () => void;
}

export function NarrationControls({ onPlay, onPause, errorMessage, onRetry, showTapToStart, onTapToStart }: NarrationControlsProps) {
    const isNarrationPlaying = useNarrationStore(s => s.isNarrationPlaying);
    const isLoadingAudio = useNarrationStore(s => s.isLoadingAudio);
    const isRateLimited = useNarrationStore(s => s.isRateLimited);

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
                            <View style={styles.retryButtonContent}>
                                <Ionicons name="refresh" size={16} color={Colors.white} />
                                <Text style={styles.retryButtonText}>Retry</Text>
                            </View>
                        </TouchableOpacity>
                    )}
                </View>
            )}

            {/* Play/Pause Button (or tap-to-start prompt when autoplay is blocked) */}
            {isLoadingAudio ? (
                <ActivityIndicator size="small" color="#D35400" />
            ) : showTapToStart && !isNarrationPlaying ? (
                <TouchableOpacity
                    onPress={onTapToStart}
                    style={styles.tapToStartButton}
                    disabled={isRateLimited}
                    accessible={true}
                    accessibilityLabel="Tap to start narration"
                    accessibilityRole="button"
                >
                    <View style={styles.tapToStartContent}>
                        <Ionicons name="volume-high" size={20} color={Colors.white} />
                        <Text style={styles.tapToStartText}>Tap to start narration</Text>
                    </View>
                </TouchableOpacity>
            ) : (
                <TouchableOpacity
                    onPress={isNarrationPlaying ? onPause : onPlay}
                    style={styles.playPauseButton}
                    disabled={isLoadingAudio || isRateLimited}
                    accessible={true}
                    accessibilityLabel={isNarrationPlaying ? "Pause narration" : "Play narration"}
                    accessibilityRole="button"
                >
                    <Ionicons
                        name={isNarrationPlaying ? 'pause' : 'play'}
                        size={28}
                        color={Colors.white}
                    />
                </TouchableOpacity>
            )}
        </View>
    );
}
