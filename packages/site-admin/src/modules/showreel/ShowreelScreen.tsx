'use client';

import { useEffect, useState } from 'react';
import { linksFor, normalizeReelUrl, showreelPaths, type ShowreelLinks, type ShowreelResponse, type ShowreelSetting } from '@rcweston/site-data/client';
import { KeptEditsNotice, SaveStatus, deleteWithUndo, explainFailure, useFormSave } from '@rcweston/save-kit';
import { storyMediaUploader, useAdminConfig } from '../../config.js';
import { adminRequest } from '../../request.js';
import { withConflict } from '../home/conflict.js';

const isText = (value: unknown): value is string => typeof value === 'string';

const labelClass =
  'block font-mono text-xs uppercase tracking-wider text-foreground-muted mb-2';
const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPT = 'video/mp4,video/webm,.mp4,.m4v,.webm';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** How the draft would play, before it is saved; null while it can't. */
function previewOf(draft: string, saved: ShowreelLinks | null): ShowreelLinks | null {
  if (saved && draft.trim() === saved.deck) return saved;
  const checked = normalizeReelUrl(draft);
  return 'error' in checked ? saved : linksFor(checked.url);
}

// ── Component ───────────────────────────────────────────────

/**
 * Admin → Showreel: the reel the showreel page plays. Upload a video (MP4 or
 * WebM, to the site's media) or paste a Figma deck link; Save stores it.
 */
