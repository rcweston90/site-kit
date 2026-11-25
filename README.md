# site-kit

MIT-licensed packages pulled out of a personal site's CMS: a whole story CMS (content model, storage, reader and in-place editor) and three small packages that are useful on their own.

## The story CMS

Long-form stories with chapters and rich blocks, edited in place on the real page, saved as append-only versions and published by pointer. Storage, media and sign-in sit behind adapters, so it runs on Postgres or in memory, keeps uploads on S3-compatible storage or local disk, and mounts in any framework that speaks web `Request` and `Response`.

| Package | What it does | Depends on |
| --- | --- | --- |
| [`@rcweston/story-core`](packages/story-core) | The content model, validation, publish readiness, renames and the contract every other part implements. Pure TypeScript. | nothing |
| [`@rcweston/story-server`](packages/story-server) | Request handlers plus adapters: memory and Postgres stores with explicit migrations, memory, local-disk and S3 media, a passcode sign-in. | story-core; `pg` and `aws4fetch` only if you use them |
| [`@rcweston/story-react`](packages/story-react) | The reader: the story page and every part of it, themed with `--story-*` tokens, custom blocks from your own registry. | React, Lucide |
| [`@rcweston/story-editor`](packages/story-editor) | The in-place editor: block tools and continuous writing over the reader's own components, talking to any backend through one transport. | React, Tiptap, Radix UI, save-kit |

[`apps/demo`](apps/demo) runs all of it locally with made-up stories:

```sh
pnpm install && pnpm build
pnpm --filter @rcweston/story-demo dev   # http://localhost:3000, editor at /admin
```

## Small packages

| Package | What it does | Depends on |
| --- | --- | --- |
| [`@rcweston/credits`](packages/credits) | Credits as data, checked in CI: the build fails when a dependency isn't credited. | nothing |
| [`@rcweston/save-kit`](packages/save-kit) | The save layer for React editing screens: failures in plain words, delete with Undo, kept edits, a leave guard, ⌘S, and signing back in over the page. | React |
| [`@rcweston/xray`](packages/xray) | An on-page inspector for spacing, type, tokens and accessibility, measured on the live page against your own rhythm. | React, Lucide |

## Working on it

```sh
pnpm install
pnpm check   # scrub, typecheck, tests, build, credits: what CI runs
```

Everything runs locally. Nothing here deploys anywhere.

## How this repo stays clean

This repo was built fresh, from an allowlist, with no history from the site it came from. Two checks keep it that way:

- **The scrub check** (`scripts/scrub.mjs`) runs first in CI and fails closed. It refuses private folders, font files, media, database dumps, env files and agent notes; common secret shapes; hosting variable names and storage hostnames; and a list of names that must never appear, which is stored as salted hashes so the list itself names nothing. `scripts/scrub.test.mjs` plants each kind of leak and proves it fails.
- **The credits check** runs the repo's own `@rcweston/credits` against `credits.config.mjs`. A new dependency anywhere in the workspace fails CI until it's credited.

## Credits

See [`credits.config.mjs`](credits.config.mjs). Designed and engineered by Charlie Weston, pair-programming with Claude Code.

## Licence

MIT. See [LICENSE](LICENSE).
