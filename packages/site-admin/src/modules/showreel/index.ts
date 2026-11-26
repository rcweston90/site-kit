import { defineAdminModule } from '../define.js';

export { ShowreelScreen } from './ShowreelScreen.js';

/** Admin → Showreel: the reel the showreel page plays (site-data's `showreel`). */
export const showreelModule = defineAdminModule({
  id: 'showreel',
  title: 'Showreel',
  nav: [{ group: 'Publishing', name: 'Showreel', path: 'showreel', description: 'Showreel video', order: 70 }],
});
