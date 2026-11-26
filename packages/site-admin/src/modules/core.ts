import type { StorySummary } from '@rcweston/story-core';
import { PageVisibilitySettings, SiteResourceVisibilitySettings } from '../screens/Dashboard.js';
import { defineAdminModule } from './define.js';

/** The dashboard itself: counts, shortcuts and each module's sections. */
export const dashboardModule = defineAdminModule({
  id: 'dashboard',
  title: 'Dashboard',
  nav: [{ group: 'Overview', name: 'Dashboard', path: '', description: 'Status, shortcuts and page visibility', order: 0 }],
});

/** Case studies: the Work table (order, visibility, dates), new story and the editor. */
export const storiesModule = defineAdminModule({
  id: 'stories',
  title: 'Work',
  nav: [{ group: 'Portfolio', name: 'Work', path: 'stories', description: 'Case studies, their order and visibility', order: 0 }],
  stats: [{
    label: 'Work',
    path: 'stories',
    order: 0,
    count: async ({ config, read }) => (await read<{ stories: StorySummary[] }>(`${config.storyApi}/stories`))?.stories.length ?? 0,
  }],
  quickActions: [
    { label: 'Manage Work', path: 'stories', order: 0 },
    { label: 'New case study', path: 'stories/new', order: 10 },
  ],
});

/** Every uploaded case-study image, from site-data's media library. */
export const imageLibraryModule = defineAdminModule({
  id: 'image-library',
  title: 'Image library',
  nav: [{ group: 'Portfolio', name: 'Image library', path: 'image-library', description: 'Browse reusable case-study images', order: 20 }],
});

/** site-data's site-resources: the dashboard's resource and page visibility switches. */
export const siteResourcesModule = defineAdminModule({
  id: 'site-resources',
  title: 'Site resources',
  dashboard: [
    { id: 'site-resources', order: 0, Component: SiteResourceVisibilitySettings },
    { id: 'page-visibility', order: 10, Component: PageVisibilitySettings },
  ],
});
