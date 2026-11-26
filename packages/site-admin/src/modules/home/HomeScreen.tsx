'use client';

import { useState, useEffect } from 'react';
import { InlineRichText } from './InlineRichText.js';
import { homePaths, type HomeAbout, type HomeAboutResponse } from '@rcweston/site-data/client';
import { HomeHeaderImages } from './HomeHeaderImages.js';
import { AutoTextarea, ListEditor, labelClass } from '../../components/CopyFields.js';
import { KeptEditsNotice, SaveBar as AdminSaveBar, deleteWithUndo, explainFailure, useFormSave } from '@rcweston/save-kit';
import { useAdminConfig } from '../../config.js';
import { adminRequest } from '../../request.js';
import { withConflict } from './conflict.js';

// ── Types ───────────────────────────────────────────────────

const EMPTY: HomeAbout = { tagline: '', bio: [], fastFacts: [] };
const isHomeAbout = (value: unknown): value is HomeAbout =>
  Boolean(value && typeof value === 'object' && typeof (value as HomeAbout).tagline === 'string' && Array.isArray((value as HomeAbout).bio) && Array.isArray((value as HomeAbout).fastFacts));

// ── Component ───────────────────────────────────────────────

/**
 * Admin → Home: the header's three images and the letter under it (tagline,
 * paragraphs, "What I do"), with a preview drawn by the same markup rules as
 * the live section. `bioHint` is the line under "Bio paragraphs".
 */
