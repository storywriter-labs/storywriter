import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import LoginScreen from '../login';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
    useRouter: () => ({ replace: jest.fn(), push: mockPush, back: jest.fn() }),
}));

const mockLogin = jest.fn();
jest.mock('../../../src/context/AuthContext', () => ({
    useAuth: () => ({ login: mockLogin }),
}));

jest.mock('../../../components/BackgroundImage/BackgroundImage', () => {
    const { View } = require('react-native');
    return ({ children }: { children: React.ReactNode }) => <View>{children}</View>;
});

jest.mock('../../../src/utils/analytics', () => ({
    trackEvent: jest.fn(),
    AnalyticsEvents: {
        LOGIN_STARTED: 'login_started',
        LOGIN_FAILED: 'login_failed',
    },
}));

beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    jest.restoreAllMocks();
});

describe('LoginScreen failure feedback', () => {
    // These used to go through Alert.alert, which is an empty function on
    // react-native-web — a failed login showed the parent nothing at all.
    it('shows an inline message when the server errors', async () => {
        mockLogin.mockRejectedValue({ response: { status: 500, data: {} } });

        const { getByText, getByTestId } = render(<LoginScreen />);
        fireEvent.press(getByText('Enter the Lab!'));

        await waitFor(() => expect(getByTestId('login-form-error')).toBeTruthy());
        expect(
            getByText(/Something went wrong on our end/)
        ).toBeTruthy();
    });

    it('shows an inline message when the request never reaches the server', async () => {
        mockLogin.mockRejectedValue(new Error('Network Error'));

        const { getByText, getByTestId } = render(<LoginScreen />);
        fireEvent.press(getByText('Enter the Lab!'));

        await waitFor(() => expect(getByTestId('login-form-error')).toBeTruthy());
        expect(getByText(/couldn't reach StoryWriter/)).toBeTruthy();
    });

    it('still renders field errors for a 422 and no form-level message', async () => {
        mockLogin.mockRejectedValue({
            response: {
                status: 422,
                data: { errors: { email: ['The credentials you provided are incorrect.'] } },
            },
        });

        const { getByText, queryByTestId } = render(<LoginScreen />);
        fireEvent.press(getByText('Enter the Lab!'));

        await waitFor(() =>
            expect(getByText(/credentials you provided are incorrect/)).toBeTruthy()
        );
        expect(queryByTestId('login-form-error')).toBeNull();
    });

    it('clears a previous failure when the form is submitted again', async () => {
        mockLogin.mockRejectedValueOnce({ response: { status: 500, data: {} } });

        const { getByText, getByTestId, queryByTestId } = render(<LoginScreen />);
        fireEvent.press(getByText('Enter the Lab!'));
        await waitFor(() => expect(getByTestId('login-form-error')).toBeTruthy());

        mockLogin.mockResolvedValueOnce(undefined);
        fireEvent.press(getByText('Enter the Lab!'));

        await waitFor(() => expect(queryByTestId('login-form-error')).toBeNull());
    });
});
