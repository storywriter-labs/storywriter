# ElevenLabs Service Implementation

## Overview

This document explains how ElevenLabs is integrated into the StoryWriter project, covering both Text-to-Speech (TTS) API and Conversational AI Agents. It provides architectural insights, implementation patterns, and best practices for extending ElevenLabs functionality.

**ElevenLabs Official Documentation:**
- [ElevenLabs API Quickstart](https://elevenlabs.io/docs/eleven-api/quickstart)
- [ElevenLabs Agents Overview](https://elevenlabs.io/docs/eleven-agents/overview)

---

## Architecture

### Service Structure

The ElevenLabs implementation follows a singleton service pattern with dual-path support:

```
services/
├── elevenLabsService.ts    # Main service implementation
└── index.ts                # Service exports

types/
└── elevenlabs.ts           # TypeScript type definitions
```

### Implementation Strategy

The service uses **two execution paths** depending on the feature:

1. **SDK Client Path** (Conversational Agents only)
   - Uses `@elevenlabs/client` SDK
   - WebSocket connection via signed URLs from backend
   - Used exclusively for Conversational Agents

2. **Laravel Backend Path** (TTS and voice listing)
   - Routes requests through Laravel API backend (`/api/conversation/*`)
   - Uses authenticated Axios client for automatic Bearer token injection
   - Centralized API key management, request logging, and cost tracking

### Class Structure

```typescript
export class ElevenLabsService {
  private defaultVoiceId: string;
  private defaultModelId: string;
  private agentId: string;
  private currentConversation: ConversationSession | null = null;
  private connectionState: ConnectionState;
  private shutdownTimeout: NodeJS.Timeout | null = null;
  private sessionId: string | null = null;

  // ... methods
}
```

**Singleton Export:**
```typescript
export default new ElevenLabsService();
```

Import in your code:
```typescript
import elevenLabsService from '@/services/elevenLabsService';
```

---

## Text-to-Speech (TTS) Implementation

### Default Configuration

```typescript
// Default voice for storytelling
defaultVoiceId: "56AoDkrOh6qfVPDXZ7Pt" // Cassidy voice

// Fast, low-latency model for narration
defaultModelId: "eleven_flash_v2_5"

// Default voice settings
DEFAULT_VOICE_SETTINGS = {
  stability: 0.5,              // Voice consistency
  similarity_boost: 0.75,      // Voice similarity to sample
  style: 0.0,                  // Style exaggeration
  use_speaker_boost: true,     // Audio enhancement
}
```

### TTS Methods

#### 1. Basic Speech Generation

```typescript
async generateSpeech(
  text: string,
  voiceId?: string,
  options?: Partial<TextToSpeechOptions>
): Promise<AudioGenerationResult>
```

**Usage Example:**
```typescript
import elevenLabsService from '@/services/elevenLabsService';

const result = await elevenLabsService.generateSpeech(
  "Once upon a time in a magical forest...",
  undefined, // Use default voice
  {
    model_id: "eleven_flash_v2_5",
    voice_settings: {
      stability: 0.7,
      similarity_boost: 0.8,
    }
  }
);

// result.audio is a Uint8Array containing MP3 audio data
```

**Execution Flow:**
1. Validates text (non-empty, max 5000 characters)
2. Builds TTS options with defaults and overrides
3. POSTs to Laravel backend `/api/conversation/tts` via authenticated Axios client
4. Returns audio as Uint8Array

#### 2. Streaming Speech Generation

```typescript
async generateSpeechStream(
  text: string,
  voiceId?: string,
  options?: Partial<TextToSpeechOptions>
): Promise<ReadableStream>
```

**Usage Example:**
```typescript
const stream = await elevenLabsService.generateSpeechStream(
  "This is a longer text that will stream...",
  "EXAVITQu4vr4xnSDxMaL"
);

// Use stream for progressive playback
const reader = stream.getReader();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  // Process audio chunk
}
```

**Benefits:**
- Lower latency for long texts
- Progressive audio playback
- Better memory efficiency

#### 3. Story-Optimized Speech

```typescript
async generateStoryPromptSpeech(
  prompt: string
): Promise<AudioGenerationResult>
```

**Pre-configured for storytelling:**
```typescript
const storyVoiceSettings = {
  stability: 0.7,           // More consistent for narration
  similarity_boost: 0.8,    // Higher voice fidelity
  style: 0.2,               // Slight expressiveness
  use_speaker_boost: true
};
```

**Usage:**
```typescript
const audioResult = await elevenLabsService.generateStoryPromptSpeech(
  "The brave knight rode into the sunset..."
);
```

### Voice and Model Management

#### Get Available Voices

```typescript
async getVoices(): Promise<any[]>
```

Fetches voices from Laravel backend endpoint `/api/conversation/voices`.

**Usage:**
```typescript
const voices = await elevenLabsService.getVoices();
voices.forEach(voice => {
  console.log(`${voice.name} (${voice.voice_id})`);
});
```

#### Get Specific Voice

```typescript
async getVoice(voiceId: string): Promise<any>
```

**Usage:**
```typescript
const cassidyVoice = await elevenLabsService.getVoice("56AoDkrOh6qfVPDXZ7Pt");
console.log(cassidyVoice.settings);
```

#### Get Available Models

```typescript
getModels(): string[]
```

Returns hardcoded list of supported models:
- `eleven_multilingual_v2` - Best quality, 31 languages
- `eleven_flash_v2_5` - Fast, low-latency
- `eleven_turbo_v2_5` - Fastest, real-time streaming

---

## Conversational AI Agents

### Overview

ElevenLabs Agents combine speech recognition, language understanding, voice synthesis, and conversation management for interactive voice experiences.

**StoryWriter Agent Configuration:**

The agent ID is configured server-side via `ELEVENLABS_AGENT_ID` in the backend environment. The frontend does not hold or send the agent ID.

### Connection States

```typescript
enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  DISCONNECTING = 'disconnecting',
  ERROR = 'error'
}
```

### Starting a Conversation

```typescript
async startConversationAgent(
  callbacks: ConversationCallbacks = {}
): Promise<ConversationSession>
```

**Execution Flow:**
1. Ends any existing conversation session
2. Fetches signed URL from backend (`/conversation/sdk-credentials`)
3. Initializes WebSocket connection via ElevenLabs SDK
4. Sets up event callbacks
5. Returns session object with control methods

**Usage Example:**
```typescript
import elevenLabsService from '@/services/elevenLabsService';

const session = await elevenLabsService.startConversationAgent({
  onConnect: () => {
    console.log('Agent connected');
  },

  onMessage: (message) => {
    console.log('Agent message:', message.source, message.message);
  },

  onStatusChange: (status) => {
    console.log('Status:', status);
  },

  onModeChange: (mode) => {
    console.log('Mode:', mode);
  },

  onDisconnect: () => {
    console.log('Agent disconnected');
  },

  onError: (error) => {
    console.error('Agent error:', error);
  }
});

// Control the conversation
await session.setVolume({ volume: 0.8 });
const conversationId = session.getId();
await session.endSession();
```

### Conversation Callbacks

```typescript
interface ConversationCallbacks {
  onConnect?: () => void;
  onDisconnect?: () => void;
  onMessage?: (message: ConversationMessage) => void;
  onError?: (error: any) => void;
  onStatusChange?: (status: string) => void;
  onModeChange?: (mode: string) => void;
}
```

### Message Format

Messages received in `onMessage` callback:

```typescript
interface ConversationMessage {
  // Primary format (actual from ElevenLabs)
  source?: 'user' | 'ai';
  message?: string;

  // Legacy/documented formats
  type?: 'user_transcript' | 'agent_response' | 'audio' | 'ping' | ...;
  user_transcription_event?: { user_transcript: string };
  agent_response_event?: { agent_response: string };
  client_tool_call?: { tool_name: string; parameters: any };
  audio?: string; // Base64 encoded

  [key: string]: any;
}
```

**Simplified Message Handling:**
```typescript
onMessage: (message) => {
  // Primary format (most common)
  if (message.source && message.message) {
    console.log(`[${message.source}]: ${message.message}`);
  }

  // Handle other message types as needed
  if (message.audio) {
    // Process audio data
  }
}
```

### Conversation Session

```typescript
interface ConversationSession {
  conversation: Conversation;  // ElevenLabs SDK conversation object
  endSession: () => Promise<void>;
  getId: () => string;
  setVolume: (options: { volume: number }) => Promise<void>;
}
```

### Ending a Conversation

```typescript
async endConversationAgent(): Promise<void>
```

**Graceful Shutdown Process:**
1. Changes state to `DISCONNECTING`
2. Calls `conversation.endSession()`
3. Waits up to 5 seconds for graceful shutdown
4. Times out and forces cleanup if needed
5. Clears all session state
6. Sets state to `DISCONNECTED`

**Usage:**
```typescript
await elevenLabsService.endConversationAgent();
```

### Force Cleanup

```typescript
forceCleanup(): void
```

Immediately resets all conversation state (synchronous). Use when unexpected disconnection occurs.

### State Checking Methods

```typescript
isConversationActive(): boolean          // Returns true if CONNECTED
getConnectionState(): string             // Returns current ConnectionState
canSendMessages(): boolean               // Returns true if CONNECTED
getCurrentConversation(): ConversationSession | null
```

**Usage:**
```typescript
if (elevenLabsService.canSendMessages()) {
  await session.setVolume({ volume: 0.9 });
} else {
  console.log('Cannot send - not connected');
}
```

---

## Error Handling

### Error Types

```typescript
interface ElevenLabsError extends Error {
  status?: number;   // HTTP status code
  code?: string;     // Error code
  details?: any;     // Additional error context
}
```

### Status Code Mapping

The service automatically enriches errors with context:

- **401**: "Invalid API key or unauthorized access"
- **400**: "Invalid request parameters"
- **429**: "Rate limit exceeded. Please try again later."
- **500+**: "Backend server error or service unavailable"

### Error Handling Pattern

All public methods use `handleError()` internally:

```typescript
try {
  const result = await elevenLabsService.generateSpeech(text);
  // Handle success
} catch (error) {
  // Error is an ElevenLabsError with context
  console.error(error.message);
  console.error('Status:', error.status);
  console.error('Details:', error.details);
}
```

### Validation

#### Text Validation

```typescript
private validateText(text: string): void
```

**Validates:**
- Text is not empty or whitespace-only
- Text length ≤ 5000 characters (ElevenLabs API limit)

**Throws:** Error with descriptive message if validation fails

---

## Logging

All operations are logged using the structured logger:

```typescript
import { serviceLogger } from '@/src/utils/logger';

serviceLogger.elevenlabs.call('Starting conversation', { agentId });
serviceLogger.elevenlabs.error(error, { context: 'generateSpeech' });
```

**Log Categories:**
- `call` - Informational events (connection, state changes)
- `error` - Error conditions with context

---

## Best Practices

### 1. Use Appropriate TTS Method

| Use Case | Method | Reason |
|----------|--------|--------|
| Short text (< 500 chars) | `generateSpeech()` | Simple, buffered |
| Long text (> 500 chars) | `generateSpeechStream()` | Progressive playback |
| Story narration | `generateStoryPromptSpeech()` | Pre-optimized settings |

### 2. Implement Audio Caching

**Problem:** TTS generation is costly (API credits) and slow (1-3s latency).

**Solution:**
```typescript
// Cache key: storyId-pageIndex or content hash
const cacheKey = `${storyId}-${pageIndex}`;
const cachedAudio = audioCache.get(cacheKey);

if (cachedAudio) {
  return cachedAudio;
}

const result = await elevenLabsService.generateSpeech(text);
audioCache.set(cacheKey, result.audio);
return result.audio;
```

**See:** `docs/vocal-narration.md` section 1.3 for cache implementation details.

### 3. Handle Rate Limits

```typescript
async function generateWithRetry(text: string, maxRetries = 3) {
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      return await elevenLabsService.generateSpeech(text);
    } catch (error) {
      if (error.status === 429) {
        // Exponential backoff
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        attempt++;
      } else {
        throw error;
      }
    }
  }

  throw new Error('Max retries exceeded');
}
```

### 4. Manage Conversation State

```typescript
// Always check state before operations
if (!elevenLabsService.isConversationActive()) {
  await elevenLabsService.startConversationAgent(callbacks);
}

// Always cleanup on component unmount
useEffect(() => {
  return () => {
    elevenLabsService.endConversationAgent();
  };
}, []);
```

### 5. Optimize Voice Settings

**For storytelling (narrative):**
```typescript
{
  stability: 0.7,           // Consistent tone
  similarity_boost: 0.8,    // High fidelity
  style: 0.2,               // Slight expression
  use_speaker_boost: true
}
```

**For dialogue (character voices):**
```typescript
{
  stability: 0.5,           // More variation
  similarity_boost: 0.75,
  style: 0.5,               // More expressive
  use_speaker_boost: true
}
```

**For educational content:**
```typescript
{
  stability: 0.8,           // Very consistent
  similarity_boost: 0.7,
  style: 0.0,               // Neutral
  use_speaker_boost: true
}
```

### 6. Timeout Management

The service uses a default 30-second timeout for API requests:

```typescript
const DEFAULT_TIMEOUT_MS = 30000;
```

For long text generation, this may need adjustment:

```typescript
// Internal method uses timeout parameter
private async makeApiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
  timeout: number = DEFAULT_TIMEOUT_MS
)
```

**Custom timeout for long requests:**
```typescript
// Note: Currently not exposed in public API
// Consider extending service if needed for specific use cases
```

### 7. Pre-load Next Audio

For paginated content (like stories), pre-load the next page audio:

```typescript
async function preloadNextPage(currentPageIndex: number) {
  const nextPageIndex = currentPageIndex + 1;

  if (nextPageIndex < totalPages) {
    const nextPageText = getPageText(nextPageIndex);
    const cacheKey = `story-${nextPageIndex}`;

    // Pre-generate in background
    elevenLabsService.generateSpeech(nextPageText)
      .then(result => audioCache.set(cacheKey, result.audio))
      .catch(error => console.error('Pre-load failed:', error));
  }
}
```

### 8. Memory Management

**Cleanup audio buffers when no longer needed:**

```typescript
// When navigating away from audio playback
useEffect(() => {
  return () => {
    // Stop playback
    audioPlayer.stop();

    // Release audio buffer
    audioBuffer = null;

    // End conversation if active
    if (elevenLabsService.isConversationActive()) {
      elevenLabsService.endConversationAgent();
    }
  };
}, []);
```

### 9. Graceful Degradation

**Handle TTS service unavailability:**

```typescript
async function generateSpeechWithFallback(text: string) {
  try {
    return await elevenLabsService.generateSpeech(text);
  } catch (error) {
    if (error.status >= 500) {
      // Service unavailable - show user-friendly error
      throw new Error('Voice narration is temporarily unavailable. Please try again later.');
    }
    throw error;
  }
}
```

### 10. Monitor API Usage

**Track character usage to manage costs:**

```typescript
let characterUsage = 0;

async function generateWithTracking(text: string) {
  characterUsage += text.length;
  console.log(`ElevenLabs usage: ${characterUsage} characters`);

  return await elevenLabsService.generateSpeech(text);
}
```

---

## Extending Functionality

### Adding New TTS Features

**Example: Add custom pronunciation dictionary support**

1. **Update type definition** (`types/elevenlabs.ts`):
```typescript
export interface TextToSpeechOptions {
  // ... existing fields
  pronunciation_dictionary_locators?: Array<{
    pronunciation_dictionary_id: string;
    version_id: string;
  }>;
}
```

2. **Add method to service** (`services/elevenLabsService.ts`):
```typescript
async generateSpeechWithPronunciation(
  text: string,
  dictionaryId: string,
  versionId: string
): Promise<AudioGenerationResult> {
  return this.generateSpeech(text, undefined, {
    pronunciation_dictionary_locators: [{
      pronunciation_dictionary_id: dictionaryId,
      version_id: versionId
    }]
  });
}
```

3. **Update backend route** (if needed):
```php
// Add to ElevenLabs conversation route group in routes/api.php
Route::post('/tts-with-pronunciation', [ElevenLabsController::class, 'textToSpeechWithPronunciation']);
```

### Adding Agent Tools

To enable custom tools for Conversational Agents:

1. **Define tool in ElevenLabs dashboard**
2. **Handle tool calls in message callback:**

```typescript
const session = await elevenLabsService.startConversationAgent({
  onMessage: (message) => {
    if (message.client_tool_call) {
      const { tool_name, tool_call_id, parameters } = message.client_tool_call;

      // Execute custom tool
      const result = await executeTool(tool_name, parameters);

      // Send result back to agent
      // Note: Tool result sending not yet implemented in service
      // Would require extension of ConversationSession interface
    }
  }
});
```

3. **Extend ConversationSession interface:**

```typescript
interface ConversationSession {
  // ... existing methods
  sendToolResult: (toolCallId: string, result: any) => Promise<void>;
}
```

### Supporting New Models

When ElevenLabs releases new models:

1. **Update model list** (`services/elevenLabsService.ts`):
```typescript
getModels(): string[] {
  return [
    "eleven_multilingual_v2",
    "eleven_flash_v2_5",
    "eleven_turbo_v2_5",
    "eleven_new_model_v3"  // Add new model
  ];
}
```

2. **Test with new model:**
```typescript
const result = await elevenLabsService.generateSpeech(
  "Test with new model",
  undefined,
  { model_id: "eleven_new_model_v3" }
);
```

3. **Update documentation** with model capabilities and use cases.

---

## Testing Strategies

### Unit Testing TTS

```typescript
import elevenLabsService from '@/services/elevenLabsService';

describe('ElevenLabsService TTS', () => {
  it('should generate speech for valid text', async () => {
    const result = await elevenLabsService.generateSpeech('Test speech');
    expect(result.audio).toBeDefined();
    expect(result.audio.length).toBeGreaterThan(0);
  });

  it('should reject empty text', async () => {
    await expect(
      elevenLabsService.generateSpeech('')
    ).rejects.toThrow('Text cannot be empty');
  });

  it('should reject text over 5000 characters', async () => {
    const longText = 'a'.repeat(5001);
    await expect(
      elevenLabsService.generateSpeech(longText)
    ).rejects.toThrow('Text is too long');
  });
});
```

### Integration Testing Conversations

```typescript
describe('ElevenLabsService Conversation', () => {
  it('should start and end conversation', async () => {
    const onConnect = jest.fn();
    const onDisconnect = jest.fn();

    const session = await elevenLabsService.startConversationAgent({
      onConnect,
      onDisconnect
    });

    await new Promise(resolve => setTimeout(resolve, 1000));
    expect(onConnect).toHaveBeenCalled();

    await session.endSession();
    expect(onDisconnect).toHaveBeenCalled();
  });
});
```

---

## Troubleshooting

### Common Issues

#### 1. "Invalid API key or unauthorized access"

**Cause:** Missing or incorrect ElevenLabs API key in backend.

**Solution:**
- Verify `.env` file in Laravel backend contains valid `ELEVENLABS_API_KEY`
- Check API key permissions in ElevenLabs dashboard

#### 2. "Failed to fetch signed URL"

**Cause:** Backend `/conversation/sdk-credentials` endpoint not responding.

**Solution:**
- Verify Laravel backend is running
- Check network connectivity
- Verify `agentId` is correct
- Check backend logs for errors

#### 3. "WebSocket connection failed"

**Cause:** Network issues or invalid signed URL.

**Solution:**
- Check internet connectivity
- Verify signed URL hasn't expired (30-minute TTL)
- Check browser console for WebSocket errors
- Try restarting conversation

#### 4. "Rate limit exceeded"

**Cause:** Too many requests to ElevenLabs API.

**Solution:**
- Implement exponential backoff retry logic
- Add aggressive audio caching
- Reduce concurrent TTS requests
- Upgrade ElevenLabs plan if needed

#### 5. Audio quality issues

**Cause:** Suboptimal voice settings or wrong model.

**Solution:**
- Use `eleven_multilingual_v2` for best quality
- Adjust voice settings (increase stability for consistency)
- Try different voices from `getVoices()`
- Use `generateStoryPromptSpeech()` for pre-optimized settings

---

## Performance Optimization

### 1. Reduce TTS Latency

```typescript
// Use Flash model for real-time requirements
const result = await elevenLabsService.generateSpeech(
  text,
  voiceId,
  { model_id: "eleven_flash_v2_5" }
);
```

### 2. Implement Request Queuing

```typescript
class TtsQueue {
  private queue: Array<() => Promise<any>> = [];
  private processing = false;

  async add(request: () => Promise<any>) {
    this.queue.push(request);
    if (!this.processing) {
      await this.process();
    }
  }

  private async process() {
    this.processing = true;
    while (this.queue.length > 0) {
      const request = this.queue.shift();
      await request();
    }
    this.processing = false;
  }
}
```

### 3. Batch Pre-generation

For known content (like static story pages), pre-generate all audio:

```typescript
async function pregenerateStoryAudio(storyPages: string[]) {
  const results = await Promise.all(
    storyPages.map((text, index) =>
      elevenLabsService.generateSpeech(text)
        .then(result => ({ index, audio: result.audio }))
    )
  );

  results.forEach(({ index, audio }) => {
    audioCache.set(`story-${index}`, audio);
  });
}
```

---

## Security Considerations

### 1. API Key Protection

**Never expose API keys in frontend:**
- Always route through Laravel backend
- Store keys in `.env` file (never commit)
- Use environment-specific keys (dev, staging, prod)

### 2. Rate Limiting

Implement client-side rate limiting to prevent abuse:

```typescript
class RateLimiter {
  private requests: number[] = [];
  private maxRequests = 10;
  private windowMs = 60000; // 1 minute

  canMakeRequest(): boolean {
    const now = Date.now();
    this.requests = this.requests.filter(time => now - time < this.windowMs);
    return this.requests.length < this.maxRequests;
  }

  recordRequest() {
    this.requests.push(Date.now());
  }
}
```

### 3. Input Validation

Always validate user input before sending to TTS:

```typescript
function sanitizeText(text: string): string {
  // Remove potentially harmful content
  return text
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .trim();
}

const sanitized = sanitizeText(userInput);
await elevenLabsService.generateSpeech(sanitized);
```

---

## References

### Official Documentation
- [ElevenLabs API Reference](https://elevenlabs.io/docs/api-reference)
- [ElevenLabs Agents Documentation](https://elevenlabs.io/docs/eleven-agents)
- [Text-to-Speech Guide](https://elevenlabs.io/docs/text-to-speech)
- [Voice Library](https://elevenlabs.io/voice-library)

### Project Files
- `services/elevenLabsService.ts` - Main service implementation
- `types/elevenlabs.ts` - TypeScript type definitions
- `docs/vocal-narration.md` - Narration feature implementation plan
- `components/ConversationInterface/ConversationInterface.tsx` - Agent usage example

### Related Services
- Together AI (`services/storyGenerationService.ts`) - Story generation

---

## FAQ

### Q: Should I use the SDK client or Laravel backend path?

**A:** The service automatically chooses:
- **SDK path**: Used for Conversational Agents (WebSocket required)
- **Laravel path**: Used for TTS (centralized key management)

Both paths work for TTS, but Laravel provides better monitoring.

### Q: How do I change the default voice?

```typescript
elevenLabsService.setDefaultVoice("your-voice-id");
```

Or pass voiceId to individual methods.

### Q: Can I use multiple voices in one conversation?

Not currently supported for Conversational Agents. The agent's voice is configured in the ElevenLabs dashboard.

For TTS, you can change voices per request:

```typescript
const narration = await elevenLabsService.generateSpeech(text, "56AoDkrOh6qfVPDXZ7Pt"); // Cassidy
const dialogue = await elevenLabsService.generateSpeech(quote, "another-voice-id"); // Different character
```

### Q: How do I handle long-running conversations?

Monitor connection state and implement reconnection logic:

```typescript
const session = await elevenLabsService.startConversationAgent({
  onDisconnect: async () => {
    console.log('Disconnected, attempting reconnect...');
    await elevenLabsService.startConversationAgent(callbacks);
  },

  onError: async (error) => {
    console.error('Error:', error);
    // Implement exponential backoff reconnection
  }
});
```

### Q: What's the maximum text length for TTS?

**5000 characters** per request (enforced by `validateText()`).

For longer content, split into chunks:

```typescript
function chunkText(text: string, maxLength: number = 4900): string[] {
  const chunks: string[] = [];
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];

  let currentChunk = '';
  for (const sentence of sentences) {
    if ((currentChunk + sentence).length > maxLength) {
      chunks.push(currentChunk.trim());
      currentChunk = sentence;
    } else {
      currentChunk += sentence;
    }
  }

  if (currentChunk) chunks.push(currentChunk.trim());
  return chunks;
}

const chunks = chunkText(longText);
const audioResults = await Promise.all(
  chunks.map(chunk => elevenLabsService.generateSpeech(chunk))
);
```

---

## Contributing

When extending ElevenLabs functionality:

1. **Update type definitions** in `types/elevenlabs.ts`
2. **Add methods** to `services/elevenLabsService.ts`
3. **Update backend** if Laravel fallback is needed
4. **Write tests** for new functionality
5. **Update this documentation** with usage examples
6. **Log all operations** using `serviceLogger.elevenlabs`
7. **Follow existing patterns** (dual-path support, error handling)

---

## Changelog

### Current Implementation
- Text-to-Speech with SDK and Laravel backend paths
- Streaming TTS support
- Story-optimized voice settings
- Conversational AI Agent integration
- WebSocket connection management
- Graceful shutdown with timeout
- Comprehensive error handling
- Structured logging

### Planned Enhancements
- Tool calling support for Agents
- Voice cloning integration
- Audio effects and post-processing
- Multi-voice conversation support
- Enhanced caching strategies
- Request queuing and prioritization

---

**Last Updated:** February 2026
**Maintainer:** StoryWriter Development Team
