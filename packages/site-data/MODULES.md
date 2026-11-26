# Adding a site-data module

A module is one kind of site setting: its table, its store, its routes and what public pages read. This file is the whole recipe. Follow it and nothing else in the package needs to change.

## 1. Take your migration range

Every module owns 100 migration numbers. They are listed in `MIGRATION_RANGES` in `src/migrate.ts` and reserved whether or not the module has shipped yet:

| Module | Range | | Module | Range |
| --- | --- | --- | --- | --- |
| `site-resources` | 1000–1099 | | `community` | 2200–2299 |
| `work-order` | 1100–1199 | | `people` (team) | 2300–2399 |
| `story-placement` | 1200–1299 | | `companies` | 2400–2499 |
| `media-library` | 1300–1399 | | `projects` (Work inventory) | 2500–2599 |
| `blog` | 1400–1499 | | `seo` | 2600–2699 |
| `notes` | 1500–1599 | | `lab` (playground) | 2700–2799 |
| `links` | 1600–1699 | | `appearance` | 2800–2899 |
| `shots` | 1700–1799 | | `analytics` | 2900–2999 |
| `tracks` | 1800–1899 | | host apps (`extra`) | 9000–9999 |
| `showreel` | 1900–1999 | | | |
| `resume` | 2000–2099 | | | |
| `home` | 2100–2199 | | | |

If your module isn't in the table, add a row to `MIGRATION_RANGES` with the next free hundred below 9000. The test `gives every module its reserved range` checks that your module's `migrationRange` matches its row and that no two rows overlap.

## 2. Make the folder

```
src/modules/<id>/
  migrations/
    1400_site_blog_posts.sql      NNNN_words.sql, inside your range, applied in name order
  migrations.generated.ts         written by `pnpm build`, never by hand
  model.ts                        types and pure helpers; browser-safe, no imports from stores
  index.ts                        the module
```

`<id>` is lower-case words joined by hyphens. It is also the URL segment (`/api/site/<id>/…`) and the key for the module's config and reads.

**Migrations.** Plain SQL, one change per file. Prefix your tables `site_`. Never edit a file after it has run anywhere: the runner stores each file's checksum and refuses a changed one. Put the change in the next number instead. Comment the top of each file in a sentence or two.

For one record per key, use the shape `createPostgresTable` expects:

```sql
CREATE TABLE site_blog_posts (
  slug TEXT PRIMARY KEY CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  body JSONB NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**model.ts.** The types your routes answer with, validation and any pure logic (sorting, resolving old addresses). Export it from `src/client.ts` so admin screens can import it without pulling in a store, and add your routes to `siteDataPaths` there.

**index.ts.** Export one `defineModule({...})`:

```ts
import { defineModule } from '../../module.js';
import { InvalidInputError, expectedVersionOf, json, readBody } from '../../http.js';
import { createMemoryTable, createPostgresTable, type VersionedTable } from '../../versioned.js';
import { MIGRATIONS } from './migrations.generated.js';
import { configureBlog, parsePost, type BlogConfig, type Post } from './model.js';

export * from './model.js';

export type BlogStore = VersionedTable<Post>;
export interface BlogReads { post(slug: string): Promise<Post | null> }

export const blog = defineModule({
  id: 'blog',
  title: 'Blog',
  migrationRange: [1400, 1499],
  migrations: MIGRATIONS,
  configure: configureBlog,                         // fill in defaults; throw on bad config
  createMemoryStore: (): BlogStore => createMemoryTable<Post>(),
  createPostgresStore: (sql): BlogStore => createPostgresTable<Post>(sql, {
    table: 'site_blog_posts', keyColumn: 'slug', columns: ['body'],
    toRow: (post) => [JSON.stringify(post)], fromRow: (row) => row.body as Post,
  }),
  handlers: ({ store, config, services, revalidate }) => [
    { method: 'GET', path: '', handle: async () => json({ posts: await store.all() }) },
    {
      method: 'PUT',
      path: ':slug',
      handle: async ({ request, params }) => {
        const body = await readBody(request);
        const post = parsePost(body.post);
        if (!post) throw new InvalidInputError('That post couldn’t be read.');
        const saved = await store.set(params.slug, post, expectedVersionOf(body)); // 409 when stale
        await revalidate(['/blog', `/blog/${params.slug}`]);
        return json({ post: saved });
      },
    },
  ],
  publicReads: (store): BlogReads => ({ post: async (slug) => (await store.get(slug))?.value ?? null }),
});
```

What the router does for you, so a handler doesn't:

- Routes are `admin` by default: `auth.requireAdmin(request)` runs first. Mark a route `access: 'public'` only when visitors may call it.
- Writes from another origin answer 403.
- Throw `InvalidInputError` for a 400, `VersionConflictError` (thrown by `VersionedTable.set`) for a 409 with the current record, or a `Response` to answer with it. Anything else is logged and answers 500 with a plain message.
- `revalidate(paths)` passes the public paths you changed to the host. It never fails the request.

Use `services.documents` (the story `DocumentStore`) and `services.media` (the `MediaStore`) when your module reads stories or uploads. Both are optional: answer sensibly without them.

If a module doesn't fit "one versioned record per key", write your own store type with a memory and a Postgres implementation. Keep the same rules: every write can carry `expectedVersion`, and a stale one throws `VersionConflictError`.

## 3. Add one line to the registry

`src/registry.ts`:

```ts
import { blog } from './modules/blog/index.js';

export const SITE_DATA_MODULES = [
  siteResources,
  workOrder,
  storyPlacement,
  mediaLibrary,
  blog, // ← your line
] as const;
```

Then export it by name from `src/index.ts` (`export { blog, type BlogReads, type BlogStore } from './modules/blog/index.js';`) and its model from `src/client.ts`. A host that builds its own module list doesn't need the registry at all.

## 4. Test it

Add your cases to `test/site-data.test.ts` (or a new `test/<id>.test.ts`). The suite already runs every registered module on both backends, so at least:

- the store on memory **and** on PGlite: save, read back, a stale `expectedVersion` throws;
- the handlers: 401 without a session, 400 on bad input, 409 on a stale save, the revalidated paths;
- the public reads with nothing saved (a fresh database shows the whole site).

`embeds exactly the .sql files in each module folder` fails until you run `pnpm build`, which regenerates `migrations.generated.ts`.

```sh
pnpm --filter @rcweston/site-data build
pnpm --filter @rcweston/site-data test
node scripts/scrub.mjs            # from the repo root
```

## 5. Wire the demo

`apps/demo/lib/story.ts` passes `SITE_DATA_MODULES` to `createSiteData`, so a registered module's routes appear under `/api/site/<id>` with no change. Give it config there if it needs some, and read it in public pages through `(await backend()).site.reads['<id>']`. The admin side is in `packages/site-admin/MODULES.md`.
