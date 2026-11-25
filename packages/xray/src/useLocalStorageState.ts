'use client';

import { useState, useEffect, useCallback } from 'react';

/**
 * State kept in localStorage: hydrated after mount (so server and first
 * client render agree), written on every change, and kept in step across
 * hook instances and tabs. The native `storage` event only fires in *other*
 * tabs, so a custom same-tab event keeps instances within one tab in sync.
 */
const SYNC_EVENT = 'xray-local-storage-sync';

export function useLocalStorageState<T>(key: string, defaultValue: T): [T, (value: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(defaultValue);

  // Hydrate on mount and stay in sync with other instances/tabs writing this key
  useEffect(() => {
    const read = () => {
      try {
        const stored = localStorage.getItem(key);
        if (stored !== null) {
          setState(JSON.parse(stored));
        }
      } catch {
        // Ignore parse errors, keep current value
      }
    };
    read();

    const onChange = (event: Event) => {
      if (event instanceof StorageEvent && event.key !== null && event.key !== key) return;
      if (event instanceof CustomEvent && event.detail !== key) return;
      read();
    };
    window.addEventListener('storage', onChange); // cross-tab
    window.addEventListener(SYNC_EVENT, onChange); // same-tab
    return () => {
      window.removeEventListener('storage', onChange);
      window.removeEventListener(SYNC_EVENT, onChange);
    };
  }, [key]);

  const setValue = useCallback((value: T | ((prev: T) => T)) => {
    setState((prev) => {
      const next = typeof value === 'function' ? (value as (prev: T) => T)(prev) : value;
      try {
        localStorage.setItem(key, JSON.stringify(next));
        window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: key }));
      } catch {
        // Ignore quota errors
      }
      return next;
    });
  }, [key]);

  return [state, setValue];
}
