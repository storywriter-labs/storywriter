import type { Page, Request, Route } from '@playwright/test';

import {
  BLANK_IMAGE,
  SILENT_MP3,
  TEST_STORIES,
  TEST_TOKEN,
  TEST_USER,
  generationResponse,
  makeStory,
} from './data';
import { SIGNED_URL } from './conversation-mock';

/**
 * The app never talks to Together AI or ElevenLabs directly — everything goes
 * through the Laravel API at `${apiBaseUrl}/api/v1/...` (see src/api/client.js).
 * So intercepting that one prefix catches every network call the app makes, and
 * we don't have to care which host the bundle was built against.
 */
const API_GLOB = '**/api/v1/**';

export interface MockResponse {
  status?: number;
  json?: unknown;
  body?: string;
  /**
   * Binary body. `body` is sent as UTF-8, which mangles any byte above 0x7f —
   * audio has to come through here or it arrives at the player corrupted.
   */
  buffer?: Buffer;
  headers?: Record<string, string>;
  /**
   * Drop the connection instead of answering. This is what axios reports as a
   * "Network Error", which is the branch AuthContext classifies as 'network'.
   */
  networkError?: boolean;
  /** Hold the response open for this many ms — useful for asserting spinners. */
  delayMs?: number;
}

export type Responder = MockResponse | ((request: Request) => MockResponse | Promise<MockResponse>);

export interface RecordedRequest {
  method: string;
  /** Path with the `/api/v1` prefix stripped, e.g. `/auth/login`. */
  path: string;
  url: string;
  /** Parsed JSON body, or the raw string if it wasn't JSON, or null. */
  body: unknown;
  /** Lower-cased header names, so tests can assert on `authorization`. */
  headers: Record<string, string>;
}

interface Rule {
  method: string;
  pattern: RegExp;
  source: string;
  responder: Responder;
  /** Retire the rule after one match, so a test can queue two different answers. */
  once: boolean;
  used: boolean;
}

/**
 * Turn `/stories/*` or `/stories/*​/pages/*​/image` into a regex. A `*` matches
 * one path segment; `**` matches the rest of the path.
 *
 * `**` is parked on a NUL while `*` is expanded, so the two passes can't tread
 * on each other. Write it as the escape `'\0'`, never as a literal NUL byte: a
 * NUL in the source makes git call this file binary, which costs us the diff in
 * review and turns any two branches that both touch it into a merge you have to
 * redo by hand.
 */
function pathToRegExp(path: string): RegExp {
  const escaped = path
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\0')
    .replace(/\*/g, '[^/]+')
    .replace(/\0/g, '.*');
  return new RegExp(`^${escaped}$`);
}

/** Strip origin, `/api/v1` prefix and query string off a request URL. */
function toApiPath(url: string): string {
  const { pathname } = new URL(url);
  const index = pathname.indexOf('/api/v1');
  return index === -1 ? pathname : pathname.slice(index + '/api/v1'.length) || '/';
}

function parseBody(request: Request): unknown {
  const raw = request.postData();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

export class ApiMock {
  private readonly rules: Rule[] = [];
  private readonly recorded: RecordedRequest[] = [];
  /** Requests that hit `/api/v1` with no matching rule. Tests should assert this stays empty. */
  readonly unhandled: RecordedRequest[] = [];

  constructor(private readonly page: Page) {}

  /**
   * Register a responder. Later rules win over earlier ones, so a test can
   * override any of the defaults just by calling `api.get('/user', ...)` again.
   */
  route(method: string, path: string, responder: Responder, options: { once?: boolean } = {}): this {
    this.rules.push({
      method: method.toUpperCase(),
      pattern: pathToRegExp(path),
      source: `${method.toUpperCase()} ${path}`,
      responder,
      once: options.once ?? false,
      used: false,
    });
    return this;
  }

  get(path: string, responder: Responder, options?: { once?: boolean }): this {
    return this.route('GET', path, responder, options);
  }

  post(path: string, responder: Responder, options?: { once?: boolean }): this {
    return this.route('POST', path, responder, options);
  }

  delete(path: string, responder: Responder, options?: { once?: boolean }): this {
    return this.route('DELETE', path, responder, options);
  }

  /** Every intercepted request, in order. */
  get requests(): readonly RecordedRequest[] {
    return this.recorded;
  }

  /** Requests matching a method and exact path — for asserting what the app sent. */
  requestsFor(method: string, path: string): RecordedRequest[] {
    const pattern = pathToRegExp(path);
    const wanted = method.toUpperCase();
    return this.recorded.filter((r) => r.method === wanted && pattern.test(r.path));
  }

  /** Install the interceptor. Must happen before the first `page.goto`. */
  async install(): Promise<void> {
    await this.page.route(API_GLOB, (route, request) => this.handle(route, request));
  }

  private async handle(route: Route, request: Request): Promise<void> {
    const record: RecordedRequest = {
      method: request.method().toUpperCase(),
      path: toApiPath(request.url()),
      url: request.url(),
      body: parseBody(request),
      headers: request.headers(),
    };
    this.recorded.push(record);

    // Search newest-first so a test's override beats the default.
    const rule = [...this.rules]
      .reverse()
      .find((r) => !(r.once && r.used) && r.method === record.method && r.pattern.test(record.path));

    if (!rule) {
      this.unhandled.push(record);
      await route.fulfill({
        status: 501,
        contentType: 'application/json',
        body: JSON.stringify({
          message: `No API mock for ${record.method} ${record.path}. Add one in e2e/fixtures/api-mock.ts.`,
        }),
      });
      return;
    }

    rule.used = true;
    const response = typeof rule.responder === 'function' ? await rule.responder(request) : rule.responder;

    if (response.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, response.delayMs));
    }

    if (response.networkError) {
      await route.abort('connectionrefused');
      return;
    }

    const contentType = response.buffer
      ? 'application/octet-stream'
      : response.body === undefined
        ? 'application/json'
        : 'text/plain';

    await route.fulfill({
      status: response.status ?? 200,
      headers: { 'content-type': contentType, ...response.headers },
      body: response.buffer ?? response.body ?? JSON.stringify(response.json ?? {}),
    });
  }
}

