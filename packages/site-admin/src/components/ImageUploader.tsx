'use client';

import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { SaveRequestError, explainFailure } from '@rcweston/save-kit';
import { useAdminConfig } from '../config.js';
import { IMAGE_ACCEPT, validateImageFile } from './image-file.js';

/**
 * A drop zone for one image: click or drag a file in, watch it upload through
 * the admin's `uploadImage`, then copy its address.
 *
 * ```tsx
 * <ImageUploader onUploadComplete={(url) => setCover(url)} />
 * ```
 */
export function ImageUploader({
  onUploadComplete,
  label = 'Upload Image',
  hint = 'PNG, JPG, WebP or GIF up to 4 MB',
  maxBytes,
}: {
  onUploadComplete?: (url: string) => void;
  label?: string;
  hint?: string;
  /** The largest file to send. Default: story-server's 4 MB. */
  maxBytes?: number;
}) {
  const { uploadImage } = useAdminConfig();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = async (file: File) => {
    const validationError = validateImageFile(file, maxBytes);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setUploading(true);
    setProgress(0);

    try {
      const url = await uploadImage(file, setProgress);
      setUploadedUrl(url);
      onUploadComplete?.(url);
      void navigator.clipboard?.writeText(url).catch(() => undefined);
    } catch (err) {
      // 503: the server has nowhere to put uploads.
      if (err instanceof SaveRequestError && err.status === 503) setUnavailable(true);
      setError(explainFailure(err, 'uploaded'));
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file) return;
    await processFile(file);
  };

  const stop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: DragEvent) => {
    stop(e);
    setIsDragging(false);
    if (uploading) return;
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    await processFile(file);
  };

  const handleClick = () => fileInputRef.current?.click();

  return (
    <div className="space-y-4">
      <div>
        <span className="block text-sm font-mono text-foreground uppercase tracking-wider mb-2">{label}</span>

        {unavailable && (
          <div className="mb-4 p-4 rounded-md bg-status-warning/10 border-2 border-status-warning/30">
            <p className="text-sm font-mono text-status-warning-text font-semibold mb-2">Setup required</p>
            <p className="text-xs text-foreground-muted font-mono mb-0">
              Uploads aren’t set up on this server. Give story-server a MediaStore to keep files in.
            </p>
          </div>
        )}

        <div
          onDragEnter={(e) => { stop(e); setIsDragging(true); }}
          onDragLeave={(e) => { stop(e); setIsDragging(false); }}
          onDragOver={stop}
          onDrop={handleDrop}
          onClick={handleClick}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick(); } }}
          aria-label="Upload image - click or drag and drop"
          aria-disabled={uploading}
          className={`
            relative border-2 border-dashed rounded-md p-8 text-center transition-[border-color,background-color,opacity] cursor-pointer
            ${isDragging
              ? 'border-accent-primary bg-accent-primary/10'
              : 'border-foreground-muted bg-card-bg hover:border-accent-primary hover:bg-background-secondary'
            }
            ${uploading ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}
          `}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={IMAGE_ACCEPT}
            onChange={handleFileChange}
            disabled={uploading}
            className="hidden"
            tabIndex={-1}
            aria-hidden="true"
          />

          <div className="space-y-2">
            <svg className="mx-auto h-12 w-12 text-foreground-muted" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true">
              <path
                d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div className="text-sm font-mono text-foreground">
              <span className="font-semibold">Click to upload</span> or drag and drop
            </div>
            <p className="text-xs text-foreground-muted font-mono">{hint}</p>
          </div>
        </div>
      </div>

      {uploading && (
        <div className="space-y-2" role="status">
          <div className="w-full bg-background-secondary rounded-full h-2">
            <div className="bg-accent-primary h-2 rounded-full transition-[width] duration-300" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-xs text-foreground-muted font-mono">Uploading... {progress}%</p>
        </div>
      )}

      {error && <p role="alert" className="text-sm text-status-error-text font-mono">{error}</p>}

      {uploadedUrl && (
        <div className="space-y-2">
          <p role="status" className="text-sm text-status-success-text font-mono">Uploaded.</p>
          <div className="p-3 rounded-md bg-card-bg border border-default">
            <p className="text-xs text-foreground-muted mb-1 font-mono">URL (copied to clipboard):</p>
            <input
              type="text"
              value={uploadedUrl}
              readOnly
              aria-label="Uploaded image address"
              className="w-full px-2 py-1 text-xs font-mono bg-background-secondary border border-default rounded text-foreground"
              onClick={(e) => e.currentTarget.select()}
            />
          </div>
        </div>
      )}
    </div>
  );
}
