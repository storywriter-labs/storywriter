// app/(auth)/login.tsx

import React, { useState } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    Platform,
    Alert
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import BackgroundImage from '../../components/BackgroundImage/BackgroundImage';
import { trackEvent, AnalyticsEvents } from '../../src/utils/analytics';
import { Colors, Spacing, BorderRadius, FontSizes } from '../../constants/theme';

// Helper to display errors clearly
const ErrorMessage = ({ messages, testID }: { messages: string[]; testID?: string }) => {
    if (!messages || messages.length === 0) return null;
    return (
        <View style={styles.errorContainer} testID={testID}>
            {messages.map((msg, index) => (
                <Text key={index} style={styles.errorText}>
                    • {msg}
                </Text>
            ))}
        </View>
    );
};

export default function LoginScreen() {
    const { login } = useAuth();
    const router = useRouter();

    // Form State
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    // UI State
    const [isLoading, setIsLoading] = useState(false);
    const [errors, setErrors] = useState<{ [key: string]: string[] }>({});

    const handleLogin = async () => {
        setIsLoading(true);
        setErrors({});
        trackEvent(AnalyticsEvents.LOGIN_STARTED, { platform: Platform.OS });

        try {
            await login(email, password);
        } catch (error: unknown) {
            console.error("Login Error:", error);

            let errorType = 'unknown';
            if (error && typeof error === 'object' && 'response' in error) {
                const axiosError = error as { response?: { status: number; data: { errors: { [key: string]: string[] } } } };
                if (axiosError.response?.status === 422) {
                    errorType = 'validation';
                    setErrors(axiosError.response.data.errors);
                } else {
                    errorType = 'server';
                    Alert.alert(
                        'Oops! Something went wrong',
                        'Please check your connection and try again.'
                    );
                }
            } else {
                errorType = 'network';
                Alert.alert(
                    'Oops! Something went wrong',
                    'Please check your connection and try again.'
                );
            }
            trackEvent(AnalyticsEvents.LOGIN_FAILED, { error_type: errorType });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <BackgroundImage opacity={0.4}>
            <View style={styles.container} testID="login-screen">
                <View style={styles.card}>
                    <View style={styles.titleContainer}>
                        <Text style={styles.title}>Welcome to the</Text>
                        <Text style={styles.labTitle}>StoryWriter Lab!</Text>
                        <View style={styles.decorativeLine} />
                    </View>

                    <Text style={styles.subtitle}>Let's get you started on your adventure!</Text>

                    <View style={styles.formContainer}>
                        <TextInput
                            style={styles.input}
                            testID="login-email"
                            placeholder="Parent's Email"
                            placeholderTextColor="#999"
                            value={email}
                            onChangeText={setEmail}
                            keyboardType="email-address"
                            autoCapitalize="none"
                            editable={!isLoading}
                        />
                        <ErrorMessage messages={errors.email} testID="login-email-error" />

                        <TextInput
                            style={styles.input}
                            testID="login-password"
                            placeholder="Password"
                            placeholderTextColor="#999"
                            value={password}
                            onChangeText={setPassword}
                            secureTextEntry
                            autoCapitalize="none"
                            editable={!isLoading}
                        />
                        <ErrorMessage messages={errors.password} testID="login-password-error" />

                        <TouchableOpacity
                            style={[styles.button, isLoading && styles.buttonDisabled]}
                            testID="login-submit"
                            onPress={handleLogin}
                            disabled={isLoading}
                        >
                            <Text style={styles.buttonText}>
                                {isLoading ? 'Getting Ready...' : 'Enter the Lab!'}
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.linkButton}
                            testID="login-register-link"
                            onPress={() => router.push('/(auth)/welcome')}
                        >
                            <Text style={styles.infoText}>
                                New here? Create an account
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </BackgroundImage>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: Spacing.lg,
    },
    card: {
        backgroundColor: Colors.background,
        borderRadius: BorderRadius.lg,
        padding: Spacing.xxxl,
        maxWidth: 480,
        width: '100%',
        shadowColor: Colors.black,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.15,
        shadowRadius: 16,
        elevation: 8,
        borderWidth: 3,
        borderColor: Colors.yellow,
    },
    titleContainer: {
        alignItems: 'center',
        marginBottom: Spacing.md,
    },
    title: {
        fontSize: FontSizes.md,
        fontWeight: '600',
        color: '#444',
        textAlign: 'center',
    },
    labTitle: {
        fontSize: FontSizes.giant,
        fontWeight: 'bold',
        color: Colors.coral,
        textAlign: 'center',
        marginTop: Spacing.sm,
        textShadowColor: 'rgba(255, 107, 107, 0.2)',
        textShadowOffset: { width: 2, height: 2 },
        textShadowRadius: 4,
    },
    decorativeLine: {
        width: 120,
        height: 4,
        backgroundColor: Colors.yellow,
        borderRadius: 2,
        marginTop: Spacing.md,
    },
    subtitle: {
        fontSize: FontSizes.lg,
        color: Colors.darkGray,
        marginBottom: Spacing.lg,
        textAlign: 'center',
        fontWeight: '500',
    },
    formContainer: {
        width: '100%',
    },
    input: {
        height: 54,
        borderColor: '#DDD',
        borderWidth: 2,
        borderRadius: BorderRadius.md,
        paddingHorizontal: Spacing.lg,
        marginBottom: Spacing.sm,
        backgroundColor: Colors.white,
        fontSize: FontSizes.md,
        fontWeight: '500',
    },
    button: {
        backgroundColor: Colors.teal,
        paddingVertical: Spacing.md,
        borderRadius: BorderRadius.md,
        alignItems: 'center',
        marginTop: Spacing.sm,
        shadowColor: Colors.teal,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
        borderWidth: 2,
        borderColor: Colors.tealDark,
    },
    buttonDisabled: {
        backgroundColor: '#B8E6E3',
        borderColor: '#A0D5D2',
        shadowOpacity: 0.1,
    },
    buttonText: {
        color: Colors.white,
        fontSize: FontSizes.xl,
        fontWeight: 'bold',
        letterSpacing: 0.5,
    },
    errorContainer: {
        marginBottom: Spacing.sm,
        backgroundColor: Colors.errorLight,
        padding: Spacing.sm,
        borderRadius: BorderRadius.sm,
        borderLeftWidth: 4,
        borderLeftColor: Colors.coral,
    },
    errorText: {
        color: '#D63031',
        fontSize: FontSizes.sm,
        fontWeight: '500',
        marginLeft: Spacing.sm,
    },
    infoText: {
        marginTop: Spacing.lg,
        textAlign: 'center',
        fontSize: FontSizes.xs,
        color: '#888',
        fontStyle: 'italic',
        textDecorationLine: 'underline',
    },
    linkButton: {
        alignItems: 'center',
    },
});