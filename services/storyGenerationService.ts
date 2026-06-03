import client from '../src/api/client';
import { StoryGenerationResult } from '../types/story';
import { logger, LogCategory } from '../src/utils/logger';

class StoryGenerationService {

    // ------------------------------------------------------------
    // 1. API CLIENT
    // ------------------------------------------------------------
    private async postToApi<T>(endpoint: string, body: any): Promise<T> {
        logger.debug(LogCategory.STORY_GENERATION, `POST ${endpoint}`);

        const response = await client.post(endpoint, body);

        logger.debug(LogCategory.STORY_GENERATION, 'API response', { response: response.data });

        // Laravel returns data at top level now (no data wrapper)
        return (response.data.data || response.data) as T;
    }

    // ------------------------------------------------------------
    // 3. GENERATE STORY
    // ------------------------------------------------------------
    async generateStory(transcript: string): Promise<StoryGenerationResult> {
        if (!transcript?.trim()) {
            return this.failResponse('Transcript is empty');
        }

        try {
            const response = await this.postToApi<any>('/stories/generate', {
                transcript: transcript.trim(),
                options: { maxTokens: 2000, temperature: 0.7 },
            });

            const story = {
                title: response.title ?? '<h1>My Story</h1>',
                pages: response.pages ?? [],
                coverImage: response.cover_image ?? null,
                storyId: response.story_id ?? null,
                pageCount: response.page_count ?? 0,
            };

            if (story.pages.length === 0) {
                throw new Error('No pages returned from story generator');
            }

            logger.debug(LogCategory.STORY_GENERATION, `Story pages count: ${story.pages.length}`);
            logger.debug(LogCategory.STORY_GENERATION, 'Story object', { story });

            return { success: true, story };

        } catch (error: any) {
            console.error('Story generation failed:', error.message);
            return this.failResponse(error.message);
        }
    }

    // ------------------------------------------------------------
    // 4. GENERATE PAGE IMAGE (on-demand)
    // ------------------------------------------------------------
    async generatePageImage(storyId: number, pageNumber: number): Promise<string | null> {
        try {
            const response = await this.postToApi<{ imageUrl: string }>(
                `/stories/${storyId}/pages/${pageNumber}/image`,
                {}
            );
            return response.imageUrl ?? null;
        } catch (error: any) {
            console.error(`Page image generation failed (story=${storyId}, page=${pageNumber}):`, error.message);
            return null;
        }
    }

    // ------------------------------------------------------------
    // 5. FAIL RESPONSE
    // ------------------------------------------------------------
    private failResponse(errorMsg: string): StoryGenerationResult {
        return {
            success: false,
            error: errorMsg,
            story: {
                title: null,
                pages: [],
                coverImage: null,
                storyId: null,
                pageCount: 0,
            },
        };
    }
}

export default new StoryGenerationService();