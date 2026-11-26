'use client';

import { useState, useEffect, useCallback } from 'react';
import { AdminLink as Link } from '../../router.js';
import { RESUME_MAX_BYTES, siteDataPaths, type ResumeBaseInfo, type ResumeState, type ResumeUpload } from '@rcweston/site-data/client';
import { SaveStatus, deleteWithUndo, useListSave } from '@rcweston/save-kit';
import { adminRequest } from '../../request.js';
import { useAdminConfig } from '../../config.js';

// ── Types ───────────────────────────────────────────────────

type ResumeResponse = ResumeState;

// The handler enforces the real limit; this one answers before the upload starts.
const MAX_BYTES = RESUME_MAX_BYTES;

const labelClass =
  'block font-mono text-xs uppercase tracking-wider text-foreground-muted mb-2';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ── Component ───────────────────────────────────────────────

/** The resume PDF served at `publicPath`: upload, replace, revert to the shipped base, and a live preview. */
export function ResumeScreen({ publicPath = '/resume' }: { publicPath?: string }) {
  const config = useAdminConfig();
  const url = `${config.siteApi}${siteDataPaths.resume()}`;
  const [upload, setUpload] = useState<ResumeUpload | null>(null);
  const [base, setBase] = useState<ResumeBaseInfo | null>(null);
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // An upload saves at once, so there's nothing typed to keep or guard —
  // only an upload in flight, which the leave guard covers.
  const { status } = useListSave();
  const uploading = status.pending.length > 0;
  // Bumped after every change so the preview iframe re-requests the resume
  // instead of showing the browser's cached copy.
  const [previewKey, setPreviewKey] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch(url, { credentials: 'same-origin' });
      const data: ResumeResponse & { error?: string } = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to load');
        return;
      }
      setError(null);
      setUpload(data.upload);
      setBase(data.base);
      setVersion(data.version);
    } catch {
      setError('Failed to load resume');
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    void load();
  }, [load]);

  const { run, fail } = status;
  const uploadFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
      fail(`“${file.name}” isn’t a PDF. Choose a PDF file.`, 'upload');
      return;
    }
    if (file.size > MAX_BYTES) {
      fail(`“${file.name}” is larger than ${formatBytes(MAX_BYTES)}. Choose a smaller PDF.`, 'upload');
      return;
    }
    const fd = new FormData();
    fd.append('file', file);
    fd.append('expectedVersion', String(version));
    const result = await run(() => adminRequest<{ upload: ResumeUpload; version: number }>(url, { method: 'POST', body: fd }), {
      key: 'upload',
      doing: 'Uploading…',
      success: `Uploaded — ${publicPath} now serves this file`,
      done: 'uploaded',
      onSaved: (value) => {
        setUpload(value.upload);
        setVersion(value.version);
        setPreviewKey((k) => k + 1);
      },
    });
    // Changed somewhere else first: show what's there now; the failure stays up.
    if (!result.ok) void load().then(() => setPreviewKey((k) => k + 1));
  }, [fail, run, url, version, publicPath, load]);

  /** Back to the base resume at once, with Undo; the upload is removed when
   *  the toast goes, and the preview follows once it has. */
  const handleRevert = () => {
    const before = upload;
    const expectedVersion = version;
    setUpload(null);
    deleteWithUndo({
      key: 'resume-upload',
      label: 'Reverted to the base resume',
      send: ({ keepalive }) => adminRequest(url, { method: 'DELETE', body: JSON.stringify({ expectedVersion }), keepalive }),
      onUndo: () => setUpload(before),
      onDone: (result) => {
        const next = (result as { version?: number } | null)?.version;
        if (typeof next === 'number') setVersion(next);
        setPreviewKey((k) => k + 1);
      },
    });
  };

  if (loading) {
    return (
      <div className="text-foreground-muted font-mono text-sm uppercase tracking-wider">
        Loading...
      </div>
    );
  }

  const current = upload
    ? { source: 'Uploaded', filename: upload.filename, size: upload.size, date: upload.uploadedAt }
    : base
      ? { source: 'Shipped base', filename: base.filename, size: base.size, date: base.modifiedAt }
      : null;

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-8 pb-6 border-b-2 border-foreground-muted/30 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-mono text-3xl md:text-4xl font-bold text-foreground uppercase tracking-wide">
            Resume
          </h1>
          <p className="font-mono text-xs text-foreground-muted mt-2">
            The PDF that opens at {publicPath}.{' '}
            {upload ? 'Currently serving your upload.' : base ? 'Currently serving the base shipped in the repo.' : 'Nothing is uploaded yet, and no base is shipped.'}
          </p>
        </div>
        <Link
          href={publicPath}
          target="_blank"
          rel="noopener"
          className="px-4 py-2 rounded-md border-2 border-foreground-muted text-foreground hover:text-accent-primary hover:border-accent-primary transition-colors font-mono text-xs uppercase tracking-wider font-semibold"
        >
          Open {publicPath} →
        </Link>
      </div>

      {error && (
        <div className="mb-6 p-3 rounded-md border border-red-500/40 bg-red-500/5 font-mono text-xs text-red-500">
          {error}
        </div>
      )}

      <SaveStatus status={status} className="mb-minor" />

      <div className="space-y-10">
        {/* Current file */}
        {current && (
          <div>
            <span className={labelClass}>Current file</span>
            <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-md bg-card-bg border border-foreground-muted/20">
              <div className="min-w-0">
                <div className="font-mono text-sm font-semibold text-foreground truncate">
                  {current.filename}
                </div>
                <div className="font-mono text-xs text-foreground-muted mt-1">
                  {current.source} · {formatBytes(current.size)} · {formatDate(current.date)}
                </div>
              </div>
              <button
                type="button"
                onClick={handleRevert}
                disabled={uploading || !upload}
                title={upload ? undefined : 'Already serving the shipped base'}
                className="px-4 py-2 rounded-md border border-foreground-muted/30 font-mono text-xs uppercase tracking-wider text-foreground hover:border-foreground-muted disabled:opacity-40 transition-colors"
              >
                Revert to base
              </button>
            </div>
          </div>
        )}

        {/* Dropzone */}
        <div>
          <span className={labelClass}>{upload ? 'Replace' : 'Upload'}</span>
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              void uploadFile(e.dataTransfer.files[0]);
            }}
            className={`flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed p-10 text-center cursor-pointer transition-colors ${
              dragOver
                ? 'border-accent-primary bg-accent-primary/5'
                : 'border-foreground-muted/40 hover:border-foreground-muted'
            } ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
          >
            <input
              type="file"
              accept="application/pdf,.pdf"
              className="sr-only"
              disabled={uploading}
              onChange={(e) => {
                void uploadFile(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
            <span className="font-mono text-sm font-semibold text-foreground uppercase tracking-wider">
              {uploading ? 'Uploading…' : 'Drop a PDF or click to upload'}
            </span>
            <span className="font-mono text-xs text-foreground-muted">
              One file · PDF only · up to {formatBytes(MAX_BYTES)} · replaces the current resume immediately
            </span>
          </label>
        </div>

        {/* Preview — the live route, so what you see is what a visitor gets */}
        {current && (
          <div>
            <span className={labelClass}>Preview</span>
            <div className="rounded-md border border-foreground-muted/20 overflow-hidden bg-card-bg">
              <iframe
                key={previewKey}
                src={`${publicPath}?v=${previewKey}`}
                title="Resume preview"
                className="block w-full h-[720px]"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
