import { defineAdminModule } from '../define.js';

export { SeoScreen, type SeoScreenProps } from './SeoScreen.js';

/** site-data's seo: site-wide defaults and per-page overrides. */
export const seoModule = defineAdminModule({
  id: 'seo',
  title: 'SEO',
  nav: [{ group: 'Site Settings', name: 'SEO', path: 'seo', description: 'Search and sharing metadata', order: 10 }],
});
