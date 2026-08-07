import { renderHook, act } from '@testing-library/react-native';
import ElevenLabsService from '@/services/elevenLabsService';
import { TranscriptProcessor } from '@/src/utils/transcriptProcessor';
import { useErrorStore } from '@/src/stores/errorStore';
import { ChildFriendlyErrors } from '@/src/utils/errorHandler';
import {
  useConversation,
  CONVERSATION_ERROR_KEY,
  END_CONVERSATION_TOOL_NAMES,
} from '../useConversation';

// Mock dependencies BEFORE importing useConversation
jest.mock('@/services/elevenLabsService');
jest.mock('@/src/utils/transcriptProcessor');
jest.mock('@/src/utils/analytics');

let mockGenerateStoryAutomatically = jest.fn().mockResolvedValue(undefined);

jest.mock('@/src/stores/storyStore', () => ({
  useStoryStore: jest.fn((selector: (store: { generateStoryAutomatically: jest.Mock }) => unknown) => {
    return selector({ generateStoryAutomatically: mockGenerateStoryAutomatically });
  }),
}));

// Create a mock store config that can be updated per test
let mockStoreConfig = {
  phase: 'IDLE',
  startConversation: jest.fn(),
  endConversation: jest.fn(),
  resetConversation: jest.fn(),
};

// conversation store with configurable behavior
jest.mock('@/src/stores/conversationStore', () => ({
  useConversationStore: jest.fn((selector: (store: {
    phase: string;
    startConversation: jest.Mock;
    endConversation: jest.Mock;
    resetConversation: jest.Mock;
  }) => unknown) => {
    return selector(mockStoreConfig);
  }),
}));

