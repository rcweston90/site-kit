'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { sessionPromptDismissed, sessionResumed, useSessionEnded } from './session.js';

/**
 * Shown over the page when a save finds the session ended. Signing in here
 * keeps the author on the same page with everything they typed, and reruns
 * what didn't go through. "Later" closes it; the page then says what's unsaved.
 *
 * Bring your own sign-in form: `renderSignIn` gets `onSignedIn`, which you
 * call once your auth succeeds.
 */
export function SessionEndedDialog({
  renderSignIn,
  title = 'Your session ended',
  description = 'Sign in again to keep working. Everything on this page is still here, and what didn’t save will save once you’re back.',
  laterLabel = 'Later',
  className,
}: {
  renderSignIn: (props: { onSignedIn: () => void }) => ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  laterLabel?: string;
  className?: string;
}) {
  const ended = useSessionEnded();
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || typeof dialog.showModal !== 'function') return;
    if (ended && !dialog.open) dialog.showModal();
    if (!ended && dialog.open) dialog.close();
  }, [ended]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="sk-session-ended-title"
      aria-describedby="sk-session-ended-description"
      onCancel={() => sessionPromptDismissed()}
      className={['sk-dialog', className].filter(Boolean).join(' ')}
    >
      {ended && (
        <div className="sk-dialog-body">
          <h2 id="sk-session-ended-title" className="sk-dialog-title">{title}</h2>
          <p id="sk-session-ended-description" className="sk-dialog-description">{description}</p>
          <div className="sk-dialog-sign-in">{renderSignIn({ onSignedIn: sessionResumed })}</div>
          <div className="sk-dialog-actions">
            <button type="button" onClick={sessionPromptDismissed} className="sk-link-button">
              {laterLabel}
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}
