import { useEffect, useRef } from 'react';

/*
 * Ask before leaving a page with unsaved changes: closing or reloading the
 * tab, Back, and any link on the page, the app's own navigation included.
 *
 * Back can't be cancelled after the fact, so while anything is unsaved the
 * guard pushes a copy of the current entry: Back lands on that copy (same
 * URL, nothing changes), the prompt asks, and either we go back for real or
 * forward again. Once everything is saved the copy is taken back out, so
 * history doesn't fill with duplicates.
 *
 * A page can have several parts that save on their own (a header image and
 * the copy under it). Each registers here, and one guard covers them all,
 * so leaving asks once.
 */

export const LEAVE_MESSAGE = 'You have unsaved changes. Leave this page and discard them?';

/** Links that check for unsaved changes themselves, so they don't ask twice. */
export const GUARDED_LINK_ATTRIBUTE = 'data-unsaved-guarded';

interface GuardSource {
  active: boolean;
  message: string;
  ignoreWithin?: string;
  isDirty?: () => boolean;
}

const sources = new Set<{ current: GuardSource }>();
let uninstall: (() => void) | null = null;
// The Back that takes the guard's copy entry out, while it is still landing.
let settling: Promise<void> | null = null;

const activeSources = () => [...sources].map((source) => source.current).filter((source) => source.active);
const anythingUnsaved = () => [...sources].some(({ current }) => current.active || current.isDirty?.());
const message = () => activeSources()[0]?.message ?? LEAVE_MESSAGE;

function install() {
  const guardKey = '__saveKitUnsavedGuard';
  const guardedUrl = window.location.href;
  const guardId = `${window.location.pathname}:${Date.now()}`;
  let bypassHistoryGuard = false;
  let restoringGuardEntry = false;
  window.history.pushState({ ...window.history.state, [guardKey]: guardId }, '', window.location.href);
  const beforeUnload = (event: BeforeUnloadEvent) => {
    event.preventDefault();
    event.returnValue = '';
  };
  const interceptLinks = (event: MouseEvent) => {
    const anchor = (event.target as HTMLElement | null)?.closest('a');
    if (!anchor || !anchor.href || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
    // A modified click opens a new tab; this page stays.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    if (activeSources().some((source) => source.ignoreWithin && anchor.closest(`[${source.ignoreWithin}]`))) return;
    if (anchor.hasAttribute(GUARDED_LINK_ATTRIBUTE)) return;
    // A link to a part of this same page (#section) doesn't leave it.
    const target = new URL(anchor.href, window.location.href);
    if (target.origin === window.location.origin && target.pathname === window.location.pathname && target.search === window.location.search) return;
    if (!window.confirm(message())) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
  const interceptHistory = () => {
    if (bypassHistoryGuard) return;
    if (restoringGuardEntry) {
      restoringGuardEntry = false;
      return;
    }
    if (window.confirm(message())) {
      bypassHistoryGuard = true;
      window.history.back();
      return;
    }
    restoringGuardEntry = true;
    window.history.forward();
  };
  window.addEventListener('beforeunload', beforeUnload);
  window.addEventListener('popstate', interceptHistory);
  document.addEventListener('click', interceptLinks, true);
  return () => {
    window.removeEventListener('beforeunload', beforeUnload);
    window.removeEventListener('popstate', interceptHistory);
    document.removeEventListener('click', interceptLinks, true);
    queueMicrotask(() => {
      // Gone already if the page navigated (the router replaced the entry).
      if (window.history.state?.[guardKey] !== guardId) return;
      const nextState = { ...window.history.state };
      delete nextState[guardKey];
      window.history.replaceState(nextState, '', window.location.href);
      // A new draft can give this entry a durable edit URL without remounting.
      // It is no longer a duplicate of the previous, untitled entry.
      if (!anythingUnsaved() && window.location.href === guardedUrl) {
        settling = new Promise<void>((resolve) => {
          const done = () => {
            window.removeEventListener('popstate', done);
            window.clearTimeout(fallback);
            settling = null;
            resolve();
          };
          const fallback = window.setTimeout(done, 1000);
          window.addEventListener('popstate', done);
        });
        window.history.back();
      }
    });
  };
}

function sync() {
  const wanted = activeSources().length > 0;
  if (wanted && !uninstall) uninstall = install();
  else if (!wanted && uninstall) {
    uninstall();
    uninstall = null;
  }
}

export function useLeaveGuard(active: boolean, {
  message: leaveMessage = LEAVE_MESSAGE,
  /** Links under an element with this attribute open elsewhere and never leave. */
  ignoreWithin,
  /** Read at the moment of leaving, for changes not yet in state (a field being typed in). */
  isDirty,
}: { message?: string; ignoreWithin?: string; isDirty?: () => boolean } = {}) {
  const source = useRef<GuardSource>({ active: false, message: leaveMessage });

  useEffect(() => {
    sources.add(source);
    return () => {
      sources.delete(source);
      sync();
    };
  }, []);

  useEffect(() => {
    source.current = { active, message: leaveMessage, ignoreWithin, isDirty };
    sync();
  });
}

/**
 * Resolves once the guard has finished tidying history. Navigate after it
 * when a page leaves right after its last save: the Back that removes the
 * guard's copy entry lands a moment later and would otherwise undo the
 * navigation.
 */
export async function whenHistorySettled() {
  // The guard tidies up in a microtask after the save's render; let it start.
  await new Promise((resolve) => window.setTimeout(resolve));
  if (settling) await settling;
}

/** For a page's own Back link: true when it may go. */
export function confirmLeave(dirty: boolean, leaveMessage = LEAVE_MESSAGE) {
  return !dirty || window.confirm(leaveMessage);
}
