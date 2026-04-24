import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Get API base URL from centralized configuration
const API_BASE_URL = Constants.expoConfig?.extra?.apiBaseUrl || 'http://127.0.0.1:8000';
const baseURL = `${API_BASE_URL}/api`;

const client = axios.create({
    baseURL,
    withCredentials: Platform.OS === 'web', // Use cookies for web, tokens for native
});

// Interceptor to add Token to native requests only
client.interceptors.request.use(async (config) => {
    // Web uses cookies, only native needs Bearer tokens
    if (Platform.OS !== 'web') {
        const token = await SecureStore.getItemAsync('userToken');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
    }
    return config;
});

export default client;