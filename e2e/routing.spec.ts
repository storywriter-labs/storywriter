import { test, expect } from './fixtures/test';
import { readAuthToken, seedAuthToken } from './fixtures/test';
import { TEST_TOKEN, TEST_USER } from './fixtures/data';

/**
 * Tier 1 — session boot and the routing/redirect logic in app/_layout.tsx.
 *
 * Every branch here is decided by AuthContext's very first `GET /user`, so each
 * test is really "what does the app do when that one call answers like this".
 */

test.describe('session boot', () => {
  test('a stored token is sent as a bearer token and boots into the tabs', async ({ page, api }) => {
    await seedAuthToken(page);
    await page.goto('/');

    await expect(page.getByTestId('tab-lab')).toBeVisible();

    const [request] = api.requestsFor('GET', '/user');
    expect(request.headers.authorization).toBe(`Bearer ${TEST_TOKEN}`);
  });

  test('the loading spinner holds the screen while the session is checked', async ({ page, api }) => {
    api.get('/user', { json: TEST_USER, delayMs: 2000 });
    await seedAuthToken(page);

    await page.goto('/');

    // Neither destination may flash before we know who the user is.
    await expect(page.getByTestId('app-loading')).toBeVisible();
    await expect(page.getByTestId('welcome-screen')).toBeHidden();

    await expect(page.getByTestId('tab-lab')).toBeVisible();
  });

  test('an invalid token is cleared and the session is really gone', async ({ page, api }) => {
    api.get('/user', { status: 401, json: { message: 'Unauthenticated.' } });
    await seedAuthToken(page, 'expired-token');

    await page.goto('/');

    await expect(page.getByTestId('welcome-screen')).toBeVisible();
    expect(await readAuthToken(page)).toBeNull();

    // Not just a redirect off `/` — the app screens are closed too.
    await page.goto('/bookshelf');
    await expect(page.getByTestId('welcome-screen')).toBeVisible();
    await expect(page.getByTestId('bookshelf-list')).toBeHidden();
  });

  test('an unreachable backend shows the retry screen and keeps the token', async ({ page, api }) => {
    api.get('/user', { networkError: true });
    await seedAuthToken(page);

    await page.goto('/');

    await expect(page.getByTestId('boot-network-error')).toBeVisible();
    await expect(page.getByTestId('boot-network-error')).toContainText("Can't reach StoryWriter");
    // A flaky connection is not a reason to sign a child out.
    expect(await readAuthToken(page)).toBe(TEST_TOKEN);
  });

  test('a 5xx at boot is treated as unreachable, not as a bad session', async ({ page, api }) => {
    api.get('/user', { status: 503, json: { message: 'Service Unavailable' } });
    await seedAuthToken(page);

    await page.goto('/');

    await expect(page.getByTestId('boot-network-error')).toBeVisible();
    expect(await readAuthToken(page)).toBe(TEST_TOKEN);
  });

  test('Try Again re-checks the session and lets the user in', async ({ page, api }) => {
    // Flipped once the retry screen is up rather than answered with a `once`
    // rule: a failed boot check already costs more than one request, so
    // counting calls to decide when to recover would be guesswork.
    let backendIsDown = true;
    api.get('/user', () =>
      backendIsDown ? { status: 503, json: { message: 'Service Unavailable' } } : { json: TEST_USER },
    );
    await seedAuthToken(page);

    await page.goto('/');
    await expect(page.getByTestId('boot-retry')).toBeVisible();
    const callsBeforeRetry = api.requestsFor('GET', '/user').length;

    backendIsDown = false;
    await page.getByTestId('boot-retry').click();

    await expect(page.getByTestId('tab-lab')).toBeVisible();
    expect(api.requestsFor('GET', '/user').length).toBeGreaterThan(callsBeforeRetry);
  });
});

test.describe('navigation', () => {
  test('the three tabs each open their own screen', async ({ signedInPage: page }) => {
    await expect(page.getByTestId('lab-screen')).toBeVisible();

    await page.getByTestId('tab-bookshelf').click();
    await expect(page.getByTestId('bookshelf-list')).toBeVisible();

    await page.getByTestId('tab-about').click();
    await expect(page.getByTestId('about-screen')).toBeVisible();

    await page.getByTestId('tab-lab').click();
    await expect(page.getByTestId('lab-screen')).toBeVisible();
  });

  test('an unknown route shows the not-found screen with a way back', async ({ signedInPage: page }) => {
    await page.goto('/this-route-does-not-exist');

    await expect(page.getByTestId('not-found-screen')).toBeVisible();

    await page.getByTestId('not-found-home-link').click();
    await expect(page.getByTestId('lab-screen')).toBeVisible();
  });
});
