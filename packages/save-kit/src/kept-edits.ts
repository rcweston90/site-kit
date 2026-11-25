import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

/*
 * Unsaved changes survive a closed tab, a crash, a reload or an ended
 * session, the way a doc editor's do: while a page differs from its last save
 * the edits are kept in this browser (localStorage), and a save clears them.
 * Opening the page again offers them back — Restore or Discard — and never
 * applies them on its own. Edits made before a later save are still offered,
 * marked as such, never dropped unasked. Nothing here reaches the database.
 *
 * `accept` says what a kept value must look like for that page (a story has
 * chapters; a post has a title field), so a stale or foreign entry is never
 * offered.
 */

export interface KeptEntry<T> {
  value: T;
  /** The saved version these edits were made on; another one means a later save. */
  base: string | null;
  at: number;
}

export interface KeptOffer<T> {
  value: T;
  at: Date;
  /** Saved since these edits were kept: restoring replaces that save's text. */
  beforeLatestSave: boolean;
}

/* What was kept when the page opened, read once per visit, so the edits this
   visit goes on to keep don't offer themselves back. A visit is one mount
   (its token): coming back to the page through an in-app link is a new visit
   and reads again. */
const loaded = new Map<string, { visit: object; raw: string | null }>();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

function storage(): Storage | null {
  try { return window.localStorage; } catch { return null; }
}

function keptAtLoad(key: string, visit: object): string | null {
  const read = loaded.get(key);
  if (read?.visit === visit) return read.raw;
  let raw: string | null = null;
  try { raw = storage()?.getItem(key) ?? null; } catch { /* blocked storage: nothing to offer */ }
  loaded.set(key, { visit, raw });
  return raw;
}

function settle(key: string, forget: boolean) {
  const read = loaded.get(key);
  if (read) loaded.set(key, { visit: read.visit, raw: null });
  if (forget) {
    try { storage()?.removeItem(key); } catch { /* nothing kept */ }
  }
  listeners.forEach((listener) => listener());
}

/** A kept entry, if it parses and looks like this page's value. */
export function parseKept<T>(raw: string | null, accept: (value: unknown) => value is T): KeptEntry<T> | null {
  if (!raw) return null;
  try {
    const entry = JSON.parse(raw) as Partial<KeptEntry<unknown>>;
    if (!entry || typeof entry !== 'object' || typeof entry.at !== 'number' || !('value' in entry)) return null;
    const value = entry.value;
    return accept(value) ? { value, base: entry.base ?? null, at: entry.at } : null;
  } catch {
    return null;
  }
}

/** What to offer back: kept edits that differ from what's saved now. */
export function keptOffer<T>(kept: KeptEntry<T> | null, saved: T, base: string | null): KeptOffer<T> | null {
  if (!kept || JSON.stringify(kept.value) === JSON.stringify(saved)) return null;
  return { value: kept.value, at: new Date(kept.at), beforeLatestSave: kept.base !== base };
}

export function useKeptEdits<T>({ storageKey, ready, value, saved, base = null, dirty, accept, recoverOnDevice = true }: {
  /** One per record, e.g. `unsaved:post:my-post`. */
  storageKey: string;
  /** False while the page is still loading: nothing is kept or cleared yet. */
  ready: boolean;
  value: T;
  saved: T;
  /** The saved version's id, when the page has one. */
  base?: string | null;
  /** Whether the value differs from its last save. */
  dirty: boolean;
  recoverOnDevice?: boolean;
  accept: (value: unknown) => value is T;
}) {
  const [visit] = useState(() => ({}));
  const raw = useSyncExternalStore(subscribe, () => keptAtLoad(storageKey, visit), () => null);
  const offer = useMemo(() => recoverOnDevice ? keptOffer(parseKept(raw, accept), saved, base) : null, [accept, base, raw, recoverOnDevice, saved]);
  const latest = useRef<KeptEntry<T> | null>(null);

  // Keep the edits a moment after typing stops; clear them once saved, unless
  // an offer is still waiting for an answer.
  useEffect(() => {
    if (!ready) return;
    if (!recoverOnDevice) {
      latest.current = null;
      try { storage()?.removeItem(storageKey); } catch { /* protected text stays in the tab */ }
      return;
    }
    if (!dirty) {
      latest.current = null;
      if (!offer) {
        try { storage()?.removeItem(storageKey); } catch { /* nothing kept */ }
      }
      return;
    }
    const entry: KeptEntry<T> = { value, base, at: Date.now() };
    latest.current = entry;
    const write = () => {
      try { storage()?.setItem(storageKey, JSON.stringify(entry)); } catch { /* full or blocked: the tab still has them */ }
    };
    const timer = window.setTimeout(write, 600);
    return () => window.clearTimeout(timer);
  }, [base, dirty, offer, ready, recoverOnDevice, storageKey, value]);

  // Closing the tab inside that moment still keeps the last keystrokes.
  useEffect(() => {
    const flush = () => {
      if (!recoverOnDevice || !latest.current) return;
      try { storage()?.setItem(storageKey, JSON.stringify(latest.current)); } catch { /* full or blocked */ }
    };
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, [recoverOnDevice, storageKey]);

  return {
    /** Edits kept from an earlier visit, with when they were made, and
     *  whether the page has been saved since (restoring then replaces that). */
    offer,
    restore: useCallback(() => settle(storageKey, false), [storageKey]),
    discard: useCallback(() => settle(storageKey, true), [storageKey]),
    /** Drop what's kept now: the record was just saved somewhere else or deleted. */
    forget: useCallback(() => {
      latest.current = null;
      settle(storageKey, true);
    }, [storageKey]),
  };
}
