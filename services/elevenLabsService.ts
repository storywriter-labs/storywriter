import { Conversation } from '@elevenlabs/client';
import {
  TextToSpeechOptions,
  ElevenLabsError,
  AudioGenerationResult,
  ConversationCallbacks,
  ConversationSession
} from '../types/elevenlabs';
import { serviceLogger } from '@/src/utils/logger';

import client from '@/src/api/client';

// --- Configuration and Types ---


const DEFAULT_TIMEOUT_MS = 30000; // 30 seconds
const GRACEFUL_SHUTDOWN_TIMEOUT_MS = 5000; // 5 seconds

enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  DISCONNECTING = 'disconnecting',
  ERROR = 'error'
}

// Default voice settings for TTS consistency
const DEFAULT_VOICE_SETTINGS = {
  stability: 0.5,
  similarity_boost: 0.75,
  style: 0.0,
  use_speaker_boost: true,
};

// --- Service Implementation ---

export class ElevenLabsService {
  private defaultVoiceId: string;
  private defaultModelId: string;
  private agentId: string;
  private currentConversation: ConversationSession | null = null;
  private connectionState: ConnectionState = ConnectionState.DISCONNECTED;
  private shutdownTimeout: NodeJS.Timeout | null = null;
  private sessionId: string | null = null;

  constructor() {
    this.defaultVoiceId = "56AoDkrOh6qfVPDXZ7Pt"; // Cassidy voice (good for storytelling)
    this.defaultModelId = "eleven_flash_v2_5"; // Fast, low-latency model for narration
    this.agentId = "agent_01jxvakybhfmnr3yqvwxwye3sj"; // Your StoryWriter Agent
  }

  // --- Utility Methods ---

  /**
   * Helper to construct TextToSpeechOptions with defaults and overrides.
   * @param text The text to convert.
   * @param options Partial user-provided options.
   * @returns Complete TextToSpeechOptions object.
   */
  private buildTtsOptions(text: string, options?: Partial<TextToSpeechOptions>): TextToSpeechOptions {
    return {
      text: text.trim(),
      model_id: options?.model_id || this.defaultModelId,
      voice_settings: {
        ...DEFAULT_VOICE_SETTINGS,
        ...options?.voice_settings
      },
      ...options
    };
  }

  /**
   * Reusable function to enforce text length constraints.
   */
  private validateText(text: string): void {
    if (!text || text.trim().length === 0) {
      throw new Error('Text cannot be empty');
    }
    if (text.length > 5000) {
      throw new Error('Text is too long. Maximum length is 5000 characters.');
    }
  }

  // --- Text-to-Speech (TTS) Methods ---

  /**
   * Convert text to speech via Laravel backend proxy.
   */
  async generateSpeech(
    text: string,
    voiceId?: string,
    options?: Partial<TextToSpeechOptions>
  ): Promise<AudioGenerationResult> {
    try {
      this.validateText(text);

      const ttsOptions = this.buildTtsOptions(text, options);
      const finalVoiceId = voiceId || this.defaultVoiceId;

      const requestBody = {
        text: ttsOptions.text,
        voiceId: finalVoiceId,
        options: ttsOptions,
      };

      const response = await client.post('/conversation/tts', requestBody, {
        responseType: 'arraybuffer',
        headers: {
          'Accept': 'audio/mpeg',
        },
        signal: this.createTimeoutSignal().signal,
      });

      return { audio: new Uint8Array(response.data), request_id: undefined };

    } catch (error) {
      throw this.handleError(error, 'Failed to generate speech');
    }
  }

  /**
   * Generate speech with streaming. Falls back to buffered result wrapped in a stream.
   */
  async generateSpeechStream(
    text: string,
    voiceId?: string,
    options?: Partial<TextToSpeechOptions>
  ): Promise<ReadableStream> {
    try {
      const result = await this.generateSpeech(text, voiceId, options);

      return new ReadableStream({
        start(controller) {
          controller.enqueue(result.audio);
          controller.close();
        }
      });

    } catch (error) {
      throw this.handleError(error, 'Failed to generate speech stream');
    }
  }

  /**
   * Generate speech for a story prompt with optimized settings
   */
  async generateStoryPromptSpeech(prompt: string): Promise<AudioGenerationResult> {
    const storyVoiceSettings = {
      stability: 0.7,
      similarity_boost: 0.8,
      style: 0.2,
      use_speaker_boost: true
    };

    return this.generateSpeech(prompt, undefined, {
      voice_settings: storyVoiceSettings,
      model_id: this.defaultModelId // Use default Flash model for lower latency
    });
  }

  // --- Voice/Model Metadata Methods ---

  /**
   * Get available voices from Laravel backend
   */
  async getVoices(): Promise<unknown[]> {
    try {
      const response = await client.get<{ voices: unknown[] }>('/conversation/voices');
      return response.data.voices;
    } catch (error) {
      throw this.handleError(error, 'Failed to fetch voices');
    }
  }

