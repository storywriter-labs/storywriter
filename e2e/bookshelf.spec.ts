import type { Page } from '@playwright/test';

import { test, expect } from './fixtures/test';
import { seedAuthToken } from './fixtures/test';
import { BLANK_IMAGE, SILENT_MP3, TEST_STORIES, makeStory } from './fixtures/data';

/**
 * Tier 2 — the bookshelf list and the reader it opens.
 *
 * The shelf is not local state: it is whatever `GET /stories` answers with, so
 * every test here is really "what does the shelf do when the API says this".
 * The reader is the same story one level down, plus the parts that only exist
 * on web — arrow keys, and narration going through an `<audio>` element.
 *
 * Narration is mocked all the way down to real (silent) MP3 bytes, so the
 * player loads and plays for real without a single call reaching ElevenLabs.
 */

const [FIRST_STORY, SECOND_STORY] = TEST_STORIES;

/**
 * Open a story straight from its URL, the way a bookmarked link would.
 *
 * A story is addressed by its id, not its slug (card #107) — the slug is only a
 * label on the shelf row.
 */
async function openReader(page: Page, id: string | number = FIRST_STORY.id): Promise<void> {
  await seedAuthToken(page);
  await page.goto(`/bookshelf/${id}`);
}

/**
 * A 501 from the mock layer is silent: the app just sees a failed request and
 * takes an error path, so a missing rule looks like a product bug rather than a
 * gap in the setup. That is how the page-audio endpoint went unmocked until the
 * narration tests here needed it. Check every test, not just the shelf one in
 * foundation.spec.ts.
 */
test.afterEach(({ api }) => {
  expect(api.unhandled).toEqual([]);
});

test.describe('bookshelf', () => {
  test('lists the stories the API returns, newest first', async ({ signedInPage: page }) => {
    await page.getByTestId('tab-bookshelf').click();

    await expect(page.getByTestId('bookshelf-list')).toBeVisible();
    await expect(page.getByTestId(`bookshelf-card-${FIRST_STORY.id}`)).toBeVisible();
    await expect(page.getByTestId(`bookshelf-card-${SECOND_STORY.id}`)).toBeVisible();

    // The API returns them oldest-first; the shelf sorts by created_at.
    await expect(page.getByTestId('bookshelf-card-title')).toHaveText([
      SECOND_STORY.title,
      FIRST_STORY.title,
    ]);
  });

  test('shows the cover the API sends rather than digging one out of the text', async ({ page, api }) => {
    const story = makeStory({ coverImageUrl: BLANK_IMAGE });
    api.get('/stories', { json: { data: [story] } });

    await seedAuthToken(page);
    await page.goto('/bookshelf');

    const card = page.getByTestId(`bookshelf-card-${story.id}`);
    await expect(card).toBeVisible();
    await expect(card.locator('img')).toHaveAttribute('src', BLANK_IMAGE);
  });

  test('an empty shelf says so instead of showing nothing', async ({ page, api }) => {
    api.get('/stories', { json: { data: [] } });

    await seedAuthToken(page);
    await page.goto('/bookshelf');

    await expect(page.getByTestId('bookshelf-empty')).toBeVisible();
    await expect(page.getByTestId('bookshelf-empty')).toContainText('No Stories Yet');
    await expect(page.getByTestId('bookshelf-list')).toBeHidden();
  });

  test('a failed load offers Try Again, and retrying brings the shelf back', async ({ page, api }) => {
    let backendIsDown = true;
    api.get('/stories', () =>
      backendIsDown
        ? { status: 500, json: { message: 'Server Error' } }
        : { json: { data: TEST_STORIES } },
    );

    await seedAuthToken(page);
    await page.goto('/bookshelf');

    await expect(page.getByTestId('bookshelf-error')).toBeVisible();
    await expect(page.getByTestId('bookshelf-error')).toContainText('Could not load your stories.');

    backendIsDown = false;
    await page.getByTestId('bookshelf-retry').click();

    await expect(page.getByTestId('bookshelf-list')).toBeVisible();
    await expect(page.getByTestId(`bookshelf-card-${FIRST_STORY.id}`)).toBeVisible();
  });

  test('tapping a story opens it in the reader at page one', async ({ signedInPage: page }) => {
    await page.getByTestId('tab-bookshelf').click();
    await page.getByTestId(`bookshelf-card-${FIRST_STORY.id}`).click();

    await expect(page.getByTestId('book-reader')).toBeVisible();
    await expect(page.getByTestId('book-story-name')).toHaveText(FIRST_STORY.title);
    await expect(page).toHaveURL(new RegExp(`/bookshelf/${FIRST_STORY.id}$`));
  });
});

