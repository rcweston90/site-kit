/**
 * Media: which uploads are let in, where they land, and how they're served.
 *
 * An upload is checked three ways before it's stored: its name and declared
 * type must agree on one accepted format, it must fit the size limit, and its
 * opening bytes must look like that format, so a renamed file can't pass as
 * another. It's stored under its content hash, so the same file uploaded
 * twice is one object and a new file never replaces one a draft points at.
 *
 * Serving answers `private, no-cache` with the object's ETag (the browser may
 * keep the bytes but asks again each time, through the session check), byte
 * ranges (Safari won't play video without them), conditional requests, and a
 * sandboxing Content-Security-Policy so a file opened as a page can't run.
 */

import type { MediaHead, MediaKind, MediaPolicy, MediaStore, MediaVisibility } from '@rcweston/story-core';

// ─── Formats ────────────────────────────────────────────────────────────────

export interface MediaFormat {
  contentType: string;
  /** The extension the stored key gets, whatever the file was called. */
  ext: string;
  kind: MediaKind;
  /** The name the author knows it by, for messages. */
  label: string;
  /** Extensions a file of this type may be named with. */
  extensions: string[];
  /** The file's opening bytes, so a renamed file can't pass as another type. */
  signature: (head: Uint8Array) => boolean;
}

const ascii = (head: Uint8Array, at: number, text: string) =>
  [...text].every((char, index) => head[at + index] === char.charCodeAt(0));
const bytes = (head: Uint8Array, at: number, expected: number[]) =>
  expected.every((byte, index) => head[at + index] === byte);

/** Every format this package can recognise from its bytes. SVG is left out on
 *  purpose: opened from your origin, an SVG can run script with your cookies. */
export const MEDIA_FORMATS: Record<string, MediaFormat> = {
  'image/png': { contentType: 'image/png', ext: 'png', kind: 'image', label: 'PNG', extensions: ['.png'], signature: (head) => bytes(head, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  'image/jpeg': { contentType: 'image/jpeg', ext: 'jpg', kind: 'image', label: 'JPEG', extensions: ['.jpg', '.jpeg'], signature: (head) => bytes(head, 0, [0xff, 0xd8, 0xff]) },
  'image/webp': { contentType: 'image/webp', ext: 'webp', kind: 'image', label: 'WebP', extensions: ['.webp'], signature: (head) => ascii(head, 0, 'RIFF') && ascii(head, 8, 'WEBP') },
  'image/gif': { contentType: 'image/gif', ext: 'gif', kind: 'image', label: 'GIF', extensions: ['.gif'], signature: (head) => ascii(head, 0, 'GIF87a') || ascii(head, 0, 'GIF89a') },
  'image/avif': { contentType: 'image/avif', ext: 'avif', kind: 'image', label: 'AVIF', extensions: ['.avif'], signature: (head) => ascii(head, 4, 'ftyp') && (ascii(head, 8, 'avif') || ascii(head, 8, 'avis')) },
  // QuickTime is ISO media too, but its `qt  ` brand won't play in Chrome or
  // Firefox even when the file is named .mp4.
  'video/mp4': { contentType: 'video/mp4', ext: 'mp4', kind: 'video', label: 'MP4', extensions: ['.mp4', '.m4v'], signature: (head) => ascii(head, 4, 'ftyp') && !ascii(head, 8, 'qt  ') && !ascii(head, 8, 'avif') && !ascii(head, 8, 'avis') },
  'video/webm': { contentType: 'video/webm', ext: 'webm', kind: 'video', label: 'WebM', extensions: ['.webm'], signature: (head) => bytes(head, 0, [0x1a, 0x45, 0xdf, 0xa3]) },
  'application/pdf': { contentType: 'application/pdf', ext: 'pdf', kind: 'pdf', label: 'PDF', extensions: ['.pdf'], signature: (head) => ascii(head, 0, '%PDF-') },
};

/** How many opening bytes a signature check needs. */
export const MEDIA_SIGNATURE_BYTES = 16;

/** Browsers and operating systems name a few formats differently. */
const TYPE_ALIASES: Record<string, string> = {
  'image/jpg': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
  'video/x-m4v': 'video/mp4',
  'application/x-pdf': 'application/pdf',
};

/** Declared types that say nothing, so only the extension can decide. */
const UNDECLARED = new Set(['', 'application/octet-stream']);

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot).toLowerCase();
}

