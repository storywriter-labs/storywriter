import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import client from '@/src/api/client';
import BookReader from '@/components/BookReader/BookReader';
import { parseStoryBody } from '@/src/utils/parseStoryBody';
import { StorySection } from '@/types/story';

export default function StoryDetailScreen() {
    const { slug } = useLocalSearchParams<{ slug: string }>();
    const router = useRouter();
    // Local to this screen — a saved/bookshelf story never touches the shared
    // storyStore slice used by the in-progress creation flow, so opening one
    // can't clobber a story the user is still creating (card #47).
    const [sections, setSections] = useState<StorySection[]>([]);
    const [storyId, setStoryId] = useState<number | null>(null);
    const [storyName, setStoryName] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchStory = async () => {
            try {
                const { data } = await client.get(`/stories/${slug}`);
                const story = data.data;

                if (story.pages && story.pages.length > 0) {
                    // New structured format: map API pages to StorySection
                    const mappedSections: StorySection[] = story.pages.map((p: { content: string; imageUrl?: string | null; illustrationPrompt?: string | null }) => ({
                        text: p.content,
                        imageUrl: p.imageUrl ?? null,
                        illustrationPrompt: p.illustrationPrompt ?? null,
                    }));
                    setSections(mappedSections);
                } else {
                    // Legacy: parse from body
                    const { sections: parsed } = parseStoryBody(story.body);
                    setSections(parsed);
                }

                setStoryId(story.id ?? null);
                setStoryName(story.title || story.name || null);
            } catch {
                setError('Could not load this story.');
            } finally {
                setLoading(false);
            }
        };

        if (slug) {
            void fetchStory();
        }
    }, [slug]);

    const handleUpdatePageImage = useCallback((pageIndex: number, imageUrl: string) => {
        setSections(prev => {
            if (pageIndex < 0 || pageIndex >= prev.length) return prev;
            const next = [...prev];
            next[pageIndex] = { ...next[pageIndex], imageUrl };
            return next;
        });
    }, []);

    if (loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color="#D35400" />
            </View>
        );
    }

    if (error || sections.length === 0) {
        return (
            <View style={styles.center}>
                <Text style={styles.errorText}>{error || 'No content found.'}</Text>
                <TouchableOpacity style={styles.backButton} onPress={() => router.push('/bookshelf')}>
                    <Text style={styles.backButtonText}>Back to Bookshelf</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={styles.fullScreen}>
            <BookReader
                sections={sections}
                name={storyName ?? undefined}
                storyId={storyId}
                onBack={() => router.push('/bookshelf')}
                onUpdatePageImage={handleUpdatePageImage}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    fullScreen: {
        flex: 1,
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
        backgroundColor: '#FAF9F6',
    },
    errorText: {
        fontSize: 18,
        color: '#666',
        textAlign: 'center',
        marginBottom: 24,
    },
    backButton: {
        backgroundColor: '#D35400',
        paddingVertical: 14,
        paddingHorizontal: 32,
        borderRadius: 12,
    },
    backButtonText: {
        fontSize: 18,
        fontWeight: '600',
        color: '#fff',
    },
});
