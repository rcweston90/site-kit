'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SaveRequestError, useHiddenKeys, type SaveStatusState } from '@rcweston/save-kit';
import {
  derivedCompanyProfiles,
  isPrototypeProject,
  placeVisibleOrder,
  siteDataPaths,
  type CompanyDirectory,
  type ProjectRecord,
  type StoryPlacement,
  type WorkFeature,
} from '@rcweston/site-data/client';
import { AdminLink as Link, useAdminRouter } from '../../router.js';
import { adminPath, useAdminConfig } from '../../config.js';
import { adminRead, adminRequest } from '../../request.js';
import { WorkScreen, type WorkFeatureRow } from '../../screens/work/WorkScreen.js';
import { fullOrder, placesOf, type StoryRow, type WorkSort } from '../../screens/work/model.js';
import { CompaniesPanel, type CompanyTheme } from './CompaniesPanel.js';
import { ProjectAdminTable } from './ProjectAdminTable.js';
import { ProjectRecordActions, type ProjectRecordAction } from './ProjectRecordActions.js';
import { filterProjects, sortProjects } from './model.js';
import { projectRecordKey } from './keys.js';

const PROTOTYPES = 'prototypes';
const EMPTY_DIRECTORY: CompanyDirectory = { schemaAvailable: false, companies: [], memberships: [] };
type Feature = WorkFeature & { updatedAt: string | null };

/**
 * Work with the projects module: the Companies panel over the case studies
 * (choose one to narrow the table), project details from each row, site
 * features among the case studies, and the prototypes (and any record with
 * no story) below them, each list with its own order and placement.
 */
