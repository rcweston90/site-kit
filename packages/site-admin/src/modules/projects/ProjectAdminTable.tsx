'use client';

import { useState, type ReactNode } from 'react';
import { moveTo, sortByWorkOrder, type ProjectRecord, type StoryPlacement } from '@rcweston/site-data/client';
import { adminPath, useAdminConfig } from '../../config.js';
import type { WorkSort } from '../../screens/work/model.js';
import { moveMenuEntries, useRowDrag, WorkEmpty, WorkRow, WorkSection, WorkTable, type WorkMenuEntry } from '../../screens/work/WorkTable.js';
import StoryPlacementSwitch, { type SavedPlacement } from '../../screens/work/StoryPlacementSwitch.js';
import { projectStatus, projectYear, type ProjectTableKind } from './model.js';

interface ProjectAdminTableProps {
  kind: ProjectTableKind;
  projects: ProjectRecord[];
  totalCount: number;
  sort: WorkSort;
  onSortChange: (sort: WorkSort) => void;
  /** Saved Work placements; a record without one is on Work. */
  placements: ReadonlyMap<string, StoryPlacement>;
  /** False until placement can be stored: the switches show but can't save. */
  persistenceAvailable: boolean;
  savePlacement: (project: ProjectRecord, listed: boolean) => Promise<SavedPlacement>;
  onPlacementSaved?: (saved: SavedPlacement) => void;
  /** Gone at once; the admin's undo toast can take it back. */
  onDelete: (project: ProjectRecord) => void;
  onDuplicate?: (project: ProjectRecord) => void;
  /** Each row's place in the site's order, from 1. */
  positions: ReadonlyMap<string, number>;
  /** False until the order can be stored: rows show their place but don't move. */
  orderSaveable: boolean;
  /** The rows on screen in their new order, after a drag or a move. */
  onReorder: (visible: string[]) => void;
  /** Under the heading, above the rows. */
  intro?: ReactNode;
  section?: { id: string; title: string };
}

/**
 * Project-card rows on Work (the prototypes, and records with no story), in
 * the same row anatomy as the case studies above them.
 */
export function ProjectAdminTable({
  kind,
  projects,
  totalCount,
  sort,
  onSortChange,
  placements,
  persistenceAvailable,
  savePlacement,
  onPlacementSaved,
  onDelete,
  onDuplicate,
  positions,
  orderSaveable,
  onReorder,
  intro,
  section,
}: ProjectAdminTableProps) {
  const config = useAdminConfig();
  const title = section?.title ?? 'Prototypes';
  const [announcement, setAnnouncement] = useState('');
  const listed = (project: ProjectRecord) => placements.get(project.slug)?.listed ?? true;
  // Only what the site shows is numbered and moved; the rest follow it.
  const onWork = projects.filter(listed);
  const offWork = projects.filter((project) => !listed(project));
  // Rows move only in the site's order, where a move means what it shows.
  const movable = orderSaveable && sort.key === 'order';
  const drag = useRowDrag(onWork.map((project) => project.slug), onReorder);
  const shown = movable ? sortByWorkOrder(onWork, (project) => project.slug, drag.values) : onWork;
  const move = (index: number, to: number) => {
    onReorder(moveTo(shown.map((project) => project.slug), index, to));
    setAnnouncement(`${shown[index]!.title} moved to ${to + 1} of ${shown.length}`);
  };
  // The switch's own "Saved" goes with the row it leaves, so the section says it.
  const placementSaved = (project: ProjectRecord, saved: SavedPlacement) => {
    if (listed(project) !== saved.listed) {
      setAnnouncement(saved.listed ? `Saved. ${project.title} is back in the site’s order.` : `Saved. ${project.title} moved to Not visible on Work.`);
    }
    onPlacementSaved?.(saved);
  };

  const renderRow = (project: ProjectRecord, index: number, movableRow: boolean) => {
    const detailsHref = adminPath(config, `projects/${encodeURIComponent(project.slug)}/edit`);
    const menu: WorkMenuEntry[] = [];
    if (project.url && kind === 'prototype') menu.push({ label: 'Open prototype', href: project.url, external: true });
    menu.push({ label: 'Project details', href: detailsHref });
    menu.push('separator');
    const moves = movableRow ? moveMenuEntries(index, shown.length, (to) => move(index, to)) : [];
    if (moves.length > 0) menu.push(...moves, 'separator');
    if (onDuplicate) menu.push({ label: 'Duplicate as draft', onSelect: () => onDuplicate(project) });
    menu.push({ label: 'Review deletion', danger: true, onSelect: () => onDelete(project) });
    return (
      <WorkRow
        key={project.slug}
        title={project.title}
        position={positions.get(project.slug)}
        onDragEnd={movableRow ? drag.onDragEnd : undefined}
        href={detailsHref}
        editLabel="Edit details"
        meta={[
          project.org || 'No organization',
          project.featured && 'Featured',
        ]}
        year={projectYear(project.date)}
        slug={project.slug}
        status={projectStatus(project, kind)}
        visibility={(
          <StoryPlacementSwitch
            title={project.title}
            initial={{ slug: project.slug, listed: listed(project) }}
            persistenceAvailable={persistenceAvailable}
            save={(next) => savePlacement(project, next)}
            onSaved={(saved) => placementSaved(project, saved)}
          />
        )}
        updated={project.updatedAt}
        menu={menu}
      />
    );
  };

  return (
    <WorkSection
      id={section?.id ?? 'prototypes'}
      title={title}
      shown={projects.length}
      total={totalCount}
      note={orderSaveable ? undefined : 'Order can’t be saved here yet'}
      announcement={announcement}
    >
      {intro}
      {projects.length === 0 ? (
        <WorkEmpty>No {title.toLocaleLowerCase()} match these filters</WorkEmpty>
      ) : (
        <WorkTable
          caption={movable
            ? `${title}, in the order the site shows them, then those not visible on Work. Drag a row by its grip, or use its More menu, to move it.`
            : `${title}, those not visible on Work last. Column headings sort this list only; # is the order the site shows them in.`}
          sort={sort}
          onSortChange={onSortChange}
          drag={movable ? drag : undefined}
          notVisible={offWork.map((project, index) => renderRow(project, index, false))}
        >
          {shown.map((project, index) => renderRow(project, index, movable))}
        </WorkTable>
      )}
    </WorkSection>
  );
}
