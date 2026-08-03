import { Redirect, Stack, useSegments } from 'expo-router';

import { isPrereleaseGated } from '../../constants/prerelease';

/** Screens that exist only to create a new account. */
const SIGN_UP_ROUTES = ['terms', 'register'];

export default function AuthLayout() {
    // Cast: typed routes narrow this to a tuple, but the second segment is the
    // screen name we care about — 'welcome', 'login', 'terms' or 'register'.
    const segments = useSegments() as string[];

    // While the pre-release gate is up, sign-up is closed. The welcome screen
    // hides the entry point; this closes the direct URL behind it. Log in is
    // untouched — existing accounts still work.
    if (isPrereleaseGated() && SIGN_UP_ROUTES.includes(segments[1])) {
        return <Redirect href="/(auth)/welcome" />;
    }

    return (
        <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="welcome" options={{ title: "Welcome" }} />
            <Stack.Screen name="terms" options={{ title: "Terms & Conditions" }} />
            <Stack.Screen name="register" options={{ title: "Create Account" }} />
            <Stack.Screen name="login" options={{ title: "Sign In" }} />
        </Stack>
    );
}
