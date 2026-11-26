import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { deflateSync } from 'node:zlib';
import { PGlite } from '@electric-sql/pglite';
import type { AuthAdapter } from '@rcweston/story-core';
import { createMemoryMediaStore, createOpenAuth } from '@rcweston/story-server/memory';
import { createPasscodeAuth } from '@rcweston/story-server/passcode';
import {
  VersionConflictError,
  altFromFilename,
  createSiteData,
  ingestImage,
  ingestWithoutSharp,
  migrate,
  parseShotsPatch,
  publicPhotos,
  readImageSize,
  shots,
  sortShots,
  type ShotRecord,
} from '../src/index.ts';

const MODULES = [shots] as const;

/** A small valid PNG, made here so the tests need no file on disk. */
function png(width = 12, height = 8): Uint8Array {
  const crc = (buf: Buffer) => {
    let c = ~0;
    for (const b of buf) {
      c ^= b;
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return ~c >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4);
    data.copy(out, 8);
    out.writeUInt32BE(crc(Buffer.concat([Buffer.from(type), data])), 8 + data.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const rows = Buffer.alloc(height * (1 + width * 3), 0);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) rows.set([40 + x * 10, 120, 60 + y * 10], y * (1 + width * 3) + 1 + x * 3);
  return new Uint8Array(Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]));
}

const at = (handle: (request: Request) => Promise<Response>) => (path: string, init: RequestInit & { json?: unknown } = {}) =>
  handle(
    new Request(`http://site.local/api/site${path}`, {
      ...init,
      headers: { ...(init.json !== undefined ? { 'content-type': 'application/json' } : {}), ...(init.headers as Record<string, string> | undefined) },
      body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
    }),
  );

const upload = (name: string, bytes: Uint8Array, type = 'image/png') => {
  const form = new FormData();
  form.append('file', new File([bytes as Uint8Array<ArrayBuffer>], name, { type }));
  return { method: 'POST', body: form } as RequestInit;
};

function harness(options: { sql?: PGlite; auth?: AuthAdapter; revalidated?: string[][]; withSharp?: boolean } = {}) {
  const media = createMemoryMediaStore();
  const site = createSiteData({
    modules: MODULES,
    sql: options.sql,
    config: { shots: options.withSharp ? {} : { ingest: ingestWithoutSharp } },
    services: { media },
  });
  const handlers = site.handlers({ auth: options.auth ?? createOpenAuth(), revalidate: (paths) => void options.revalidated?.push(paths) });
  return { site, media, request: at(handlers.handle) };
}

describe('shots model', () => {
  it('reads a caption from a file name and sorts by the hand-set order', () => {
    assert.equal(altFromFilename('harbor-wall_2019.jpg'), 'harbor wall 2019');
    const at = (id: number, sort: number, created: string) => ({ id, sort_order: sort, created_at: created });
    assert.deepEqual(sortShots([at(1, 1, 'a'), at(2, 0, 'a'), at(3, 1, 'b')]).map((shot) => shot.id), [2, 3, 1]);
  });

  it('takes a caption, a visibility switch or an order, and nothing else', () => {
    assert.deepEqual(parseShotsPatch({ id: 3, alt: 'Pier at dusk', expectedVersion: 2 }), { kind: 'shot', id: 3, alt: 'Pier at dusk', expectedVersion: 2 });
    assert.deepEqual(parseShotsPatch({ id: 3, hidden: true }), { kind: 'shot', id: 3, hidden: true, expectedVersion: undefined });
    assert.deepEqual(parseShotsPatch({ order: [3, 1, 3, 2] }), { kind: 'order', ids: [3, 1, 2], expectedVersion: undefined });
    assert.equal(parseShotsPatch({ id: 3 }), null);
    assert.equal(parseShotsPatch({ id: 'x', alt: 'a' }), null);
    assert.equal(parseShotsPatch({ order: [1, -2] }), null);
    assert.equal(parseShotsPatch({ id: 1, alt: 'a', expectedVersion: -1 }), null);
    assert.equal(parseShotsPatch({ id: 1, alt: 'x'.repeat(600) }), null);
  });

  it('reads the size of PNG, GIF, WebP and JPEG files from their headers', () => {
    assert.deepEqual(readImageSize(png(30, 20)), { width: 30, height: 20, contentType: 'image/png', ext: 'png' });
    const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 5, 0, 7, 0, 0, 0]);
    assert.deepEqual(readImageSize(gif), { width: 5, height: 7, contentType: 'image/gif', ext: 'gif' });
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, 0, 40, 0, 60, 3, 0, 0, 0]);
    assert.deepEqual(readImageSize(jpeg), { width: 60, height: 40, contentType: 'image/jpeg', ext: 'jpg' });
    assert.equal(readImageSize(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>')), null);
  });

  it('ingests with sharp: webp, dimensions and a blur placeholder', async () => {
    const out = await ingestImage(png(40, 20));
    assert.equal(out.contentType, 'image/webp');
    assert.deepEqual([out.width, out.height], [40, 20]);
    assert.match(out.blurDataURL ?? '', /^data:image\/webp;base64,/);
    await assert.rejects(ingestImage(new TextEncoder().encode('not an image')));
  });
});

