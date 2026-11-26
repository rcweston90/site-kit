import { useEffect, useRef } from 'react';

/** How long after the last change an editor waits before saving on its own. */
export const DRAFT_AUTOSAVE_DELAY_MS = 1000;

/**
 * Saves a private draft a second after the last change. `revision` is any
 * value that changes when the draft does (the serialized form works); each
 * change restarts the wait. `flush` saves now, for leaving the editor.
 * Nothing runs while `eligible` is false: no title yet, a save under way, a
 * failure to look at, kept edits to offer, or text still being composed.
 */
export function useDraftAutosave({ eligible, revision, save, flush = false }: {
  eligible: boolean;
  revision: unknown;
  save: () => void;
  flush?: boolean;
}) {
  // The newest save, without restarting the wait each render. (A ref rather
  // than useEffectEvent keeps React 18 working.)
  const saveLatest = useRef(save);
  useEffect(() => { saveLatest.current = save; });
  useEffect(() => {
    if (!eligible) return;
    const timer = window.setTimeout(() => saveLatest.current(), flush ? 0 : DRAFT_AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [eligible, revision, flush]);
}
