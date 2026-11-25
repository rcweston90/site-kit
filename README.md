# site-kit

Three small, MIT-licensed packages pulled out of a personal site's CMS, each useful on its own.

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
