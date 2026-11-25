import { useEffect, useRef } from 'react';

/** Plain ⌘S / Ctrl+S. ⌘⇧S is left alone (editors often use it for strikethrough). */
export function isSaveShortcut(event: Pick<KeyboardEvent, 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'key'>) {
  return (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 's';
}

/**
 * ⌘S saves the page. It never opens the browser's own Save dialog,
 * even when there's nothing to save — the handler says so instead.
 */
export function useSaveShortcut(onSave: () => void) {
  const onSaveRef = useRef(onSave);
  useEffect(() => {
    onSaveRef.current = onSave;
  });
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (!isSaveShortcut(event) || event.isComposing) return;
      event.preventDefault();
      onSaveRef.current();
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);
}
