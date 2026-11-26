'use client';

import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { AdminLink as Link } from '../../router.js';
import { DropdownMenu } from 'radix-ui';
import { ArrowUpRight, Ellipsis, GripVertical } from 'lucide-react';
import {
  adminMenuContentClass,
  adminMenuItemClass,
  adminMenuSeparatorClass,
} from '../../menu/index.js';
import { nextWorkSort, type WorkSort, type WorkSortKey } from './model.js';

/*
 * One row anatomy for everything on Work:
 *
 *   #     Name           Year   Status    Visibility                       Updated       Edit  ⋯
 *   ⋮⋮ 1  org · slug            ● Live    [on] Visible
 *
 * - # is the row's place on the site. Sorted by it (the default), the ⋮⋮
 *   grip drags a row to a new place; the More menu moves it a step or to
 *   either end, for keyboards and anyone who can't drag.
 * - Rows switched off Work come last, under "Not visible on Work", whatever
 *   the sort: unnumbered and unmovable, since the site doesn't show them.
 *   Each keeps its place in the order for when it's switched back on.
 * - The name and the Edit button go to the same place: the thing a row is for.
 * - Status is a dot and a word, never a pill (no boxes as decoration).
 * - Everything else is in the row's More menu, destructive actions last and
 *   set apart.
 * - Hairlines, not a box, separate the rows.
 *
 * A real table once its section is 56rem wide. Narrower (beside the docked
 * admin nav on a small laptop, or a tablet) a row is two lines, keeping its
 * table roles:
 *
 *   ⋮⋮ 1  Name                                     Edit  ⋯
 *         ● Live · 2025 · org      [on] Visible
 *
 * and on a phone the switches take a third line of their own. The slug, the
 * status's qualifier and the updated date are left to the table.
 */

export type WorkTone = 'success' | 'warning' | 'neutral';

export interface WorkStatus {
  tone: WorkTone;
  label: string;
  /** A qualifier under the status in the table ("v4", "On Work once published"). */
  detail?: string;
}

export type WorkMenuEntry =
  | { label: string; href: string; external?: boolean }
  | { label: string; onSelect: () => void; danger?: boolean; disabled?: boolean }
  | 'separator';

const updatedFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const localUpdatedFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/** "Oct 1, 2026" in UTC, or in the browser's own time zone when `local`; an
 * em dash when there's no date to show. */
export function formatUpdated(value: string | null | undefined, local = false): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return (local ? localUpdatedFormat : updatedFormat).format(date);
}

const noSubscription = () => () => {};

/** The server renders the day in UTC so hydration agrees; the browser then
 * shows its own day, so an edit made late in the evening isn't dated tomorrow. */
function UpdatedDate({ value }: { value: string | null | undefined }) {
  const local = useSyncExternalStore(noSubscription, () => true, () => false);
  return formatUpdated(value, local);
}

const headerText = 'font-mono text-xs font-semibold uppercase tracking-wider text-foreground-muted';
const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2';

/** A Work section: its heading and count over the rows. */
export function WorkSection({
  id,
  title,
  shown,
  total,
  note,
  announcement,
  children,
}: {
  id: string;
  title: string;
  shown: number;
  total: number;
  /** A short line beside the count ("Order can’t be saved here yet"). */
  note?: string;
  /** Read out by screen readers when it changes: where a moved row went. */
  announcement?: string;
  children: ReactNode;
}) {
  return (
    // The container the rows measure: a table from 56rem, three-line rows below.
    <section id={id} aria-labelledby={`${id}-heading`} className="@container scroll-mt-major border-t border-default pt-minor">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 id={`${id}-heading`} className="font-mono text-xl font-bold uppercase tracking-wide text-foreground">{title}</h2>
        <span className="font-mono text-xs uppercase tracking-wider text-foreground-muted">{shown} of {total}</span>
        {note && <span className="text-xs leading-baseline text-foreground-muted">{note}</span>}
      </div>
      {/* Always mounted: a live region only announces changes it was present for. */}
      <span role="status" className="sr-only">{announcement ?? ''}</span>
      {children}
    </section>
  );
}

