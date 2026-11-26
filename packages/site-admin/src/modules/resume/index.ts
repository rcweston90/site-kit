import { defineAdminModule } from '../define.js';

export { ResumeScreen } from './ResumeScreen.js';

/** site-data's resume: the PDF at /resume, with a shortcut on the dashboard. */
export const resumeModule = defineAdminModule({
  id: 'resume',
  title: 'Resume',
  nav: [{ group: 'Publishing', name: 'Resume', path: 'resume', description: 'Resume document', order: 80 }],
  quickActions: [{ label: 'Upload Resume', path: 'resume', order: 60 }],
});
