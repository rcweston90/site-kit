/**
 * The modules this package ships, in the order the dashboard shows them.
 * Adding a module is one folder under `src/modules/<id>/` and one line here
 * (see MODULES.md). A host can also pass its own list to `createSiteData`.
 */

import { mediaLibrary } from './modules/media-library/index.js';
import { siteResources } from './modules/site-resources/index.js';
import { storyPlacement } from './modules/story-placement/index.js';
import { workOrder } from './modules/work-order/index.js';
import { home } from './modules/home/index.js';
import { community } from './modules/community/index.js';
import { showreel } from './modules/showreel/index.js';

export const SITE_DATA_MODULES = [
  siteResources,
  workOrder,
  storyPlacement,
  mediaLibrary,
  home,
  community,
  showreel,
] as const;

export type SiteDataModules = typeof SITE_DATA_MODULES;
