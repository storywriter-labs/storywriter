import { test as base, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

import { ApiMock, applyDefaults } from './api-mock';
import type { MockApiOptions } from './api-mock';
import { ConversationMock } from './conversation-mock';
import type { ConversationMockOptions } from './conversation-mock';
import { TEST_TOKEN } from './data';

/**
 * The key `src/api/client.js` stores the Sanctum token under. On web,
 * `tokenStorage` is a thin wrapper over localStorage, so seeding this is all it
 * takes to boot the app as a signed-in user.
 */
const TOKEN_KEY = 'userToken';

/**
 * Put a token in localStorage before any app code runs. AuthContext reads it in
 * its very first effect, so this has to happen before `page.goto`.
 */
export async function seedAuthToken(page: Page, token: string = TEST_TOKEN): Promise<void> {
  await page.addInitScript(
    ({ key, value }: { key: string; value: string }) => {
      window.localStorage.setItem(key, value);
    },
    { key: TOKEN_KEY, value: token },
  );
}

export async function readAuthToken(page: Page): Promise<string | null> {
  return page.evaluate((key) => window.localStorage.getItem(key), TOKEN_KEY);
}

interface Fixtures {
  /**
   * The backend, mocked. Installed with happy-path defaults before the test
   * body runs; override any endpoint by registering it again.
   */
  api: ApiMock;
  /**
   * The ElevenLabs conversation WebSocket, mocked. Installed for every test, so
   * the SDK can never open a real socket even from a test that ignores it.
   */
  conversation: ConversationMock;
  /** Boots the app already signed in and waits for the tab bar to show up. */
  signedInPage: Page;
}

interface WorkerFixtures {
  /** Tweak the defaults for a whole file with `test.use({ apiOptions: { ... } })`. */
  apiOptions: MockApiOptions;
  /** Same, for the conversation socket — e.g. `{ failHandshake: true }`. */
  conversationOptions: ConversationMockOptions;
}

export const test = base.extend<Fixtures, WorkerFixtures>({
  apiOptions: [{}, { option: true, scope: 'worker' }],
  conversationOptions: [{}, { option: true, scope: 'worker' }],

  /**
   * `auto` so the mocks go up even for a test that never names the fixture —
   * otherwise forgetting it means the test quietly talks to whatever is (or
   * isn't) listening on the real API host, and fails with a boot error that
   * looks nothing like the missing mock it actually is.
   */
  api: [
    async ({ page, apiOptions }, use) => {
      const api = applyDefaults(new ApiMock(page), apiOptions);
      await api.install();
      await use(api);
    },
    { auto: true },
  ],

  /** `auto` for the same reason as `api` — an unmocked socket is a real one. */
  conversation: [
    async ({ page, conversationOptions }, use) => {
      const conversation = new ConversationMock(conversationOptions);
      await conversation.install(page);
      await use(conversation);
    },
    { auto: true },
  ],

  signedInPage: async ({ page, api }, use) => {
    // Nothing should have reached the API before we navigate — if it has, the
    // mocks went up too late and the test would be hitting a real backend.
    expect(api.requests).toHaveLength(0);

    await seedAuthToken(page);
    await page.goto('/');
    await expect(page.getByTestId('tab-lab')).toBeVisible();

    await use(page);
  },
});

export { expect };
export {
  TEST_TOKEN,
  TEST_USER,
  TEST_STORIES,
  makeStory,
  generationResponse,
  BLANK_IMAGE,
  SILENT_MP3,
  silentMp3,
} from './data';
export { ConversationMock, SIGNED_URL } from './conversation-mock';
