// app/(auth)/welcome.tsx

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import BackgroundImage from '../../components/BackgroundImage/BackgroundImage';
import { Colors, Spacing, BorderRadius, FontSizes } from '../../constants/theme';
import { isPrereleaseGated, REQUEST_INVITE_URL } from '../../constants/prerelease';

export default function WelcomeScreen() {
    const router = useRouter();
    const gated = isPrereleaseGated();

    return (
        <BackgroundImage opacity={0.4}>
            <View style={styles.container} testID="welcome-screen">
                <View style={styles.card}>
                    <View style={styles.titleContainer}>
                        <Text style={styles.title}>Welcome to the</Text>
                        <Text style={styles.labTitle}>StoryWriter Lab!</Text>
                        <View style={styles.decorativeLine} />
                    </View>

                    <Text style={styles.subtitle}>
                        {gated
                            ? 'StoryWriter is not yet in public release.'
                            : 'Speak your ideas out loud and watch them turn into a storybook, complete with pictures and narration!'}
                    </Text>

                    {gated ? (
                        <TouchableOpacity
                            style={styles.button}
                            testID="welcome-request-invite"
                            onPress={() => {
                                void Linking.openURL(REQUEST_INVITE_URL);
                            }}
                        >
                            <Text style={styles.buttonText}>Request Invite</Text>
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity
                            style={styles.button}
                            testID="welcome-get-started"
                            onPress={() => router.push('/(auth)/terms')}
                        >
                            <Text style={styles.buttonText}>Try It Now!</Text>
                        </TouchableOpacity>
                    )}

                    <TouchableOpacity
                        style={styles.linkButton}
                        testID="welcome-login-link"
                        onPress={() => router.push('/(auth)/login')}
                    >
                        <Text style={styles.linkText}>Already have an account? Log in</Text>
                    </TouchableOpacity>
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
    buttonText: {
        color: Colors.white,
        fontSize: FontSizes.xl,
        fontWeight: 'bold',
        letterSpacing: 0.5,
    },
    linkButton: {
        marginTop: Spacing.lg,
        alignItems: 'center',
    },
    linkText: {
        fontSize: FontSizes.sm,
        color: Colors.darkGray,
        textDecorationLine: 'underline',
    },
});
