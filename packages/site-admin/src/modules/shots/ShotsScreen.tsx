'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ALL_SAVED,
  KeptEditsNotice,
  SaveRequestError,
  SaveStatus,
  deleteWithUndo,
  recordKey,
  explainFailure,
  reportLateFailure,
  useHiddenKeys,
  useKeptEdits,
  useLeaveGuard,
  useSaveShortcut,
  useSaveStatus,
} from '@rcweston/save-kit';
import { isShotCaptions, siteDataPaths, type ShotCaptions, type ShotRecord, type ShotsList } from '@rcweston/site-data/client';
import { AdminLink as Link } from '../../router.js';
import { useAdminConfig } from '../../config.js';
import { adminRequest } from '../../request.js';
import { Reorder } from './Reorder.js';

type Shot = ShotRecord;
type Captions = ShotCaptions;

/** How a shot is named while its delete waits for Undo. */
export const shotRecordKey = (id: number) => recordKey('shot', id);

/** Kept captions: a map of shot id to the text typed. */
const isCaptions = isShotCaptions;

const NO_CAPTIONS: Captions = {};

/**
 * Shots: the photography library. Drop or pick photos to upload (a batch is
 * fine; each is resized, stripped of EXIF and measured once), caption them,
 * drag to reorder, hide one from the public gallery or delete it with Undo.
 * `galleryHref` is the public page's address, for "View gallery".
 */
