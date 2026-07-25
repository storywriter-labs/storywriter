import { test, expect } from './fixtures/test';
import { seedAuthToken, readAuthToken } from './fixtures/test';
import { TEST_USER } from './fixtures/data';

/**
 * Tier 0 — proof the harness itself works.
 *
 * These are deliberately thin. They check that the app boots under mocks, that
 * both signed-out and signed-in entry paths land where they should, and that
 * nothing leaks to a real backend. Real auth, bookshelf and story coverage live
 * in the Tier 1-3 specs.
 */

test.describe('foundation', () => {
  test('a signed-out visitor lands on the welcome screen', async ({ page, api }) => {
    await page.goto('/');

    await expect(page.getByTestId('welcome-screen')).toBeVisible();
    // No token, so the app should never have asked the API who the user is.
    expect(api.requestsFor('GET', '/user')).toHaveLength(0);
  });

  test('a stored token boots straight into the tabs', async ({ page, api }) => {
    await seedAuthToken(page);
    await page.goto('/');

    await expect(page.getByTestId('tab-lab')).toBeVisible();
    await expect(page.getByTestId('tab-bookshelf')).toBeVisible();
    await expect(page.getByTestId('tab-about')).toBeVisible();

    expect(api.requestsFor('GET', '/user')).toHaveLength(1);
  });

  test('every request the app makes has a mock behind it', async ({ signedInPage, api }) => {
    await signedInPage.getByTestId('tab-bookshelf').click();
    await expect(signedInPage.getByTestId('bookshelf-list')).toBeVisible();

    // A 501 from the mock layer means an endpoint slipped through unmocked and
    // would have hit a real server in CI.
    expect(api.unhandled).toEqual([]);
  });

  test('a test can override a default response', async ({ page, api }) => {
    api.get('/user', { status: 401, json: { message: 'Unauthenticated.' } });
    await seedAuthToken(page, 'stale-token');

    await page.goto('/');

    // AuthContext classifies 401 as 'auth', clears the token and bounces to auth.
    await expect(page.getByTestId('welcome-screen')).toBeVisible();
    expect(await readAuthToken(page)).toBeNull();
  });

  test('the viewport is tablet landscape', async ({ page }) => {
    const viewport = page.viewportSize();
    expect(viewport).not.toBeNull();
    expect(viewport!.width).toBeGreaterThan(viewport!.height);
  });

  test('mocked user data reaches the app', async ({ signedInPage, api }) => {
    const userRequests = api.requestsFor('GET', '/user');
    expect(userRequests).toHaveLength(1);

    // Sanity-check the fixture is the shape AuthContext expects.
    expect(TEST_USER.email).toContain('@');
    await expect(signedInPage.getByTestId('lab-screen')).toBeVisible();
  });
});
