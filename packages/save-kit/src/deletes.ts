import { useSyncExternalStore } from 'react';
import { SaveRequestError, explainFailure } from './request.js';
import { markSessionEnded } from './session.js';

/*
 * Every delete works one way: the thing disappears at once, a toast
 * offers Undo, and the delete itself — the record and any stored file — is
 * only sent once the toast goes. Undo just doesn't send it, so nothing has to
 * be rebuilt on the server. If the page is closed or left in the meantime the
 * delete goes out then; if it fails, the thing comes back and the toast says
 * why.
 *
 * The store lives outside any page so the toast (rendered once, by the app shell)
 * survives the navigation an editor's Delete makes back to its list, and that
 * list keeps the row hidden through useHiddenKeys().
 */

export const UNDO_WINDOW_MS = 8000;

export interface UndoableDelete {
  /** Rows with this key are hidden in every list that asks, e.g. `post:12`. */
  key: string;
  /** What the toast says: "Post deleted". */
  label: string;
  /** Sends the delete; `keepalive` when the page is closing around it. */
  send: (options: { keepalive: boolean }) => Promise<unknown>;
  /** Put the page back, for deletes that aren't a row in a list. */
  onUndo?: () => void;
  /** After the site removed it, with what the site sent back. */
  onDone?: (result: unknown) => void;
}

export type UndoToastState =
  | { kind: 'pending'; label: string }
  | { kind: 'failed'; message: string }
  | null;

interface Pending {
  request: UndoableDelete;
  timer: ReturnType<typeof setTimeout> | null;
  remaining: number;
  startedAt: number;
}

const EMPTY: ReadonlySet<string> = new Set();
let current: Pending | null = null;
let toast: UndoToastState = null;
let hidden: ReadonlySet<string> = EMPTY;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

function hide(key: string) {
  hidden = new Set([...hidden, key]);
}

function unhide(key: string) {
  const next = new Set(hidden);
  next.delete(key);
  hidden = next;
}

function start(pending: Pending) {
  pending.startedAt = Date.now();
  pending.timer = setTimeout(() => commitPendingDelete(), pending.remaining);
}

async function send(request: UndoableDelete, keepalive: boolean) {
  try {
    const result = await request.send({ keepalive });
    request.onDone?.(result);
  } catch (reason) {
    // Already gone counts as done.
    if (reason instanceof SaveRequestError && reason.status === 404) {
      request.onDone?.(null);
      return;
    }
    if (reason instanceof SaveRequestError && reason.kind === 'session') markSessionEnded();
    unhide(request.key);
    request.onUndo?.();
    toast = { kind: 'failed', message: `${explainFailure(reason, 'deleted')} It’s back where it was.` };
    emit();
  }
}

/** Hide it now, offer Undo, send the delete when the toast goes. */
export function deleteWithUndo(request: UndoableDelete) {
  // One toast at a time: the previous delete goes through now.
  commitPendingDelete();
  hide(request.key);
  current = { request, timer: null, remaining: UNDO_WINDOW_MS, startedAt: 0 };
  start(current);
  toast = { kind: 'pending', label: request.label };
  emit();
}

/** Undo: nothing is sent, and the thing is back. */
export function undoDelete() {
  const pending = current;
  if (!pending) return false;
  if (pending.timer) clearTimeout(pending.timer);
  current = null;
  toast = null;
  unhide(pending.request.key);
  emit();
  pending.request.onUndo?.();
  return true;
}

/** Send the waiting delete now (the toast ran out, another delete, or the
 *  page is going away). */
export function commitPendingDelete(keepalive = false) {
  const pending = current;
  if (!pending) return;
  if (pending.timer) clearTimeout(pending.timer);
  current = null;
  if (toast?.kind === 'pending') toast = null;
  emit();
  void send(pending.request, keepalive);
}

/** The pointer or focus is on the toast: the clock stops (WCAG 2.2.1). */
export function pauseUndo() {
  if (!current?.timer) return;
  clearTimeout(current.timer);
  current.timer = null;
  current.remaining = Math.max(1000, current.remaining - (Date.now() - current.startedAt));
}

export function resumeUndo() {
  if (current && !current.timer) start(current);
}

/** A save the page sent as it closed failed: say so in the toast, which
 *  outlives the page, on whichever page the author is on now. */
export function reportLateFailure(message: string) {
  toast = { kind: 'failed', message };
  emit();
}

export function dismissUndoToast() {
  if (toast?.kind !== 'failed') return;
  toast = null;
  emit();
}

export function hasPendingDelete() {
  return current !== null;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Keys of things deleted (or about to be) on this visit; lists leave them out. */
export function useHiddenKeys() {
  return useSyncExternalStore(subscribe, () => hidden, () => EMPTY);
}

export function useUndoToast() {
  return useSyncExternalStore(subscribe, () => toast, () => null);
}

export const hiddenKeys = () => hidden;
export const undoToastState = () => toast;

/** For tests: start from nothing. */
export function resetDeletesForTest() {
  if (current?.timer) clearTimeout(current.timer);
  current = null;
  toast = null;
  hidden = EMPTY;
  emit();
}
