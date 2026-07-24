/**
 * Screen View Tracking
 *
 * Sends one PostHog screen/page view per navigation. posthog-react-native's
 * `captureScreens` autocapture does not work with expo-router (it needs the
 * NavigationContainer, which Expo Router keeps to itself), so the provider runs
 * with `autocapture={false}` and route changes are reported from here instead.
 */
import { usePathname } from 'expo-router';
import { useEffect, useRef } from 'react';

import { trackScreenView } from '@/src/utils/analytics';

export function useScreenTracking(): void {
  const pathname = usePathname();
  const lastTrackedPath = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || pathname === lastTrackedPath.current) {
      return;
    }
    lastTrackedPath.current = pathname;
    trackScreenView(pathname);
  }, [pathname]);
}
