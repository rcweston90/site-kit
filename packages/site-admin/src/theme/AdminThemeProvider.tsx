'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';
import {
  ADMIN_THEME_STORAGE_KEY,
  type AdminThemePreference,
  type ResolvedAdminTheme,
  isAdminThemePreference,
  resolveAdminTheme,
} from './admin-theme.js';

const DARK_QUERY = '(prefers-color-scheme: dark)';
const ADMIN_THEME_EVENT = 'admin-theme-change';

interface AdminThemeContextValue {
  preference: AdminThemePreference;
  resolvedTheme: ResolvedAdminTheme;
  setPreference: (preference: AdminThemePreference) => void;
}

const AdminThemeContext = createContext<AdminThemeContextValue | null>(null);

// This runs while the browser parses the admin subtree, before its descendants
// can paint. React does not own <html>, and the root layout already suppresses
// hydration warnings there, so the server-rendered component tree stays stable.
const PREPAINT_SCRIPT = `(function(){try{var d=document.documentElement;if(!d.hasAttribute('data-admin-theme-active')){d.setAttribute('data-admin-theme-previous',d.getAttribute('data-theme')||'');d.setAttribute('data-admin-theme-active','');}var p=JSON.parse(localStorage.getItem('${ADMIN_THEME_STORAGE_KEY}'));if(p!=='light'&&p!=='dark'&&p!=='system')p='system';var r=p==='system'?(matchMedia('${DARK_QUERY}').matches?'dark':'light'):p;if(r==='dark')d.setAttribute('data-theme','dark');else d.removeAttribute('data-theme');d.style.colorScheme=r;}catch(e){}})()`;

function readPreference(): AdminThemePreference {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(ADMIN_THEME_STORAGE_KEY) ?? 'null');
    return isAdminThemePreference(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

function applyResolvedTheme(theme: ResolvedAdminTheme) {
  const root = document.documentElement;
  if (theme === 'dark') root.setAttribute('data-theme', 'dark');
  else root.removeAttribute('data-theme');
  root.style.colorScheme = theme;
}

/**
 * Owns the admin-only Light/Dark/System preference for every nested admin route.
 * Mount this once around the authenticated admin shell, outside route content.
 */
export function AdminThemeProvider({ children }: { children: React.ReactNode }) {
  // A fixed initial value keeps server and hydration markup identical. The
  // pre-paint script handles pixels; layout effect reconciles React state.
  const [preference, setPreferenceState] = useState<AdminThemePreference>('system');
  const [systemPrefersDark, setSystemPrefersDark] = useState(false);
  const resolvedTheme = resolveAdminTheme(preference, systemPrefersDark);

  useLayoutEffect(() => {
    const media = window.matchMedia(DARK_QUERY);
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setPreferenceState(readPreference());
      setSystemPrefersDark(media.matches);
    });

    const onSystemChange = (event: MediaQueryListEvent) => setSystemPrefersDark(event.matches);
    media.addEventListener('change', onSystemChange);
    return () => {
      active = false;
      media.removeEventListener('change', onSystemChange);
    };
  }, []);

  useEffect(() => {
    const syncPreference = (event: Event) => {
      if (event instanceof StorageEvent && event.key !== ADMIN_THEME_STORAGE_KEY) return;
      setPreferenceState(readPreference());
    };
    window.addEventListener('storage', syncPreference);
    window.addEventListener(ADMIN_THEME_EVENT, syncPreference);
    return () => {
      window.removeEventListener('storage', syncPreference);
      window.removeEventListener(ADMIN_THEME_EVENT, syncPreference);
    };
  }, []);

  useLayoutEffect(() => {
    applyResolvedTheme(resolvedTheme);
  }, [resolvedTheme]);

  useEffect(() => () => {
    const root = document.documentElement;
    const previous = root.getAttribute('data-admin-theme-previous');
    if (previous) root.setAttribute('data-theme', previous);
    else root.removeAttribute('data-theme');
    root.style.removeProperty('color-scheme');
    root.removeAttribute('data-admin-theme-active');
    root.removeAttribute('data-admin-theme-previous');
  }, []);

  const setPreference = useCallback((next: AdminThemePreference) => {
    setPreferenceState(next);
    try {
      localStorage.setItem(ADMIN_THEME_STORAGE_KEY, JSON.stringify(next));
      window.dispatchEvent(new Event(ADMIN_THEME_EVENT));
    } catch {
      // Storage can be unavailable in private contexts; the live choice still works.
    }
  }, []);

  const value = useMemo(
    () => ({ preference, resolvedTheme, setPreference }),
    [preference, resolvedTheme, setPreference],
  );

  return (
    <AdminThemeContext.Provider value={value}>
      <script dangerouslySetInnerHTML={{ __html: PREPAINT_SCRIPT }} />
      {children}
    </AdminThemeContext.Provider>
  );
}

export function useAdminTheme(): AdminThemeContextValue {
  const value = useContext(AdminThemeContext);
  if (!value) throw new Error('useAdminTheme must be used within AdminThemeProvider');
  return value;
}
