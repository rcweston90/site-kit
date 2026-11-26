# @rcweston/site-data

The site's own settings, kept next to its stories: which pages visitors can find, the order stories are listed in, which stories are listed at all, and a library of the images already uploaded. Each kind of setting is a **module** with a memory store, a Postgres store, explicit SQL migrations, request handlers and public reads. Nothing here imports a framework: the handlers take a web `Request` and return a `Response`, like `@rcweston/story-server`.

| Entry | What it gives you |
| --- | --- |
| `@rcweston/site-data` | `createSiteData`, the shipped modules, `migrate`, `defineModule` |
| `@rcweston/site-data/client` | Each module's types and pure helpers, and `siteDataPaths`, safe in the browser |
| `site-data-migrate` | A CLI that applies pending migrations |

## Modules

| Module | Keeps | Routes under `/api/site` | Public reads |
| --- | --- | --- | --- |
| `site-resources` | One switch per page and per resource. A path nobody has switched is visible. | `GET/POST /site-resources/pages`, `GET/POST /site-resources/resources` | `isPathVisible`, `hiddenPaths`, `pages`, `resources`, `resourceVisibility` |
| `work-order` | The hand-set order of each story list | `GET/PUT /work-order` | `order`, `sort` |
| `story-placement` | Whether a story is listed on the site | `GET /story-placement`, `PUT /story-placement/:slug` | `hiddenSlugs`, `isListed` |
| `media-library` | Nothing of its own: it lists the `MediaStore` and reads which stories use each image | `GET /media-library`, `GET /media-library/item` | `page` |

Every write can send the `expectedVersion` it was built on. A write built on an older version answers **409** with what's stored now, so two tabs can't quietly undo each other. That is the shape `@rcweston/save-kit` expects.

## Install

```sh
pnpm add @rcweston/site-data @rcweston/story-server @rcweston/story-core
# Postgres storage
pnpm add pg
```

`pg` is an optional peer dependency.

## Quick start

```ts
// lib/site.ts
import { SITE_DATA_MODULES, createSiteData } from '@rcweston/site-data';
import { Pool } from 'pg';
import { auth, store, media } from './story'; // your story-server wiring

export const site = createSiteData({
  modules: SITE_DATA_MODULES,
  sql: process.env.SITE_KIT_DATABASE_URL ? new Pool({ connectionString: process.env.SITE_KIT_DATABASE_URL }) : undefined,
  services: { documents: store, media },
  config: {
    'site-resources': {
      pages: [{ path: '/work', label: 'Work' }],
      resources: [],
    },
  },
});

export const siteHandler = site.handlers({
  auth, // the same AuthAdapter the story handlers use
  revalidate: (paths) => paths.forEach((path) => revalidatePath(path)),
}).handle;
```

Mount `siteHandler` on a catch-all route at `/api/site/[...path]` for every method. Reads that need a session go through `auth.requireAdmin`; writes from another origin are refused.

Public pages read with no session:

```ts
const stories = await site.reads['work-order'].sort(published, (story) => story.slug);
const hidden = await site.reads['story-placement'].hiddenSlugs();
const listed = stories.filter((story) => !hidden.has(story.slug));
if (!(await site.reads['site-resources'].isPathVisible('/work'))) notFound();
```

Without `sql`, every module keeps its data in memory and starts empty on each restart.

## Migrations

Each module brings numbered SQL files from its own folder. `migrate()` applies the pending ones in one transaction and records each in `site_data_migrations` with its checksum, so running again changes nothing and a file edited after it ran is refused.

```ts
await site.migrate();                 // apply
await site.migrate({ dryRun: true }); // list what's pending
```

```sh
SITE_KIT_DATABASE_URL=postgres://localhost/site npx site-data-migrate --dry-run
SITE_KIT_DATABASE_URL=postgres://localhost/site npx site-data-migrate
```

Your own migrations go in `extra` and are numbered 9000 to 9999. Each module owns a range of numbers (`MIGRATION_RANGES`), so two modules can't both write `1101_…`.

## Write a module

See [MODULES.md](./MODULES.md): one folder under `src/modules/<id>/`, one line in `src/registry.ts`. A host can also pass its own modules to `createSiteData` without touching this package.

## Tests

```sh
pnpm --filter @rcweston/site-data test
```

They run every module on memory and on real Postgres in memory (PGlite), the migration runner, the handlers and the 409 path.