export function ProjectsWork({ newStoryPath, newPrototypePath = 'projects/new' }: { newStoryPath?: string; newPrototypePath?: string }) {
  const config = useAdminConfig();
  const hidden = useHiddenKeys();
  const [allProjects, setProjects] = useState<ProjectRecord[]>([]);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [directory, setDirectory] = useState<CompanyDirectory>(EMPTY_DIRECTORY);
  const [placements, setPlacements] = useState<Map<string, StoryPlacement>>(new Map());
  const [placementAvailable, setPlacementAvailable] = useState(false);
  const [companyFilter, setCompanyFilter] = useState('all');
  const site = useCallback((path: string) => `${config.siteApi}${path}`, [config.siteApi]);

  useEffect(() => {
    let current = true;
    void Promise.all([
      adminRead<{ projects: ProjectRecord[]; features: Feature[] } | null>(site(siteDataPaths.projects()), null),
      adminRead<CompanyDirectory>(site(siteDataPaths.companies()), EMPTY_DIRECTORY),
      adminRead<{ placements: StoryPlacement[] } | null>(site(siteDataPaths.placements()), null),
    ]).then(([projectData, companyData, placementData]) => {
      if (!current) return;
      setProjects(projectData?.projects ?? []);
      setFeatures(projectData?.features ?? []);
      setDirectory(companyData);
      setPlacements(new Map((placementData?.placements ?? []).map((placement) => [placement.slug, placement])));
      setPlacementAvailable(Boolean(placementData));
    });
    return () => { current = false; };
  }, [site]);

  // A project deleted here or from its details stays out while Undo is offered.
  const projects = useMemo(() => allProjects.filter((project) => !hidden.has(projectRecordKey(project.slug))), [allProjects, hidden]);
  const prototypes = useMemo(() => projects.filter(isPrototypeProject), [projects]);

  const profileBySlug = useMemo(() => new Map(directory.companies.map((profile) => [profile.slug, profile])), [directory.companies]);
  const membershipByStory = useMemo(() => new Map(directory.memberships.map((membership) => [membership.storySlug, membership])), [directory.memberships]);
  /** A case study's company: its assignment, else the name its story gives. */
  const companyName = useCallback((row: Pick<StoryRow, 'slug' | 'company'>) => {
    const membership = membershipByStory.get(row.slug);
    const profile = membership && profileBySlug.get(membership.companySlug);
    return profile?.name ?? (row.company.trim() || 'Unassigned');
  }, [membershipByStory, profileBySlug]);
  const themes = useCallback((rows: readonly StoryRow[]): CompanyTheme[] => {
    const counts = new Map<string, number>(directory.companies.map((profile) => [profile.name, 0]));
    for (const row of rows) counts.set(companyName(row), (counts.get(companyName(row)) ?? 0) + 1);
    const fallbacks = new Map(derivedCompanyProfiles(rows).map((profile) => [profile.name, profile]));
    return [...counts.entries()]
      .map(([name, count]) => ({ ...(directory.companies.find((profile) => profile.name === name) ?? fallbacks.get(name) ?? derivedCompanyProfiles([{ company: name }])[0]!), name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [companyName, directory.companies]);

  const featureRows = useMemo<WorkFeatureRow[]>(() => features
    .filter((feature) => !hidden.has(projectRecordKey(feature.slug)))
    .map((feature) => ({
      slug: feature.slug,
      title: feature.title,
      updatedAt: feature.updatedAt ?? '',
      editHref: adminPath(config, `projects/${encodeURIComponent(feature.slug)}/edit`),
      siteHref: feature.href,
    })), [features, hidden, config]);

  const [recordAction, setRecordAction] = useState<ProjectRecordAction>();
  const { push } = useAdminRouter();

  return <>
    <WorkScreen
      newStoryPath={newStoryPath}
      extend={{
        summary: ({ caseStudies }) => <>One inventory for {caseStudies} case {caseStudies === 1 ? 'study' : 'studies'} and {prototypes.length} prototype{prototypes.length === 1 ? '' : 's'}{featureRows.length > 0 ? ' plus site features' : ''}. Visible lists it on Work; publishing makes a case study live for readers.</>,
        headerActions: <Link href={adminPath(config, newPrototypePath)} className="inline-flex min-h-12 items-center justify-center rounded-lg border border-default px-5 font-mono text-xs font-semibold uppercase tracking-wider hover:bg-card-bg focus-visible:outline-2 focus-visible:outline-offset-2">
          New prototype
        </Link>,
        beforeTable: (rows) => <CompaniesPanel companies={themes(rows)} total={rows.length} filter={companyFilter} onFilter={setCompanyFilter} schemaAvailable={directory.schemaAvailable} />,
        showRow: (row) => companyFilter === 'all' || companyName(row) === companyFilter,
        rowMeta: (row) => [companyName(row) === 'Unassigned' ? 'Company not set' : companyName(row)],
        rowMenu: (row) => [{ label: 'Project details', href: adminPath(config, `projects/${encodeURIComponent(row.slug)}/edit`) }],
        features: companyFilter === 'all' ? featureRows : [],
        hasOtherRows: projects.length > 0,
        afterTable: ({ query, status, rows }) => <ProjectSections
          query={query}
          status={status}
          stories={rows}
          projects={projects}
          features={features}
          placements={placements}
          placementAvailable={placementAvailable}
          onPlacementSaved={(saved) => setPlacements((current) => new Map(current).set(saved.slug, { ...saved, updatedAt: new Date().toISOString() }))}
          onRecordAction={setRecordAction}
        />,
      }}
    />
    {recordAction && <ProjectRecordActions record={recordAction} onDismiss={() => setRecordAction(undefined)}
      onDeleted={() => setProjects((current) => current.filter((project) => project.slug !== recordAction.slug))}
      onDuplicated={(copy) => push(adminPath(config, `projects/${encodeURIComponent(copy.slug)}/edit`))} />}
  </>;
}

function ProjectSections({ query, status, stories, projects, features, placements, placementAvailable, onPlacementSaved, onRecordAction }: {
  query: string;
  status: SaveStatusState;
  stories: readonly StoryRow[];
  projects: readonly ProjectRecord[];
  features: readonly Feature[];
  placements: ReadonlyMap<string, StoryPlacement>;
  placementAvailable: boolean;
  onPlacementSaved: (saved: { slug: string; listed: boolean; version: number }) => void;
  onRecordAction: (action: ProjectRecordAction) => void;
}) {
  const config = useAdminConfig();
  const site = (path: string) => `${config.siteApi}${path}`;
  const [sort, setSort] = useState<WorkSort>({ key: 'order', direction: 'asc' });
  const [order, setOrder] = useState<{ slugs: string[]; version: number }>({ slugs: [], version: 0 });
  const [orderAvailable, setOrderAvailable] = useState(false);
  // Saves go one after another: each sends a whole list.
  const orderSaves = useRef<Promise<unknown>>(Promise.resolve());

  const loadOrder = useCallback(() => fetch(`${config.siteApi}${siteDataPaths.workOrder(PROTOTYPES)}`, { credentials: 'same-origin' })
    .then((response) => (response.ok ? (response.json() as Promise<{ order: { slugs: string[]; version: number } }>) : null))
    .catch(() => null)
    .then((data) => {
      if (data) setOrder({ slugs: data.order.slugs, version: data.order.version });
      setOrderAvailable(Boolean(data));
    }), [config.siteApi]);
  useEffect(() => { void loadOrder(); }, [loadOrder]);

  const prototypes = useMemo(() => projects.filter(isPrototypeProject), [projects]);
  const visible = sortProjects(filterProjects(projects, 'prototype', query), sort, order.slugs);
  const fullPrototypeOrder = useMemo(() => fullOrder(order.slugs, sortProjects(prototypes, { key: 'order', direction: 'asc' }, order.slugs).map((project) => project.slug)), [order.slugs, prototypes]);
  const positions = useMemo(() => placesOf(
    sortProjects(prototypes, { key: 'order', direction: 'asc' }, fullPrototypeOrder)
      .filter((project) => placements.get(project.slug)?.listed ?? true)
      .map((project) => project.slug),
  ), [prototypes, fullPrototypeOrder, placements]);
  // Records with no story, prototype or site feature behind them.
  const unlinked = useMemo(() => {
    const associated = new Set([...stories.map((row) => row.slug), ...features.map((feature) => feature.slug)]);
    const needle = query.trim().toLowerCase();
    return projects.filter((project) => !isPrototypeProject(project) && !associated.has(project.slug)
      && (!needle || [project.slug, project.title, project.org ?? ''].some((value) => value.toLowerCase().includes(needle))));
  }, [projects, stories, features, query]);

  const reorder = async (visibleSlugs: string[]) => {
    const previous = order;
    const next = placeVisibleOrder(fullPrototypeOrder, visibleSlugs);
    setOrder((current) => ({ ...current, slugs: next }));
    let savedVersion = previous.version;
    const result = await status.run(() => {
      const request = orderSaves.current.then(() => adminRequest<{ order: { slugs: string[]; version: number } }>(site(siteDataPaths.workOrder()), {
        method: 'PUT',
        body: JSON.stringify({ list: PROTOTYPES, slugs: next, expectedVersion: savedVersion }),
      })).then((data) => {
        savedVersion = data.order.version;
        return data;
      }, (reason: unknown) => {
        if (reason instanceof SaveRequestError && reason.status === 409) void loadOrder();
        throw reason;
      });
      orderSaves.current = request.catch(() => undefined);
      return request;
    }, {
      key: `order:${PROTOTYPES}`,
      success: 'Order saved',
      onSaved: (data) => setOrder({ slugs: data.order.slugs, version: data.order.version }),
    });
    if (!result.ok) setOrder((current) => (current.slugs === next ? previous : current));
  };

  const savePlacement = async (project: ProjectRecord, listed: boolean) => {
    const data = await adminRequest<{ placement: StoryPlacement }>(site(siteDataPaths.placement(project.slug)), {
      method: 'PUT',
      body: JSON.stringify({ listed, expectedVersion: placements.get(project.slug)?.version ?? 0 }),
    });
    return data.placement;
  };
  const action = (kind: ProjectRecordAction['action']) => (project: ProjectRecord) => onRecordAction({ action: kind, slug: project.slug, title: project.title, version: project.version });

  return <>
    <ProjectAdminTable
      kind="prototype"
      projects={visible}
      totalCount={prototypes.length}
      sort={sort}
      onSortChange={setSort}
      placements={placements}
      persistenceAvailable={placementAvailable}
      savePlacement={savePlacement}
      onPlacementSaved={onPlacementSaved}
      onDelete={action('delete')}
      onDuplicate={action('duplicate')}
      positions={positions}
      orderSaveable={orderAvailable}
      onReorder={(slugs) => void reorder(slugs)}
    />
    {unlinked.length > 0 && <ProjectAdminTable
      section={{ id: 'database-records', title: 'Unlinked database records' }}
      kind="record" projects={unlinked} totalCount={unlinked.length}
      sort={sort} onSortChange={setSort}
      placements={placements} persistenceAvailable={placementAvailable} savePlacement={savePlacement} onPlacementSaved={onPlacementSaved}
      onReorder={() => undefined} orderSaveable={false} positions={new Map()}
      onDelete={action('delete')} onDuplicate={action('duplicate')}
    />}
  </>;
}
