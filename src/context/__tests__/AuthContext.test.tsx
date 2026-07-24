import React from 'react';
import { Text } from 'react-native';
import { render, waitFor, act } from '@testing-library/react-native';

import { AuthProvider, useAuth } from '../AuthContext';
import client, { tokenStorage } from '../../api/client';

jest.mock('../../api/client', () => ({
    __esModule: true,
    default: {
        get: jest.fn(),
        post: jest.fn(),
        defaults: { headers: { common: {} } },
    },
    tokenStorage: {
        get: jest.fn(),
        set: jest.fn(),
        remove: jest.fn(),
    },
}));

jest.mock('../../utils/analytics', () => ({
    identifyUser: jest.fn(),
    resetUser: jest.fn(),
    trackEvent: jest.fn(),
    AnalyticsEvents: {},
}));

const mockedClient = client as unknown as {
    get: jest.Mock;
    post: jest.Mock;
    defaults: { headers: { common: Record<string, string> } };
};
const mockedTokenStorage = tokenStorage as unknown as {
    get: jest.Mock;
    set: jest.Mock;
    remove: jest.Mock;
};

const USER = { id: 7, name: 'Ada Lovelace', email: 'ada@example.com' };

// Exposes the context to the test without needing a real screen.
let auth: ReturnType<typeof useAuth>;

function Probe() {
    auth = useAuth();
    return <Text>{auth.isAuthenticated ? 'in' : 'out'}</Text>;
}

async function renderProvider() {
    const utils = render(
        <AuthProvider>
            <Probe />
        </AuthProvider>
    );
    // Let the initial "load the stored session" pass settle.
    await waitFor(() => expect(auth.loading).toBe(false));
    return utils;
}

beforeEach(() => {
    jest.clearAllMocks();
    mockedClient.defaults.headers.common = {};
    // No stored token: start every test logged out.
    mockedTokenStorage.get.mockResolvedValue(null);
    mockedTokenStorage.set.mockResolvedValue(undefined);
});

describe('AuthContext login', () => {
    it('posts the password to /auth/login and applies the session', async () => {
        mockedClient.post.mockResolvedValue({ data: { token: 'tok-123', user: USER } });

        await renderProvider();
        await act(async () => {
            await auth.login('ada@example.com', 'password123');
        });

        expect(mockedClient.post).toHaveBeenCalledWith('/auth/login', {
            email: 'ada@example.com',
            password: 'password123',
        });
        expect(mockedTokenStorage.set).toHaveBeenCalledWith('tok-123');
        expect(mockedClient.defaults.headers.common['Authorization']).toBe('Bearer tok-123');
        expect(auth.isAuthenticated).toBe(true);
    });

    it('does not sign the user in when the API rejects the credentials', async () => {
        mockedClient.post.mockRejectedValue({ response: { status: 422 } });

        await renderProvider();
        await act(async () => {
            await expect(auth.login('ada@example.com', 'wrong')).rejects.toBeDefined();
        });

        expect(mockedTokenStorage.set).not.toHaveBeenCalled();
        expect(auth.isAuthenticated).toBe(false);
    });
});

describe('AuthContext register', () => {
    it('posts the registration to /auth/register and applies the session', async () => {
        mockedClient.post.mockResolvedValue({ data: { token: 'tok-456', user: USER } });

        await renderProvider();
        await act(async () => {
            await auth.register('Ada Lovelace', 'ada@example.com', 'password123', 'password123', true);
        });

        expect(mockedClient.post).toHaveBeenCalledWith('/auth/register', {
            name: 'Ada Lovelace',
            email: 'ada@example.com',
            password: 'password123',
            password_confirmation: 'password123',
            terms_accepted: true,
        });
        expect(mockedTokenStorage.set).toHaveBeenCalledWith('tok-456');
        expect(auth.isAuthenticated).toBe(true);
    });

    it('reports terms acceptance as given rather than always claiming true', async () => {
        mockedClient.post.mockResolvedValue({ data: { token: 'tok-789', user: USER } });

        await renderProvider();
        await act(async () => {
            await auth.register('Ada Lovelace', 'ada@example.com', 'password123', 'password123', false);
        });

        expect(mockedClient.post).toHaveBeenCalledWith(
            '/auth/register',
            expect.objectContaining({ terms_accepted: false })
        );
    });
});
