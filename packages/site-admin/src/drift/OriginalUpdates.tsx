'use client';

import { useId, useMemo, useRef, useState, useSyncExternalStore, type RefObject } from 'react';
import { X } from 'lucide-react';
import type { StoryDocument, Story } from '@rcweston/story-core';
import {
  applyOriginalChanges,
  diffOriginal,
  findDriftBase,
  type OriginalChange,
} from './model.js';
import {
  compareOriginalChange,
  diffWords,
  type ComparePart,
  type CompareValue,
  type DiffSpan,
} from './compare.js';
import { StoryMedia } from '@rcweston/story-react';
import { SettingsSheet } from '@rcweston/story-editor';

/*
 * "The published version has 2 updates your draft doesn't have." The story
 * files in code keep changing after the editor's drafts were made from them;
 * publishing an older draft used to drop those changes without a word. This
 * is the notice, its review dialog, and the state both share.
 */

/* Dismissing the notice and keeping your own version of a conflict last for
   this tab's session. sessionStorage can be missing or throw (private
   windows, blocked site data), so a module-level copy keeps both working for
   the life of the page either way. */
const memoryFallback = new Map<string, string>();
const memoryListeners = new Set<() => void>();

function subscribeMemory(listener: () => void) {
  memoryListeners.add(listener);
  return () => {
    memoryListeners.delete(listener);
  };
}

function readMemory(key: string): string | null {
  try {
    const stored = window.sessionStorage.getItem(key);
    if (stored !== null) return stored;
  } catch {
    // Storage is blocked here; the in-page copy below still answers.
  }
  return memoryFallback.get(key) ?? null;
}

function writeMemory(key: string, value: string) {
  memoryFallback.set(key, value);
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // The in-page copy holds it until the page goes away.
  }
  memoryListeners.forEach((listener) => listener());
}

interface ReviewMemory {
  dismissed: boolean;
  /** Updates the author decided against: their own version stays. */
  kept: string[];
}

const NO_MEMORY: ReviewMemory = { dismissed: false, kept: [] };

function parseMemory(raw: string | null): ReviewMemory {
  if (!raw) return NO_MEMORY;
  try {
    const value = JSON.parse(raw) as Partial<ReviewMemory> | null;
    return {
      dismissed: value?.dismissed === true,
      kept: Array.isArray(value?.kept) ? value.kept.filter((id): id is string => typeof id === 'string') : [],
    };
  } catch {
    return NO_MEMORY;
  }
}

/** A pick in Review: the original's version, your own, or no decision yet. */
export type ReviewChoice = 'original' | 'yours' | 'later';

export interface OriginalUpdatesState {
  /** Everything the original changed that the draft doesn't have. */
  changes: OriginalChange[];
  /** Still waiting on the author: every update not yet decided. Bringing one
   *  in removes it; keeping your own version stops it counting. */
  outstanding: number;
  kept: ReadonlySet<string>;
  dismissed: boolean;
  dismiss: () => void;
  reviewOpen: boolean;
  /** Closing without Confirm discards the picks: nothing was applied. */
  setReviewOpen: (open: boolean) => void;
  /** The list as it was when the dialog opened. */
  reviewRows: OriginalChange[];
  /** The picks so far, by change id. Nothing applies until Confirm. */
  choices: Readonly<Record<string, ReviewChoice>>;
  choose: (id: string, choice: ReviewChoice) => void;
  /** Records the picks (kept or not) and closes the dialog; the caller
   *  applies the originals. */
  finishReview: () => void;
  reviewReturnRef: RefObject<HTMLElement | null>;
  openReview: (returnFocus: HTMLElement | null) => void;
}

/**
 * Compares the draft with the original on every edit, so the count follows
 * along as updates are brought in or undone. Nothing to compare — no import
 * base (a story started in the editor, or renamed) or no authored file —
 * means no changes, and so no notice anywhere.
 */
