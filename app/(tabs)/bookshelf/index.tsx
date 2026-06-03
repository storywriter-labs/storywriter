import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    Image,
    ImageBackground,
    StyleSheet,
    ActivityIndicator,
    useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import client from '@/src/api/client';
import Layout from '@/components/Layout/Layout';
import { parseStoryBody } from '@/src/utils/parseStoryBody';
import { trackEvent, AnalyticsEvents } from '@/src/utils/analytics';
import { Colors, Spacing, BorderRadius, FontSizes } from '@/constants/theme';

interface ApiStory {
    id: number;
    name: string;
    slug: string;
    body: string;
    prompt: string;
    created_at: string;
}

interface StoryCard {
    story: ApiStory;
    coverImageUrl: string | null;
    preview: string;
}

function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });
}

export default function BookshelfScreen() {
    const router = useRouter();
    const isFocused = useIsFocused();
    const { width } = useWindowDimensions();
    const [cards, setCards] = useState<StoryCard[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Determine number of columns based on screen width
    const getNumColumns = () => {
        if (width >= 1400) return 4;
        if (width >= 1000) return 3;
        if (width >= 700) return 2;
        return 1;
    };
    const numColumns = getNumColumns();

    const fetchStories = useCallback(async () => {
        try {
            setLoading(true);
            const { data } = await client.get('/stories');
            const stories: ApiStory[] = data.data;

            // Sort newest first, then build card data
            const sorted = [...stories].sort(
                (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            );

            const cardData: StoryCard[] = sorted.map((story) => {
                const { sections, coverImageUrl } = parseStoryBody(story.body);
                return {
                    story,
                    coverImageUrl,
                    preview: sections.length > 0 ? sections[0].text : '',
                };
            });

            setCards(cardData);
            setError(null);
            trackEvent(AnalyticsEvents.BOOKSHELF_VIEWED, { story_count: cardData.length });
        } catch {
            setError('Could not load your stories.');
        } finally {
            setLoading(false);
        }
    }, []);

    // Refetch whenever the tab comes into focus so newly generated stories appear
    useEffect(() => {
        if (isFocused) {
            void fetchStories();
        }
    }, [isFocused, fetchStories]);

    // --- LOADING ---
    if (loading) {
        return (
            <Layout>
                <View style={styles.center}>
                    <ActivityIndicator size="large" color="#D35400" />
                </View>
            </Layout>
        );
    }

    // --- ERROR ---
    if (error) {
        return (
            <Layout>
                <View style={styles.center}>
                    <Text style={styles.errorText}>{error}</Text>
                    <TouchableOpacity style={styles.retryButton} onPress={fetchStories}>
                        <Text style={styles.retryButtonText}>Try Again</Text>
                    </TouchableOpacity>
                </View>
            </Layout>
        );
    }

    // --- EMPTY ---
    if (cards.length === 0) {
        return (
            <Layout>
                <View style={styles.center}>
                    <View style={styles.emptyCard}>
                        <Ionicons name="book-outline" size={FontSizes.massive} color={Colors.coral} style={styles.emptyIcon} />
                        <Text style={styles.emptyTitle}>No Stories Yet</Text>
                        <Text style={styles.emptyText}>
                            Head back to Home and create your first story!
                        </Text>
                    </View>
                </View>
            </Layout>
        );
    }

    // --- LIST ---
    return (
        <Layout>
            <ImageBackground
                source={require('@/assets/images/bookshelf-background.png')}
                style={styles.backgroundImage}
                resizeMode="cover"
            >
                <ScrollView
                    style={styles.scrollView}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                >
                    <View style={styles.headerContainer}>
                        <Text style={styles.header} accessibilityLabel="My Bookshelf">
                            {/* Hidden for visual but kept for SEO */}
                        </Text>
                    </View>

                    <View style={styles.cardsContainer}>
                        {cards.map(({ story, coverImageUrl, preview }) => {
                            const cardWidth: '100%' | `${number}%` = numColumns === 1
                                ? '100%'
                                : `${100 / numColumns - 2}%` as `${number}%`;
                            return (
                            <TouchableOpacity
                                key={story.id}
                                style={[
                                    styles.card,
                                    { width: cardWidth },
                                ]}
                                onPress={() => {
                                    trackEvent(AnalyticsEvents.BOOKSHELF_STORY_TAPPED, { story_id: story.id });
                                    router.push(`/bookshelf/${story.slug}`);
                                }}
                                activeOpacity={0.85}
                            >
                        {/* Cover image or placeholder */}
                        <View style={styles.cardImageContainer}>
                            {coverImageUrl ? (
                                <Image
                                    source={{ uri: coverImageUrl }}
                                    style={styles.cardImage}
                                    resizeMode="cover"
                                />
                            ) : (
                                <View style={styles.cardPlaceholder}>
                                    <Ionicons name="library-outline" size={48} color={Colors.darkGray} />
                                </View>
                            )}
                        </View>

                        {/* Title, date, preview */}
                        <View style={styles.cardContent}>
                            <Text style={styles.cardTitle} numberOfLines={2}>
                                {story.name}
                            </Text>
                            <Text style={styles.cardDate}>{formatDate(story.created_at)}</Text>
                            <Text style={styles.cardPreview} numberOfLines={2}>
                                {preview}
                            </Text>
                        </View>
                            </TouchableOpacity>
                            );
                        })}
                    </View>
                </ScrollView>
            </ImageBackground>
        </Layout>
    );
}

const styles = StyleSheet.create({
    // --- layout ---
    backgroundImage: {
        flex: 1,
        width: '100%',
        height: '100%',
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: 24,
        paddingBottom: 40,
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },

    // --- header ---
    headerContainer: {
        alignItems: 'center',
        marginBottom: 28,
    },
    header: {
        fontSize: FontSizes.massive,
        fontWeight: 'bold',
        color: Colors.coral,
        textAlign: 'center',
        textShadowColor: 'rgba(255, 107, 107, 0.3)',
        textShadowOffset: { width: 2, height: 2 },
        textShadowRadius: 6,
        opacity: 0,
        position: 'absolute',
        height: 0,
    },

    // --- cards container ---
    cardsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        gap: Spacing.md,
    },

    // --- story card ---
    card: {
        flexDirection: 'column',
        backgroundColor: Colors.background,
        borderRadius: BorderRadius.lg,
        borderWidth: 2,
        borderColor: Colors.yellow,
        padding: Spacing.md,
        shadowColor: Colors.black,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 8,
        elevation: 5,
    },
    cardImageContainer: {
        width: '100%',
        marginBottom: Spacing.sm,
    },
    cardImage: {
        width: '100%',
        height: 200,
        borderRadius: 10,
        backgroundColor: Colors.lightestGray,
    },
    cardPlaceholder: {
        width: '100%',
        height: 200,
        borderRadius: 10,
        backgroundColor: '#F0F0E8',
        borderWidth: 1,
        borderColor: '#E0E0D8',
        justifyContent: 'center',
        alignItems: 'center',
    },
    cardContent: {
        flex: 1,
    },
    cardTitle: {
        fontSize: FontSizes.xxl,
        fontWeight: 'bold',
        color: Colors.darkestGray,
        marginBottom: Spacing.xs,
    },
    cardDate: {
        fontSize: FontSizes.sm,
        color: '#687076',
        marginBottom: Spacing.sm,
    },
    cardPreview: {
        fontSize: FontSizes.md,
        color: Colors.darkGray,
        lineHeight: 22,
    },

    // --- empty state ---
    emptyCard: {
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
    emptyIcon: {
        marginBottom: Spacing.md,
    },
    emptyTitle: {
        fontSize: FontSizes.huge,
        fontWeight: 'bold',
        color: Colors.darkestGray,
        marginBottom: Spacing.sm,
    },
    emptyText: {
        fontSize: FontSizes.lg,
        color: Colors.darkGray,
        textAlign: 'center',
        maxWidth: 400,
    },

    // --- error state ---
    errorText: {
        fontSize: FontSizes.lg,
        color: Colors.darkGray,
        textAlign: 'center',
        marginBottom: Spacing.lg,
    },
    retryButton: {
        backgroundColor: Colors.accent,
        paddingVertical: 14,
        paddingHorizontal: 32,
        borderRadius: BorderRadius.sm,
    },
    retryButtonText: {
        fontSize: FontSizes.lg,
        fontWeight: '600',
        color: Colors.white,
    },
});
