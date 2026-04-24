import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router'; // <--- 1. Import useRouter, useSegments
import * as SplashScreen from 'expo-splash-screen';
import * as ScreenOrientation from 'expo-screen-orientation';
import Constants from 'expo-constants';
import { useEffect, useMemo, useRef } from 'react';
import { Platform, View, ActivityIndicator, StyleSheet, TouchableOpacity, Text } from 'react-native';
import 'react-native-reanimated';
import PostHog, { PostHogProvider, usePostHog } from 'posthog-react-native';

// import BackendConnectivityService from '@/src/utils/backendConnectivity';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { setPostHogClient, trackEvent, AnalyticsEvents } from '../src/utils/analytics';

const posthogApiKey = Constants.expoConfig?.extra?.POSTHOG_API_KEY ?? '';
const posthogHost = Constants.expoConfig?.extra?.POSTHOG_HOST ?? 'https://us.i.posthog.com';

export {
  ErrorBoundary,
} from 'expo-router';

// Delete the unstable_settings; the useEffect below handles this better
// export const unstable_settings = { ... }; 

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync().catch(console.error);
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <PostHogProviderWrapper>
      <AuthProvider>
        <RootLayoutNav />
      </AuthProvider>
    </PostHogProviderWrapper>
  );
}

/**
 * SSR-safe PostHog wrapper.
 *
 * posthog-react-native internally uses AsyncStorage which requires `window`.
 * Expo Router performs an SSR pass on web where `window` is not defined.
 * Following the official PostHog Expo example, we create the client manually
 * behind a `typeof window` guard and pass it via the `client` prop.
 */
function PostHogProviderWrapper({ children }: { children: React.ReactNode }) {
  const client = useMemo(() => {
    if (typeof window === 'undefined' || !posthogApiKey) {
      return null;
    }

    return new PostHog(posthogApiKey, {
      host: posthogHost,
      enableSessionReplay: false,
      disableGeoip: true,
    });
  }, []);

  if (!client) {
    return <>{children}</>;
  }

  return (
    <PostHogProvider client={client} autocapture={false}>
      <PostHogClientRegistrar />
      {children}
    </PostHogProvider>
  );
}

/** Registers the PostHog client instance for use outside React components. */
function PostHogClientRegistrar() {
  const posthog = usePostHog();
  useEffect(() => {
    if (posthog) {
      setPostHogClient(posthog);
    }
  }, [posthog]);
  return null;
}

function RootLayoutNav() {
  const { isAuthenticated, loading, user, loadingError, retryLoadUser } = useAuth();
  const hasFiredAppOpened = useRef(false);

  // Custom theme with transparent backgrounds
  const customTheme = {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background: 'transparent',
    },
  };

  // 2. SETUP THE TRAFFIC COP HOOKS
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (Platform.OS !== 'web') {
      void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    }
  }, []);

  useEffect(() => {
    if (!loading && !hasFiredAppOpened.current) {
      hasFiredAppOpened.current = true;
      trackEvent(AnalyticsEvents.APP_OPENED, {
        platform: Platform.OS,
        is_returning_user: !!user,
      });
    }
  }, [loading, user]);

  // 3. THE REDIRECT LOGIC (The "Integration" you asked for)
  useEffect(() => {
    if (loading) return; // Don't do anything while checking session

    const inAuthGroup = segments[0] === '(auth)';

    if (!isAuthenticated && !inAuthGroup) {
      // User is NOT logged in, but is trying to access app screens (or root /)
      // Redirect them to the sign-in page
      router.replace('/(auth)/login');
    } else if (isAuthenticated && inAuthGroup) {
      // User IS logged in, but is on the login page
      // Redirect them to the tabs
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, segments, loading, router]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (loadingError === 'network') {
    return (
      <View style={styles.loadingContainer}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>Can't reach StoryWriter</Text>
          <Text style={styles.errorMessage}>
            Please check your internet connection and try again.
          </Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={async () => {
              await retryLoadUser();
            }}
          >
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <ThemeProvider value={customTheme}>
      {/* 4. CLEANER STACK
         Don't conditionally render the screens here.
         Let the useEffect above handle the security.
         This prevents "Route not found" errors during the transition.
      */}
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(auth)" />
      </Stack>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  errorContainer: {
    padding: 24,
    alignItems: 'center',
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#333',
  },
  errorMessage: {
    fontSize: 16,
    color: '#666',
    marginBottom: 24,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#4ECDC4',
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});