# @rcweston/story-server

Storage, media and sign-in for story documents, behind request handlers that take a web `Request` and return a `Response`. Nothing here imports a framework. Mount the handlers in Next.js, Remix, Hono, a Cloudflare Worker or a plain Node server, and pick the adapters that fit where you host:

| Entry | What it gives you |
| --- | --- |
| `@rcweston/story-server` | `createStoryHandlers`, the media policy, the fetch transport, errors and routes |
| `@rcweston/story-server/client` | `createFetchTransport` alone, safe to import in the browser |
| `@rcweston/story-server/memory` | In-memory stores and `createMemoryTransport`, for demos and tests |
| `@rcweston/story-server/postgres` | `createPostgresDocumentStore`, `migrate`, a Postgres rate limiter |
| `@rcweston/story-server/fs` | `createFsMediaStore`, uploads on local disk |
| `@rcweston/story-server/s3` | `createS3MediaStore`, uploads in any S3-compatible bucket |
| `@rcweston/story-server/passcode` | `createPasscodeAuth`, a passcode sign-in with a signed session cookie |

Validation, readiness checks and rename planning come from `@rcweston/story-core`, so the server and the editor agree on every rule.

## Install

```sh
pnpm add @rcweston/story-server @rcweston/story-core
# Postgres storage
pnpm add pg
# S3-compatible media
pnpm add aws4fetch
```

`pg` and `aws4fetch` are peer dependencies. Install them only if you use those adapters.

## Quick start

```ts
// lib/story.ts
import { createStoryHandlers, defaultMediaPolicy } from '@rcweston/story-server';
import { createPostgresDocumentStore } from '@rcweston/story-server/postgres';
import { createS3MediaStore } from '@rcweston/story-server/s3';
import { createPasscodeAuth } from '@rcweston/story-server/passcode';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export const auth = createPasscodeAuth({
  passcode: process.env.STORY_ADMIN_PASSCODE!,
  secret: process.env.STORY_SESSION_SECRET!, // at least 32 characters
});

export const story = createStoryHandlers({
  store: createPostgresDocumentStore({ pool }),
  media: createS3MediaStore({
    endpoint: process.env.S3_ENDPOINT!,
    bucket: process.env.S3_BUCKET!,
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
    region: process.env.S3_REGION ?? 'auto',
  }),
  mediaPolicy: defaultMediaPolicy,
  auth,
  revalidator: {
    published: (slug) => { /* refresh your cache for /stories/<slug> */ },
  },
});
```

The environment variable names are only suggestions. The package never reads the environment itself, except `story-migrate`, which reads `DATABASE_URL`.

### Mounting in Next.js

One catch-all route serves every endpoint. The package doesn't import `next`; a route handler already speaks `Request` and `Response`.

```ts
// app/api/story/[...path]/route.ts
import { story } from '@/lib/story';

const handle = (request: Request) => story.handle(request);

export const GET = handle;
export const HEAD = handle;
export const POST = handle;
export const DELETE = handle;
```

`handle` matches the path against the base path (default `/api/story`). Mount somewhere else by passing `basePath` to `createStoryHandlers` and `baseUrl` to the transport.

Each route also has its own handler (`story.load`, `story.saveDraft`, `story.publish` and so on), taking `(request, { slug })`, if you'd rather map routes yourself.

### The editor's side

```ts
import { createFetchTransport } from '@rcweston/story-server/client';

const transport = createFetchTransport({ baseUrl: '/api/story' });
const state = await transport.load('field-notes');
```

`createFetchTransport` implements the `EditorTransport` from story-core, plus `list()`. A refused request throws a `StoryRequestError` with the server's plain-language message, its `status`, its `code` and, for a moved story, `movedTo`. When the server can't be reached at all, `status` is 0 and the message says so.

### Reading published stories

```ts
const result = await story.getPublishedStory(params.slug);
if (result.status === 'published') {
  if (result.redirectFrom) redirect(`/stories/${result.slug}`); // the story was renamed
  return render(result.story);
}
if (result.status === 'none') notFound();
throw result.error; // 'failed': the lookup failed. Never treat this as "not published".
```

`getPublishedStory` follows renames, checks the stored story still validates, and tells "nothing is published" apart from "the lookup failed", so an outage never shows readers a missing page.

## Routes

All paths are under the base path. Every route but media serving needs an admin session.

| Method | Path | Does |
| --- | --- | --- |
| GET | `/stories` | Lists stories: `{ stories: StorySummary[] }` |
| GET | `/stories/:slug` | Loads `StoryEditorState`. A story that moved answers 404 with `code: 'STORY_MOVED'` and `movedTo` |
| POST | `/stories/:slug/drafts` | Saves a version. Body `{ content, parentDocumentId, restoredFrom? }` |
| POST | `/stories/:slug/publish` | Body `{ documentId, expectedPublishedDocumentId }` |
| POST | `/stories/:slug/unpublish` | Takes the story offline |
| POST | `/stories/:slug/rename` | Body `{ to, expectedLatestDocumentId }` |
| POST | `/media` | Uploads a file. Form data with `slug` and `file` |
| GET, HEAD | `/media/:key` | Serves an upload, with byte ranges and caching headers |
| POST, DELETE | `/session` | Signs in (`{ passcode }`) or out, when the auth adapter can |