export function useOriginalUpdates({
  slug,
  documents,
  publishedDocumentId,
  draft,
}: {
  slug: string;
  /** All saved versions, newest first. */
  documents: readonly StoryDocument[];
  /** The version readers see now: the "original" the draft is measured against. */
  publishedDocumentId: string | null;
  draft: Story;
}): OriginalUpdatesState {
  const base = useMemo(() => findDriftBase(documents, publishedDocumentId), [documents, publishedDocumentId]);
  const original = useMemo(() => documents.find((document) => document.id === publishedDocumentId)?.content ?? null, [documents, publishedDocumentId]);
  const changes = useMemo(
    () => (base && original ? diffOriginal({ base: base.content, original, draft }) : []),
    [base, original, draft],
  );
  // Per base too: a fresh import is a new set of updates to look at.
  const key = base ? `site-admin-published-updates:${slug}:${base.id}` : null;
  const raw = useSyncExternalStore(subscribeMemory, () => (key ? readMemory(key) : null), () => null);
  const memory = useMemo(() => parseMemory(raw), [raw]);
  const kept = useMemo(() => new Set(memory.kept), [memory]);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewRows, setReviewRows] = useState<OriginalChange[]>([]);
  const [choices, setChoices] = useState<Record<string, ReviewChoice>>({});
  const reviewReturnRef = useRef<HTMLElement | null>(null);

  const remember = (next: ReviewMemory) => {
    if (key) writeMemory(key, JSON.stringify(next));
  };

  return {
    changes,
    outstanding: changes.filter((change) => !kept.has(change.id)).length,
    kept,
    dismissed: memory.dismissed,
    dismiss: () => remember({ ...memory, dismissed: true }),
    reviewOpen,
    setReviewOpen,
    reviewRows,
    choices,
    choose: (id, choice) => setChoices((current) => ({ ...current, [id]: choice })),
    finishReview: () => {
      const rowIds = new Set(reviewRows.map((row) => row.id));
      const keep = reviewRows.filter((row) => choices[row.id] === 'yours').map((row) => row.id);
      // Kept stays kept; anything else on the list (brought in, or left for
      // later) is no longer a decision against the original.
      remember({ ...memory, kept: [...memory.kept.filter((id) => !rowIds.has(id)), ...keep] });
      // Opened from the notice and nothing left for later, the notice goes as
      // the dialog closes; focus goes on to Publish, the next step.
      const later = reviewRows.some((row) => (choices[row.id] ?? 'later') === 'later');
      if (!later && reviewReturnRef.current?.closest('[data-original-updates-notice]')) {
        reviewReturnRef.current = document.querySelector<HTMLElement>('[data-editor-publish-trigger]');
      }
      setReviewOpen(false);
    },
    reviewReturnRef,
    openReview: (returnFocus) => {
      reviewReturnRef.current = returnFocus;
      setReviewRows(changes);
      // An earlier "keep mine" shows as that pick; everything else starts
      // undecided, so Confirm only ever applies what was chosen.
      setChoices(Object.fromEntries(changes.map((change) => [change.id, kept.has(change.id) ? 'yours' : 'later'])));
      setReviewOpen(true);
    },
  };
}

const plural = (count: number) => `${count} ${count === 1 ? 'update' : 'updates'}`;
const focusRing = 'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-primary';

/** One quiet line under the top bar; no box, so it reads as a remark about
 *  the document rather than an alarm. */
export function OriginalUpdatesNotice({ updates }: { updates: OriginalUpdatesState }) {
  return (
    <div role="status" data-original-updates-notice className="flex flex-wrap items-center gap-x-2 font-sans text-sm leading-baseline text-foreground-muted">
      <span>The published version has {plural(updates.outstanding)} your draft doesn’t have.</span>
      <span className="flex items-center gap-x-1">
        {/* No side padding, so on a phone, where this wraps under the
            sentence, "Review" lines up with it; the word is wider than 44px
            and the row 48px tall, so the target stays full size. */}
        <button
          type="button"
          className="inline-flex min-h-minor-2 items-center rounded-sm font-medium text-foreground underline decoration-default underline-offset-4 transition-colors hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary motion-reduce:transition-none"
          aria-haspopup="dialog"
          onClick={(event) => updates.openReview(event.currentTarget)}
        >
          Review
        </button>
        <button
          type="button"
          className={`grid h-minor-2 w-11 place-items-center rounded-md text-foreground-muted transition-colors hover:bg-foreground/5 hover:text-foreground motion-reduce:transition-none ${focusRing}`}
          aria-label="Dismiss for this session"
          title="Dismiss for this session"
          onClick={updates.dismiss}
        >
          <X aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
        </button>
      </span>
    </div>
  );
}

