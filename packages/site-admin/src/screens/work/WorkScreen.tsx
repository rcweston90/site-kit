'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { SaveRequestError, SaveStatus, deleteWithUndo, useListSave, type SaveStatusState } from '@rcweston/save-kit';
import type { StoryEditorState, StorySummary } from '@rcweston/story-core';
import { moveTo, placeVisibleOrder, siteDataPaths, sortByWorkOrder, type StoryPlacement } from '@rcweston/site-data/client';
import { Button } from '../../primitives/Button.js';
import { AdminLink as Link, useAdminRouter } from '../../router.js';
import { useAdminConfig, adminPath } from '../../config.js';
import { adminRequest } from '../../request.js';
import { copySlug, fullOrder, placesOf, sortStoryRows, storyRows, type StoryRow, type WorkSort } from './model.js';
import { moveMenuEntries, useRowDrag, WorkEmpty, WorkRow, WorkSection, WorkTable, type WorkMenuEntry } from './WorkTable.js';
import StoryPlacementSwitch from './StoryPlacementSwitch.js';
import RecordActions, { type RecordAction } from './RecordActions.js';

export const storyRecordKey = (slug: string) => `story:${slug}`;

/** A card on Work whose page is managed in code (a site feature). */
export interface WorkFeatureRow {
  slug: string;
  title: string;
  updatedAt: string;
  /** Where its Work card is edited. */
  editHref: string;
  /** The page itself. */
  siteHref: string;
}

/**
 * What a later module adds to Work (the projects module: companies,
 * prototypes, site features and project details). Every part is optional.
 */
export interface WorkScreenExtension {
  /** The line under the heading. */
  summary?: (counts: { caseStudies: number; published: number }) => ReactNode;
  /** Beside New case study. */
  headerActions?: ReactNode;
  /** Above the table, given the case-study rows. */
  beforeTable?: (rows: readonly StoryRow[]) => ReactNode;
  /** Which case studies the table keeps (a company filter). */
  showRow?: (row: StoryRow) => boolean;
  /** In place of a row's company line. */
  rowMeta?: (row: StoryRow) => ReactNode[];
  /** Added to a row's More menu after Story settings. */
  rowMenu?: (row: StoryRow) => WorkMenuEntry[];
  /** Cards placed and ordered among the case studies. */
  features?: readonly WorkFeatureRow[];
  /** Below the case studies, given the search, the page's save status and the case-study rows. */
  afterTable?: (context: { query: string; status: SaveStatusState; rows: readonly StoryRow[] }) => ReactNode;
  /** The page has other rows, so it isn't empty without stories. */
  hasOtherRows?: boolean;
}

type CaseRow = StoryRow & { feature?: WorkFeatureRow };
const featureRow = (feature: WorkFeatureRow, placements: ReadonlyMap<string, { listed: boolean; version: number }>): CaseRow => ({
  slug: feature.slug, title: feature.title, company: '', year: '', updatedAt: feature.updatedAt, version: 0, published: true,
  listed: placements.get(feature.slug)?.listed ?? true, placementVersion: placements.get(feature.slug)?.version ?? 0, cover: null, feature,
});

interface WorkOrderRecord {
  slugs: string[];
  version: number;
}

/**
 * Work: every story in one table, in the order the site shows them. Drag a
 * row by its grip or use its More menu to move it; the switch lists it on
 * Work or not (publishing is the editor's); the More menu also opens the
 * reader, duplicates a story as a draft, and deletes one with Undo.
 *
 * `beforeTable` is a slot for later modules (a company filter, say).
 */
/** A row's still: an image's file, or a video's poster. */
function coverThumbnail(cover: StoryRow['cover'], mediaSrc: (src: string) => string) {
  const still = cover?.kind === 'video' ? cover.poster : cover?.src;
  if (!cover || !still) return null;
  return { src: mediaSrc(still), alt: cover.alt, ...(cover.objectPosition ? { objectPosition: cover.objectPosition } : {}) };
}

