import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import type { AuthAdapter, Story } from '@rcweston/story-core';
import { createMemoryDocumentStore, createMemoryMediaStore, createOpenAuth } from '@rcweston/story-server/memory';
import { createPasscodeAuth } from '@rcweston/story-server/passcode';
import { collectMigrations, createSiteData, defineModule, HOST_MIGRATION_RANGE, migrate, MIGRATION_RANGES, SITE_DATA_MODULES, type SiteDataModule } from '../src/index.ts';

const config = {
  'site-resources': {
    pages: [{ path: '/stories', label: 'Stories' }, { path: '/about', label: 'About' }],
    resources: [{ id: 'style-guide', path: '/resources/style-guide', label: 'Style guide', description: 'The footer link.' }],
  },
};

function story(slug: string, src?: string): Story {
  return {
    slug,
    company: 'Fieldnote Studio',
    title: `The ${slug.replace(/-/g, ' ')}`,
    thesis: 'As the design lead, I rebuilt the guide around questions readers asked.',
    period: '2025',
    facts: [],
    glance: { situation: 'Lost readers.', task: 'Answer them.', action: 'Rewrote it.', result: 'Fewer tickets.' },
    chapters: [
      { key: 'situation', title: 'Lost.', blocks: src ? [{ id: 'm1', type: 'media', media: { kind: 'image', src, alt: 'A sketch' } }] : [] },
      { key: 'task', title: 'Answer.', blocks: [] },
      { key: 'action', title: 'Rewrite.', blocks: [] },
      { key: 'result', title: 'Fewer.', blocks: [] },
    ],
  };
}

const at = (handle: (request: Request) => Promise<Response>) => (path: string, init: RequestInit & { json?: unknown } = {}) =>
  handle(
    new Request(`http://site.local/api/site${path}`, {
      ...init,
      headers: { ...(init.json !== undefined ? { 'content-type': 'application/json' } : {}), ...(init.headers as Record<string, string> | undefined) },
      body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
    }),
  );

function harness(options: { sql?: PGlite; auth?: AuthAdapter; revalidated?: string[][] } = {}) {
  const documents = createMemoryDocumentStore();
  const media = createMemoryMediaStore({ pageSize: 2 });
  const site = createSiteData({ modules: SITE_DATA_MODULES, sql: options.sql, config, services: { documents, media } });
  const handlers = site.handlers({ auth: options.auth ?? createOpenAuth(), revalidate: (paths) => void options.revalidated?.push(paths) });
  return { site, documents, media, request: at(handlers.handle) };
}

