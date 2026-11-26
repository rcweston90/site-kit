'use client';

import { useMemo, useRef, useState, useSyncExternalStore, type RefObject } from 'react';
import { X } from 'lucide-react';
import { SettingsSheet } from '@rcweston/story-editor';
import type { BlogPostContent, BlogPostDocument } from '@rcweston/site-data/client';
import { findDriftBase } from '../../drift/model.js';
import { diffWords } from '../../drift/compare.js';
import {
  GROUPS,
  LaterOption,
  NO_MEMORY,
  VersionOption,
  describeReviewChoices,
  parseMemory,
  plainCount,
  primaryButton,
  quietText,
  readMemory,
  secondaryButton,
  subscribeMemory,
  writeMemory,
  type ReviewChoice,
  type ReviewMemory,
  type Side,
} from '../../drift/OriginalUpdates.js';
import { applyPostChanges, comparePostChange, diffPost, type PostChange } from './post-drift.js';

/*
 * "The published version has 2 updates your draft doesn't have." The case
 * study editor's review, for posts: a quiet line under the save bar while the
 * published version holds changes the draft was made without (a draft
 * restored from before the last publish, say), and Review compares each
 * change side by side. Nothing shows while the draft's history already
 * includes the published version.
 */

export interface PostUpdatesState {
  changes: PostChange[];
  outstanding: number;
  dismissed: boolean;
  dismiss: () => void;
  reviewOpen: boolean;
  setReviewOpen: (open: boolean) => void;
  reviewRows: PostChange[];
  choices: Readonly<Record<string, ReviewChoice>>;
  choose: (id: string, choice: ReviewChoice) => void;
  finishReview: () => void;
  reviewReturnRef: RefObject<HTMLElement | null>;
  openReview: (returnFocus: HTMLElement | null) => void;
}

const NO_DOCUMENTS: BlogPostDocument[] = [];

/**
 * Compares the form with the published version on every edit, so the count
 * follows along as updates are brought in. The draft's own version is the
 * newest saved one; the form's unsaved edits count as the draft.
 */
export function usePostUpdates({ slug, documents = NO_DOCUMENTS, publishedDocumentId, draft }: {
  slug: string;
  /** All saved versions, newest first. */
  documents?: readonly BlogPostDocument[];
  publishedDocumentId: string | null;
  draft: BlogPostContent;
}): PostUpdatesState {
  const base = useMemo(() => findDriftBase(documents, publishedDocumentId), [documents, publishedDocumentId]);
  const original = useMemo(() => documents.find((document) => document.id === publishedDocumentId)?.content ?? null, [documents, publishedDocumentId]);
  const changes = useMemo(
    () => (base && original ? diffPost({ base: base.content, original, draft }) : []),
    [base, original, draft],
  );
  const key = base ? `site-admin-post-updates:${slug}:${base.id}` : null;
  const raw = useSyncExternalStore(subscribeMemory, () => (key ? readMemory(key) : null), () => null);
  const memory = useMemo(() => (raw ? parseMemory(raw) : NO_MEMORY), [raw]);
  const kept = useMemo(() => new Set(memory.kept), [memory]);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewRows, setReviewRows] = useState<PostChange[]>([]);
  const [choices, setChoices] = useState<Record<string, ReviewChoice>>({});
  const reviewReturnRef = useRef<HTMLElement | null>(null);
  const remember = (next: ReviewMemory) => {
    if (key) writeMemory(key, JSON.stringify(next));
  };

  return {
    changes,
    outstanding: changes.filter((change) => !kept.has(change.id)).length,
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
      remember({ ...memory, kept: [...memory.kept.filter((id) => !rowIds.has(id)), ...keep] });
      const later = reviewRows.some((row) => (choices[row.id] ?? 'later') === 'later');
      if (!later && reviewReturnRef.current?.closest('[data-post-updates-notice]')) {
        reviewReturnRef.current = document.querySelector<HTMLElement>('[data-blog-save-button]');
      }
      setReviewOpen(false);
    },
    reviewReturnRef,
    openReview: (returnFocus) => {
      reviewReturnRef.current = returnFocus;
      setReviewRows(changes);
      setChoices(Object.fromEntries(changes.map((change) => [change.id, kept.has(change.id) ? 'yours' : 'later'])));
      setReviewOpen(true);
    },
  };
}

const plural = (count: number) => `${count} ${count === 1 ? 'update' : 'updates'}`;
const focusRing = 'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-primary';

/** One quiet line under the save bar, as in the case-study editor. */
export function PostUpdatesNotice({ updates }: { updates: PostUpdatesState }) {
  return (
    <div role="status" data-post-updates-notice className="mb-minor flex flex-wrap items-center gap-x-2 font-sans text-sm leading-baseline text-foreground-muted">
      <span>The published version has {plural(updates.outstanding)} your draft doesn’t have.</span>
      <span className="flex items-center gap-x-1">
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

/**
 * Each update with the draft's version and the published one side by side,
 * and "No decision now". Picks apply only on Confirm, as one edit.
 */
export function PostUpdatesReview({ updates, draft, onApply }: {
  updates: PostUpdatesState;
  draft: BlogPostContent;
  /** Puts the post in the form, with a status line for it. */
  onApply: (post: BlogPostContent, notice: string) => void;
}) {
  const live = new Map(updates.changes.map((change) => [change.id, change]));
  const rows = updates.reviewRows;
  const choiceOf = (row: PostChange): ReviewChoice => updates.choices[row.id] ?? 'later';
  const counts: Record<ReviewChoice, number> = { original: 0, yours: 0, later: 0 };
  rows.forEach((row) => { counts[choiceOf(row)] += 1; });
  const safeRows = rows.filter((row) => row.kind === 'safe');
  const allSafeChosen = safeRows.length > 0 && safeRows.every((row) => choiceOf(row) === 'original');

  const confirm = () => {
    const picked = rows.filter((row) => choiceOf(row) === 'original').map((row) => live.get(row.id)).filter((change): change is PostChange => Boolean(change));
    updates.finishReview();
    if (picked.length === 0) return;
    const later = counts.later > 0 ? ` · ${counts.later} left for later` : '';
    onApply(applyPostChanges(draft, picked), `Brought in ${plainCount(picked.length, 'update', 'updates')}${later}`);
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
            <button type="button" className={secondaryButton} aria-pressed={allSafeChosen} onClick={() => safeRows.forEach((row) => updates.choose(row.id, 'original'))}>
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
            <section key={group.kind} aria-labelledby={`post-updates-${group.kind}`} className="mt-minor">
              <h3 id={`post-updates-${group.kind}`} className="mb-0 font-sans text-sm font-semibold leading-baseline text-foreground">
                {group.heading} · {groupRows.length}
              </h3>
              <p className={quietText}>{group.hint}</p>
              <ul className="mt-half">
                {groupRows.map((row) => {
                  const current = live.get(row.id) ?? row;
                  const comparison = comparePostChange(current);
                  const marks = comparison.parts.map((part) => (part.yours.kind === 'text' && part.original.kind === 'text' ? diffWords(part.yours.text, part.original.text) : null));
                  const choice = choiceOf(row);
                  const name = `post-update-${row.id}`;
                  const option = (side: Side, absent: string | null) => (
                    <VersionOption name={name} side={side} checked={choice === side} absent={absent} parts={comparison.parts} marks={marks} onChoose={() => updates.choose(row.id, side)} />
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
