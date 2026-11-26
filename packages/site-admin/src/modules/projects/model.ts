import { isPrototypeProject, newestFirst, projectYear, sortByWorkOrder, type ProjectRecord } from '@rcweston/site-data/client';
import type { WorkSort } from '../../screens/work/model.js';
import type { WorkStatus } from '../../screens/work/WorkTable.js';

export type ProjectTableKind = 'record' | 'prototype';

/** A project row's status: a prototype by its launch link. */
export function projectStatus(project: ProjectRecord, kind: ProjectTableKind): WorkStatus {
  if (kind === 'prototype') return project.url ? { tone: 'success', label: 'Linked' } : { tone: 'warning', label: 'Missing link' };
  return { tone: 'warning', label: 'No story yet' };
}

/** The records a search keeps, of one kind. */
export function filterProjects(projects: readonly ProjectRecord[], kind: ProjectTableKind, query: string): ProjectRecord[] {
  const needle = query.trim().toLocaleLowerCase();
  return projects.filter((project) => {
    if ((kind === 'prototype') !== isPrototypeProject(project)) return false;
    if (!needle) return true;
    return [project.title, project.slug, project.org, project.role, project.type, project.url, ...project.tags]
      .some((value) => value?.toLocaleLowerCase().includes(needle));
  });
}

const statusRank = (project: ProjectRecord) => (project.url ? 1 : 0);

/**
 * Stable sorting. Every key but `order` sorts the view only; `order` is the
 * site's, with anything not yet placed after it, newest first, as the site
 * shows it.
 */
export function sortProjects(projects: readonly ProjectRecord[], sort: WorkSort, order: readonly string[] = []): ProjectRecord[] {
  if (sort.key === 'order') return sortByWorkOrder(newestFirst(projects, (project) => project.date), (project) => project.slug, order);
  return projects
    .map((project, index) => ({ project, index }))
    .sort((a, b) => {
      let comparison = 0;
      if (sort.key === 'date') comparison = a.project.date.localeCompare(b.project.date);
      else if (sort.key === 'updated') comparison = (a.project.updatedAt ?? '').localeCompare(b.project.updatedAt ?? '');
      else if (sort.key === 'status') comparison = statusRank(a.project) - statusRank(b.project);
      else {
        const aValue = sort.key === 'title' ? a.project.title : a.project.org ?? '';
        const bValue = sort.key === 'title' ? b.project.title : b.project.org ?? '';
        comparison = aValue.localeCompare(bValue, undefined, { sensitivity: 'base' });
      }
      // Equal keys keep the list's own order in either direction.
      if (comparison === 0) return a.index - b.index;
      return sort.direction === 'asc' ? comparison : -comparison;
    })
    .map(({ project }) => project);
}

export { projectYear };