function formatByExtension(name: string): MediaFormat | undefined {
  const ext = extensionOf(name);
  if (!ext) return undefined;
  return Object.values(MEDIA_FORMATS).find((format) => format.extensions.includes(ext));
}

// ─── Policy ─────────────────────────────────────────────────────────────────

export const DEFAULT_MEDIA_MAX_BYTES = 8 * 1024 * 1024;
export const DEFAULT_MEDIA_BASE_PATH = '/api/story/media';
export const DEFAULT_MEDIA_PREFIX = 'stories/';

export interface MediaPolicyOptions {
  /** Largest accepted upload, in bytes. Default 8 MB. */
  maxBytes?: number;
  /** Accepted content types. Default: PNG, JPEG, WebP, GIF, AVIF, MP4, WebM and PDF. */
  accept?: string[];
  /** Where your media route is mounted. Default `/api/story/media`. */
  basePath?: string;
  /** The key prefix uploads land under, and the only one the media route serves. Default `stories/`. */
  prefix?: string;
}

/** The media policy plus the two things the handlers need to serve what it stores. */
export interface StoryMediaPolicy extends MediaPolicy {
  /** The key prefix the media route serves. */
  prefix: string;
  /** The URL path a key is served at, as `srcFor` builds it. */
  basePath: string;
}

export function createMediaPolicy(options: MediaPolicyOptions = {}): StoryMediaPolicy {
  const basePath = (options.basePath ?? DEFAULT_MEDIA_BASE_PATH).replace(/\/+$/, '');
  const prefix = options.prefix ?? DEFAULT_MEDIA_PREFIX;
  const types = options.accept ?? Object.keys(MEDIA_FORMATS);
  const accept: Record<string, MediaKind> = {};
  for (const type of types) {
    const format = MEDIA_FORMATS[type];
    if (!format) throw new Error(`No byte check for ${type}. Accepted types must be one of: ${Object.keys(MEDIA_FORMATS).join(', ')}.`);
    accept[type] = format.kind;
  }
  return {
    maxBytes: options.maxBytes ?? DEFAULT_MEDIA_MAX_BYTES,
    accept,
    prefix,
    basePath,
    keyFor: ({ slug, sha256, ext }) => `${prefix}${slug}/${sha256.slice(0, 16)}.${ext}`,
    srcFor: (key) => `${basePath}/${key.split('/').map(encodeURIComponent).join('/')}`,
  };
}

/** Images, video and PDF up to 8 MB, served from `/api/story/media`. */
export const defaultMediaPolicy: StoryMediaPolicy = createMediaPolicy();

// ─── Checking an upload ─────────────────────────────────────────────────────

