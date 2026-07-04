/**
 * Narration Player Service - Web Platform Implementation
 *
 * This file is automatically used by Metro bundler when running on web platform.
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

// Export web implementation (HTML5 Audio)
export { createNarrationPlayer } from './web';
