// src/context/AuthContext.tsx  <-- Rename to .tsx
import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';
import client from '../api/client';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { identifyUser, resetUser } from '../utils/analytics';
import { logger, LogCategory } from '../utils/logger';

// Define the shape of the context for TypeScript (Optional but good)
interface User {
    id: number;
    name: string;
    email: string;
}

interface AuthContextType {
    user: User | null;
    isAuthenticated: boolean;
    loading: boolean;
    loadingError: 'network' | 'auth' | null;
    login: (email: string, name: string, deviceName: string) => Promise<void>;
    logout: () => Promise<void>;
    retryLoadUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadingError, setLoadingError] = useState<'network' | 'auth' | null>(null);

    const classifyError = (error: unknown): 'network' | 'auth' | null => {
        if (!error || typeof error !== 'object') return null;

        const err = error as Record<string, unknown>;

        // Check for response status codes
        if ('response' in err && typeof err.response === 'object' && err.response !== null) {
            const response = err.response as Record<string, unknown>;
            const status = response.status;

            // 401/403 = token is invalid
            if (status === 401 || status === 403) return 'auth';

            // 5xx = server error, retryable
            if (typeof status === 'number' && status >= 500 && status < 600) return 'network';
        }

        // No response = network error (timeout, ECONNREFUSED, etc.)
        if ('code' in err) {
            const code = err.code as string;
            if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'ETIMEDOUT' || code === 'ECONNABORTED') {
                return 'network';
            }
        }

        // Message-based detection for network errors
        if ('message' in err) {
            const msg = (err.message as string).toLowerCase();
            if (msg.includes('network') || msg.includes('timeout') || msg.includes('connection')) {
                return 'network';
            }
        }

        return null;
    };

    const logoutUser = useCallback(async () => {
        try {
            // Web uses cookies (handled by browser); native uses SecureStore
            if (Platform.OS !== 'web') {
                await SecureStore.deleteItemAsync('userToken');
                delete client.defaults.headers.common['Authorization'];
            }
            resetUser();
        } catch (e) {
            logger.debug(LogCategory.SYSTEM, 'Logout error', { error: e });
        } finally {
            setUser(null);
            setLoadingError(null);
            setLoading(false);
        }
    }, []);

    const performLoadUser = useCallback(async () => {
        try {
            // On native, check for stored token; on web, try the request directly (cookies are auto-sent)
            if (Platform.OS !== 'web') {
                const storedToken = await SecureStore.getItemAsync('userToken');
                if (storedToken) {
                    client.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`;
                } else {
                    // No token on native, not authenticated
                    setLoading(false);
                    return;
                }
            }

            const { data } = await client.get('/user');
            setUser(data);
            setLoadingError(null);
            identifyUser(data, Platform.OS);
        } catch (e) {
            const errorType = classifyError(e);

            if (errorType === 'auth') {
                // Token/session is invalid, log user out
                logger.debug(LogCategory.SYSTEM, 'Invalid or expired token', { error: e });
                await logoutUser();
            } else if (errorType === 'network') {
                // Network error, keep credentials for retry
                logger.debug(LogCategory.SYSTEM, 'Network error during boot', { error: e });
                setLoadingError('network');
                setLoading(false);
                return;
            } else {
                // Other error, treat as network error
                logger.debug(LogCategory.SYSTEM, 'Boot error', { error: e });
                setLoadingError('network');
                setLoading(false);
                return;
            }
        }

        setLoading(false);
    }, [logoutUser]);

    useEffect(() => {
        performLoadUser().catch(console.error);
    }, [performLoadUser]);

    const login = async (email: string, name: string, device_name: string) => {
        // On web, fetch CSRF token first (cookie-based auth)
        if (Platform.OS === 'web') {
            await client.get('/sanctum/csrf-cookie');
        }

        const response = await client.post('/login', {
            email,
            name,
            device_name
        });

        logger.debug(LogCategory.SYSTEM, 'Login response', { response: response.data });

        const token = response.data.token;
        const userData = response.data.user;

        // On web, session cookie is set automatically; on native, store the token
        if (Platform.OS !== 'web') {
            if (!token) throw new Error("No token received!");
            await SecureStore.setItemAsync('userToken', token);
            client.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        }

        setUser(userData);
        identifyUser(userData, Platform.OS);
    };

    return (
        <AuthContext.Provider value={{
            user,
            isAuthenticated: !!user,
            login,
            logout: logoutUser,
            loading,
            loadingError,
            retryLoadUser: performLoadUser
        }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error("useAuth must be used within an AuthProvider");
    return context;
};