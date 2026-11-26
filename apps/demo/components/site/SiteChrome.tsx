'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { themeAttribute } from '@rcweston/site-data/client';
import { SiteNavigation, type SiteNavItem } from './SiteNavigation';
import { SiteFooter } from './SiteFooter';

export type SiteTheme = 'default' | 'amber' | 'dark';

import { SITE_THEME_KEY as THEME_KEY } from './theme-script';
const THEME_CHROME: Record<SiteTheme, string> = { default: '#F8F9FB', amber: '#FAF5F0', dark: '#0F1216' };
const isTheme = (value: unknown): value is SiteTheme => value === 'default' || value === 'amber' || value === 'dark';

/** The visitor's own pick, else the default theme set in Admin → Appearance. */
function readTheme(fallback: SiteTheme): SiteTheme {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(THEME_KEY) ?? 'null');
    return isTheme(stored) ? stored : fallback;
  } catch {
    return fallback;
  }
}

/** Admin → Appearance's say in the theme: where a first visit starts, and the clouds over neutral. */
export interface SiteThemeSettings {
  defaultTheme: SiteTheme;
  sunny: boolean;
}

const PLAIN: SiteThemeSettings = { defaultTheme: 'default', sunny: false };

/**
 * The public pages' frame: skip link, navigation, the page, and the footer
 * with its theme switch. A visitor's pick is kept in their browser; until
 * they make one, the default theme from Admin → Appearance applies.
 */
export function SiteChrome({ nav, appearance = PLAIN, credits = false, children }: { nav: SiteNavItem[]; appearance?: SiteThemeSettings; credits?: boolean; children: ReactNode }) {
  const { defaultTheme, sunny } = appearance;
  const [theme, setTheme] = useState<SiteTheme>(defaultTheme);
  useEffect(() => setTheme(readTheme(defaultTheme)), [defaultTheme]);

  const applyTheme = useCallback((next: SiteTheme) => {
    setTheme(next);
    try {
      window.localStorage.setItem(THEME_KEY, JSON.stringify(next));
    } catch {
      // The switch still works for this visit.
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.removeAttribute('data-admin-theme-active');
    root.style.colorScheme = theme === 'dark' ? 'dark' : 'light';
    const attribute = themeAttribute(theme, sunny);
    if (attribute) root.setAttribute('data-theme', attribute);
    else root.removeAttribute('data-theme');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_CHROME[theme]);
  }, [theme, sunny]);

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-half focus:left-4 focus:z-[100] focus:px-4 focus:py-half focus:leading-baseline focus:bg-accent-primary focus:text-on-accent focus:rounded focus:text-sm focus:font-medium"
      >
        Skip to main content
      </a>
      <div className="relative z-[1] gradient-bg">
        <SiteNavigation items={nav} />
        <main id="main-content" className="pt-major w-full overflow-x-clip">{children}</main>
        <SiteFooter items={nav} theme={theme} onSetTheme={applyTheme} credits={credits} />
      </div>
    </>
  );
}