describe('migrations', () => {
  it('gives every module its reserved range, and no two ranges overlap', () => {
    for (const module of SITE_DATA_MODULES) {
      assert.deepEqual([...module.migrationRange], [...MIGRATION_RANGES[module.id as keyof typeof MIGRATION_RANGES]], module.id);
    }
    const ranges = [...Object.values(MIGRATION_RANGES), HOST_MIGRATION_RANGE].sort((a, b) => a[0] - b[0]);
    for (let index = 1; index < ranges.length; index++) assert.ok(ranges[index][0] > ranges[index - 1][1], `${ranges[index]} overlaps`);
  });

  it('embeds exactly the .sql files in each module folder', async () => {
    for (const module of SITE_DATA_MODULES) {
      const dir = new URL(`../src/modules/${module.id}/migrations/`, import.meta.url);
      const names = await readdir(dir).then((list) => list.filter((name) => name.endsWith('.sql')).sort(), () => []);
      const fromFolder = await Promise.all(names.map(async (name) => ({ name, sql: await readFile(new URL(name, dir), 'utf8') })));
      assert.deepEqual([...module.migrations], fromFolder, `Run pnpm build after changing ${module.id}'s migrations.`);
    }
  });

  it('keeps each module inside its own number range', () => {
    const names = collectMigrations(SITE_DATA_MODULES).map((migration) => migration.name);
    assert.deepEqual(names, ['1000_site_page_visibility.sql', '1100_site_work_order.sql', '1200_site_story_placement.sql', '1700_site_shots.sql', '1701_site_shots_order.sql']);
    const stray = defineModule({ ...SITE_DATA_MODULES[1], id: 'stray', migrationRange: [2000, 2099] }) as SiteDataModule;
    assert.throws(() => collectMigrations([stray]), /outside its range 2000–2099/);
    assert.throws(() => collectMigrations([SITE_DATA_MODULES[0], { ...SITE_DATA_MODULES[1], migrationRange: [1050, 1150] } as SiteDataModule]), /overlapping/);
    assert.throws(() => collectMigrations([], [{ name: '0001_mine.sql', sql: '' }]), /outside its range 9000–9999/);
  });

  it('applies everything once, a second run is a no-op, and a dry run changes nothing', async () => {
    const db = new PGlite();
    try {
      const dry = await migrate({ client: db, modules: SITE_DATA_MODULES, dryRun: true });
      assert.equal(dry.pending.length, 5);
      const { rows } = await db.query<{ name: string | null }>(`SELECT to_regclass('site_data_migrations')::text AS name`);
      assert.equal(rows[0].name, null);
      const first = await migrate({ client: db, modules: SITE_DATA_MODULES });
      assert.equal(first.applied.length, 5);
      const again = await migrate({ client: db, modules: SITE_DATA_MODULES });
      assert.deepEqual(again.applied, []);
      const edited = SITE_DATA_MODULES.map((module) =>
        module.id === 'work-order' ? { ...module, migrations: [{ name: module.migrations[0].name, sql: `${module.migrations[0].sql}\n-- edited` }] } : module,
      ) as SiteDataModule[];
      await assert.rejects(migrate({ client: db, modules: edited }), /changed after it was applied/);
    } finally {
      await db.close();
    }
  });
});

