/**
 * Canned data the API mocks hand back. Shapes here mirror what the Laravel API
 * actually returns — if a response shape changes on the backend, change it here
 * and the E2E suite starts failing for the right reason.
 */

export const TEST_TOKEN = 'e2e-test-token';

export interface TestUser {
  id: number;
  name: string;
  email: string;
}

export const TEST_USER: TestUser = {
  id: 1,
  name: 'Test Parent',
  email: 'parent@example.com',
};

export interface TestPage {
  content: string;
  imageUrl: string | null;
  illustrationPrompt: string | null;
}

export interface TestStory {
  id: number;
  name: string;
  title: string;
  slug: string;
  body: string;
  prompt: string;
  created_at: string;
  pages: TestPage[];
  /** Signed cover URL the API hands back. Older stories don't have one. */
  coverImageUrl?: string | null;
}

/**
 * A 1x1 transparent PNG. Illustrations have to resolve to *something* or the
 * reader sits on its shimmer placeholder forever, and we don't want tests
 * reaching out to a real image host.
 */
export const BLANK_IMAGE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

/**
 * MPEG-1 Layer III frame header for 44.1 kHz, 32 kbps, mono, no CRC. Every
 * frame is 4 header bytes plus 100 zero bytes, which decodes to silence.
 */
const MP3_FRAME_HEADER = [0xff, 0xfb, 0x10, 0xc0];
const MP3_FRAME_BYTES = 104;
/** One frame of Layer III at 44.1 kHz is 1152 samples ≈ 26.12 ms. */
const MP3_FRAME_SECONDS = 1152 / 44100;

/**
 * A real, decodable MP3 of silence, built frame by frame.
 *
 * The narration player hands its bytes to an `<audio>` element, and Chromium
 * rejects `play()` on anything it can't decode — so a stand-in like an empty
 * body or a text placeholder would put every narration test on the playback
 * error path instead of the one it means to exercise. This is the smallest
 * thing that actually plays.
 *
 * Default length is generous on purpose: the clip has to outlast the
 * assertions that follow it, or narration finishes mid-test and the pause
 * control the test is looking for has already flipped back to play.
 */
export function silentMp3(seconds = 5): Buffer {
  const frames = Math.max(1, Math.ceil(seconds / MP3_FRAME_SECONDS));
  const buffer = Buffer.alloc(frames * MP3_FRAME_BYTES);
  for (let frame = 0; frame < frames; frame++) {
    buffer.set(MP3_FRAME_HEADER, frame * MP3_FRAME_BYTES);
  }
  return buffer;
}

/** The narration bytes the mocked TTS endpoints answer with. */
export const SILENT_MP3 = silentMp3();

export function makeStory(overrides: Partial<TestStory> = {}): TestStory {
  const pages: TestPage[] = overrides.pages ?? [
    {
      content: 'Once upon a time there was a very brave little fox.',
      imageUrl: BLANK_IMAGE,
      illustrationPrompt: 'a brave little fox',
    },
    {
      content: 'The fox packed a lunch and set off across the wide green field.',
      imageUrl: BLANK_IMAGE,
      illustrationPrompt: 'a fox walking through a field',
    },
    {
      content: 'And the fox found a friend, and they went home together.',
      imageUrl: BLANK_IMAGE,
      illustrationPrompt: 'two foxes walking home',
    },
  ];

  return {
    id: 101,
    name: 'The Brave Little Fox',
    title: 'The Brave Little Fox',
    slug: 'the-brave-little-fox',
    // Legacy body format, still parsed by parseStoryBody when `pages` is empty.
    body: pages.map((p) => p.content).join('\n\n'),
    prompt: 'a story about a brave fox',
    created_at: '2026-01-15T10:00:00.000Z',
    ...overrides,
    pages,
  };
}

/**
 * What `POST /stories/generate` answers with. This is *not* the story record the
 * rest of the API hands back: generation reports the new row's id under
 * `story_id`, and storyGenerationService reads that key by name (see its
 * `generateStory`). Get it wrong and the story arrives with a null id, which
 * silently costs it both its illustrations and its narration.
 */
export interface TestGenerationResponse {
  story_id: number;
  title: string;
  page_count: number;
  cover_image: string | null;
  pages: TestPage[];
}

export function generationResponse(
  story: TestStory,
  overrides: Partial<TestGenerationResponse> = {},
): TestGenerationResponse {
  return {
    story_id: story.id,
    title: story.title,
    page_count: story.pages.length,
    cover_image: null,
    pages: story.pages,
    ...overrides,
  };
}

export const TEST_STORIES: TestStory[] = [
  makeStory(),
  makeStory({
    id: 102,
    name: 'Dragon Goes to School',
    title: 'Dragon Goes to School',
    slug: 'dragon-goes-to-school',
    created_at: '2026-02-20T10:00:00.000Z',
    prompt: 'a story about a dragon at school',
  }),
];
