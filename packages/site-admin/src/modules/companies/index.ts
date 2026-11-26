import { defineAdminModule } from '../define.js';

export { CompanyDirectory } from './CompanyDirectory.js';
export { CompanyEditor } from './CompanyEditor.js';
export { CompanyAssetFolder } from './CompanyAssetFolder.js';
export { companyRecordKey } from './keys.js';

/** Companies: the profiles and logos shared across case studies (site-data's `companies`). */
export const companiesModule = defineAdminModule({
  id: 'companies',
  title: 'Companies',
  nav: [{ group: 'Portfolio', name: 'Companies', path: 'companies', description: 'Manage company profiles and assigned case studies', order: 10 }],
});
