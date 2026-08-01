import type { Page } from '@playwright/test';

import { test, expect, seedAuthToken } from './fixtures/test';
import { ConversationMock } from './fixtures/conversation-mock';
import { BLANK_IMAGE, TEST_STORIES, generationResponse, makeStory } from './fixtures/data';

/**
 * Tier 3 — the creation flow: talk to the agent, get a story, read it.
 *
 * This is the one flow with no seam to mock in our own code. The app doesn't
 * open the conversation socket — `@elevenlabs/client` does, from a signed URL
 * the backend hands back — so the mock sits at the WebSocket itself
 * (`fixtures/conversation-mock.ts`) and speaks the protocol the SDK expects.
 * The SDK, its microphone capture and its audio worklets all run for real
 * against Chromium's fake audio device. Nothing reaches ElevenLabs or
 * Together AI: story text and page images come from the API mock.
 *
 * The story the flow produces is the *first* TEST_STORIES entry, because that
 * is what the mocked `POST /stories/generate` answers with.
 */

const [GENERATED_STORY] = TEST_STORIES;

/**
 * Answer the page-narration endpoint with something the player can decode.
 *
 * The reader narrates page one the moment it opens, so every test here reaches
 * this endpoint whether it cares about narration or not — and Chromium rejects
 * `play()` on anything it can't decode, which would leave an audio error on
 * screen through assertions that have nothing to do with sound. Narration
 * itself is Tier 2's subject, so this only has to be quiet and real.
 *
 * Registered with `page.route` rather than through the API mock because later
 * routes win in Playwright, and because the mock's bodies are strings — sending
 * MP3 bytes as a string mangles every byte above 0x7f.
 */
async function silenceNarration(page: Page): Promise<void> {
  // MPEG-1 Layer III, 44.1 kHz, 32 kbps, mono, no CRC: a 4-byte header plus 100
  // zero bytes per frame, which decodes to silence. 40 frames is about a second.
  const frameHeader = [0xff, 0xfb, 0x10, 0xc0];
  const body = Buffer.alloc(40 * 104);
  for (let frame = 0; frame < 40; frame++) {
    body.set(frameHeader, frame * 104);
  }

  await page.route('**/api/v1/stories/*/pages/*/audio', (route) =>
    route.fulfill({ status: 200, headers: { 'content-type': 'audio/mpeg' }, body }),
  );
}

/** Start a conversation from the welcome screen and wait for it to be live. */
async function startConversation(page: Page, conversation: { waitForConnection: () => Promise<void> }) {
  await page.getByTestId('welcome-start-story').click();
  await conversation.waitForConnection();
  await expect(page.getByTestId('conversation-active')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await silenceNarration(page);
});

test.describe('conversation', () => {
  test('Create a Story asks the backend for a signed URL and opens the socket', async ({
    signedInPage: page,
    conversation,
    api,
  }) => {
    await expect(page.getByTestId('welcome-start-story')).toBeVisible();
    await startConversation(page, conversation);

    // The signed URL is fetched from our backend, never from ElevenLabs — that
    // is the whole point of the proxy (see CLAUDE.md, backend-proxy pattern).
    expect(api.requestsFor('POST', '/conversation/sdk-credentials')).toHaveLength(1);

    // Idle between turns, the agent is listening.
    await expect(page.getByTestId('conversation-speaker-label')).toHaveText('Listening...');
  });

  test('the speaker label follows whoever is talking', async ({ signedInPage: page, conversation }) => {
    await startConversation(page, conversation);

    conversation.agentSays('What kind of story would you like today?');
    await expect(page.getByTestId('conversation-speaker-label')).toHaveText('Agent is speaking');

    conversation.userSays('A story about a dragon who is scared of fire');
    await expect(page.getByTestId('conversation-speaker-label')).toHaveText('You are speaking');
  });

  test('a refused socket shows the error card, and Try Again reconnects', async ({ page, api }) => {
    // Fail the handshake only the first time, so the retry has something to
    // succeed against. The mock is installed by hand here because the fixture's
    // options are set per file, and this test needs both outcomes in one run.
    const failing = new ConversationMock({ failHandshake: true });
    await failing.install(page);

    await seedAuthToken(page);
    await page.goto('/');
    await expect(page.getByTestId('tab-lab')).toBeVisible();

    await page.getByTestId('welcome-start-story').click();

    await expect(page.getByTestId('conversation-error')).toBeVisible();
    // A child is never shown the provider's error text.
    await expect(page.getByTestId('conversation-error')).not.toContainText('socket');
    await expect(page.getByTestId('conversation-active')).toBeHidden();

    // Replace the failing socket with one that answers, then press retry.
    const working = new ConversationMock();
    await working.install(page);
    await page.getByTestId('conversation-error-retry').click();

    await working.waitForConnection();
    await expect(page.getByTestId('conversation-active')).toBeVisible();
    await expect(page.getByTestId('conversation-error')).toBeHidden();
    expect(api.requestsFor('POST', '/conversation/sdk-credentials').length).toBeGreaterThan(1);
  });

  test.fail(
    'the agent ending the call should generate the story, and does not',
    async ({ signedInPage: page, conversation }) => {
      // The agent says "I have enough, write the story" by calling the
      // `end_conversation` client tool, and the helper text under the microphone
      // promises exactly that: "The agent will automatically end the
      // conversation when ready to create your story."
      //
      // It cannot happen. `useConversation` watches for the tool call on
      // `onMessage`, but the SDK never routes client tool calls there — it looks
      // them up in `clientTools`, and calls `onError` when it finds nothing. So
      // the child gets the error card instead of their story. Filed as Fizzy
      // #111; this test is marked `fail` on purpose and turns green when it is
      // fixed.
      await startConversation(page, conversation);

      conversation.agentSays('What kind of story would you like?');
      conversation.userSays('A dragon who is scared of fire');
      conversation.agentSays('Where does the dragon live?');
      conversation.userSays('Under a waterfall');
      conversation.callsEndConversation();

      await expect(page.getByTestId('story-generation-splash')).toBeVisible();
    },
  );

  test('a dropped connection still writes the story from what was said', async ({
    signedInPage: page,
    conversation,
    api,
  }) => {
    await startConversation(page, conversation);

    conversation.agentSays('What kind of story would you like?');
    conversation.userSays('A hamster astronaut who flies to the moon');
    conversation.agentSays('What is the hamster called?');
    conversation.userSays('Captain Fluffkins, and he is looking for cheese');

    conversation.disconnect();

    await expect(page.getByTestId('book-reader')).toBeVisible();

    // The transcript is what was actually said, not a canned one.
    const [generate] = api.requestsFor('POST', '/stories/generate');
    const { transcript } = generate.body as { transcript: string };
    expect(transcript).toContain('Captain Fluffkins');
    expect(transcript).toContain('hamster astronaut');
  });

  test('a dropped connection with only one answer writes nothing', async ({
    signedInPage: page,
    conversation,
    api,
  }) => {
    await startConversation(page, conversation);

    conversation.agentSays('What kind of story would you like?');
    conversation.userSays('A dragon');
    await expect(page.getByTestId('conversation-speaker-label')).toHaveText('You are speaking');

    conversation.disconnect();

    // One answer is not a story. Nothing is generated and nothing is billed.
    await expect(page.getByTestId('story-generation-splash')).toBeHidden();
    await expect(page.getByTestId('book-reader')).toBeHidden();
    expect(api.requestsFor('POST', '/stories/generate')).toHaveLength(0);
  });
});

