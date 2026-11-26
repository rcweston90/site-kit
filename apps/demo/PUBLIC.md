# The public site

What visitors see, all under `app/(site)` and `app/stories`. It is the same layout as the site it was ported from, with made-up content: Lena Ortiz, a product designer at Fieldnote Studio in Lisbon, and five case studies for Fieldnote Studio, Tidewater Transit and Harbor Lane Clinics.

| Route | What it shows | Reads |
| --- | --- | --- |
| `/` | The header (name, profiles, three photographs set in Admin → Home, the role and the statement), the letter from Admin → Home, Selected work, experience and education, and the ethos | `workCards()`, `isPageVisible('/work')`, `site.reads.home` |
| `/work` | The Work introduction and every listed, published story as a card, in the saved order | `workCards()`; answers 404 when Work is hidden |
| `/stories/<slug>` | A published story in the reader; an old address redirects to the new one | `@rcweston/story-server` through `backend()` |

`lib/published.ts` holds the reads, so a page never talks to a store itself:

- **Order** comes from the `work-order` module (dragged in the admin's Work table).
- **Listing** comes from `story-placement`: a story switched off Work still has its page, but no card.
- **Visibility** comes from `site-resources`: a hidden page leaves the navigation and the footer and answers 404.

## What changed from the original

- **Owner and content.** `content/site.ts` names the owner, their role, statement and profiles (example addresses only); `content/home.ts` holds the letter, experience and ethos; `content/seed.ts` holds the stories. Change them to make the site yours.
- **Type.** Geist stands in for the original's private typeface, set once as `--story-font-sans` and `--story-font-serif`.
- **Pictures.** Covers are drawn as SVG in `content/covers.ts`, so the demo ships no photographs and works offline. Photographs listed in `public/samples/photos/manifest.json`, if you add them, take their place.
- **Showpieces.** The original's home page had interactive pieces (a build replay and a shots carousel). They belong to modules this foundation doesn't ship, so the home page keeps its written sections and Selected work without them. Each later module adds its own section back.
- **Navigation.** The nav lists Readme (the home page) and then every page in `SITE_PAGES` that's visible. Later modules (writing, notes, links, shots, showreel, résumé, community) add a page there and a route under `app/(site)`; until then they don't appear.

## Adding a page

1. Add `{ path: '/notes', label: 'Notes' }` to `SITE_PAGES` in `content/site.ts`. It appears in the dashboard's Page visibility list and in the nav.
2. Add `app/(site)/notes/page.tsx`, starting with `if (!(await isPageVisible('/notes'))) notFound();` and `export const dynamic = 'force-dynamic';`.
3. Read the module's data through `(await backend()).site.reads['notes']`.

## Home, Community and Showreel

- **Home.** The letter (tagline, paragraphs, "What I do") and the header's three photographs come from the `home` module; `content/home.ts` holds the shipped letter (`HOME_ABOUT`). Each header slot is a photo from the library, an upload, or the library's photo for that slot. The library is `homeLibrary()` in `lib/publishing.ts`: drawn stand-ins (`content/home-header.ts`) and then the published covers.
- **The Shots slot.** The original played its photo reel between the header and the letter, its shots turned by three (`[...shots.slice(3), ...shots.slice(0, 3)]`). `app/(site)/page.tsx` reads them with `shotsPhotos()` (`lib/publishing.ts`), which calls `site.reads.shots.photos()` when a Shots module is registered and returns `[]` otherwise, and hands them to `shotsReel(photos)`, which renders nothing until wired: its marked `SHOTS SLOT` line becomes `return <ShotsReel shots={turned} galleryHref="/shots" />;` plus the import. The header's library already follows: with shots present, "Choose from Shots" offers them and the strip's three defaults are the first three shots, as in the original; without, drawn stand-ins take their place.
- **Community** (`/community`) is in `SITE_PAGES`, so it can be hidden like Work. `content/community.ts` is its shipped copy, with one hidden talk; `components/community/CommunityPageView.tsx` draws both the page and the admin's preview.
- **Showreel** (`/showreel`) plays the reel set in Admin → Showreel: an uploaded MP4 or WebM, or a Figma deck in a frame. Until one is set it plays `public/samples/showreel.webm`, a fictional clip that `sh scripts/make-showreel.sh` draws on your machine with ffmpeg (the repo keeps no video files, so the file is git-ignored); without it, nothing plays until a reel is set. It is a site resource, so the dashboard can switch it off; a "View demo reel" link on Work should check `site.reads['site-resources'].resourceVisibility()` for `showreel` and point at `/showreel`.
