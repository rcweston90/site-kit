/**
 * Media as files in a folder, for local development. Content types come from
 * the file extension; keys become paths under `dir` and can't climb out of it.
 */

import { createReadStream } from 'node:fs';
import { mkdir, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import type { MediaHead, MediaObject, MediaStore } from '@rcweston/story-core';
import { MEDIA_FORMATS, isSafeKey } from '../media.js';

export interface FsMediaStoreOptions {
  /** The folder files are written to. Created when needed. */
  dir: string;
  /** How many keys one `list` page returns. Default 1000. */
  pageSize?: number;
}

const TYPE_BY_EXTENSION = new Map<string, string>(
  Object.values(MEDIA_FORMATS).flatMap((format) => format.extensions.map((ext) => [ext, format.contentType] as const)),
);

function contentTypeOf(key: string): string {
  const dot = key.lastIndexOf('.');
  return (dot === -1 ? undefined : TYPE_BY_EXTENSION.get(key.slice(dot).toLowerCase())) ?? 'application/octet-stream';
}

export function createFsMediaStore(options: FsMediaStoreOptions): MediaStore {
  const root = resolve(options.dir);
  const pageSize = options.pageSize ?? 1000;

  const pathOf = (key: string) => {
    if (!isSafeKey(key)) throw new Error(`Unsafe media key: ${key}`);
    const path = resolve(root, ...key.split('/'));
    if (!path.startsWith(root + sep)) throw new Error(`Unsafe media key: ${key}`);
    return path;
  };

  async function headOf(key: string): Promise<(MediaHead & { path: string }) | null> {
    let path: string;
    try {
      path = pathOf(key);
    } catch {
      return null;
    }
    try {
      const info = await stat(path);
      if (!info.isFile()) return null;
      return {
        path,
        size: info.size,
        contentType: contentTypeOf(key),
        etag: `"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`,
        lastModified: new Date(Math.floor(info.mtimeMs / 1000) * 1000),
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT' || (error as NodeJS.ErrnoException).code === 'ENOTDIR') return null;
      throw error;
    }
  }

  async function walk(directory: string): Promise<string[]> {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
    const files: string[] = [];
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) files.push(...(await walk(path)));
      else if (entry.isFile() && !entry.name.endsWith('.uploading')) files.push(relative(root, path).split(sep).join('/'));
    }
    return files;
  }

  return {
    async put({ key, bytes }) {
      const path = pathOf(key);
      await mkdir(dirname(path), { recursive: true });
      // Write beside, then move into place, so a reader never sees half a file.
      const temporary = `${path}.${crypto.randomUUID()}.uploading`;
      await writeFile(temporary, bytes);
      await rename(temporary, path);
      return { key };
    },

    async get(key, range): Promise<MediaObject | null> {
      const head = await headOf(key);
      if (!head) return null;
      const { path, ...info } = head;
      if (!range || head.size === 0) return { ...info, body: Readable.toWeb(createReadStream(path)) as ReadableStream<Uint8Array> };
      const end = Math.min(range.end ?? head.size - 1, head.size - 1);
      if (range.start > end) return { ...info, body: Readable.toWeb(createReadStream(path)) as ReadableStream<Uint8Array> };
      return {
        ...info,
        body: Readable.toWeb(createReadStream(path, { start: range.start, end })) as ReadableStream<Uint8Array>,
        range: { start: range.start, end },
      };
    },

    async head(key) {
      const head = await headOf(key);
      if (!head) return null;
      const { path: _path, ...info } = head;
      return info;
    },

    async delete(key) {
      await rm(pathOf(key), { force: true });
    },

    async list(prefix, cursor) {
      const keys = (await walk(root)).filter((key) => key.startsWith(prefix) && (!cursor || key > cursor)).sort();
      const page = keys.slice(0, pageSize);
      return keys.length > pageSize ? { keys: page, cursor: page.at(-1) } : { keys: page };
    },
  };
}
