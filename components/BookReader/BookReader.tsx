import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
    View,
    Text,
    Image,
    TouchableOpacity,
    Platform,
    ScrollView,
    PanResponder,
    Animated
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { styles } from './BookReader.style';
import { useConversationStore } from '@/src/stores/conversationStore';
import { useStoryStore } from '@/src/stores/storyStore';
import { useNarrationStore } from '@/src/stores/narrationStore';
import { StorySection } from '@/types/story';
import { createNarrationPlayer } from '@/services/narration';
import type { NarrationPlayer } from '@/services/narration';
import audioCache from '@/services/narration/audioCache';
import elevenLabsService from '@/services/elevenLabsService';
import { NarrationControls } from '@/components/NarrationControls/NarrationControls';
import { logger, LogCategory } from '@/src/utils/logger';
import { trackEvent, AnalyticsEvents } from '@/src/utils/analytics';
import storyGenerationService from '@/services/storyGenerationService';

interface BookReaderProps {
    sections?: StorySection[];
    name?: string;
    onBack?: () => void;
}

const ShimmerPlaceholder = () => {
    const shimmerAnim = useRef(new Animated.Value(0.3)).current;

    useEffect(() => {
        const pulse = Animated.loop(
            Animated.sequence([
                Animated.timing(shimmerAnim, {
                    toValue: 0.7,
                    duration: 1000,
                    useNativeDriver: true,
                }),
                Animated.timing(shimmerAnim, {
                    toValue: 0.3,
                    duration: 1000,
                    useNativeDriver: true,
                }),
            ])
        );
        pulse.start();
        return () => pulse.stop();
    }, [shimmerAnim]);

    return (
        <Animated.View
            style={[
                styles.illustration,
                styles.shimmerPlaceholder,
                { opacity: shimmerAnim },
            ]}
        />
    );
};

