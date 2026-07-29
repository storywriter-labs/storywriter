import { useStoryStore, BACKEND_SAVE_ERROR_KEY } from '@/src/stores/storyStore';
import { useErrorStore } from '@/src/stores/errorStore';
import SavedStoriesService from '@/services/savedStoriesService';
import { useConversationStore } from '@/src/stores/conversationStore';

// conversationStore is auto-mocked in jest.setup.js; the store only reads the
// conversation id off it, so a stub getState is enough.
(useConversationStore as unknown as { getState: jest.Mock }).getState = jest
  .fn()
  .mockReturnValue({ conversationId: 'conv_test' });

jest.mock('@/services/savedStoriesService', () => ({
  __esModule: true,
  default: { saveStory: jest.fn(), getSavedStories: jest.fn() },
}));

const mockedSaveStory = SavedStoriesService.saveStory as jest.Mock;

/**
 * Tests for saving a story to the backend (card #106).
 *
 * The backend call 404'd on every save for the life of the feature and nobody
 * noticed, because the failure was written to a log line and dropped. The
 * invariant here: a failed backend save still keeps the local copy — it must
 * not throw — but it has to leave a record in the error store.
 */
describe('storyStore – backend save failures are recorded, not swallowed', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useErrorStore.setState({ errors: {} });
    useStoryStore.setState({
      savedStories: [],
      storyPages: [{ text: 'Once upon a time', imageUrl: null }],
      storyElements: {},
      story: { content: null, sections: [], storyId: 42, name: 'A Story' },
    } as never);
  });

  it('keeps the local copy and records the failure when the backend save fails', async () => {
    mockedSaveStory.mockRejectedValue(new Error('Request failed with status code 404'));

    await expect(useStoryStore.getState().saveStory('A Story')).resolves.toBeUndefined();

    // Local save still happened — the child keeps their story.
    expect(useStoryStore.getState().savedStories).toHaveLength(1);

    // ...but the backend failure is no longer invisible.
    const recorded = useErrorStore.getState().getError(BACKEND_SAVE_ERROR_KEY);
    expect(recorded).toBeDefined();
    expect(recorded?.context).toMatchObject({ action: 'save_story_to_backend', storyId: 42 });
  });

  it('records nothing when the backend save succeeds', async () => {
    mockedSaveStory.mockResolvedValue({ id: 42 });

    await useStoryStore.getState().saveStory('A Story');

    expect(mockedSaveStory).toHaveBeenCalledWith(42, expect.anything());
    expect(useErrorStore.getState().hasError(BACKEND_SAVE_ERROR_KEY)).toBe(false);
  });

  it('clears a stale failure once a later save gets through', async () => {
    mockedSaveStory.mockRejectedValueOnce(new Error('offline'));
    await useStoryStore.getState().saveStory('A Story');
    expect(useErrorStore.getState().hasError(BACKEND_SAVE_ERROR_KEY)).toBe(true);

    mockedSaveStory.mockResolvedValueOnce({ id: 42 });
    await useStoryStore.getState().saveStory('A Story');
    expect(useErrorStore.getState().hasError(BACKEND_SAVE_ERROR_KEY)).toBe(false);
  });
});
