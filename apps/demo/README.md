# Story CMS demo

A small Next.js app that runs the whole CMS on your machine: an index of published stories, the reader at `/stories/<slug>`, the in-place editor at `/admin`, and the server handlers at `/api/story`. Every company, person, number and picture in it is made up.

```sh
# from the repo root
pnpm install
pnpm build
pnpm --filter @rcweston/story-demo dev
```

Open http://localhost:3000. On first run the demo publishes two stories and saves one draft from `content/seed.ts`.

## What to try

- Edit a story at `/admin`, save with ⌘S, then open the reader: nothing changes until you publish.
- Open the same story in two tabs and save in both. The second save is refused, and your work stays on the page.
- Rename a story in its settings. The old address keeps working and sends readers to the new one.
- `quiet-onboarding` has a custom block, `signup-funnel`, drawn by `components/SignupFunnel.tsx`. The reader and the editor take it from the same registry.

## Choosing a backend

The demo reads these, all optional:

| Variable | Effect |
| --- | --- |
| `DATABASE_URL` | Store stories in Postgres. The demo runs the package's migrations on first use. Without it, stories live in memory and reset on restart. |
| `STORY_MEDIA_DIR` | Keep uploads in this folder. Without it, uploads live in memory. |
| `STORY_ADMIN_PASSCODE`, `STORY_SESSION_SECRET` | Require a passcode to edit. The secret signs the session cookie and needs at least 32 characters. |
| `STORY_DEMO_OPEN_EDITING=1` | Let anyone edit under `next start`. Without a passcode the editor is open only in `next dev`, and a production build refuses to start the backend. |

`lib/story.ts` is the whole wiring, about a hundred lines. Swap any adapter there for your own.

## Tests

`pnpm test` checks that the seed stories validate and are ready to publish, and runs save, conflict, publish and rename end to end on the in-memory backend.
