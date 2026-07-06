// app/(auth)/terms.tsx
//
// Placeholder Terms & Conditions copy — needs real legal/product-approved
// text before this ships (Fizzy #48 follow-up). Structure and the
// accept-to-continue gate are the actual deliverable here.

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import BackgroundImage from '../../components/BackgroundImage/BackgroundImage';
import { trackEvent, AnalyticsEvents } from '../../src/utils/analytics';
import { Colors, Spacing, BorderRadius, FontSizes } from '../../constants/theme';

const TERMS_TEXT = `StoryWriter Lab Terms & Conditions (placeholder)

This app is intended for use by children with the involvement of a parent or guardian. By continuing, a parent or guardian confirms they:

1. Are at least 18 years old and agree to these Terms & Conditions and our Privacy Policy on behalf of their child.
2. Understand that stories are generated with the help of AI and may occasionally produce unexpected results.
3. Consent to the collection of account information (name, email) needed to create and save stories.

This placeholder text will be replaced with the final, legally-reviewed Terms & Conditions and Privacy Policy before launch.`;

export default function TermsScreen() {
    const router = useRouter();
    const [agreed, setAgreed] = useState(false);

    const handleContinue = () => {
        trackEvent(AnalyticsEvents.TERMS_ACCEPTED);
        router.push('/(auth)/register');
    };

    return (
        <BackgroundImage opacity={0.4}>
            <View style={styles.container}>
                <View style={styles.card}>
                    <Text style={styles.title}>Just one thing first...</Text>

                    <ScrollView style={styles.termsBox} contentContainerStyle={styles.termsContent}>
                        <Text style={styles.termsText}>{TERMS_TEXT}</Text>
                    </ScrollView>

                    <TouchableOpacity
                        style={styles.checkboxRow}
                        onPress={() => setAgreed(!agreed)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: agreed }}
                    >
                        <View style={[styles.checkbox, agreed && styles.checkboxChecked]}>
                            {agreed && <Text style={styles.checkmark}>✓</Text>}
                        </View>
                        <Text style={styles.checkboxLabel}>
                            A parent or guardian has read and agrees to the Terms & Conditions
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.button, !agreed && styles.buttonDisabled]}
                        onPress={handleContinue}
                        disabled={!agreed}
                    >
                        <Text style={styles.buttonText}>Continue</Text>
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
        maxHeight: '90%',
        shadowColor: Colors.black,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.15,
        shadowRadius: 16,
        elevation: 8,
        borderWidth: 3,
        borderColor: Colors.yellow,
    },
    title: {
        fontSize: FontSizes.huge,
        fontWeight: 'bold',
        color: Colors.coral,
        textAlign: 'center',
        marginBottom: Spacing.md,
    },
    termsBox: {
        maxHeight: 260,
        borderWidth: 2,
        borderColor: '#DDD',
        borderRadius: BorderRadius.md,
        backgroundColor: Colors.white,
        marginBottom: Spacing.md,
    },
    termsContent: {
        padding: Spacing.md,
    },
    termsText: {
        fontSize: FontSizes.sm,
        color: Colors.darkGray,
        lineHeight: 20,
    },
    checkboxRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: Spacing.lg,
    },
    checkbox: {
        width: 24,
        height: 24,
        borderRadius: BorderRadius.xs,
        borderWidth: 2,
        borderColor: Colors.teal,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: Spacing.sm,
    },
    checkboxChecked: {
        backgroundColor: Colors.teal,
    },
    checkmark: {
        color: Colors.white,
        fontWeight: 'bold',
    },
    checkboxLabel: {
        flex: 1,
        fontSize: FontSizes.sm,
        color: Colors.darkGray,
        fontWeight: '500',
    },
    button: {
        backgroundColor: Colors.teal,
        paddingVertical: Spacing.md,
        borderRadius: BorderRadius.md,
        alignItems: 'center',
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
});
