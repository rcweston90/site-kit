'use client';

import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(listener: () => void) {
  const query = window.matchMedia(QUERY);
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}

/**
 * Whether the reader asked for less motion. False on the server and on the
 * first client render, so markup hydrates the same either way.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => false);
}
