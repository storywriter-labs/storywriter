import React from 'react';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react-native';

import ConversationInterface from '@/components/ConversationInterface/ConversationInterface';
import { useConversation, CONVERSATION_ERROR_KEY } from '@/src/hooks/useConversation';
import { useErrorStore } from '@/src/stores/errorStore';
import { ErrorHandler, ErrorType, ErrorSeverity } from '@/src/utils/errorHandler';

// ---------------------------------------------------------------------------
// Component tests for the conversation error view (Fizzy card #87).
//
// A conversation failure used to go to Alert.alert, which react-native-web
// implements as an empty function — so on the web build a kid whose
// conversation dropped out saw nothing at all. The failure now lands in the
// shared error store and this component renders it. These tests cover the
// screen's real configuration (hideButtons), where the card is otherwise not
// rendered at all.
// ---------------------------------------------------------------------------

jest.mock('@/src/hooks/useConversation', () => ({
    ...jest.requireActual('@/src/hooks/useConversation'),
    useConversation: jest.fn(),
}));

// Keep the conversation off the network — only the error view is under test.
jest.mock('@/services/elevenLabsService', () => ({
    __esModule: true,
    default: {
        startConversationAgent: jest.fn(),
        forceCleanup: jest.fn(),
    },
}));

// The conversation store is auto-mocked in jest.setup.js; give it a phase.
let mockPhase = 'IDLE';
jest.mock('@/src/stores/conversationStore', () => ({
    useConversationStore: jest.fn((selector: (store: Record<string, unknown>) => unknown) =>
        selector({
            phase: mockPhase,
            endConversation: jest.fn(),
        })
    ),
}));

const mockStartConversation = jest.fn();

const useConversationMock = useConversation as jest.Mock;

const setConversation = (overrides: Record<string, unknown> = {}) => {
    useConversationMock.mockReturnValue({
        startConversation: mockStartConversation,
        endConversation: jest.fn(),
        skipConversation: jest.fn(),
        messages: [],
        currentSpeaker: 'none',
        isConnecting: false,
        isActive: false,
        ...overrides,
    });
};

const seedConversationError = (userMessage: string) => {
    useErrorStore.setState({
        errors: {
            [CONVERSATION_ERROR_KEY]: {
                ...ErrorHandler.fromUnknown(
                    new Error('WebSocket closed'),
                    ErrorType.CONVERSATION,
                    ErrorSeverity.MEDIUM
                ),
                userMessage,
            },
        },
    });
};

describe('ConversationInterface – conversation errors (card #87)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockPhase = 'IDLE';
        useErrorStore.setState({ errors: {} });
        setConversation();
    });

    afterEach(() => {
        cleanup();
    });

    it('renders nothing on an idle screen with no error', () => {
        render(<ConversationInterface hideButtons />);

        expect(screen.queryByTestId('conversation-error')).toBeNull();
    });

    it('shows the failure message even when the buttons are hidden', () => {
        seedConversationError('The connection sprites are being silly!');

        render(<ConversationInterface hideButtons />);

        expect(screen.getByTestId('conversation-error')).toBeTruthy();
        expect(screen.getByText('The connection sprites are being silly!')).toBeTruthy();
    });

    it('offers a retry that starts the conversation again', () => {
        seedConversationError('Our story friend needs a moment to wake up!');

        render(<ConversationInterface hideButtons />);
        fireEvent.press(screen.getByTestId('conversation-error-retry'));

        expect(mockStartConversation).toHaveBeenCalled();
    });

    it('hides the message once a new attempt clears the error', () => {
        seedConversationError('The connection sprites are being silly!');

        render(<ConversationInterface hideButtons />);
        expect(screen.getByTestId('conversation-error')).toBeTruthy();

        act(() => {
            useErrorStore.getState().removeError(CONVERSATION_ERROR_KEY);
        });

        expect(screen.queryByTestId('conversation-error')).toBeNull();
    });
});