describe('useConversation', () => {
  let mockStartConversationAgent: jest.Mock;

  const setStoreConfig = (overrides: Partial<typeof mockStoreConfig> = {}) => {
    mockStoreConfig = {
      phase: overrides.phase ?? 'IDLE',
      startConversation: overrides.startConversation ?? jest.fn(),
      endConversation: overrides.endConversation ?? jest.fn(),
      resetConversation: overrides.resetConversation ?? jest.fn(),
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Reset store config to defaults
    setStoreConfig();

    // The conversation error is shared state; start each test with none
    useErrorStore.setState({ errors: {} });

    // Reset story store mock
    mockGenerateStoryAutomatically = jest.fn().mockResolvedValue(undefined);

    // Mock ElevenLabsService
    mockStartConversationAgent = jest.fn();
    (ElevenLabsService as unknown as Record<string, jest.Mock>).startConversationAgent = mockStartConversationAgent;
    (ElevenLabsService as unknown as Record<string, jest.Mock>).forceCleanup = jest.fn();

    // Mock transcript processor
    (TranscriptProcessor.validateAndProcess as jest.Mock).mockReturnValue(
      'User: Hello\nAgent: Hi there'
    );
    (TranscriptProcessor.processTranscript as jest.Mock).mockReturnValue(
      'User: Hello\nAgent: Hi there'
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('startConversation', () => {
    it('should initialize conversation session when called', async () => {
      const mockSession = {
        endSession: jest.fn().mockResolvedValue(undefined),
        conversation: { conversationId: 'test-123' },
      };
      mockStartConversationAgent.mockResolvedValue(mockSession);

      const { result } = renderHook(() => useConversation());

      await act(async () => {
        result.current.startConversation();
      });

      expect(mockStartConversationAgent).toHaveBeenCalled();
    });

    it('should not start if already connecting', async () => {
      const mockSession = {
        endSession: jest.fn().mockResolvedValue(undefined),
      };
      mockStartConversationAgent.mockResolvedValue(mockSession);

      const { result } = renderHook(() => useConversation());

      // First call
      await act(async () => {
        result.current.startConversation();
      });

      // Try second call immediately
      act(() => {
        result.current.startConversation();
      });

      // Should only call once
      expect(mockStartConversationAgent).toHaveBeenCalledTimes(1);
    });

    // --- Card #87: a failed conversation has to be visible ------------------
    // These used to pass with the error going nowhere but Alert.alert, which is
    // an empty function on the web build. Now it lands in the shared error
    // store, which is what the UI renders from.

    it('files a child-friendly error when the conversation fails to start', async () => {
      mockStartConversationAgent.mockRejectedValue(new Error('Connection failed'));

      const { result } = renderHook(() => useConversation());

      await act(async () => {
        result.current.startConversation();
      });

      const error = useErrorStore.getState().getError(CONVERSATION_ERROR_KEY);
      expect(error).toBeDefined();
      expect(error?.message).toBe('Connection failed');
      expect(ChildFriendlyErrors.conversation).toContain(error?.userMessage);
    });

    it('drops the conversation back to idle when starting fails', async () => {
      mockStartConversationAgent.mockRejectedValue(new Error('Connection failed'));

      const { result } = renderHook(() => useConversation());

      await act(async () => {
        result.current.startConversation();
      });

      // Without this the screen keeps showing "Listening..." for a conversation
      // that never connected, and the retry button is a no-op.
      expect(mockStoreConfig.resetConversation).toHaveBeenCalled();
    });

    it('files an error and resets when the session reports one mid-connect', async () => {
      const mockSession = { endSession: jest.fn().mockResolvedValue(undefined) };
      mockStartConversationAgent.mockResolvedValue(mockSession);

      const { result } = renderHook(() => useConversation());

      await act(async () => {
        result.current.startConversation();
      });

      const { onError } = mockStartConversationAgent.mock.calls[0][0];

      act(() => {
        onError(new Error('WebSocket closed'));
      });

      expect(useErrorStore.getState().getError(CONVERSATION_ERROR_KEY)).toBeDefined();
      expect(mockStoreConfig.resetConversation).toHaveBeenCalled();
      expect(result.current.isConnecting).toBe(false);
    });

    it('clears a previous error when the kid tries again', async () => {
      mockStartConversationAgent.mockRejectedValue(new Error('Connection failed'));

      const { result } = renderHook(() => useConversation());

      await act(async () => {
        result.current.startConversation();
      });
      expect(useErrorStore.getState().getError(CONVERSATION_ERROR_KEY)).toBeDefined();

      mockStartConversationAgent.mockResolvedValue({
        endSession: jest.fn().mockResolvedValue(undefined),
      });

      await act(async () => {
        result.current.startConversation();
      });

      expect(useErrorStore.getState().getError(CONVERSATION_ERROR_KEY)).toBeUndefined();
    });
  });

  describe('message handling', () => {
    it('should capture user and agent messages', async () => {
      const mockSession = {
        endSession: jest.fn().mockResolvedValue(undefined),
      };
      mockStartConversationAgent.mockResolvedValue(mockSession);

      const { result } = renderHook(() => useConversation());

      await act(async () => {
        result.current.startConversation();
      });

      const startCallArgs = mockStartConversationAgent.mock.calls[0][0];
      const onMessage = startCallArgs.onMessage;

      // Simulate user message
      act(() => {
        onMessage({
          type: 'message',
          source: 'user',
          message: 'Tell me a story',
          timestamp: Date.now(),
        });
      });

      expect(result.current.messages).toHaveLength(1);
      expect(result.current.messages[0].role).toBe('user');
      expect(result.current.messages[0].content).toBe('Tell me a story');

      // Simulate agent message
      act(() => {
        onMessage({
          type: 'message',
          source: 'agent',
          message: 'Once upon a time...',
          timestamp: Date.now(),
        });
      });

      expect(result.current.messages).toHaveLength(2);
      expect(result.current.messages[1].role).toBe('agent');
    });

    it('should track speaker transitions with timeouts', async () => {
      const mockSession = {
        endSession: jest.fn().mockResolvedValue(undefined),
      };
      mockStartConversationAgent.mockResolvedValue(mockSession);

      const { result } = renderHook(() => useConversation());

      await act(async () => {
        result.current.startConversation();
      });

      const startCallArgs = mockStartConversationAgent.mock.calls[0][0];
      const onMessage = startCallArgs.onMessage;

      // User speaks
      act(() => {
        onMessage({
          type: 'message',
          source: 'user',
          message: 'Hello',
          timestamp: Date.now(),
        });
      });

      expect(result.current.currentSpeaker).toBe('user');

      // Advance timers to reset speaker
      act(() => {
        jest.advanceTimersByTime(1500);
      });

      expect(result.current.currentSpeaker).toBe('none');
    });

    it('should ignore empty messages', async () => {
      const mockSession = {
        endSession: jest.fn().mockResolvedValue(undefined),
      };
      mockStartConversationAgent.mockResolvedValue(mockSession);

      const { result } = renderHook(() => useConversation());

      await act(async () => {
        result.current.startConversation();
      });

      const startCallArgs = mockStartConversationAgent.mock.calls[0][0];
      const onMessage = startCallArgs.onMessage;

      // Empty message should be ignored
      act(() => {
        onMessage({
          type: 'message',
          source: 'user',
          message: '   ',
          timestamp: Date.now(),
        });
      });

      expect(result.current.messages).toHaveLength(0);

      // Non-empty message should be captured
      act(() => {
        onMessage({
          type: 'message',
          source: 'user',
          message: 'Hello',
          timestamp: Date.now(),
        });
      });

      expect(result.current.messages).toHaveLength(1);
    });
  });

  // --- Card #111: the agent has to be able to end the conversation ----------
  // The end tool used to be watched for on onMessage, where the SDK never
  // sends it. Unregistered, it went to onError instead, so the kid got the
  // error card instead of the story the screen promised them.

  describe('the agent ending the conversation', () => {
    const startWithSession = async () => {
      const mockSession = { endSession: jest.fn().mockResolvedValue(undefined) };
      mockStartConversationAgent.mockResolvedValue(mockSession);

      const { result } = renderHook(() => useConversation());

      await act(async () => {
        result.current.startConversation();
      });

      const startCallArgs = mockStartConversationAgent.mock.calls[0][0];

      // Two user turns, so the transcript is worth generating a story from
      act(() => {
        startCallArgs.onMessage({ source: 'user', message: 'A dragon story' });
        startCallArgs.onMessage({ source: 'ai', message: 'What colour dragon?' });
        startCallArgs.onMessage({ source: 'user', message: 'Green' });
      });

      return { result, mockSession, startCallArgs };
    };

    it.each(END_CONVERSATION_TOOL_NAMES)('registers %s as a client tool', async (toolName) => {
      const { startCallArgs } = await startWithSession();

      expect(typeof startCallArgs.clientTools[toolName]).toBe('function');
    });

    it.each(END_CONVERSATION_TOOL_NAMES)(
      'generates the story when the agent calls %s',
      async (toolName) => {
        const { startCallArgs } = await startWithSession();

        await act(async () => {
          startCallArgs.clientTools[toolName]({});
          jest.advanceTimersByTime(0);
        });

        expect(mockStoreConfig.endConversation).toHaveBeenCalledWith('User: Hello\nAgent: Hi there');

        act(() => {
          jest.advanceTimersByTime(500);
        });

        expect(mockGenerateStoryAutomatically).toHaveBeenCalledWith('User: Hello\nAgent: Hi there');
      }
    );

    it('answers the tool call before hanging up, so the reply reaches the agent', async () => {
      const { mockSession, startCallArgs } = await startWithSession();

      let toolResult: unknown;
      await act(async () => {
        toolResult = await startCallArgs.clientTools.end_conversation({});
      });

      // The SDK sends this back over the socket, so the socket has to still be
      // open at this point.
      expect(typeof toolResult).toBe('string');
      expect(mockSession.endSession).not.toHaveBeenCalled();

      await act(async () => {
        jest.advanceTimersByTime(0);
      });

      expect(mockSession.endSession).toHaveBeenCalled();
    });

    it('keeps the conversation alive when the agent calls a tool we do not have', async () => {
      const { startCallArgs } = await startWithSession();

      act(() => {
        startCallArgs.onUnhandledClientToolCall({
          tool_name: 'send_postcard',
          tool_call_id: 'call-1',
          parameters: {},
        });
      });

      expect(useErrorStore.getState().getError(CONVERSATION_ERROR_KEY)).toBeUndefined();
      expect(mockStoreConfig.resetConversation).not.toHaveBeenCalled();
      expect(mockStoreConfig.endConversation).not.toHaveBeenCalled();
    });
  });

  // --- Card #111, second path: the `end_call` system tool -------------------
  // ElevenLabs support confirmed the agent's real hang-up tool is the *system*
  // tool `end_call`. System tools never reach clientTools — the SDK ends the
  // session itself, so the only place we hear about it is onDisconnect, with
  // reason 'agent'. A deliberate end must produce a story even when the child
  // only spoke once, because the two-turn floor exists for dropped sockets.

  describe('the agent ending the call itself', () => {
    const startWithUserTurns = async (userTurnCount: number) => {
      const mockSession = { endSession: jest.fn().mockResolvedValue(undefined) };
      mockStartConversationAgent.mockResolvedValue(mockSession);

      const { result } = renderHook(() => useConversation());

      await act(async () => {
        result.current.startConversation();
      });

      const startCallArgs = mockStartConversationAgent.mock.calls[0][0];

      act(() => {
        startCallArgs.onMessage({ source: 'ai', message: 'What shall we write about?' });
        for (let i = 0; i < userTurnCount; i++) {
          startCallArgs.onMessage({ source: 'user', message: `Turn ${i + 1}` });
        }
      });

      return { result, mockSession, startCallArgs };
    };

    const AGENT_END = { reason: 'agent', context: { type: 'end_call', reason: 'Agent ended the call' } };

    it('generates the story after one user turn when the agent ended the call', async () => {
      const { startCallArgs } = await startWithUserTurns(1);

      await act(async () => {
        startCallArgs.onDisconnect(AGENT_END);
      });

      expect(mockStoreConfig.endConversation).toHaveBeenCalledWith('User: Hello\nAgent: Hi there');

      // The bypass has to skip validateAndProcess, not just the gate in the
      // hook: that method carries its own two-user-message minimum, so going
      // through it would drop this transcript even though the agent asked for
      // the story.
      expect(TranscriptProcessor.processTranscript).toHaveBeenCalled();
      expect(TranscriptProcessor.validateAndProcess).not.toHaveBeenCalled();

      act(() => {
        jest.advanceTimersByTime(500);
      });

      expect(mockGenerateStoryAutomatically).toHaveBeenCalledWith('User: Hello\nAgent: Hi there');
    });

    it('keeps the two-turn floor when the socket merely dropped', async () => {
      const { startCallArgs } = await startWithUserTurns(1);

      // No details at all is what a plain network drop looks like.
      await act(async () => {
        startCallArgs.onDisconnect(undefined);
      });

      expect(mockStoreConfig.endConversation).not.toHaveBeenCalled();
      expect(mockGenerateStoryAutomatically).not.toHaveBeenCalled();
    });

    it('writes nothing when the agent ends before the child has said anything', async () => {
      const { startCallArgs } = await startWithUserTurns(0);

      await act(async () => {
        startCallArgs.onDisconnect(AGENT_END);
      });

      expect(mockStoreConfig.endConversation).not.toHaveBeenCalled();
      expect(mockGenerateStoryAutomatically).not.toHaveBeenCalled();
    });

    it('does not show the child an error when the agent ends the call', async () => {
      const { startCallArgs } = await startWithUserTurns(1);

      await act(async () => {
        startCallArgs.onDisconnect(AGENT_END);
      });

      expect(useErrorStore.getState().getError(CONVERSATION_ERROR_KEY)).toBeUndefined();
      expect(mockStoreConfig.resetConversation).not.toHaveBeenCalled();
    });
  });

  describe('disconnect handling', () => {
    it('should call endSession when disconnected', async () => {
      const mockSession = {
        endSession: jest.fn().mockResolvedValue(undefined),
      };
      mockStartConversationAgent.mockResolvedValue(mockSession);

      const { result } = renderHook(() => useConversation());

      await act(async () => {
        result.current.startConversation();
      });

      const startCallArgs = mockStartConversationAgent.mock.calls[0][0];
      const onDisconnect = startCallArgs.onDisconnect;

      // Simulate disconnect
      act(() => {
        onDisconnect();
      });

      expect(mockSession.endSession).not.toHaveBeenCalled(); // Session is already cleaned up
    });
  });

  describe('cleanup', () => {
    it('should initialize hook successfully', async () => {
      const mockSession = {
        endSession: jest.fn().mockResolvedValue(undefined),
        conversation: { conversationId: 'test-123' },
      };
      mockStartConversationAgent.mockResolvedValue(mockSession);

      const { result } = renderHook(() => useConversation());

      // Hook should initialize with default values
      expect(result.current.isConnecting).toBe(false);
      expect(result.current.isActive).toBe(false);
      expect(result.current.messages).toHaveLength(0);
      expect(result.current.currentSpeaker).toBe('none');
    });
  });

  describe('endConversation', () => {
    it('should process transcript when ending with sufficient messages', async () => {
      const mockSession = {
        endSession: jest.fn().mockResolvedValue(undefined),
      };
      mockStartConversationAgent.mockResolvedValue(mockSession);

      const { result } = renderHook(() => useConversation());

      await act(async () => {
        result.current.startConversation();
      });

      const startCallArgs = mockStartConversationAgent.mock.calls[0][0];
      const onMessage = startCallArgs.onMessage;

      // Simulate messages
      act(() => {
        onMessage({
          type: 'message',
          source: 'user',
          message: 'Hello',
          timestamp: Date.now(),
        });
        onMessage({
          type: 'message',
          source: 'agent',
          message: 'Hi there',
          timestamp: Date.now(),
        });
      });

      // End conversation
      await act(async () => {
        void result.current.endConversation();
      });

      // Verify store's endConversation was called with transcript
      const storeEndConversation = mockStoreConfig.endConversation as jest.Mock;
      expect(storeEndConversation).toHaveBeenCalledWith('User: Hello\nAgent: Hi there');
    });

    it('should not process when ending without sufficient messages', async () => {
      const mockSession = {
        endSession: jest.fn().mockResolvedValue(undefined),
      };
      mockStartConversationAgent.mockResolvedValue(mockSession);

      const { result } = renderHook(() => useConversation());

      await act(async () => {
        result.current.startConversation();
      });

      // End conversation without messages
      await act(async () => {
        void result.current.endConversation();
      });

      // Should not be called since there are no messages
      const storeEndConversation = mockStoreConfig.endConversation as jest.Mock;
      expect(storeEndConversation).not.toHaveBeenCalled();
    });
  });

  describe('skipConversation', () => {
    it('should call store endConversation with the provided preset transcript', async () => {
      const { result } = renderHook(() => useConversation());
      const presetTranscript = 'User: I want a dragon story\n\nAgent: What kind of dragon?';

      await act(async () => {
        result.current.skipConversation(presetTranscript);
      });

      const storeEndConversation = mockStoreConfig.endConversation as jest.Mock;
      expect(storeEndConversation).toHaveBeenCalledWith(presetTranscript);
    });

    it('should schedule story generation with the provided transcript', async () => {
      const { result } = renderHook(() => useConversation());
      const presetTranscript = 'User: I want a dragon story\n\nAgent: What kind of dragon?';

      await act(async () => {
        result.current.skipConversation(presetTranscript);
      });

      act(() => {
        jest.advanceTimersByTime(500);
      });

      expect(mockGenerateStoryAutomatically).toHaveBeenCalledWith(presetTranscript);
    });

    it('should end any active session before using the preset transcript', async () => {
      const mockSession = {
        endSession: jest.fn().mockResolvedValue(undefined),
        conversation: { conversationId: 'test-456' },
      };
      mockStartConversationAgent.mockResolvedValue(mockSession);

      const { result } = renderHook(() => useConversation());

      await act(async () => {
        result.current.startConversation();
      });

      await act(async () => {
        result.current.skipConversation('User: Skip me\n\nAgent: Skipping!');
      });

      expect(mockSession.endSession).toHaveBeenCalled();
    });
  });

  describe('integration', () => {
    it('should handle complete conversation flow from start to end', async () => {
      const mockSession = {
        endSession: jest.fn().mockResolvedValue(undefined),
      };
      mockStartConversationAgent.mockResolvedValue(mockSession);

      const { result } = renderHook(() => useConversation());

      // Start conversation
      await act(async () => {
        result.current.startConversation();
      });

      expect(mockStartConversationAgent).toHaveBeenCalled();

      const startCallArgs = mockStartConversationAgent.mock.calls[0][0];
      const onMessage = startCallArgs.onMessage;
      const onConnect = startCallArgs.onConnect;

      // Simulate connection
      act(() => {
        onConnect();
      });

      // Simulate messages
      act(() => {
        onMessage({
          type: 'message',
          source: 'user',
          message: 'Tell me a story',
          timestamp: Date.now(),
        });
        onMessage({
          type: 'message',
          source: 'agent',
          message: 'Once upon a time',
          timestamp: Date.now(),
        });
      });

      expect(result.current.messages).toHaveLength(2);

      // End conversation
      await act(async () => {
        void result.current.endConversation();
      });

      // Verify store's endConversation was called
      const storeEndConversation = mockStoreConfig.endConversation as jest.Mock;
      expect(storeEndConversation).toHaveBeenCalled();
      expect(mockSession.endSession).toHaveBeenCalled();
    });
  });
});
