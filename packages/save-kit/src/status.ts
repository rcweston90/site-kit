import { useCallback, useId, useRef, useState } from 'react';
import { SaveRequestError, explainFailure } from './request.js';
import { markSessionEnded } from './session.js';

/*
 * One save status per page: Saving… while anything is in flight, then
 * Saved, Unsaved changes while the page differs from what's stored, and,
 * above everything, a failure in plain words with a way to try again. A failure stays up until that same
 * action succeeds, so a later save of something else can't hide it.
 */

export interface SaveFailure {
  message: string;
  retry: (() => void) | null;
}

export interface RunOptions<T = unknown> {
  /** Groups an action with its retries; a success clears its own failure. */
  key?: string;
  /** Shown while it runs. */
  doing?: string;
  /** Shown once it went through. */
  success?: string;
  /** What didn't happen if it fails: "saved", "deleted", "published"… */
  done?: string;
  /** Put what the site sent back on the page. It runs on whichever attempt
   *  goes through — Try again, or the rerun after signing back in — so a
   *  page's own after-save step belongs here, not after the await. */
  onSaved?: (value: T) => void;
}

export type RunResult<T> = { ok: true; value: T } | { ok: false };

export interface SaveStatus {
  /** Labels of the actions still in flight, newest last. */
  pending: string[];
  failure: SaveFailure | null;
  success: string | null;
  run: <T>(action: () => Promise<T>, options?: RunOptions<T>) => Promise<RunResult<T>>;
  /** Show a reason the page found itself, such as a required field. */
  fail: (message: string, key?: string) => void;
  clear: (key?: string) => void;
  /** A one-off line, e.g. "Everything is saved" after ⌘S with nothing to do. */
  note: (message: string) => void;
}

/** The status line's words and tone, from the page's state. */
export function statusLine({ pending, failure, success, dirty, idle = '' }: {
  pending: readonly string[];
  failure: SaveFailure | null;
  success: string | null;
  dirty: boolean;
  idle?: string;
}): { text: string; tone: 'error' | 'muted' } {
  if (failure) return { text: failure.message, tone: 'error' };
  if (pending.length > 0) return { text: pending.at(-1) ?? 'Saving…', tone: 'muted' };
  if (dirty) return { text: 'Unsaved changes', tone: 'muted' };
  return { text: success ?? idle, tone: 'muted' };
}

export function useSaveStatus(): SaveStatus {
  const [pending, setPending] = useState<{ id: number; label: string }[]>([]);
  const [failures, setFailures] = useState<[string, SaveFailure][]>([]);
  const [success, setSuccess] = useState<string | null>(null);
  const ids = useRef(0);
  const scope = useId();

  const setFailure = useCallback((key: string, failure: SaveFailure | null) => {
    setFailures((current) => {
      const others = current.filter(([existing]) => existing !== key);
      return failure ? [...others, [key, failure]] : others;
    });
  }, []);

  const run = useCallback(<T,>(action: () => Promise<T>, options: RunOptions<T> = {}): Promise<RunResult<T>> => {
    const { key = 'save', doing = 'Saving…', success: succeeded = 'Saved', done = 'saved', onSaved } = options;
    const attempt = async (): Promise<RunResult<T>> => {
      const id = ++ids.current;
      setPending((current) => [...current, { id, label: doing }]);
      try {
        const value = await action();
        setFailure(key, null);
        setSuccess(succeeded);
        onSaved?.(value);
        return { ok: true, value };
      } catch (reason) {
        const retry = () => { void attempt(); };
        // Signing back in reruns it; until then the line says why it waits.
        if (reason instanceof SaveRequestError && reason.kind === 'session') markSessionEnded(retry, `${scope}:${key}`);
        setFailure(key, { message: explainFailure(reason, done), retry });
        return { ok: false };
      } finally {
        setPending((current) => current.filter((entry) => entry.id !== id));
      }
    };
    return attempt();
  }, [scope, setFailure]);

  const fail = useCallback((message: string, key = 'save') => setFailure(key, { message, retry: null }), [setFailure]);
  const clear = useCallback((key?: string) => {
    if (key === undefined) setFailures([]);
    else setFailure(key, null);
  }, [setFailure]);
  const note = useCallback((message: string) => setSuccess(message), []);

  return {
    pending: pending.map((entry) => entry.label),
    failure: failures.at(-1)?.[1] ?? null,
    success,
    run,
    fail,
    clear,
    note,
  };
}