export function WorkScreen({ beforeTable, newStoryPath = 'stories/new', extend = {} }: { beforeTable?: ReactNode; newStoryPath?: string; extend?: WorkScreenExtension }) {
  const config = useAdminConfig();
  const { push } = useAdminRouter();
  const { status, hidden } = useListSave();
  const [stories, setStories] = useState<StorySummary[]>([]);
  const [placements, setPlacements] = useState<Map<string, StoryPlacement>>(new Map());
  const [placementAvailable, setPlacementAvailable] = useState(false);
  const [workOrder, setWorkOrder] = useState<WorkOrderRecord>({ slugs: [], version: 0 });
  const [workOrderAvailable, setWorkOrderAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageNotice, setPageNotice] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [recordAction, setRecordAction] = useState<RecordAction>();
  // Saves go one after another: each sends a whole list, so two quick moves
  // must reach the server in the order they were made.
  const orderSaves = useRef<Promise<unknown>>(Promise.resolve());
  const site = (path: string) => `${config.siteApi}${path}`;

  const loadOrder = useCallback(() => fetch(site(siteDataPaths.workOrder(config.workList)), { credentials: 'same-origin' })
    .then((response) => (response.ok ? (response.json() as Promise<{ order: WorkOrderRecord }>) : null))
    .catch(() => null)
    .then((data) => {
      if (data) setWorkOrder({ slugs: data.order.slugs, version: data.order.version });
      setWorkOrderAvailable(Boolean(data));
    }), [config.siteApi, config.workList]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(() => Promise.all([
    adminRequest<{ stories: StorySummary[] }>(`${config.storyApi}/stories`),
    // Placement and order aren't worth failing the page for: without them
    // every story shows as listed, in the stand-in order, and can't be moved.
    fetch(site(siteDataPaths.placements()), { credentials: 'same-origin' })
      .then((response) => (response.ok ? (response.json() as Promise<{ placements: StoryPlacement[] }>) : null))
      .catch(() => null),
    loadOrder(),
  ])
    .then(([storyData, placementData]) => {
      setStories(storyData.stories);
      setPlacements(new Map((placementData?.placements ?? []).map((placement) => [placement.slug, placement])));
      setPlacementAvailable(Boolean(placementData));
    })
    .catch((reason: unknown) => setError(reason instanceof SaveRequestError && reason.kind === 'session'
      ? 'Your session ended. Sign in again to see Work.'
      : 'Work couldn’t be loaded. Check your connection and try again.'))
    .finally(() => setLoading(false)), [config.storyApi, loadOrder]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => storyRows(stories.filter((story) => !hidden.has(storyRecordKey(story.slug))), placements), [stories, placements, hidden]);
  const { features } = extend;
  // Site features share the case studies' order and placement.
  const placedRows = useMemo<CaseRow[]>(() => [...rows, ...(features ?? []).filter((feature) => !rows.some((row) => row.slug === feature.slug)).map((feature) => featureRow(feature, placements))], [rows, features, placements]);
  // The list in full, as the site will show it, whatever the search hides.
  const fullWorkOrder = useMemo(
    () => fullOrder(workOrder.slugs, sortStoryRows(placedRows, { key: 'order', direction: 'asc' }, workOrder.slugs).map((row) => row.slug)),
    [placedRows, workOrder.slugs],
  );
  // Numbered among the rows switched on to Work, so # reads 1, 2, 3 with
  // nothing missing and #1 is the first one the site shows.
  const positions = useMemo(() => placesOf(
    sortStoryRows(placedRows, { key: 'order', direction: 'asc' }, fullWorkOrder).filter((row) => row.listed).map((row) => row.slug),
  ), [placedRows, fullWorkOrder]);
  const publishedCount = rows.filter((row) => row.published).length;

  /** Save the order after rows moved. Optimistic: rows go back only if the save fails. */
  const reorder = async (visible: string[]) => {
    const previous = workOrder;
    const next = placeVisibleOrder(fullWorkOrder, visible);
    setWorkOrder((current) => ({ ...current, slugs: next }));
    setPageNotice(null);
    let savedVersion = previous.version;
    const result = await status.run(() => {
      const request = orderSaves.current.then(() => adminRequest<{ order: WorkOrderRecord }>(site(siteDataPaths.workOrder()), {
        method: 'PUT',
        body: JSON.stringify({ list: config.workList, slugs: next, expectedVersion: savedVersion }),
      })).then((data) => {
        savedVersion = data.order.version;
        return data;
      }, (reason: unknown) => {
        // Moved somewhere else meanwhile: show that order, not ours.
        if (reason instanceof SaveRequestError && reason.status === 409) void loadOrder();
        throw reason;
      });
      orderSaves.current = request.catch(() => undefined);
      return request;
    }, {
      key: 'order',
      success: 'Order saved',
      onSaved: (data) => setWorkOrder({ slugs: data.order.slugs, version: data.order.version }),
    });
    if (!result.ok) setWorkOrder((current) => (current.slugs === next ? previous : current));
  };

  const savePlacement = async (row: StoryRow, listed: boolean) => {
    const data = await adminRequest<{ placement: StoryPlacement }>(site(siteDataPaths.placement(row.slug)), {
      method: 'PUT',
      body: JSON.stringify({ listed, expectedVersion: placements.get(row.slug)?.version ?? 0 }),
    }).catch((reason: unknown) => {
      if (reason instanceof SaveRequestError && reason.status === 409) void load();
      throw reason;
    });
    return data.placement;
  };

  const startDelete = (record: RecordAction) => {
    setPageNotice(null);
    deleteWithUndo({
      key: storyRecordKey(record.slug),
      label: `Deleting “${record.title}”`,
      send: ({ keepalive }) => adminRequest(`${config.storyApi}/stories/${encodeURIComponent(record.slug)}`, { method: 'DELETE', keepalive }),
      onDone: () => {
        setStories((current) => current.filter((story) => story.slug !== record.slug));
        setWorkOrder((current) => ({ ...current, slugs: current.slugs.filter((slug) => slug !== record.slug) }));
      },
    });
  };

  const duplicate = async (record: RecordAction) => {
    const state = await adminRequest<StoryEditorState>(`${config.storyApi}/stories/${encodeURIComponent(record.slug)}`);
    if (state.documents.length === 0) throw new Error('There’s no saved version to copy.');
    const slug = copySlug(record.slug, new Set(stories.map((story) => story.slug)));
    await adminRequest(`${config.storyApi}/stories/${encodeURIComponent(slug)}/drafts`, {
      method: 'POST',
      body: JSON.stringify({ content: { ...state.story, slug, title: `${state.story.title} (copy)` }, parentDocumentId: null }),
    });
    push(config.editorHref(slug));
  };

  if (loading) {
    return (
      <div role="status" aria-live="polite" className="mx-auto max-w-6xl py-major text-center font-mono text-sm uppercase tracking-wider text-foreground-muted">
        Loading work…
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="mx-auto max-w-2xl rounded-lg border border-status-error/30 bg-status-error/10 p-minor text-center">
        <h1 className="font-mono text-xl font-bold uppercase tracking-wide text-foreground">Work unavailable</h1>
        <p className="mt-half text-sm leading-baseline text-status-error">{error}</p>
        <div className="mt-minor"><Button variant="secondary" size="sm" onClick={() => { setLoading(true); setError(null); void load(); }}>Retry</Button></div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <header className="border-b border-default pb-minor">
        <div className="flex flex-col gap-minor md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="font-mono text-3xl font-bold uppercase tracking-wide text-foreground md:text-4xl">Work</h1>
            <p className="mt-half text-sm leading-baseline text-foreground-muted">
              {extend.summary ? extend.summary({ caseStudies: rows.length, published: publishedCount }) : <>One inventory for {rows.length} case {rows.length === 1 ? 'study' : 'studies'}, {publishedCount} published. Visible lists a case study on Work; publishing makes it live for readers.</>}
            </p>
          </div>
          <div className="flex flex-wrap gap-half">
            <Link href={adminPath(config, newStoryPath)} className="inline-flex min-h-12 items-center justify-center rounded-lg bg-foreground px-5 font-mono text-xs font-semibold uppercase tracking-wider text-background hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2">
              New case study
            </Link>
            {extend.headerActions}
          </div>
        </div>
      </header>

      <section aria-labelledby="project-filters-heading" className="py-minor">
        <h2 id="project-filters-heading" className="sr-only">Search and filter projects</h2>
        <div className="grid gap-half md:grid-cols-[minmax(260px,1fr)_auto] md:items-end">
          <label className="flex flex-col gap-1 font-mono text-xs uppercase tracking-wider text-foreground-muted">
            Search
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="Title, organization, slug…"
              className="min-h-11 rounded-md border border-default bg-card-bg px-3 text-sm normal-case tracking-normal text-foreground placeholder:text-foreground-muted/60 focus-visible:outline-2 focus-visible:outline-offset-2"
            />
          </label>
          <Button variant="ghost" size="sm" onClick={() => setQuery('')} disabled={query === ''}>
            Clear filters
          </Button>
        </div>
      </section>

      {beforeTable}
      {extend.beforeTable?.(rows)}

      <SaveStatus status={status} className="mb-minor" />
      {pageNotice && (
        <p role="status" className="mb-minor rounded-md border border-default bg-card-bg px-3 py-half text-sm leading-baseline text-foreground">
          {pageNotice}
        </p>
      )}

      {rows.length === 0 && stories.length === 0 && !extend.hasOtherRows && !features?.length ? (
        <section className="rounded-lg border border-default bg-card-bg p-minor text-center">
          <h2 className="font-mono text-lg font-bold uppercase tracking-wide">No case studies yet</h2>
          <p className="mt-half text-sm leading-baseline text-foreground-muted">Start one, and it shows up here as a private draft.</p>
          <div className="mt-minor"><Button size="sm" onClick={() => push(adminPath(config, newStoryPath))}>New case study</Button></div>
        </section>
      ) : (
        <div className="space-y-minor-2">
          <CaseStudyTable
            rows={placedRows.filter((row) => row.feature || !extend.showRow || extend.showRow(row))}
            extend={extend}
            query={query}
            order={fullWorkOrder}
            positions={positions}
            orderSaveable={workOrderAvailable}
            placementAvailable={placementAvailable}
            onReorder={(visible) => void reorder(visible)}
            savePlacement={savePlacement}
            onPlacementSaved={(saved) => setPlacements((current) => new Map(current).set(saved.slug, { ...saved, updatedAt: new Date().toISOString() }))}
            onRecordAction={setRecordAction}
          />
          {extend.afterTable?.({ query, status, rows })}
        </div>
      )}

      {recordAction && <RecordActions
        record={recordAction}
        onDismiss={() => setRecordAction(undefined)}
        onDelete={() => startDelete(recordAction)}
        onDuplicate={() => duplicate(recordAction)}
      />}
    </div>
  );
}

function CaseStudyTable({ rows, extend, query, order, positions, orderSaveable, placementAvailable, onReorder, savePlacement, onPlacementSaved, onRecordAction }: {
  rows: CaseRow[];
  extend: WorkScreenExtension;
  query: string;
  order: string[];
  positions: ReadonlyMap<string, number>;
  orderSaveable: boolean;
  placementAvailable: boolean;
  onReorder: (visible: string[]) => void;
  savePlacement: (row: StoryRow, listed: boolean) => Promise<StoryPlacement>;
  onPlacementSaved: (saved: StoryPlacement) => void;
  onRecordAction: (action: RecordAction) => void;
}) {
  const config = useAdminConfig();
  const [sort, setSort] = useState<WorkSort>({ key: 'order', direction: 'asc' });
  const [announcement, setAnnouncement] = useState('');
  const needle = query.trim().toLocaleLowerCase();
  const visible = sortStoryRows(rows.filter((row) => !needle || [row.title, row.slug, row.company].some((value) => value.toLocaleLowerCase().includes(needle))), sort, order);
  // Only what the site shows is numbered and moved; the rest follow it.
  const onWork = visible.filter((row) => row.listed);
  const offWork = visible.filter((row) => !row.listed);
  const movable = orderSaveable && sort.key === 'order';
  const drag = useRowDrag(onWork.map((row) => row.slug), onReorder);
  const shown = movable ? sortByWorkOrder(onWork, (row) => row.slug, drag.values) : onWork;
  const move = (index: number, to: number) => {
    onReorder(moveTo(shown.map((row) => row.slug), index, to));
    setAnnouncement(`${shown[index]!.title} moved to ${to + 1} of ${shown.length}`);
  };
  const placementSaved = (row: StoryRow, saved: StoryPlacement) => {
    if (row.listed !== saved.listed) {
      setAnnouncement(saved.listed ? `Saved. ${row.title} is back in the site’s order.` : `Saved. ${row.title} moved to Not visible on Work.`);
    }
    onPlacementSaved(saved);
  };
  const editorHref = (slug: string, settings = false) => `${config.editorHref(slug)}${settings ? '?settings=1' : ''}`;
  const renderRow = (row: CaseRow, index: number, movableRow: boolean) => (
    <WorkRow
      key={row.slug}
      title={row.title}
      position={positions.get(row.slug)}
      onDragEnd={movableRow ? drag.onDragEnd : undefined}
      href={row.feature ? row.feature.editHref : editorHref(row.slug)}
      editLabel={row.feature ? 'Edit Work card' : 'Edit story'}
      thumbnail={coverThumbnail(row.cover, config.mediaSrc)}
      meta={row.feature ? ['Site feature · page managed in code'] : extend.rowMeta ? extend.rowMeta(row) : [row.company || 'Company not set']}
      year={row.year || '—'}
      slug={row.slug}
      status={row.feature ? { tone: 'neutral', label: 'Site feature', detail: 'Work card only' } : {
        tone: row.published ? 'success' : 'neutral',
        label: row.published ? 'Live' : 'Draft',
        detail: !row.published && row.listed ? 'Listed after publishing' : `v${row.version}`,
      }}
      visibility={(
        <StoryPlacementSwitch
          title={row.title}
          initial={{ slug: row.slug, listed: row.listed }}
          persistenceAvailable={placementAvailable}
          save={(listed) => savePlacement(row, listed)}
          onSaved={(saved) => placementSaved(row, { ...saved, updatedAt: null })}
        />
      )}
      updated={row.updatedAt}
      menu={row.feature ? [
        { label: 'Open site feature', href: row.feature.siteHref },
        ...(movableRow && shown.length > 1 ? ['separator' as const, ...moveMenuEntries(index, shown.length, (to) => move(index, to))] : []),
      ] : [
        { label: 'Story settings', href: editorHref(row.slug, true) },
        ...(extend.rowMenu?.(row) ?? []),
        ...(row.published ? [{ label: 'Reader preview', href: config.storyHref(row.slug), external: true }] : []),
        { label: 'Duplicate as draft', onSelect: () => onRecordAction({ action: 'duplicate', slug: row.slug, title: row.title, versions: row.version, published: row.published }) },
        { label: 'Review deletion', danger: true, onSelect: () => onRecordAction({ action: 'delete', slug: row.slug, title: row.title, versions: row.version, published: row.published }) },
        ...(movableRow && shown.length > 1 ? ['separator' as const, ...moveMenuEntries(index, shown.length, (to) => move(index, to))] : []),
      ]}
    />
  );

  return (
    <WorkSection
      id="case-studies"
      title={rows.some((row) => row.feature) ? 'Case studies and site features' : 'Case studies'}
      shown={visible.length}
      total={rows.length}
      note={orderSaveable ? undefined : 'Order can’t be saved here yet'}
      announcement={announcement}
    >
      {visible.length === 0 ? (
        <WorkEmpty>No case studies match these filters</WorkEmpty>
      ) : (
        <WorkTable
          caption={movable
            ? 'Case studies, in the order the site shows them, then those not visible on Work. Drag a row by its grip, or use its More menu, to move it.'
            : 'Case studies, those not visible on Work last. Column headings sort this list only; # is the order the site shows them in.'}
          sort={sort}
          onSortChange={setSort}
          drag={movable ? drag : undefined}
          notVisible={offWork.map((row, index) => renderRow(row, index, false))}
        >
          {shown.map((row, index) => renderRow(row, index, movable))}
        </WorkTable>
      )}
    </WorkSection>
  );
}
