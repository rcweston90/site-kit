/**
 * The resume served at /resume. Browser-safe.
 *
 * Resolution order: the admin's upload if there is one, otherwise the base
 * PDF the host ships (a file committed beside the site). The base is the
 * fallback for a fresh install and for "Revert to base" in the admin; it is
 * never changed at runtime, and replacing it means committing a new file.
 */

/** The upload in effect, as the admin shows it. */
export interface ResumeUpload {
  /** The MediaStore key, `resume/<uuid>.pdf`: a fresh key per upload, so no cache serves an old copy. */
  key: string;
  /** The file's name as uploaded. */
  filename: string;
  /** Size in bytes. */
  size: number;
  uploadedAt: string;
}

/** The base PDF the host ships, as the admin shows it. */
export interface ResumeBaseInfo {
  filename: string;
  size: number;
  /** The file's modification time: the closest thing the base has to an upload date. */
  modifiedAt: string;
}

/** `GET /resume`: what's served now, what a revert would restore, and the version to save against. */
export interface ResumeState {
  upload: ResumeUpload | null;
  base: ResumeBaseInfo | null;
  version: number;
}

/** Upload guardrail shared by the handler and the admin form. */
export const RESUME_MAX_BYTES = 10 * 1024 * 1024;

/** `%PDF-` magic bytes: the browser's MIME type is only a hint. */
export function looksLikePdf(bytes: Uint8Array): boolean {
  return (
    bytes.length > 5 &&
    bytes[0] === 0x25 && // %
    bytes[1] === 0x50 && // P
    bytes[2] === 0x44 && // D
    bytes[3] === 0x46 && // F
    bytes[4] === 0x2d //   -
  );
}

export function isResumeUpload(value: unknown): value is ResumeUpload {
  if (!value || typeof value !== 'object') return false;
  const upload = value as Record<string, unknown>;
  return typeof upload.key === 'string' && typeof upload.filename === 'string' && typeof upload.size === 'number' && typeof upload.uploadedAt === 'string';
}

/** A file name safe to put in a Content-Disposition header. */
export function downloadNameFor(name: string): string {
  const cleaned = name.replace(/["\\\r\n]/g, '').replace(/[^\x20-\x7e]/g, '').trim();
  return cleaned || 'Resume.pdf';
}
