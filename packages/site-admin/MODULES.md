# Adding an admin module

An admin module is the screens for one part of the site and what it adds to the sidebar and the dashboard. Its data lives in a `@rcweston/site-data` module with the same id (see `packages/site-data/MODULES.md`); the screens call that module's routes.

## 1. Make the folder

```
src/modules/<id>/
  index.ts          the module: defineAdminModule({...}), and re-exports of its screens
  <Name>Screen.tsx  one component per route, 'use client'
  …                 anything else the screens need, kept inside the folder
```

The four modules the foundation ships keep their screens in `src/screens/` as the foundation laid them out; their definitions are in `src/modules/core.ts`. New modules use their own folder.

## 2. Define it

```ts
// src/modules/blog/index.ts
import { defineAdminModule } from '../define.js';

export { BlogScreen } from './BlogScreen.js';

export const blogModule = defineAdminModule({
  id: 'blog',
  title: 'Blog',
  nav: [{ group: 'Publishing', name: 'Posts', path: 'blog', description: 'Posts and drafts', order: 20, owns: ['blog-editor'] }],
  stats: [{ label: 'Posts', path: 'blog', order: 10, count: async ({ config, read }) => (await read<{ posts: unknown[] }>(`${config.siteApi}/blog`))?.posts.length ?? 0 }],
  quickActions: [{ label: 'New post', path: 'blog/new', order: 20 }],
  dashboard: [], // optional sections drawn on the dashboard, each a component
});
```

- `group` is one of `ADMIN_NAV_GROUPS`: Overview, Publishing, Portfolio, Site Settings, Tools.
- `path` is relative to the admin (`''` is the dashboard, `blog` is `/admin/blog`) or absolute for a link out of it.
- `order` places the item in its group, low first. Use the original's slots so items land where they did. Overview: Dashboard 0, Analytics 10. Publishing: Home 0, Community 10, Posts 20, Notes 30, Links 40, Shots 50, Tracks 60, Showreel 70, Resume 80. Portfolio: Work 0, Companies 10, Image library 20, Team 30. Site Settings: Appearance 0, SEO 10. Tools: X-ray 0, Playground 10, then the host's own links from 100.
- `owns` lists other routes that belong to the item, so the sidebar and the tab title still name it there.

## 3. Add one line to the registry

`src/registry.ts`:

```ts
import { blogModule } from './modules/blog/index.js';

export const ADMIN_MODULES = [dashboardModule, storiesModule, imageLibraryModule, siteResourcesModule, blogModule] as const;
```

and export the module and its screens from `src/index.ts`:

```ts
export { blogModule, BlogScreen } from './modules/blog/index.js';
```

## 4. Build the screens from the shared parts

Start every screen with the page frame and draw it from the primitives, so it matches the rest of the admin:

```tsx
'use client';
import { useEffect, useState } from 'react';
import { siteDataPaths } from '@rcweston/site-data/client';
import { useFormSave } from '@rcweston/save-kit';
import { AdminPage, AdminPageHeader, Button, Callout, SectionHeader, Tag, tw, useAdminConfig, adminRequest } from '../../index.js';
```

- **Frame:** `AdminPage` and `AdminPageHeader` (title, description, an action). The shell already draws the sidebar, the drawer and the theme selector.
- **Primitives:** `Button` (variants and sizes as the original), `Tag`, `Callout`, `Divider`, `SectionHeader`, `tw` for the type styles. Use the theme tokens (`text-foreground`, `bg-card-bg`, `border-default`, `text-foreground-muted`, the `half`, `minor`, `major` spacing) rather than raw colours, so light, dark and amber all work.
- **Fields:** `ImageUploader`, `ImageUrlField`, `AutoTextarea`, `ListEditor`, `SeoOverrideFields`, `CmsCtaEditor`, `AdminSelect`.
- **Saving:** go through `@rcweston/save-kit` (`useFormSave` for a form, `useListSave` for rows) and `adminRequest`. Send the `expectedVersion` you loaded; on a 409, show what's stored now and keep the person's edit. A 401 opens the sign-in over the page and the action runs again after it. Undoable deletes use save-kit's undo toast, which the shell mounts.
- **Endpoints:** `useAdminConfig()` gives `siteApi`, `storyApi`, `adminBase` and the hrefs; never hard-code `/api/site`.
- **States:** draw empty, loading and error states. Loading is a skeleton in the final layout, not a spinner over a blank page.
- **Links:** `AdminLink` (or `useAdminRouter()`), never a framework's own link, so the package stays router-free.
- **Styles:** Tailwind classes only. A CSS module in the original becomes `sa-*` classes in `src/theme.css` (see `menu/AuthoringCommandMenu.tsx` for the `const styles = {...}` shim), because the package can't ship CSS modules.

## 5. Add the demo route

One page per screen under `apps/demo/app/admin/<id>/`:

```tsx
// apps/demo/app/admin/blog/page.tsx
import { BlogScreen } from '@rcweston/site-admin';

export const metadata = { title: 'Blog' };

export default function BlogPage() {
  return <BlogScreen />;
}
```

`app/admin/layout.tsx` already wraps every admin route in the shell, and `app/api/site/[...path]/route.ts` already serves every registered site-data module. Public pages read the module through `(await backend()).site.reads['<id>']` from `@/lib/story`.

## 6. Test and check

```sh
pnpm --filter @rcweston/site-admin build      # the demo imports dist
pnpm --filter @rcweston/site-admin test
pnpm --filter @rcweston/story-demo dev        # then sign in with the dev passcode `studio`
node scripts/scrub.mjs                         # from the repo root
```

Put component tests in `test/<id>.test.tsx` (jsdom is installed). Cover the nav entry landing in its group, the empty state, and a save that meets a 409.