Errors are a `StoryErrorBody`: `{ error, code?, problems?, movedTo? }`. The `error` is written for the author, never the database ("This story has a newer draft. Reload it before saving another version."). Codes: `CONFLICT` (409, someone else changed it first), `STORY_MOVED` (409 on a write), `ADDRESS` (409 taken, 422 unusable), `INVALID` (400 malformed, 422 not ready to publish), `NOT_FOUND`, `UNAUTHORIZED`, `TOO_LARGE`. Unexpected failures answer 500 with a general message and go to `onError` for your logs.

## How versions work

Saving never overwrites. Each save adds a version whose parent is the version the editor had open, and a save whose parent isn't the latest is refused with a conflict instead of quietly losing someone's work. Publishing points at one version, separately, so editing a draft never changes the live page. A rename copies the latest draft (and the live version, when it's older) to the new address, keeps the old address as a redirect, keeps redirects flat, and lets a story take back its own old address.

## Storage

### Postgres

```ts
import { createPostgresDocumentStore } from '@rcweston/story-server/postgres';
const store = createPostgresDocumentStore({ pool });
```

`pool` is anything with `query(text, params)`: `pg.Pool`, PGlite, or most serverless drivers. A pool with `connect()` gets one connection per transaction. Without it, calls take turns on the one connection. To use a single `pg.Client`, pass `{ query: (text, params) => client.query(text, params) }`.

Writes run in serializable transactions with a per-story advisory lock. A write that loses a race is answered as a conflict, never a 500.

The store never creates tables on the fly. Apply the migrations first:

```sh
DATABASE_URL=postgres://localhost/stories npx story-migrate --dry-run
DATABASE_URL=postgres://localhost/stories npx story-migrate
```

`story-migrate` applies every pending file in `migrations/` in one transaction and records each in `story_migrations` with its checksum. If one fails, nothing is applied. If an applied file has since changed, it stops and says which. Running it again is a no-op. From code:

```ts
import { migrate } from '@rcweston/story-server/postgres';
const { applied } = await migrate({ client: pool });
```

The tables are `story_documents`, `story_publications`, `story_slug_redirects` and `story_rate_limits`. The SQL is plain and in the package, so you can read it or copy it into your own migration tool.

### In memory

```ts
import { createMemoryDocumentStore, createMemoryMediaStore, createMemoryTransport } from '@rcweston/story-server/memory';

const transport = createMemoryTransport(); // anyone is an admin
```

`createMemoryTransport` runs the real handlers in the same process: requests go through `handle()` without a network, so a demo or a test behaves exactly like a deployed server. Nothing survives a restart. Pass `beforeRead` to the document store to add a delay or simulate a failed read.

In a browser, the upload `src` an in-memory store returns points at a media route that doesn't exist on your page. Serve it through `transport.fetch`, or use a real route, if a demo needs to show uploads.

## Media

```ts
import { createMediaPolicy } from '@rcweston/story-server';

const mediaPolicy = createMediaPolicy({ maxBytes: 20 * 1024 * 1024 });
```

`defaultMediaPolicy` accepts PNG, JPEG, WebP, GIF, AVIF, MP4, WebM and PDF up to 8 MB. Uploads are checked by their first bytes, not their name: a file whose bytes don't match its extension and type is refused, and SVG and QuickTime are never accepted. Keys come from the content hash (`stories/<slug>/<hash>.<ext>`), so uploading the same file twice stores it once.

Serving sends `private, no-cache` with an ETag, answers `If-None-Match` and `If-Modified-Since` with 304, serves byte ranges for video, and sets `nosniff` and a sandboxing content security policy. A signed-out request for protected media answers 404 before storage is touched. Set `uploadVisibility: 'public'` to serve uploads to everyone.

- `createFsMediaStore({ dir })` writes files atomically under `dir` and refuses keys that would leave it.
- `createS3MediaStore({ endpoint, bucket, accessKeyId, secretAccessKey, region })` signs requests with `aws4fetch` and works with any S3-compatible service. Pass `addressing: 'virtual-host'` for services that need it, and `fetch` to supply your own.
- `createMemoryMediaStore()` keeps bytes in memory.

All three implement `MediaStore` from story-core, so you can write your own.

## Sign-in

```ts
import { createPasscodeAuth, createMemoryRevocationList } from '@rcweston/story-server/passcode';

const auth = createPasscodeAuth({
  passcode: process.env.STORY_ADMIN_PASSCODE!,
  secret: process.env.STORY_SESSION_SECRET!,
  maxAgeSeconds: 60 * 60 * 8,
  revocation: createMemoryRevocationList(),
});
```

The session is a stateless cookie signed with HMAC-SHA256 through Web Crypto, so it runs on edge runtimes. Tokens carry an issue time, an expiry and an id. Expired tokens, tokens from the future and revoked ids are refused. Passcodes are compared in constant time. Sign-in attempts are rate limited per client with a global backstop on failures. The default limiter is in memory; pass `createPostgresRateLimiter({ pool })`, or your own `RateLimiter`, to share limits across instances.

Any `AuthAdapter` works: `getSession`, `requireAdmin` (throws a 401 `Response`) and `canViewProtected`. Plug in your own sign-in and the handlers don't change.

## Security notes

- Writes are refused when their `Origin` names another host. Set `checkOrigin: false` only if a proxy in front of you checks it.
- Editor responses send `private, no-store`.
- Media responses carry a sandboxing content security policy, so an uploaded file can't run script on your origin.
- Revalidation hooks never fail a save. Their errors go to `onError`.

## License

MIT
