'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { SessionEndedDialog, UndoToast, safeReturnPath } from '@rcweston/save-kit';
import { PasscodeForm, useAdminAuth } from '../auth/index.js';
import { AdminThemeProvider, AdminThemeSelector } from '../theme/index.js';
import { AdminLink, useAdminRouter } from '../router.js';
import { useAdminConfig, useAdminModules } from '../config.js';
import type { AdminNavEntry } from '../modules/define.js';
import { buildAdminNav, findAdminNavGroup, findCurrentAdminNavItem, type AdminNavGroup } from './navigation.js';

// The sidebar docks from Tailwind's `lg`. Below it a tablet keeps the full
// width for tables and editors, and the navigation becomes a drawer.
const DOCKED_NAV_QUERY = '(min-width: 64rem)';

const DESKTOP_NAV_KEY = 'site-admin-nav-collapsed';
let desktopNavFallback = false;

function readDesktopNav() {
  try {
    return window.localStorage.getItem(DESKTOP_NAV_KEY) === 'true';
  } catch {
    return desktopNavFallback;
  }
}

function setDesktopNav(collapsed: boolean) {
  desktopNavFallback = collapsed;
  try {
    window.localStorage.setItem(DESKTOP_NAV_KEY, String(collapsed));
  } catch {
    // The toggle remains usable when the browser denies persistent storage.
  }
  window.dispatchEvent(new Event(DESKTOP_NAV_KEY));
}

function subscribeToDesktopNav(listener: () => void) {
  window.addEventListener(DESKTOP_NAV_KEY, listener);
  return () => window.removeEventListener(DESKTOP_NAV_KEY, listener);
}

// The admin's neutral accent: the site's own accent stays on the public pages.
const ADMIN_ACCENT = { '--accent-primary': '#555555', '--accent-secondary': '#404040' } as CSSProperties;

/**
 * The signed-in admin: passcode sign-in (story-server's session route), then
 * the sidebar built from the enabled modules, the theme selector, and the
 * save layer (Undo toast, sign-in-again dialog) kept mounted across pages.
 */
export function AdminShell({ children, extraNav }: { children: ReactNode; extraNav?: readonly AdminNavEntry[] }) {
  const { pathname, replace } = useAdminRouter();
  const config = useAdminConfig();
  const { isAuthenticated, isChecking, authenticate, logout } = useAdminAuth();

  // A page that found no session sent the author here with ?next=; once
  // signed in, take them back to it.
  useEffect(() => {
    if (!isAuthenticated || pathname !== config.adminBase) return;
    const next = new URLSearchParams(window.location.search).get('next');
    const safe = safeReturnPath(next, { prefix: config.adminBase });
    if (safe) replace(safe);
  }, [isAuthenticated, pathname, replace, config.adminBase]);

  // The theme provider wraps every state, so its pre-paint script is part of
  // the server's HTML (the sign-in and loading screens take the admin theme
  // too) rather than rendered later on the client, where it would never run.
  let body: ReactNode;
  if (isChecking) {
    body = (
      <div className="min-h-screen flex items-center justify-center" style={ADMIN_ACCENT}>
        <div className="text-center text-foreground-muted font-mono text-sm uppercase tracking-wider">Loading...</div>
      </div>
    );
  } else if (!isAuthenticated) {
    body = (
      <div className="min-h-screen flex items-center justify-center" style={ADMIN_ACCENT}>
        <div className="w-full max-w-sm px-6">
          <h1 className="font-mono text-3xl font-bold text-foreground uppercase tracking-wide text-center mb-8">Admin</h1>
          <PasscodeForm authenticate={authenticate} onSuccess={() => {}} />
          <div className="mt-6 text-center">
            <AdminLink
              href={config.siteHref}
              className="font-mono text-xs uppercase tracking-wider text-foreground-muted hover:text-foreground transition-colors"
            >
              View Site &rarr;
            </AdminLink>
          </div>
        </div>
      </div>
    );
  } else {
    body = (
      <>
        <AdminWorkspace pathname={pathname} logout={logout} extraNav={extraNav}>{children}</AdminWorkspace>
        <UndoToast />
        <SessionEndedDialog renderSignIn={({ onSignedIn }) => <PasscodeForm authenticate={authenticate} onSuccess={onSignedIn} />} />
      </>
    );
  }

  return <AdminThemeProvider>{body}</AdminThemeProvider>;
}

