'use client';

import { useEffect, useState } from 'react';

/** Whether the device can hover (a mouse or trackpad). */
export function useCanHover(): boolean {
  const [canHover, setCanHover] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(hover: hover) and (pointer: fine)');
    setCanHover(query.matches);
    const onChange = (event: MediaQueryListEvent) => setCanHover(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return canHover;
}