for (const backend of ['memory', 'postgres'] as const) {
  describe(`shots on ${backend}`, () => {
    async function setup(options: Parameters<typeof harness>[0] = {}) {
      if (backend === 'memory') return { ...harness(options), close: async () => undefined };
      const sql = new PGlite();
      await migrate({ client: sql, modules: MODULES });
      return { ...harness({ ...options, sql }), close: () => sql.close() };
    }

    it('keeps shots in order, refuses stale captions and orders, and deletes', async () => {
      const { site, close } = await setup();
      try {
        const store = site.stores.shots;
        const a = await store.insert({ pathname: 'shots/a.webp', width: 3, height: 2, alt: 'A' });
        const b = await store.insert({ pathname: 'shots/b.webp', width: 2, height: 3, alt: 'B', blurDataURL: 'data:,b' });
        const c = await store.insert({ pathname: 'shots/c.webp', width: 1, height: 1 });
        assert.deepEqual((await store.list()).shots.map((shot) => shot.id), [a.id, b.id, c.id]);
        // Idempotent on the file.
        const again = await store.insert({ pathname: 'shots/a.webp', width: 6, height: 4 });
        assert.equal(again.id, a.id);
        assert.equal(again.alt, 'A');

        const edited = await store.update(a.id, { alt: 'A pier' }, a.version);
        assert.equal(edited?.alt, 'A pier');
        assert.equal(edited?.version, a.version + 1);
        await assert.rejects(store.update(a.id, { alt: 'stale' }, a.version), (error: unknown) =>
          error instanceof VersionConflictError && (error.current as { alt: string }).alt === 'A pier');
        assert.equal(await store.update(9999, { alt: 'nobody' }), null);
        const hidden = await store.update(b.id, { hidden: true });
        assert.equal(hidden?.hidden, true);
        assert.equal(hidden?.alt, 'B');

        const { order } = await store.list();
        assert.equal(order.version, 0);
        const moved = await store.reorder([c.id, a.id], 0);
        assert.equal(moved.version, 1);
        assert.deepEqual((await store.list()).shots.map((shot) => shot.id), [c.id, a.id, b.id]);
        await assert.rejects(store.reorder([a.id, c.id], 0), VersionConflictError);

        const removed = await store.remove(a.id);
        assert.equal(removed?.pathname, 'shots/a.webp');
        assert.equal(await store.remove(a.id), null);
        assert.deepEqual((await store.list()).shots.map((shot) => shot.id), [c.id, b.id]);
      } finally {
        await close();
      }
    });

    it('uploads, captions, hides, reorders and deletes through the handlers', async () => {
      const revalidated: string[][] = [];
      const { site, media, request, close } = await setup({ revalidated });
      try {
        assert.deepEqual(await (await request('/shots')).json(), { shots: [], order: { version: 0, updatedAt: null } });
        assert.deepEqual(await site.reads.shots.photos(), []);

        const first = await request('/shots', upload('ferry-pier_dusk.png', png(30, 20)));
        assert.equal(first.status, 200);
        const { shot } = (await first.json()) as { shot: ShotRecord };
        assert.equal(shot.alt, 'ferry pier dusk');
        assert.deepEqual([shot.width, shot.height], [30, 20]);
        assert.match(shot.pathname, /^shots\/[0-9a-f-]+\.png$/);
        assert.equal(shot.url, `/api/site/shots/media/${shot.pathname}`);
        assert.ok(await media.head(shot.pathname));
        assert.deepEqual(revalidated.at(-1), ['/shots', '/']);
        const second = ((await (await request('/shots', upload('kiln.png', png(10, 10)))).json()) as { shot: ShotRecord }).shot;

        // The file is served publicly.
        const file = await request(`/shots/media/${shot.pathname}`);
        assert.equal(file.status, 200);
        assert.equal(file.headers.get('content-type'), 'image/png');
        assert.equal((await request('/shots/media/stories/elsewhere.png')).status, 404);

        // Refused uploads.
        assert.equal((await request('/shots', { method: 'POST', body: new FormData() })).status, 400);
        assert.equal((await request('/shots', upload('notes.txt', new TextEncoder().encode('hello'), 'image/png'))).status, 422);

        // Caption, with a stale save refused.
        const captioned = await request('/shots', { method: 'PATCH', json: { id: shot.id, alt: 'Ferry pier at dusk', expectedVersion: shot.version } });
        assert.equal(captioned.status, 200);
        const stale = await request('/shots', { method: 'PATCH', json: { id: shot.id, alt: 'Old', expectedVersion: shot.version } });
        assert.equal(stale.status, 409);
        assert.equal(((await stale.json()) as { current: ShotRecord }).current.alt, 'Ferry pier at dusk');
        assert.equal((await request('/shots', { method: 'PATCH', json: { id: 999, alt: 'x' } })).status, 404);
        assert.equal((await request('/shots', { method: 'PATCH', json: { nonsense: true } })).status, 400);

        // Order, with a stale one refused.
        const reordered = await request('/shots', { method: 'PATCH', json: { order: [second.id, shot.id], expectedVersion: 0 } });
        assert.equal(reordered.status, 200);
        assert.equal(((await reordered.json()) as { order: { version: number } }).order.version, 1);
        assert.equal((await request('/shots', { method: 'PATCH', json: { order: [shot.id, second.id], expectedVersion: 0 } })).status, 409);

        // Hidden shots stay in the admin list and leave the public gallery.
        await request('/shots', { method: 'PATCH', json: { id: second.id, hidden: true } });
        const listed = (await (await request('/shots')).json()) as { shots: ShotRecord[] };
        assert.deepEqual(listed.shots.map((row) => [row.id, row.hidden]), [[second.id, true], [shot.id, false]]);
        const photos = (await (await request('/shots/photos')).json()) as { src: string; alt: string }[];
        assert.deepEqual(photos.map((photo) => photo.alt), ['Ferry pier at dusk']);
        assert.deepEqual(await site.reads.shots.photos(), photos);

        // Delete removes the record and the file Shots uploaded.
        assert.equal((await request('/shots', { method: 'DELETE', json: { id: shot.id } })).status, 200);
        assert.equal(await media.head(shot.pathname), null);
        assert.equal((await request('/shots', { method: 'DELETE', json: { id: shot.id } })).status, 404);
        assert.equal((await request('/shots', { method: 'DELETE', json: { id: 'one' } })).status, 400);
        assert.deepEqual((await site.reads.shots.all()).map((row) => row.id), [second.id]);
      } finally {
        await close();
      }
    });
  });
}