/** Layout only: fixtures and previews can render the workspace without an account or a store. */
export function AdminWorkspace({
  children,
  pathname,
  logout,
  extraNav,
  groups: givenGroups,
  prefetch = logout ? undefined : false,
}: {
  children: ReactNode;
  pathname: string;
  logout?: () => void;
  extraNav?: readonly AdminNavEntry[];
  /** Override the nav built from the modules. */
  groups?: readonly AdminNavGroup[];
  prefetch?: boolean;
}) {
  const config = useAdminConfig();
  const modules = useAdminModules();
  const groups = useMemo(() => givenGroups ?? buildAdminNav(modules, config, extraNav), [givenGroups, modules, config, extraNav]);
  const collapsed = useSyncExternalStore(subscribeToDesktopNav, readDesktopNav, () => false);
  const Content = logout ? 'main' : 'div';
  const [mobileOpenPath, setMobileOpenPath] = useState<string | null>(null);
  const mobileOpen = mobileOpenPath === pathname;
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
  const mobileCloseButtonRef = useRef<HTMLButtonElement>(null);
  const mobileDrawerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusFrame = requestAnimationFrame(() => {
      mobileCloseButtonRef.current?.focus({ preventScroll: true });
      mobileDrawerRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest' });
    });

    // Widening past the breakpoint docks the drawer as the sidebar; without
    // this the page would stay inert and scroll-locked behind it.
    const docked = window.matchMedia(DOCKED_NAV_QUERY);
    const onDock = (event: MediaQueryListEvent) => {
      if (event.matches) setMobileOpenPath(null);
    };
    docked.addEventListener('change', onDock);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMobileOpenPath(null);
        requestAnimationFrame(() => mobileMenuButtonRef.current?.focus({ preventScroll: true }));
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [...(mobileDrawerRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), select:not([disabled])') ?? [])]
        .filter((element) => element.getClientRects().length > 0);
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
      docked.removeEventListener('change', onDock);
    };
  }, [mobileOpen]);

  const closeMobileMenu = (returnFocus = false) => {
    setMobileOpenPath(null);
    if (returnFocus) requestAnimationFrame(() => mobileMenuButtonRef.current?.focus({ preventScroll: true }));
  };

  const currentItem = findCurrentAdminNavItem(groups, pathname, config.adminBase);
  const currentGroup = currentItem && findAdminNavGroup(groups, currentItem);

  const menuIcon = (open: boolean) => (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
      {open ? (
        <>
          <line x1="4" y1="4" x2="16" y2="16" />
          <line x1="16" y1="4" x2="4" y2="16" />
        </>
      ) : (
        <>
          <line x1="3" y1="5" x2="17" y2="5" />
          <line x1="3" y1="10" x2="17" y2="10" />
          <line x1="3" y1="15" x2="17" y2="15" />
        </>
      )}
    </svg>
  );
  const iconButtonClass = 'grid h-11 w-11 shrink-0 place-items-center rounded-md text-foreground-muted transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2';
  const footerLinkClass = 'inline-flex min-h-12 items-center whitespace-nowrap rounded-md px-1 text-xs text-foreground-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2';

  const sidebarContent = (
    <>
      {/* Top — the close sits where the menu button was, so the toggle stays under the thumb */}
      <div className={`flex h-12 shrink-0 items-center gap-1 border-b border-default pl-1 pr-4 ${collapsed ? 'lg:justify-center lg:px-0' : 'lg:justify-between lg:px-3'}`}>
        <button
          ref={mobileCloseButtonRef}
          type="button"
          onClick={() => closeMobileMenu(true)}
          className={`${iconButtonClass} lg:hidden`}
          aria-label="Close admin menu"
        >
          {menuIcon(true)}
        </button>
        <AdminLink
          href={config.adminBase}
          prefetch={prefetch}
          className={`inline-flex min-h-11 items-center px-2 font-mono text-sm font-bold text-foreground uppercase tracking-wider hover:text-accent-primary transition-colors ${collapsed ? 'lg:hidden' : ''}`}
        >
          Admin
        </AdminLink>
        <button
          type="button"
          onClick={() => setDesktopNav(!collapsed)}
          className={`${iconButtonClass} hidden lg:grid`}
          aria-label={collapsed ? 'Expand admin navigation' : 'Collapse admin navigation'}
          title={collapsed ? 'Expand admin navigation' : 'Collapse admin navigation'}
          aria-expanded={!collapsed}
          aria-controls="admin-sidebar-content"
        >
          {collapsed ? <PanelLeftOpen size={20} aria-hidden="true" /> : <PanelLeftClose size={20} aria-hidden="true" />}
        </button>
      </div>

      <div id="admin-sidebar-content" className={`flex min-h-0 flex-1 flex-col ${collapsed ? 'lg:hidden' : ''}`}>
        <nav aria-label="Admin navigation" className="flex-1 overflow-y-auto overscroll-contain py-half">
          {groups.map((entry) => {
            const labelId = `admin-nav-${entry.label.toLowerCase().replace(/\s+/g, '-')}`;
            return (
              <div key={entry.label} className="mt-half first:mt-0">
                <div id={labelId} className="px-5 pt-half font-mono text-xs uppercase leading-baseline tracking-widest text-foreground-muted font-semibold">
                  {entry.label}
                </div>
                <ul aria-labelledby={labelId}>
                  {entry.items.map((item) => {
                    const active = currentItem?.href === item.href;
                    return (
                      <li key={item.name}>
                        <AdminLink
                          href={item.href}
                          prefetch={prefetch}
                          aria-current={active ? 'page' : undefined}
                          title={item.description}
                          onClick={() => closeMobileMenu()}
                          {...(item.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                          className={`
                            flex min-h-11 items-center gap-2 border-l-2 px-5 font-mono text-xs uppercase tracking-wider transition-colors
                            ${active
                              ? 'border-foreground bg-foreground/5 font-semibold text-foreground'
                              : 'border-transparent text-foreground-muted hover:bg-foreground/[0.03] hover:text-foreground'
                            }
                          `}
                        >
                          {item.name}
                          {item.external && <span className="ml-auto" aria-hidden="true">↗</span>}
                        </AdminLink>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>

        {/* One row at default zoom; wrap naturally if the browser enlarges text. */}
        <div className="flex shrink-0 flex-wrap items-center gap-x-1 border-t border-default px-half" data-admin-nav-footer>
          <AdminThemeSelector compact />
          <div className="ml-auto flex items-center gap-1">
            <AdminLink href={config.siteHref} prefetch={prefetch} className={footerLinkClass}>
              View site
            </AdminLink>
            {logout && <button type="button" onClick={logout} className={footerLinkClass}>
              Log out
            </button>}
          </div>
        </div>
      </div>
    </>
  );

  // The story editor is a full-width writing surface with its own way back
  // (the ← in its top bar); the navigation returns on the way out.
  const editing = config.isFullscreen(pathname);
  // On a child route (an editor, a new item) the title leads back to its collection.
  const onCollectionPage = currentItem?.href === pathname;

  // --admin-nav-width is the one source for the docked sidebar, the content
  // offset and any fixed bar that must clear it.
  return (
    <div
      className={`min-h-screen flex ${collapsed && !editing ? '[--admin-nav-width:3rem]' : '[--admin-nav-width:15rem]'}`}
      style={ADMIN_ACCENT}
      data-site-admin=""
    >
      {!editing && <>
        {/* Mobile and tablet top bar */}
        <header inert={mobileOpen || undefined} className="fixed inset-x-0 top-0 z-30 flex h-12 items-center gap-1 border-b border-default bg-background pl-1 pr-4 lg:hidden">
          <button
            ref={mobileMenuButtonRef}
            type="button"
            onClick={() => setMobileOpenPath(mobileOpen ? null : pathname)}
            className={iconButtonClass}
            aria-label="Open admin menu"
            aria-expanded={mobileOpen}
            aria-controls="admin-mobile-drawer"
          >
            {menuIcon(false)}
          </button>
          <div className="flex min-w-0 items-baseline gap-2 px-2 font-mono text-sm uppercase tracking-wider">
            <span className="sr-only">Admin: </span>
            {currentGroup && currentGroup.label !== 'Overview' && (
              <>
                <span className="min-w-0 truncate text-foreground-muted">{currentGroup.label}</span>
                <span className="text-foreground-muted" aria-hidden="true">/</span>
              </>
            )}
            {currentItem && !onCollectionPage ? (
              <AdminLink href={currentItem.href} prefetch={prefetch} className="shrink-0 font-bold text-foreground underline-offset-4 hover:underline">
                {currentItem.name}
              </AdminLink>
            ) : (
              <span className="shrink-0 font-bold text-foreground">{currentItem?.name ?? 'Admin'}</span>
            )}
          </div>
        </header>

        {/* Drawer backdrop */}
        <div
          role="presentation"
          className={`fixed inset-0 z-40 bg-foreground/25 transition-[opacity,visibility] duration-200 motion-reduce:transition-none lg:hidden ${mobileOpen ? 'visible opacity-100' : 'invisible opacity-0'}`}
          onClick={() => closeMobileMenu(true)}
        />

        {/* Sidebar — docked from lg, a drawer below it */}
        <aside
          ref={mobileDrawerRef}
          id="admin-mobile-drawer"
          role={mobileOpen ? 'dialog' : undefined}
          aria-modal={mobileOpen || undefined}
          aria-label="Admin menu"
          className={`
            fixed top-0 left-0 z-50 flex h-dvh w-[min(20rem,calc(100vw-3rem))] flex-col border-r border-default bg-background
            duration-200 ease-out motion-reduce:transition-none
            ${mobileOpen ? 'visible translate-x-0 shadow-xl transition-transform' : 'invisible -translate-x-full transition-[transform,visibility]'}
            lg:visible lg:w-(--admin-nav-width) lg:translate-x-0 lg:shadow-none
          `}
        >
          {sidebarContent}
        </aside>
      </>}

      <Content
        key={editing ? 'editing' : 'workspace'}
        data-admin-workspace-content=""
        inert={mobileOpen ? true : undefined}
        className={`sa-content-in min-w-0 flex-1 bg-background px-4 md:px-8 ${editing
          // The story editor pulls its sticky bar up by exactly this padding.
          ? 'py-4 md:py-8'
          // 72px clears the 48px top bar by one baseline.
          : 'pt-major pb-minor-2 lg:ml-(--admin-nav-width) lg:pt-minor-2'}`}
      >
        {children}
      </Content>
    </div>
  );
}