test.describe('reader', () => {
  test('renders the first page with its text and illustration', async ({ page }) => {
    await openReader(page);

    await expect(page.getByTestId('book-page-number')).toHaveText('Page 1 of 3');
    await expect(page.getByTestId('book-page-text')).toContainText(FIRST_STORY.pages[0].content);
    await expect(page.getByTestId('book-page-image')).toBeVisible();
  });

  test('the arrows move through the pages', async ({ page }) => {
    await openReader(page);
    await expect(page.getByTestId('book-page-number')).toHaveText('Page 1 of 3');

    await page.getByTestId('book-next-page').click();
    await expect(page.getByTestId('book-page-number')).toHaveText('Page 2 of 3');
    await expect(page.getByTestId('book-page-text')).toContainText(FIRST_STORY.pages[1].content);
    // The title only belongs on the cover page.
    await expect(page.getByTestId('book-story-name')).toBeHidden();

    await page.getByTestId('book-prev-page').click();
    await expect(page.getByTestId('book-page-number')).toHaveText('Page 1 of 3');
    await expect(page.getByTestId('book-story-name')).toBeVisible();
  });

  test('the arrow keys turn pages too', async ({ page }) => {
    await openReader(page);
    await expect(page.getByTestId('book-page-number')).toHaveText('Page 1 of 3');

    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('book-page-number')).toHaveText('Page 2 of 3');

    await page.keyboard.press('ArrowLeft');
    await expect(page.getByTestId('book-page-number')).toHaveText('Page 1 of 3');
  });

  test('past the last page comes the end page, and Read Again starts over', async ({ page }) => {
    await openReader(page);
    await expect(page.getByTestId('book-page-number')).toHaveText('Page 1 of 3');

    for (let i = 0; i < FIRST_STORY.pages.length; i++) {
      await page.getByTestId('book-next-page').click();
    }

    await expect(page.getByTestId('book-end-page')).toBeVisible();
    await expect(page.getByTestId('book-end-page')).toContainText('The End!');
    // Opened from the bookshelf, so the end page offers the shelf — not the
    // "Create New Story" the generation flow ends on.
    await expect(page.getByTestId('book-end-back-to-bookshelf')).toBeVisible();

    await page.getByTestId('book-read-again').click();
    await expect(page.getByTestId('book-page-number')).toHaveText('Page 1 of 3');
  });

  test('Back to Bookshelf returns to the shelf', async ({ page }) => {
    await openReader(page);
    await expect(page.getByTestId('book-reader')).toBeVisible();

    await page.getByTestId('book-back-to-bookshelf').click();

    await expect(page.getByTestId('bookshelf-list')).toBeVisible();
    await expect(page.getByTestId('book-reader')).toBeHidden();
  });

  test('a story that will not load says so and offers a way back', async ({ page }) => {
    // An id no story answers to, so the mock's `/stories/*` rule 404s.
    await openReader(page, 999);

    await expect(page.getByTestId('story-error')).toBeVisible();
    await expect(page.getByTestId('book-reader')).toBeHidden();

    await page.getByTestId('story-error-back').click();
    await expect(page.getByTestId('bookshelf-list')).toBeVisible();
  });

  test('a legacy body is still split into pages', async ({ page, api }) => {
    // Stories written before the API returned structured pages carry their
    // text in `body`, split on the same marker the generator writes.
    const legacy = makeStory({
      id: 201,
      pages: [],
      body: 'The first page.\n\n---PAGE BREAK---\n\nThe second page.',
    });
    api.get('/stories/*', { json: { data: legacy } });

    await openReader(page, legacy.id);

    await expect(page.getByTestId('book-page-number')).toHaveText('Page 1 of 2');
    await expect(page.getByTestId('book-page-text')).toContainText('The first page.');

    await page.getByTestId('book-next-page').click();
    await expect(page.getByTestId('book-page-text')).toContainText('The second page.');
  });

  test('a page with no illustration asks the backend for one', async ({ page, api }) => {
    const story = makeStory({
      id: 202,
      pages: [
        { content: 'A page still waiting on its picture.', imageUrl: null, illustrationPrompt: 'a fox' },
        { content: 'The page after it.', imageUrl: BLANK_IMAGE, illustrationPrompt: 'a field' },
      ],
    });
    api.get('/stories/*', { json: { data: story } });
    // Hold the picture back for a moment, so the shimmer placeholder is a state
    // the test can see rather than a frame that may already be gone.
    api.post('/stories/*/pages/*/image', { json: { imageUrl: BLANK_IMAGE }, delayMs: 1000 });

    await openReader(page, story.id);

    await expect(page.getByTestId('book-page-image-loading')).toBeVisible();

    // react-native-web renders an Image as a wrapper around a real <img>.
    await expect(page.getByTestId('book-page-image').locator('img')).toHaveAttribute('src', BLANK_IMAGE);
    await expect(page.getByTestId('book-page-image-loading')).toBeHidden();

    const imageRequests = api.requestsFor('POST', '/stories/*/pages/*/image');
    expect(imageRequests.length).toBeGreaterThan(0);
    // Page numbers are 1-based over the wire.
    expect(imageRequests[0].path).toBe(`/stories/${story.id}/pages/1/image`);
  });
});

