'use client';

import { useCallback, useEffect, useState } from 'react';
import { KeptEditsNotice, SaveStatus, deleteWithUndo, recordKey, useFormSave } from '@rcweston/save-kit';

/** One page's search and sharing override. */
export interface SeoOverride {
  title: string | null;
  description: string | null;
  ogImage: string | null;
  keywords: string[] | null;
  robotsIndex: boolean;
  robotsFollow: boolean;
}

/**
 * Where overrides live: a later SEO module's handlers, or a fixture. `load`
 * answers null when the page has none.
 */
export interface SeoOverrideSource {
  load(pagePath: string): Promise<SeoOverride | null>;
  save(pagePath: string, value: SeoOverride): Promise<unknown>;
  remove(pagePath: string, options: { keepalive: boolean }): Promise<unknown>;
}

interface SeoOverrideFieldsProps {
  pagePath: string;
  source: SeoOverrideSource;
  fallbacks?: { title?: string; description?: string; ogImage?: string };
  onSaveComplete?: () => void;
}

interface OverrideData {
  title: string;
  description: string;
  og_image: string;
  keywords: string;
  robots_index: boolean;
  robots_follow: boolean;
}

const EMPTY: OverrideData = {
  title: '',
  description: '',
  og_image: '',
  keywords: '',
  robots_index: true,
  robots_follow: true,
};

const isOverrideData = (value: unknown): value is OverrideData =>
  Boolean(value && typeof value === 'object' && typeof (value as OverrideData).title === 'string' && typeof (value as OverrideData).robots_index === 'boolean');

