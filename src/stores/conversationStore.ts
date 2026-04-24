import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StoryPage } from '@/types/story';
import ElevenLabsService from '@/services/elevenLabsService';
import StoryGenerationService from '@/services/storyGenerationService';
import { AudioGenerationResult } from '@/types/elevenlabs';
import { ErrorHandler, ErrorType, ErrorSeverity, AppError } from '@/src/utils/errorHandler';
import { logger, audioLogger, LogCategory } from '@/src/utils/logger';

// ---------------------------------------------------------------------------
// USAGE: Always use per-field selectors, NOT wholesale destructuring
// ---------------------------------------------------------------------------
// GOOD:
//   const phase = useConversationStore(s => s.phase);
//   const story = useConversationStore(s => s.story);
//
// BAD (causes unnecessary re-renders):
//   const { phase, story, ... } = useConversationStore();
//
// For components needing many fields, consider using zustand/shallow:
//   import { shallow } from 'zustand/react';
//   const fields = useConversationStore(
//     state => ({ phase: state.phase, story: state.story }),
//     shallow
//   );

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------

export type ConversationPhase =
  | 'IDLE'        // No active conversation
  | 'ACTIVE'      // ElevenLabs conversation in progress
  | 'GENERATING'  // Generating story from transcript
  | 'COMPLETE';   // Story ready to display

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

export interface ConversationState {
  // --- Conversation ---
  phase: ConversationPhase;
  finalTranscript: string;

  // --- Speech UI feedback ---
  isListening: boolean;
  isSpeaking: boolean;
  speechRate: number;
  speechVolume: number;

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

  // --- Errors ---
  errors: Record<string, AppError>;

  // --- Narration ---
  isNarrationEnabled: boolean;
  isNarrationPlaying: boolean;
  isLoadingAudio: boolean;
  autoAdvancePages: boolean;
  isRateLimited: boolean;
  rateLimitResetTime: number | null;

  // --- Actions: Conversation ---
  startConversation: () => void;
  endConversation: (transcript: string) => void;
  setPhase: (phase: ConversationPhase) => void;
  setSpeechState: (state: Partial<Pick<ConversationState, 'isListening' | 'isSpeaking' | 'speechRate' | 'speechVolume'>>) => void;
  resetConversation: () => void;

  // --- Actions: Story generation ---
  generateStoryAutomatically: () => Promise<void>;
  retryStoryGeneration: () => Promise<void>;

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

  // --- Actions: Errors ---
  addError: (key: string, error: AppError) => void;
  removeError: (key: string) => void;
  clearErrors: () => void;
  hasError: (key?: string) => boolean;
  getError: (key: string) => AppError | undefined;

