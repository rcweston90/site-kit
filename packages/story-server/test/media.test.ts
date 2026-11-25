import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import type { MediaStore } from '@rcweston/story-core';
import { checkUpload, createMediaPolicy, defaultMediaPolicy, parseByteRange, readAll, sniffMediaType } from '../src/media.ts';
import { createMemoryMediaStore, createMemoryTransport } from '../src/memory/index.ts';
import { createFsMediaStore } from '../src/fs/index.ts';
import { createPasscodeAuth } from '../src/passcode/index.ts';
import { StoryRequestError } from '../src/client.ts';
import { file, pdfBytes, pngBytes } from './fixtures.ts';

describe('upload checks', () => {
  const policy = createMediaPolicy({ maxBytes: 100 });

  it('accepts a file whose name and declared type agree', () => {
    const check = checkUpload({ name: 'cover.PNG', type: 'image/png', size: 10 }, policy);
    assert.equal(check.ok && check.format.contentType, 'image/png');
    assert.equal(checkUpload({ name: 'clip.mp4', type: '', size: 10 }, policy).ok, true);
    assert.equal(checkUpload({ name: 'photo.jpeg', type: 'image/jpg', size: 10 }, policy).ok, true);
    assert.equal(checkUpload({ name: 'deck.pdf', type: 'application/pdf', size: 10 }, policy).ok, true);
  });

  it('refuses mismatched, unsupported, QuickTime, empty and too-large files in plain words', () => {
    const mismatch = checkUpload({ name: 'cover.png', type: 'image/jpeg', size: 10 }, policy);
    assert.deepEqual(mismatch.ok ? null : [mismatch.status, mismatch.code], [415, 'UNSUPPORTED']);
    const svg = checkUpload({ name: 'logo.svg', type: 'image/svg+xml', size: 10 }, policy);
    assert.equal(!svg.ok && svg.status, 415);
    assert.match(!svg.ok ? svg.error : '', /^Use a PNG, JPEG/);
    const mov = checkUpload({ name: 'clip.mov', type: 'video/quicktime', size: 10 }, policy);
    assert.match(!mov.ok ? mov.error : '', /QuickTime/);
    const empty = checkUpload({ name: 'cover.png', type: 'image/png', size: 0 }, policy);
    assert.equal(!empty.ok && empty.status, 400);
    const big = checkUpload({ name: 'cover.png', type: 'image/png', size: 101 }, policy);
    assert.deepEqual(big.ok ? null : [big.status, big.code], [413, 'TOO_LARGE']);
    assert.equal(!big.ok && big.error, 'That file is over 100 bytes. Use a smaller export (for video, try a shorter clip).');
    assert.match(checkUpload({ name: 'a.png', type: 'image/png', size: 9e6 }, defaultMediaPolicy).ok ? '' : (checkUpload({ name: 'a.png', type: 'image/png', size: 9e6 }, defaultMediaPolicy) as { error: string }).error, /over 8 MB/);
  });

  it('honours a narrower accept list', () => {
    const images = createMediaPolicy({ accept: ['image/png'] });
    assert.equal(checkUpload({ name: 'deck.pdf', type: 'application/pdf', size: 10 }, images).ok, false);
    assert.throws(() => createMediaPolicy({ accept: ['image/svg+xml'] }));
  });

  it('sniffs formats from their opening bytes', () => {
    assert.equal(sniffMediaType(pngBytes()), 'image/png');
    assert.equal(sniffMediaType(pdfBytes()), 'application/pdf');
    assert.equal(sniffMediaType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg');
    const mp4 = new Uint8Array(16);
    mp4.set(new TextEncoder().encode('\0\0\0\x18ftypisom'));
    assert.equal(sniffMediaType(mp4), 'video/mp4');
    const quicktime = new Uint8Array(16);
    quicktime.set(new TextEncoder().encode('\0\0\0\x14ftypqt  '));
    assert.equal(sniffMediaType(quicktime), null);
    assert.equal(sniffMediaType(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>')), null);
  });

  it('keys uploads by content hash under the story', () => {
    const key = defaultMediaPolicy.keyFor({ slug: 'field-notes', sha256: 'ab'.repeat(32), ext: 'png' });
    assert.equal(key, `stories/field-notes/${'ab'.repeat(8)}.png`);
    assert.equal(defaultMediaPolicy.srcFor(key, 'protected'), `/api/story/media/${key}`);
    assert.equal(defaultMediaPolicy.maxBytes, 8 * 1024 * 1024);
  });

  it('parses single byte ranges', () => {
    assert.deepEqual(parseByteRange('bytes=0-9', 100), { start: 0, end: 9 });
    assert.deepEqual(parseByteRange('bytes=90-', 100), { start: 90, end: 99 });
    assert.deepEqual(parseByteRange('bytes=-10', 100), { start: 90, end: 99 });
    assert.deepEqual(parseByteRange('bytes=50-500', 100), { start: 50, end: 99 });
    assert.equal(parseByteRange('bytes=100-', 100), null);
    assert.equal(parseByteRange('bytes=0-1,5-6', 100), null);
    assert.equal(parseByteRange('items=0-1', 100), null);
    assert.equal(parseByteRange('bytes=-0', 100), null);
  });
});

/** A media store that counts every call, to prove a signed-out request never reaches it. */
function counted(store: MediaStore) {
  const calls: string[] = [];
  const wrapped: MediaStore = {
    put: (input) => (calls.push('put'), store.put(input)),
    get: (key, range) => (calls.push('get'), store.get(key, range)),
    head: (key) => (calls.push('head'), store.head(key)),
    delete: (key) => (calls.push('delete'), store.delete(key)),
    list: (prefix, cursor) => (calls.push('list'), store.list(prefix, cursor)),
  };
  return { store: wrapped, calls };
}

describe('uploading and serving media through the handlers', () => {
  async function uploaded(options: Parameters<typeof createMemoryTransport>[0] = {}, bytes = pngBytes(64)) {
    const transport = createMemoryTransport(options);
    const media = await transport.uploadMedia(file(bytes, 'cover.png', 'image/png'), { slug: 'field-notes' });
    return { transport, media };
  }

  it('stores an upload under its content hash and answers with its source', async () => {
    const { transport, media } = await uploaded();
    assert.equal(media.kind, 'image');
    assert.equal(media.contentType, 'image/png');
    assert.equal(media.size, 64);
    assert.match(media.key, /^stories\/field-notes\/[0-9a-f]{16}\.png$/);
    assert.equal(media.src, `/api/story/media/${media.key}`);
    // The same bytes again are the same object.
    const again = await transport.uploadMedia(file(pngBytes(64), 'renamed.png', 'image/png'), { slug: 'field-notes' });
    assert.equal(again.key, media.key);
    assert.deepEqual((await transport.media.list('stories/')).keys, [media.key]);
  });

  it('refuses a file whose bytes are not what its name says', async () => {
    const transport = createMemoryTransport();
    await assert.rejects(
      transport.uploadMedia(file(pngBytes(64), 'cover.jpg', 'image/jpeg'), { slug: 'field-notes' }),
      (error: unknown) => error instanceof StoryRequestError && error.status === 415 && /real JPEG/.test(error.message),
    );
    await assert.rejects(
      transport.uploadMedia(file(new TextEncoder().encode('<svg/>'), 'logo.svg', 'image/svg+xml'), { slug: 'field-notes' }),
      (error: unknown) => error instanceof StoryRequestError && error.code === 'UNSUPPORTED',
    );
  });

  it('refuses a file over the size limit, and a bad story address', async () => {
    const transport = createMemoryTransport({ mediaPolicy: createMediaPolicy({ maxBytes: 32 }) });
    await assert.rejects(
      transport.uploadMedia(file(pngBytes(64), 'cover.png', 'image/png'), { slug: 'field-notes' }),
      (error: unknown) => error instanceof StoryRequestError && error.status === 413 && error.code === 'TOO_LARGE',
    );
    await assert.rejects(
      transport.uploadMedia(file(pngBytes(16), 'cover.png', 'image/png'), { slug: '../escape' }),
      (error: unknown) => error instanceof StoryRequestError && error.status === 400,
    );
  });

  it('serves private, revalidated, sandboxed responses', async () => {
    const { transport, media } = await uploaded();
    const response = await transport.fetch(media.src);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/png');
    assert.equal(response.headers.get('cache-control'), 'private, no-cache');
    assert.equal(response.headers.get('accept-ranges'), 'bytes');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.match(response.headers.get('content-security-policy') ?? '', /sandbox/);
    assert.equal(response.headers.get('content-length'), '64');
    assert.ok(response.headers.get('etag'));
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), pngBytes(64));

    const head = await transport.fetch(media.src, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(head.headers.get('content-length'), '64');
    assert.equal((await head.arrayBuffer()).byteLength, 0);
  });

  it('serves PDFs without the sandbox, which browser viewers refuse', async () => {
    const transport = createMemoryTransport();
    const media = await transport.uploadMedia(file(pdfBytes(), 'deck.pdf', 'application/pdf'), { slug: 'field-notes' });
    assert.equal(media.kind, 'pdf');
    const response = await transport.fetch(media.src);
    assert.equal(response.headers.get('content-security-policy'), "default-src 'none'; frame-ancestors 'self'");
  });

  it('answers byte ranges with 206, and bad ranges with 416', async () => {
    const bytes = pngBytes(100, 1).map((byte, index) => (index < 8 ? byte : index));
    const { transport, media } = await uploaded({}, bytes);
    const part = await transport.fetch(media.src, { headers: { range: 'bytes=10-19' } });
    assert.equal(part.status, 206);
    assert.equal(part.headers.get('content-range'), 'bytes 10-19/100');
    assert.equal(part.headers.get('content-length'), '10');
    assert.deepEqual([...new Uint8Array(await part.arrayBuffer())], [10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);

    const tail = await transport.fetch(media.src, { headers: { range: 'bytes=-5' } });
    assert.equal(tail.headers.get('content-range'), 'bytes 95-99/100');

    const bad = await transport.fetch(media.src, { headers: { range: 'bytes=200-300' } });
    assert.equal(bad.status, 416);
    assert.equal(bad.headers.get('content-range'), 'bytes */100');
  });

  it('answers 304 to a matching If-None-Match, and ignores a range whose If-Range is stale', async () => {
    const { transport, media } = await uploaded();
    const first = await transport.fetch(media.src);
    const etag = first.headers.get('etag')!;
    const cached = await transport.fetch(media.src, { headers: { 'if-none-match': etag } });
    assert.equal(cached.status, 304);
    assert.equal(cached.headers.get('etag'), etag);
    assert.equal((await cached.arrayBuffer()).byteLength, 0);
    assert.equal((await transport.fetch(media.src, { headers: { 'if-none-match': '"something-else"' } })).status, 200);

    const fresh = await transport.fetch(media.src, { headers: { range: 'bytes=0-3', 'if-range': etag } });
    assert.equal(fresh.status, 206);
    const stale = await transport.fetch(media.src, { headers: { range: 'bytes=0-3', 'if-range': '"older"' } });
    assert.equal(stale.status, 200);
    assert.equal(stale.headers.get('content-length'), '64');

    const since = await transport.fetch(media.src, { headers: { 'if-modified-since': new Date(Date.now() + 60_000).toUTCString() } });
    assert.equal(since.status, 304);
  });

  it('answers 404 to a signed-out reader before touching storage', async () => {
    const memory = createMemoryMediaStore();
    const { store, calls } = counted(memory);
    const auth = createPasscodeAuth({ passcode: 'open sesame', secret: 'a-test-secret-that-is-long-enough-to-sign' });
    const admin = createMemoryTransport({ media: store });
    const media = await admin.uploadMedia(file(pngBytes(), 'cover.png', 'image/png'), { slug: 'field-notes' });

    const locked = createMemoryTransport({ store: admin.store, media: store, auth });
    calls.length = 0;
    const response = await locked.fetch(media.src);
    assert.equal(response.status, 404);
    assert.equal((await locked.fetch(media.src, { method: 'HEAD' })).status, 404);
    assert.deepEqual(calls, []);

    // Signed in, the same address serves the file.
    const signedIn = await locked.fetch('/api/story/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ passcode: 'open sesame' }),
    });
    const cookie = (signedIn.headers.get('set-cookie') ?? '').split(';')[0];
    assert.equal((await locked.fetch(media.src, { headers: { cookie } })).status, 200);
  });

  it('serves nothing outside its prefix, and no unsafe keys', async () => {
    const memory = createMemoryMediaStore();
    await memory.put({ key: 'elsewhere/secret.png', bytes: pngBytes(), contentType: 'image/png', visibility: 'protected' });
    const transport = createMemoryTransport({ media: memory });
    assert.equal((await transport.fetch('/api/story/media/elsewhere/secret.png')).status, 404);
    assert.equal((await transport.fetch('/api/story/media/stories/%2E%2E/elsewhere/secret.png')).status, 404);
    assert.equal((await transport.fetch('/api/story/media/stories/missing.png')).status, 404);
  });
});

describe('fs media store', () => {
  const dirs: string[] = [];
  after(() => Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true }))));

  it('writes files, serves ranges, lists and deletes', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'story-media-'));
    dirs.push(dir);
    const store = createFsMediaStore({ dir, pageSize: 1 });
    await store.put({ key: 'stories/field-notes/a.png', bytes: pngBytes(40), contentType: 'image/png', visibility: 'protected' });
    await store.put({ key: 'stories/field-notes/b.pdf', bytes: pdfBytes(20), contentType: 'application/pdf', visibility: 'protected' });

    const head = await store.head('stories/field-notes/a.png');
    assert.equal(head?.size, 40);
    assert.equal(head?.contentType, 'image/png');
    assert.match(head?.etag ?? '', /^"[0-9a-f]+-[0-9a-f]+"$/);

    const whole = await store.get('stories/field-notes/a.png');
    assert.deepEqual(await readAll(whole!.body), pngBytes(40));
    const part = await store.get('stories/field-notes/a.png', { start: 2, end: 5 });
    assert.deepEqual(part?.range, { start: 2, end: 5 });
    assert.deepEqual(await readAll(part!.body), pngBytes(40).slice(2, 6));

    const first = await store.list('stories/');
    assert.deepEqual(first.keys, ['stories/field-notes/a.png']);
    const second = await store.list('stories/', first.cursor);
    assert.deepEqual(second, { keys: ['stories/field-notes/b.pdf'] });

    await store.delete('stories/field-notes/a.png');
    assert.equal(await store.head('stories/field-notes/a.png'), null);
    assert.equal(await store.get('stories/field-notes/a.png'), null);
    await assert.rejects(store.put({ key: '../outside.png', bytes: pngBytes(), contentType: 'image/png', visibility: 'protected' }));
    assert.equal(await store.head('../outside.png'), null);
  });

  it('serves through the handlers with ranges', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'story-media-'));
    dirs.push(dir);
    const transport = createMemoryTransport({ media: createFsMediaStore({ dir }) });
    const media = await transport.uploadMedia(file(pngBytes(50), 'cover.png', 'image/png'), { slug: 'field-notes' });
    const part = await transport.fetch(media.src, { headers: { range: 'bytes=0-7' } });
    assert.equal(part.status, 206);
    assert.deepEqual(new Uint8Array(await part.arrayBuffer()), pngBytes(50).slice(0, 8));
  });
});
