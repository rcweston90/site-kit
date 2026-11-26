import { defineAdminModule } from '../define.js';

export { HomeScreen } from './HomeScreen.js';
export { HomeHeaderImages } from './HomeHeaderImages.js';
export { InlineRichText } from './InlineRichText.js';

/** Admin → Home: the homepage's header images and the letter under them (site-data's `home`). */
export const homeModule = defineAdminModule({
  id: 'home',
  title: 'Home',
  nav: [{ group: 'Publishing', name: 'Home', path: 'home', description: 'Homepage copy and imagery', order: 0 }],
});
