/**
 * The modules this package ships, in the order the dashboard shows them.
 * Adding a module is one folder under `src/modules/<id>/` and one line here
 * (see MODULES.md). A host can also pass its own list to `createSiteData`.
 */

import { blog } from './modules/blog/index.js';
import { mediaLibrary } from './modules/media-library/index.js';
import { siteResources } from './modules/site-resources/index.js';
import { storyPlacement } from './modules/story-placement/index.js';
import { workOrder } from './modules/work-order/index.js';
import { resume } from './modules/resume/index.js';
import { seo } from './modules/seo/index.js';
import { appearance } from './modules/appearance/index.js';
import { shots } from './modules/shots/index.js';
import { home } from './modules/home/index.js';
import { community } from './modules/community/index.js';
import { showreel } from './modules/showreel/index.js';
import { companies } from './modules/companies/index.js';
import { projects } from './modules/projects/index.js';

export const SITE_DATA_MODULES = [
  siteResources,
  workOrder,
  storyPlacement,
  mediaLibrary,
  resume,
  seo,
  appearance,
  shots,
  home,
  community,
  showreel,
  blog,
  companies,
  projects,
] as const;

export type SiteDataModules = typeof SITE_DATA_MODULES;
