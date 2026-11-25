/**
 * Media on any S3-compatible bucket (AWS S3, Cloudflare R2, MinIO, and the
 * like), signed with aws4fetch, so it runs wherever `fetch` does.
 */

import { AwsClient } from 'aws4fetch';
import type { MediaHead, MediaObject, MediaStore } from '@rcweston/story-core';
import { isSafeKey } from '../media.js';

export interface S3MediaStoreOptions {
  /** The service's base URL, e.g. `https://s3.us-east-1.amazonaws.com` or your R2 or MinIO endpoint. */
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  /** Default `auto` (what R2 expects); use your bucket's region on AWS. */
  region?: string;
  /** `path` (the default) addresses `endpoint/bucket/key`, which every S3-compatible service accepts. */
  addressing?: 'path' | 'virtual-host';
  /** For tests and custom runtimes. Default: the global `fetch`. */
  fetch?: (request: Request) => Promise<Response>;
}

/** The service answered something other than success or "not found". */
export class S3StorageError extends Error {
  readonly status: number;
  constructor(action: string, status: number) {
    super(`Storage refused to ${action} (HTTP ${status}).`);
    this.name = 'S3StorageError';
    this.status = status;
  }
}

const encodeKey = (key: string) => key.split('/').map(encodeURIComponent).join('/');

function decodeXml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, '&');
}

function headFrom(response: Response): MediaHead {
  const range = response.headers.get('content-range');
  const total = range ? Number(range.split('/')[1]) : Number(response.headers.get('content-length'));
  const modified = response.headers.get('last-modified');
  return {
    size: Number.isFinite(total) ? total : 0,
    contentType: response.headers.get('content-type') ?? 'application/octet-stream',
    etag: response.headers.get('etag') ?? undefined,
    lastModified: modified ? new Date(modified) : undefined,
  };
}

export function createS3MediaStore(options: S3MediaStoreOptions): MediaStore {
  const aws = new AwsClient({
    accessKeyId: options.accessKeyId,
    secretAccessKey: options.secretAccessKey,
    sessionToken: options.sessionToken,
    service: 's3',
    region: options.region ?? 'auto',
    retries: 0,
  });
  const send = options.fetch ?? ((request: Request) => fetch(request));
  const endpoint = new URL(options.endpoint);
  const base = options.addressing === 'virtual-host'
    ? `${endpoint.protocol}//${options.bucket}.${endpoint.host}${endpoint.pathname.replace(/\/+$/, '')}`
    : `${endpoint.origin}${endpoint.pathname.replace(/\/+$/, '')}/${encodeURIComponent(options.bucket)}`;

  const objectUrl = (key: string) => {
    if (!isSafeKey(key)) throw new Error(`Unsafe media key: ${key}`);
    return `${base}/${encodeKey(key)}`;
  };
  const request = async (url: string, init: RequestInit) => send(await aws.sign(url, init));

  return {
    async put({ key, bytes, contentType, visibility, cacheControl }) {
      const headers: Record<string, string> = {
        'content-type': contentType,
        'content-length': String(bytes.byteLength),
        'x-amz-meta-visibility': visibility,
      };
      if (cacheControl) headers['cache-control'] = cacheControl;
      const response = await request(objectUrl(key), { method: 'PUT', headers, body: bytes as Uint8Array<ArrayBuffer> });
      if (!response.ok) throw new S3StorageError('store the file', response.status);
      await response.body?.cancel();
      return { key };
    },

    async get(key, range): Promise<MediaObject | null> {
      const headers: Record<string, string> = {};
      if (range) headers.range = `bytes=${range.start}-${range.end ?? ''}`;
      const response = await request(objectUrl(key), { method: 'GET', headers });
      if (response.status === 404) {
        await response.body?.cancel();
        return null;
      }
      if (!response.ok || !response.body) throw new S3StorageError('read the file', response.status);
      const object: MediaObject = { ...headFrom(response), body: response.body };
      const contentRange = response.status === 206 ? /^bytes (\d+)-(\d+)\/(\d+|\*)$/.exec(response.headers.get('content-range') ?? '') : null;
      if (contentRange) object.range = { start: Number(contentRange[1]), end: Number(contentRange[2]) };
      return object;
    },

    async head(key) {
      const response = await request(objectUrl(key), { method: 'HEAD' });
      if (response.status === 404) return null;
      if (!response.ok) throw new S3StorageError('look up the file', response.status);
      return headFrom(response);
    },

    async delete(key) {
      const response = await request(objectUrl(key), { method: 'DELETE' });
      await response.body?.cancel();
      if (!response.ok && response.status !== 404) throw new S3StorageError('delete the file', response.status);
    },

    async list(prefix, cursor) {
      const url = new URL(`${base}/`);
      url.searchParams.set('list-type', '2');
      url.searchParams.set('prefix', prefix);
      if (cursor) url.searchParams.set('continuation-token', cursor);
      const response = await request(url.toString(), { method: 'GET' });
      if (!response.ok) throw new S3StorageError('list files', response.status);
      const xml = await response.text();
      const keys = [...xml.matchAll(/<Key>([\s\S]*?)<\/Key>/g)].map((match) => decodeXml(match[1]));
      const truncated = /<IsTruncated>true<\/IsTruncated>/.test(xml);
      const next = /<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/.exec(xml)?.[1];
      return truncated && next ? { keys, cursor: decodeXml(next) } : { keys };
    },
  };
}