export function ShowreelScreen() {
  const config = useAdminConfig();
  const url = `${config.siteApi}${showreelPaths.reel()}`;
  const [setting, setSetting] = useState<ShowreelSetting | null>(null);
  const [defaultUrl, setDefaultUrl] = useState('');
  const [links, setLinks] = useState<ShowreelLinks | null>(null);
  const [version, setVersion] = useState(0);
  const [path, setPath] = useState('/showreel');
  const [draft, setDraft] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { dirty, status, kept } = useFormSave({
    storageKey: 'admin:unsaved:showreel',
    ready: loaded,
    value: draft.trim(),
    saved: links?.deck ?? '',
    accept: isText,
    onSave: () => void save(),
  });
  const saving = status.pending.length > 0;
  const busy = saving || uploading;

  const apply = (data: ShowreelResponse) => {
    setSetting(data.setting);
    setLinks(data.links);
    setVersion(data.version);
    setDraft(data.links?.deck ?? '');
  };

  useEffect(() => {
    // A late answer from an earlier run never overwrites what's been typed.
    let current = true;
    const load = async () => {
      try {
        const data = await adminRequest<ShowreelResponse>(url);
        if (!current) return;
        setDefaultUrl(data.defaultUrl);
        setPath(data.path);
        apply(data);
        setLoaded(true);
      } catch (reason) {
        if (current) setError(explainFailure(reason, 'loaded'));
      }
    };
    load();
    return () => { current = false; };
  }, [url]);

  /** What's stored now, after a save met a newer one; the draft stays. */
  const refresh = async () => {
    const data = await adminRequest<ShowreelResponse>(url);
    setSetting(data.setting);
    setLinks(data.links);
    setVersion(data.version);
  };

  const save = async () => {
    if (!draft.trim()) {
      status.fail('Upload a video or paste a Figma link first.');
      return;
    }
    await status.run(() => withConflict(() => adminRequest<ShowreelResponse>(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: draft, expectedVersion: version }),
    }), refresh), { success: `Saved — ${path} now plays this reel`, onSaved: apply });
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    void save();
  };

  /** Uploads the file to the site's media; its address goes in the field, unsaved. */
  const upload = async (file: File) => {
    if (!file.size || file.size > MAX_BYTES) {
      status.fail('Choose a video smaller than 8 MB.', 'upload');
      return;
    }
    setUploading(true);
    setProgress(0);
    const send = storyMediaUploader(config.storyApi, 'showreel');
    await status.run(async () => ({ src: await send(file, setProgress) }), {
      key: 'upload',
      doing: 'Uploading the video…',
      success: 'Video uploaded. Save to play it on the site.',
      done: 'uploaded',
      onSaved: (value) => setDraft(value.src),
    });
    setUploading(false);
    setProgress(null);
  };

  /** Back to the original reel at once, with Undo; the reset is sent when
   *  the toast goes, and the preview follows once it has. */
  const handleReset = () => {
    const before = { setting, draft, links, version };
    setSetting(null);
    setDraft(defaultUrl);
    setLinks(defaultUrl ? linksFor(defaultUrl) : null);
    deleteWithUndo({
      key: 'showreel',
      label: 'Showreel back to the original reel',
      send: ({ keepalive }) => adminRequest(url, { method: 'DELETE', keepalive }),
      onUndo: () => {
        setSetting(before.setting);
        setDraft(before.draft);
        setLinks(before.links);
        setVersion(before.version);
      },
      onDone: (data) => apply(data as ShowreelResponse),
    });
  };

  const restore = () => {
    const value = kept.offer?.value;
    kept.restore();
    if (value !== undefined) setDraft(value);
  };

  if (!loaded) {
    return (
      <div role={error ? 'alert' : 'status'} className="text-foreground-muted font-mono text-sm uppercase tracking-wider">
        {error ?? 'Loading...'}
      </div>
    );
  }

  const preview = previewOf(draft, links);
  const isVideo = preview?.kind === 'video';

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-8 pb-6 border-b-2 border-foreground-muted/30">
        <h1 className="font-mono text-3xl md:text-4xl font-bold text-foreground uppercase tracking-wide">
          Showreel
        </h1>
        <p className="font-mono text-xs text-foreground-muted mt-2">
          The reel that plays on {path}.{' '}
          {setting
            ? `Currently playing your reel, set ${formatDate(setting.updatedAt)}.`
            : defaultUrl ? 'Currently playing the default shipped with the site.' : 'Nothing is set yet, so the page shows a poster and says the reel is on its way.'}
        </p>
      </div>

      {error && (
        <div role="alert" className="mb-6 p-3 rounded-md border border-red-500/40 bg-red-500/5 font-mono text-xs text-red-500">
          {error}
        </div>
      )}

      {kept.offer && <KeptEditsNotice offer={kept.offer} onRestore={restore} onDiscard={kept.discard} className="mb-minor" />}

      <div className="space-y-10">
        <form onSubmit={handleSave}>
          {/* Upload */}
          <label htmlFor="reel-upload" className={labelClass}>
            Upload a video
          </label>
          <input
            id="reel-upload"
            type="file"
            accept={ACCEPT}
            disabled={busy}
            onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) void upload(file); }}
            className="w-full min-w-0 font-mono text-xs text-foreground-muted file:mr-3 file:px-4 file:py-2 file:rounded-md file:border file:border-foreground-muted/30 file:bg-card-bg file:font-mono file:text-xs file:uppercase file:tracking-wider file:text-foreground disabled:opacity-40"
          />
          <p className="font-mono text-xs text-foreground-muted mt-2 mb-6">
            MP4 or WebM, up to 8 MB. Uploading puts its address in the field below; Save to play it.
            {progress !== null && ` Uploading… ${progress}%`}
          </p>

          {/* Reel URL */}
          <label htmlFor="deck-url" className={labelClass}>
            Video or Figma deck URL
          </label>
          <input
            id="deck-url"
            type="text"
            inputMode="url"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="https://www.figma.com/deck/…"
            spellCheck={false}
            className="w-full px-3 py-2 rounded-md bg-card-bg border border-foreground-muted/30 font-mono text-sm text-foreground focus:outline-none focus:border-accent-primary"
          />
          <p className="font-mono text-xs text-foreground-muted mt-2">
            An uploaded video, a https:// link to an MP4 or WebM file, or a figma.com deck,
            prototype, slides or design link. If a Figma file has a password, visitors are asked
            for it inside the frame — turn it off in Figma&apos;s share settings to remove that step.
          </p>
          <div className="flex flex-wrap gap-3 mt-4">
            <button
              type="submit"
              disabled={busy || !dirty || !draft.trim()}
              aria-keyshortcuts="Meta+S Control+S"
              className="px-4 py-2 rounded-md bg-accent-primary text-white font-mono text-xs uppercase tracking-wider font-semibold disabled:opacity-40 transition-opacity"
            >
              Save
            </button>
            <button
              type="button"
              onClick={handleReset}
              disabled={busy || !setting}
              title={setting ? undefined : 'Already playing the default reel'}
              className="px-4 py-2 rounded-md border border-foreground-muted/30 font-mono text-xs uppercase tracking-wider text-foreground hover:border-foreground-muted disabled:opacity-40 transition-colors"
            >
              Reset to default
            </button>
            {links && (
              <a
                href={links.kind === 'video' ? config.mediaSrc(links.deck) : links.deck}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 rounded-md border border-foreground-muted/30 font-mono text-xs uppercase tracking-wider text-foreground hover:text-accent-primary hover:border-accent-primary transition-colors"
              >
                {links.kind === 'video' ? 'Open the video ↗' : 'Open in Figma ↗'}
              </a>
            )}
          </div>
          {/* Beside the buttons, where the eye already is. */}
          <SaveStatus status={status} dirty={dirty} className="mt-half" />
          {setting && defaultUrl && (
            <p className="font-mono text-xs text-foreground-muted mt-4 break-all">
              Default: {defaultUrl}
            </p>
          )}
        </form>

        {/* Preview — what the page plays */}
        {preview && (
          <div>
            <span className={labelClass}>Preview{dirty ? ' · unsaved' : ''}</span>
            <div className="rounded-md border border-foreground-muted/20 overflow-hidden bg-card-bg aspect-video">
              {isVideo ? (
                <video
                  key={preview.video}
                  src={config.mediaSrc(preview.video ?? '')}
                  poster={preview.poster ? config.mediaSrc(preview.poster) : undefined}
                  controls
                  muted
                  playsInline
                  preload="metadata"
                  aria-label="Showreel preview"
                  className="block w-full h-full object-cover"
                />
              ) : (
                <iframe
                  key={preview.embed}
                  src={preview.embed ?? undefined}
                  title="Showreel preview"
                  allowFullScreen
                  className="block w-full h-full"
                />
              )}
            </div>
          </div>
        )}
      </div>

    </div>
  );
}

export default ShowreelScreen;
