import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StoryPage } from '@/types/story';
import ElevenLabsService from '@/services/elevenLabsService';
import StoryGenerationService from '@/services/storyGenerationService';
import SavedStoriesService from '@/services/savedStoriesService';
import { AudioGenerationResult } from '@/types/elevenlabs';
import { ErrorHandler, ErrorType, ErrorSeverity } from '@/src/utils/errorHandler';
import { logger, audioLogger, LogCategory } from '@/src/utils/logger';
import { useErrorStore } from '@/src/stores/errorStore';

// ---------------------------------------------------------------------------
// USAGE: Always use per-field selectors, NOT wholesale destructuring
// ---------------------------------------------------------------------------
// GOOD:
//   const story = useStoryStore(s => s.story);
//   const isGenerating = useStoryStore(s => s.isGenerating);
//
// BAD (causes unnecessary re-renders):
//   const { story, isGenerating, ... } = useStoryStore();
//
// For components needing many fields, consider using zustand/shallow:
//   import { shallow } from 'zustand/react';
//   const fields = useStoryStore(
//     state => ({ story: state.story, isGenerating: state.isGenerating }),
//     shallow
//   );

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------

export interface StoryElements {
  [key: string]: string;
}

export interface StorySection {
  text: string;
  imageUrl: string | null;
  illustrationPrompt?: string | null;
}

export interface StoryContent {
  content: string | null;
  sections: StorySection[];
  storyId: number | null;
  name: string | null;
}

export interface SavedStory {
  id: string;
  title: string;
  content: StoryPage[];
  elements: StoryElements;
  createdAt: number;
}

export interface StoryState {
  // --- Story generation ---
  isGenerating: boolean;
  isGeneratingAudio: boolean;
  story: StoryContent;
  storyGenerationProgress: string | null;
  minDisplayStartTime: number | null;

  // --- Legacy story pages (used by saved stories) ---
  currentPageIndex: number;
  storyPages: StoryPage[];
  storyElements: StoryElements;
  savedStories: SavedStory[];

  // --- Actions: Story generation ---
  generateStoryAutomatically: (finalTranscript: string) => Promise<void>;
  retryStoryGeneration: (finalTranscript: string) => Promise<void>;

  // --- Actions: Audio ---
  generateStoryPromptAudio: (prompt: string) => Promise<AudioGenerationResult | null>;
  generateStoryAudio: (storyText: string) => Promise<AudioGenerationResult | null>;

  // --- Actions: Saved stories ---
  setStoryPages: (pages: StoryPage[]) => void;
  setCurrentPage: (index: number) => void;
  nextPage: () => void;
  previousPage: () => void;
  updateStoryElements: (elements: StoryElements) => void;
  saveStory: (title?: string) => Promise<void>;
  loadStory: (id: string) => Promise<void>;
  loadSavedStories: () => Promise<void>;

  // --- Actions: Page image ---
  updatePageImage: (pageIndex: number, imageUrl: string) => void;

  // --- Actions: Reset ---
  resetStory: () => void;
}

// ---------------------------------------------------------------------------
// INITIAL STATE
// ---------------------------------------------------------------------------

const EMPTY_STORY: StoryContent = {
  content: null,
  sections: [],
  storyId: null,
  name: null,
};

// ---------------------------------------------------------------------------
// STORE
// ---------------------------------------------------------------------------