type Side = 'yours' | 'original';

const SIDE_NAMES: Record<Side, string> = { yours: 'Yours', original: 'Published' };
const bodyText = 'mb-0 whitespace-pre-line break-words font-sans text-sm leading-baseline text-foreground';
const quietText = 'mb-0 font-sans text-sm leading-baseline text-foreground-muted';

/** One version's text with the words the other version lacks marked like a
 *  highlighter: a tint, and a heavier weight so the mark doesn't rest on
 *  colour alone (and never reads as a link). */
function MarkedText({ spans }: { spans: DiffSpan[] }) {
  return (
    <p className={bodyText}>
      {spans.map((span, index) => (span.changed
        ? <mark key={index} className="box-decoration-clone rounded-sm bg-status-warning/20 px-0.5 font-semibold text-foreground">{span.text}</mark>
        : <span key={index}>{span.text}</span>))}
    </p>
  );
}

function CompareValueView({ value, other, spans }: { value: CompareValue; other: CompareValue; spans: DiffSpan[] | null }) {
  if (value.kind === 'none') return <p className={quietText}>{other.kind === 'media' ? 'No media' : 'Not set'}</p>;
  if (value.kind === 'media') {
    // A thumbnail, so a row stays a glance; the still enlarges on click.
    return (
      <div className="max-w-[18rem]">
        <StoryMedia media={value.media} hideCaption frame="inset" sizes="18rem" fallback={<p className={quietText}>No footage yet</p>} />
      </div>
    );
  }
  return spans ? <MarkedText spans={spans} /> : <p className={bodyText}>{value.text}</p>;
}

/** Media is its own label; text gets one when there's more than one part. */
function showsLabel(parts: ComparePart[], part: ComparePart) {
  if (!part.label || parts.length === 1) return false;
  const isMediaPart = (item: ComparePart) => item.yours.kind === 'media' || item.original.kind === 'media';
  return !isMediaPart(part) || parts.filter(isMediaPart).length > 1;
}

/**
 * One version as a radio card: picking it puts that version in the draft, so
 * the checked card is always what the draft holds. The radio is the control
 * for keyboards and screen readers; a click anywhere else on the card is a
 * pointer shortcut to it.
 */
