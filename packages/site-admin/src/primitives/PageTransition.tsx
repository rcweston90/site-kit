'use client';

import { useEffect, type ReactNode } from 'react';
import { useReducedMotion } from './reduced-motion.js';

// False during SSR and the first hydration, true after.
let hasHydrated = false;

/**
 * Fades each client-side navigation in. Opacity only, never a transform: a
 * transformed wrapper becomes the containing block for every `position: fixed`
 * descendant. Mount it in a route template so it remounts on navigation.
 */
export function PageTransition({ children, className = '' }: { children: ReactNode; className?: string }) {
  const prefersReducedMotion = useReducedMotion();
  const isFirstMount = !hasHydrated;
  useEffect(() => {
    hasHydrated = true;
  }, []);
  return (
    <div className={`${prefersReducedMotion || isFirstMount ? '' : 'sa-page-in'} ${className}`}>
      {children}
    </div>
  );
}
