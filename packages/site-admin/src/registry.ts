import { dashboardModule, imageLibraryModule, siteResourcesModule, storiesModule } from './modules/core.js';
import { companiesModule } from './modules/companies/index.js';
import { projectsModule } from './modules/projects/index.js';

/** The admin modules this package ships, in nav order. Add yours after them. */
export const ADMIN_MODULES = [dashboardModule, storiesModule, imageLibraryModule, siteResourcesModule, companiesModule, projectsModule] as const;