function VersionOption({
  name,
  side,
  checked,
  absent,
  parts,
  marks,
  onChoose,
}: {
  /** Shared by the two cards of one change. */
  name: string;
  side: Side;
  checked: boolean;
  /** Set when the thing doesn't exist on this side. */
  absent: string | null;
  parts: ComparePart[];
  marks: (ReturnType<typeof diffWords> | null)[];
  onChoose: () => void;
}) {
  const nameId = useId();
  const other: Side = side === 'yours' ? 'original' : 'yours';
  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- pointer shortcut only; the radio inside is the keyboard and screen-reader control
    <div
      className={`flex min-w-0 cursor-pointer flex-col rounded-md border px-4 pb-half transition-colors motion-reduce:transition-none ${checked ? 'border-foreground bg-foreground/[0.03]' : 'border-default hover:border-foreground/40'}`}
      onClick={(event) => {
        // The media's own controls (enlarge, pause) and the radio keep their clicks.
        if (!checked && !(event.target as Element).closest('label, button, a, input, video, iframe')) onChoose();
      }}
    >
      <label className="flex min-h-minor-2 cursor-pointer items-center gap-3">
        {/* Drawn rather than native: some platforms paint an unchecked native
            radio as a solid dot, which reads as chosen. */}
        <input type="radio" name={name} checked={checked} onChange={onChoose} aria-labelledby={nameId} className="peer sr-only" />
        <span
          aria-hidden="true"
          className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent-primary motion-reduce:transition-none ${checked ? 'border-foreground' : 'border-foreground-muted'}`}
        >
          {checked && <span className="h-2 w-2 rounded-full bg-foreground" />}
        </span>
        <span id={nameId} className="font-sans text-sm font-medium leading-baseline text-foreground">{SIDE_NAMES[side]}</span>
      </label>
      {absent ? (
        <p className={quietText}>{absent}</p>
      ) : (
        parts.map((part, index) => (
          <div key={`${part.label}-${index}`} className={`min-w-0 ${index > 0 ? 'mt-half' : ''}`}>
            {showsLabel(parts, part) && <p className="mb-0 font-sans text-xs leading-baseline text-foreground-muted">{part.label}</p>}
            <CompareValueView value={part[side]} other={part[other]} spans={marks[index]?.[side] ?? null} />
          </div>
        ))
      )}
    </div>
  );
}

const GROUPS = [
  {
    kind: 'conflict',
    heading: 'You changed these too',
    hint: 'Pick the version to keep, or decide later.',
  },
  {
    kind: 'safe',
    heading: 'Safe to bring in',
    hint: 'You haven’t touched these, so the published version can replace them as they are.',
  },
] as const;

/** The third choice for each change: leave it on the list for later. */
function LaterOption({ name, checked, onChoose }: { name: string; checked: boolean; onChoose: () => void }) {
  return (
    <label className="flex min-h-11 w-fit cursor-pointer items-center gap-3 sm:col-span-2">
      <input type="radio" name={name} checked={checked} onChange={onChoose} className="peer sr-only" />
      <span
        aria-hidden="true"
        className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent-primary motion-reduce:transition-none ${checked ? 'border-foreground' : 'border-foreground-muted'}`}
      >
        {checked && <span className="h-2 w-2 rounded-full bg-foreground" />}
      </span>
      <span className="font-sans text-sm leading-baseline text-foreground">No decision now</span>
      <span className="font-sans text-sm leading-baseline text-foreground-muted">stays on the list</span>
    </label>
  );
}

const plainCount = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** "2 to bring in · 1 to keep · 3 for later", leaving out the empty parts. */
export function describeReviewChoices(counts: Record<ReviewChoice, number>): string {
  const parts = [
    counts.original > 0 ? `${counts.original} to bring in` : null,
    counts.yours > 0 ? `${counts.yours} to keep yours` : null,
    counts.later > 0 ? `${counts.later} for later` : null,
  ].filter(Boolean);
  return parts.join(' · ') || 'Nothing to decide';
}

const secondaryButton = 'inline-flex min-h-11 items-center justify-center rounded-md border border-default px-4 font-sans text-sm font-medium leading-baseline text-foreground transition-colors hover:bg-foreground/5 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary';
const primaryButton = 'inline-flex min-h-11 items-center justify-center rounded-md bg-foreground px-4 font-sans text-sm font-semibold leading-baseline text-background transition-opacity hover:opacity-90 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary';

/**
 * Each update, where it is and what it is, with the draft's version and the
 * original's side by side as radio cards (the words that differ marked), and
 * a third choice: no decision now. Picks are staged — nothing changes until
 * Confirm, and closing the dialog any other way discards them. Confirm brings
 * in the originals as one undoable edit, remembers the ones kept, and leaves
 * the undecided counted in the notice for later.
 */
