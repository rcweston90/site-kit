import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createS3MediaStore, S3StorageError } from '../src/s3/index.ts';
import { readAll } from '../src/media.ts';
import { pngBytes } from './fixtures.ts';

/** A pretend S3 endpoint: keeps objects in a map and records what it was sent. No network. */
function fakeS3() {
  const objects = new Map<string, { bytes: Uint8Array; type: string; etag: string }>();
  const requests: Request[] = [];
  const fetch = async (request: Request): Promise<Response> => {
    requests.push(request.clone());
    const url = new URL(request.url);
    const match = /^\/media-bucket\/?(.*)$/.exec(url.pathname);
    if (!match) return new Response('NoSuchBucket', { status: 404 });
    const key = decodeURIComponent(match[1]);
    if (request.method === 'GET' && url.searchParams.get('list-type') === '2') {
      const prefix = url.searchParams.get('prefix') ?? '';
      const keys = [...objects.keys()].filter((entry) => entry.startsWith(prefix)).sort();
      const after = url.searchParams.get('continuation-token');
      const remaining = after ? keys.filter((entry) => entry > after) : keys;
      const page = remaining.slice(0, 1);
      const truncated = remaining.length > 1;
      const xml = `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult>${page.map((entry) => `<Contents><Key>${entry.replace(/&/g, '&amp;')}</Key></Contents>`).join('')}<IsTruncated>${truncated}</IsTruncated>${truncated ? `<NextContinuationToken>${page[0]}</NextContinuationToken>` : ''}</ListBucketResult>`;
      return new Response(xml, { status: 200, headers: { 'content-type': 'application/xml' } });
    }
    if (request.method === 'PUT') {
      const bytes = new Uint8Array(await request.arrayBuffer());
      objects.set(key, { bytes, type: request.headers.get('content-type') ?? '', etag: `"etag-${bytes.byteLength}"` });
      return new Response(null, { status: 200, headers: { etag: `"etag-${bytes.byteLength}"` } });
    }
    const object = objects.get(key);
    if (request.method === 'DELETE') {
      objects.delete(key);
      return new Response(null, { status: 204 });
    }
    if (!object) return new Response('<Error><Code>NoSuchKey</Code></Error>', { status: 404 });
    const headers = { 'content-type': object.type, etag: object.etag, 'last-modified': 'Sun, 01 Mar 2026 12:00:00 GMT' };
    if (request.method === 'HEAD') return new Response(null, { status: 200, headers: { ...headers, 'content-length': String(object.bytes.byteLength) } });
    const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.get('range') ?? '');
    if (range) {
      const start = Number(range[1]);
      const end = range[2] ? Math.min(Number(range[2]), object.bytes.byteLength - 1) : object.bytes.byteLength - 1;
      return new Response(object.bytes.slice(start, end + 1), {
        status: 206,
        headers: { ...headers, 'content-range': `bytes ${start}-${end}/${object.bytes.byteLength}`, 'content-length': String(end - start + 1) },
      });
    }
    return new Response(object.bytes as Uint8Array<ArrayBuffer>, { status: 200, headers: { ...headers, 'content-length': String(object.bytes.byteLength) } });
  };
  return { fetch, objects, requests };
}

const credentials = { accessKeyId: 'TESTKEYID', secretAccessKey: 'test-secret-key', region: 'auto' };