function SortHeader({
  label,
  accessibleLabel,
  sortKey,
  sort,
  onChange,
  className,
}: {
  label: string;
  /** Said instead of a terse visible label ("#"). */
  accessibleLabel?: string;
  sortKey: WorkSortKey;
  sort: WorkSort;
  onChange: (sort: WorkSort) => void;
  className: string;
}) {
  const active = sort.key === sortKey;
  return (
    <th role="columnheader" scope="col" aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'} className={`text-left ${className}`}>
      <button
        type="button"
        aria-label={accessibleLabel}
        onClick={() => onChange(nextWorkSort(sort, sortKey))}
        className={`inline-flex min-h-11 items-center gap-1 ${headerText} hover:text-foreground ${focusRing}`}
      >
        {label}
        <span aria-hidden="true" className={active ? 'text-foreground' : 'opacity-0'}>
          {sort.direction === 'desc' ? '↓' : '↑'}
        </span>
      </button>
    </th>
  );
}

// A cell in table layout; in a three-line row each cell takes its grid area.
const cell = '@4xl:table-cell @4xl:px-3 @4xl:py-half @4xl:align-middle';

/**
 * A list's order while a row is held: every place the row passes shows at
 * once, and only where it's let go is saved. Rows render in `values`.
 */
export function useRowDrag(order: string[], onCommit: (next: string[]) => void) {
  const [held, setHeld] = useState<string[] | null>(null);
  const latest = useRef<string[] | null>(null);
  return {
    values: held ?? order,
    onReorder: (next: string[]) => {
      latest.current = next;
      setHeld(next);
    },
    onDragEnd: () => {
      const next = latest.current;
      latest.current = null;
      setHeld(null);
      if (next && next.some((slug, index) => slug !== order[index])) onCommit(next);
    },
  };
}

const focusable = 'a[href], button';

interface RowDragContextValue {
  values: { current: string[] };
  onReorder: (next: string[]) => void;
}

const RowDragContext = createContext<RowDragContextValue | null>(null);

/**
 * Drags a row by its handle. The pointer is captured on the handle, and each
 * move puts the row after every other row whose middle it has passed.
 */
function useHandleDrag(slug: string, onDragEnd: (() => void) | undefined) {
  const drag = useContext(RowDragContext);
  const [dragging, setDragging] = useState(false);
  const start = (event: ReactPointerEvent<HTMLElement>) => {
    if (!drag || !onDragEnd || event.button !== 0) return;
    const handle = event.currentTarget;
    const row = handle.closest<HTMLElement>('[data-work-row]');
    const body = row?.parentElement;
    if (!row || !body) return;
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    setDragging(true);
    const move = (moved: PointerEvent) => {
      const values = drag.values.current;
      const from = values.indexOf(slug);
      if (from < 0) return;
      let to = 0;
      for (const other of body.querySelectorAll<HTMLElement>(':scope > [data-work-row]')) {
        if (other === row) continue;
        const box = other.getBoundingClientRect();
        if (moved.clientY > box.top + box.height / 2) to += 1;
      }
      if (to === from) return;
      const next = values.filter((value) => value !== slug);
      next.splice(to, 0, slug);
      drag.values.current = next;
      drag.onReorder(next);
    };
    // On the window, not the handle: moving the held row in the DOM (a drag
    // downwards does) releases its pointer capture, and the handle would stop
    // hearing the pointer, so the drop would never save.
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      setDragging(false);
      onDragEnd();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };
  return { dragging, start };
}

/**
 * Switching a row on or off Work moves it to the other group, where it
 * mounts afresh; keyboard focus follows it there instead of falling to the
 * page. Followed without scrolling when the switch was clicked: the row
 * leaving the pointer is enough.
 */
function useFocusFollowsRow() {
  const tableRef = useRef<HTMLTableElement>(null);
  const last = useRef<{ element: Element; slug: string; index: number; keyboard: boolean } | null>(null);
  useEffect(() => {
    const table = tableRef.current;
    if (!table) return;
    const remember = (event: FocusEvent) => {
      const target = event.target as Element;
      const row = target.closest('[data-work-row]');
      last.current = row ? {
        element: target,
        slug: row.getAttribute('data-work-row') ?? '',
        index: [...row.querySelectorAll(focusable)].indexOf(target),
        keyboard: target.matches(':focus-visible'),
      } : null;
    };
    table.addEventListener('focusin', remember);
    return () => table.removeEventListener('focusin', remember);
  }, []);
  useLayoutEffect(() => {
    const focused = last.current;
    if (!focused || focused.element.isConnected) return;
    if (document.activeElement && document.activeElement !== document.body) return;
    const row = tableRef.current?.querySelector(`[data-work-row="${CSS.escape(focused.slug)}"]`);
    row?.querySelectorAll<HTMLElement>(focusable)[focused.index]?.focus({ preventScroll: !focused.keyboard });
  });
  return tableRef;
}