export function ShotsScreen({ galleryHref = '/shots' }: { galleryHref?: string } = {}) {
  const config = useAdminConfig();
  const endpoint = `${config.siteApi}${siteDataPaths.shots()}`;
  const [shots, setShots] = useState<Shot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [upload, setUpload] = useState<{ done: number; total: number } | null>(null);
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);
  // Captions as stored, so a caption typed but not yet saved shows as such.
  const [savedAlts, setSavedAlts] = useState<Captions>(NO_CAPTIONS);
  // What another tab saved over a caption typed here: shown under the field
  // until this one is saved over it (with the version it brought).
  const [storedElsewhere, setStoredElsewhere] = useState<Captions>(NO_CAPTIONS);
  // The order's version as loaded, so a reorder built on an older one is refused.
  const orderVersion = useRef(0);
  // The order waits 0.7s after a drag so a run of moves is one save; leaving
  // in that moment sends it at once instead of losing it.
  const [orderFailed, setOrderFailed] = useState(false);
  const orderTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const waitingOrder = useRef<number[] | null>(null);
  const status = useSaveStatus();
  const hidden = useHiddenKeys();
  const visibleShots = shots.filter((shot) => !hidden.has(shotRecordKey(shot.id)));
  const hiddenCount = visibleShots.filter((shot) => shot.hidden).length;
  const unsavedCaptions: Captions = {};
  for (const shot of shots) {
    const saved = savedAlts[shot.id];
    if (saved !== undefined && saved !== shot.alt) unsavedCaptions[shot.id] = shot.alt;
  }
  const captionsDirty = Object.keys(unsavedCaptions).length > 0;
  const kept = useKeptEdits({
    storageKey: 'admin:unsaved:shots:captions',
    ready: !loading,
    value: captionsDirty ? unsavedCaptions : NO_CAPTIONS,
    saved: NO_CAPTIONS,
    dirty: captionsDirty,
    accept: isCaptions,
  });
  useLeaveGuard(captionsDirty || orderFailed || status.pending.length > 0);

  const read = useCallback(() => adminRequest<ShotsList>(endpoint), [endpoint]);

  // State is only set once the request settles, so the mount effect can call
  // this directly; there's no error to clear on mount.
  const loadShots = useCallback(
    () =>
      read()
        .then((data) => {
          const loaded: Shot[] = data.shots || [];
          setShots(loaded);
          setSavedAlts(Object.fromEntries(loaded.map((shot) => [shot.id, shot.alt])));
          setStoredElsewhere(NO_CAPTIONS);
          orderVersion.current = data.order?.version ?? 0;
        })
        .catch((reason: unknown) => setError(reason instanceof SaveRequestError && reason.kind === 'session'
          ? 'Your session ended. Sign in again to see Shots.'
          : 'Failed to load shots'))
        .finally(() => setLoading(false)),
    [read]
  );

  // Reloads after an upload start from a clean slate, keeping captions typed meanwhile.
  const fetchShots = useCallback(() => {
    setError(null);
    return read()
      .then((data) => {
        const loaded: Shot[] = data.shots || [];
        orderVersion.current = data.order?.version ?? 0;
        setShots((current) => loaded.map((shot) => {
          const typed = current.find((entry) => entry.id === shot.id);
          return typed && typed.alt !== savedAltsRef.current[shot.id] ? { ...shot, alt: typed.alt } : shot;
        }));
        setSavedAlts(Object.fromEntries(loaded.map((shot) => [shot.id, shot.alt])));
      })
      .catch(() => setError('Failed to load shots'));
  }, [read]);
  const savedAltsRef = useRef(savedAlts);
  savedAltsRef.current = savedAlts;
  const shotsRef = useRef(shots);
  shotsRef.current = shots;

  useEffect(() => {
    loadShots();
  }, [loadShots]);

  // Batch upload: one request per file (progress + no long request), 3 at a time.
  const uploadFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const files = Array.from(fileList).filter(
        (f) => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name)
      );
      if (!files.length) return;
      setUploadErrors([]);
      setUpload({ done: 0, total: files.length });
      const errs: string[] = [];
      let i = 0;
      const worker = async () => {
        while (i < files.length) {
          const f = files[i++];
          const fd = new FormData();
          fd.append('file', f);
          try {
            await adminRequest(endpoint, { method: 'POST', body: fd });
          } catch (reason) {
            errs.push(`${f.name}: ${explainFailure(reason, 'uploaded')}`);
          }
          setUpload((u) => (u ? { ...u, done: u.done + 1 } : u));
        }
      };
      await Promise.all([worker(), worker(), worker()]);
      setUploadErrors(errs);
      await fetchShots();
      setUpload(null);
    },
    [endpoint, fetchShots]
  );

  const sendOrder = useCallback((ids: number[], keepalive = false) => adminRequest<{ order: { version: number } }>(endpoint, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ order: ids, expectedVersion: orderVersion.current }),
    keepalive,
  }).then((data) => {
    orderVersion.current = data.order.version;
    return data;
  }), [endpoint]);

  const { run } = status;
  const saveOrder = useCallback(() => {
    if (orderTimer.current) clearTimeout(orderTimer.current);
    orderTimer.current = null;
    const ids = waitingOrder.current;
    if (!ids) return;
    waitingOrder.current = null;
    void run(() => sendOrder(ids).catch((reason: unknown) => {
      // Moved somewhere else meanwhile: show that order, not ours.
      if (reason instanceof SaveRequestError && reason.status === 409) void fetchShots();
      throw reason;
    }), {
      key: 'order',
      doing: 'Saving the order…',
      success: 'Order saved',
      onSaved: () => setOrderFailed(false),
    }).then((result) => { if (!result.ok) setOrderFailed(true); });
  }, [run, sendOrder, fetchShots]);

  // Leaving the page (in admin, or closing the tab) sends a waiting order now.
  useEffect(() => {
    const flush = () => {
      if (!waitingOrder.current) return;
      if (orderTimer.current) clearTimeout(orderTimer.current);
      void sendOrder(waitingOrder.current, true)
        .catch((reason) => reportLateFailure(`The new order of Shots: ${explainFailure(reason)}`));
      waitingOrder.current = null;
    };
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [sendOrder]);

  const handleReorder = (next: Shot[]) => {
    // Shots waiting to be deleted keep their place, so Undo puts them back there.
    const order = [...next, ...shots.filter((shot) => hidden.has(shotRecordKey(shot.id)))];
    setShots(order);
    waitingOrder.current = order.map((s) => s.id);
    if (orderTimer.current) clearTimeout(orderTimer.current);
    orderTimer.current = setTimeout(saveOrder, 700);
  };

  const editAlt = (id: number, alt: string) =>
    setShots((prev) => prev.map((s) => (s.id === id ? { ...s, alt } : s)));

  const versionOf = (id: number) => shots.find((shot) => shot.id === id)?.version;
  const takeSaved = (saved: Shot, keepAlt: boolean) =>
    setShots((prev) => prev.map((s) => (s.id === saved.id ? { ...saved, alt: keepAlt ? s.alt : saved.alt } : s)));

  // Someone saved this shot elsewhere: keep what was typed here, take their
  // version (so saving again replaces theirs on purpose) and say what they saved.
  const meetConflict = async (id: number) => {
    const latest = await read().catch(() => null);
    const current = latest?.shots.find((shot) => shot.id === id);
    if (!current) return;
    const typed = shotsRef.current.find((s) => s.id === id)?.alt ?? current.alt;
    setShots((prev) => prev.map((s) => (s.id === id ? { ...current, alt: s.alt } : s)));
    setSavedAlts((saved) => ({ ...saved, [id]: current.alt }));
    // Only a caption that differs from what's stored needs saying.
    setStoredElsewhere(({ [id]: _old, ...others }) => (typed !== current.alt ? { ...others, [id]: current.alt } : others));
  };

  // ⌘S blurs the field it saves, and the blur saves too: send each text once.
  const sendingAlts = useRef(new Map<number, string>());
  const commitAlt = (id: number, alt: string) => {
    if (savedAlts[id] === alt || sendingAlts.current.get(id) === alt) return;
    sendingAlts.current.set(id, alt);
    void run(() => adminRequest<{ shot: Shot }>(endpoint, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, alt, expectedVersion: versionOf(id) }),
    }).catch((reason: unknown) => {
      if (reason instanceof SaveRequestError && reason.status === 409) void meetConflict(id);
      throw reason;
    }), {
      key: `caption:${id}`,
      success: 'Caption saved',
      onSaved: ({ shot }) => {
        setSavedAlts((current) => ({ ...current, [id]: alt }));
        setStoredElsewhere(({ [id]: _gone, ...others }) => others);
        takeSaved(shot, true);
      },
    }).finally(() => {
      if (sendingAlts.current.get(id) === alt) sendingAlts.current.delete(id);
    });
  };

  // Hidden shots stay in the library and leave the public gallery.
  const toggleHidden = (shot: Shot) => {
    const next = !shot.hidden;
    setShots((prev) => prev.map((s) => (s.id === shot.id ? { ...s, hidden: next } : s)));
    void run(() => adminRequest<{ shot: Shot }>(endpoint, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: shot.id, hidden: next, expectedVersion: shot.version }),
    }), {
      key: `hidden:${shot.id}`,
      doing: next ? 'Hiding the shot…' : 'Showing the shot…',
      success: next ? 'Shot hidden from the gallery' : 'Shot shown in the gallery',
      onSaved: ({ shot: saved }) => takeSaved(saved, true),
    }).then((result) => {
      if (result.ok) return;
      setShots((prev) => prev.map((s) => (s.id === shot.id ? { ...s, hidden: shot.hidden } : s)));
      void meetConflict(shot.id);
    });
  };

  const saveAll = () => {
    const active = document.activeElement;
    if (active instanceof HTMLInputElement) active.blur();
    const captions = Object.entries(unsavedCaptions);
    captions.forEach(([id, alt]) => commitAlt(Number(id), alt));
    if (waitingOrder.current) saveOrder();
    else if (orderFailed) {
      waitingOrder.current = shots.map((shot) => shot.id);
      saveOrder();
    } else if (captions.length === 0 && status.pending.length === 0) status.note(ALL_SAVED);
  };
  useSaveShortcut(saveAll);

  const handleDelete = (id: number) => {
    deleteWithUndo({
      key: shotRecordKey(id),
      label: 'Shot deleted',
      send: ({ keepalive }) => adminRequest(endpoint, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
        keepalive,
      }),
      onDone: () => setShots((prev) => prev.filter((shot) => shot.id !== id)),
    });
  };

  const restoreCaptions = () => {
    const captions = kept.offer?.value ?? NO_CAPTIONS;
    kept.restore();
    setShots((prev) => prev.map((shot) => (captions[shot.id] !== undefined ? { ...shot, alt: captions[shot.id] } : shot)));
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8 pb-6 border-b-2 border-foreground-muted/30 flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-mono text-3xl md:text-4xl font-bold text-foreground uppercase tracking-wide">
            Manage Shots
          </h1>
          <p className="mt-2 text-sm text-foreground-muted font-mono">
            {visibleShots.length} shot{visibleShots.length !== 1 ? 's' : ''}{hiddenCount > 0 ? ` · ${hiddenCount} hidden` : ''} · drag to reorder
          </p>
          <SaveStatus status={status} dirty={captionsDirty || orderFailed} />
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={galleryHref}
            className="px-4 py-2 rounded-md border-2 border-foreground-muted text-foreground hover:text-accent-primary hover:border-accent-primary transition-colors font-mono text-xs uppercase tracking-wider font-semibold"
          >
            View gallery →
          </Link>
        </div>
      </div>

      {/* Dropzone */}
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          uploadFiles(e.dataTransfer.files);
        }}
        className={`mb-8 flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed p-10 text-center cursor-pointer transition-colors ${
          dragOver ? 'border-accent-primary bg-accent-primary/5' : 'border-foreground-muted/40 hover:border-foreground-muted'
        }`}
      >
        <input
          type="file"
          accept="image/*,.heic,.heif"
          multiple
          className="sr-only"
          onChange={(e) => {
            if (e.target.files) uploadFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <span className="font-mono text-sm font-semibold text-foreground uppercase tracking-wider">
          Drop photos or click to upload
        </span>
        <span className="font-mono text-xs text-foreground-muted">
          Batch OK · auto-compressed, EXIF-stripped, blur + dimensions generated
        </span>
      </label>

      {/* Upload progress */}
      {upload && (
        <div className="mb-6" role="status">
          <div className="flex items-center justify-between font-mono text-xs text-foreground-muted mb-1">
            <span>Processing…</span>
            <span>
              {upload.done}/{upload.total}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-foreground-muted/20 overflow-hidden">
            <div
              className="h-full bg-accent-primary transition-[width] duration-300"
              style={{ width: `${(upload.done / Math.max(1, upload.total)) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Upload errors */}
      {uploadErrors.length > 0 && (
        <div role="alert" className="mb-6 p-4 rounded-md bg-red-500/10 border border-red-500/30">
          <p className="font-mono text-xs text-red-500 font-semibold mb-1">
            {uploadErrors.length} file{uploadErrors.length !== 1 ? 's' : ''} failed:
          </p>
          <ul className="font-mono text-xs text-red-500/90 space-y-0.5">
            {uploadErrors.slice(0, 8).map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <div role="alert" className="mb-6 p-4 rounded-md bg-red-500/10 border border-red-500/30 font-mono text-sm text-red-500">
          {error}
        </div>
      )}

      {kept.offer && <KeptEditsNotice offer={kept.offer} onRestore={restoreCaptions} onDiscard={kept.discard} className="mb-minor" />}

      {/* Shots list — draggable to reorder */}
      {loading ? (
        <div role="status" className="text-center py-12 text-foreground-muted font-mono text-sm uppercase tracking-wider">
          Loading…
        </div>
      ) : visibleShots.length === 0 ? (
        <div className="text-center py-12 text-foreground-muted font-mono text-sm">
          No shots yet. Drop photos above.
        </div>
      ) : (
        <Reorder.Group axis="y" values={visibleShots} onReorder={handleReorder} className="space-y-2" aria-label="Shots, in gallery order">
          {visibleShots.map((shot) => (
            <Reorder.Item
              key={shot.id}
              value={shot}
              className="flex items-center gap-4 rounded-md bg-card-bg border border-foreground-muted/25 p-3"
            >
              <span
                aria-hidden
                className="cursor-grab active:cursor-grabbing text-foreground-muted/50 select-none font-mono text-lg leading-none"
                title="Drag to reorder"
              >
                ⠿
              </span>
              <div className={`relative h-16 w-16 flex-shrink-0 overflow-hidden rounded bg-background-secondary ${shot.hidden ? 'opacity-50' : ''}`}>
                {/* eslint-disable-next-line @next/next/no-img-element -- the package is framework-free */}
                <img
                  src={shot.url}
                  alt={shot.alt || ''}
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                  className="absolute inset-0 h-full w-full object-cover"
                  style={shot.blur_data_url ? { backgroundImage: `url(${shot.blur_data_url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
                />
              </div>
              <div className="min-w-0 flex-1">
                <input
                  value={shot.alt}
                  onChange={(e) => editAlt(shot.id, e.target.value)}
                  onBlur={(e) => commitAlt(shot.id, e.target.value)}
                  onPointerDown={(e) => e.stopPropagation()}
                  placeholder="Caption / alt text"
                  aria-label={`Caption for shot ${visibleShots.indexOf(shot) + 1}`}
                  className="w-full bg-transparent font-mono text-sm text-foreground placeholder:text-foreground-muted/50 outline-none border-b border-transparent focus:border-foreground-muted/40"
                />
                <span className="font-mono text-xs text-foreground-muted/70">
                  {shot.width}×{shot.height}
                  {shot.hidden && <span className="ml-2 text-accent-secondary-text">· hidden</span>}
                </span>
                {storedElsewhere[shot.id] !== undefined && (
                  <p role="status" className="mt-1 font-mono text-xs text-status-error-text">
                    Saved elsewhere as “{storedElsewhere[shot.id] || 'no caption'}”. Save again to keep yours.
                  </p>
                )}
              </div>
              {/* Hide sits above Delete on a phone, so the caption keeps its width. */}
              <div className="flex flex-shrink-0 flex-col items-stretch gap-1 sm:flex-row sm:items-center sm:gap-4">
              <button
                type="button"
                onClick={() => toggleHidden(shot)}
                onPointerDown={(e) => e.stopPropagation()}
                aria-pressed={shot.hidden}
                aria-label={`${shot.hidden ? 'Show' : 'Hide'} shot ${visibleShots.indexOf(shot) + 1} ${shot.hidden ? 'in' : 'from'} the gallery`}
                className="flex-shrink-0 px-3 py-1 sm:py-2 rounded-md border border-foreground-muted/40 text-foreground-muted hover:text-foreground hover:border-foreground-muted transition-colors font-mono text-xs uppercase tracking-wider"
              >
                {shot.hidden ? 'Show' : 'Hide'}
              </button>
              <button
                type="button"
                onClick={() => handleDelete(shot.id)}
                onPointerDown={(e) => e.stopPropagation()}
                className="flex-shrink-0 px-3 py-1 sm:py-2 rounded-md border border-red-500/50 text-red-500 hover:bg-red-500/10 transition-colors font-mono text-xs uppercase tracking-wider"
              >
                Delete
              </button>
              </div>
            </Reorder.Item>
          ))}
        </Reorder.Group>
      )}
    </div>
  );
}

export default ShotsScreen;