const BookReader = ({ sections: sectionsProp, name, onBack }: BookReaderProps = {}) => {
    const story = useStoryStore(s => s.story);
    const updatePageImage = useStoryStore(s => s.updatePageImage);
    const resetConversation = useConversationStore(s => s.resetConversation);
    const resetStory = useStoryStore(s => s.resetStory);
    const resetNarration = useNarrationStore(s => s.resetNarration);
    const isNarrationEnabled = useNarrationStore(s => s.isNarrationEnabled);
    const isNarrationPlaying = useNarrationStore(s => s.isNarrationPlaying);
    const isLoadingAudio = useNarrationStore(s => s.isLoadingAudio);
    const autoAdvancePages = useNarrationStore(s => s.autoAdvancePages);
    const isRateLimited = useNarrationStore(s => s.isRateLimited);
    const setNarrationPlaying = useNarrationStore(s => s.setNarrationPlaying);
    const setLoadingAudio = useNarrationStore(s => s.setLoadingAudio);
    const setRateLimited = useNarrationStore(s => s.setRateLimited);

    const pages = useMemo(() =>
        (sectionsProp && sectionsProp.length > 0)
            ? sectionsProp
            : (story.sections && story.sections.length > 0
                ? story.sections
                : [{ text: "Loading story...", imageUrl: null }]),
        [sectionsProp, story.sections]
    );

    const [currentIndex, setCurrentIndex] = useState(0);
    const [audioError, setAudioError] = useState<string | null>(null);
    const [canRetry, setCanRetry] = useState(false);
    const [isLoadingImage, setIsLoadingImage] = useState(false);

    const isEndPage = currentIndex === pages.length;
    const playerRef = useRef<NarrationPlayer | null>(null);
    const storyIdRef = useRef<string>(`story-${Date.now()}`);
    const readingStartTimeRef = useRef<number>(Date.now());
    const hasTrackedOpenRef = useRef(false);
    const hasTrackedCompleteRef = useRef(false);

    // --- PLAYBACK HANDLERS ---
    const handlePlaybackComplete = useCallback(() => {
        setNarrationPlaying(false);

        // Auto-advance to next page if enabled
        if (autoAdvancePages && currentIndex < pages.length - 1) {
            setTimeout(() => {
                setCurrentIndex(prev => prev + 1);
            }, 1500);
        }
    }, [autoAdvancePages, currentIndex, pages.length, setNarrationPlaying]);

    // --- AUDIO GENERATION ---
    const generateAndLoadAudio = useCallback(async (pageIndex: number, pageText: string) => {
        if (!isNarrationEnabled || !pageText || pageText === "Loading story..." || isRateLimited) {
            return;
        }

        const cacheKey = `${storyIdRef.current}-${pageIndex}`;

        try {
            setLoadingAudio(true);
            setAudioError(null);
            setCanRetry(false);

            // Check cache first
            const cachedAudio = audioCache.get(cacheKey);
            if (cachedAudio) {
                // Load from cache
                if (!playerRef.current) {
                    playerRef.current = createNarrationPlayer({
                        onPlaybackComplete: handlePlaybackComplete
                    });
                }
                await playerRef.current.load(cachedAudio);
                setLoadingAudio(false);
                return;
            }

            // Generate new audio
            const result = await elevenLabsService.generateSpeech(
                pageText,
                undefined, // Use default voice
                {
                    model_id: "eleven_flash_v2_5"
                }
            );

            // Validate audio format
            if (!(result.audio instanceof Uint8Array)) {
                throw new Error('INVALID_AUDIO_FORMAT');
            }

            // Validate audio data (check if it's not empty and has reasonable size)
            if (result.audio.length === 0) {
                throw new Error('INVALID_AUDIO_EMPTY');
            }

            // Check for minimum valid MP3 size (at least a few hundred bytes)
            if (result.audio.length < 100) {
                throw new Error('INVALID_AUDIO_TOO_SMALL');
            }

            // Store in cache
            audioCache.set(cacheKey, result.audio);

            // Load into player
            if (!playerRef.current) {
                playerRef.current = createNarrationPlayer({
                    onPlaybackComplete: handlePlaybackComplete
                });
            }
            await playerRef.current.load(result.audio);
            setLoadingAudio(false);
        } catch (error) {
            console.error('Error generating audio:', error);
            trackEvent(AnalyticsEvents.NARRATION_FAILED, {
                error_type: error instanceof Error ? error.message : 'unknown',
                page_index: pageIndex,
            });

            // Type guard for error with status and name
            const errorWithStatus = error as {
                status?: number;
                message?: string;
                name?: string;
            };

            // Check for audio validation errors
            const isInvalidAudioError = errorWithStatus.message === 'INVALID_AUDIO_FORMAT'
                || errorWithStatus.message === 'INVALID_AUDIO_EMPTY'
                || errorWithStatus.message === 'INVALID_AUDIO_TOO_SMALL'
                || errorWithStatus.message?.toLowerCase().includes('failed to load audio')
                || errorWithStatus.message?.toLowerCase().includes('invalid audio')
                || errorWithStatus.message?.toLowerCase().includes('audio format');

            // Check for timeout/abort errors (DOMException with name 'AbortError')
            const isTimeoutError = errorWithStatus.name === 'AbortError'
                || errorWithStatus.message?.toLowerCase().includes('timeout')
                || errorWithStatus.message?.toLowerCase().includes('aborted');

            // Check for network errors
            const isNetworkError = errorWithStatus.message?.toLowerCase().includes('network')
                || errorWithStatus.message?.toLowerCase().includes('fetch')
                || errorWithStatus.message?.toLowerCase().includes('connection');

            if (errorWithStatus.status === 429) {
                // Set rate limit state - disable narration for 60 seconds
                const resetTime = Date.now() + 60000;
                setRateLimited(true, resetTime);
                setAudioError('Rate limit exceeded. Narration will be automatically re-enabled in 60 seconds.');
                setCanRetry(false);

                // Auto-reset after timeout
                setTimeout(() => {
                    setRateLimited(false);
                    setAudioError(null);
                }, 60000);
            } else if (isInvalidAudioError) {
                setAudioError('Invalid audio data received. This may be a temporary issue.');
                setCanRetry(true);
            } else if (isTimeoutError) {
                setAudioError('Request timed out. Please check your connection and try again.');
                setCanRetry(true);
            } else if (isNetworkError) {
                setAudioError('Network error. Please check your connection and try again.');
                setCanRetry(true);
            } else {
                setAudioError('Failed to generate audio. Please try again.');
                setCanRetry(true);
            }

            setLoadingAudio(false);
        }
    }, [isNarrationEnabled, isRateLimited, setLoadingAudio, setRateLimited, handlePlaybackComplete]);

    const handlePlay = useCallback(async () => {
        if (!playerRef.current || isLoadingAudio) {
            return;
        }

        try {
            await playerRef.current.play();
            setNarrationPlaying(true);
            setAudioError(null);
            trackEvent(AnalyticsEvents.NARRATION_PLAYED, {
                story_id: storyIdRef.current,
                page_index: currentIndex,
            });
        } catch (error) {
            // Log playback failure with context
            logger.error(
                LogCategory.AUDIO,
                'Audio playback failed',
                {
                    storyId: storyIdRef.current,
                    pageIndex: currentIndex,
                    error: error instanceof Error ? {
                        name: error.name,
                        message: error.message,
                        stack: error.stack
                    } : String(error)
                }
            );

            // Reset player state
            setNarrationPlaying(false);
            setAudioError('Playback failed. Please try again.');
            setCanRetry(true);

            // Attempt to cleanup and reset the player
            if (playerRef.current) {
                try {
                    playerRef.current.cleanup();
                } catch (cleanupError) {
                    logger.error(
                        LogCategory.AUDIO,
                        'Failed to cleanup player after playback error',
                        { error: cleanupError }
                    );
                }
                playerRef.current = null;
            }
        }
    }, [isLoadingAudio, setNarrationPlaying, currentIndex]);

    const handlePause = useCallback(async () => {
        if (!playerRef.current) {
            return;
        }

        try {
            await playerRef.current.pause();
            setNarrationPlaying(false);
            trackEvent(AnalyticsEvents.NARRATION_PAUSED, {
                story_id: storyIdRef.current,
                page_index: currentIndex,
            });
        } catch (error) {
            // Log pause failure with context
            logger.error(
                LogCategory.AUDIO,
                'Audio pause failed',
                {
                    storyId: storyIdRef.current,
                    pageIndex: currentIndex,
                    error: error instanceof Error ? {
                        name: error.name,
                        message: error.message,
                        stack: error.stack
                    } : String(error)
                }
            );

            // Reset player state to stopped
            setNarrationPlaying(false);

            // Cleanup the player as it may be in an invalid state
            if (playerRef.current) {
                try {
                    playerRef.current.cleanup();
                } catch (cleanupError) {
                    logger.error(
                        LogCategory.AUDIO,
                        'Failed to cleanup player after pause error',
                        { error: cleanupError }
                    );
                }
                playerRef.current = null;
            }
        }
    }, [setNarrationPlaying, currentIndex]);

    const handleRetry = useCallback(() => {
        trackEvent(AnalyticsEvents.NARRATION_RETRIED, { page_index: currentIndex });
        // Clear error state and retry loading audio for current page
        const currentPage = pages[currentIndex];
        if (currentPage && currentPage.text) {
            // Clear any cached data for this page to force regeneration
            const cacheKey = `${storyIdRef.current}-${currentIndex}`;
            audioCache.delete(cacheKey);

            // Regenerate audio
            void generateAndLoadAudio(currentIndex, currentPage.text);
        }
    }, [currentIndex, pages, generateAndLoadAudio]);

    const goNext = useCallback(() => {
        // Pause audio when navigating
        if (playerRef.current && isNarrationPlaying) {
            void handlePause();
        }

        if (currentIndex < pages.length) {
            setCurrentIndex(prev => prev + 1);
        }
    }, [currentIndex, pages.length, isNarrationPlaying, handlePause]);

    const goPrev = useCallback(() => {
        // Pause audio when navigating
        if (playerRef.current && isNarrationPlaying) {
            void handlePause();
        }

        if (currentIndex > 0) {
            setCurrentIndex(prev => prev - 1);
        }
    }, [currentIndex, isNarrationPlaying, handlePause]);

    const handleRestartStory = () => {
        trackEvent(AnalyticsEvents.STORY_END_ACTION, { action: 'read_again' });
        hasTrackedCompleteRef.current = false;
        setCurrentIndex(0);
    };

    const handleNewStory = () => {
        trackEvent(AnalyticsEvents.STORY_END_ACTION, { action: 'new_story' });
        // Reset all stores to start fresh
        resetConversation();
        resetStory();
        resetNarration();
        // This will trigger the app to go back to the voice assistant/story input
    };

    const handleExit = () => {
        trackEvent(AnalyticsEvents.STORY_END_ACTION, { action: 'exit' });
        // For Expo, you can use expo-app-loading or just reset
        // If you want to truly exit the app (mobile only):
        if (Platform.OS !== 'web') {
            // Option 1: Reset to beginning
            resetConversation();
            resetStory();
            resetNarration();

            // Option 2: Or if you have BackHandler for Android
            // BackHandler.exitApp();
        } else {
            // On web, just reset to beginning
            resetConversation();
            resetStory();
            resetNarration();
        }
    };

    const handleClose = useCallback(() => {
        trackEvent(AnalyticsEvents.STORY_END_ACTION, { action: 'close' });
        if (onBack) {
            onBack();
        } else {
            resetConversation();
            resetStory();
            resetNarration();
        }
    }, [onBack, resetConversation, resetStory, resetNarration]);

    // Generate audio and lazy-load images on page change & track page views
    useEffect(() => {
        let cancelled = false;

        // Skip audio/image loading for the virtual end page
        if (isEndPage) return;

        trackEvent(AnalyticsEvents.STORY_PAGE_VIEWED, {
            page_index: currentIndex,
            total_pages: pages.length,
        });

        // Reset image loading state on page change
        setIsLoadingImage(false);

        const currentPage = pages[currentIndex];
        if (currentPage && currentPage.text) {
            void generateAndLoadAudio(currentIndex, currentPage.text);
        }

        // Lazy image fetching: if page has illustrationPrompt but no imageUrl, generate on demand
        const storyId = story.storyId;
        if (
            currentPage &&
            currentPage.illustrationPrompt &&
            !currentPage.imageUrl &&
            storyId
        ) {
            setIsLoadingImage(true);
            const pageNumber = currentIndex + 1; // API uses 1-based page numbers
            storyGenerationService.generatePageImage(storyId, pageNumber)
                .then((url) => {
                    if (cancelled) return;
                    if (url) {
                        updatePageImage(currentIndex, url);
                    }
                    setIsLoadingImage(false);
                })
                .catch(() => {
                    if (cancelled) return;
                    setIsLoadingImage(false);
                });
        }

        return () => {
            cancelled = true;
        };
    }, [currentIndex, pages, generateAndLoadAudio, story.storyId, updatePageImage, isEndPage]);

    // Track story_opened once on mount
    useEffect(() => {
        if (!hasTrackedOpenRef.current) {
            hasTrackedOpenRef.current = true;
            readingStartTimeRef.current = Date.now();
            trackEvent(AnalyticsEvents.STORY_OPENED, {
                source: onBack ? 'bookshelf' : 'new_generation',
                story_id: storyIdRef.current,
                page_count: pages.length,
            });
        }
    }, [onBack, pages.length]);

    // Cleanup player on unmount
    useEffect(() => {
        return () => {
            if (playerRef.current) {
                playerRef.current.cleanup();
                playerRef.current = null;
            }
            // Clear cache when leaving BookReader
            audioCache.clear();
        };
    }, []);

    // Track story_completed when reaching the end page
    useEffect(() => {
        if (isEndPage && !hasTrackedCompleteRef.current) {
            hasTrackedCompleteRef.current = true;
            trackEvent(AnalyticsEvents.STORY_COMPLETED, {
                reading_duration_seconds: Math.round((Date.now() - readingStartTimeRef.current) / 1000),
                page_count: pages.length,
            });
        }
    }, [isEndPage, pages.length]);

    // --- SWIPE DETECTOR ---
    const panResponder = useRef(
        PanResponder.create({
            onMoveShouldSetPanResponder: (_, gestureState) => {
                return Math.abs(gestureState.dx) > 20;
            },
            onPanResponderRelease: (_, gestureState) => {
                if (gestureState.dx < -50) {
                    goNext();
                } else if (gestureState.dx > 50) {
                    goPrev();
                }
            }
        })
    ).current;

    // --- KEYBOARD SUPPORT ---
    useEffect(() => {
        if (Platform.OS !== 'web') return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'ArrowRight') goNext();
            else if (e.key === 'ArrowLeft') goPrev();
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [goNext, goPrev]);

    const currentPage = pages[currentIndex];

    return (
        <View style={styles.container} {...panResponder.panHandlers}>
            <View style={styles.pageWrapper}>
                {isEndPage ? (
                    <View style={styles.endPageContainer}>
                        <Text style={styles.endTitle}>The End! 🎉</Text>
                        <Text style={styles.endSubtitle}>What would you like to do?</Text>

                        {onBack ? (
                            <>
                                <TouchableOpacity
                                    style={[styles.endButton, styles.primaryButton]}
                                    onPress={handleRestartStory}
                                >
                                    <Text style={styles.primaryButtonText}>🔄 Read Again</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={[styles.endButton, styles.secondaryButton]}
                                    onPress={() => {
                                        trackEvent(AnalyticsEvents.STORY_END_ACTION, { action: 'back_to_bookshelf' });
                                        onBack?.();
                                    }}
                                >
                                    <Text style={styles.secondaryButtonText}>📚 Back to Bookshelf</Text>
                                </TouchableOpacity>
                            </>
                        ) : (
                            <>
                                <TouchableOpacity
                                    style={[styles.endButton, styles.primaryButton]}
                                    onPress={handleNewStory}
                                >
                                    <Text style={styles.primaryButtonText}>✨ Create New Story</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={[styles.endButton, styles.secondaryButton]}
                                    onPress={handleRestartStory}
                                >
                                    <Text style={styles.secondaryButtonText}>🔄 Read Again</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={[styles.endButton, styles.tertiaryButton]}
                                    onPress={handleExit}
                                >
                                    <Text style={styles.tertiaryButtonText}>🏠 Exit</Text>
                                </TouchableOpacity>
                            </>
                        )}
                    </View>
                ) : (
                    <>
                        <Text style={styles.pageNumber}>
                            Page {currentIndex + 1} of {pages.length}
                        </Text>

                        <ScrollView
                            contentContainerStyle={styles.scrollContent}
                            showsVerticalScrollIndicator={false}
                            scrollEnabled={true}
                        >

                            {currentIndex === 0 && (
                                <Text style={styles.storyName}>{name || story.name || ''}</Text>
                            )}

                            {isLoadingImage && !currentPage.imageUrl ? (
                                <ShimmerPlaceholder />
                            ) : currentPage.imageUrl ? (
                                <Image
                                    source={{ uri: currentPage.imageUrl }}
                                    style={styles.illustration}
                                    resizeMode="contain"
                                />
                            ) : null}

                            <Text style={styles.storyText}>

                                {currentPage.text || currentPage.text}
                            </Text>
                        </ScrollView>
                    </>
                )}
            </View>

            {/* PAGE NAVIGATION CONTROLS */}
            {!isEndPage && (
                <View style={styles.navigationRow}>
                    <TouchableOpacity
                        onPress={goPrev}
                        style={[styles.navButton, currentIndex === 0 && styles.disabledBtn]}
                        disabled={currentIndex === 0}
                    >
                        <Text style={styles.navArrow}>‹</Text>
                    </TouchableOpacity>
                    <View style={styles.dotsContainer}>
                        {pages.map((_, i) => (
                            <View
                                key={i}
                                style={[styles.dot, i === currentIndex && styles.dotActive]}
                            />
                        ))}
                    </View>

                    <TouchableOpacity
                        onPress={goNext}
                        style={[styles.navButton, isEndPage && styles.disabledBtn]}
                        disabled={isEndPage}
                    >
                        <Text style={styles.navArrow}>›</Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* NARRATION CONTROLS */}
            {!isEndPage && (
                <View style={styles.narrationControlsContainer}>
                    <NarrationControls
                        onPlay={handlePlay}
                        onPause={handlePause}
                        errorMessage={audioError}
                        onRetry={canRetry ? handleRetry : undefined}
                    />
                </View>
            )}

            {/* BACK TO BOOKSHELF */}
            {onBack && !isEndPage && (
                <TouchableOpacity style={styles.backToBookshelfBtn} onPress={onBack}>
                    <Text style={styles.backToBookshelfBtnText}>‹ Bookshelf</Text>
                </TouchableOpacity>
            )}

            {/* CLOSE BUTTON */}
            <TouchableOpacity
                style={styles.closeButton}
                onPress={handleClose}
                accessibilityLabel="Close story"
                accessibilityRole="button"
            >
                <Ionicons name="close" size={24} color="#666666" />
            </TouchableOpacity>
        </View>
    );
};

export default BookReader;