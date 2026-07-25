# StoryWriter

Create your own digital storybooks with the help of a cyber assistant!

This app is designed for kids to use on a tablet. They can speak with an AI assistant to generate text and images in a storybook display, and the machine will read out the story.

This is for entertainment purposes and to encourage a love of books and storytelling in young technologists!

https://storywriter.net

## Tests

`npm test` runs the Jest unit tests. `npm run test:e2e` runs the Playwright
end-to-end tests, which drive the real app in a browser.

### End-to-end tests

The E2E suite lives in `e2e/` and runs against the Expo **web** build in
Chromium at a tablet-landscape viewport, since that's the shape the app is
designed for.

**There is no backend involved.** Every call the app makes goes to
`/api/v1/...` through `src/api/client.js`, and `e2e/fixtures/api-mock.ts`
intercepts that whole prefix with `page.route`. So the tests need no Laravel
server, no database, and no Together AI or ElevenLabs keys — and they can't
run up an AI bill. Any endpoint without a mock gets a 501 back, which shows up
in `api.unhandled` so a missed one fails loudly instead of silently reaching
for a real server.

```bash
npm run test:e2e            # headless, against the Expo dev server
npm run test:e2e:ui         # Playwright's watch UI
npm run test:e2e:report     # open the last HTML report
```

Locally the tests boot `expo start --web`; on CI they run against the static
`expo export` output — the same artifact the deploy workflow ships — so the
build that gets tested is the build that goes live. First run needs the browser:

```bash
npx playwright install --with-deps chromium
```

Writing a test:

```ts
import { test, expect } from './fixtures/test';

test('the bookshelf shows a story', async ({ signedInPage, api }) => {
  api.get('/stories', { json: { data: [] } });   // override any default
  await signedInPage.getByTestId('tab-bookshelf').click();
  await expect(signedInPage.getByTestId('bookshelf-empty')).toBeVisible();
});
```

Screens are addressed by `testID` (react-native-web renders these as
`data-testid`, so `getByTestId` just works). Prefer adding a `testID` to a new
element over matching its text — copy changes, test IDs don't.

## Releases & deployment

Deploys are driven by [`deploy-frontend.yml`](.github/workflows/deploy-frontend.yml)
(see [.github/workflows/README.md](.github/workflows/README.md) for workflow details):

| Trigger | Environment |
|---|---|
| Merge/push to `main` | **staging** (unattended) |
| Push a `vX.Y.Z` tag | **production** (waits for manual approval) |
| Manual `workflow_dispatch` | your choice of staging/production |

The production GitHub environment has a required-reviewer rule, so every
production deploy — including tag pushes — pauses at an approval button in the
Actions UI. Staging deploys run unattended.

**Nothing reaches production except from a release tag.** Three things enforce
that, and it's worth knowing all three, because hitting one of them looks like
a different failure each time:

- The push trigger only matches semver-shaped tags (`v[0-9]*.[0-9]*.[0-9]*`),
  so a stray tag like `vnext` simply doesn't start a run.
- The *Run workflow* ref picker defaults to `main`, and the environment
  dropdown is otherwise taken at face value — so dispatching `production` from
  a branch fails fast on the **Require a release tag for production** step.
  Pick the release tag in the ref dropdown as well as `production`.
- The `production` GitHub environment restricts deployments to tags matching
  `v*.*.*`, which holds even if someone edits the workflow. A run that trips
  this one is rejected at the environment gate rather than by a workflow step.

Staging is deliberately unrestricted — dispatch it from any branch you like.

`package.json` is the single source of truth for the version: `app.config.js`
reads it, and the git tag is created from it by `npm version`. Never hand-edit
one of the three.

### Cutting a release

1. On an up-to-date `main` with a clean working tree:

   ```bash
   npm version patch   # or minor / major
   ```

   The `preversion` hook runs `npm run validate` (type-check + tests) first;
   then npm bumps `package.json`, commits, and creates the matching `vX.Y.Z`
   tag in one step.

2. Push the commit and the tag:

   ```bash
   git push origin main --follow-tags
   ```

3. In the Actions UI, approve the production deploy on the tag's run of
   **Deploy Frontend**. (The same push also starts a staging run for the
   `main` commit — that's expected; two runs per release is normal.)

4. Verify https://storywriter.net serves the release.

### Hotfixes

Default path — `main` is releasable: commit the fix to `main` (via PR as
usual), then cut a patch release from it (`npm version patch`, push, approve).

Only when `main` carries unreleased work you don't want to ship yet, branch
from the last release tag instead:

```bash
git checkout -b hotfix/vX.Y.(Z+1) vX.Y.Z   # branch from the last released tag
# commit the fix (or cherry-pick it from main)
npm version patch                           # validates, bumps, commits, tags
git push origin HEAD --follow-tags          # the v* tag triggers the production deploy
```

Approve the production deploy as usual, then **merge the hotfix branch back
into `main`** so the fix and the version bump aren't lost.

### Rollback

Two options, depending on how fast you need to be:

- **Clean path — redeploy a known-good tag.** Actions → **Deploy Frontend** →
  *Run workflow* → pick the previous release tag as the ref and `production`
  as the environment. This rebuilds that code from scratch and redeploys it —
  the state afterwards is exactly "that tag is live". Goes through the normal
  approval gate.

- **Fast path — restore the pre-deploy S3 backup.** Actions →
  **Rollback Frontend** ([`rollback-frontend.yml`](.github/workflows/rollback-frontend.yml))
  → pick the environment and optionally a backup timestamp (defaults to the
  most recent). Every deploy snapshots the previous site into
  `backups/<environment>/<timestamp>/` in the site bucket first; this restores
  those files and invalidates CloudFront. No rebuild, so it's fast — but it
  only restores the deployed files; the repo/tag state still points at the bad
  release, so follow up with a proper patch release.

  This workflow runs against `production` too, so the environment's tag
  restriction applies to it as well: **pick a release tag as the ref**, not
  `main`, or the run is rejected before it starts. It doesn't matter which tag
  — the workflow only touches S3 and CloudFront, never the checked-out code —
  but the ref dropdown has to be on one. Worth knowing before you need it, at
  three in the morning, with the site down.
