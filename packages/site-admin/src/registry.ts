import { dashboardModule, imageLibraryModule, siteResourcesModule, storiesModule } from './modules/core.js';
import { homeModule } from './modules/home/index.js';
import { communityModule } from './modules/community/index.js';
import { showreelModule } from './modules/showreel/index.js';

/** The admin modules this package ships, in nav order. Add yours after them. */
export const ADMIN_MODULES = [dashboardModule, storiesModule, imageLibraryModule, siteResourcesModule, homeModule, communityModule, showreelModule] as const;
