# @rcweston/credits

Credits as data, checked in CI. You write your project's credits once, field by field, the way a film's end credits run. The check fails the build when a dependency isn't credited, when a credit names a package that's gone, or when a link or path in the credits no longer holds.

The idea: crediting the work you stand on shouldn't depend on remembering to. A new dependency can't land until it has a line.

## Install

```sh
pnpm add -D @rcweston/credits
```

Node 20 or later. No runtime dependencies.

## Write your credits

`credits.config.mjs` at the root of your repo:

```js
/** @type {import('@rcweston/credits').CreditsConfig} */
export default {
  fields: [
    {
      id: 'engineering',
      title: 'Engineering',
      summary: 'The code.',
      credits: [
        { role: 'Framework', name: 'Next.js', note: 'Routing and server rendering', href: 'https://nextjs.org', packages: ['next'] },
        { role: 'Icons', name: 'Lucide', note: 'Every icon in the UI', href: 'https://lucide.dev', packages: ['lucide-react'] },
      ],
    },
    {
      id: 'type',
      title: 'Type',
      credits: [{ role: 'Typeface', name: 'Inter', note: 'Headings and body', href: 'https://rsms.me/inter', where: 'app/fonts.ts' }],
    },
  ],
  // Installed on purpose without a credit, each with the reason.
  uncredited: {
    '@types/node': 'Type definitions only; nothing ships.',
  },
};
```

A credit is a row: `role`, `name`, and optionally `note` (what it does here), `href` (https), `where` (repo paths, separated by ` · `) and `packages` (the npm packages it covers). One credit can cover several packages, like `react` and `react-dom`.

## Check them

```sh
npx credits-check
```

```
Credits check found 1 problem:
  ✗ date-fns (in package.json) needs a credit, or a reason in uncredited
```

Add it to CI next to your tests. The command exits `0` when the credits are honest, `1` when there are problems, and `2` when the config can't be loaded.

| Option | What it does |
| --- | --- |
| `--config <file>` | The credits file. Default: `credits.config.mjs`, `.js` or `.json`. A `.ts` file works when run through `tsx`. |
| `--root <dir>` | Where `where` paths and package.json paths start. Default: the config's folder. |
| `--package <file>` | A package.json to check. Repeat it for each workspace. Default: `package.json`. |
| `--json` | Print `{ ok, problems }` as JSON. |

Options can also live in the config under `check`, for example `check: { include: ['dependencies', 'devDependencies', 'peerDependencies'], ignore: [/^@internal\//] }`. Workspace links (`workspace:`, `link:`, `file:`) are never counted.

## What it checks

- Every installed package is credited, or listed in `uncredited` with a reason that isn't blank.
- Nothing credited or excused has been uninstalled.
- No package is both credited and excused.
- Field ids are unique kebab-case, no field is empty, and no row repeats.
- Every link is https, and every `where` path exists.

## Use it from a test

```ts
import { test } from 'node:test';
import { assertCredits } from '@rcweston/credits';
import credits from '../credits.config.mjs';

test('every dependency is credited', () => assertCredits(credits));
```

`checkCredits(config, options)` returns the problems as data (`{ code, message, package?, field? }`) if you'd rather report them yourself.

## Show them

`creditsToMarkdown(fields)` turns the same data into one Markdown table per field, for a README or a docs page. Render the fields in your own site for a credits page; the data is plain objects.

## Licence

MIT
