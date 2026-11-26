import { defineAdminModule } from '../define.js';

export { AppearanceScreen } from './AppearanceScreen.js';

/** site-data's appearance: how the public site looks for every visitor. */
export const appearanceModule = defineAdminModule({
  id: 'appearance',
  title: 'Appearance',
  nav: [{ group: 'Site Settings', name: 'Appearance', path: 'appearance', description: 'Display preferences', order: 0 }],
});
