import client from '../../src/api/client';

// Mock the axios client
jest.mock('../../src/api/client', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
    get: jest.fn(),
  },
}));

// Mock the logger
jest.mock('../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
  },
  LogCategory: { STORY_GENERATION: 'story_generation' },
}));

import storyGenerationService from '../storyGenerationService';

describe('StoryGenerationService.generatePageAudio', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    (console.error as jest.Mock).mockRestore();
  });

  it('POSTs to the per-page audio endpoint and returns the mp3 bytes', async () => {
    const bytes = new Uint8Array([0xff, 0xfb, 0x90, 0x00]);
    (client.post as jest.Mock).mockResolvedValue({ data: bytes.buffer });

    const audio = await storyGenerationService.generatePageAudio(7, 3);

    expect(client.post).toHaveBeenCalledWith(
      '/stories/7/pages/3/audio',
      {},
      {
        responseType: 'arraybuffer',
        headers: { Accept: 'audio/mpeg' },
      }
    );
    expect(audio).toBeInstanceOf(Uint8Array);
    expect(Array.from(audio)).toEqual([0xff, 0xfb, 0x90, 0x00]);
  });

  it('throws with the HTTP status attached so callers can spot a rate limit', async () => {
    (client.post as jest.Mock).mockRejectedValue(
      Object.assign(new Error('Request failed with status code 429'), {
        response: { status: 429 },
      })
    );

    await expect(storyGenerationService.generatePageAudio(7, 1)).rejects.toMatchObject({
      status: 429,
    });
  });

  it('still throws when the failure carries no HTTP response', async () => {
    (client.post as jest.Mock).mockRejectedValue(new Error('Network Error'));

    await expect(storyGenerationService.generatePageAudio(7, 1)).rejects.toThrow('Network Error');
  });
});
