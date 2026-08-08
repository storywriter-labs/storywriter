import client from '@/src/api/client';

// Mock the axios client
jest.mock('@/src/api/client', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
    get: jest.fn(),
  },
}));

// Mock the ElevenLabs SDK
jest.mock('@elevenlabs/client', () => ({
  Conversation: {
    startSession: jest.fn(),
  },
}));

// Mock the logger
jest.mock('@/src/utils/logger', () => ({
  serviceLogger: {
    elevenlabs: {
      call: jest.fn(),
      error: jest.fn(),
    },
  },
}));

import { ElevenLabsService } from '../elevenLabsService';

describe('ElevenLabsService', () => {
  let service: ElevenLabsService;

  beforeEach(() => {
    service = new ElevenLabsService();
    jest.clearAllMocks();
  });

  describe('startConversationAgent', () => {
    it('calls POST /conversation/sdk-credentials (not GET)', async () => {
      (client.post as jest.Mock).mockResolvedValue({
        data: { signed_url: 'wss://api.elevenlabs.io/v1/convai/conversation?signature=abc' },
      });

      const { Conversation } = require('@elevenlabs/client');
      Conversation.startSession.mockResolvedValue({
        endSession: jest.fn(),
        getId: () => 'session-123',
      });

      await service.startConversationAgent();

      expect(client.post).toHaveBeenCalledWith('/conversation/sdk-credentials');
      expect(client.get).not.toHaveBeenCalled();
    });

    it('throws when signed_url is missing from response', async () => {
      (client.post as jest.Mock).mockResolvedValue({
        data: {},
      });

      await expect(service.startConversationAgent()).rejects.toThrow();
    });

    it('throws on network error', async () => {
      (client.post as jest.Mock).mockRejectedValue(new Error('Network Error'));

      await expect(service.startConversationAgent()).rejects.toThrow();
    });

    // The agent's `end_call` is a system tool: the SDK closes the session itself
    // and the only sign of it is `reason: 'agent'` on these details. Dropping
    // them here made a deliberate end look like a dropped socket, which is how
    // the story went missing (#111).
    it('passes the SDK disconnect details through to the caller', async () => {
      (client.post as jest.Mock).mockResolvedValue({
        data: { signed_url: 'wss://api.elevenlabs.io/v1/convai/conversation?signature=abc' },
      });

      const { Conversation } = require('@elevenlabs/client');
      let sdkOptions: any;
      Conversation.startSession.mockImplementation(async (options: any) => {
        sdkOptions = options;
        return { endSession: jest.fn(), getId: () => 'session-123' };
      });

      const onDisconnect = jest.fn();
      await service.startConversationAgent({ onDisconnect });

      const details = {
        reason: 'agent',
        context: { type: 'end_call', reason: 'Agent ended the call' },
      };
      sdkOptions.onDisconnect(details);

      expect(onDisconnect).toHaveBeenCalledWith(details);
    });
  });
});