test.describe('narration', () => {
  test('opening a story narrates page one', async ({ page, api }) => {
    await openReader(page);

    await expect(page.getByTestId('narration-controls')).toBeVisible();
    // The control shows Pause only once playback has actually started.
    await expect(page.getByLabel('Pause narration')).toBeVisible();
    await expect(page.getByTestId('narration-error')).toBeHidden();

    const audioRequests = api.requestsFor('POST', '/stories/*/pages/*/audio');
    expect(audioRequests.length).toBeGreaterThan(0);
    expect(audioRequests[0].path).toBe(`/stories/${FIRST_STORY.id}/pages/1/audio`);
  });

  test('pausing stops narration, and the next page stays quiet', async ({ page, api }) => {
    await openReader(page);
    await page.getByLabel('Pause narration').click();

    await expect(page.getByLabel('Play narration')).toBeVisible();
    const callsWhilePaused = api.requestsFor('POST', '/stories/*/pages/*/audio').length;

    await page.getByTestId('book-next-page').click();
    await expect(page.getByTestId('book-page-number')).toHaveText('Page 2 of 3');

    // Give the page-change effect room to fire before asserting that it did
    // not: with no wait this passes whether narration is suppressed or merely
    // slower than the assertion.
    await page.waitForTimeout(1000);

    // Pause is a preference, not a one-page mute: no TTS until Play is pressed.
    await expect(page.getByLabel('Play narration')).toBeVisible();
    expect(api.requestsFor('POST', '/stories/*/pages/*/audio')).toHaveLength(callsWhilePaused);

    // Stops here on purpose. Pressing Play now replays page one's narration
    // over page two instead of fetching page two's — see card #109. Assert the
    // Play-after-pause behaviour once that is fixed.
  });

  test('a failed narration shows an error with a retry that recovers', async ({ page, api }) => {
    let ttsIsDown = true;
    api.post('/stories/*/pages/*/audio', () =>
      ttsIsDown
        ? { status: 500, json: { message: 'Server Error' } }
        : { headers: { 'content-type': 'audio/mpeg' }, buffer: SILENT_MP3 },
    );

    await openReader(page);

    await expect(page.getByTestId('narration-error')).toBeVisible();
    await expect(page.getByTestId('narration-error')).toContainText('Failed to generate audio');
    // A failed narration must not take the story with it.
    await expect(page.getByTestId('book-page-text')).toContainText(FIRST_STORY.pages[0].content);

    ttsIsDown = false;
    await page.getByTestId('narration-retry').click();

    await expect(page.getByTestId('narration-error')).toBeHidden();
  });

  test('a rate-limited narration says when it will come back, with no retry', async ({ page, api }) => {
    api.post('/stories/*/pages/*/audio', { status: 429, json: { message: 'Too Many Requests' } });

    await openReader(page);

    await expect(page.getByTestId('narration-error')).toContainText('Rate limit exceeded');
    // Retrying into a rate limit would only make it worse, so no button.
    await expect(page.getByTestId('narration-retry')).toBeHidden();
  });
});
