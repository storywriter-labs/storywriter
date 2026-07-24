import React from 'react';
import { render, waitFor } from '@testing-library/react-native';

import RegisterScreen from '../register';

const mockReplace = jest.fn();
const mockPush = jest.fn();
let mockParams: Record<string, string> = {};

jest.mock('expo-router', () => ({
    useRouter: () => ({ replace: mockReplace, push: mockPush, back: jest.fn() }),
    useLocalSearchParams: () => mockParams,
}));

const mockRegister = jest.fn();
jest.mock('../../../src/context/AuthContext', () => ({
    useAuth: () => ({ register: mockRegister }),
}));

jest.mock('../../../components/BackgroundImage/BackgroundImage', () => {
    const { View } = require('react-native');
    return ({ children }: { children: React.ReactNode }) => <View>{children}</View>;
});

jest.mock('../../../src/utils/analytics', () => ({
    trackEvent: jest.fn(),
    AnalyticsEvents: {
        REGISTER_STARTED: 'register_started',
        REGISTER_COMPLETED: 'register_completed',
        REGISTER_FAILED: 'register_failed',
    },
}));

beforeEach(() => {
    jest.clearAllMocks();
    mockParams = {};
});

describe('RegisterScreen terms gate', () => {
    it('sends you to the terms screen when you arrive without accepting them', async () => {
        const { queryByPlaceholderText } = render(<RegisterScreen />);

        await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(auth)/terms'));
        // The form must not render, so no account (and no terms_accepted_at
        // record) can be created from this route.
        expect(queryByPlaceholderText('Your Name')).toBeNull();
    });

    it('renders the form when the terms were accepted', async () => {
        mockParams = { termsAccepted: '1' };

        const { getByPlaceholderText } = render(<RegisterScreen />);

        expect(getByPlaceholderText('Your Name')).toBeTruthy();
        expect(mockReplace).not.toHaveBeenCalled();
    });
});