for (const backend of ['memory', 'postgres'] as const) {
  describe(`modules on ${backend}`, () => {
    async function setup(options: Parameters<typeof harness>[0] = {}) {
      if (backend === 'memory') return { ...harness(options), close: async () => undefined };
      const sql = new PGlite();
      await migrate({ client: sql, modules: SITE_DATA_MODULES });
      return { ...harness({ ...options, sql }), close: () => sql.close() };
    }

    it('switches pages and resources, refuses a stale switch, and reads them publicly', async () => {
      const revalidated: string[][] = [];
      const { site, request, close } = await setup({ revalidated });
      try {
        const pages = await (await request('/site-resources/pages')).json();
        assert.deepEqual(pages.pages.map((page: { path: string; enabled: boolean; version: number }) => [page.path, page.enabled, page.version]), [['/stories', true, 0], ['/about', true, 0]]);
        const off = await request('/site-resources/pages', { method: 'POST', json: { path: '/stories', enabled: false, expectedVersion: 0 } });
        assert.equal(off.status, 200);
        const saved = (await off.json()).page;
        assert.equal(saved.enabled, false);
        assert.equal(saved.version, 1);
        assert.deepEqual(revalidated, [['/', '/stories']]);

        const stale = await request('/site-resources/pages', { method: 'POST', json: { path: '/stories', enabled: true, expectedVersion: 0 } });
        assert.equal(stale.status, 409);
        const conflict = await stale.json();
        assert.equal(conflict.code, 'CONFLICT');
        assert.equal(conflict.current.version, 1);
        assert.equal(conflict.current.value, false);

        assert.equal((await request('/site-resources/pages', { method: 'POST', json: { path: '/nowhere', enabled: false } })).status, 400);
        assert.equal(await site.reads['site-resources'].isPathVisible('/stories/field-notes'), false);
        assert.equal(await site.reads['site-resources'].isPathVisible('/about'), true);
        assert.deepEqual(await site.reads['site-resources'].hiddenPaths(), ['/stories']);

        const resource = await request('/site-resources/resources', { method: 'POST', json: { resource: 'style-guide', visible: false } });
        assert.equal((await resource.json()).resource.visible, false);
        assert.deepEqual(await site.reads['site-resources'].resourceVisibility(), { 'style-guide': false });
      } finally {
        await close();
      }
    });

    it('saves a story order, refuses a stale order, and sorts through renames', async () => {
      const { site, documents, request, close } = await setup();
      try {
        const empty = await (await request('/work-order?list=stories')).json();
        assert.deepEqual(empty.order, { list: 'stories', slugs: [], version: 0, updatedAt: null });
        const saved = await request('/work-order', { method: 'PUT', json: { list: 'stories', slugs: ['field-notes', 'harbor-map'], expectedVersion: 0 } });
        assert.equal(saved.status, 200);
        const order = (await saved.json()).order;
        assert.equal(order.version, 1);
        const next = await request('/work-order', { method: 'PUT', json: { list: 'stories', slugs: ['harbor-map', 'field-notes'], expectedVersion: 1 } });
        assert.equal((await next.json()).order.version, 2);
        const stale = await request('/work-order', { method: 'PUT', json: { list: 'stories', slugs: ['field-notes'], expectedVersion: 1 } });
        assert.equal(stale.status, 409);
        assert.deepEqual((await stale.json()).current.value, ['harbor-map', 'field-notes']);
        assert.equal((await request('/work-order', { method: 'PUT', json: { list: 'stories', slugs: ['Not A Slug'] } })).status, 400);
        assert.equal((await request('/work-order', { method: 'PUT', json: { list: 'elsewhere', slugs: [] } })).status, 400);

        await documents.saveDraft({ slug: 'harbor-map', content: story('harbor-map'), parentDocumentId: null, source: { kind: 'test', ref: 't' } });
        const latest = await documents.latest('harbor-map');
        await documents.rename({ from: 'harbor-map', to: 'harbor-chart', expectedLatestDocumentId: latest!.id, source: { kind: 'rename', ref: 'harbor-map' } });
        assert.deepEqual(await site.reads['work-order'].order(), ['harbor-chart', 'field-notes']);
        const sorted = await site.reads['work-order'].sort(['new-one', 'field-notes', 'harbor-chart'], (slug) => slug);
        assert.deepEqual(sorted, ['harbor-chart', 'field-notes', 'new-one']);
      } finally {
        await close();
      }
    });

    it('lists and unlists stories, following renames', async () => {
      const { site, documents, request, close } = await setup();
      try {
        const off = await request('/story-placement/field-notes', { method: 'PUT', json: { listed: false, expectedVersion: 0 } });
        assert.equal((await off.json()).placement.listed, false);
        assert.equal((await request('/story-placement/field-notes', { method: 'PUT', json: { listed: true, expectedVersion: 0 } })).status, 409);
        assert.deepEqual([...(await site.reads['story-placement'].hiddenSlugs())], ['field-notes']);

        await documents.saveDraft({ slug: 'field-notes', content: story('field-notes'), parentDocumentId: null, source: { kind: 'test', ref: 't' } });
        const latest = await documents.latest('field-notes');
        await documents.rename({ from: 'field-notes', to: 'field-journal', expectedLatestDocumentId: latest!.id, source: { kind: 'rename', ref: 'field-notes' } });
        assert.equal(await site.reads['story-placement'].isListed('field-journal'), false);
        const listed = await (await request('/story-placement')).json();
        assert.deepEqual(listed.placements.map((placement: { slug: string; version: number }) => [placement.slug, placement.version]), [['field-journal', 0]]);
        const back = await request('/story-placement/field-journal', { method: 'PUT', json: { listed: true, expectedVersion: 0 } });
        assert.equal(back.status, 200);
        assert.equal(await site.reads['story-placement'].isListed('field-journal'), true);
      } finally {
        await close();
      }
    });
  });
}

