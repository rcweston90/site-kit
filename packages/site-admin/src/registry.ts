import { dashboardModule, imageLibraryModule, siteResourcesModule, storiesModule } from './modules/core.js';
import { resumeModule } from './modules/resume/index.js';
import { seoModule } from './modules/seo/index.js';
import { appearanceModule } from './modules/appearance/index.js';
import { shotsModule } from './modules/shots/index.js';
import { homeModule } from './modules/home/index.js';
import { communityModule } from './modules/community/index.js';
import { showreelModule } from './modules/showreel/index.js';
import { blogModule } from './modules/blog/index.js';
import { companiesModule } from './modules/companies/index.js';
import { projectsModule } from './modules/projects/index.js';

/** The admin modules this package ships, in nav order. Add yours after them. */
export const ADMIN_MODULES = [dashboardModule, storiesModule, imageLibraryModule, siteResourcesModule, companiesModule, projectsModule, homeModule, blogModule, communityModule, shotsModule, showreelModule, resumeModule, seoModule, appearanceModule] as const;
