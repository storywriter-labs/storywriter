/**
 * Native Implementation of Narration Player
 *
 * Uses expo-av Audio API for iOS and Android audio playback.
 * Loads Uint8Array audio data directly into Sound object.
 */

import { Audio } from 'expo-av';
import type {
  NarrationPlayer,
  NarrationPlayerConfig,
  PlaybackCompletionCallback,
} from './types';

/**
 * expo-av based narration player for native platforms (iOS/Android)
 */
export class NativeNarrationPlayer implements NarrationPlayer {
  private sound: Audio.Sound | null = null;
  private completionCallback: PlaybackCompletionCallback | null = null;
  private playing = false;

  constructor(config?: NarrationPlayerConfig) {
    if (config?.onPlaybackComplete) {
      this.completionCallback = config.onPlaybackComplete;
    }
  }

  /**
   * Load audio data using expo-av Sound
   */
  async load(audioData: Uint8Array): Promise<void> {
    try {
      // Clean up previous audio resources
      await this.cleanup();

      // Configure audio session for playback
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });

      // Convert Uint8Array to base64 data URI
      const base64 = this.uint8ArrayToBase64(audioData);
      const dataUri = `data:audio/mpeg;base64,${base64}`;

      // Create and load sound
      const { sound } = await Audio.Sound.createAsync(
        { uri: dataUri },
        { shouldPlay: false },
        this.handlePlaybackStatusUpdate
      );

      this.sound = sound;
    } catch (error) {
      await this.cleanup();
      throw new Error(
        `Failed to load audio: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Start or resume playback
   */
  async play(): Promise<void> {
    if (!this.sound) {
      throw new Error('No audio loaded. Call load() first.');
    }

    try {
      await this.sound.playAsync();
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
    if (!this.sound) {
      throw new Error('No audio loaded. Call load() first.');
    }

    try {
      await this.sound.pauseAsync();
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
    if (this.sound) {
      // Cleanup asynchronously but don't wait
      this.sound
        .stopAsync()
        .then(() => this.sound?.unloadAsync())
        .catch((error) => {
          // Ignore cleanup errors
          console.error('Error during sound cleanup:', error);
        });
      this.sound = null;
    }

    this.playing = false;
  }

  /**
   * Handle playback status updates from expo-av
   */
  private handlePlaybackStatusUpdate = (status: any): void => {
    if (!status.isLoaded) {
      // Audio is not loaded or has been unloaded
      this.playing = false;
      return;
    }

    // Update playing state based on actual playback status
    this.playing = status.isPlaying;

    // Check if playback has finished
    if (status.didJustFinish && !status.isLooping) {
      this.playing = false;

      if (this.completionCallback) {
        this.completionCallback();
      }
    }

    // Handle errors
    if (status.error) {
      this.playing = false;
      console.error('Audio playback error:', status.error);
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

      const { sound } = await Audio.Sound.createAsync(
        { uri: dataUri },
        { shouldPlay: true }
      );

      // Clean up sound after playback completes
      sound.setOnPlaybackStatusUpdate((status: any) => {
        if (!status.isLoaded) {
          return;
        }

        if (status.didJustFinish && !status.isLooping) {
          sound.unloadAsync().catch(() => {
            // Ignore cleanup errors
          });
        }

        if (status.error) {
          console.error('Audio playback error:', status.error);
        }
      });
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
