import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { ConfigError, adminProblem, planStorage, readConfig } from '../lib/config.ts';
import { openDatabase, openMedia } from '../lib/storage.ts';
import { createBackend } from '../lib/story.ts';

const scratch = mkdtempSync(join(tmpdir(), 'site-kit-storage-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

describe('config', () => {
  it('keeps everything under .data by default', () => {
    const config = readConfig({}, '/srv/site');
    assert.deepEqual(config.storage, { kind: 'pglite', dir: '/srv/site/.data/pglite' });
    assert.deepEqual(config.media, { kind: 'disk', dir: '/srv/site/.data/media' });
    assert.equal(config.autoMigrate, true);
    assert.equal(config.seed, true);
    assert.equal(config.siteUrl.href, 'http://localhost:3000/');
  });

  it('uses a hosted Postgres and an S3 bucket when they are set', () => {
    const config = readConfig({
      SITE_KIT_DATABASE_URL: 'postgres://studio@db.example.com:5432/site',
      SITE_KIT_S3_ENDPOINT: 'https://s3.example.com',
      SITE_KIT_S3_BUCKET: 'uploads',
      SITE_KIT_S3_ACCESS_KEY_ID: 'id',
      SITE_KIT_S3_SECRET_ACCESS_KEY: 'key',
      SITE_KIT_AUTO_MIGRATE: 'false',
      SITE_KIT_SITE_URL: 'https://fieldnote.example',
    }, '/srv/site');
    assert.deepEqual(config.storage, { kind: 'postgres', url: 'postgres://studio@db.example.com:5432/site' });
    assert.equal(config.media.kind, 's3');
    assert.equal(config.autoMigrate, false);
    assert.equal(config.siteUrl.origin, 'https://fieldnote.example');
  });

  it('keeps everything in memory when asked', () => {
    const config = readConfig({ SITE_KIT_STORAGE: 'memory', SITE_KIT_DATABASE_URL: 'postgres://ignored' });
    assert.deepEqual([config.storage.kind, config.media.kind], ['memory', 'memory']);
    assert.match(planStorage(config, {}).warnings.join(' '), /lost when the server restarts/);
  });

  it('names what is missing from a half-set bucket and refuses unclear values', () => {
    assert.throws(() => readConfig({ SITE_KIT_S3_BUCKET: 'uploads' }), (error: Error) =>
      error instanceof ConfigError && /SITE_KIT_S3_ENDPOINT, SITE_KIT_S3_ACCESS_KEY_ID, SITE_KIT_S3_SECRET_ACCESS_KEY/.test(error.message));
    assert.throws(() => readConfig({ SITE_KIT_AUTO_MIGRATE: 'sometimes' }), ConfigError);
    assert.throws(() => readConfig({ SITE_KIT_STORAGE: 'sqlite' }), ConfigError);
    assert.throws(() => readConfig({ SITE_KIT_SITE_URL: 'fieldnote' }), ConfigError);
  });
});

describe('storage plan', () => {
  it('falls back to memory, and says so, when the disk can’t be written', () => {
    const blocker = join(scratch, 'not-a-folder');
    writeFileSync(blocker, '');
    const plan = planStorage(readConfig({ SITE_KIT_DATA_DIR: join(blocker, 'data') }), {});
    assert.deepEqual([plan.storage.kind, plan.media.kind], ['memory', 'memory']);
    assert.match(plan.warnings[0]!, /can't write/);
  });

  it('warns on a serverless host, where the disk doesn’t last', () => {
    const plan = planStorage(readConfig({ SITE_KIT_DATA_DIR: join(scratch, 'ephemeral') }), { AWS_LAMBDA_FUNCTION_NAME: 'site' });
    assert.equal(plan.storage.kind, 'pglite');
    assert.match(plan.warnings[0]!, /stories \(SITE_KIT_DATABASE_URL\) and uploads \(SITE_KIT_S3_\*\)/);
  });

  it('has nothing to warn about with a hosted database and bucket', () => {
    const config = readConfig({
      SITE_KIT_DATABASE_URL: 'postgres://db.example.com/site',
      SITE_KIT_S3_ENDPOINT: 'https://s3.example.com', SITE_KIT_S3_BUCKET: 'b', SITE_KIT_S3_ACCESS_KEY_ID: 'i', SITE_KIT_S3_SECRET_ACCESS_KEY: 'k',
    });
    assert.deepEqual(planStorage(config, { VERCEL: '1' }).warnings, []);
  });
});

describe('the embedded database', () => {
  it('keeps stories across restarts and seeds only once', async () => {
    const env = { SITE_KIT_DATA_DIR: join(scratch, 'site') };
    const first = await createBackend(readConfig(env));
    const seeded = await first.store.list();
    assert.ok(seeded.length > 0, 'seeded on first start');
    // A draft-only story, so it can be deleted outright.
    const draft = seeded.find((story) => story.slug === 'pricing-page')!;
    assert.ok(draft && first.store.delete);
    await first.store.delete(draft.slug);
    const remaining = (await first.store.list()).map((story) => story.slug);
    await first.close();

    const second = await createBackend(readConfig(env));
    assert.deepEqual((await second.store.list()).map((story) => story.slug), remaining, 'same stories, no second seed');
    assert.deepEqual(await second.site.stores['story-placement'].get('clinic-booking').then((row) => row?.value), false, 'site settings kept');
    await second.close();
  });

  it('serves the seed’s drawn covers from disk as SVG', async () => {
    const media = await openMedia({ kind: 'disk', dir: join(scratch, 'media') });
    await media.put({ key: 'stories/sample/cover.svg', bytes: new TextEncoder().encode('<svg/>'), contentType: 'image/svg+xml', visibility: 'public' });
    assert.equal((await media.head('stories/sample/cover.svg'))?.contentType, 'image/svg+xml');
    assert.deepEqual((await media.list('stories/')).keys, ['stories/sample/cover.svg']);
  });

  it('refuses a second server on the same folder', async () => {
    const dir = join(scratch, 'shared', 'pglite');
    const database = await openDatabase({ kind: 'pglite', dir });
    writeFileSync(`${dir}.pid`, String(process.ppid));
    await assert.rejects(openDatabase({ kind: 'pglite', dir }), /Another server/);
    await database!.close();
  });
});

describe('sign-in that isn’t set up', () => {
  it('has defaults under next dev and names what a production server is missing', () => {
    assert.equal(adminProblem(readConfig({})), null);
    assert.match(adminProblem(readConfig({ NODE_ENV: 'production' }))!, /SITE_KIT_ADMIN_PASSCODE and SITE_KIT_SESSION_SECRET are not set/);
    assert.match(adminProblem(readConfig({ NODE_ENV: 'production', SITE_KIT_ADMIN_PASSCODE: 'harbor' }))!, /because SITE_KIT_SESSION_SECRET is not set/);
    assert.match(adminProblem(readConfig({ SITE_KIT_SESSION_SECRET: 'short' }))!, /too short/);
    assert.equal(adminProblem(readConfig({ NODE_ENV: 'production', SITE_KIT_ADMIN_PASSCODE: 'harbor', SITE_KIT_SESSION_SECRET: 'x'.repeat(32) })), null);
  });

  it('keeps the public site up and refuses only the admin', async () => {
    const site = await createBackend(readConfig({ NODE_ENV: 'production', SITE_KIT_STORAGE: 'memory' }));
    try {
      assert.ok((await site.store.list()).length > 0, 'seeded and readable');
      const read = await site.story.handle(new Request('http://localhost/api/story/session'));
      assert.deepEqual(await read.json(), { authenticated: false, role: null });
      const signIn = await site.story.handle(new Request('http://localhost/api/story/session', {
        method: 'POST', headers: { origin: 'http://localhost', 'content-type': 'application/json' }, body: JSON.stringify({ passcode: 'studio' }),
      }));
      assert.equal(signIn.status, 503);
      assert.match((await signIn.json() as { error: string }).error, /SITE_KIT_ADMIN_PASSCODE/);
      const save = await site.siteHandler(new Request('http://localhost/api/site/work-order', { method: 'PUT', body: '{}' }));
      assert.equal(save.status, 503);
    } finally {
      await site.close();
    }
  });
});
