/** Media in memory, for demos and tests. Serves byte ranges like the real stores. */

import type { MediaHead, MediaObject, MediaStore, MediaVisibility } from '@rcweston/story-core';
import { sha256OfBytes, streamOf } from '../media.js';

interface StoredObject {
  bytes: Uint8Array;
  contentType: string;
  visibility: MediaVisibility;
  cacheControl?: string;
  etag: string;
  lastModified: Date;
}

export interface MemoryMediaStore extends MediaStore {
  /** The stored object's details, for tests. */
  inspect(key: string): { size: number; contentType: string; visibility: MediaVisibility; cacheControl?: string } | null;
}

export interface MemoryMediaStoreOptions {
  /** How many keys one `list` page returns. Default 1000. */
  pageSize?: number;
  now?: () => Date;
}

export function createMemoryMediaStore(options: MemoryMediaStoreOptions = {}): MemoryMediaStore {
  const objects = new Map<string, StoredObject>();
  const pageSize = options.pageSize ?? 1000;
  const now = options.now ?? (() => new Date());

  const headOf = (object: StoredObject): MediaHead => ({
    size: object.bytes.byteLength,
    contentType: object.contentType,
    etag: object.etag,
    lastModified: object.lastModified,
  });

  return {
    async put({ key, bytes, contentType, visibility, cacheControl }) {
      const copy = new Uint8Array(bytes);
      const etag = `"${(await sha256OfBytes(copy)).slice(0, 32)}"`;
      // Whole seconds, as HTTP dates carry them.
      const lastModified = new Date(Math.floor(now().getTime() / 1000) * 1000);
      objects.set(key, { bytes: copy, contentType, visibility, cacheControl, etag, lastModified });
      return { key };
    },

    async get(key, range): Promise<MediaObject | null> {
      const object = objects.get(key);
      if (!object) return null;
      const head = headOf(object);
      if (!range) return { ...head, body: streamOf(object.bytes) };
      const end = Math.min(range.end ?? object.bytes.byteLength - 1, object.bytes.byteLength - 1);
      if (range.start > end) return { ...head, body: streamOf(object.bytes) };
      return { ...head, body: streamOf(object.bytes.slice(range.start, end + 1)), range: { start: range.start, end } };
    },

    async head(key) {
      const object = objects.get(key);
      return object ? headOf(object) : null;
    },

    async delete(key) {
      objects.delete(key);
    },

    async list(prefix, cursor) {
      const keys = [...objects.keys()].filter((key) => key.startsWith(prefix) && (!cursor || key > cursor)).sort();
      const page = keys.slice(0, pageSize);
      return keys.length > pageSize ? { keys: page, cursor: page.at(-1) } : { keys: page };
    },

    inspect(key) {
      const object = objects.get(key);
      return object
        ? { size: object.bytes.byteLength, contentType: object.contentType, visibility: object.visibility, cacheControl: object.cacheControl }
        : null;
    },
  };
}
