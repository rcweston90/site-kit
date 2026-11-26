'use client';

import { ChevronDown } from 'lucide-react';
import { forwardRef, type SelectHTMLAttributes } from 'react';

export interface AdminSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  /** Width and layout classes belong on the component shell. */
  shellClassName?: string;
  /** Tight horizontal footprint for utility rows; identical native semantics. */
  compact?: boolean;
}

/** Native select semantics with an owned, consistently inset visual chevron. */
export const AdminSelect = forwardRef<HTMLSelectElement, AdminSelectProps>(function AdminSelect(
  { className = '', shellClassName = '', compact = false, children, ...props },
  ref,
) {
  return (
    <span className={`relative inline-grid min-w-0 ${shellClassName}`.trim()}>
      <select
        ref={ref}
        className={`min-h-12 w-full min-w-0 appearance-none rounded-md border border-default bg-background py-0 ${compact ? 'pl-2 pr-7 text-xs' : 'pl-3 pr-11 text-sm'} leading-baseline text-foreground outline-none hover:border-foreground-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary disabled:cursor-not-allowed disabled:opacity-40 ${className}`.trim()}
        {...props}
      >
        {children}
      </select>
      <ChevronDown aria-hidden="true" className={`pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-muted ${compact ? 'right-2' : 'right-3'}`} />
    </span>
  );
});
