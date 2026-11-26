# @rcweston/site-admin

The admin around your stories: a passcode-gated shell with a collapsible sidebar, a phone drawer and a theme selector; a dashboard with counts, shortcuts and page visibility; the Work table, where stories are ordered by drag or keyboard and listed or hidden; a new-story screen; an image library; and the review step that brings a published version's changes into a draft. It is drawn with Tailwind v4 and talks to `@rcweston/story-server` and `@rcweston/site-data` over HTTP, so it runs in any React 19 app.

## Install

```sh
pnpm add @rcweston/site-admin @rcweston/site-data @rcweston/story-editor @rcweston/save-kit
pnpm add -D tailwindcss @tailwindcss/postcss postcss
```

## Styles

The components use Tailwind class names, so Tailwind has to see them. In your global stylesheet:

```css
@import "tailwindcss";
@import "@rcweston/site-admin/theme.css";
@source "../node_modules/@rcweston/site-admin/dist";
```

Adjust the `@source` path so it points from your stylesheet to the installed package. `theme.css` holds the colour scales, the semantic tokens, radii, shadows, the 24px spacing rhythm, the type scale, the light, dark and amber themes under `[data-theme]`, and the base rules the admin is drawn on.

Type follows the story packages: set `--story-font-sans` and `--story-font-serif` once and the reader, the editor and the admin all use them.

## Mount it

```tsx
// app/admin/layout.tsx (Next.js; any router works)
'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ADMIN_MODULES, AdminProvider, AdminShell } from '@rcweston/site-admin';

export default function AdminLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  return (
    <AdminProvider
      router={{ pathname, push: router.push, replace: router.replace, Link }}
      modules={ADMIN_MODULES}
    >
      <AdminShell>{children}</AdminShell>
    </AdminProvider>
  );
}
```

Then one page per screen:

| Route | Component |
| --- | --- |
| `/admin` | `<Dashboard />` |
| `/admin/stories` | `<WorkScreen />` |
| `/admin/stories/new` | `<NewStory />` |
| `/admin/stories/[slug]` | `StoryEditor` from `@rcweston/story-editor`, with `usePublishedUpdates` for the review step |
| `/admin/image-library` | `<ImageLibrary />` |

`AdminProvider` takes an optional `config` for anything that isn't the default: `adminBase` (`/admin`), `storyApi` (`/api/story`), `siteApi` (`/api/site`), `storyHref`, `editorHref`, `siteHref`, `workList`, `uploadImage` and `mediaSrc`. `apps/demo/components/admin/AdminRoot.tsx` and `apps/demo/app/admin/**` are a complete working example.

The shell signs in with story-server's passcode adapter (`/api/story/session`) and shows the sign-in again when a save finds the session has ended, without losing the page.

## Navigation from modules

The sidebar has five groups (Overview, Publishing, Portfolio, Site Settings, Tools). Each enabled admin module adds its items, its dashboard counts and shortcuts, and its dashboard sections; empty groups drop out. Pass extra links, internal or external, to the shell:

```tsx
<AdminShell extraNav={[{ group: 'Tools', name: 'Style guide', path: '/style-guide', description: 'Type and colour', external: true, order: 10 }]}>
```

To add a module, see [MODULES.md](./MODULES.md).

## What else is exported

- Primitives: `Button`, `Tag`, `Callout`, `Divider`, `PageHeader`, `SectionHeader`, `AdminPage`, `AnimatedText`, `tw` (type styles), `duration`.
- Fields: `ImageUploader`, `ImageUrlField`, `AutoTextarea`, `ListEditor`, `SeoOverrideFields`, `CmsCtaEditor`.
- Menus: `AdminSelect`, `AuthoringCommandMenu` and the menu surface classes.
- Theme: `AdminThemeProvider`, `AdminThemeSelector`, `useAdminTheme`.
- Titles: `adminTitle`, `adminRecordTitle`, `ADMIN_TITLE_TEMPLATE` for the browser tab.
- Requests: `adminRequest` (JSON, same-origin cookies, save-kit's failures, so a 401 opens the sign-in over the page) and `adminRead` (a GET with a fallback).

## Tests

```sh
pnpm --filter @rcweston/site-admin test
```
