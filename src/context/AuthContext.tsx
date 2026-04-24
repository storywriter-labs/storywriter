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
            if (Platform.OS === 'web') {
                localStorage.removeItem('userToken');
            } else {
                await SecureStore.deleteItemAsync('userToken');
            }
            delete client.defaults.headers.common['Authorization'];
            resetUser();
        } catch (e) {
            console.error("Logout error", e);
        } finally {
            setUser(null);
            setLoadingError(null);
            setLoading(false);
        }
    }, []);

    const performLoadUser = useCallback(async () => {
        let storedToken;
        try {
            if (Platform.OS === 'web') {
                storedToken = localStorage.getItem('userToken');
            } else {
                storedToken = await SecureStore.getItemAsync('userToken');
            }

            if (storedToken) {
                client.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`;
                const { data } = await client.get('/user');
                setUser(data);
                setLoadingError(null);
                identifyUser(data, Platform.OS);
            }
        } catch (e) {
            const errorType = classifyError(e);

            if (errorType === 'auth') {
                // Token is invalid, log user out
                logger.debug(LogCategory.SYSTEM, 'Invalid or expired token', { error: e });
                await logoutUser();
            } else if (errorType === 'network') {
                // Network error, keep token for retry
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

    // Updated to match your login.tsx: accepts (email, name, device_name)
    const login = async (email: string, name: string, device_name: string) => {
        // 1. Make the API Call
        const response = await client.post('/login', {
            email,
            name,
            device_name
        });

        // 2. DEBUG: Log the structure to be 100% sure
        logger.debug(LogCategory.SYSTEM, 'Login response', { response: response.data });

        // 3. Handle the response data
        // WARNING: Ensure your API returns { token: "...", user: {...} }
        // If it returns { access_token: "..." }, change 'token' below to 'access_token'
        const token = response.data.token;
        const userData = response.data.user;

        if (!token) throw new Error("No token received!");

        // 4. Save Token & Set Header
        if (Platform.OS === 'web') {
            localStorage.setItem('userToken', token);
        } else {
            await SecureStore.setItemAsync('userToken', token);
        }

        // Update Axios defaults so future requests work immediately
        client.defaults.headers.common['Authorization'] = `Bearer ${token}`;

        // 5. Update State
        setUser(userData);
        identifyUser(userData, Platform.OS);
        // "isAuthenticated" is derived from "user" automatically below
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