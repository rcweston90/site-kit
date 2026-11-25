/*
 * save-kit: one save layer for every screen that edits something.
 *
 * - saveRequest: one way to write, failures in plain words (request.ts)
 * - useSaveStatus + SaveStatus / SaveBar: Saving…, Saved, Unsaved changes,
 *   or why it didn't work with Try again
 * - useLeaveGuard: asks before closing the tab, Back or a link
 * - useSaveShortcut: ⌘S
 * - useKeptEdits + KeptEditsNotice: unsaved edits kept on this device
 * - deleteWithUndo + useHiddenKeys + UndoToast: delete now, Undo in a toast,
 *   sent later
 * - SessionEndedDialog: sign in over the page and carry on
 * - useFormSave / useListSave: all of the above for a form or a list, in one call
 */
export {
  saveRequest,
  SaveRequestError,
  explainFailure,
  failureFor,
  setFailureMessages,
  defaultMessages,
  type FailureKind,
  type FailureMessages,
} from './request.js';
export { useSaveStatus, statusLine, type SaveStatus as SaveStatusState, type SaveFailure, type RunOptions, type RunResult } from './status.js';
export { SaveStatus, SaveBar } from './SaveStatus.js';
export { useLeaveGuard, confirmLeave, LEAVE_MESSAGE, GUARDED_LINK_ATTRIBUTE } from './leave-guard.js';
export { useSaveShortcut, isSaveShortcut } from './shortcut.js';
export { useKeptEdits, parseKept, keptOffer, type KeptOffer, type KeptEntry } from './kept-edits.js';
export { KeptEditsNotice } from './KeptEditsNotice.js';
export {
  deleteWithUndo,
  undoDelete,
  commitPendingDelete,
  reportLateFailure,
  useHiddenKeys,
  useUndoToast,
  UNDO_WINDOW_MS,
  type UndoableDelete,
  type UndoToastState,
} from './deletes.js';
export { UndoToast } from './UndoToast.js';
export { recordKey } from './keys.js';
export { useFormSave, useListSave, ALL_SAVED } from './form.js';
export { safeReturnPath } from './return-path.js';
export { markSessionEnded, sessionResumed, sessionPromptDismissed, useSessionEnded, isSessionEnded } from './session.js';
export { SessionEndedDialog } from './SessionEndedDialog.js';
