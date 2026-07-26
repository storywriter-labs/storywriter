import { test, expect } from './fixtures/test';
import { readAuthToken, seedAuthToken } from './fixtures/test';
import { TEST_TOKEN, TEST_USER } from './fixtures/data';

/**
 * Tier 1 — the signed-out half of the app: welcome, terms, register, login.
 *
 * Two things are deliberately *not* covered here:
 *
 * - The 5xx and network branches of login/register. Both call `Alert.alert`,
 *   and react-native-web's Alert is an empty function, so a failed login leaves
 *   nothing on screen to assert on. Fizzy #86 adds the visible error UI; the
 *   tests belong with it, not here.
 * - Logout. There is no logout control anywhere in the app yet (Fizzy #98).
 *   The only way a session ends today is the 401 path in routing.spec.ts.
 */

/** Fill the login form. Neither field is validated client-side. */
async function fillLogin(page: import('@playwright/test').Page, email: string, password: string) {
  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-password').fill(password);
}

test.describe('welcome and navigation between auth screens', () => {
  test('a signed-out visitor lands on welcome and can walk to login', async ({ page, api }) => {
    await page.goto('/');

    // The root layout sends signed-out visitors to the landing page, not
    // straight to login — login is one tap further in.
    await expect(page.getByTestId('welcome-screen')).toBeVisible();

    await page.getByTestId('welcome-login-link').click();
    await expect(page.getByTestId('login-screen')).toBeVisible();

    // Still nobody to ask about: no session, no /user call.
    expect(api.requestsFor('GET', '/user')).toHaveLength(0);
  });

  test('a signed-in user who opens an auth screen is sent back to the tabs', async ({ page }) => {
    await seedAuthToken(page);

    await page.goto('/login');

    await expect(page.getByTestId('tab-lab')).toBeVisible();
    await expect(page.getByTestId('login-screen')).toBeHidden();
  });
});

test.describe('login', () => {
  test('validation errors render inline against the right fields', async ({ page, api }) => {
    api.post('/auth/login', {
      status: 422,
      json: {
        message: 'The given data was invalid.',
        errors: {
          email: ['These credentials do not match our records.'],
          password: ['The password must be at least 8 characters.'],
        },
      },
    });

    await page.goto('/login');
    await fillLogin(page, 'parent@example.com', 'nope');
    await page.getByTestId('login-submit').click();

    await expect(page.getByTestId('login-email-error')).toContainText(
      'These credentials do not match our records.',
    );
    await expect(page.getByTestId('login-password-error')).toContainText(
      'The password must be at least 8 characters.',
    );

    // A rejected login must not leave a token behind or let anyone through.
    expect(await readAuthToken(page)).toBeNull();
    await expect(page.getByTestId('login-screen')).toBeVisible();
  });

  test('a successful login stores the token and lands on the tabs', async ({ page, api }) => {
    await page.goto('/login');
    await fillLogin(page, TEST_USER.email, 'correct-horse');
    await page.getByTestId('login-submit').click();

    await expect(page.getByTestId('tab-lab')).toBeVisible();
    expect(await readAuthToken(page)).toBe(TEST_TOKEN);

    const [request] = api.requestsFor('POST', '/auth/login');
    expect(request.body).toEqual({ email: TEST_USER.email, password: 'correct-horse' });
  });

  test('the submit button is busy while the login is in flight', async ({ page, api }) => {
    api.post('/auth/login', { json: { token: TEST_TOKEN, user: TEST_USER }, delayMs: 1500 });

    await page.goto('/login');
    await fillLogin(page, TEST_USER.email, 'correct-horse');
    await page.getByTestId('login-submit').click();

    // The disabled state is what stops a child double-tapping their way into
    // two login requests, so assert the request count too.
    await expect(page.getByTestId('login-submit')).toContainText('Getting Ready...');
    await page.getByTestId('login-submit').click({ force: true });

    await expect(page.getByTestId('tab-lab')).toBeVisible();
    expect(api.requestsFor('POST', '/auth/login')).toHaveLength(1);
  });
});

test.describe('the terms gate', () => {
  test('getting started goes through terms before the form appears', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('welcome-get-started').click();

    await expect(page.getByTestId('terms-screen')).toBeVisible();

    // Continue does nothing until a parent ticks the box — registering stamps
    // terms_accepted_at on the account, so nobody reaches the form by accident.
    await page.getByTestId('terms-continue').click({ force: true });
    await expect(page.getByTestId('terms-screen')).toBeVisible();
    await expect(page.getByTestId('register-screen')).toBeHidden();

    await page.getByTestId('terms-agree-checkbox').click();
    await page.getByTestId('terms-continue').click();

    await expect(page.getByTestId('register-screen')).toBeVisible();
  });

  test('deep-linking straight to /register bounces back to terms', async ({ page }) => {
    // Without the `termsAccepted=1` marker, register.tsx redirects rather than
    // render — otherwise a shared link would create an account whose
    // terms-accepted record nobody actually agreed to.
    await page.goto('/register');

    await expect(page.getByTestId('terms-screen')).toBeVisible();
    await expect(page.getByTestId('register-screen')).toBeHidden();
  });
});

test.describe('register', () => {
  /** Walk the real path in, so the screen carries the accepted-terms marker. */
  async function openRegisterForm(page: import('@playwright/test').Page) {
    await page.goto('/');
    await page.getByTestId('welcome-get-started').click();
    await page.getByTestId('terms-agree-checkbox').click();
    await page.getByTestId('terms-continue').click();
    await expect(page.getByTestId('register-screen')).toBeVisible();
  }

  test('validation errors render inline against the right fields', async ({ page, api }) => {
    api.post('/auth/register', {
      status: 422,
      json: {
        message: 'The given data was invalid.',
        errors: {
          name: ['The name field is required.'],
          email: ['The email has already been taken.'],
          password: ['The password confirmation does not match.'],
        },
      },
    });

    await openRegisterForm(page);
    await page.getByTestId('register-name').fill('');
    await page.getByTestId('register-email').fill('taken@example.com');
    await page.getByTestId('register-password').fill('hunter2hunter2');
    await page.getByTestId('register-password-confirmation').fill('something-else');
    await page.getByTestId('register-submit').click();

    await expect(page.getByTestId('register-name-error')).toContainText('The name field is required.');
    await expect(page.getByTestId('register-email-error')).toContainText(
      'The email has already been taken.',
    );
    await expect(page.getByTestId('register-password-error')).toContainText(
      'The password confirmation does not match.',
    );

    expect(await readAuthToken(page)).toBeNull();
  });

  test('a successful registration signs the new account straight in', async ({ page, api }) => {
    await openRegisterForm(page);
    await page.getByTestId('register-name').fill('New Parent');
    await page.getByTestId('register-email').fill('new@example.com');
    await page.getByTestId('register-password').fill('hunter2hunter2');
    await page.getByTestId('register-password-confirmation').fill('hunter2hunter2');
    await page.getByTestId('register-submit').click();

    await expect(page.getByTestId('tab-lab')).toBeVisible();
    expect(await readAuthToken(page)).toBe(TEST_TOKEN);

    const [request] = api.requestsFor('POST', '/auth/register');
    expect(request.body).toEqual({
      name: 'New Parent',
      email: 'new@example.com',
      password: 'hunter2hunter2',
      password_confirmation: 'hunter2hunter2',
      // The backend records consent off this flag, so it has to arrive true.
      terms_accepted: true,
    });
  });
});
