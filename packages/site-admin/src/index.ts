/**
 * @rcweston/site-admin: the admin around your stories.
 *
 * - AdminProvider gives the admin its router, endpoints and modules once.
 * - AdminShell is the passcode-gated frame: sidebar (collapsible), phone
 *   drawer, theme selector, undo toast and the session-ended sign-in.
 * - Dashboard, WorkScreen, NewStory and ImageLibrary are the screens;
 *   usePublishedUpdates plugs the drift review into StoryEditor.
 * - defineAdminModule adds your own nav items, counts, shortcuts and
 *   dashboard sections (see MODULES.md).
 *
 * Styles: Tailwind v4 with `@rcweston/site-admin/theme.css` (see README).
 */
export { AdminProvider, adminPath, resolveAdminConfig, storyMediaUploader, useAdminConfig, useAdminModules, type AdminConfig } from './config.js';
export { AdminLink, AdminRouterProvider, useAdminRouter, type AdminLinkProps, type AdminRouter } from './router.js';
export { adminRead, adminRequest } from './request.js';

export { AdminShell, AdminWorkspace } from './shell/AdminShell.js';
export { buildAdminNav, findAdminNavGroup, findCurrentAdminNavItem, type AdminNavGroup, type AdminNavItem } from './shell/navigation.js';
export { PasscodeForm, useAdminAuth, type PasscodeFormProps } from './auth/index.js';
export * from './theme/index.js';
export * from './menu/index.js';
export * from './primitives/index.js';

export {
  ADMIN_NAV_GROUPS,
  defineAdminModule,
  type AdminContextForModule,
  type AdminDashboardSection,
  type AdminModule,
  type AdminNavEntry,
  type AdminNavGroupLabel,
  type AdminQuickAction,
  type AdminStat,
} from './modules/define.js';
export { dashboardModule, imageLibraryModule, siteResourcesModule, storiesModule } from './modules/core.js';
export * from './modules/companies/index.js';
export * from './modules/projects/index.js';
export { ADMIN_MODULES } from './registry.js';

export { Dashboard, PageVisibilitySettings, SiteResourceVisibilitySettings } from './screens/Dashboard.js';
export { WorkScreen, storyRecordKey } from './screens/work/WorkScreen.js';
export type { WorkScreenExtension, WorkFeatureRow } from './screens/work/WorkScreen.js';
export type { StoryRow, WorkSort } from './screens/work/model.js';
export { WorkRow, WorkSection, WorkTable, WorkEmpty, formatUpdated, moveMenuEntries, useRowDrag, type WorkMenuEntry, type WorkRowProps, type WorkStatus, type WorkTone } from './screens/work/WorkTable.js';
export { NewStory } from './screens/NewStory.js';
export { ImageLibrary } from './screens/ImageLibrary.js';

export { usePublishedUpdates, findDriftBase, diffOriginal, applyOriginalChange, applyOriginalChanges, type OriginalChange } from './drift/index.js';

export { AutoTextarea, ListEditor, inputClass, labelClass } from './components/CopyFields.js';
export { ImageUploader } from './components/ImageUploader.js';
export { ImageUrlField } from './components/ImageUrlField.js';
export { validateImageFile, IMAGE_ACCEPT } from './components/image-file.js';
export { SeoOverrideFields, type SeoOverride, type SeoOverrideSource } from './components/SeoOverrideFields.js';
export { CmsCtaEditor, CmsCtaFields, type CmsCta } from './components/CmsCtaEditor.js';

export { ADMIN_TITLE, ADMIN_TITLE_TEMPLATE, adminRecordTitle, adminTitle } from './title/index.js';