const useStoryStore = create<StoryState>()(
  devtools(
    (set, get) => ({

      // --- Initial state ---
      isGenerating: false,
      isGeneratingAudio: false,
      story: EMPTY_STORY,
      storyGenerationProgress: null,
      minDisplayStartTime: null,
      currentPageIndex: 0,
      storyPages: [],
      storyElements: {},
      savedStories: [],

      // -----------------------------------------------------------------------
      // STORY GENERATION
      // -----------------------------------------------------------------------

      generateStoryAutomatically: async (finalTranscript: string) => {
        const { minDisplayStartTime } = get();

        if (!finalTranscript?.trim()) {
          useErrorStore.getState().addError('story_generation', ErrorHandler.createError(
            ErrorType.VALIDATION,
            ErrorSeverity.MEDIUM,
            'No conversation transcript available',
            'We need a conversation to create your story.',
            undefined,
            { action: 'automatic_story_generation' }
          ));
          return;
        }

        set({ isGenerating: true, storyGenerationProgress: 'Creating your story...' });
        useErrorStore.getState().removeError('story_generation');

        try {
          logger.info(LogCategory.CONVERSATION, 'Starting story generation', {
            transcriptLength: finalTranscript.length,
          });

          const result = await StoryGenerationService.generateStory(finalTranscript);

          if (!result.success || !result.story) {
            throw ErrorHandler.createError(
              ErrorType.STORY_GENERATION,
              ErrorSeverity.MEDIUM,
              result.error || 'Story generation failed',
              "Something went wrong. Let's try again!"
            );
          }

          if (!result.story.pages?.length) {
            throw ErrorHandler.createError(
              ErrorType.STORY_GENERATION,
              ErrorSeverity.MEDIUM,
              'Generated story has no pages',
              'The story generator returned empty content.'
            );
          }

          logger.debug(LogCategory.STORY_GENERATION, 'Store received story', { story: result.story });

          // Map API pages to StorySection format
          const sections = result.story.pages.map(page => ({
            text: page.content,
            imageUrl: page.imageUrl ?? null,
            illustrationPrompt: page.illustrationPrompt ?? null,
          }));

          const completeStoryGeneration = () => {
            set({
              story: {
                content: result.story.pages.map(p => p.content).join('\n\n'),
                sections,
                storyId: result.story.storyId ?? null,
                name: result.story.title ?? null,
              },
              storyGenerationProgress: null,
              isGenerating: false,
              minDisplayStartTime: null,
            });
          };

          // Enforce a minimum display time for the loading screen (better UX)
          const elapsed = minDisplayStartTime ? Date.now() - minDisplayStartTime : 0;
          const remaining = Math.max(0, 3000 - elapsed);

          if (remaining > 0) {
            setTimeout(completeStoryGeneration, remaining);
          } else {
            completeStoryGeneration();
          }

        } catch (error) {
          useErrorStore.getState().addError('story_generation', ErrorHandler.fromUnknown(
            error,
            ErrorType.STORY_GENERATION,
            ErrorSeverity.MEDIUM
          ));
          set({ storyGenerationProgress: null, isGenerating: false, minDisplayStartTime: null });
        }
      },

      retryStoryGeneration: async (finalTranscript: string) => {
        useErrorStore.getState().removeError('story_generation');
        await get().generateStoryAutomatically(finalTranscript);
      },

      // -----------------------------------------------------------------------
      // AUDIO ACTIONS
      // -----------------------------------------------------------------------

      generateStoryPromptAudio: async (prompt) => {
        set({ isGeneratingAudio: true });
        useErrorStore.getState().removeError('audio_generation');
        try {
          const result = await ElevenLabsService.generateStoryPromptSpeech(prompt);
          audioLogger.complete('story prompt', { promptLength: prompt.length });
          return result;
        } catch (error) {
          useErrorStore.getState().addError('audio_generation', ErrorHandler.fromUnknown(
            error, ErrorType.AUDIO, ErrorSeverity.LOW,
            { action: 'generate_story_prompt_audio' }
          ));
          return null;
        } finally {
          set({ isGeneratingAudio: false });
        }
      },

      generateStoryAudio: async (storyText) => {
        set({ isGeneratingAudio: true });
        useErrorStore.getState().removeError('audio_generation');
        try {
          const result = await ElevenLabsService.generateSpeech(storyText);
          audioLogger.complete('story', { storyLength: storyText.length });
          return result;
        } catch (error) {
          useErrorStore.getState().addError('audio_generation', ErrorHandler.fromUnknown(
            error, ErrorType.AUDIO, ErrorSeverity.LOW,
            { action: 'generate_story_audio' }
          ));
          return null;
        } finally {
          set({ isGeneratingAudio: false });
        }
      },

      // -----------------------------------------------------------------------
      // SAVED STORIES ACTIONS
      // -----------------------------------------------------------------------

      setStoryPages: (pages) => set({ storyPages: pages, currentPageIndex: 0 }),

      setCurrentPage: (index) => {
        const { storyPages } = get();
        if (index >= 0 && index < storyPages.length) set({ currentPageIndex: index });
      },

      nextPage: () => {
        const { currentPageIndex, storyPages } = get();
        if (currentPageIndex < storyPages.length - 1) set({ currentPageIndex: currentPageIndex + 1 });
      },

      previousPage: () => {
        const { currentPageIndex } = get();
        if (currentPageIndex > 0) set({ currentPageIndex: currentPageIndex - 1 });
      },

      updateStoryElements: (elements) => set({ storyElements: elements }),

      saveStory: async (title?) => {
        const { storyPages, storyElements, savedStories, story } = get();
        if (!storyPages.length) throw new Error('No story to save');

        const newStory: SavedStory = {
          id: story.storyId?.toString() || Date.now().toString(),
          title: title || `Story — ${new Date().toLocaleDateString()}`,
          content: storyPages,
          elements: storyElements,
          createdAt: Date.now(),
        };

        const updated = [...savedStories, newStory];

        try {
          // Save to AsyncStorage as a local cache
          await AsyncStorage.setItem('savedStories', JSON.stringify(updated));
          set({ savedStories: updated });

          // If this story has a backend ID, also save it to the backend
          if (story.storyId) {
            try {
              await SavedStoriesService.saveStory(story.storyId);
              logger.debug(LogCategory.STORY_GENERATION, `Story ${story.storyId} saved to backend`);
            } catch (backendError) {
              const msg = backendError instanceof Error ? backendError.message : String(backendError);
              logger.warn(LogCategory.STORY_GENERATION, `Failed to sync story to backend: ${msg}`);
              // Continue anyway - local storage is sufficient
            }
          }
        } catch (error) {
          const appError = ErrorHandler.fromUnknown(error, ErrorType.STORAGE, ErrorSeverity.MEDIUM, { action: 'save_story' });
          useErrorStore.getState().addError('storage_save', appError);
          throw appError;
        }
      },

      loadStory: async (id) => {
        const story = get().savedStories.find(s => s.id === id);
        if (!story) {
          const appError = ErrorHandler.createError(
            ErrorType.VALIDATION, ErrorSeverity.LOW,
            `Story ${id} not found`, 'The requested story could not be found.',
            undefined, { storyId: id }
          );
          useErrorStore.getState().addError('story_load', appError);
          throw appError;
        }
        set({ storyPages: story.content, storyElements: story.elements, currentPageIndex: 0 });
      },

      loadSavedStories: async () => {
        const localStories: SavedStory[] = [];

        // Load from AsyncStorage first (offline cache)
        try {
          const stored = await AsyncStorage.getItem('savedStories');
          if (stored) {
            localStories.push(...JSON.parse(stored));
          }
        } catch (error) {
          logger.warn(LogCategory.STORY_GENERATION, 'Failed to load local stories from AsyncStorage', { error: (error as Error).message });
        }

        // Try to fetch from backend and merge
        try {
          const backendStories = await SavedStoriesService.getSavedStories();
          logger.debug(LogCategory.STORY_GENERATION, `Loaded ${backendStories.length} stories from backend`);

          // Create SavedStory objects from backend stories (for UI compatibility)
          const backendSavedStories: SavedStory[] = backendStories.map(bs => ({
            id: bs.id.toString(),
            title: bs.name,
            content: [], // Backend stories don't have full content; they're just references
            elements: {},
            createdAt: new Date(bs.created_at).getTime(),
          }));

          // Merge: prefer backend stories, add local-only stories
          const merged: SavedStory[] = [];
          const backendIds = new Set(backendSavedStories.map(s => s.id));

          // Add all backend stories
          merged.push(...backendSavedStories);

          // Add local stories that aren't on the backend (offline-created stories)
          for (const localStory of localStories) {
            if (!backendIds.has(localStory.id)) {
              merged.push(localStory);
            }
          }

          set({ savedStories: merged });
        } catch (backendError) {
          const msg = backendError instanceof Error ? backendError.message : String(backendError);
          logger.warn(LogCategory.STORY_GENERATION, 'Failed to load stories from backend, using local cache only', { error: msg });

          // Fall back to local stories if backend fails
          if (localStories.length > 0) {
            set({ savedStories: localStories });
          }

          // Only throw if we also failed to load local stories
          if (localStories.length === 0) {
            const appError = ErrorHandler.fromUnknown(backendError, ErrorType.STORAGE, ErrorSeverity.LOW, { action: 'load_saved_stories' });
            useErrorStore.getState().addError('storage_load', appError);
            throw appError;
          }
        }
      },

      // -----------------------------------------------------------------------
      // PAGE IMAGE ACTIONS
      // -----------------------------------------------------------------------

      updatePageImage: (pageIndex, imageUrl) => {
        set((state) => {
          const sections = [...state.story.sections];
          if (pageIndex >= 0 && pageIndex < sections.length) {
            sections[pageIndex] = { ...sections[pageIndex], imageUrl };
          }
          return { story: { ...state.story, sections } };
        });
      },

      // -----------------------------------------------------------------------
      // RESET ACTIONS
      // -----------------------------------------------------------------------

      resetStory: () => {
        set({
          isGenerating: false,
          isGeneratingAudio: false,
          story: EMPTY_STORY,
          storyGenerationProgress: null,
          minDisplayStartTime: null,
          currentPageIndex: 0,
          storyPages: [],
          storyElements: {},
        });
      },
    })
  )
);

export { useStoryStore };