/** The table both Work sections use; rows are WorkRow. */
export function WorkTable({
  caption,
  sort,
  onSortChange,
  drag,
  notVisible = [],
  children,
}: {
  caption: string;
  sort: WorkSort;
  onSortChange: (sort: WorkSort) => void;
  /** From useRowDrag, while rows can be dragged; each WorkRow then gets `onDragEnd`. */
  drag?: { values: string[]; onReorder: (next: string[]) => void };
  /** Rows switched off Work, listed after the rest under their own heading. Never dragged. */
  notVisible?: ReactNode[];
  /** Rows on Work. */
  children: ReactNode;
}) {
  const bodyClass = 'block @4xl:table-row-group';
  const tableRef = useFocusFollowsRow();
  const values = useRef<string[]>(drag?.values ?? []);
  values.current = drag?.values ?? [];
  const onReorder = drag?.onReorder;
  const dragContext = useMemo(() => (onReorder ? { values, onReorder } : null), [onReorder]);
  return (
    <table ref={tableRef} role="table" className="mt-half block w-full border-collapse border-y border-default @4xl:table @4xl:table-fixed">
      <caption className="sr-only">{caption}</caption>
      {/* Fixed widths, the same in both sections, so their columns line up. */}
      <thead className="hidden @4xl:table-header-group">
        <tr role="row" className="border-b border-default">
          <SortHeader label="#" accessibleLabel="Order on the site" sortKey="order" sort={sort} onChange={onSortChange} className="w-16 pr-3" />
          <SortHeader label="Name" sortKey="title" sort={sort} onChange={onSortChange} className="px-3" />
          <SortHeader label="Year" sortKey="date" sort={sort} onChange={onSortChange} className="w-16 px-3" />
          <SortHeader label="Status" sortKey="status" sort={sort} onChange={onSortChange} className="w-36 px-3" />
          <th role="columnheader" scope="col" className={`w-76 px-3 text-left ${headerText}`}>Visibility</th>
          <SortHeader label="Updated" sortKey="updated" sort={sort} onChange={onSortChange} className="w-28 px-3" />
          <th role="columnheader" scope="col" className="w-28 pl-3"><span className="sr-only">Actions</span></th>
        </tr>
      </thead>
      {drag ? (
        <RowDragContext.Provider value={dragContext}>
          <tbody className={bodyClass}>{children}</tbody>
        </RowDragContext.Provider>
      ) : (
        <tbody className={bodyClass}>{children}</tbody>
      )}
      {notVisible.length > 0 && (
        <tbody className={bodyClass}>
          <tr role="row" className="block border-t border-default @4xl:table-row [tbody:empty+tbody>&]:border-t-0">
            <th role="rowheader" scope="rowgroup" colSpan={7} className={`block pt-minor text-left leading-baseline @4xl:table-cell ${headerText}`}>
              Not visible on Work <span className="font-normal">· {notVisible.length}</span>
            </th>
          </tr>
          {notVisible}
        </tbody>
      )}
    </table>
  );
}

function StatusMark({ tone }: { tone: WorkTone }) {
  const dot = tone === 'success' ? 'bg-status-success' : tone === 'warning' ? 'bg-status-warning' : 'bg-foreground-muted';
  return <span aria-hidden="true" className={`inline-block h-2 w-2 shrink-0 rounded-full ${dot}`} />;
}

export interface WorkRowProps {
  title: string;
  /** The row's place in the site's order, from 1. */
  position?: number;
  /** Set while the list can be dragged (inside WorkTable's `drag`): saves the order on release. */
  onDragEnd?: () => void;
  /** Where the name and Edit go. Without it (some fixture rows) both are inert. */
  href?: string;
  /** What Edit opens, said in full: "Edit story", "Edit details". */
  editLabel: string;
  /** Under the name: organization and the like. */
  meta: ReactNode[];
  /** Shown after the meta in the table only. */
  slug: string;
  year: string;
  status: WorkStatus;
  visibility: ReactNode;
  updated: string | null | undefined;
  menu: WorkMenuEntry[];
  /** The row's card image (its story's hero), beside the name. `null` keeps
   *  the space for a row without one; leave it out for no thumbnails. */
  thumbnail?: { src: string; alt: string; objectPosition?: string } | null;
}

