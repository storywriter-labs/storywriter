import Constants from 'expo-constants';

/**
 * Temporary pre-release gate.
 *
 * While StoryWriter is invite-only, the production app shows a holding message
 * instead of the sign-up flow. Existing accounts can still log in.
 *
 * The gate is driven by the `PRERELEASE_GATE` build variable, which only the
 * production deploy job sets. It is *not* derived from `extra.environment`:
 * `expo export` forces NODE_ENV=production for every export, so staging builds
 * and the Playwright build in CI report `production` too.
 *
 * To remove the gate: drop `PRERELEASE_GATE` from the deploy workflow, then
 * delete this file and its call sites.
 */

/** Where "Request Invite" sends people — the Labs request-access page. */
export const REQUEST_INVITE_URL = 'https://labs.storywriter.net/request-access';

/** True only in a build made with PRERELEASE_GATE=true. */
export function isPrereleaseGated(): boolean {
  return Constants.expoConfig?.extra?.PRERELEASE_GATE === true;
}