/** A page's SEO override inside the editor it sits in (a post, a project): ⌘S there saves both. */
export function SeoOverrideFields({ pagePath, source, fallbacks, onSaveComplete }: SeoOverrideFieldsProps) {
  const [form, setForm] = useState<OverrideData>(EMPTY);
  const [saved, setSaved] = useState<OverrideData>(EMPTY);
  const [hasExisting, setHasExisting] = useState(false);
  const [loading, setLoading] = useState(true);
  const { dirty, status, kept } = useFormSave({
    storageKey: `admin:unsaved:seo:${pagePath}`,
    ready: !loading,
    value: form,
    saved,
    accept: isOverrideData,
    onSave: () => void handleSave(),
  });
  const saving = status.pending.length > 0;

  // State is only set once the request settles, never synchronously inside
  // the effect below.
  const fetchOverride = useCallback(
    () =>
      source.load(pagePath)
        .then((match) => {
          const loaded = match
            ? {
              title: match.title || '',
              description: match.description || '',
              og_image: match.ogImage || '',
              keywords: (match.keywords || []).join(', '),
              robots_index: match.robotsIndex ?? true,
              robots_follow: match.robotsFollow ?? true,
            }
            : EMPTY;
          setForm(loaded);
          setSaved(loaded);
          setHasExisting(Boolean(match));
        })
        .catch(() => {
          // Shown as empty; saving still works.
        })
        .finally(() => setLoading(false)),
    [pagePath, source]
  );

  useEffect(() => {
    void fetchOverride();
  }, [fetchOverride]);

  const handleSave = async () => {
    const submitted = form;
    const payload: SeoOverride = {
      title: submitted.title || null,
      description: submitted.description || null,
      ogImage: submitted.og_image || null,
      keywords: submitted.keywords
        ? submitted.keywords.split(',').map((k) => k.trim()).filter(Boolean)
        : null,
      robotsIndex: submitted.robots_index,
      robotsFollow: submitted.robots_follow,
    };
    await status.run(() => source.save(pagePath, payload), {
      success: 'SEO saved',
      onSaved: () => {
        setSaved(submitted);
        setHasExisting(true);
        onSaveComplete?.();
      },
    });
  };

  /** Gone at once, with Undo; the removal is sent when the toast goes. */
  const handleRemove = () => {
    const before = { form, saved };
    setForm(EMPTY);
    setSaved(EMPTY);
    setHasExisting(false);
    deleteWithUndo({
      key: recordKey('seo', pagePath),
      label: 'SEO override removed',
      send: ({ keepalive }) => source.remove(pagePath, { keepalive }),
      onUndo: () => {
        setForm(before.form);
        setSaved(before.saved);
        setHasExisting(true);
      },
      onDone: () => onSaveComplete?.(),
    });
  };

  const restore = () => {
    const value = kept.offer?.value;
    kept.restore();
    if (value) setForm(value);
  };

  if (loading) {
    return (
      <div className="py-4 text-foreground-muted font-mono text-xs uppercase tracking-wider">
        Loading SEO data...
      </div>
    );
  }

  const inputClasses =
    'w-full px-3 py-2 rounded bg-background border border-foreground-muted/30 text-foreground font-mono text-xs focus:outline-none focus:border-foreground-muted';

  return (
    <div className="space-y-4">
      {kept.offer && <KeptEditsNotice offer={kept.offer} onRestore={restore} onDiscard={kept.discard} />}

      {/* Meta Title */}
      <div>
        <label htmlFor={`seo-meta-title-${pagePath}`} className="block font-mono text-xs uppercase tracking-wider text-foreground-muted mb-1.5">
          Meta Title
        </label>
        <input
          id={`seo-meta-title-${pagePath}`}
          type="text"
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          placeholder={fallbacks?.title || 'Page title (leave blank to inherit)'}
          className={inputClasses}
        />
      </div>

      {/* Meta Description */}
      <div>
        <label htmlFor={`seo-meta-description-${pagePath}`} className="block font-mono text-xs uppercase tracking-wider text-foreground-muted mb-1.5">
          Meta Description
        </label>
        <textarea
          id={`seo-meta-description-${pagePath}`}
          rows={3}
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          placeholder={fallbacks?.description || 'Page description...'}
          className={inputClasses + ' resize-y'}
        />
      </div>

      {/* OG Image URL */}
      <div>
        <label htmlFor={`seo-og-image-${pagePath}`} className="block font-mono text-xs uppercase tracking-wider text-foreground-muted mb-1.5">
          OG Image URL
        </label>
        <input
          id={`seo-og-image-${pagePath}`}
          type="text"
          value={form.og_image}
          onChange={(e) => setForm((f) => ({ ...f, og_image: e.target.value }))}
          placeholder={fallbacks?.ogImage || 'https://...'}
          className={inputClasses}
        />
      </div>

      {/* Keywords */}
      <div>
        <label htmlFor={`seo-keywords-${pagePath}`} className="block font-mono text-xs uppercase tracking-wider text-foreground-muted mb-1.5">
          Keywords
        </label>
        <input
          id={`seo-keywords-${pagePath}`}
          type="text"
          value={form.keywords}
          onChange={(e) => setForm((f) => ({ ...f, keywords: e.target.value }))}
          placeholder="keyword1, keyword2"
          className={inputClasses}
        />
      </div>

      {/* Robots */}
      <div className="flex items-center gap-6">
        <label htmlFor={`seo-robots-index-${pagePath}`} className="flex items-center gap-2 cursor-pointer">
          <input
            id={`seo-robots-index-${pagePath}`}
            type="checkbox"
            checked={form.robots_index}
            onChange={(e) => setForm((f) => ({ ...f, robots_index: e.target.checked }))}
            className="rounded"
          />
          <span className="font-mono text-xs text-foreground">Index</span>
        </label>
        <label htmlFor={`seo-robots-follow-${pagePath}`} className="flex items-center gap-2 cursor-pointer">
          <input
            id={`seo-robots-follow-${pagePath}`}
            type="checkbox"
            checked={form.robots_follow}
            onChange={(e) => setForm((f) => ({ ...f, robots_follow: e.target.checked }))}
            className="rounded"
          />
          <span className="font-mono text-xs text-foreground">Follow</span>
        </label>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="px-4 py-2 rounded bg-foreground text-background font-mono text-xs uppercase tracking-wider font-semibold hover:opacity-80 transition-opacity disabled:opacity-50"
        >
          Save SEO
        </button>
        {hasExisting && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={saving}
            className="px-4 py-2 rounded border border-status-error-text/30 text-status-error-text hover:underline font-mono text-xs uppercase tracking-wider transition-colors disabled:opacity-50"
          >
            Remove Override
          </button>
        )}
        <SaveStatus status={status} dirty={dirty} />
      </div>
    </div>
  );
}
