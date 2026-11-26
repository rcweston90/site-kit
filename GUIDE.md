# Make it yours: a guide for designers

This guide takes you from nothing to your own portfolio on the web: a site with case studies and a blog, an admin to write them in, and your words kept in a database you choose. It's written for designers who are curious about building with AI and haven't set up a project like this before. You don't need to know how the code works. Each step says what to type and what you should see, and the boxes marked **Ask your AI** give you a prompt to paste into Claude Code (or any coding agent) if you'd rather it did the step for you.

It takes about an hour the first time, most of it waiting for installs.

## What you're getting

- **A public site:** a home page, Work (your case studies), Posts (your blog), Shots (a photo wall), Community, a résumé link and a showreel. Work, Posts, Shots and Community can each be hidden from the admin.
- **An admin at `/admin`**, behind a passcode. You write case studies on the real page, the way a reader will see them, and publish when they're ready. Nothing changes on the public site until you press Publish.
- **Storage that works with no setup.** On your own computer everything is kept in a small database inside the project folder. When you put the site online you point it at a hosted database and a file bucket instead, which takes two settings.

The site you'll first see belongs to Lena Ortiz of Fieldnote Studio. She's made up, like every name, number and picture in the sample. You'll replace her with you.

## Words you'll see

- **Terminal:** the app where you type commands. On a Mac it's called Terminal; on Windows use PowerShell or the terminal inside your code editor.
- **Repository (repo):** the project folder, tracked by Git so every change is saved and can be undone.
- **Node and pnpm:** Node runs the site on your computer. pnpm installs the pieces it's built from.
- **Database:** where your case studies, posts and settings are kept. Not in the code, so updating the code never touches your writing.
- **Bucket:** online storage for your uploaded images and files.
- **Environment variables (env vars):** settings like your passcode and database address. They live outside the code so secrets never end up in the repo.
- **Deploy:** putting the site on the internet with a host such as Vercel.

## 1. Install the tools

You need three things, once:

1. **Git.** On a Mac, type `git --version` in Terminal; if it isn't there, macOS offers to install it. On Windows, install it from git-scm.com.
2. **Node 20 or newer.** Install the LTS version from nodejs.org. Check with `node --version`.
3. **pnpm**, which comes with Node. Turn it on with:

   ```sh
   corepack enable
   ```

A free GitHub account helps too: it's where your copy will live and what most hosts deploy from.

> **Ask your AI:** "Check that Git, Node 20+ and pnpm are installed on this computer and install whatever is missing. Explain each step in one line."

## 2. Get your own copy

On GitHub, open the site-kit repository and press **Fork**. That makes a copy under your account that you own. Then bring it onto your computer, replacing `you` with your GitHub name:

```sh
git clone https://github.com/you/site-kit.git
cd site-kit
```

## 3. Run it

```sh
pnpm install
pnpm dev
```

The first install takes a few minutes. When the terminal shows a local address, open:

- **http://localhost:3000** for the site
- **http://localhost:3000/admin** for the admin. The passcode is `studio` while you're working locally.

You should see Lena's portfolio, with case studies, posts and photos already filled in. Click around, open the admin, edit a story, and publish it. It's a sandbox, so break things. To stop the site, press Ctrl+C in the terminal. Run `pnpm dev` again to start it.

If something goes wrong, copy the last lines of the terminal into your AI and ask what happened. The most common cause is an older Node; `node --version` should say 20 or higher.

## 4. Make it yours

### Your name and pages

Open `apps/demo/content/site.ts` in your editor. The top of the file is you: your name, role, studio, city, the three lines in your header and your profile links. Change them and save; the site updates as soon as you reload.

The list under it, `SITE_PAGES`, is the pages in your navigation. Hide one you don't want from the admin's dashboard (Page visibility) rather than deleting it here; you can bring it back with a click.

> **Ask your AI:** "In apps/demo/content/site.ts, change the owner to me: [your name], [your role] at [your studio or 'independent'], based in [city]. My header lines are [three short lines]. My profiles are [links]. Don't change anything else."

### Start from a clean slate

The sample content is written into the database the first time the site starts. To start empty instead:

