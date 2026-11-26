'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { StorySummary } from '@rcweston/story-core';
import {
  siteDataPaths,
  type PageVisibility,
  type ResourceVisibility,
  type SeoDefaults,
  type SeoFallbacks,
  type SeoOverrideRecord,
  type SeoPageOverride,
  type SeoState,
} from '@rcweston/site-data/client';
import {
  ALL_SAVED,
  KeptEditsNotice,
  SaveStatus,
  deleteWithUndo,
  recordKey,
  useHiddenKeys,
  useKeptEdits,
  useLeaveGuard,
  useSaveShortcut,
  useSaveStatus,
} from '@rcweston/save-kit';
import { AdminSelect } from '../../menu/index.js';
import { SeoOverrideFields, type SeoOverride, type SeoOverrideSource } from '../../components/SeoOverrideFields.js';
import { adminRead, adminRequest } from '../../request.js';
import { useAdminConfig } from '../../config.js';

// ── Types ───────────────────────────────────────────────────

interface SeoDefaultsForm {
  title_template: string;
  default_title: string;
  description: string;
  og_image: string;
  keywords: string;
  site_name: string;
  twitter_handle: string;
}

interface OverrideForm {
  page_path: string;
  title: string;
  description: string;
  og_image: string;
  keywords: string;
  robots_index: boolean;
  robots_follow: boolean;
}

interface BlogPostItem {
  slug: string;
  title: string;
  published: boolean;
}

interface WorkProjectItem {
  slug: string;
  title: string;
  draft: boolean;
}

const EMPTY_DEFAULTS: SeoDefaultsForm = {
  title_template: '',
  default_title: '',
  description: '',
  og_image: '',
  keywords: '',
  site_name: '',
  twitter_handle: '',
};

/** What's typed and not yet saved: the defaults, and an override being edited. */
interface SeoDrafts {
  defaults: SeoDefaultsForm;
  override: OverrideForm | null;
}

const isSeoDrafts = (value: unknown): value is SeoDrafts =>
  Boolean(value && typeof value === 'object' && 'defaults' in value && typeof (value as SeoDrafts).defaults?.title_template === 'string');

const keywordList = (text: string) => (text ? text.split(',').map((k) => k.trim()).filter(Boolean) : null);

const EMPTY_OVERRIDE: OverrideForm = {
  page_path: '',
  title: '',
  description: '',
  og_image: '',
  keywords: '',
  robots_index: true,
  robots_follow: true,
};

const defaultsForm = (defaults: SeoDefaults): SeoDefaultsForm => ({
  title_template: defaults.titleTemplate || '',
  default_title: defaults.defaultTitle || '',
  description: defaults.description || '',
  og_image: defaults.ogImage || '',
  keywords: (defaults.keywords || []).join(', '),
  site_name: defaults.siteName || '',
  twitter_handle: defaults.twitterHandle || '',
});

const overrideBody = (form: Pick<OverrideForm, 'title' | 'description' | 'og_image' | 'keywords' | 'robots_index' | 'robots_follow'>): SeoPageOverride => ({
  title: form.title || null,
  description: form.description || null,
  ogImage: form.og_image || null,
  keywords: keywordList(form.keywords),
  robotsIndex: form.robots_index,
  robotsFollow: form.robots_follow,
});

export interface SeoScreenProps {
  /** Where a story is read on the site. Default `/stories/<slug>`. */
  storyPath?: (slug: string) => string;
  /**
   * Posts, when the host has a blog: `GET` answering `[{ slug, title, published }]`.
   * Default `${siteApi}/blog`; the section stays away when that isn't there.
   */
  postsUrl?: string | null;
  /** Where a post is read on the site. Default `/blog/<slug>`. */
  postPath?: (slug: string) => string;
}

// ── Component ───────────────────────────────────────────────

