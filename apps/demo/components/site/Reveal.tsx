'use client';

import { useEffect, useRef, type ElementType, type HTMLAttributes, type ReactNode } from 'react';

/**
 * Fades its contents in the first time they scroll into view: a CSS reveal
 * (site.css), so the server renders them visible and a page without script
 * shows everything.
 */
export function RevealGroup({ as: Tag = 'div', children, ...props }: { as?: ElementType; children: ReactNode } & HTMLAttributes<HTMLElement>) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      element.setAttribute('data-revealed', '');
      observer.disconnect();
    }, { rootMargin: '0px 0px -10% 0px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return <Tag ref={ref} data-reveal-group="" {...props}>{children}</Tag>;
}