export function OriginalUpdatesReview({
  updates,
  draft,
  onApply,
}: {
  updates: OriginalUpdatesState;
  draft: Story;
  /** Applies the story as one undoable edit, with a status line for it. */
  onApply: (story: Story, notice: string) => void;
}) {
  const live = new Map(updates.changes.map((change) => [change.id, change]));
  const rows = updates.reviewRows;
  const choiceOf = (row: OriginalChange): ReviewChoice => updates.choices[row.id] ?? 'later';
  const counts: Record<ReviewChoice, number> = { original: 0, yours: 0, later: 0 };
  rows.forEach((row) => { counts[choiceOf(row)] += 1; });
  const safeRows = rows.filter((row) => row.kind === 'safe');
  const allSafeChosen = safeRows.length > 0 && safeRows.every((row) => choiceOf(row) === 'original');

  const confirm = () => {
    // Only what is still waiting in the draft: an update undone or brought in
    // some other way since the dialog opened has nothing left to apply.
    const picked = rows.filter((row) => choiceOf(row) === 'original').map((row) => live.get(row.id)).filter((change): change is OriginalChange => Boolean(change));
    updates.finishReview();
    if (picked.length === 0) return;
    const later = counts.later > 0 ? ` · ${counts.later} left for later` : '';
    onApply(applyOriginalChanges(draft, picked), `Brought in ${plainCount(picked.length, 'update', 'updates')}${later} — ⌘Z to undo`);
  };

  return (
    <SettingsSheet
      open={updates.reviewOpen}
      onOpenChange={updates.setReviewOpen}
      title="Updates from the published version"
      placement="center"
      wide
      returnFocusRef={updates.reviewReturnRef}
      footer={rows.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-half">
          {safeRows.length > 0 ? (
            <button
              type="button"
              className={secondaryButton}
              aria-pressed={allSafeChosen}
              onClick={() => safeRows.forEach((row) => updates.choose(row.id, 'original'))}
            >
              Bring in all safe updates
            </button>
          ) : <span />}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-half">
            <p className="mb-0 font-sans text-sm leading-baseline text-foreground-muted" aria-live="polite">{describeReviewChoices(counts)}</p>
            <button type="button" className={secondaryButton} onClick={() => updates.setReviewOpen(false)}>Cancel</button>
            <button type="button" className={primaryButton} onClick={confirm}>Confirm</button>
          </div>
        </div>
      )}
    >
      <p className={quietText}>
        The published version changed after your draft was made from an earlier one. For each change, keep yours, take the published one, or leave it for later. Nothing changes until you confirm.
      </p>
      {rows.length === 0 ? (
        <p className="mb-0 mt-minor font-sans text-sm leading-baseline text-foreground">Your draft has everything from the published version.</p>
      ) : (
        GROUPS.map((group) => {
          const groupRows = rows.filter((row) => row.kind === group.kind);
          if (groupRows.length === 0) return null;
          return (
            <section key={group.kind} aria-labelledby={`original-updates-${group.kind}`} className="mt-minor">
              <h3 id={`original-updates-${group.kind}`} className="mb-0 font-sans text-sm font-semibold leading-baseline text-foreground">
                {group.heading} · {groupRows.length}
              </h3>
              <p className={quietText}>{group.hint}</p>
              <ul className="mt-half">
                {groupRows.map((row) => {
                  const current = live.get(row.id) ?? row;
                  const comparison = compareOriginalChange(current);
                  const marks = comparison.parts.map((part) => (part.yours.kind === 'text' && part.original.kind === 'text' ? diffWords(part.yours.text, part.original.text) : null));
                  const choice = choiceOf(row);
                  const name = `original-update-${row.id}`;
                  const option = (side: Side, absent: string | null) => (
                    <VersionOption
                      name={name}
                      side={side}
                      checked={choice === side}
                      absent={absent}
                      parts={comparison.parts}
                      marks={marks}
                      onChoose={() => updates.choose(row.id, side)}
                    />
                  );
                  return (
                    <li key={row.id} className="border-t border-default py-minor">
                      <fieldset className="m-0 min-w-0 border-0 p-0">
                        <legend className="p-0 font-sans text-sm font-medium leading-baseline text-foreground">{current.where}</legend>
                        <p className="mb-0 font-sans text-xs leading-baseline text-foreground-muted">{current.what}</p>
                        <div className="mt-half grid gap-x-4 gap-y-half sm:grid-cols-2">
                          {option('yours', comparison.absent.yours ? (row.kind === 'conflict' ? 'You removed this' : 'Not in your draft yet') : null)}
                          {option('original', comparison.absent.original ? 'Removed in the published version' : null)}
                          <LaterOption name={name} checked={choice === 'later'} onChoose={() => updates.choose(row.id, 'later')} />
                        </div>
                      </fieldset>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })
      )}
    </SettingsSheet>
  );
}
