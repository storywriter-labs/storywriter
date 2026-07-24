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
}

/**
 * A 1x1 transparent PNG. Illustrations have to resolve to *something* or the
 * reader sits on its shimmer placeholder forever, and we don't want tests
 * reaching out to a real image host.
 */
export const BLANK_IMAGE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

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
