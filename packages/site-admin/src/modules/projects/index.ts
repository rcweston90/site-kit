import { defineAdminModule } from '../define.js';

export { ProjectsWork } from './ProjectsWork.js';
export { ProjectEditor, ProjectCardLabelField } from './ProjectEditor.js';
export { ProjectDetails } from './ProjectDetails.js';
export { FeatureWorkCardEditor } from './FeatureWorkCardEditor.js';
export { ProjectAdminTable } from './ProjectAdminTable.js';
export { ProjectRecordActions, type ProjectRecordAction } from './ProjectRecordActions.js';
export { CompaniesPanel, type CompanyTheme } from './CompaniesPanel.js';
export { filterProjects, sortProjects, projectStatus, type ProjectTableKind } from './model.js';
export { projectRecordKey } from './keys.js';

/**
 * The Work inventory around the stories (site-data's `projects`): project
 * details, prototypes and site features. Its screens live under Work.
 */
export const projectsModule = defineAdminModule({
  id: 'projects',
  title: 'Work inventory',
  quickActions: [{ label: 'New prototype', path: 'projects/new', order: 12 }],
});
