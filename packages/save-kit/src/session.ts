import { useSyncExternalStore } from 'react';

/*
 * A session can end in the middle of an edit. A write that comes back 401
 * marks it ended here; the app then asks the author to sign in over the page
 * (SessionEndedDialog). The page stays mounted, so nothing typed is lost, and
 * once the author is back the writes that failed for it run again on their own.
 */

let ended = false;
// Keyed, so an action that failed twice while signed out reruns once.
const retries = new Map<unknown, () => void>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

/** The session ended; `retry` runs again once the author signs back in.
 *  A later retry with the same `key` replaces an earlier one. */
export function markSessionEnded(retry?: () => void, key?: string) {
  if (retry) retries.set(key ?? retry, retry);
  if (ended) return;
  ended = true;
  emit();
}

/** The author signed back in: close the prompt and rerun what waited for it. */
export function sessionResumed() {
  const waiting = [...retries.values()];
  retries.clear();
  ended = false;
  emit();
  waiting.forEach((retry) => retry());
}

/** The author chose to sign in later: close the prompt. What failed stays
 *  failed on its page, with its own Try again. */
export function sessionPromptDismissed() {
  retries.clear();
  ended = false;
  emit();
}

export const isSessionEnded = () => ended;

export function subscribeSession(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useSessionEnded() {
  return useSyncExternalStore(subscribeSession, isSessionEnded, () => false);
}
