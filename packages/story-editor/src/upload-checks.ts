/*
 * The checks the editor runs on a file before it uploads one: the extension
 * and the declared type agree on one allowed format, the file fits, and its
 * opening bytes are what the name claims. The server should run the same
 * checks again; these exist so the author hears about a bad file at once.
 */

export type StoryUploadKind = 'image' | 'video';

interface UploadType {
  kind: StoryUploadKind;
  label: string;
  /** The file's opening bytes, so a renamed file can't pass as another type. */
  signature: (head: Uint8Array) => boolean;
}

const ascii = (head: Uint8Array, at: number, text: string) =>
  [...text].every((char, index) => head[at + index] === char.charCodeAt(0));

const UPLOAD_TYPES: Record<string, UploadType> = {
  'image/png': { kind: 'image', label: 'PNG', signature: (head) => [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => head[index] === byte) },
  'image/jpeg': { kind: 'image', label: 'JPEG', signature: (head) => head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff },
  'image/webp': { kind: 'image', label: 'WebP', signature: (head) => ascii(head, 0, 'RIFF') && ascii(head, 8, 'WEBP') },
  'image/gif': { kind: 'image', label: 'GIF', signature: (head) => ascii(head, 0, 'GIF87a') || ascii(head, 0, 'GIF89a') },
  // QuickTime is ISO media too, but its `qt  ` brand won't play in Chrome or
  // Firefox even when the file is named .mp4.
  'video/mp4': { kind: 'video', label: 'MP4', signature: (head) => ascii(head, 4, 'ftyp') && !ascii(head, 8, 'qt  ') },
  'video/webm': { kind: 'video', label: 'WebM', signature: (head) => [0x1a, 0x45, 0xdf, 0xa3].every((byte, index) => head[index] === byte) },
};

const BY_EXTENSION: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
  mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
};

/** Browsers and operating systems name a few formats differently. */
const TYPE_ALIASES: Record<string, string> = {
  'image/jpg': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
  'video/x-m4v': 'video/mp4',
};

/** Declared types that say nothing, so only the extension can decide. */
const UNDECLARED = new Set(['', 'application/octet-stream']);

/** How many opening bytes `matchesStoryUploadSignature` reads. */
export const STORY_UPLOAD_SIGNATURE_BYTES = 16;

/** The default size limit: 4 MB. Pass your server's own to `checkStoryUpload`. */
export const STORY_UPLOAD_MAX_BYTES = 4 * 1024 * 1024;

/** For a file input's `accept`: the allowed types, plus extensions for
 *  pickers that filter by name. */
export const STORY_UPLOAD_ACCEPT = [
  ...Object.keys(UPLOAD_TYPES),
  '.png', '.jpg', '.jpeg', '.webp', '.gif', '.mp4', '.webm',
].join(',');

const megabytes = (bytes: number) => `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;

export const UPLOAD_ERRORS = {
  type: 'Use a PNG, JPEG, WebP, GIF, MP4 or WebM file.',
  quicktime: 'QuickTime movies don’t play in every browser. Export it as MP4 or WebM.',
  size: (maxBytes: number) => `That file is over ${megabytes(maxBytes)}. Use a smaller export (for video, try a shorter clip).`,
  empty: 'That file is empty. Export it again.',
  mismatch: 'That file’s name doesn’t match what’s inside. Export it again, or fix its extension.',
  storage: 'Couldn’t save the file. Try again in a moment.',
} as const;

export type StoryUploadCheck =
  | { ok: true; contentType: string; kind: StoryUploadKind; label: string }
  | { ok: false; error: string };

export function checkStoryUpload(file: { name: string; type: string; size: number }, maxBytes = STORY_UPLOAD_MAX_BYTES): StoryUploadCheck {
  const extension = /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase() ?? '';
  const byName = BY_EXTENSION[extension];
  if (byName === 'video/quicktime') return { ok: false, error: UPLOAD_ERRORS.quicktime };
  const type = byName ? UPLOAD_TYPES[byName] : undefined;
  if (!byName || !type) return { ok: false, error: UPLOAD_ERRORS.type };
  const declared = file.type.split(';')[0].trim().toLowerCase();
  const canonical = TYPE_ALIASES[declared] ?? declared;
  if (!UNDECLARED.has(canonical) && canonical !== byName) return { ok: false, error: UPLOAD_ERRORS.mismatch };
  if (file.size <= 0) return { ok: false, error: UPLOAD_ERRORS.empty };
  if (file.size > maxBytes) return { ok: false, error: UPLOAD_ERRORS.size(maxBytes) };
  return { ok: true, contentType: byName, kind: type.kind, label: type.label };
}

export function matchesStoryUploadSignature(contentType: string, head: Uint8Array): boolean {
  return UPLOAD_TYPES[contentType]?.signature(head) ?? false;
}

export function signatureError(label: string): string {
  return `That file doesn’t look like a real ${label}. Export it again.`;
}
