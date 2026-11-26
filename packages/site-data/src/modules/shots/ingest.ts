/**
 * The image ingestion step: turn a raw upload into a single web-ready asset
 * plus the metadata the gallery needs, so nothing has to be reprocessed at
 * render time.
 *
 * With sharp installed (an optional peer dependency), one pass does it all:
 *  - `.rotate()` bakes in EXIF orientation, then drops it (sharp doesn't copy
 *    source metadata to the output, so GPS/EXIF is stripped — privacy + bytes),
 *  - resize the long edge to <= MAX_EDGE (camera originals are 12MP+; these are
 *    only ever shown ~800–1600px),
 *  - re-encode to webp.
 * Then we read the *output's* real dimensions and derive a tiny LQIP blur.
 *
 * Without sharp the file is kept as uploaded (PNG, JPEG, GIF or WebP only),
 * with its dimensions read from its header and no blur. A host can pass its
 * own `ingest` instead (a HEIC decoder, a hosted image service).
 *
 * An unreadable file throws so the caller can report which upload failed.
 */

export interface IngestedImage {
  /** Processed, web-ready image bytes. */
  bytes: Uint8Array;
  contentType: string;
  ext: string;
  /** Intrinsic dimensions of the processed image (post-rotate/resize). */
  width: number;
  height: number;
  /** Base64 LQIP (~20px webp) for a blur-up placeholder, when one could be made. */
  blurDataURL: string | null;
}

export type IngestImage = (input: Uint8Array) => Promise<IngestedImage>;

const MAX_EDGE = 2000;
const WEBP_QUALITY = 82;

interface SharpLike {
  (input: Uint8Array, options?: { failOn?: string }): SharpPipeline;
  format: Record<string, { input?: { buffer?: boolean } } | undefined>;
}
interface SharpPipeline {
  rotate(): SharpPipeline;
  resize(options: Record<string, unknown>): SharpPipeline;
  resize(width: number, height: number, options?: Record<string, unknown>): SharpPipeline;
  webp(options: { quality: number }): SharpPipeline;
  toBuffer(): Promise<Uint8Array>;
  metadata(): Promise<{ width?: number; height?: number }>;
}

let sharpModule: Promise<SharpLike | null> | null = null;
/** sharp, when the host installed it. Looked up once. */
function loadSharp(): Promise<SharpLike | null> {
  const name = 'sharp';
  sharpModule ??= import(/* webpackIgnore: true */ name)
    .then((mod: { default?: unknown }) => ((mod.default ?? mod) as SharpLike))
    .catch(() => null);
  return sharpModule;
}

const toBase64 = (bytes: Uint8Array) => Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');

async function ingestWithSharp(sharp: SharpLike, input: Uint8Array): Promise<IngestedImage> {
  const bytes = await sharp(input, { failOn: 'none' })
    .rotate()
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();

  const meta = await sharp(bytes).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) {
    throw new Error('Could not read processed image dimensions');
  }

  const tiny = await sharp(bytes)
    .resize(20, 20, { fit: 'inside' })
    .webp({ quality: 45 })
    .toBuffer();
  const blurDataURL = `data:image/webp;base64,${toBase64(tiny)}`;

  return { bytes: new Uint8Array(bytes), contentType: 'image/webp', ext: 'webp', width, height, blurDataURL };
}

/** Width and height from a PNG, GIF, WebP or JPEG header, or null. */
export function readImageSize(bytes: Uint8Array): { width: number; height: number; contentType: string; ext: string } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (start: number, length: number) => String.fromCharCode(...bytes.subarray(start, start + length));
  if (bytes.length >= 24 && bytes[0] === 0x89 && ascii(1, 3) === 'PNG') {
    return { width: view.getUint32(16), height: view.getUint32(20), contentType: 'image/png', ext: 'png' };
  }
  if (bytes.length >= 10 && ascii(0, 3) === 'GIF') {
    return { width: view.getUint16(6, true), height: view.getUint16(8, true), contentType: 'image/gif', ext: 'gif' };
  }
  if (bytes.length >= 30 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
    const chunk = ascii(12, 4);
    const webp = { contentType: 'image/webp', ext: 'webp' };
    if (chunk === 'VP8X') return { width: 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)), height: 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)), ...webp };
    if (chunk === 'VP8L') {
      const bits = view.getUint32(21, true);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1, ...webp };
    }
    if (chunk === 'VP8 ') return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff, ...webp };
    return null;
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) return null;
      const marker = bytes[offset + 1];
      const length = view.getUint16(offset + 2);
      // Start of frame (baseline, progressive and the rest), but not DHT/JPG/DAC.
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { width: view.getUint16(offset + 7), height: view.getUint16(offset + 5), contentType: 'image/jpeg', ext: 'jpg' };
      }
      offset += 2 + length;
    }
  }
  return null;
}

async function ingestAsIs(input: Uint8Array): Promise<IngestedImage> {
  const size = readImageSize(input);
  if (!size || !size.width || !size.height) throw new Error('Unsupported or corrupt image');
  return { bytes: input, contentType: size.contentType, ext: size.ext, width: size.width, height: size.height, blurDataURL: null };
}

/** The default: sharp when it's installed, the upload as it is otherwise. */
export const ingestImage: IngestImage = async (input) => {
  const sharp = await loadSharp();
  return sharp ? ingestWithSharp(sharp, input) : ingestAsIs(input);
};

/** For tests: the fallback path, whatever is installed. */
export const ingestWithoutSharp: IngestImage = ingestAsIs;
