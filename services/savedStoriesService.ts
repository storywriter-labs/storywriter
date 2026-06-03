import client from '../src/api/client';
import { StoryPage } from '@/types/story';
import { logger, LogCategory } from '../src/utils/logger';

export interface BackendStory {
  id: number;
  name: string;
  slug: string;
  body: string;
  prompt: string | null;
  user_id: number;
  created_at: string;
  updated_at: string;
}

export interface BackendStoryResponse {
  data: BackendStory;
}

export interface BackendStoriesListResponse {
  data: BackendStory[];
}

class SavedStoriesService {
  private async getAuthenticatedClient() {
    return client;
  }

  async getSavedStories(): Promise<BackendStory[]> {
    try {
      logger.debug(LogCategory.STORY_GENERATION, 'Fetching saved stories from backend');
      const response = await client.get<BackendStoriesListResponse>('/stories/saved');

      return response.data.data || [];
    } catch (error: any) {
      logger.error(LogCategory.STORY_GENERATION, 'Failed to fetch saved stories', { error: error.message });
      throw error;
    }
  }

  async saveStory(storyId: number, elevenLabsConversationId?: string | null): Promise<BackendStory> {
    try {
      logger.debug(LogCategory.STORY_GENERATION, `Saving story ${storyId} to backend`);
      const body = elevenLabsConversationId
        ? { elevenlabs_conversation_id: elevenLabsConversationId }
        : {};
      const response = await client.post<BackendStoryResponse>(`/stories/${storyId}/save`, body);

      return response.data.data;
    } catch (error: any) {
      logger.error(LogCategory.STORY_GENERATION, `Failed to save story ${storyId}`, { error: error.message });
      throw error;
    }
  }

  async unsaveStory(storyId: number): Promise<void> {
    try {
      logger.debug(LogCategory.STORY_GENERATION, `Unsaving story ${storyId} from backend`);
      await client.delete(`/stories/${storyId}/unsave`);
    } catch (error: any) {
      logger.error(LogCategory.STORY_GENERATION, `Failed to unsave story ${storyId}`, { error: error.message });
      throw error;
    }
  }
}

export default new SavedStoriesService();
