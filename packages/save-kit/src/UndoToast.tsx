'use client';

import { useEffect } from 'react';
import {
  commitPendingDelete,
  dismissUndoToast,
  hasPendingDelete,
  pauseUndo,
  resumeUndo,
  undoDelete,
  useUndoToast,
} from './deletes.js';

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

/**
 * "Post deleted · Undo": the one place every delete can be taken back.
 * Render it once in the app shell, so it outlives the page that deleted.
 * ⌘Z undoes too, unless you're typing (then it undoes the typing).
 */
export function UndoToast({ undoLabel = 'Undo', dismissLabel = 'Dismiss' }: { undoLabel?: string; dismissLabel?: string } = {}) {
  const toast = useUndoToast();

  useEffect(() => {
    // Leaving the site or closing the tab sends what's waiting.
    const flush = () => commitPendingDelete(true);
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey || event.key.toLowerCase() !== 'z') return;
      if (!hasPendingDelete() || isTyping(event.target)) return;
      event.preventDefault();
      undoDelete();
    };
    // A hidden tab holds the clock, so the toast is still there on return.
    const onVisibility = () => (document.hidden ? pauseUndo() : resumeUndo());
    window.addEventListener('pagehide', flush);
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('visibilitychange', onVisibility);
      commitPendingDelete();
    };
  }, []);

  return (
    // Above a page's pinned save bar when it has one (SaveBar sets the height).
    <div className="sk-toast-region">
      <div role="status" aria-live="polite" className="sk-toast-live">
        {toast && (
          // Hover and focus only pause the clock; the buttons are the controls.
          <div
            onMouseEnter={pauseUndo}
            onMouseLeave={resumeUndo}
            onFocus={pauseUndo}
            onBlur={resumeUndo}
            className="sk-toast"
          >
            <span className="sk-toast-text">{toast.kind === 'pending' ? toast.label : toast.message}</span>
            {toast.kind === 'pending' ? (
              <button type="button" onClick={undoDelete} aria-keyshortcuts="Meta+Z Control+Z" className="sk-toast-button">
                {undoLabel}
              </button>
            ) : (
              <button type="button" onClick={dismissUndoToast} className="sk-toast-button">
                {dismissLabel}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
