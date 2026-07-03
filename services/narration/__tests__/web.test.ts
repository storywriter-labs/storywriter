/**
 * Tests for the web narration player's autoplay-policy handling.
 *
 * On web the first page after a cold load calls play() with no recent user
 * gesture, which browsers reject with a `NotAllowedError`. The player surfaces
 * that as an `AutoplayBlockedError` so the UI can prompt for a one-tap start
 * instead of showing a generic playback error.
 */
import { WebNarrationPlayer } from '../web';
import { AutoplayBlockedError } from '../types';

// Minimal HTMLAudioElement stand-in — jest-expo runs in a node env without the
// DOM Audio API, so we inject a controllable fake.
class MockAudio {
  play = jest.fn<Promise<void>, []>().mockResolvedValue(undefined);
  pause = jest.fn();
  load = jest.fn();
  addEventListener = jest.fn();
  removeEventListener = jest.fn();
  src = '';
  error: MediaError | null = null;
}

let lastAudio: MockAudio;

beforeAll(() => {
  // @ts-expect-error - polyfill browser globals used by WebNarrationPlayer
  global.Blob = class {
    constructor(_parts: unknown[], _opts?: unknown) {}
  };
  // @ts-expect-error - partial URL polyfill
  global.URL = {
    createObjectURL: jest.fn(() => 'blob:mock-url'),
    revokeObjectURL: jest.fn(),
  };
  // @ts-expect-error - Audio constructor returns our fake element
  global.Audio = jest.fn(() => {
    lastAudio = new MockAudio();
    return lastAudio;
  });
});

async function loadPlayer(): Promise<WebNarrationPlayer> {
  const player = new WebNarrationPlayer();
  await player.load(new Uint8Array([1, 2, 3, 4]));
  return player;
}

describe('WebNarrationPlayer.play() autoplay policy', () => {
  it('throws AutoplayBlockedError when the browser blocks autoplay (NotAllowedError)', async () => {
    const player = await loadPlayer();

    const blocked = new Error('play() failed because the user did not interact');
    blocked.name = 'NotAllowedError';
    lastAudio.play.mockRejectedValueOnce(blocked);

    await expect(player.play()).rejects.toBeInstanceOf(AutoplayBlockedError);
    expect(player.isPlaying()).toBe(false);
  });

  it('wraps other playback failures as a generic error, not AutoplayBlockedError', async () => {
    const player = await loadPlayer();

    lastAudio.play.mockRejectedValueOnce(new Error('decode failure'));

    await expect(player.play()).rejects.toThrow('Failed to play audio');
    expect(player.isPlaying()).toBe(false);
  });

  it('resolves and marks playing when autoplay succeeds', async () => {
    const player = await loadPlayer();

    await expect(player.play()).resolves.toBeUndefined();
    expect(player.isPlaying()).toBe(true);
  });
});
