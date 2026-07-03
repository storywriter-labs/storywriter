/**
 * Narration Player Service - Native Platform Implementation
 *
 * This is the default (native) implementation for iOS and Android.
 * Metro bundler will automatically use index.web.ts for web platform.
 *
 * Usage:
 * ```typescript
 * import { createNarrationPlayer } from '@/services/narration';
 *
 * const player = createNarrationPlayer({
 *   onPlaybackComplete: () => console.log('Audio finished')
 * });
 *
 * await player.load(audioData);
 * await player.play();
 * ```
 */

// Re-export types for convenience
export type {
  NarrationPlayer,
  NarrationPlayerConfig,
  PlaybackCompletionCallback,
} from './types';
export { AutoplayBlockedError } from './types';

// Export native implementation (iOS/Android)
export { createNarrationPlayer } from './native';