/** Options for the happy-path defaults. */
export interface MockApiOptions {
  /** `null` makes `GET /user` answer 401, i.e. a stale token. */
  user?: typeof TEST_USER | null;
  /** What the bookshelf lists. Defaults to two stories. */
  stories?: ReturnType<typeof makeStory>[];
}

/**
 * Register a full set of happy-path responses. Rules are ordered so the more
 * specific ones are registered last and therefore win: `/stories/saved` has to
 * come after `/stories/*` or the wildcard would swallow it.
 */
export function applyDefaults(api: ApiMock, options: MockApiOptions = {}): ApiMock {
  const user = options.user === undefined ? TEST_USER : options.user;
  const stories = options.stories ?? TEST_STORIES;

  // --- auth ---
  api.get('/user', user ? { json: user } : { status: 401, json: { message: 'Unauthenticated.' } });

  api.post('/auth/login', { json: { token: TEST_TOKEN, user: user ?? TEST_USER } });
  api.post('/auth/register', { json: { token: TEST_TOKEN, user: user ?? TEST_USER } });
  api.post('/auth/logout', { json: { message: 'Logged out.' } });

  // --- stories ---
  api.get('/stories', { json: { data: stories } });
  api.get('/stories/*', (request) => {
    const slug = toApiPath(request.url()).split('/').pop();
    const story = stories.find((s) => s.slug === slug || String(s.id) === slug);
    return story
      ? { json: { data: story } }
      : { status: 404, json: { message: 'Story not found.' } };
  });
  // Registered after `/stories/*` so it wins the match.
  api.get('/stories/saved', { json: { data: stories } });
  api.post('/stories/*/save', { json: { data: stories[0] ?? makeStory() } });
  api.delete('/stories/*/unsave', { status: 204, json: {} });

  // --- generation (Together AI, proxied) ---
  // Note the shape: generation answers with `story_id` / `page_count`, not the
  // story record `GET /stories/{id}` returns. storyGenerationService reads those
  // keys by name, and a story with no `story_id` never gets its pages
  // illustrated or narrated.
  api.post('/stories/generate', { json: { data: generationResponse(stories[0] ?? makeStory()) } });
  api.post('/stories/*/pages/*/image', { json: { imageUrl: BLANK_IMAGE } });

  // --- voice (ElevenLabs, proxied) ---
  api.get('/conversation/voices', { json: { voices: [] } });
  // Narration for a saved story: the backend narrates the page it already
  // holds. This is the endpoint the bookshelf reader uses, since it always has
  // a story id. `/conversation/tts` is the fallback for a story that hasn't
  // been saved yet, so both answer with the same silence.
  api.post('/stories/*/pages/*/audio', {
    headers: { 'content-type': 'audio/mpeg' },
    buffer: SILENT_MP3,
  });
  api.post('/conversation/tts', {
    headers: { 'content-type': 'audio/mpeg' },
    buffer: SILENT_MP3,
  });
  // `signed_url`, not `signedUrl` — elevenLabsService reads the snake_case key
  // and throws "Missing signed_url in credentials response" without it. The URL
  // is answered by the WebSocket mock in `conversation-mock.ts`.
  api.post('/conversation/sdk-credentials', {
    json: { signed_url: SIGNED_URL },
  });

  return api;
}

/** Install the interceptor with happy-path defaults already registered. */
export async function mockApi(page: Page, options: MockApiOptions = {}): Promise<ApiMock> {
  const api = applyDefaults(new ApiMock(page), options);
  await api.install();
  return api;
}
