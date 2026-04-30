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
  });
});