  /**
   * Get available models (hardcoded list)
   */
  getModels(): string[] {
    return [
      "eleven_multilingual_v2",
      "eleven_flash_v2_5",
      "eleven_turbo_v2_5"
    ];
  }

  /**
   * Get a specific voice by ID
   */
  async getVoice(voiceId: string): Promise<unknown> {
    try {
      const voices = await this.getVoices();
      const voice = voices.find((v) => {
        if (typeof v === 'object' && v !== null && 'voice_id' in v) {
          return v.voice_id === voiceId;
        }
        return false;
      });

      if (!voice) {
        throw new Error(`Voice with ID ${voiceId} not found`);
      }

      return voice;
    } catch (error) {
      throw this.handleError(error, `Failed to fetch voice with ID: ${voiceId}`);
    }
  }

  // --- Conversation Agent Methods ---

  /**
   * Start a conversation with the StoryWriter Agent using ElevenLabs SDK
   */
  async startConversationAgent(callbacks: ConversationCallbacks = {}): Promise<ConversationSession> {
    if (this.currentConversation) {
      await this.endConversationAgent(); // Ensure any previous session is ended
    }

    this.connectionState = ConnectionState.CONNECTING;
    serviceLogger.elevenlabs.call('Starting conversation with StoryWriter Agent', { agentId: this.agentId });

    try {
      const response = await client.post<{
        signed_url: string
      }>('/conversation/sdk-credentials', { agentId: this.agentId });

      if (!response.data?.signed_url) {
        throw new Error('Missing signed_url in credentials response');
      }

      const { signed_url } = response.data;

      serviceLogger.elevenlabs.call('Got signed URL for conversation', { agentId: this.agentId });

      // Start conversation using ElevenLabs SDK with signed URL
      const conversation = await Conversation.startSession({
        signedUrl: signed_url,

        onConnect: () => {
          this.connectionState = ConnectionState.CONNECTED;
          serviceLogger.elevenlabs.call('WebSocket connected');
          callbacks.onConnect?.();
        },

        onDisconnect: () => this.handleDisconnect(callbacks.onDisconnect),

        onMessage: (message) => callbacks.onMessage?.(message), // Simplified message handling

        onError: (error: unknown) => this.handleErrorEvent(error, callbacks.onError),

        onStatusChange: (status) => callbacks.onStatusChange?.(status.toString()),
        onModeChange: (mode) => callbacks.onModeChange?.(mode.toString())
      });

      const session: ConversationSession = {
        conversation,
        endSession: async () => this.gracefulShutdown(conversation),
        getId: () => conversation.getId(),
        setVolume: async (options) => {
          if (this.canSendMessages()) {
            conversation.setVolume(options);
            return Promise.resolve();
          } else {
            throw new Error('Cannot set volume - WebSocket not connected');
          }
        }
      };

      this.currentConversation = session;
      return session;

    } catch (error) {
      this.connectionState = ConnectionState.ERROR;
      throw this.handleError(error, 'Failed to start conversation with StoryWriter Agent');
    }
  }

  /**
   * Internal handler for conversation disconnection.
   */
  private handleDisconnect(onDisconnectCallback?: () => void): void {
    if (this.connectionState !== ConnectionState.DISCONNECTING) {
      // If we are not actively disconnecting, this is an unexpected disconnection
      serviceLogger.elevenlabs.call('Unexpected WebSocket disconnected - cleaning up');
      this.forceCleanup();
    }
    // If we are disconnecting, the state change will happen after gracefulShutdown completes
    onDisconnectCallback?.();
  }

  /**
   * Internal handler for conversation errors.
   */
  private handleErrorEvent(error: unknown, onErrorCallback?: (error: unknown) => void): void {
    this.connectionState = ConnectionState.ERROR;
    this.currentConversation = null;
    serviceLogger.elevenlabs.error(error, { action: 'websocket_error' });
    onErrorCallback?.(error);
  }

  /**
   * End the current conversation session with proper cleanup
   */
  async endConversationAgent(): Promise<void> {
    if (this.currentConversation) {
      await this.gracefulShutdown(this.currentConversation.conversation);
    }
  }

