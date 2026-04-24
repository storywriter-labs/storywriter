/**
 * Audio Decoder Utility
 *
 * Handles decoding of audio data from various formats (base64, ArrayBuffer, etc.)
 * into Uint8Array for playback by the narration service.
 */

/**
 * Decode audio data from various formats into Uint8Array
 *
 * Supports:
 * - Base64-encoded strings
 * - ArrayBuffer instances
 * - Raw message objects with audio/data fields
 *
 * @param audioData - Audio data in any supported format
 * @returns Uint8Array of decoded audio data
 * @throws Error if the audio data format is unsupported or decoding fails
 */
export function decodeAudioData(audioData: any): Uint8Array {
  // Handle string (base64 encoded)
  if (typeof audioData === 'string') {
    const decodedString = atob(audioData);
    const uint8Array = new Uint8Array(decodedString.length);
    for (let i = 0; i < decodedString.length; i++) {
      uint8Array[i] = decodedString.charCodeAt(i);
    }
    return uint8Array;
  }

  // Handle ArrayBuffer
  if (audioData instanceof ArrayBuffer) {
    return new Uint8Array(audioData);
  }

  // Handle Uint8Array
  if (audioData instanceof Uint8Array) {
    return audioData;
  }

  throw new Error('Unsupported audio data format');
}

/**
 * Extract and decode audio data from an ElevenLabs message
 *
 * @param message - Message object that may contain audio data
 * @returns Uint8Array of decoded audio data, or null if no audio data found
 * @throws Error if audio data is found but cannot be decoded
 */
export function extractAudioFromMessage(message: any): Uint8Array | null {
  // Check for audio field (base64)
  if (message.audio) {
    return decodeAudioData(message.audio);
  }

  // Check for data field (can be string or ArrayBuffer)
  if (message.data) {
    return decodeAudioData(message.data);
  }

  return null;
}
