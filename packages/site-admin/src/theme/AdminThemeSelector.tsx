'use client';

import { ADMIN_THEME_OPTIONS, type AdminThemePreference } from './admin-theme.js';
import { useAdminTheme } from './AdminThemeProvider.js';
import { AdminSelect } from '../menu/index.js';

export interface AdminThemeSelectorProps {
  /** Optional id prefix when more than one admin shell is rendered in a fixture. */
  id?: string;
  /** Extra classes supplied by the admin navigation integration point. */
  className?: string;
  /** Hide the redundant visual label in the footer while retaining its accessible name. */
  compact?: boolean;
}

/** Accessible admin appearance control backed by the admin-only preference. */
export function AdminThemeSelector({ id = 'admin-theme', className = '', compact = false }: AdminThemeSelectorProps) {
  const { preference, resolvedTheme, setPreference } = useAdminTheme();

  return (
    <div className={`flex min-h-11 items-center justify-between gap-3 ${className}`.trim()}>
      <label htmlFor={id} className={compact ? 'sr-only' : 'font-mono text-xs uppercase tracking-wider text-foreground-muted'}>
        Theme
      </label>
      <AdminSelect
        id={id}
        compact={compact}
        value={preference}
        onChange={(event) => setPreference(event.target.value as AdminThemePreference)}
        aria-describedby={`${id}-status`}
        shellClassName="w-auto"
        className="font-mono text-xs"
      >
        {ADMIN_THEME_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </AdminSelect>
      <span id={`${id}-status`} className="sr-only" aria-live="polite">
        {preference === 'system' ? `Using system ${resolvedTheme} theme` : `${resolvedTheme} theme selected`}
      </span>
    </div>
  );
}