  /**
   * Graceful shutdown of the WebSocket connection with a timeout.
   */
  private async gracefulShutdown(conversation: Conversation): Promise<void> {
    if (this.connectionState === ConnectionState.DISCONNECTED ||
      this.connectionState === ConnectionState.DISCONNECTING) {
      serviceLogger.elevenlabs.call('Shutdown skipped - already disconnected/disconnecting');
      return;
    }

    this.connectionState = ConnectionState.DISCONNECTING;
    serviceLogger.elevenlabs.call('Starting graceful shutdown');

    const shutdownPromise = conversation.endSession().catch((error) => {
      const isWebSocketStateError = error?.message?.includes('CLOSING') ||
        error?.message?.includes('CLOSED');

      if (!isWebSocketStateError) {
        // Only log non-state errors
        serviceLogger.elevenlabs.error(error, { action: 'graceful_shutdown_error' });
      }
      // Regardless of error, we proceed to cleanup.
    });

    // Use Promise.race for graceful shutdown with timeout
    const timeoutPromise = new Promise<void>(resolve => {
      this.shutdownTimeout = setTimeout(() => {
        serviceLogger.elevenlabs.call('Graceful shutdown timeout - forcing cleanup');
        this.cleanupState();
        resolve(); // Resolve the timeout promise
      }, GRACEFUL_SHUTDOWN_TIMEOUT_MS);
    });

    await Promise.race([shutdownPromise, timeoutPromise]);

    // Clear the timeout if the shutdown completed before the timeout
    if (this.shutdownTimeout) {
      clearTimeout(this.shutdownTimeout);
      this.shutdownTimeout = null;
    }

    // Final cleanup regardless of success/timeout
    this.cleanupState();
    serviceLogger.elevenlabs.call('Graceful shutdown completed/timeout handled');
  }

  /**
   * Force cleanup of any active conversation resources (Public facing).
   */
  forceCleanup(): void {
    this.cleanupState();
    serviceLogger.elevenlabs.call('Force cleanup completed - state reset');
  }

  /**
   * Synchronous state cleanup logic.
   */
  private cleanupState(): void {
    // 1. Clear timeout
    if (this.shutdownTimeout) {
      clearTimeout(this.shutdownTimeout);
      this.shutdownTimeout = null;
    }

    // 2. Clear conversation state
    this.currentConversation = null;
    this.sessionId = null;
    this.connectionState = ConnectionState.DISCONNECTED;

    // We don't need to manually call this.currentConversation.endSession() here 
    // because the WebSocket SDK's onDisconnect/onError will handle that, and 
    // the gracefulShutdown already tried it.
  }

  // --- Simple Accessors/Mutators ---

  setDefaultVoice(voiceId: string): void { this.defaultVoiceId = voiceId; }
  setDefaultModel(modelId: string): void { this.defaultModelId = modelId; }
  getDefaultVoice(): string { return this.defaultVoiceId; }
  getDefaultModel(): string { return this.defaultModelId; }
  isConversationActive(): boolean {
    return this.currentConversation !== null && this.connectionState === ConnectionState.CONNECTED;
  }
  getConnectionState(): string { return this.connectionState; }
  canSendMessages(): boolean { return this.connectionState === ConnectionState.CONNECTED; }
  getCurrentConversation(): ConversationSession | null { return this.currentConversation; }
  async setConversationVolume(volume: number): Promise<void> {
    if (this.currentConversation) {
      const clampedVolume = Math.max(0, Math.min(1, volume));
      await this.currentConversation.setVolume({ volume: clampedVolume });
    }
  }

  /**
   * Helper to create an AbortController with a set timeout.
   */
  private createTimeoutSignal(timeout: number = DEFAULT_TIMEOUT_MS) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    return { controller, timeoutId, signal: controller.signal };
  }

  // --- Error Handling ---

  /**
   * Comprehensive error handling for backend API errors
   */
  private handleError(error: unknown, context: string): ElevenLabsError {
    // ... (Error handling logic remains similar, but is now focused only here)
    serviceLogger.elevenlabs.error(error, { context });

    const elevenlabsError: ElevenLabsError = new Error(`${context}: Unknown error occurred`);

    // Type guard for error objects
    if (error && typeof error === 'object') {
      const errorObj = error as { message?: string; status?: number; code?: string; details?: unknown };

      if (errorObj.message && typeof errorObj.message === 'string') {
        elevenlabsError.message = errorObj.message;
      }

      // Simplified status code mapping
      const status = typeof errorObj.status === 'number' ? errorObj.status : 0;
      elevenlabsError.status = status;

      if (status === 401) elevenlabsError.message = `${context}: Invalid API key or unauthorized access`;
      else if (status === 400) elevenlabsError.message = `${context}: Invalid request parameters - ${elevenlabsError.message}`;
      else if (status === 429) elevenlabsError.message = `${context}: Rate limit exceeded. Please try again later.`;
      else if (status >= 500) elevenlabsError.message = `${context}: Backend server error or service unavailable.`;

      if (errorObj.code && typeof errorObj.code === 'string') {
        elevenlabsError.code = errorObj.code;
      }
      if (errorObj.details !== undefined) {
        elevenlabsError.details = errorObj.details;
      }
    }

    return elevenlabsError;
  }
}

// Export singleton instance
export default new ElevenLabsService();