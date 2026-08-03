import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { Linking } from 'react-native';

import AuthLayout from '../_layout';
import WelcomeScreen from '../welcome';
import { REQUEST_INVITE_URL } from '../../../constants/prerelease';

/**
 * The temporary pre-release gate: production hides sign-up behind
 * "Request Invite", every other build behaves as before. Both halves are
 * covered here because the gate is only useful if *both* hold — the welcome
 * screen hides the entry point, and the layout closes the direct URL.
 */

const mockPush = jest.fn();
let mockSegments: string[] = ['(auth)', 'welcome'];

jest.mock('expo-router', () => {
    const { View } = require('react-native');
    const Stack = ({ children }: { children?: React.ReactNode }) => <View testID="auth-stack">{children}</View>;
    Stack.Screen = () => null;

    return {
        Stack,
        Redirect: ({ href }: { href: string }) => <View testID="redirect" accessibilityLabel={href} />,
        useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
        useSegments: () => mockSegments,
    };
});

// The gate reads Constants at call time, so flipping this between tests is
// enough — no module cache juggling.
let mockGateEnabled = false;
jest.mock('expo-constants', () => ({
    get expoConfig() {
        return { extra: { PRERELEASE_GATE: mockGateEnabled } };
    },
}));

jest.mock('../../../components/BackgroundImage/BackgroundImage', () => {
    const { View } = require('react-native');
    return ({ children }: { children: React.ReactNode }) => <View>{children}</View>;
});

beforeEach(() => {
    jest.clearAllMocks();
    mockGateEnabled = false;
    mockSegments = ['(auth)', 'welcome'];
});

describe('welcome screen with the gate up', () => {
    beforeEach(() => {
        mockGateEnabled = true;
    });

    it('shows the holding message instead of the sign-up call to action', () => {
        const { getByText, queryByTestId } = render(<WelcomeScreen />);

        expect(getByText('StoryWriter is not yet in public release.')).toBeTruthy();
        expect(queryByTestId('welcome-get-started')).toBeNull();
    });

    it('sends "Request Invite" to the Labs request-access page', () => {
        const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);

        const { getByTestId } = render(<WelcomeScreen />);
        fireEvent.press(getByTestId('welcome-request-invite'));

        expect(openURL).toHaveBeenCalledWith(REQUEST_INVITE_URL);
        expect(mockPush).not.toHaveBeenCalled();
    });

    it('keeps the log in link for people who already have an account', () => {
        const { getByTestId } = render(<WelcomeScreen />);

        fireEvent.press(getByTestId('welcome-login-link'));

        expect(mockPush).toHaveBeenCalledWith('/(auth)/login');
    });
});

describe('welcome screen with the gate down', () => {
    it('offers sign-up as before', () => {
        const { getByTestId, queryByTestId } = render(<WelcomeScreen />);

        expect(queryByTestId('welcome-request-invite')).toBeNull();
        fireEvent.press(getByTestId('welcome-get-started'));

        expect(mockPush).toHaveBeenCalledWith('/(auth)/terms');
    });
});

describe('auth layout with the gate up', () => {
    beforeEach(() => {
        mockGateEnabled = true;
    });

    it.each(['terms', 'register'])('redirects /%s back to welcome', (route) => {
        mockSegments = ['(auth)', route];

        const { getByTestId, queryByTestId } = render(<AuthLayout />);

        expect(getByTestId('redirect').props.accessibilityLabel).toBe('/(auth)/welcome');
        expect(queryByTestId('auth-stack')).toBeNull();
    });

    it.each(['welcome', 'login'])('leaves /%s reachable', (route) => {
        mockSegments = ['(auth)', route];

        const { getByTestId, queryByTestId } = render(<AuthLayout />);

        expect(getByTestId('auth-stack')).toBeTruthy();
        expect(queryByTestId('redirect')).toBeNull();
    });
});

describe('auth layout with the gate down', () => {
    it.each(['terms', 'register'])('leaves /%s reachable', (route) => {
        mockSegments = ['(auth)', route];

        const { getByTestId, queryByTestId } = render(<AuthLayout />);

        expect(getByTestId('auth-stack')).toBeTruthy();
        expect(queryByTestId('redirect')).toBeNull();
    });
});
