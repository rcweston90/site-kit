import { useHiddenKeys } from './deletes.js';
import { useKeptEdits } from './kept-edits.js';
import { useLeaveGuard } from './leave-guard.js';
import { useSaveShortcut } from './shortcut.js';
import { useSaveStatus } from './status.js';

export const ALL_SAVED = 'All changes saved';

/**
 * The whole save layer for a page with a form, in one call: whether it's
 * dirty, its status line, the leave guard (also while a save is in flight),
 * ⌘S, and edits kept on this device. The page supplies its value, what's
 * stored, and how to save.
 */
export function useFormSave<T>({ storageKey, ready, value, saved, base, accept, onSave, leaveGuardIgnoreWithin, recoverOnDevice }: {
  /** One per record, e.g. `unsaved:post:my-post`. */
  storageKey: string;
  /** False until the stored value has loaded. */
  ready: boolean;
  value: T;
  saved: T;
  base?: string | null;
  /** What a kept value must look like to be offered back. */
  accept: (value: unknown) => value is T;
  /** ⌘S, when there's something to save. */
  onSave: () => void;
  recoverOnDevice?: boolean;
  /** Authoring surface whose links are handled without navigation. */
  leaveGuardIgnoreWithin?: string;
}) {
  const dirty = ready && JSON.stringify(value) !== JSON.stringify(saved);
  const status = useSaveStatus();
  const kept = useKeptEdits({ storageKey, ready, value, saved, base, dirty, accept, recoverOnDevice });
  useLeaveGuard(dirty || status.pending.length > 0, { ignoreWithin: leaveGuardIgnoreWithin });
  useSaveShortcut(() => {
    if (status.pending.length > 0) return;
    if (dirty) onSave();
    else status.note(ALL_SAVED);
  });
  return { dirty, status, kept };
}

/**
 * The save layer for a list that saves each action as it happens (publish,
 * reorder, delete): its status line, the leave guard while a save is in
 * flight, ⌘S answered with "All changes saved", and the keys of rows deleted
 * and waiting for Undo.
 */
export function useListSave() {
  const status = useSaveStatus();
  const hidden = useHiddenKeys();
  useLeaveGuard(status.pending.length > 0);
  useSaveShortcut(() => {
    if (status.pending.length === 0) status.note(ALL_SAVED);
  });
  return { status, hidden };
}
