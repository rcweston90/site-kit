'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { SaveStatus, explainFailure, useListSave } from '@rcweston/save-kit';
import { siteDataPaths, type PageVisibility as PageVisibilityRow } from '@rcweston/site-data/client';
import { AdminPage, AdminPageHeader } from '../primitives/index.js';
import { AdminLink as Link } from '../router.js';
import { adminPath, useAdminConfig, useAdminModules } from '../config.js';
import { adminRead, adminRequest } from '../request.js';
import type { AdminContextForModule } from '../modules/define.js';

export { SiteResourceVisibilitySettings } from './SiteResourceVisibilitySettings.js';

const byOrder = <T extends { order?: number }>(items: T[]) =>
  items.map((item, index) => ({ item, index })).sort((a, b) => (a.item.order ?? 1000) - (b.item.order ?? 1000) || a.index - b.index).map(({ item }) => item);

/**
 * The dashboard: a count for each module that has one, its quick actions, then
 * each module's own sections (page visibility and site resources, from the
 * site-resources module).
 */
export function Dashboard() {
  const config = useAdminConfig();
  const modules = useAdminModules();
  const stats = useMemo(() => byOrder(modules.flatMap((module) => [...(module.stats ?? [])])), [modules]);
  const quickActions = useMemo(() => byOrder(modules.flatMap((module) => [...(module.quickActions ?? [])])), [modules]);
  const sections = useMemo(() => byOrder(modules.flatMap((module) => [...(module.dashboard ?? [])])), [modules]);
  const [counts, setCounts] = useState<number[] | null>(null);

  useEffect(() => {
    let current = true;
    const context: AdminContextForModule = { config, read: (url) => adminRead(url, null) };
    void Promise.all(stats.map((stat) => stat.count(context).catch(() => 0))).then((values) => {
      if (current) setCounts(values);
    });
    return () => {
      current = false;
    };
  }, [stats, config]);

  return (
    <AdminPage>
      <AdminPageHeader title="Dashboard" />

      {stats.length > 0 && (
        <div className="mb-12">
          <h2 className="font-mono text-lg font-bold text-foreground uppercase tracking-wide mb-4">Content</h2>
          {!counts ? (
            <div role="status" className="text-foreground-muted font-mono text-sm uppercase tracking-wider">Loading...</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {stats.map((card, index) => (
                <div key={card.label} className="enter-rise [--enter-y:10px] [animation-duration:0.3s]" style={{ animationDelay: `${index * 0.05}s` }}>
                  <Link
                    href={adminPath(config, card.path)}
                    className="block p-4 rounded-md bg-card-bg border border-foreground-muted/20 hover:border-foreground-muted/40 transition-colors"
                  >
                    <div className="font-mono text-2xl font-bold text-foreground">{counts[index]}</div>
                    <div className="font-mono text-xs uppercase tracking-wider text-foreground-muted mt-1">{card.label}</div>
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {quickActions.length > 0 && (
        <div>
          <h2 className="font-mono text-lg font-bold text-foreground uppercase tracking-wide mb-4">Quick Actions</h2>
          <div className="flex flex-wrap gap-3">
            {quickActions.map((action, index) => (
              <div key={action.label} className="enter-rise [--enter-y:10px] [animation-duration:0.3s]" style={{ animationDelay: `${index * 0.05}s` }}>
                <Link
                  href={adminPath(config, action.path)}
                  className="inline-flex items-center px-4 py-2.5 rounded-md border border-foreground-muted/30 text-foreground hover:border-foreground-muted hover:bg-foreground/[0.03] transition-colors font-mono text-xs uppercase tracking-wider font-semibold"
                >
                  {action.label} +
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {sections.map(({ id, Component }) => <Component key={id} />)}
    </AdminPage>
  );
}

/** Page visibility: hidden pages leave the nav and search results but stay reachable by URL. */
export function PageVisibilitySettings() {
  const config = useAdminConfig();
  const [navPages, setNavPages] = useState<PageVisibilityRow[]>([]);
  const [savingPath, setSavingPath] = useState<string | null>(null);
  const [problem, setProblem] = useState('');
  const url = `${config.siteApi}${siteDataPaths.pages()}`;

  useEffect(() => {
    void adminRead<{ pages?: PageVisibilityRow[] }>(url, { pages: [] }).then((data) => setNavPages(Array.isArray(data.pages) ? data.pages : []));
  }, [url]);

  const toggleNavPage = async (page: PageVisibilityRow, enabled: boolean) => {
    setSavingPath(page.path);
    setProblem('');
    // Optimistic — revert if the request fails.
    setNavPages((prev) => prev.map((p) => (p.path === page.path ? { ...p, enabled } : p)));
    try {
      const saved = await adminRequest<{ page: PageVisibilityRow }>(url, {
        method: 'POST',
        body: JSON.stringify({ path: page.path, enabled, expectedVersion: page.version }),
      });
      setNavPages((prev) => prev.map((p) => (p.path === page.path ? saved.page : p)));
    } catch (reason) {
      setNavPages((prev) => prev.map((p) => (p.path === page.path ? { ...p, enabled: !enabled } : p)));
      setProblem(explainFailure(reason));
      void adminRead<{ pages?: PageVisibilityRow[] }>(url, { pages: [] }).then((data) => { if (data.pages?.length) setNavPages(data.pages); });
    } finally {
      setSavingPath(null);
    }
  };

  if (navPages.length === 0) return null;
  return (
    <div className="mt-12">
      <h2 className="font-mono text-lg font-bold text-foreground uppercase tracking-wide mb-1">Page Visibility</h2>
      <p className="font-mono text-xs text-foreground-muted mb-4 max-w-md">Hidden pages leave the nav and search results but stay reachable by URL.</p>
      {problem && <p role="alert" className="mb-4 max-w-md text-sm leading-baseline text-status-error-text">{problem}</p>}
      <div className="flex flex-col gap-3 max-w-md">
        {navPages.map((page) => (
          <div key={page.path} className="flex items-center justify-between gap-4 p-4 rounded-md bg-card-bg border border-foreground-muted/20">
            <div>
              <div className="font-mono text-sm font-semibold text-foreground uppercase tracking-wider">{page.label}</div>
              <div className="font-mono text-xs text-foreground-muted mt-1">
                {page.path}
                {!page.enabled && <span className="ml-2 text-accent-secondary-text">· hidden</span>}
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={page.enabled}
              aria-label={`${page.label} page visible`}
              disabled={savingPath === page.path}
              onClick={() => void toggleNavPage(page, !page.enabled)}
              className={`relative flex-shrink-0 w-12 h-7 rounded-full transition-colors disabled:opacity-50 ${page.enabled ? 'bg-accent-primary' : 'bg-foreground-muted/30'}`}
            >
              <span className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white transition-transform ${page.enabled ? 'translate-x-5' : ''}`} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