export function HomeScreen({ bioHint = 'Links: [Fieldnote Studio](https://example.com). Bold: **like this**.' }: { bioHint?: string }) {
  const config = useAdminConfig();
  const url = `${config.siteApi}${homePaths.about()}`;
  const [form, setForm] = useState<HomeAbout>(EMPTY);
  const [saved, setSaved] = useState<HomeAbout>(EMPTY);
  const [defaults, setDefaults] = useState<HomeAbout>(EMPTY);
  const [customized, setCustomized] = useState(false);
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { dirty, status, kept } = useFormSave({
    storageKey: 'admin:unsaved:home-about',
    ready: !loading && !error,
    value: form,
    saved,
    accept: isHomeAbout,
    onSave: () => void handleSave(),
  });
  const saving = status.pending.length > 0;

  useEffect(() => {
    // A second run (React's dev double-mount, or a new url) drops the first
    // answer, so a late one never overwrites what the person has typed.
    let current = true;
    const load = async () => {
      try {
        const data = await adminRequest<HomeAboutResponse>(url);
        if (!current) return;
        setForm(data.about);
        setSaved(data.about);
        setDefaults(data.defaults);
        setCustomized(data.customized);
        setVersion(data.version);
      } catch (reason) {
        if (current) setError(explainFailure(reason, 'loaded'));
      } finally {
        if (current) setLoading(false);
      }
    };
    load();
    return () => { current = false; };
  }, [url]);

  /** What's stored now, after a save met a newer one: it becomes the saved copy, the form keeps the edit. */
  const refresh = async () => {
    const data = await adminRequest<HomeAboutResponse>(url);
    setSaved(data.about);
    setCustomized(data.customized);
    setVersion(data.version);
  };

  const handleSave = async () => {
    await status.run(() => withConflict(() => adminRequest<HomeAboutResponse>(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, expectedVersion: version }),
    }), refresh), {
      success: 'Saved — the homepage is updating',
      onSaved: (value) => {
        // The API trims and drops blank entries — mirror what was stored.
        setForm(value.about);
        setSaved(value.about);
        setCustomized(true);
        setVersion(value.version);
      },
    });
  };

  /** Back to the original copy at once, with Undo; the reset is sent when
   *  the toast goes. */
  const handleReset = () => {
    const before = { form, saved, customized, version };
    setForm(defaults);
    setSaved(defaults);
    setCustomized(false);
    setVersion(0);
    deleteWithUndo({
      key: 'home-about',
      label: 'Home copy reset to the original',
      send: ({ keepalive }) => adminRequest(url, { method: 'DELETE', keepalive }),
      onUndo: () => {
        setForm(before.form);
        setSaved(before.saved);
        setCustomized(before.customized);
        setVersion(before.version);
      },
    });
  };

  const restore = () => {
    const value = kept.offer?.value;
    kept.restore();
    if (value) setForm(value);
  };

  if (loading) {
    return (
      <div className="text-foreground-muted font-mono text-sm uppercase tracking-wider">
        Loading...
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-8 pb-6 border-b-2 border-foreground-muted/30">
        <h1 className="font-mono text-3xl md:text-4xl font-bold text-foreground uppercase tracking-wide">
          Home
        </h1>
        <p className="font-mono text-xs text-foreground-muted mt-2">
          Homepage images and about copy.{' '}
          {customized ? 'Currently showing your edits.' : 'Currently showing the shipped defaults.'}
        </p>
      </div>

      <HomeHeaderImages />

      {error && (
        <div role="alert" className="mb-6 p-3 rounded-md border border-red-500/40 bg-red-500/5 font-mono text-xs text-red-500">
          {error}
        </div>
      )}

      {kept.offer && <KeptEditsNotice offer={kept.offer} onRestore={restore} onDiscard={kept.discard} className="mb-minor" />}

      <div className="space-y-10">
        {/* Tagline */}
        <div>
          <label htmlFor="tagline" className={labelClass}>
            Tagline
          </label>
          <p className="font-mono text-xs text-foreground-muted -mt-1 mb-3">
            The italic lede above the paragraphs.
          </p>
          <AutoTextarea
            id="tagline"
            value={form.tagline}
            onChange={(tagline) => setForm({ ...form, tagline })}
          />
        </div>

        {/* Bio */}
        <ListEditor
          label="Bio paragraphs"
          hint={bioHint}
          items={form.bio}
          addLabel="Add paragraph"
          onChange={(bio) => setForm({ ...form, bio })}
        />

        {/* Fast facts */}
        <ListEditor
          label="What I do"
          hint="The bulleted list under the paragraphs."
          items={form.fastFacts}
          addLabel="Add bullet"
          onChange={(fastFacts) => setForm({ ...form, fastFacts })}
        />

        {/* Preview — same markup rules as the live section */}
        <div>
          <span className={labelClass}>Preview</span>
          <div className="p-5 rounded-md bg-card-bg border border-foreground-muted/20">
            <p className="text-lg text-foreground-muted leading-relaxed italic">
              {form.tagline}
            </p>
            <div className="space-y-4 text-sm text-foreground-muted leading-relaxed mt-5">
              {form.bio.map((p, i) => (
                <p key={i}>
                  <InlineRichText text={p} />
                </p>
              ))}
            </div>
            {form.fastFacts.length > 0 && (
              <div className="mt-6">
                <h2 className="font-mono text-xs uppercase tracking-widest text-foreground-muted mb-3">
                  What I do
                </h2>
                <ul className="space-y-2 text-sm text-foreground-muted">
                  {form.fastFacts.map((fact, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-accent-primary mt-1.5 text-xs">&#9632;</span>
                      <span>{fact}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Actions — pinned, with the save status beside them; ⌘S saves. */}
      <AdminSaveBar status={status} dirty={dirty}>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || !dirty}
          aria-keyshortcuts="Meta+S Control+S"
          className="px-5 py-2.5 rounded-md bg-foreground text-background font-mono text-xs uppercase tracking-wider font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          Save
        </button>
        <button
          type="button"
          onClick={handleReset}
          disabled={saving || !customized}
          title={customized ? undefined : 'Already showing the original copy'}
          className="px-5 py-2.5 rounded-md border border-foreground-muted/30 font-mono text-xs uppercase tracking-wider text-foreground hover:border-foreground-muted disabled:opacity-40 transition-colors"
        >
          Reset to defaults
        </button>
        <button
          type="button"
          onClick={() => setForm(defaults)}
          className="font-mono text-xs uppercase tracking-wider text-foreground-muted hover:text-foreground transition-colors"
        >
          Load defaults into the form
        </button>
      </AdminSaveBar>
    </div>
  );
}

export default HomeScreen;
