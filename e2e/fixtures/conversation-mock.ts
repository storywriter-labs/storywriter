import type { Page, WebSocketRoute } from '@playwright/test';

/**
 * The ElevenLabs conversation, mocked at the WebSocket.
 *
 * The app doesn't open this socket itself — `@elevenlabs/client` does, from the
 * signed URL the backend hands back (see `services/elevenLabsService.ts`). So
 * there is no seam in our own code to mock: the only way to drive a real
 * conversation in a test is to answer the socket the SDK opens, speaking the
 * events it expects. That's what this does, with `page.routeWebSocket`, so the
 * SDK, its audio worklets and the app's `useConversation` hook all run for real
 * and nothing reaches ElevenLabs.
 *
 * The handshake the SDK waits for is one message: the SDK sends its overrides
 * on open, and won't resolve `startSession` until the first message back is
 * `conversation_initiation_metadata`. Everything after that is the agent
 * talking, which tests drive by hand.
 */

/**
 * The signed URL the mocked `POST /conversation/sdk-credentials` hands back.
 * The host is never resolved — `routeWebSocket` intercepts it in the page — but
 * it has to look like the real thing so the SDK's URL handling behaves the same.
 */
export const SIGNED_URL =
  'wss://api.elevenlabs.io/v1/convai/conversation?agent_id=e2e-agent&token=e2e-signed-url';

/** Matches the signed URL above, whatever query string the SDK appends to it. */
const SIGNED_URL_GLOB = '**/v1/convai/conversation**';

/**
 * Audio format for both directions. 16 kHz PCM keeps the browser's AudioContext
 * at the rate the SDK asks for, which is what stops it reaching out to a CDN for
 * the libsamplerate worklet it would otherwise need to resample.
 */
const AUDIO_FORMAT = 'pcm_16000';

export interface ConversationMockOptions {
  /** Answers as the conversation id. Read back by `session.getId()`. */
  conversationId?: string;
  /**
   * Drop the socket instead of completing the handshake, which is what the app
   * sees when the signed URL is stale or ElevenLabs is unreachable.
   */
  failHandshake?: boolean;
}

export class ConversationMock {
  private route: WebSocketRoute | null = null;
  private connectedResolvers: (() => void)[] = [];
  /** Everything the app sent us, parsed, in order. */
  readonly sent: Record<string, unknown>[] = [];

  constructor(private readonly options: ConversationMockOptions = {}) {}

  /** True once the SDK has opened the socket. */
  get isConnected(): boolean {
    return this.route !== null;
  }

  /** Install the interceptor. Must happen before the first `page.goto`. */
  async install(page: Page): Promise<void> {
    await page.routeWebSocket(SIGNED_URL_GLOB, (route) => {
      if (this.options.failHandshake) {
        // 1006-style abnormal close, i.e. what a stale signed URL looks like.
        route.close({ code: 1011, reason: 'e2e: handshake refused' });
        return;
      }

      this.route = route;

      route.onMessage((message) => {
        try {
          this.sent.push(JSON.parse(String(message)));
        } catch {
          // Audio frames from the microphone worklet are not JSON. They are
          // the bulk of what the app sends and nothing here asserts on them.
        }
      });

      route.onClose(() => {
        this.route = null;
      });

      // The SDK sends its overrides on open and then waits for exactly this.
      this.send({
        type: 'conversation_initiation_metadata',
        conversation_initiation_metadata_event: {
          conversation_id: this.options.conversationId ?? 'e2e-conversation-id',
          agent_output_audio_format: AUDIO_FORMAT,
          user_input_audio_format: AUDIO_FORMAT,
        },
      });

      const resolvers = this.connectedResolvers;
      this.connectedResolvers = [];
      resolvers.forEach((resolve) => resolve());
    });
  }

  /** Wait for the SDK to open the socket, so a test can start talking. */
  async waitForConnection(): Promise<void> {
    if (this.route) return;
    await new Promise<void>((resolve) => this.connectedResolvers.push(resolve));
  }

  /** What the agent said. Reaches the app as an `ai` message. */
  agentSays(text: string, eventId = this.nextEventId()): this {
    return this.send({
      type: 'agent_response',
      agent_response_event: { agent_response: text, event_id: eventId },
    });
  }

  /** What the child said, as ElevenLabs transcribed it. */
  userSays(text: string, eventId = this.nextEventId()): this {
    return this.send({
      type: 'user_transcript',
      user_transcription_event: { user_transcript: text, event_id: eventId },
    });
  }

  /**
   * The agent calling the `end_conversation` client tool, which is how it says
   * "I have enough, write the story". See `useConversation.ts`.
   */
  callsEndConversation(toolName = 'end_conversation'): this {
    return this.send({
      type: 'client_tool_call',
      client_tool_call: {
        tool_name: toolName,
        tool_call_id: 'e2e-tool-call-1',
        parameters: {},
      },
    });
  }

  /** Hang up from the far end, the way a dropped connection would. */
  disconnect(code = 1000, reason = 'e2e: agent hung up'): void {
    this.route?.close({ code, reason });
    this.route = null;
  }

  /** Send a raw protocol event, for anything the helpers above don't cover. */
  send(event: Record<string, unknown>): this {
    if (!this.route) {
      throw new Error('The conversation socket is not open. Await waitForConnection() first.');
    }
    this.route.send(JSON.stringify(event));
    return this;
  }

  private eventId = 0;

  private nextEventId(): number {
    this.eventId += 1;
    return this.eventId;
  }
}
