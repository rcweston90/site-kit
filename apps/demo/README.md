# Site-kit demo

A complete designer's portfolio on the story CMS: the public site (home, Work and each case study), the admin at `/admin` (dashboard, the Work table, new stories, the image library, page visibility) and the in-place story editor. It belongs to Lena Ortiz of Fieldnote Studio, who is made up, like every company, person, number and picture in it. Save it as your own copy, swap the seed for your work, and host it anywhere that runs Next.js.

```sh
# from the repo root
pnpm install
pnpm dev
```

`pnpm dev` builds the packages once, then starts the demo in development mode.

For a step-by-step walkthrough aimed at designers, see [the guide](../../docs/guide.md).

Open http://localhost:3000 for the site and http://localhost:3000/admin for the admin. Under `pnpm dev` the passcode is `studio`.

On first start the demo writes its sample stories into an empty store: five published (one of them hidden from Work), two drafts, and one draft restored from before its last publish, so the editor offers to bring the published version's changes in. The same first start fills every other module too: the Work order, the home page, shots, community, the resume, posts (six live, two drafts, one hidden), the SEO defaults with a few page overrides, and the image library, which gets each sample cover and drawing as a WebP. It never seeds a store that has been seeded before. While the store still holds only the samples, the dashboard shows a short "Start here" card; dismissing it is remembered in that browser.

## Where things are kept

`lib/config.ts` reads every setting; [`env.example`](./env.example) lists them with notes. Copy it to `.env.local` and fill in what you need.

| What | With nothing set | To host it |
| --- | --- | --- |
| Stories, Work order, page visibility | Embedded Postgres (PGlite) in `.data/pglite`. Lasts across restarts. | `SITE_KIT_DATABASE_URL`: any Postgres (Neon, Supabase, Vercel Postgres, RDS, your own). |
| Uploads | Files in `.data/media` | `SITE_KIT_S3_ENDPOINT`, `_BUCKET`, `_ACCESS_KEY_ID`, `_SECRET_ACCESS_KEY` (and `_REGION` on AWS): any S3-compatible bucket. |
| Sign-in | Passcode `studio`; a new session secret each start | `SITE_KIT_ADMIN_PASSCODE` and `SITE_KIT_SESSION_SECRET` (32+ random characters). Under `next start` without them the public site still runs, and `/admin` says which to set. |
| Site address | `http://localhost:3000` | `SITE_KIT_SITE_URL` |

`.data/` is ignored by git. One server process at a time may open the embedded database; a second one stops with a message saying so. `SITE_KIT_STORAGE=memory` keeps everything in memory instead (it resets on restart), which the tests use.

**Migrations.** On first use the demo applies any pending migrations for the stories and for each site-data module. They take a database lock and skip what has run, so several instances starting at once is safe. To run them yourself instead, set `SITE_KIT_AUTO_MIGRATE=false` and run:

```sh
pnpm db:migrate             # from the repo root or apps/demo
pnpm db:migrate --dry-run   # list what's pending
```

With auto-migrate off, a server whose database is behind stops and names the command.

**Serverless hosts.** Their disk is read-only or thrown away, so set a database URL and a bucket there. If the demo starts on such a host with local storage, or can't write its data folder, it says so in the server log and in a bar along the bottom of every admin page, and (when the folder can't be written at all) keeps changes in memory so the site still runs.

## Photos

The sample case studies ship with drawn covers so the demo works offline. To use real photographs, open `public/samples/photos/manifest.json`: it has one slot per sample story. Save a cover (about 1600 × 1000) and a smaller card copy (about 800 × 500) in that folder, put their file names in the slot's `file` and `card`, and fill in `credit` (photographer, profile link, photo page link, license). On the next start the story's banner, its Work card and its admin thumbnail all use the photo, the banner carries the credit, and a "Photo credits" link in the footer opens `/credits`, which lists every filled slot. With no slot filled there is no credits link and `/credits` is a 404. Use only photos you have the rights to, such as ones under the Unsplash License, and avoid faces, brands and logos.

## Production build

```sh
pnpm --filter @rcweston/story-demo build
SITE_KIT_ADMIN_PASSCODE=… SITE_KIT_SESSION_SECRET=… pnpm --filter @rcweston/story-demo start
```

Leave both variables out to run the public site alone; the admin then explains what to set instead of asking for a passcode.

Every page that reads stories renders per request, so the build never opens the database.

## What to try

- Edit a story at `/admin`, save with ⌘S, then open the public page: nothing changes until you publish.
- Open the same story in two tabs and save in both. The second save is refused, and your work stays on the page.
- Reorder Work by dragging a row's grip, or from its More menu with the keyboard. The public Work page follows.
- Hide a story from Work with its switch, or a whole page from the dashboard.
- Open "Forty buttons, down to four": the editor offers the published version's updates to review.
- `quiet-onboarding` has a custom block, `signup-funnel`, drawn by `components/SignupFunnel.tsx`. The reader and the editor take it from the same registry.

The public site is described in [PUBLIC.md](./PUBLIC.md).

## Tests

```sh
pnpm --filter @rcweston/story-demo test
```

They check that the seed stories validate and are ready to publish, run save, conflict, publish and rename end to end on the in-memory backend, read the configuration, and keep stories in the embedded database across a restart without seeding twice.
