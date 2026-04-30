/**
 * PostHog Analytics Utilities
 *
 * Typed event constants and helper functions for tracking product analytics.
 * All frontend analytics calls go through this module.
 */
import PostHog from 'posthog-react-native';

// ---------------------------------------------------------------------------
// Event name constants
// ---------------------------------------------------------------------------

export const AnalyticsEvents = {
  // Auth
  APP_OPENED: 'app_opened',
  LOGIN_STARTED: 'login_started',
  LOGIN_COMPLETED: 'login_completed',
  LOGIN_FAILED: 'login_failed',

  // Story creation funnel
  STORY_CREATION_STARTED: 'story_creation_started',
  CONVERSATION_CONNECTED: 'conversation_connected',
  CONVERSATION_ENDED: 'conversation_ended',
  CONVERSATION_CONNECTION_FAILED: 'conversation_connection_failed',
  STORY_GENERATION_REQUESTED: 'story_generation_requested',
  STORY_GENERATION_COMPLETED: 'story_generation_completed',
  STORY_GENERATION_FAILED: 'story_generation_failed',
  STORY_GENERATION_RETRIED: 'story_generation_retried',

  // Story reading
  STORY_OPENED: 'story_opened',
  STORY_PAGE_VIEWED: 'story_page_viewed',
  STORY_COMPLETED: 'story_completed',
  STORY_END_ACTION: 'story_end_action',

  // Narration
  NARRATION_PLAYED: 'narration_played',
  NARRATION_PAUSED: 'narration_paused',
  NARRATION_FAILED: 'narration_failed',
  NARRATION_RETRIED: 'narration_retried',

  // Bookshelf
  BOOKSHELF_VIEWED: 'bookshelf_viewed',
  BOOKSHELF_STORY_TAPPED: 'bookshelf_story_tapped',

  // Errors
  ERROR_OCCURRED: 'error_occurred',
} as const;

export type AnalyticsEvent = (typeof AnalyticsEvents)[keyof typeof AnalyticsEvents];

// ---------------------------------------------------------------------------
// Singleton PostHog client reference (set by PostHogProvider)
// ---------------------------------------------------------------------------

let posthogClient: PostHog | null = null;

/**
 * Store a reference to the PostHog client so non-component code can track
 * events without needing React context.
 */
export function setPostHogClient(client: PostHog): void {
  posthogClient = client;
}

// ---------------------------------------------------------------------------
// Core helpers
// ---------------------------------------------------------------------------

/**
 * Track a named event with optional properties.
 */
export function trackEvent(
  event: AnalyticsEvent | string,
  properties?: Record<string, string | number | boolean | null>,
): void {
  if (!posthogClient) {
    if (__DEV__) {
      console.debug('[analytics] skipped (non-production):', event);
    }
    return;
  }
  try {
    posthogClient.capture(event, properties);
  } catch {
    // Silently ignore analytics failures — never break the app
  }
}

/**
 * Identify the current user after login / session restore.
 */
export function identifyUser(
  user: { id: number; name: string; email: string },
  platform: string,
): void {
  try {
    posthogClient?.identify(String(user.id), {
      name: user.name,
      email: user.email,
      platform,
    });
  } catch {
    // Silently ignore
  }
}

/**
 * Reset identity on logout so subsequent events are anonymous.
 */
export function resetUser(): void {
  try {
    posthogClient?.reset();
  } catch {
    // Silently ignore
  }
}
