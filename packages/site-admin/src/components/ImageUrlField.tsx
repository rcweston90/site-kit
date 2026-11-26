'use client';

import { useRef, useState, type ChangeEvent } from 'react';
import { explainFailure } from '@rcweston/save-kit';
import { useAdminConfig } from '../config.js';
import { IMAGE_ACCEPT, validateImageFile } from './image-file.js';

interface ImageUrlFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (url: string) => void;
  placeholder?: string;
}

const inputCls = 'w-full px-2 py-1.5 rounded bg-background border border-foreground-muted/30 text-foreground font-mono text-xs focus:outline-none focus:border-foreground-muted';

/**
 * Compact image URL field with upload button: paste an address, or upload a
 * file through the admin's `uploadImage`.
 */
export function ImageUrlField({ id, label, value, onChange, placeholder }: ImageUrlFieldProps) {
  const { uploadImage } = useAdminConfig();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validationError = validateImageFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setUploading(true);
    try {
      onChange(await uploadImage(file));
    } catch (err) {
      setError(explainFailure(err, 'uploaded'));
    } finally {
      setUploading(false);
      // Reset input so the same file can be re-selected
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div>
      <label htmlFor={id} className="block font-mono text-xs uppercase tracking-wider text-foreground-muted mb-1">
        {label}
      </label>
      <div className="flex gap-1.5">
        <input
          id={id}
          type="text"
          value={value}
          onChange={(e) => { onChange(e.target.value); setError(null); }}
          placeholder={placeholder}
          className={`${inputCls} flex-1`}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          aria-label={`Upload ${label}`}
          className="shrink-0 px-2 py-1.5 rounded border border-foreground-muted/30 bg-background text-foreground-muted hover:text-foreground hover:border-foreground-muted font-mono text-xs transition-colors disabled:opacity-50"
          title="Upload image"
        >
          {uploading ? '...' : (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="inline-block" aria-hidden="true">
              <path d="M3 10v2.5A1.5 1.5 0 0 0 4.5 14h7a1.5 1.5 0 0 0 1.5-1.5V10M11 5L8 2M8 2L5 5M8 2v8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </button>
        <input ref={fileRef} type="file" accept={IMAGE_ACCEPT} onChange={handleUpload} className="hidden" tabIndex={-1} aria-hidden="true" />
      </div>
      {value && (
        <div className="mt-1.5 rounded border border-foreground-muted/20 overflow-hidden h-16 bg-background">
          <img src={value} alt="" className="w-full h-full object-cover" />
        </div>
      )}
      {error && (
        <p role="alert" className="mt-1 text-xs text-status-error-text font-mono">{error}</p>
      )}
    </div>
  );
}