/** Site-wide search and sharing defaults, static page overrides, and each post's and story's override. */
export function SeoScreen({ storyPath = (slug) => `/stories/${slug}`, postsUrl, postPath = (slug) => `/blog/${slug}` }: SeoScreenProps = {}) {
  const config = useAdminConfig();
  const seoUrl = `${config.siteApi}${siteDataPaths.seo()}`;
  const overridesUrl = `${config.siteApi}${siteDataPaths.seoOverrides()}`;
  const blogUrl = postsUrl === undefined ? `${config.siteApi}/blog` : postsUrl;

  const [defaults, setDefaults] = useState<SeoDefaultsForm>(EMPTY_DEFAULTS);
  const [savedDefaults, setSavedDefaults] = useState<SeoDefaultsForm>(EMPTY_DEFAULTS);
  const [defaultsVersion, setDefaultsVersion] = useState(0);
  const [fallbacks, setFallbacks] = useState<SeoFallbacks | null>(null);
  const [overrides, setOverrides] = useState<SeoOverrideRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [knownRoutes, setKnownRoutes] = useState<string[]>(['/']);

  // Override editing
  const [editingOverride, setEditingOverride] = useState<OverrideForm | null>(null);
  const [overrideBase, setOverrideBase] = useState<OverrideForm | null>(null);
  const [isNewOverride, setIsNewOverride] = useState(false);
  const [useCustomPath, setUseCustomPath] = useState(false);

  // Two forms, each with its status beside its button; one leave guard,
  // one ⌘S and one set of kept edits for the page.
  const defaultsStatus = useSaveStatus();
  const overrideStatus = useSaveStatus();
  const hidden = useHiddenKeys();
  const defaultsDirty = !loading && JSON.stringify(defaults) !== JSON.stringify(savedDefaults);
  const overrideDirty = editingOverride !== null && JSON.stringify(editingOverride) !== JSON.stringify(overrideBase);
  const savingDefaults = defaultsStatus.pending.length > 0;
  const savingOverride = overrideStatus.pending.length > 0;
  const kept = useKeptEdits<SeoDrafts>({
    storageKey: 'admin:unsaved:seo',
    ready: !loading && !error,
    value: { defaults, override: overrideDirty ? editingOverride : null },
    saved: { defaults: savedDefaults, override: null },
    dirty: defaultsDirty || overrideDirty,
    accept: isSeoDrafts,
  });
  useLeaveGuard(defaultsDirty || overrideDirty || savingDefaults || savingOverride);

  // Dynamic page lists; null means the host has no such list.
  const [blogPosts, setBlogPosts] = useState<BlogPostItem[] | null>(null);
  const [workProjects, setWorkProjects] = useState<WorkProjectItem[]>([]);
  const [expandedPath, setExpandedPath] = useState<string | null>(null);

  // Each override's version, for the per-page fields below: they save
  // through this screen's routes and need the version they last saw.
  const versions = useRef(new Map<string, number>());
  const applyOverrides = useCallback((list: SeoOverrideRecord[]) => {
    versions.current = new Map(list.map((o) => [o.path, o.version]));
    setOverrides(list);
  }, []);

  // State is only set once the requests settle, so the mount effect can call
  // this directly; there's no error to clear on mount.
  const loadSeoConfig = useCallback(() =>
    Promise.all([
      fetch(seoUrl, { credentials: 'same-origin' }),
      blogUrl ? fetch(blogUrl, { credentials: 'same-origin' }).catch(() => null) : Promise.resolve(null),
      adminRead<{ stories?: StorySummary[] }>(`${config.storyApi}/stories`, { stories: [] }),
      adminRead<{ pages?: PageVisibility[] }>(`${config.siteApi}${siteDataPaths.pages()}`, { pages: [] }),
      adminRead<{ resources?: ResourceVisibility[] }>(`${config.siteApi}${siteDataPaths.resources()}`, { resources: [] }),
    ])
      .then(async ([seoRes, blogRes, stories, pages, resources]) => {
        if (!seoRes.ok) {
          const data = await seoRes.json().catch(() => ({}));
          setError(data.error || 'Failed to fetch');
          return;
        }

        const seoData: SeoState = await seoRes.json();
        const loaded = defaultsForm(seoData.defaults);
        setDefaults(loaded);
        setSavedDefaults(loaded);
        setDefaultsVersion(seoData.version);
        setFallbacks(seoData.fallbacks ?? null);
        applyOverrides(seoData.overrides || []);

        const routes = ['/', ...(pages.pages ?? []).map((p) => p.path), ...(resources.resources ?? []).map((r) => r.path)];
        setKnownRoutes([...new Set(routes)]);

        if (blogRes?.ok) {
          const posts = await blogRes.json().catch(() => null);
          const list = Array.isArray(posts) ? posts : Array.isArray(posts?.posts) ? posts.posts : null;
          setBlogPosts(list ? list.map((p: BlogPostItem) => ({ slug: p.slug, title: p.title, published: p.published })) : null);
        } else {
          setBlogPosts(null);
        }

        setWorkProjects(
          (stories.stories ?? []).map((s) => ({
            slug: s.slug,
            title: s.company ? `${s.title} — ${s.company}` : s.title,
            draft: s.publishedDocumentId === null,
          }))
        );
      })
      .catch(() => setError('Failed to fetch SEO config'))
      .finally(() => setLoading(false)), [seoUrl, blogUrl, config.storyApi, config.siteApi, applyOverrides]);

  // Retry and reloads after a save or delete start from a clean slate.
  const fetchSeoConfig = () => {
    setError(null);
    return loadSeoConfig();
  };

  useEffect(() => {
    void loadSeoConfig();
  }, [loadSeoConfig]);

  const overridePaths = new Set(overrides.map((o) => o.path));

  // After an override changes, only the list reloads: the defaults form may
  // hold edits of its own.
  const refreshOverrides = () =>
    adminRequest<SeoState>(seoUrl)
      .then((data) => applyOverrides(data.overrides || []))
      .catch(() => overrideStatus.fail('Saved, but the list couldn’t refresh. Reload the page to see it.', 'refresh'));

  const handleSaveDefaults = async () => {
    const submitted = defaults;
    const payload: SeoDefaults = {
      titleTemplate: submitted.title_template || null,
      defaultTitle: submitted.default_title || null,
      description: submitted.description || null,
      ogImage: submitted.og_image || null,
      keywords: keywordList(submitted.keywords),
      siteName: submitted.site_name || null,
      twitterHandle: submitted.twitter_handle || null,
    };
    const result = await defaultsStatus.run(() => adminRequest<{ defaults: SeoDefaults; version: number }>(seoUrl, {
      method: 'PUT',
      body: JSON.stringify({ defaults: payload, expectedVersion: defaultsVersion }),
    }), {
      onSaved: (saved) => {
        // The server tidies what it stores (an @ on the handle), so the form shows that.
        const stored = defaultsForm(saved.defaults);
        setDefaults(stored);
        setSavedDefaults(stored);
        setDefaultsVersion(saved.version);
      },
    });
    // Saved somewhere else since this page loaded (a 409), or not at all:
    // what's typed stays, and the comparison moves to what's saved now.
    if (!result.ok) {
      void adminRead<SeoState | null>(seoUrl, null).then((data) => {
        if (!data) return;
        setSavedDefaults(defaultsForm(data.defaults));
        setDefaultsVersion(data.version);
      });
    }
  };

  const openOverride = (form: OverrideForm, isNew: boolean) => {
    setIsNewOverride(isNew);
    setUseCustomPath(false);
    setEditingOverride(form);
    setOverrideBase(form);
    overrideStatus.clear();
  };

  const handleEditOverride = (override: SeoOverrideRecord) => openOverride({
    page_path: override.path,
    title: override.title || '',
    description: override.description || '',
    og_image: override.ogImage || '',
    keywords: (override.keywords || []).join(', '),
    robots_index: override.robotsIndex ?? true,
    robots_follow: override.robotsFollow ?? true,
  }, false);

  const handleNewOverride = () => openOverride({ ...EMPTY_OVERRIDE }, true);

  const closeOverride = () => {
    setEditingOverride(null);
    setOverrideBase(null);
  };

  const handleSaveOverride = async () => {
    if (!editingOverride?.page_path) {
      overrideStatus.fail('Choose the page this override is for.');
      return;
    }
    const path = editingOverride.page_path;
    const result = await overrideStatus.run(() => adminRequest(overridesUrl, {
      method: 'PUT',
      body: JSON.stringify({ path, override: overrideBody(editingOverride), expectedVersion: versions.current.get(path) ?? 0 }),
    }), {
      success: `Saved the override for ${path}`,
      onSaved: () => {
        closeOverride();
        void refreshOverrides();
      },
    });
    // Changed somewhere else first: the list shows what's there now, the form keeps what's typed.
    if (!result.ok) void adminRead<SeoState | null>(seoUrl, null).then((data) => data && applyOverrides(data.overrides || []));
  };

  const handleDeleteOverride = (pagePath: string) => {
    const expectedVersion = versions.current.get(pagePath);
    deleteWithUndo({
      key: recordKey('seo', pagePath),
      label: `Override for ${pagePath} removed`,
      send: ({ keepalive }) => adminRequest(overridesUrl, {
        method: 'DELETE',
        body: JSON.stringify({ path: pagePath, expectedVersion }),
        keepalive,
      }),
      onDone: () => void refreshOverrides(),
    });
  };

  // The per-page fields under each post and story save through the same
  // routes, with the version this screen last saw.
  const source = useMemo<SeoOverrideSource>(() => ({
    load: async (pagePath) => {
      const state = await adminRequest<SeoState>(seoUrl);
      const match = state.overrides.find((o) => o.path === pagePath) ?? null;
      if (!match) {
        versions.current.delete(pagePath);
        return null;
      }
      versions.current.set(pagePath, match.version);
      return { ...match, robotsIndex: match.robotsIndex ?? true, robotsFollow: match.robotsFollow ?? true };
    },
    save: async (pagePath, value: SeoOverride) => {
      const saved = await adminRequest<{ override: SeoOverrideRecord }>(overridesUrl, {
        method: 'PUT',
        body: JSON.stringify({ path: pagePath, override: value, expectedVersion: versions.current.get(pagePath) ?? 0 }),
      });
      versions.current.set(pagePath, saved.override.version);
      return saved;
    },
    remove: async (pagePath, { keepalive }) => {
      const done = await adminRequest(overridesUrl, {
        method: 'DELETE',
        body: JSON.stringify({ path: pagePath, expectedVersion: versions.current.get(pagePath) }),
        keepalive,
      });
      versions.current.delete(pagePath);
      return done;
    },
  }), [seoUrl, overridesUrl]);

  useSaveShortcut(() => {
    if (savingDefaults || savingOverride) return;
    if (defaultsDirty) void handleSaveDefaults();
    if (overrideDirty) void handleSaveOverride();
    if (!defaultsDirty && !overrideDirty) defaultsStatus.note(ALL_SAVED);
  });

  const restore = () => {
    const value = kept.offer?.value;
    kept.restore();
    if (!value) return;
    setDefaults(value.defaults);
    if (value.override) {
      setIsNewOverride(!overrides.some((o) => o.path === value.override?.page_path));
      setEditingOverride(value.override);
      setOverrideBase({ ...EMPTY_OVERRIDE, page_path: value.override.page_path });
    }
  };

  const toggleExpanded = (path: string) => {
    setExpandedPath((prev) => (prev === path ? null : path));
  };

  // ── Render ──────────────────────────────────────────────

  if (loading) {
    return (
      <div className="text-center py-20 text-foreground-muted font-mono text-sm uppercase tracking-wider">
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-20">
        <p className="text-red-500 font-mono text-sm mb-4">{error}</p>
        <button
          onClick={() => void fetchSeoConfig()}
          className="px-4 py-2 rounded-md border-2 border-foreground-muted text-foreground hover:border-foreground transition-colors font-mono text-xs uppercase tracking-wider"
        >
          Retry
        </button>
      </div>
    );
  }

  const staticOverrides = overrides.filter((o) => knownRoutes.includes(o.path) && !hidden.has(recordKey('seo', o.path)));
  const name = fallbacks?.siteName || 'Your name';

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-12 pb-6 border-b-2 border-foreground-muted/30">
        <h1 className="font-mono text-3xl md:text-4xl font-bold text-foreground uppercase tracking-wide">
          SEO
        </h1>
        <p className="mt-2 text-sm text-foreground/80 font-medium">
          Manage site-wide SEO defaults and per-page overrides
        </p>
      </div>

      {kept.offer && <KeptEditsNotice offer={kept.offer} onRestore={restore} onDiscard={kept.discard} className="mb-minor" />}

      {/* ─── Section 1: Site Defaults ─── */}
      <section className="mb-16">
        <h2 className="font-mono text-lg font-bold text-foreground uppercase tracking-wide mb-6">
          Site Defaults
        </h2>

        <div className="space-y-4">
          <Field
            label="Title Template"
            placeholder={fallbacks?.titleTemplate || `%s | ${name}`}
            value={defaults.title_template}
            onChange={(v) => setDefaults((d) => ({ ...d, title_template: v }))}
          />
          <Field
            label="Default Title"
            placeholder={fallbacks?.defaultTitle || name}
            value={defaults.default_title}
            onChange={(v) => setDefaults((d) => ({ ...d, default_title: v }))}
          />
          <Field
            label="Description"
            placeholder={fallbacks?.description || 'Site description...'}
            value={defaults.description}
            onChange={(v) => setDefaults((d) => ({ ...d, description: v }))}
            textarea
          />
          <Field
            label="OG Image URL"
            placeholder={fallbacks?.ogImage || 'https://...'}
            value={defaults.og_image}
            onChange={(v) => setDefaults((d) => ({ ...d, og_image: v }))}
          />
          <Field
            label="Keywords"
            placeholder={fallbacks?.keywords?.length ? fallbacks.keywords.join(', ') : 'keyword1, keyword2'}
            value={defaults.keywords}
            onChange={(v) => setDefaults((d) => ({ ...d, keywords: v }))}
          />
          <Field
            label="Site Name"
            placeholder={name}
            value={defaults.site_name}
            onChange={(v) => setDefaults((d) => ({ ...d, site_name: v }))}
          />
          <Field
            label="Twitter Handle"
            placeholder={fallbacks?.twitterHandle || '@handle'}
            value={defaults.twitter_handle}
            onChange={(v) => setDefaults((d) => ({ ...d, twitter_handle: v }))}
          />

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={() => void handleSaveDefaults()}
              disabled={savingDefaults}
              aria-keyshortcuts="Meta+S Control+S"
              className="px-4 py-2 rounded bg-foreground text-background font-mono text-xs uppercase tracking-wider font-semibold hover:opacity-80 transition-opacity disabled:opacity-50"
            >
              Save Defaults
            </button>
            <SaveStatus status={defaultsStatus} dirty={defaultsDirty} />
          </div>
        </div>
      </section>

      {/* ─── Section 2: Static Pages ─── */}
      <section className="mb-16">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-mono text-lg font-bold text-foreground uppercase tracking-wide">
            Static Pages ({staticOverrides.length})
          </h2>
          <button
            onClick={handleNewOverride}
            className="px-4 py-2 rounded bg-foreground text-background font-mono text-xs uppercase tracking-wider font-semibold hover:opacity-80 transition-opacity"
          >
            Add Override
          </button>
        </div>

        {/* Once the form closes, its last word stays here. */}
        {!editingOverride && <SaveStatus status={overrideStatus} className="mb-minor" />}

        {/* Override Form (inline) */}
        {editingOverride && (
          <div
            className="enter-rise mb-8 p-6 rounded-md bg-card-bg border border-foreground-muted/20"
            style={{ ['--enter-y' as string]: '-10px' }}
          >
            <h3 className="font-mono text-sm font-bold text-foreground uppercase tracking-wider mb-4">
              {isNewOverride ? 'New Override' : `Edit: ${editingOverride.page_path}`}
            </h3>

            <div className="space-y-4">
              {isNewOverride && (
                <div>
                  <label htmlFor="seo-page-path" className="block font-mono text-xs uppercase tracking-wider text-foreground-muted mb-1.5">
                    Page Path
                  </label>
                  {!useCustomPath ? (
                    <div className="flex items-center gap-2">
                      <AdminSelect
                        id="seo-page-path"
                        value={editingOverride.page_path}
                        onChange={(e) => {
                          if (e.target.value === '__custom__') {
                            setUseCustomPath(true);
                            setEditingOverride((f) => f && ({ ...f, page_path: '' }));
                          } else {
                            setEditingOverride((f) => f && ({ ...f, page_path: e.target.value }));
                          }
                        }}
                        className="font-mono text-xs"
                      >
                        <option value="">Select a page...</option>
                        {knownRoutes.filter(
                          (r) => !overrides.some((o) => o.path === r)
                        ).map((route) => (
                          <option key={route} value={route}>
                            {route}
                          </option>
                        ))}
                        <option value="__custom__">Custom path...</option>
                      </AdminSelect>
                    </div>
                  ) : (
                    <input
                      id="seo-page-path"
                      type="text"
                      value={editingOverride.page_path}
                      onChange={(e) =>
                        setEditingOverride((f) => f && ({ ...f, page_path: e.target.value }))
                      }
                      placeholder={storyPath('my-story')}
                      className="w-full px-3 py-2 rounded bg-background border border-foreground-muted/30 text-foreground font-mono text-xs focus:outline-none focus:border-foreground-muted"
                    />
                  )}
                </div>
              )}

              <Field
                label="Title"
                placeholder="Page title (leave blank to inherit)"
                value={editingOverride.title}
                onChange={(v) => setEditingOverride((f) => f && ({ ...f, title: v }))}
              />
              <Field
                label="Description"
                placeholder="Page description..."
                value={editingOverride.description}
                onChange={(v) => setEditingOverride((f) => f && ({ ...f, description: v }))}
                textarea
              />
              <Field
                label="OG Image URL"
                placeholder="https://..."
                value={editingOverride.og_image}
                onChange={(v) => setEditingOverride((f) => f && ({ ...f, og_image: v }))}
              />
              <Field
                label="Keywords"
                placeholder="keyword1, keyword2"
                value={editingOverride.keywords}
                onChange={(v) => setEditingOverride((f) => f && ({ ...f, keywords: v }))}
              />

              <div className="flex items-center gap-6">
                <label htmlFor="seo-override-robots-index" className="flex items-center gap-2 cursor-pointer">
                  <input
                    id="seo-override-robots-index"
                    type="checkbox"
                    checked={editingOverride.robots_index}
                    onChange={(e) =>
                      setEditingOverride((f) => f && ({ ...f, robots_index: e.target.checked }))
                    }
                    className="rounded"
                  />
                  <span className="font-mono text-xs text-foreground">Index</span>
                </label>
                <label htmlFor="seo-override-robots-follow" className="flex items-center gap-2 cursor-pointer">
                  <input
                    id="seo-override-robots-follow"
                    type="checkbox"
                    checked={editingOverride.robots_follow}
                    onChange={(e) =>
                      setEditingOverride((f) => f && ({ ...f, robots_follow: e.target.checked }))
                    }
                    className="rounded"
                  />
                  <span className="font-mono text-xs text-foreground">Follow</span>
                </label>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={() => void handleSaveOverride()}
                  disabled={savingOverride || !editingOverride.page_path}
                  className="px-4 py-2 rounded bg-foreground text-background font-mono text-xs uppercase tracking-wider font-semibold hover:opacity-80 transition-opacity disabled:opacity-50"
                >
                  Save Override
                </button>
                <button
                  onClick={closeOverride}
                  className="px-4 py-2 rounded border border-foreground-muted/30 text-foreground-muted hover:text-foreground font-mono text-xs uppercase tracking-wider transition-colors"
                >
                  Cancel
                </button>
                <SaveStatus status={overrideStatus} dirty={overrideDirty} />
              </div>
            </div>
          </div>
        )}

        {/* Overrides Table */}
        {staticOverrides.length > 0 ? (
          <div className="space-y-3">
            {/* Table header */}
            <div className="grid grid-cols-[1fr_1fr_80px_80px_100px] gap-4 px-4 pb-2 border-b border-foreground-muted/20">
              <span className="font-mono text-xs uppercase tracking-wider text-foreground-muted">
                Path
              </span>
              <span className="font-mono text-xs uppercase tracking-wider text-foreground-muted">
                Title
              </span>
              <span className="font-mono text-xs uppercase tracking-wider text-foreground-muted">
                Index
              </span>
              <span className="font-mono text-xs uppercase tracking-wider text-foreground-muted">
                Follow
              </span>
              <span />
            </div>

            {staticOverrides.map((override, index) => (
              <div
                key={override.path}
                className="enter-rise grid grid-cols-[1fr_1fr_80px_80px_100px] gap-4 items-center px-4 py-3 rounded-md bg-card-bg border border-foreground-muted/20"
                style={{ ['--enter-y' as string]: '10px', animationDuration: '0.3s', animationDelay: `${index * 0.05}s` }}
              >
                <span className="font-mono text-sm font-semibold text-foreground truncate">
                  {override.path}
                </span>
                <span className="font-mono text-xs text-foreground-muted truncate">
                  {override.title || '--'}
                </span>
                <span className="font-mono text-xs text-foreground-muted">
                  {override.robotsIndex === false ? 'No' : 'Yes'}
                </span>
                <span className="font-mono text-xs text-foreground-muted">
                  {override.robotsFollow === false ? 'No' : 'Yes'}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleEditOverride(override)}
                    className="px-2 py-1 rounded border border-foreground-muted/30 text-foreground-muted hover:text-foreground font-mono text-xs uppercase tracking-wider transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeleteOverride(override.path)}
                    className="px-2 py-1 rounded border border-red-500/30 text-red-500/70 hover:text-red-500 font-mono text-xs uppercase tracking-wider transition-colors"
                  >
                    Del
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-foreground-muted font-mono text-sm uppercase tracking-wider">
            No static page overrides configured
          </div>
        )}
      </section>

      {/* ─── Section 3: Posts, when the host has them ─── */}
      {blogPosts && (
        <section className="mb-16">
          <h2 className="font-mono text-lg font-bold text-foreground uppercase tracking-wide mb-6">
            Posts ({blogPosts.length})
          </h2>

          {blogPosts.length > 0 ? (
            <div className="space-y-2">
              {blogPosts.map((post) => (
                <PageRow
                  key={post.slug}
                  title={post.title}
                  path={postPath(post.slug)}
                  hasOverride={overridePaths.has(postPath(post.slug))}
                  expanded={expandedPath === postPath(post.slug)}
                  onToggle={toggleExpanded}
                  source={source}
                  onSaveComplete={() => void fetchSeoConfig()}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-foreground-muted font-mono text-sm uppercase tracking-wider">
              No blog posts found
            </div>
          )}
        </section>
      )}

      {/* ─── Section 4: Work / Case Studies ─── */}
      <section>
        <h2 className="font-mono text-lg font-bold text-foreground uppercase tracking-wide mb-6">
          Work / Case Studies ({workProjects.length})
        </h2>

        {workProjects.length > 0 ? (
          <div className="space-y-2">
            {workProjects.map((project) => (
              <PageRow
                key={project.slug}
                title={project.title}
                path={storyPath(project.slug)}
                badge={project.draft ? 'Draft' : null}
                hasOverride={overridePaths.has(storyPath(project.slug))}
                expanded={expandedPath === storyPath(project.slug)}
                onToggle={toggleExpanded}
                source={source}
                onSaveComplete={() => void fetchSeoConfig()}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-foreground-muted font-mono text-sm uppercase tracking-wider">
            No work projects found
          </div>
        )}
      </section>
    </div>
  );
}

// ── A post's or project's row, with its override below ──────

function PageRow({
  title,
  path,
  badge = null,
  hasOverride,
  expanded,
  onToggle,
  source,
  onSaveComplete,
}: {
  title: string;
  path: string;
  badge?: string | null;
  hasOverride: boolean;
  expanded: boolean;
  onToggle: (path: string) => void;
  source: SeoOverrideSource;
  onSaveComplete: () => void;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={() => onToggle(path)}
        aria-expanded={expanded}
        className="w-full flex items-center justify-between px-4 py-3 rounded-md bg-card-bg border border-foreground-muted/20 hover:border-foreground-muted/40 transition-colors text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-mono text-sm font-semibold text-foreground truncate">
            {title}
          </span>
          <span className="font-mono text-xs text-foreground-muted shrink-0">
            {path}
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {badge && (
            <span className="px-2 py-0.5 rounded-full font-mono text-xs uppercase tracking-wider bg-orange-500/10 text-orange-700">
              {badge}
            </span>
          )}
          <span
            className={`px-2 py-0.5 rounded-full font-mono text-xs uppercase tracking-wider ${
              hasOverride
                ? 'bg-green-500/10 text-green-500'
                : 'bg-foreground-muted/10 text-foreground-muted'
            }`}
          >
            {hasOverride ? 'SEO Override' : 'Content Defaults'}
          </span>
          <svg
            className={`w-4 h-4 text-foreground-muted transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      {expanded && (
        <div className="sa-content-in overflow-hidden">
          <div className="px-4 py-5 ml-4 mt-1 border-l-2 border-foreground-muted/20">
            <SeoOverrideFields
              pagePath={path}
              source={source}
              fallbacks={{ title }}
              onSaveComplete={onSaveComplete}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Reusable Field ──────────────────────────────────────────

function Field({
  label,
  placeholder,
  value,
  onChange,
  textarea,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  textarea?: boolean;
}) {
  const fieldId = `seo-field-${label.toLowerCase().replace(/\s+/g, '-')}`;
  const inputClasses =
    'w-full px-3 py-2 rounded bg-background border border-foreground-muted/30 text-foreground font-mono text-xs focus:outline-none focus:border-foreground-muted';
  return (
    <div>
      <label htmlFor={fieldId} className="block font-mono text-xs uppercase tracking-wider text-foreground-muted mb-1.5">
        {label}
      </label>
      {textarea ? (
        <textarea
          id={fieldId}
          rows={3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={inputClasses + ' resize-y'}
        />
      ) : (
        <input
          id={fieldId}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={inputClasses}
        />
      )}
    </div>
  );
}
