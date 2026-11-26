# The public site

What visitors see, all under `app/(site)` and `app/stories`. It is the same layout as the site it was ported from, with made-up content: Lena Ortiz, a product designer at Fieldnote Studio in Lisbon, and five case studies for Fieldnote Studio, Tidewater Transit and Harbor Lane Clinics.

| Route | What it shows | Reads |
| --- | --- | --- |
| `/` | The header (name, profiles, a strip of the first published covers, the role and the statement), a letter, Selected work, experience and education, and the ethos | `workCards()`, `isPageVisible('/work')` |
| `/work` | The Work introduction and every listed, published story as a card, in the saved order | `workCards()`; answers 404 when Work is hidden |
| `/stories/<slug>` | A published story in the reader; an old address redirects to the new one | `@rcweston/story-server` through `backend()` |
| `/resume` | The resume PDF, inline: the upload from Admin → Resume, else the made-up one `lib/resume-pdf.ts` draws | `reads.resume.respond()` |
| `/sitemap.xml`, `/robots.txt` | Home, the visible pages and resources and every published story; robots keeps out `/admin`, `/api` and every hidden page | `reads.seo`, `reads['site-resources']` |
| `/manifest.webmanifest`, `/og-default.png`, `/icon-192.png`, `/icon-512.png` | The app manifest, and the share card and icons, drawn on request by `lib/share-images.tsx` | `content/site.ts` |

`lib/published.ts` holds the reads, so a page never talks to a store itself:

- **Order** comes from the `work-order` module (dragged in the admin's Work table).
- **Listing** comes from `story-placement`: a story switched off Work still has its page, but no card.
- **Visibility** comes from `site-resources`: a hidden page leaves the navigation and the footer and answers 404.
- **Search and sharing** come from `seo`: each page's `generateMetadata` calls `pageMetadata(path, content)` in `lib/seo.tsx`, which takes the page's override from Admin → SEO, then the page's own content (a story's title, summary and cover), then the saved defaults, then `SEO_FALLBACKS` in `lib/settings.ts`. Home carries Person structured data and each story CreativeWork.
- **Appearance** comes from `appearance`: the site and story layouts put the saved accent and typefaces in as token overrides (`--accent-primary`, `--story-font-sans`, `--story-font-serif`), start a first visit on the default theme, and show the drifting clouds of sunny mode over the neutral theme. A visitor's own pick in the footer still wins.
- **The resume** is a site resource, not a page: Work shows "View resume" while it's switched on in the dashboard's Site resources. Hiding it removes that link and its sitemap entry and adds `noindex`; the PDF keeps answering for links already shared.

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
