// app/(auth)/register.tsx

import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    Platform
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import BackgroundImage from '../../components/BackgroundImage/BackgroundImage';
import { trackEvent, AnalyticsEvents } from '../../src/utils/analytics';
import { Colors, Spacing, BorderRadius, FontSizes } from '../../constants/theme';

const ErrorMessage = ({ messages, testID }: { messages: string[]; testID?: string }) => {
    if (!messages || messages.length === 0) return null;
    return (
        <View style={styles.errorContainer} testID={testID} accessibilityRole="alert">
            {messages.map((msg, index) => (
                <Text key={index} style={styles.errorText}>
                    • {msg}
                </Text>
            ))}
        </View>
    );
};

// Shown when the request never got as far as a validation response — a 5xx, or
// no response at all. react-native-web's Alert is a no-op, so anything routed
// through Alert.alert here would leave the parent staring at an unchanged form.
const SERVER_ERROR_MESSAGE =
    "Something went wrong on our end. Please try again in a moment.";
const NETWORK_ERROR_MESSAGE =
    "We couldn't reach StoryWriter. Please check your connection and try again.";

export default function RegisterScreen() {
    const { register } = useAuth();
    const router = useRouter();

    // Registration stamps terms_accepted_at on the account, so it's the record
    // that a parent agreed to the terms. Reaching this screen without passing
    // through the terms screen — a deep link, or going Back after accepting —
    // must not produce that record, so send them to accept first.
    const { termsAccepted } = useLocalSearchParams<{ termsAccepted?: string }>();
    const hasAcceptedTerms = termsAccepted === '1';

    useEffect(() => {
        if (!hasAcceptedTerms) {
            router.replace('/(auth)/terms');
        }
    }, [hasAcceptedTerms, router]);

    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [passwordConfirmation, setPasswordConfirmation] = useState('');

    const [isLoading, setIsLoading] = useState(false);
    const [errors, setErrors] = useState<{ [key: string]: string[] }>({});
    const [formError, setFormError] = useState<string | null>(null);

    const handleRegister = async () => {
        setIsLoading(true);
        setErrors({});
        setFormError(null);
        trackEvent(AnalyticsEvents.REGISTER_STARTED, { platform: Platform.OS });

        try {
            await register(name, email, password, passwordConfirmation, hasAcceptedTerms);
            trackEvent(AnalyticsEvents.REGISTER_COMPLETED);
        } catch (error: unknown) {
            console.error("Registration Error:", error);

            let errorType = 'unknown';
            if (error && typeof error === 'object' && 'response' in error) {
                const axiosError = error as {
                    response?: {
                        status: number;
                        data: { message?: string; errors: { [key: string]: string[] } };
                    };
                };
                if (axiosError.response?.status === 422) {
                    errorType = 'validation';
                    setErrors(axiosError.response.data.errors);
                } else if (axiosError.response?.status === 403) {
                    // Signup is closed on this environment (REGISTRATION_ENABLED=false
                    // on staging and production). The backend sends a sentence worth
                    // reading, so show it instead of "something went wrong" — otherwise
                    // a closed environment looks like a broken one.
                    errorType = 'registration_closed';
                    setFormError(axiosError.response.data?.message || SERVER_ERROR_MESSAGE);
                } else {
                    errorType = 'server';
                    setFormError(SERVER_ERROR_MESSAGE);
                }
            } else {
                errorType = 'network';
                setFormError(NETWORK_ERROR_MESSAGE);
            }
            trackEvent(AnalyticsEvents.REGISTER_FAILED, { error_type: errorType });
        } finally {
            setIsLoading(false);
        }
    };

    // Don't flash the form on the way to the terms screen.
    if (!hasAcceptedTerms) return null;

    return (
        <BackgroundImage opacity={0.4}>
            <View style={styles.container} testID="register-screen">
                <View style={styles.card}>
                    <View style={styles.titleContainer}>
                        <Text style={styles.title}>Create your</Text>
                        <Text style={styles.labTitle}>StoryWriter Account</Text>
                        <View style={styles.decorativeLine} />
                    </View>

                    <View style={styles.formContainer}>
                        <TextInput
                            style={styles.input}
                            testID="register-name"
                            placeholder="Your Name"
                            placeholderTextColor="#999"
                            value={name}
                            onChangeText={setName}
                            autoCapitalize="words"
                            editable={!isLoading}
                        />
                        <ErrorMessage messages={errors.name} testID="register-name-error" />

                        <TextInput
                            style={styles.input}
                            testID="register-email"
                            placeholder="Parent's Email"
                            placeholderTextColor="#999"
                            value={email}
                            onChangeText={setEmail}
                            keyboardType="email-address"
                            autoCapitalize="none"
                            editable={!isLoading}
                        />
                        <ErrorMessage messages={errors.email} testID="register-email-error" />

                        <TextInput
                            style={styles.input}
                            testID="register-password"
                            placeholder="Password"
                            placeholderTextColor="#999"
                            value={password}
                            onChangeText={setPassword}
                            secureTextEntry
                            autoCapitalize="none"
                            editable={!isLoading}
                        />

                        <TextInput
                            style={styles.input}
                            testID="register-password-confirmation"
                            placeholder="Confirm Password"
                            placeholderTextColor="#999"
                            value={passwordConfirmation}
                            onChangeText={setPasswordConfirmation}
                            secureTextEntry
                            autoCapitalize="none"
                            editable={!isLoading}
                        />
                        <ErrorMessage messages={errors.password} testID="register-password-error" />

                        <ErrorMessage
                            messages={formError ? [formError] : []}
                            testID="register-form-error"
                        />

                        <TouchableOpacity
                            style={[styles.button, isLoading && styles.buttonDisabled]}
                            testID="register-submit"
                            onPress={handleRegister}
                            disabled={isLoading}
                        >
                            <Text style={styles.buttonText}>
                                {isLoading ? 'Creating Account...' : 'Create Account'}
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.linkButton}
                            testID="register-login-link"
                            onPress={() => router.push('/(auth)/login')}
                        >
                            <Text style={styles.linkText}>Already have an account? Log in</Text>
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
        fontSize: FontSizes.huge,
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
    linkButton: {
        marginTop: Spacing.lg,
        alignItems: 'center',
    },
    linkText: {
        fontSize: FontSizes.xs,
        color: '#888',
        textDecorationLine: 'underline',
    },
});