describe('S3 media store (fake endpoint)', () => {
  it('signs and sends a put to endpoint/bucket/key with the type and cache policy', async () => {
    const s3 = fakeS3();
    const store = createS3MediaStore({ endpoint: 'https://storage.example.test', bucket: 'media-bucket', ...credentials, fetch: s3.fetch });
    await store.put({ key: 'stories/field-notes/abc.png', bytes: pngBytes(32), contentType: 'image/png', visibility: 'protected', cacheControl: 'private, no-cache' });
    const [put] = s3.requests;
    assert.equal(put.method, 'PUT');
    assert.equal(put.url, 'https://storage.example.test/media-bucket/stories/field-notes/abc.png');
    assert.match(put.headers.get('authorization') ?? '', /^AWS4-HMAC-SHA256 Credential=TESTKEYID\/\d{8}\/auto\/s3\/aws4_request/);
    assert.ok(put.headers.get('x-amz-date'));
    assert.equal(put.headers.get('content-type'), 'image/png');
    assert.equal(put.headers.get('cache-control'), 'private, no-cache');
    assert.equal(put.headers.get('x-amz-meta-visibility'), 'protected');
    assert.deepEqual(s3.objects.get('stories/field-notes/abc.png')?.bytes, pngBytes(32));
  });

  it('reads heads, whole objects and ranges, and says null for a missing key', async () => {
    const s3 = fakeS3();
    const store = createS3MediaStore({ endpoint: 'https://storage.example.test/', bucket: 'media-bucket', ...credentials, fetch: s3.fetch });
    await store.put({ key: 'stories/a.png', bytes: pngBytes(32), contentType: 'image/png', visibility: 'protected' });

    const head = await store.head('stories/a.png');
    assert.deepEqual({ ...head, lastModified: head?.lastModified?.toISOString() }, {
      size: 32,
      contentType: 'image/png',
      etag: '"etag-32"',
      lastModified: '2026-03-01T12:00:00.000Z',
    });
    const whole = await store.get('stories/a.png');
    assert.deepEqual(await readAll(whole!.body), pngBytes(32));
    assert.equal(whole?.range, undefined);

    const part = await store.get('stories/a.png', { start: 4, end: 7 });
    assert.equal(s3.requests.at(-1)?.headers.get('range'), 'bytes=4-7');
    assert.deepEqual(part?.range, { start: 4, end: 7 });
    assert.equal(part?.size, 32);
    assert.deepEqual(await readAll(part!.body), pngBytes(32).slice(4, 8));

    assert.equal(await store.head('stories/missing.png'), null);
    assert.equal(await store.get('stories/missing.png'), null);
  });

  it('lists with continuation tokens and deletes', async () => {
    const s3 = fakeS3();
    const store = createS3MediaStore({ endpoint: 'https://storage.example.test', bucket: 'media-bucket', ...credentials, fetch: s3.fetch });
    for (const name of ['a', 'b']) await store.put({ key: `stories/${name}.png`, bytes: pngBytes(), contentType: 'image/png', visibility: 'protected' });
    await store.put({ key: 'other/c.png', bytes: pngBytes(), contentType: 'image/png', visibility: 'protected' });
    const first = await store.list('stories/');
    assert.deepEqual(first, { keys: ['stories/a.png'], cursor: 'stories/a.png' });
    assert.deepEqual(await store.list('stories/', first.cursor), { keys: ['stories/b.png'] });
    await store.delete('stories/a.png');
    assert.equal(await store.head('stories/a.png'), null);
  });

  it('addresses a virtual-hosted bucket when asked', async () => {
    const requests: string[] = [];
    const store = createS3MediaStore({
      endpoint: 'https://s3.example.test',
      bucket: 'media-bucket',
      addressing: 'virtual-host',
      ...credentials,
      fetch: async (request) => (requests.push(request.url), new Response(null, { status: 404 })),
    });
    assert.equal(await store.head('stories/a.png'), null);
    assert.deepEqual(requests, ['https://media-bucket.s3.example.test/stories/a.png']);
  });

  it('throws a plain error for anything but success or not found, and refuses unsafe keys', async () => {
    const store = createS3MediaStore({
      endpoint: 'https://storage.example.test',
      bucket: 'media-bucket',
      ...credentials,
      fetch: async () => new Response('<Error/>', { status: 403 }),
    });
    await assert.rejects(store.head('stories/a.png'), (error: unknown) => error instanceof S3StorageError && error.status === 403);
    await assert.rejects(store.put({ key: 'stories/a.png', bytes: pngBytes(), contentType: 'image/png', visibility: 'protected' }), S3StorageError);
    await assert.rejects(store.get('../a.png'), /Unsafe media key/);
  });
});