// Buttons in a row are 32px to look at and 44px to press: each ::before
// reaches 6px past it.
const menuItem = `${adminMenuItemClass} cursor-pointer`;

export function WorkRow({ title, position, onDragEnd, href, editLabel, meta, slug, year, status, visibility, updated, menu, thumbnail }: WorkRowProps) {
  const metaItems = meta.filter(Boolean);
  const joined = (items: ReactNode[]) => items.map((item, index) => <span key={index}>{index > 0 && ' · '}{item}</span>);
  const { dragging, start } = useHandleDrag(slug, onDragEnd);
  // Relative so the held row's z-index lifts it over the rows it passes.
  const rowClass = `relative grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-half border-b border-default py-half [grid-template-areas:'order_name_act'_'order_meta_meta'_'order_vis_vis'] last:border-b-0 @lg:[grid-template-areas:'order_name_act'_'order_meta_vis'] @4xl:table-row @4xl:py-0 ${dragging ? 'z-10 bg-card-bg shadow-md' : ''}`;
  const cells = (
    <>
      <td role="cell" className={`[grid-area:order] block self-start ${cell} @4xl:pl-0`}>
        <span className="flex min-h-9 items-center gap-1">
          {onDragEnd ? (
            // Pointer only, so hidden from assistive tech: the More menu moves the row too.
            <span
              aria-hidden="true"
              title="Drag to reorder"
              onPointerDown={start}
              // 24×36 to look at, 44×44 to grab: the ::before reaches past it.
              className="relative -ml-1 inline-flex h-9 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-foreground-muted before:absolute before:-inset-x-2.5 before:-inset-y-1 hover:bg-foreground/5 hover:text-foreground active:cursor-grabbing"
            >
              <GripVertical className="h-4 w-4" strokeWidth={1.75} />
            </span>
          ) : (
            <span aria-hidden="true" className="-ml-1 w-6 shrink-0" />
          )}
          {/* Two digits wide, right-aligned: narrower, each row's grid would
              size its own and the names below 10, from 10, and after a dash
              wouldn't line up. */}
          <span className="min-w-4 text-right font-mono text-xs tabular-nums text-foreground-muted">{position ?? '—'}</span>
        </span>
      </td>
      <th role="rowheader" scope="row" className={`[grid-area:name] block min-w-0 text-left font-normal ${cell}`}>
        <div className={thumbnail === undefined ? 'contents' : 'flex min-w-0 items-center gap-3'}>
          {thumbnail !== undefined && (
            // Decorative: the name beside it says what it is.
            <span aria-hidden="true" data-work-thumbnail="" className="relative block aspect-[16/10] w-16 shrink-0 overflow-hidden rounded-sm border border-default bg-background-secondary @4xl:w-20">
              {thumbnail && <img src={thumbnail.src} alt="" loading="lazy" decoding="async" draggable={false} className="absolute inset-0 h-full w-full object-cover" style={thumbnail.objectPosition ? { objectPosition: thumbnail.objectPosition } : undefined} />}
            </span>
          )}
          <div className={thumbnail === undefined ? 'contents' : 'min-w-0'}>
            {href ? (
              <Link href={href} className={`relative inline-flex min-h-9 items-center font-mono text-sm font-semibold text-foreground before:absolute before:inset-x-0 before:-inset-y-1 hover:text-accent-primary ${focusRing}`}>{title}</Link>
            ) : (
              <span className="inline-flex min-h-9 items-center font-mono text-sm font-semibold text-foreground">{title}</span>
            )}
            {/* In the table the name's second line is the organization and slug. */}
            <p className="m-0 hidden text-sm leading-baseline text-foreground-muted @4xl:block">
              {joined([...metaItems, <span key="slug" className="font-mono text-xs">{slug}</span>])}
            </p>
          </div>
        </div>
      </th>
      {/* Narrower, the status leads that line instead, with the year, beside the switches. */}
      <td role="cell" className="[grid-area:meta] block min-w-0 text-sm leading-baseline text-foreground-muted @4xl:hidden">
        {joined([
          <span key="status" className="inline-flex items-center gap-2 text-foreground"><StatusMark tone={status.tone} />{status.label}</span>,
          year !== '—' && year,
          ...metaItems,
        ].filter(Boolean))}
      </td>
      <td role="cell" className={`hidden font-mono text-sm tabular-nums text-foreground-muted ${cell}`}>{year}</td>
      <td role="cell" className={`hidden ${cell}`}>
        <span className="flex flex-col">
          <span className="inline-flex items-center gap-2 text-sm leading-baseline text-foreground"><StatusMark tone={status.tone} />{status.label}</span>
          {status.detail && <span className="pl-4 text-xs leading-baseline text-foreground-muted">{status.detail}</span>}
        </span>
      </td>
      <td role="cell" className={`[grid-area:vis] block justify-self-start @lg:justify-self-end ${cell}`}>{visibility}</td>
      <td role="cell" className={`hidden font-mono text-xs tabular-nums text-foreground-muted ${cell}`}><UpdatedDate value={updated} /></td>
      <td role="cell" className={`[grid-area:act] block ${cell} @4xl:pr-0`}>
        <div className="flex items-center justify-end gap-2">
          {href ? (
            <Link
              href={href}
              aria-label={`${editLabel}: ${title}`}
              className={`relative inline-flex h-8 items-center rounded-md border border-default px-2.5 font-mono text-xs font-semibold uppercase tracking-wider text-foreground before:absolute before:inset-x-0 before:-inset-y-1.5 hover:border-foreground/40 hover:bg-foreground/5 ${focusRing}`}
            >
              Edit
            </Link>
          ) : (
            <span aria-hidden="true" className="inline-flex h-8 items-center px-2.5 font-mono text-xs uppercase tracking-wider text-foreground-muted/60">Edit</span>
          )}
          <WorkRowMenu title={title} entries={menu} />
        </div>
      </td>
    </>
  );
  return <tr role="row" data-work-row={slug} data-dragging={dragging || undefined} className={rowClass}>{cells}</tr>;
}

