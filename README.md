# StoryWriter

Create your own digital storybooks with the help of a cyber assistant!

This app is designed for kids to use on a tablet. They can speak with an AI assistant to generate text and images in a storybook display, and the machine will read out the story.

This is for entertainment purposes and to encourage a love of books and storytelling in young technologists!

https://storywriter.net

## Releases & deployment

Deploys are driven by [`deploy-frontend.yml`](.github/workflows/deploy-frontend.yml)
(see [.github/workflows/README.md](.github/workflows/README.md) for workflow details):

| Trigger | Environment |
|---|---|
| Merge/push to `main` | **staging** (unattended) |
| Push a `v*` tag | **production** (waits for manual approval) |
| Manual `workflow_dispatch` | your choice of staging/production |

The production GitHub environment has a required-reviewer rule, so every
production deploy — including tag pushes — pauses at an approval button in the
Actions UI. Staging deploys run unattended.

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