test.describe('story generation', () => {
  test('skipping the conversation goes splash -> story, and sends a transcript', async ({
    signedInPage: page,
    conversation,
    api,
  }) => {
    await startConversation(page, conversation);
    await page.getByTestId('conversation-skip').click();

    await expect(page.getByTestId('story-generation-splash')).toBeVisible();
    await expect(page.getByTestId('story-generation-splash')).toContainText('Creating your story...');

    await expect(page.getByTestId('book-reader')).toBeVisible();
    await expect(page.getByTestId('story-generation-splash')).toBeHidden();

    const [generate] = api.requestsFor('POST', '/stories/generate');
    const { transcript } = generate.body as { transcript: string };
    expect(transcript).toContain('User:');
    expect(transcript).toContain('Agent:');
  });

  test('the finished story opens in the reader at page one', async ({
    signedInPage: page,
    conversation,
  }) => {
    await startConversation(page, conversation);
    await page.getByTestId('conversation-skip').click();

    await expect(page.getByTestId('book-reader')).toBeVisible();
    await expect(page.getByTestId('book-story-name')).toHaveText(GENERATED_STORY.title);
    await expect(page.getByTestId('book-page-number')).toHaveText('Page 1 of 3');
    await expect(page.getByTestId('book-page-text')).toContainText(GENERATED_STORY.pages[0].content);
  });

  test('a failed generation offers Try Again and does not retry on its own', async ({
    signedInPage: page,
    conversation,
    api,
  }) => {
    let generatorIsDown = true;
    api.post('/stories/generate', () =>
      generatorIsDown
        ? { status: 500, json: { message: 'Server Error' } }
        : { json: { data: generationResponse(GENERATED_STORY) } },
    );

    await startConversation(page, conversation);
    await page.getByTestId('conversation-skip').click();

    await expect(page.getByTestId('story-generation-error')).toBeVisible();
    await expect(page.getByTestId('story-generation-retry')).toBeVisible();

    // The app must not retry behind the child's back — the "Try Again" button is
    // the retry. Give it room to misbehave before counting.
    await page.waitForTimeout(3000);
    expect(api.requestsFor('POST', '/stories/generate')).toHaveLength(1);

    generatorIsDown = false;
    await page.getByTestId('story-generation-retry').click();

    await expect(page.getByTestId('book-reader')).toBeVisible();
    expect(api.requestsFor('POST', '/stories/generate')).toHaveLength(2);
  });

  test('a story that comes back with no pages is treated as a failure', async ({
    signedInPage: page,
    conversation,
    api,
  }) => {
    api.post('/stories/generate', {
      json: { data: generationResponse(GENERATED_STORY, { pages: [], page_count: 0 }) },
    });

    await startConversation(page, conversation);
    await page.getByTestId('conversation-skip').click();

    await expect(page.getByTestId('story-generation-error')).toBeVisible();
    await expect(page.getByTestId('book-reader')).toBeHidden();
  });

  test('a page with no picture yet has one generated for it', async ({
    signedInPage: page,
    conversation,
    api,
  }) => {
    const story = makeStory({
      pages: [
        { content: 'The dragon blew a rainbow bubble.', imageUrl: null, illustrationPrompt: 'a bubble dragon' },
        { content: 'Squibble the frog cheered.', imageUrl: null, illustrationPrompt: 'a frog cheering' },
      ],
    });
    api.post('/stories/generate', { json: { data: generationResponse(story) } });

    await startConversation(page, conversation);
    await page.getByTestId('conversation-skip').click();

    await expect(page.getByTestId('book-reader')).toBeVisible();

    // Asked for page 1 by its 1-based number, against the id generation returned.
    await expect
      .poll(() => api.requestsFor('POST', `/stories/${story.id}/pages/1/image`).length)
      .toBe(1);

    // And the picture that came back is on the page. Located by src rather than
    // by a testID: the reader's illustration has none on main yet.
    await expect(page.getByTestId('book-reader').locator(`img[src="${BLANK_IMAGE}"]`)).toBeVisible();
  });
});