  // --- Actions: Narration ---
  setNarrationEnabled: (enabled: boolean) => void;
  setNarrationPlaying: (playing: boolean) => void;
  setLoadingAudio: (loading: boolean) => void;
  setAutoAdvancePages: (auto: boolean) => void;
  setRateLimited: (limited: boolean, resetTime?: number) => void;
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

const useConversationStore = create<ConversationState>()(
  devtools(
    (set, get) => ({

      // --- Initial state ---
      phase: 'IDLE',
      finalTranscript: '',
      isListening: false,
      isSpeaking: false,
      speechRate: 1.0,
      speechVolume: 1.0,
      isGenerating: false,
      isGeneratingAudio: false,
      story: EMPTY_STORY,
      storyGenerationProgress: null,
      minDisplayStartTime: null,
      currentPageIndex: 0,
      storyPages: [],
      storyElements: {},
      savedStories: [],
      errors: {},

      // Narration state
      isNarrationEnabled: true,
      isNarrationPlaying: false,
      isLoadingAudio: false,
      autoAdvancePages: false,
      isRateLimited: false,
      rateLimitResetTime: null,

      // -----------------------------------------------------------------------
      // CONVERSATION ACTIONS
      // -----------------------------------------------------------------------

      startConversation: () => {
        logger.info(LogCategory.CONVERSATION, 'Starting conversation', {});
        set({
          phase: 'ACTIVE',
          finalTranscript: '',
          errors: {},
          isListening: false,
          isSpeaking: false,
        });
      },

      endConversation: (transcript: string) => {
        logger.info(LogCategory.CONVERSATION, 'Conversation ended', {
          transcriptLength: transcript.length,
          transcriptPreview: transcript.substring(0, 100),
        });

        set({
          phase: 'GENERATING',
          finalTranscript: transcript,
          isListening: false,
          isSpeaking: false,
          minDisplayStartTime: Date.now(),
        });

        get().removeError('story_generation');

        setTimeout(() => {
          void get().generateStoryAutomatically();
        }, 500);
      },

      setPhase: (phase) => set({ phase }),

      setSpeechState: (speechState) => set((state) => ({ ...state, ...speechState })),

      resetConversation: () => {
        set({
          phase: 'IDLE',
          finalTranscript: '',
          errors: {},
          isListening: false,
          isSpeaking: false,
          isGenerating: false,
          isGeneratingAudio: false,
          story: EMPTY_STORY,
          storyGenerationProgress: null,
          minDisplayStartTime: null,
          isNarrationEnabled: true,
          isNarrationPlaying: false,
          isLoadingAudio: false,
          autoAdvancePages: false,
          isRateLimited: false,
          rateLimitResetTime: null,
        });
      },

      // -----------------------------------------------------------------------
      // STORY GENERATION
      // -----------------------------------------------------------------------

      generateStoryAutomatically: async () => {
        const { finalTranscript, minDisplayStartTime } = get();

        if (!finalTranscript?.trim()) {
          get().addError('story_generation', ErrorHandler.createError(
            ErrorType.VALIDATION,
            ErrorSeverity.MEDIUM,
            'No conversation transcript available',
            'We need a conversation to create your story.',
            undefined,
            { action: 'automatic_story_generation' }
          ));
          set({ phase: 'IDLE', minDisplayStartTime: null });
          return;
        }

        set({ isGenerating: true, storyGenerationProgress: 'Creating your story...' });
        get().removeError('story_generation');

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
              phase: 'COMPLETE',
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
          get().addError('story_generation', ErrorHandler.fromUnknown(
            error,
            ErrorType.STORY_GENERATION,
            ErrorSeverity.MEDIUM
          ));
          set({ storyGenerationProgress: null, isGenerating: false, minDisplayStartTime: null });
        }
      },

      retryStoryGeneration: async () => {
        get().removeError('story_generation');
        await get().generateStoryAutomatically();
      },

      // -----------------------------------------------------------------------
      // AUDIO ACTIONS
      // -----------------------------------------------------------------------

      generateStoryPromptAudio: async (prompt) => {
        set({ isGeneratingAudio: true });
        get().removeError('audio_generation');
        try {
          const result = await ElevenLabsService.generateStoryPromptSpeech(prompt);
          audioLogger.complete('story prompt', { promptLength: prompt.length });
          return result;
        } catch (error) {
          get().addError('audio_generation', ErrorHandler.fromUnknown(
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
        get().removeError('audio_generation');
        try {
          const result = await ElevenLabsService.generateSpeech(storyText);
          audioLogger.complete('story', { storyLength: storyText.length });
          return result;
        } catch (error) {
          get().addError('audio_generation', ErrorHandler.fromUnknown(
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

      setStoryPages: (pages) => set({ storyPages: pages, currentPageIndex: 0, phase: 'COMPLETE' }),

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
        const { storyPages, storyElements, savedStories } = get();
        if (!storyPages.length) throw new Error('No story to save');

        const newStory: SavedStory = {
          id: Date.now().toString(),
          title: title || `Story — ${new Date().toLocaleDateString()}`,
          content: storyPages,
          elements: storyElements,
          createdAt: Date.now(),
        };

        const updated = [...savedStories, newStory];
        try {
          await AsyncStorage.setItem('savedStories', JSON.stringify(updated));
          set({ savedStories: updated });
        } catch (error) {
          const appError = ErrorHandler.fromUnknown(error, ErrorType.STORAGE, ErrorSeverity.MEDIUM, { action: 'save_story' });
          get().addError('storage_save', appError);
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
          get().addError('story_load', appError);
          throw appError;
        }
        set({ storyPages: story.content, storyElements: story.elements, currentPageIndex: 0, phase: 'COMPLETE' });
      },

      loadSavedStories: async () => {
        try {
          const stored = await AsyncStorage.getItem('savedStories');
          if (stored) set({ savedStories: JSON.parse(stored) });
        } catch (error) {
          const appError = ErrorHandler.fromUnknown(error, ErrorType.STORAGE, ErrorSeverity.LOW, { action: 'load_saved_stories' });
          get().addError('storage_load', appError);
          throw appError;
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
      // ERROR ACTIONS
      // -----------------------------------------------------------------------

      addError: (key, error) => {
        set((state) => ({ errors: { ...state.errors, [key]: error } }));
        ErrorHandler.handleError(error);
      },

      removeError: (key) => {
        set((state) => {
          const updated = { ...state.errors };
          delete updated[key];
          return { errors: updated };
        });
      },

      clearErrors: () => set({ errors: {} }),

      hasError: (key?) => {
        const { errors } = get();
        return key ? key in errors : Object.keys(errors).length > 0;
      },

      getError: (key) => get().errors[key],

      // -----------------------------------------------------------------------
      // NARRATION ACTIONS
      // -----------------------------------------------------------------------

      setNarrationEnabled: (enabled) => set({ isNarrationEnabled: enabled }),

      setNarrationPlaying: (playing) => set({ isNarrationPlaying: playing }),

      setLoadingAudio: (loading) => set({ isLoadingAudio: loading }),

      setAutoAdvancePages: (auto) => set({ autoAdvancePages: auto }),

      setRateLimited: (limited, resetTime?) => {
        set({
          isRateLimited: limited,
          rateLimitResetTime: resetTime ?? null,
          isNarrationEnabled: limited ? false : get().isNarrationEnabled,
        });
      },
    })
  )
);

export { useConversationStore };
