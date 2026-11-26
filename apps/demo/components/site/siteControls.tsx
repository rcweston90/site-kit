import type { ReactNode } from 'react';
import type { SiteTheme } from './SiteChrome';

/** The footer's colour themes, in display order, each with its icon. */
export const THEME_OPTIONS: { id: SiteTheme; label: string; icon: (selected: boolean) => ReactNode }[] = [
  {
    id: 'amber',
    label: 'Amber mode',
    icon: (selected) => (
      <svg width="16" height="16" viewBox="0 0 24 24" fill={selected ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="5" />
        <line x1="12" y1="1" x2="12" y2="3" />
        <line x1="12" y1="21" x2="12" y2="23" />
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
        <line x1="1" y1="12" x2="3" y2="12" />
        <line x1="21" y1="12" x2="23" y2="12" />
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
      </svg>
    ),
  },
  {
    id: 'default',
    label: 'Neutral mode',
    icon: (selected) => (
      <svg width="16" height="16" viewBox="0 0 24 24" fill={selected ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="6" />
      </svg>
    ),
  },
  {
    id: 'dark',
    label: 'Dark mode',
    icon: (selected) => (
      <svg width="16" height="16" viewBox="0 0 24 24" fill={selected ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    ),
  },
];
