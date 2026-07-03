/**
 * Web Implementation of Narration Player
 *
 * Uses HTML5 Audio API for browser-based audio playback.
 * Converts Uint8Array audio data to Blob URLs for Audio element compatibility.
 */

import type {
  NarrationPlayer,
  NarrationPlayerConfig,
  PlaybackCompletionCallback,
} from './types';
import { AutoplayBlockedError } from './types';

/**
 * Detect the browser autoplay-policy block: calling `play()` without a recent
 * user gesture rejects with a `NotAllowedError` DOMException. Surfaced as an
 * `AutoplayBlockedError` so callers can prompt for a one-tap start instead of
 * showing a generic playback error.
 */
function isAutoplayBlockedError(error: unknown): boolean {
  return error instanceof Error && error.name === 'NotAllowedError';
}

/**
 * HTML5 Audio-based narration player for web platform
 */
export class WebNarrationPlayer implements NarrationPlayer {
  private audio: HTMLAudioElement | null = null;
  private currentBlobUrl: string | null = null;
  private completionCallback: PlaybackCompletionCallback | null = null;
  private playing = false;

  constructor(config?: NarrationPlayerConfig) {
    if (config?.onPlaybackComplete) {
      this.completionCallback = config.onPlaybackComplete;
    }
  }

  /**
   * Load audio data by converting Uint8Array to Blob URL
   */
  async load(audioData: Uint8Array): Promise<void> {
    try {
      // Clean up previous audio resources
      this.cleanup();

      // Create Blob from audio data
      const blob = new Blob([audioData as BlobPart], { type: 'audio/mpeg' });
      this.currentBlobUrl = URL.createObjectURL(blob);

      // Create new Audio element
      this.audio = new Audio(this.currentBlobUrl);

      // Set up event listeners
      this.audio.addEventListener('ended', this.handleAudioEnded);
      this.audio.addEventListener('error', this.handleAudioError);
      this.audio.addEventListener('play', this.handleAudioPlay);
      this.audio.addEventListener('pause', this.handleAudioPause);

      // Preload audio
      this.audio.load();
    } catch (error) {
      this.cleanup();
      throw new Error(
        `Failed to load audio: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Start or resume playback
   */
  async play(): Promise<void> {
    if (!this.audio) {
      throw new Error('No audio loaded. Call load() first.');
    }

    try {
      await this.audio.play();
      this.playing = true;
    } catch (error) {
      this.playing = false;
      if (isAutoplayBlockedError(error)) {
        throw new AutoplayBlockedError();
      }
      throw new Error(
        `Failed to play audio: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Pause playback
   */
  async pause(): Promise<void> {
    if (!this.audio) {
      throw new Error('No audio loaded. Call load() first.');
    }

    try {
      this.audio.pause();
      this.playing = false;
    } catch (error) {
      throw new Error(
        `Failed to pause audio: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Check if audio is currently playing
   */
  isPlaying(): boolean {
    return this.playing;
  }

  /**
   * Set or update playback completion callback
   */
  setCompletionCallback(callback: PlaybackCompletionCallback): void {
    this.completionCallback = callback;
  }

  /**
   * Clean up all resources
   */
  cleanup(): void {
    // Remove event listeners
    if (this.audio) {
      this.audio.removeEventListener('ended', this.handleAudioEnded);
      this.audio.removeEventListener('error', this.handleAudioError);
      this.audio.removeEventListener('play', this.handleAudioPlay);
      this.audio.removeEventListener('pause', this.handleAudioPause);

      // Pause and clear audio
      this.audio.pause();
      this.audio.src = '';
      this.audio = null;
    }

    // Revoke Blob URL to free memory
    if (this.currentBlobUrl) {
      URL.revokeObjectURL(this.currentBlobUrl);
      this.currentBlobUrl = null;
    }

    this.playing = false;
  }

  /**
   * Handle audio ended event
   */
  private handleAudioEnded = (): void => {
    this.playing = false;

    if (this.completionCallback) {
      this.completionCallback();
    }
  };

  /**
   * Handle audio error event
   */
  private handleAudioError = (event: Event): void => {
    this.playing = false;
    const audio = event.target as HTMLAudioElement;
    const error = audio.error;

    console.error('Audio playback error:', {
      code: error?.code,
      message: error?.message,
    });
  };

  /**
   * Handle audio play event
   */
  private handleAudioPlay = (): void => {
    this.playing = true;
  };

  /**
   * Handle audio pause event
   */
  private handleAudioPause = (): void => {
    this.playing = false;
  };

  /**
   * Play audio data immediately without caching
   */
  async playOnce(audioData: Uint8Array): Promise<void> {
    try {
      const blob = new Blob([audioData as BlobPart], { type: 'audio/mpeg' });
      const blobUrl = URL.createObjectURL(blob);

      const audio = new Audio(blobUrl);
      audio.onended = () => {
        URL.revokeObjectURL(blobUrl);
      };
      audio.onerror = () => {
        URL.revokeObjectURL(blobUrl);
      };

      await audio.play();
    } catch (error) {
      throw new Error(
        `Failed to play audio: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}

/**
 * Create a new web narration player instance
 */
export function createNarrationPlayer(
  config?: NarrationPlayerConfig
): NarrationPlayer {
  return new WebNarrationPlayer(config);
}
