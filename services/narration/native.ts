/**
 * Native Implementation of Narration Player
 *
 * Uses the expo-audio Audio API for iOS and Android audio playback.
 * Loads Uint8Array audio data directly into an AudioPlayer via a base64 data URI.
 */

import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
  type AudioStatus,
} from 'expo-audio';
import type {
  NarrationPlayer,
  NarrationPlayerConfig,
  PlaybackCompletionCallback,
} from './types';

type StatusSubscription = { remove: () => void };

/**
 * expo-audio based narration player for native platforms (iOS/Android)
 */
export class NativeNarrationPlayer implements NarrationPlayer {
  private player: AudioPlayer | null = null;
  private statusSubscription: StatusSubscription | null = null;
  private completionCallback: PlaybackCompletionCallback | null = null;
  private playing = false;

  constructor(config?: NarrationPlayerConfig) {
    if (config?.onPlaybackComplete) {
      this.completionCallback = config.onPlaybackComplete;
    }
  }

  /**
   * Load audio data using an expo-audio AudioPlayer
   */
  async load(audioData: Uint8Array): Promise<void> {
    try {
      // Clean up previous audio resources
      this.cleanup();

      // Configure audio session for playback
      await setAudioModeAsync({
        playsInSilentMode: true,
        shouldPlayInBackground: false,
      });

      // Convert Uint8Array to base64 data URI
      const base64 = this.uint8ArrayToBase64(audioData);
      const dataUri = `data:audio/mpeg;base64,${base64}`;

      // Create the player (paused until play() is called)
      const player = createAudioPlayer({ uri: dataUri });
      this.statusSubscription = player.addListener(
        'playbackStatusUpdate',
        this.handlePlaybackStatusUpdate
      );

      this.player = player;
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
    if (!this.player) {
      throw new Error('No audio loaded. Call load() first.');
    }

    try {
      this.player.play();
      this.playing = true;
    } catch (error) {
      throw new Error(
        `Failed to play audio: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Pause playback
   */
  async pause(): Promise<void> {
    if (!this.player) {
      throw new Error('No audio loaded. Call load() first.');
    }

    try {
      this.player.pause();
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
    if (this.statusSubscription) {
      this.statusSubscription.remove();
      this.statusSubscription = null;
    }

    if (this.player) {
      try {
        // Free the underlying native player resources
        this.player.remove();
      } catch (error) {
        // Ignore cleanup errors
        console.error('Error during sound cleanup:', error);
      }
      this.player = null;
    }

    this.playing = false;
  }

  /**
   * Handle playback status updates from expo-audio
   */
  private handlePlaybackStatusUpdate = (status: AudioStatus): void => {
    if (!status.isLoaded) {
      // Audio is not loaded or has been unloaded
      this.playing = false;
      return;
    }

    // Update playing state based on actual playback status
    this.playing = status.playing;

    // Check if playback has finished
    if (status.didJustFinish && !status.loop) {
      this.playing = false;

      if (this.completionCallback) {
        this.completionCallback();
      }
    }
  };

  /**
   * Convert Uint8Array to base64 string
   */
  private uint8ArrayToBase64(bytes: Uint8Array): string {
    let binary = '';
    const len = bytes.byteLength;

    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }

    return btoa(binary);
  }

  /**
   * Play audio data immediately without caching
   */
  async playOnce(audioData: Uint8Array): Promise<void> {
    try {
      const base64 = this.uint8ArrayToBase64(audioData);
      const dataUri = `data:audio/mpeg;base64,${base64}`;

      const player = createAudioPlayer({ uri: dataUri });

      // Clean up the player after playback completes
      const subscription = player.addListener(
        'playbackStatusUpdate',
        (status: AudioStatus) => {
          if (!status.isLoaded) {
            return;
          }

          if (status.didJustFinish && !status.loop) {
            subscription.remove();
            try {
              player.remove();
            } catch {
              // Ignore cleanup errors
            }
          }
        }
      );

      player.play();
    } catch (error) {
      throw new Error(
        `Failed to play audio: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}

/**
 * Create a new native narration player instance
 */
export function createNarrationPlayer(
  config?: NarrationPlayerConfig
): NarrationPlayer {
  return new NativeNarrationPlayer(config);
}
