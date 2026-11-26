import { dashboardModule, imageLibraryModule, siteResourcesModule, storiesModule } from './modules/core.js';
import { blogModule } from './modules/blog/index.js';

/** The admin modules this package ships, in nav order. Add yours after them. */
export const ADMIN_MODULES = [dashboardModule, storiesModule, imageLibraryModule, siteResourcesModule, blogModule] as const;