describe('media library', () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

  it('lists uploaded images by story, with what uses them, pages them and searches them', async () => {
    const { documents, media, request } = harness();
    for (const key of ['stories/field-notes/aaa.png', 'stories/field-notes/bbb.png', 'stories/harbor-map/ccc.png', 'stories/harbor-map/notes.pdf']) {
      await media.put({ key, bytes: png, contentType: key.endsWith('.pdf') ? 'application/pdf' : 'image/png', visibility: 'public' });
    }
    await documents.saveDraft({ slug: 'harbor-map', content: story('harbor-map', '/api/story/media/stories/field-notes/bbb.png'), parentDocumentId: null, source: { kind: 'test', ref: 't' } });

    const all = await (await request('/media-library?scope=all')).json();
    assert.deepEqual(all.items.map((item: { key: string }) => item.key), ['stories/field-notes/aaa.png', 'stories/field-notes/bbb.png', 'stories/harbor-map/ccc.png']);
    const used = all.items.find((item: { key: string }) => item.key.endsWith('bbb.png'));
    assert.deepEqual(used.usedIn, [{ slug: 'harbor-map', title: 'The harbor map' }]);
    assert.equal(used.src, '/api/story/media/stories/field-notes/bbb.png');
    assert.equal(used.size, png.byteLength);
    assert.equal(all.next, null);

    const own = await (await request('/media-library?scope=story&slug=harbor-map')).json();
    assert.deepEqual(own.items.map((item: { key: string }) => item.key), ['stories/field-notes/bbb.png', 'stories/harbor-map/ccc.png']);
    assert.ok(own.items.every((item: { available: boolean }) => item.available));

    const search = await (await request('/media-library?scope=all&search=harbor')).json();
    assert.deepEqual(search.items.map((item: { key: string }) => item.key), ['stories/field-notes/bbb.png', 'stories/harbor-map/ccc.png']);

    const site = createSiteData({ modules: SITE_DATA_MODULES, config: { 'media-library': { pageSize: 2 } }, services: { documents, media } });
    const first = await site.reads['media-library'].page({ scope: 'all' });
    assert.equal(first.items.length, 2);
    assert.equal(first.next, 'stories/field-notes/bbb.png');
    const second = await site.reads['media-library'].page({ scope: 'all', after: first.next });
    assert.deepEqual(second.items.map((item) => item.key), ['stories/harbor-map/ccc.png']);
    assert.equal(second.next, null);

    const item = await (await request('/media-library/item?key=stories/harbor-map/ccc.png')).json();
    assert.equal(item.item.contentType, 'image/png');
    assert.equal((await request('/media-library/item?key=stories/harbor-map/gone.png')).status, 404);
    assert.equal((await request('/media-library?scope=elsewhere')).status, 400);
  });
});

describe('handlers', () => {
  it('asks for a session, refuses other sites and wrong methods', async () => {
    const auth = createPasscodeAuth({ passcode: 'open sesame', secret: 'a-test-secret-that-is-long-enough-to-sign' });
    const { request } = harness({ auth });
    assert.equal((await request('/site-resources/pages')).status, 401);
    const { request: open } = harness();
    assert.equal((await open('/site-resources/pages', { method: 'POST', json: { path: '/about', enabled: false }, headers: { origin: 'https://elsewhere.example' } })).status, 403);
    const wrong = await open('/site-resources/pages', { method: 'DELETE' });
    assert.equal(wrong.status, 405);
    assert.equal(wrong.headers.get('allow'), 'GET, POST');
    assert.equal((await open('/nowhere')).status, 404);
    assert.equal((await open('/site-resources/pages', { method: 'POST', body: 'not json', headers: { 'content-type': 'application/json' } })).status, 400);
  });

  it('never fails a save because revalidation threw', async () => {
    const errors: unknown[] = [];
    const site = createSiteData({ modules: SITE_DATA_MODULES, config });
    const handlers = site.handlers({
      auth: createOpenAuth(),
      revalidate: () => {
        throw new Error('cache down');
      },
      onError: (error) => void errors.push(error),
    });
    const response = await at(handlers.handle)('/site-resources/pages', { method: 'POST', json: { path: '/about', enabled: false } });
    assert.equal(response.status, 200);
    assert.equal(errors.length, 1);
  });

  it('lists every route it answers', () => {
    const site = createSiteData({ modules: SITE_DATA_MODULES, config });
    const routes = site.handlers({ auth: createOpenAuth() }).routes.map((route) => `${route.method} ${route.path}`);
    assert.ok(routes.includes('PUT /api/site/work-order'));
    assert.ok(routes.includes('PUT /api/site/story-placement/:slug'));
    assert.ok(routes.includes('GET /api/site/media-library'));
  });
});
