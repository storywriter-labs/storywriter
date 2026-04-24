/**
 * Narration Player Types
 *
 * Platform-agnostic interface for audio playback in the StoryWriter narration system.
 * Implementations exist for web (HTML5 Audio) and native (expo-av).
 */

/**
 * Callback fired when audio playback completes
 */
export type PlaybackCompletionCallback = () => void;

/**
 * Configuration options for initializing the narration player
 */
export interface NarrationPlayerConfig {
  /**
   * Optional callback to execute when audio finishes playing
   */
  onPlaybackComplete?: PlaybackCompletionCallback;
}

/**
 * Platform-agnostic audio player interface for narration
 *
 * Implementations:
 * - Web: services/narration/web.ts (HTML5 Audio)
 * - Native: services/narration/native.ts (expo-av)
 */
export interface NarrationPlayer {
  /**
   * Load audio data into the player
   *
   * @param audioData - MP3 audio as Uint8Array from ElevenLabs
   * @throws Error if audio data is invalid or loading fails
   */
  load(audioData: Uint8Array): Promise<void>;

  /**
   * Start or resume audio playback
   *
   * @throws Error if no audio is loaded or playback fails
   */
  play(): Promise<void>;

  /**
   * Pause audio playback
   *
   * @throws Error if playback cannot be paused
   */
  pause(): Promise<void>;

  /**
   * Check if audio is currently playing
   *
   * @returns true if audio is actively playing
   */
  isPlaying(): boolean;

  /**
   * Clean up resources (Blob URLs, sound instances, etc.)
   *
   * Must be called when component unmounts or audio is no longer needed
   */
  cleanup(): void;

  /**
   * Set or update the playback completion callback
   *
   * @param callback - Function to call when audio finishes
   */
  setCompletionCallback(callback: PlaybackCompletionCallback): void;

  /**
   * Play audio data immediately without caching as primary track
   *
   * Used for one-off conversation audio from ElevenLabs conversations.
   * Does not affect the main narration player state.
   *
   * @param audioData - MP3 audio as Uint8Array from ElevenLabs
   * @throws Error if audio data is invalid or playback fails
   */
  playOnce(audioData: Uint8Array): Promise<void>;
}
