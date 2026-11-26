'use client';

import type { ReactNode } from 'react';

const sectionAlign = { left: 'text-left', center: 'text-center', right: 'text-right' };
const sectionSize = { sm: 'text-xl leading-baseline md:leading-12', md: 'text-xl md:text-2xl leading-baseline md:leading-12' };

export function SectionHeader({ title, level = 2, subtitle, align = 'left', size = 'md', accentBar = false, action, animated = true, className = '' }: {
  title: string;
  level?: 1 | 2 | 3 | 4 | 5 | 6;
  subtitle?: string;
  align?: 'left' | 'center' | 'right';
  size?: 'sm' | 'md';
  accentBar?: boolean;
  action?: ReactNode;
  animated?: boolean;
  className?: string;
}) {
  const HeadingTag = `h${level}` as const;
  return (
    <div className={`${animated ? 'enter-rise [--enter-y:20px] ' : ''}${action ? 'flex items-end justify-between gap-4' : ''} ${sectionAlign[align]} ${className}`}>
      <div className={action ? '' : 'w-full'}>
        <HeadingTag className={`font-mono ${sectionSize[size]} font-bold uppercase tracking-wide text-foreground ${accentBar ? 'flex items-center gap-3' : ''}`}>
          {accentBar && <span className="w-8 h-0.5 bg-accent-primary shrink-0" aria-hidden="true" />}
          {title}
        </HeadingTag>
        {subtitle && <p className="mt-0 leading-baseline text-foreground-muted">{subtitle}</p>}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}