test.describe('the end of the story', () => {
  /** Take the flow all the way to the last page of a freshly generated story. */
  async function readToTheEnd(page: Page): Promise<void> {
    await expect(page.getByTestId('book-page-number')).toHaveText('Page 1 of 3');
    await page.getByTestId('book-next-page').click();
    await page.getByTestId('book-next-page').click();
    await expect(page.getByTestId('book-page-number')).toHaveText('Page 3 of 3');
    await page.getByTestId('book-next-page').click();
  }

  test('the end page offers the three new-story choices, not the bookshelf ones', async ({
    signedInPage: page,
    conversation,
  }) => {
    await startConversation(page, conversation);
    await page.getByTestId('conversation-skip').click();
    await expect(page.getByTestId('book-reader')).toBeVisible();

    await readToTheEnd(page);

    await expect(page.getByTestId('book-end-page')).toBeVisible();
    await expect(page.getByTestId('book-end-page')).toContainText('The End!');
    await expect(page.getByTestId('book-create-new-story')).toBeVisible();
    await expect(page.getByTestId('book-read-again')).toBeVisible();
    await expect(page.getByTestId('book-exit')).toBeVisible();
    // Those belong to a story opened from the shelf, which this one was not.
    await expect(page.getByTestId('book-end-back-to-bookshelf')).toBeHidden();
  });

  test('Read Again goes back to page one', async ({ signedInPage: page, conversation }) => {
    await startConversation(page, conversation);
    await page.getByTestId('conversation-skip').click();
    await expect(page.getByTestId('book-reader')).toBeVisible();

    await readToTheEnd(page);
    await page.getByTestId('book-read-again').click();

    await expect(page.getByTestId('book-page-number')).toHaveText('Page 1 of 3');
    await expect(page.getByTestId('book-page-text')).toContainText(GENERATED_STORY.pages[0].content);
  });

  test('Create New Story clears the story and offers the welcome screen again', async ({
    signedInPage: page,
    conversation,
  }) => {
    await startConversation(page, conversation);
    await page.getByTestId('conversation-skip').click();
    await expect(page.getByTestId('book-reader')).toBeVisible();

    await readToTheEnd(page);
    await page.getByTestId('book-create-new-story').click();

    await expect(page.getByTestId('book-reader')).toBeHidden();
    await expect(page.getByTestId('welcome-start-story')).toBeVisible();
  });

  test('closing the reader drops the story rather than leaving it half-open', async ({
    signedInPage: page,
    conversation,
  }) => {
    await startConversation(page, conversation);
    await page.getByTestId('conversation-skip').click();
    await expect(page.getByTestId('book-reader')).toBeVisible();

    await page.getByTestId('book-close').click();

    await expect(page.getByTestId('book-reader')).toBeHidden();
    await expect(page.getByTestId('welcome-start-story')).toBeVisible();
  });

  test('a new story can be started straight after finishing one', async ({
    signedInPage: page,
    conversation,
    api,
  }) => {
    await startConversation(page, conversation);
    await page.getByTestId('conversation-skip').click();
    await expect(page.getByTestId('book-reader')).toBeVisible();

    await readToTheEnd(page);
    await page.getByTestId('book-create-new-story').click();
    await expect(page.getByTestId('welcome-start-story')).toBeVisible();

    // Second time round: a fresh socket, a fresh signed URL, a fresh story.
    await startConversation(page, conversation);
    await page.getByTestId('conversation-skip').click();

    await expect(page.getByTestId('book-reader')).toBeVisible();
    await expect(page.getByTestId('book-page-number')).toHaveText('Page 1 of 3');
    expect(api.requestsFor('POST', '/stories/generate')).toHaveLength(2);
    expect(api.requestsFor('POST', '/conversation/sdk-credentials')).toHaveLength(2);
  });
});