function sizeLabel(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} bytes`;
}

function acceptedLabels(policy: MediaPolicy): string {
  const labels = Object.keys(policy.accept).map((type) => MEDIA_FORMATS[type]?.label ?? type);
  return labels.length > 1 ? `${labels.slice(0, -1).join(', ')} or ${labels.at(-1)}` : labels[0] ?? 'a supported';
}

export const UPLOAD_MESSAGES = {
  quicktime: 'QuickTime movies don’t play in every browser. Export it as MP4 or WebM.',
  empty: 'That file is empty. Export it again.',
  mismatch: 'That file’s name doesn’t match what’s inside. Export it again, or fix its extension.',
  missingFile: 'Choose a file to upload.',
  slug: 'Couldn’t tell which story this is for. Reload the editor and try again.',
  storage: 'Couldn’t save the file. Try again in a moment.',
} as const;

export const uploadTypeMessage = (policy: MediaPolicy) => `Use a ${acceptedLabels(policy)} file.`;
export const uploadSizeMessage = (policy: MediaPolicy) => `That file is over ${sizeLabel(policy.maxBytes)}. Use a smaller export (for video, try a shorter clip).`;
export const uploadSignatureMessage = (label: string) => `That file doesn’t look like a real ${label}. Export it again.`;

export type UploadCheck =
  | { ok: true; format: MediaFormat }
  | { ok: false; status: 400 | 413 | 415; error: string; code: 'INVALID' | 'TOO_LARGE' | 'UNSUPPORTED' };

/**
 * Checks a file by what it says it is, before reading it: the extension and
 * the declared type must agree on one accepted format, and it must fit.
 */
export function checkUpload(file: { name: string; type: string; size: number }, policy: MediaPolicy): UploadCheck {
  if (['.mov', '.qt'].includes(extensionOf(file.name))) {
    return { ok: false, status: 415, error: UPLOAD_MESSAGES.quicktime, code: 'UNSUPPORTED' };
  }
  const declared = file.type.split(';')[0].trim().toLowerCase();
  const canonical = TYPE_ALIASES[declared] ?? declared;
  if (canonical === 'video/quicktime') return { ok: false, status: 415, error: UPLOAD_MESSAGES.quicktime, code: 'UNSUPPORTED' };

  const byName = formatByExtension(file.name);
  const format = byName ?? (UNDECLARED.has(canonical) ? undefined : MEDIA_FORMATS[canonical]);
  if (!format || !(format.contentType in policy.accept)) {
    return { ok: false, status: 415, error: uploadTypeMessage(policy), code: 'UNSUPPORTED' };
  }
  if (byName && !UNDECLARED.has(canonical) && canonical !== byName.contentType) {
    return { ok: false, status: 415, error: UPLOAD_MESSAGES.mismatch, code: 'UNSUPPORTED' };
  }
  if (file.size <= 0) return { ok: false, status: 400, error: UPLOAD_MESSAGES.empty, code: 'INVALID' };
  if (file.size > policy.maxBytes) return { ok: false, status: 413, error: uploadSizeMessage(policy), code: 'TOO_LARGE' };
  return { ok: true, format };
}

/** Whether the opening bytes look like the format. */
export function matchesSignature(contentType: string, head: Uint8Array): boolean {
  return MEDIA_FORMATS[contentType]?.signature(head) ?? false;
}

/** The format the bytes look like, whatever the file is called. */
export function sniffMediaType(head: Uint8Array): string | null {
  for (const format of Object.values(MEDIA_FORMATS)) if (format.signature(head)) return format.contentType;
  return null;
}

/** SHA-256 of the bytes as lowercase hex, with Web Crypto (browsers, Node, the edge). */
export async function sha256OfBytes(data: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data as Uint8Array<ArrayBuffer>));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

// ─── Serving ────────────────────────────────────────────────────────────────

/** For images and video: if a file is ever opened as a page, it can't run or reach anything. */
export const MEDIA_RESPONSE_CSP = "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox";

/** Browser PDF viewers refuse a sandboxed document, so a PDF loads nothing else and only your pages can frame it. */
export const DOCUMENT_RESPONSE_CSP = "default-src 'none'; frame-ancestors 'self'";

/** One safe path segment: letters, digits, dot, dash, underscore, and never `.` or `..`. */
export function isSafeSegment(segment: string): boolean {
  return /^[A-Za-z0-9._-]+$/.test(segment) && segment !== '.' && segment !== '..';
}

/** A key every segment of which is safe. */
export function isSafeKey(key: string): boolean {
  return key.length > 0 && key.split('/').every(isSafeSegment);
}

/**
 * Parse a single `bytes=start-end` range against a known size. Multi-range
 * and unsatisfiable requests return null, which the media route answers 416.
 */
export function parseByteRange(header: string | null, size: number): { start: number; end: number } | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const [, a, b] = match;
  if (a === '' && b === '') return null;
  let start: number;
  let end: number;
  if (a === '') {
    const suffix = Number(b);
    if (suffix === 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(a);
    end = b === '' ? size - 1 : Math.min(Number(b), size - 1);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) return null;
  return { start, end };
}

function mediaHeaders(head: MediaHead): Headers {
  const headers = new Headers();
  headers.set('content-type', head.contentType || 'application/octet-stream');
  headers.set('accept-ranges', 'bytes');
  headers.set('cache-control', 'private, no-cache');
  headers.set('content-security-policy', head.contentType === 'application/pdf' ? DOCUMENT_RESPONSE_CSP : MEDIA_RESPONSE_CSP);
  headers.set('x-content-type-options', 'nosniff');
  headers.set('cross-origin-resource-policy', 'same-origin');
  if (head.etag) headers.set('etag', head.etag);
  if (head.lastModified) headers.set('last-modified', head.lastModified.toUTCString());
  return headers;
}

function etagMatches(header: string | null, etag: string | undefined): boolean {
  if (!header || !etag) return false;
  if (header.trim() === '*') return true;
  const bare = (tag: string) => tag.trim().replace(/^W\//, '');
  return header.split(',').some((tag) => bare(tag) === bare(etag));
}

export const notFoundResponse = () =>
  new Response(JSON.stringify({ error: 'Not found.', code: 'NOT_FOUND' }), {
    status: 404,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'private, no-store' },
  });

/**
 * Answer a GET or HEAD for one stored object. Call it only once the request
 * may see the object; a signed-out request should get `notFoundResponse()`
 * without this ever touching storage.
 */
export async function serveMediaObject(request: Request, media: MediaStore, key: string): Promise<Response> {
  const head = await media.head(key);
  if (!head) return notFoundResponse();
  const headers = mediaHeaders(head);

  const ifNoneMatch = request.headers.get('if-none-match');
  if (ifNoneMatch ? etagMatches(ifNoneMatch, head.etag) : notModifiedSince(request.headers.get('if-modified-since'), head.lastModified)) {
    return new Response(null, { status: 304, headers });
  }

  // If-Range: honour the range only if the object is unchanged, so a
  // re-upload mid-playback can't splice bytes from two versions.
  const rangeHeader = request.headers.get('range');
  const ifRange = request.headers.get('if-range');
  let rangeApplies = Boolean(rangeHeader);
  if (rangeHeader && ifRange) {
    const isTag = ifRange.startsWith('"') || ifRange.startsWith('W/');
    // A weak tag never matches for ranges (RFC 9110, 13.1.5).
    rangeApplies = isTag ? !ifRange.startsWith('W/') && etagMatches(ifRange, head.etag) : !modifiedSince(ifRange, head.lastModified);
  }
  const range = rangeApplies ? parseByteRange(rangeHeader, head.size) : null;
  if (rangeApplies && !range) {
    headers.set('content-range', `bytes */${head.size}`);
    return new Response(null, { status: 416, headers });
  }

  if (request.method === 'HEAD') {
    headers.set('content-length', String(range ? range.end - range.start + 1 : head.size));
    if (range) headers.set('content-range', `bytes ${range.start}-${range.end}/${head.size}`);
    return new Response(null, { status: range ? 206 : 200, headers });
  }

  const object = await media.get(key, range ?? undefined);
  if (!object) return notFoundResponse();
  // A store that ignored the range sent the whole object: answer it as a 200.
  const served = range ? object.range ?? null : null;
  headers.set('content-length', String(served ? served.end - served.start + 1 : object.size));
  if (served) headers.set('content-range', `bytes ${served.start}-${served.end}/${head.size}`);
  return new Response(object.body, { status: served ? 206 : 200, headers });
}

function notModifiedSince(header: string | null, lastModified: Date | undefined): boolean {
  if (!header || !lastModified) return false;
  const since = Date.parse(header);
  return Number.isFinite(since) && Math.floor(lastModified.getTime() / 1000) <= Math.floor(since / 1000);
}

function modifiedSince(header: string, lastModified: Date | undefined): boolean {
  if (!lastModified) return true;
  const since = Date.parse(header);
  return !Number.isFinite(since) || Math.floor(lastModified.getTime() / 1000) > Math.floor(since / 1000);
}

/** Read a body stream to bytes. */
export async function readAll(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let length = 0;
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    length += value.byteLength;
  }
  const out = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/** A stream over a byte array, for stores that hold bytes. */
export function streamOf(data: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      if (data.byteLength > 0) controller.enqueue(data);
      controller.close();
    },
  });
}

export type { MediaVisibility };