function WorkRowMenu({ title, entries }: { title: string; entries: WorkMenuEntry[] }) {
  if (entries.length === 0) return <span className="inline-block w-8" aria-hidden="true" />;
  return (
    // Non-modal: a scroll lock while it's open would jump the long list.
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={`More actions: ${title}`}
          title="More actions"
          className={`relative inline-flex h-8 w-8 items-center justify-center rounded-md text-foreground-muted before:absolute before:-inset-1.5 hover:bg-foreground/5 hover:text-foreground data-[state=open]:bg-foreground/5 ${focusRing}`}
        >
          <Ellipsis aria-hidden="true" className="h-4.5 w-4.5" strokeWidth={1.75} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={adminMenuContentClass} align="end" sideOffset={4} collisionPadding={12}>
          {entries.map((entry, index) => {
            if (entry === 'separator') return <DropdownMenu.Separator key={index} className={adminMenuSeparatorClass} />;
            if ('href' in entry) {
              return (
                <DropdownMenu.Item key={entry.label} asChild className={menuItem}>
                  {entry.external ? (
                    <a href={entry.href} target="_blank" rel="noopener noreferrer">
                      {entry.label}
                      <ArrowUpRight aria-hidden="true" className="ml-auto h-4 w-4 text-foreground-muted" />
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  ) : (
                    <Link href={entry.href}>{entry.label}</Link>
                  )}
                </DropdownMenu.Item>
              );
            }
            return (
              <DropdownMenu.Item
                key={entry.label}
                disabled={entry.disabled}
                onSelect={entry.onSelect}
                className={`${menuItem} ${entry.danger ? 'text-status-error data-[highlighted]:bg-status-error/10' : ''}`}
              >
                {entry.label}
              </DropdownMenu.Item>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/**
 * A row's moves for its More menu: a step either way, or to either end of
 * the rows shown. The single-pointer and keyboard way to do what the grip
 * does. None for a list of one.
 */
export function moveMenuEntries(index: number, count: number, move: (to: number) => void): WorkMenuEntry[] {
  if (count < 2) return [];
  const first = index === 0;
  const last = index === count - 1;
  return [
    { label: 'Move up', disabled: first, onSelect: () => move(index - 1) },
    { label: 'Move down', disabled: last, onSelect: () => move(index + 1) },
    { label: 'Move to top', disabled: first, onSelect: () => move(0) },
    { label: 'Move to bottom', disabled: last, onSelect: () => move(count - 1) },
  ];
}

/** Empty state in the same hairlines as the rows. */
export function WorkEmpty({ children }: { children: ReactNode }) {
  return (
    <p className="mt-half border-y border-default py-minor text-center font-mono text-sm uppercase tracking-wider text-foreground-muted">
      {children}
    </p>
  );
}