describe('shots handlers', () => {
  it('asks for a session for everything but the gallery and its files', async () => {
    const auth = createPasscodeAuth({ passcode: 'open sesame', secret: 'a-test-secret-that-is-long-enough-to-sign' });
    const { request, site, media } = harness({ auth });
    assert.equal((await request('/shots')).status, 401);
    assert.equal((await request('/shots', upload('a.png', png()))).status, 401);
    assert.equal((await request('/shots', { method: 'PATCH', json: { id: 1, alt: 'x' } })).status, 401);
    assert.equal((await request('/shots', { method: 'DELETE', json: { id: 1 } })).status, 401);
    await media.put({ key: 'shots/seed.png', bytes: png(), contentType: 'image/png', visibility: 'public' });
    await site.stores.shots.insert({ pathname: 'shots/seed.png', width: 12, height: 8, alt: 'Seed' });
    assert.equal((await request('/shots/photos')).status, 200);
    assert.equal((await request('/shots/media/shots/seed.png')).status, 200);
  });

  it('refuses a file over the limit and says when uploads aren’t set up', async () => {
    const site = createSiteData({ modules: MODULES, config: { shots: { maxUpload: 10, ingest: ingestWithoutSharp } }, services: { media: createMemoryMediaStore() } });
    const request = at(site.handlers({ auth: createOpenAuth() }).handle);
    const tooBig = await request('/shots', upload('a.png', png()));
    assert.equal(tooBig.status, 413);
    const bare = createSiteData({ modules: MODULES });
    assert.equal((await at(bare.handlers({ auth: createOpenAuth() }).handle)('/shots', upload('a.png', png()))).status, 503);
  });

  it('ingests with sharp by default', async () => {
    const { request } = harness({ withSharp: true });
    const { shot } = (await (await request('/shots', upload('big.png', png(40, 20)))).json()) as { shot: ShotRecord };
    assert.match(shot.pathname, /\.webp$/);
    assert.match(shot.blur_data_url ?? '', /^data:image\/webp/);
  });

  it('serves files from a host’s own address when it gives one', async () => {
    const site = createSiteData({ modules: MODULES, config: { shots: { src: (key) => `https://cdn.example/${key}` } } });
    await site.stores.shots.insert({ pathname: 'shots/x.webp', width: 4, height: 3, alt: 'X' });
    assert.deepEqual(await site.reads.shots.photos(), [{ src: 'https://cdn.example/shots/x.webp', alt: 'X', width: 4, height: 3 }]);
    assert.deepEqual(publicPhotos([]), []);
    assert.throws(() => createSiteData({ modules: MODULES, config: { shots: { prefix: '../' } } }), /prefix/);
  });
});
