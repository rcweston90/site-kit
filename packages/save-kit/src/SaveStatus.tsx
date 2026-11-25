'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { statusLine, type SaveStatus as SaveStatusState } from './status.js';

const join = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(' ');

/**
 * The page's save status in one line: what's happening, or why it didn't
 * work and a way to try again. Always mounted, so screen readers hear each
 * change; empty when there's nothing to say.
 */
export function SaveStatus({ status, dirty = false, idle, className }: {
  status: SaveStatusState;
  /** Whether the page differs from what's stored. */
  dirty?: boolean;
  /** Said when nothing has happened yet, e.g. "Not saved yet". */
  idle?: string;
  className?: string;
}) {
  const line = statusLine({ ...status, dirty, idle });
  return (
    <div className={join('sk-status', className)}>
      <p role="status" aria-live="polite" className="sk-status-line" data-tone={line.tone}>
        {line.text}
      </p>
      {status.failure?.retry && (
        <button type="button" onClick={status.failure.retry} className="sk-link-button">
          Try again
        </button>
      )}
    </div>
  );
}

/**
 * The bottom bar for pages with a form: pinned, so Save and its status are in
 * reach from anywhere in a long page. It publishes its height as
 * --save-kit-bar-height so the Undo toast floats just above it.
 */
export function SaveBar({ status, dirty, idle, children, trailing, className }: {
  status: SaveStatusState;
  dirty: boolean;
  idle?: string;
  /** The page's save actions; the status follows them. */
  children: ReactNode;
  /** Set apart at the far end, e.g. Delete. */
  trailing?: ReactNode;
  className?: string;
}) {
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = bar.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const root = document.documentElement;
    const observer = new ResizeObserver(() => root.style.setProperty('--save-kit-bar-height', `${element.offsetHeight}px`));
    observer.observe(element);
    return () => {
      observer.disconnect();
      root.style.removeProperty('--save-kit-bar-height');
    };
  }, []);
  return (
    <div ref={bar} className={join('sk-save-bar', className)}>
      <div className="sk-save-bar-inner">
        {children}
        <SaveStatus status={status} dirty={dirty} idle={idle} />
        {trailing && <div className="sk-save-bar-trailing">{trailing}</div>}
      </div>
    </div>
  );
}
