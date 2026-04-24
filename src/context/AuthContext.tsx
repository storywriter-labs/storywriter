// src/context/AuthContext.tsx  <-- Rename to .tsx
import React, { createContext, useState, useEffect, useContext } from 'react';
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
    isAuthenticated: boolean; // <--- This was missing!
    loading: boolean;
    login: (email: string, name: string, deviceName: string) => Promise<void>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadUser = async () => {
            let token;
            try {
                if (Platform.OS === 'web') {
                    token = localStorage.getItem('userToken');
                } else {
                    token = await SecureStore.getItemAsync('userToken');
                }

                if (token) {
                    // Important: Set the header BEFORE making the request
                    client.defaults.headers.common['Authorization'] = `Bearer ${token}`;
                    const { data } = await client.get('/user');
                    setUser(data);
                    identifyUser(data, Platform.OS);
                }
            } catch (e) {
                logger.debug(LogCategory.SYSTEM, 'Load User Failed', { error: e });
                await logout();
            } finally {
                setLoading(false);
            }
        };
        loadUser().catch(console.error);
    }, []);

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

    const logout = async () => {
        try {
            if (Platform.OS === 'web') {
                localStorage.removeItem('userToken');
            } else {
                await SecureStore.deleteItemAsync('userToken');
            }
            // Clear header
            delete client.defaults.headers.common['Authorization'];
            resetUser();
        } catch (e) {
            console.error("Logout error", e);
        } finally {
            setUser(null);
        }
    };

    return (
        <AuthContext.Provider value={{
            user,
            isAuthenticated: !!user, // <--- THE MAGIC FIX
            login,
            logout,
            loading
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