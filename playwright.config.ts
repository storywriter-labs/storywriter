import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run against the Expo *web* build of the app.
 *
 * Two things about StoryWriter shape this config:
 *
 * 1. The app is landscape-locked on device. Web skips the orientation lock
 *    (see app/_layout.tsx), so we pin a tablet-landscape viewport here instead —
 *    otherwise tests run at a desktop size the app was never designed for and
 *    layout-dependent selectors get flaky.
 * 2. The backend is always mocked with `page.route` (see e2e/fixtures/api-mock.ts).
 *    No Laravel server, no Together AI or ElevenLabs keys, nothing to pay for.
 */

const isCI = !!process.env.CI;

/** Where the app under test is served. Expo's web dev server uses 8081. */
const PORT = Number(process.env.E2E_PORT ?? 8081);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',

  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,

  reporter: isCI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // iPad-ish landscape. The app targets tablets held sideways.
        viewport: { width: 1280, height: 800 },
      },
    },
  ],

  /**
   * Locally: the Expo dev server, so a change shows up without a rebuild.
   * On CI: the static export, which is what actually ships to S3/CloudFront —
   * the same artifact the deploy workflow uploads. Build it first with
   * `npm run build:web` (the CI workflow does).
   *
   * `--single` makes the static server fall back to index.html for paths with
   * no prerendered file, which is how dynamic routes like /bookshelf/[id]
   * get served. Real files still win, so /login keeps its own prerendered HTML.
   */
  webServer: {
    command: isCI
      ? `npx serve dist --listen ${PORT} --single --no-clipboard --no-port-switching`
      : `npx expo start --web --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !isCI,
    // Metro's first web bundle is slow on a cold cache.
    timeout: 240_000,
    // Every asset fetch would otherwise be interleaved with the test output.
    stdout: 'ignore',
    stderr: 'pipe',
    env: {
      // Stop `expo start` from opening a real browser window.
      BROWSER: 'none',
    },
  },
});
