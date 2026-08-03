export interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  samples?: any[];
  category?: string;
  fine_tuning?: {
    is_allowed_to_fine_tune: boolean;
    verification_attempts?: any[];
    verification_failures?: string[];
    verification_attempts_count: number;
    slice_ids?: string[];
    manual_verification?: {
      extra_text: string;
      request_time_unix: number;
      files: any[];
    };
  };
  labels?: Record<string, string>;
  description?: string;
  preview_url?: string;
  available_for_tiers?: string[];
  settings?: {
    stability: number;
    similarity_boost: number;
    style: number;
    use_speaker_boost: boolean;
  };
  sharing?: {
    status: string;
    history_item_sample_id?: string;
    original_voice_id?: string;
    public_owner_id?: string;
    liked_by_count: number;
    cloned_by_count: number;
    name?: string;
    description?: string;
    labels?: Record<string, string>;
    review_status?: string;
    review_message?: string;
    enabled_in_library: boolean;
  };
  high_quality_base_model_ids?: string[];
  safety_control?: string;
  voice_verification?: {
    requires_verification: boolean;
    is_verified: boolean;
    verification_failures?: string[];
    verification_attempts_count: number;
    language?: string;
  };
  owner_id?: string;
  permission_on_resource?: string;
  is_legacy?: boolean;
  is_mixed?: boolean;
}

export interface ElevenLabsModel {
  model_id: string;
  name: string;
  can_be_finetuned: boolean;
  can_do_text_to_speech: boolean;
  can_do_voice_conversion: boolean;
  can_use_style: boolean;
  can_use_speaker_boost: boolean;
  serves_pro_voices: boolean;
  token_cost_factor: number;
  description: string;
  requires_alpha_access: boolean;
  max_characters_request_free_user: number;
  max_characters_request_subscribed_user: number;
  maximum_text_length_per_request: number;
  languages: Array<{
    language_id: string;
    name: string;
  }>;
}

export interface TextToSpeechOptions {
  text: string;
  model_id?: string;
  language_code?: string;
  voice_settings?: {
    stability?: number;
    similarity_boost?: number;
    style?: number;
    use_speaker_boost?: boolean;
  };
  pronunciation_dictionary_locators?: Array<{
    pronunciation_dictionary_id: string;
    version_id: string;
  }>;
  seed?: number;
  previous_text?: string;
  next_text?: string;
  previous_request_ids?: string[];
  next_request_ids?: string[];
}

export interface ElevenLabsError extends Error {
  status?: number;
  code?: string;
  details?: any;
}

export interface AudioGenerationResult {
  audio: ReadableStream | Buffer | Uint8Array;
  request_id?: string;
}

export interface VoiceListResponse {
  voices: ElevenLabsVoice[];
}

export interface ModelListResponse {
  models: ElevenLabsModel[];
}

// Actual message format received from ElevenLabs
export interface ElevenLabsActualMessage {
  source: 'user' | 'ai';
  message: string;
}

// Message types for ElevenLabs conversation agents
export interface ConversationMessage {
  // Primary format (actual format received)
  source?: 'user' | 'ai';
  message?: string;
  
  // Legacy/documented formats (kept for backwards compatibility)
  type?: 'user_transcript' | 'user_message' | 'agent_response' | 'agent_message' | 
        'client_tool_call' | 'client_tool_result' | 'audio' | 'ping' | 
        'conversation_initiation_metadata' | 'internal_tentative_agent_response' |
        'vad_score' | 'interruption' | 'contextual_update';
  
  // For user messages
  user_transcription_event?: {
    user_transcript: string;
  };
  
  // For agent responses
  agent_response_event?: {
    agent_response: string;
  };
  
  // For tool calls
  client_tool_call?: {
    tool_name: string;
    tool_call_id: string;
    parameters: Record<string, any>;
  };
  
  // Audio data
  audio?: string; // Base64 encoded audio data
  
  // Fallback text fields
  text?: string;
  content?: string;
  
  // Other message data
  [key: string]: any;
}

// A tool the agent can invoke on us mid-conversation. The string it returns is
// sent back to the agent as the tool result.
export type ConversationClientTool = (
  parameters: Record<string, any>
) => Promise<string | number | void> | string | number | void;

export interface ConversationClientToolCall {
  tool_name: string;
  tool_call_id: string;
  parameters: Record<string, any>;
}

export interface ConversationCallbacks {
  onConnect?: () => void;
  onDisconnect?: () => void;
  onMessage?: (message: ConversationMessage) => void;
  onError?: (error: any) => void;
  onStatusChange?: (status: string) => void;
  onModeChange?: (mode: string) => void;

  // Tool calls never arrive through onMessage — the SDK looks the name up in
  // clientTools and, failing that, hands it to onUnhandledClientToolCall.
  clientTools?: Record<string, ConversationClientTool>;
  onUnhandledClientToolCall?: (toolCall: ConversationClientToolCall) => void;
}

export interface ConversationSession {
  conversation: any;
  endSession: () => Promise<void>;
  getId: () => string;
  setVolume: (options: { volume: number }) => Promise<void>;
}