1. Stop the site.
2. Delete the folder `apps/demo/.data` (that's the local database; deleting it deletes everything you've written locally, so do this before you've written anything you want to keep).
3. Start it with the sample turned off:

   ```sh
   SITE_KIT_SEED=false pnpm dev
   ```

You can also keep Lena's stories as a reference while you write your own, and delete them from the Work table once yours are in.

### Your look

In the admin, **Appearance** sets the default theme, the accent colour and the typeface. **Home** sets the header photos and the short letter on the home page. **SEO** sets the title and description that search engines and link previews show.

## 5. Write

### A case study

1. In the admin, open **Work** and press **New case study**.
2. Give it a title and, if you like, the company it was for, then press **Create case study**. Its web address is made from the title, and you can change it later.
3. You land on the story page itself. Click any text to edit it. The toolbar adds blocks: chapters, images, quotes, comparisons, metrics, credits.
4. The draft saves itself a second after you stop typing, and the line next to the title says Saved. ⌘S (Ctrl+S on Windows) keeps a version of its own you can come back to. Either way it's a draft: readers still see the published version.
5. When it's ready, press **Publish**. The checklist next to it tells you if anything is missing, like a cover image or a summary.

Back in **Work**, drag rows to set their order on the public Work page, and use the switch to hide a story without unpublishing it.

### A blog post

Open **Posts** and press **New post**. Give it a title and start writing: the draft saves itself a second after you stop typing, and the line next to the title says when it last did. **Save draft** (or ⌘S) keeps a version you can come back to. Only **Publish** changes what readers see. Post settings, behind the gear, hold the summary, address, tags and cover. A post can link to a case study, and both show up together where they relate.

### Images

Upload images in the **Image library** or straight into a story. Locally they're saved in `apps/demo/.data/media`. Use images you have the rights to, and keep anything under a client NDA out.

> **Ask your AI:** "Here are my notes for a case study about [project]. Turn them into an outline of chapters for a portfolio case study: problem, my role, process, decisions, outcome. Keep my words where you can and mark anything you've guessed with [check]." Then paste the outline into the editor yourself, so the writing stays yours.

## 6. Choose where your writing is kept

Your words live in a database and your uploads in a folder or bucket. You choose both with settings; the code doesn't change.

### On your computer: nothing to set

By default everything is in `apps/demo/.data`: the database in `pglite`, uploads in `media`. It lasts across restarts and is ignored by Git, so it never ends up on GitHub. **Back it up** by copying that folder somewhere safe while the site is stopped.

This is perfect for writing and trying things. It isn't enough for a site on the internet, because most hosts throw their disk away. When you get there, use the hosted options below.

### A hosted database: any Postgres

Every hosted option works the same way: you create a database, the provider gives you a connection string (it starts with `postgres://`), and you set it as `SITE_KIT_DATABASE_URL`. The site creates its own tables the first time it connects.

| Provider | Good for | Notes |
| --- | --- | --- |
| **Neon** | The easiest start, and it's what Vercel's marketplace offers | Free tier. Copy the **pooled** connection string. |
| **Supabase** | If you want a dashboard to browse your data | Free tier. Use the connection string under Database settings, pooler mode. |
| **Your host's Postgres** (Railway, Render) | Keeping everything with one provider | Use the internal address when the site runs on the same host. |
| **Any other Postgres** | You already have one | Version 14 or newer. |

Two more settings help on hosts like Vercel, where many copies of the site may run at once:

- `SITE_KIT_DATABASE_POOL_SIZE=2` keeps each copy from opening too many connections. Anything from 1 to 3 is fine.
- Add `?sslmode=require` to the end of the connection string if the provider asks for it.

To try a hosted database from your computer first, put the settings in a file called `apps/demo/.env.local` (copy `apps/demo/env.example`, which lists every setting with a note) and restart. The sample content is written into the new database the first time, unless you set `SITE_KIT_SEED=false`.

**Moving what you wrote locally** into the hosted database: the simplest path is to write in the hosted one from the start. If you've already written a lot locally, ask your AI to help you export it.

> **Ask your AI:** "I want to move the content from the site's local PGlite database in apps/demo/.data/pglite into my Neon database. Look at how site-data and story-server store things, write me a one-off script that copies every table, and tell me how to run it. Don't run it until I say so."

### Uploads: any S3-compatible bucket

Images and files go in a bucket once the site is online. Any service that speaks the S3 protocol works; the site serves the files itself, so the bucket can stay private.

| Provider | Notes |
| --- | --- |
| **Cloudflare R2** | Free tier and no download fees. Create a bucket, then an API token with read and write access to it. |
| **AWS S3** | The original. Set `SITE_KIT_S3_REGION` to your bucket's region. |
| **Supabase Storage** | Turn on S3 access in its storage settings. |

Set all four:

```sh
SITE_KIT_S3_ENDPOINT=…          # the S3 API address your provider shows
SITE_KIT_S3_BUCKET=…
SITE_KIT_S3_ACCESS_KEY_ID=…
SITE_KIT_S3_SECRET_ACCESS_KEY=…
```

## 7. Put it on the internet

Before you deploy, make the two sign-in settings. A live site refuses to open the admin without them.

- `SITE_KIT_ADMIN_PASSCODE`: your admin passcode. Make it long; anyone who has it can edit your site.
- `SITE_KIT_SESSION_SECRET`: 32 or more random characters that sign your login. Make one with:

  ```sh
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```

And `SITE_KIT_SITE_URL`, your site's address (like `https://yourname.com`), so link previews and the sitemap point at the right place.

**Never put these in the code or commit `.env.local`.** They go into your host's settings screen. `.env.local` is already ignored by Git.

### Check it builds first

On your computer, build and run the production version once. It's exactly what the host will do:

```sh
pnpm --filter "@rcweston/story-demo..." build
SITE_KIT_ADMIN_PASSCODE=pick-one SITE_KIT_SESSION_SECRET=your-random-string pnpm --filter @rcweston/story-demo start
```

Open http://localhost:3000 and sign in at `/admin`. If this works, the host will too.

### Option A: Vercel

Vercel is the simplest for a Next.js site and has a free plan for personal sites. Its disk doesn't last, so you need the hosted database and the bucket from step 6.

1. Push your copy to GitHub (`git push`).
2. In Vercel, **Add New → Project** and import your repository.
3. Set **Root Directory** to `apps/demo`. Vercel sees pnpm and installs the whole workspace.
4. Set **Build Command** to `cd ../.. && pnpm --filter "@rcweston/story-demo..." build`, so the packages the site is built from are built first.
5. Under **Environment Variables**, add:
   - `SITE_KIT_ADMIN_PASSCODE`, `SITE_KIT_SESSION_SECRET`, `SITE_KIT_SITE_URL`
   - `SITE_KIT_DATABASE_URL` (pooled) and `SITE_KIT_DATABASE_POOL_SIZE=2`
   - the four `SITE_KIT_S3_*` settings
6. Deploy. Every push to GitHub deploys again; Vercel builds a preview for each branch, which costs build minutes, so keep work in progress on your computer until it's ready.

If you forget the database or bucket, the site still starts, and every admin page shows a bar saying your changes won't last. That's your cue to add them.

### Option B: a host with a disk (Railway, Render, Fly.io)

These run the site as one always-on server with a disk that lasts, so you can keep the zero-setup local database and uploads there and skip the hosted database and bucket. Good for a personal site with modest traffic.

1. Create a service from your GitHub repository.
2. Add a **volume** (persistent disk) and mount it at `/data`.
3. Commands:
   - Build: `pnpm install && pnpm --filter "@rcweston/story-demo..." build`
   - Start: `pnpm --filter @rcweston/story-demo start` (it listens on the `PORT` the host gives it)
4. Variables: the three sign-in settings, plus `SITE_KIT_DATA_DIR=/data`.
5. Keep it to **one instance**. The local database can only be opened by one server at a time; if you need more, switch to a hosted Postgres.

Back up by downloading the volume's contents now and then, or move to a hosted database when the site matters to you.

> **Ask your AI:** "Help me deploy apps/demo to [Vercel / Railway]. Use GUIDE.md, section 7. Walk me through the screens one at a time and tell me exactly what to paste in each field. Don't put any secret in a file that gets committed."

## 8. Keep up with updates

Improvements to site-kit land in the original repository. To bring them into yours:

```sh
git remote add upstream https://github.com/rcweston90/site-kit.git   # once
git pull upstream main
pnpm install
```

Your writing is in your database, so updates never touch it. The one file you've likely changed, `content/site.ts`, may need a small merge; your AI can resolve it if Git asks.

> **Ask your AI:** "Pull the latest changes from upstream into this repo, resolve any conflicts by keeping my content in apps/demo/content/site.ts, run pnpm check, and summarise what changed."

## When you get stuck

- **"Another server has the database open":** you have the site running twice. Stop the other terminal, or restart your computer.
- **The admin says the passcode is wrong online:** check `SITE_KIT_ADMIN_PASSCODE` in your host's settings, then redeploy so it takes effect.
- **"Your changes won't last" bar:** you're on a host whose disk is thrown away. Add a database and a bucket (step 6).
- **Anything else:** copy the error from the terminal or the host's logs into your AI with "What does this mean, and what's the smallest fix?"

`apps/demo/README.md` has the technical details behind every step, and `apps/demo/env.example` lists every setting.
