import { useSyncExternalStore } from 'react';

// Whether X-ray is open, and whether this tab may open it.
//
// - on (sessionStorage): X-ray is open, surviving navigation within the tab.
// - allowed (memory): the host's `enabled` prop is true and, when the host
//   passed `verify`, it has answered true. Until then the launcher, ⌥X and
//   `?xray=1` do nothing.
// - verified (sessionStorage): `verify` answered true in this tab, so it is
//   asked once per tab, not on every page.
const ON_KEY = 'xray';
const VERIFIED_KEY = 'xray-verified';

const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};
const notify = () => listeners.forEach((cb) => cb());

const read = (key: string) => {
  try {
    return sessionStorage.getItem(key) === '1';
  } catch {
    return false;
  }
};
const write = (key: string, on: boolean) => {
  try {
    if (on) sessionStorage.setItem(key, '1');
    else sessionStorage.removeItem(key);
  } catch {
    // no storage — the choice just won't persist
  }
};

let allowed = false;

export const getXRay = () => read(ON_KEY);
export const getXRayAllowed = () => allowed;
const getServerSnapshot = () => false;

/** Open or close X-ray. Opening does nothing where X-ray isn't allowed. */
export function setXRay(on: boolean) {
  if (on && !allowed) return;
  write(ON_KEY, on);
  notify();
}

/** Set by <XRay> from its `enabled` and `verify` props. */
export function setXRayAllowed(next: boolean) {
  if (next === allowed) return;
  allowed = next;
  if (!next) write(ON_KEY, false);
  notify();
}

/** Forget a passed `verify` check for this tab (for sign-out flows). */
export function clearXRayVerification() {
  write(VERIFIED_KEY, false);
  setXRayAllowed(false);
}

/**
 * Run the host's check once per tab. A true answer is remembered for the
 * tab; false (or a thrown error) leaves X-ray closed and unavailable.
 */
let checking: Promise<boolean> | null = null;
export function verifyXRay(verify: () => Promise<boolean>): Promise<boolean> {
  if (read(VERIFIED_KEY)) return Promise.resolve(true);
  checking ??= Promise.resolve()
    .then(verify)
    .then((ok) => {
      write(VERIFIED_KEY, ok === true);
      return ok === true;
    })
    .catch(() => false)
    .finally(() => {
      checking = null;
    });
  return checking;
}

/**
 * Into the top layer, where browsers have it. Without the popover API the
 * attribute is inert and the element simply stays in the page — but asking
 * `matches(':popover-open')` there throws, so check for the API first.
 */
export function showInTopLayer(el: HTMLElement | null) {
  if (!el || typeof el.showPopover !== 'function') return;
  if (!el.matches(':popover-open')) el.showPopover();
}

/** Whether X-ray is open. */
export const useXRay = () => useSyncExternalStore(subscribe, getXRay, getServerSnapshot);
/** Whether X-ray may open in this tab (enabled, and verified where the host asked). */
export const useXRayAllowed = () => useSyncExternalStore(subscribe, getXRayAllowed, getServerSnapshot);
