import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import type { AuthAdapter } from '@rcweston/story-core';
import { createMemoryMediaStore, createOpenAuth } from '@rcweston/story-server/memory';
import { createPasscodeAuth } from '@rcweston/story-server/passcode';
import {
  SITE_DATA_MODULES,
  appearanceBootScript,
  appearanceCss,
  buildRobots,
  buildSitemap,
  configureAppearance,
  createSiteData,
  jsonLdScript,
  migrate,
  personSchema,
  resolvePageMetadata,
} from '../src/index.ts';

const pdf = (text: string) => new TextEncoder().encode(`%PDF-1.4\n% ${text}\n%%EOF\n`);
const BASE = pdf('the shipped base');

const config = {
  resume: { base: { filename: 'lena-ortiz-resume.pdf', read: async () => BASE, modifiedAt: '2026-11-01T00:00:00.000Z' }, downloadName: 'Lena Ortiz - Resume.pdf' },
  seo: {
    siteUrl: 'https://example.com',
    fallbacks: { titleTemplate: '%s · Lena Ortiz', defaultTitle: 'Lena Ortiz · Product designer', description: 'Case studies by Lena Ortiz.', keywords: ['product design'], siteName: 'Lena Ortiz', ogImage: '/og-default.png' },
  },
};

const at = (handle: (request: Request) => Promise<Response>) => (path: string, init: RequestInit & { json?: unknown } = {}) =>
  handle(
    new Request(`http://site.local/api/site${path}`, {
      ...init,
      headers: { ...(init.json !== undefined ? { 'content-type': 'application/json' } : {}), ...(init.headers as Record<string, string> | undefined) },
      body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
    }),
  );

function harness(options: { sql?: PGlite; auth?: AuthAdapter; revalidated?: string[][] } = {}) {
  const media = createMemoryMediaStore();
  const site = createSiteData({ modules: SITE_DATA_MODULES, sql: options.sql, config, services: { media } });
  const handlers = site.handlers({ auth: options.auth ?? createOpenAuth(), revalidate: (paths) => void options.revalidated?.push(paths) });
  return { site, media, request: at(handlers.handle) };
}

const upload = (bytes: Uint8Array, name: string, expectedVersion?: number) => {
  const form = new FormData();
  form.append('file', new File([bytes as Uint8Array<ArrayBuffer>], name, { type: 'application/pdf' }));
  if (expectedVersion !== undefined) form.append('expectedVersion', String(expectedVersion));
  return { method: 'POST', body: form };
};

for (const backend of ['memory', 'postgres'] as const) {
  describe(`settings on ${backend}`, () => {
    async function setup(options: Parameters<typeof harness>[0] = {}) {
      if (backend === 'memory') return { ...harness(options), close: async () => undefined };
      const sql = new PGlite();
      await migrate({ client: sql, modules: SITE_DATA_MODULES });
      return { ...harness({ ...options, sql }), close: () => sql.close() };
    }

    it('serves the base resume, replaces it with an upload, refuses a stale one, and reverts', async () => {
      const revalidated: string[][] = [];
      const { site, media, request, close } = await setup({ revalidated });
      try {
        const fresh = await (await request('/resume')).json();
        assert.deepEqual(fresh, { upload: null, base: { filename: 'lena-ortiz-resume.pdf', size: BASE.byteLength, modifiedAt: '2026-11-01T00:00:00.000Z' }, version: 0 });
        const served = await site.reads.resume.respond(new Request('http://site.local/resume'));
        assert.equal(served.status, 200);
        assert.equal(served.headers.get('content-type'), 'application/pdf');
        assert.equal(served.headers.get('content-disposition'), 'inline; filename="Lena Ortiz - Resume.pdf"');
        assert.deepEqual(new Uint8Array(await served.arrayBuffer()), BASE);
        const cached = await site.reads.resume.respond(new Request('http://site.local/resume', { headers: { 'if-none-match': served.headers.get('etag')! } }));
        assert.equal(cached.status, 304);

        const first = await request('/resume', upload(pdf('first upload'), 'Lena Ortiz CV.pdf', 0));
        assert.equal(first.status, 200);
        const saved = await first.json();
        assert.equal(saved.version, 1);
        assert.equal(saved.upload.filename, 'Lena Ortiz CV.pdf');
        assert.match(saved.upload.key, /^resume\/[0-9a-f-]{36}\.pdf$/);
        assert.deepEqual(revalidated, [['/resume']]);
        const now = await site.reads.resume.respond(new Request('http://site.local/resume'));
        assert.match(new TextDecoder().decode(await now.arrayBuffer()), /first upload/);

        const second = await (await request('/resume', upload(pdf('second upload'), 'cv-2026.pdf', 1))).json();
        assert.equal(second.version, 2);
        // The replaced file is gone; only the current one is kept.
        assert.deepEqual((await media.list('resume/')).keys, [second.upload.key]);

        const stale = await request('/resume', upload(pdf('stale'), 'old.pdf', 1));
        assert.equal(stale.status, 409);
        assert.equal((await stale.json()).current.value.filename, 'cv-2026.pdf');
        assert.deepEqual((await media.list('resume/')).keys, [second.upload.key], 'a refused upload leaves no file behind');

        const notPdf = await request('/resume', upload(new TextEncoder().encode('just text'), 'notes.pdf'));
        assert.equal(notPdf.status, 422);
        assert.match((await notPdf.json()).error, /isn’t a PDF/);
        const big = new Uint8Array(10 * 1024 * 1024 + 1);
        big.set(pdf('big'));
        assert.equal((await request('/resume', upload(big, 'huge.pdf'))).status, 400);

        assert.equal((await request('/resume', { method: 'DELETE', json: { expectedVersion: 1 } })).status, 409);
        const reverted = await request('/resume', { method: 'DELETE', json: { expectedVersion: 2 } });
        assert.deepEqual(await reverted.json(), { upload: null, version: 3 });
        assert.deepEqual((await media.list('resume/')).keys, []);
        const back = await site.reads.resume.respond(new Request('http://site.local/resume'));
        assert.deepEqual(new Uint8Array(await back.arrayBuffer()), BASE);
        assert.equal(await site.reads.resume.available(), true);
      } finally {
        await close();
      }
    });

    it('saves SEO defaults and overrides, refuses stale saves, and builds page metadata', async () => {
      const revalidated: string[][] = [];
      const { site, request, close } = await setup({ revalidated });
      try {
        const empty = await (await request('/seo')).json();
        assert.equal(empty.version, 0);
        assert.deepEqual(empty.overrides, []);
        const before = await site.reads.seo.metadata('/');
        assert.deepEqual(before.title, { absolute: 'Lena Ortiz · Product designer' });
        assert.equal(before.description, 'Case studies by Lena Ortiz.');
        assert.deepEqual(before.openGraph?.images, [{ url: '/og-default.png' }]);

        const defaults = { titleTemplate: '%s — Lena Ortiz', defaultTitle: 'Lena Ortiz, product designer', description: 'Research-led product design.', ogImage: '', keywords: 'research, systems', siteName: 'Lena Ortiz', twitterHandle: 'lenaortiz' };
        const saved = await request('/seo', { method: 'PUT', json: { defaults, expectedVersion: 0 } });
        assert.equal(saved.status, 200);
        const body = await saved.json();
        assert.equal(body.version, 1);
        assert.deepEqual(body.defaults.keywords, ['research', 'systems']);
        assert.equal(body.defaults.twitterHandle, '@lenaortiz');
        assert.equal(body.defaults.ogImage, null);
        assert.deepEqual(revalidated, [['/']]);
        assert.equal((await request('/seo', { method: 'PUT', json: { defaults, expectedVersion: 0 } })).status, 409);
        assert.equal((await request('/seo', { method: 'PUT', json: { defaults: { ...defaults, titleTemplate: 'no placeholder' } } })).status, 400);
        assert.equal((await request('/seo', { method: 'PUT', json: { defaults: { ...defaults, ogImage: 'javascript:alert(1)' } } })).status, 400);

        const home = await site.reads.seo.metadata('/');
        assert.deepEqual(home.title, { absolute: 'Lena Ortiz, product designer' });
        assert.equal(home.description, 'Research-led product design.');
        assert.equal(home.twitter?.creator, '@lenaortiz');
        const work = await site.reads.seo.metadata('/work', { content: { title: 'Work' } });
        assert.deepEqual(work.title, { absolute: 'Work — Lena Ortiz' });

        const override = { title: 'Selected work', description: 'Five case studies.', ogImage: '/samples/board.svg', keywords: ['case studies'], robotsIndex: false, robotsFollow: true };
        const put = await request('/seo/overrides', { method: 'PUT', json: { path: '/work', override, expectedVersion: 0 } });
        assert.equal(put.status, 200);
        assert.equal((await put.json()).override.version, 1);
        assert.equal((await request('/seo/overrides', { method: 'PUT', json: { path: '/work', override, expectedVersion: 0 } })).status, 409);
        assert.equal((await request('/seo/overrides', { method: 'PUT', json: { path: 'work', override } })).status, 400);
        const overridden = await site.reads.seo.metadata('/work', { content: { title: 'Work' } });
        assert.deepEqual(overridden.title, { absolute: 'Selected work — Lena Ortiz' });
        assert.deepEqual(overridden.robots, { index: false, follow: true });
        assert.deepEqual(overridden.openGraph?.images, [{ url: '/samples/board.svg' }]);
        const hidden = await site.reads.seo.metadata('/work', { content: { title: 'Work' }, hidden: true });
        assert.equal(hidden.openGraph, null);
        assert.deepEqual(hidden.robots, { index: false, follow: false, googleBot: { index: false, follow: false } });

        const listed = await (await request('/seo')).json();
        assert.deepEqual(listed.overrides.map((entry: { path: string; title: string }) => [entry.path, entry.title]), [['/work', 'Selected work']]);
        assert.equal((await request('/seo/overrides', { method: 'DELETE', json: { path: '/work', expectedVersion: 7 } })).status, 409);
        assert.equal((await request('/seo/overrides', { method: 'DELETE', json: { path: '/work' } })).status, 200);
        assert.equal(await site.reads.seo.override('/work'), null);
      } finally {
        await close();
      }
    });

    it('saves appearance, refuses a stale save and unknown options, and reads the defaults when empty', async () => {
      const { site, request, close } = await setup();
      try {
        const fresh = await (await request('/appearance')).json();
        assert.deepEqual(fresh.settings, { sunny: false, defaultTheme: 'default', accent: 'blue', sans: 'site', serif: 'site' });
        assert.equal(fresh.version, 0);
        assert.ok(fresh.options.accents.length >= 2);
        const settings = { sunny: true, defaultTheme: 'amber', accent: 'teal', sans: 'site', serif: 'old-style' };
        const saved = await request('/appearance', { method: 'PUT', json: { settings, expectedVersion: 0 } });
        assert.equal(saved.status, 200);
        assert.equal((await saved.json()).version, 1);
        assert.equal((await request('/appearance', { method: 'PUT', json: { settings, expectedVersion: 0 } })).status, 409);
        assert.equal((await request('/appearance', { method: 'PUT', json: { settings: { ...settings, accent: 'neon' } } })).status, 400);
        assert.equal((await request('/appearance', { method: 'PUT', json: { settings: { ...settings, defaultTheme: 'sepia' } } })).status, 400);
        const { settings: current, css } = await site.reads.appearance.styles();
        assert.deepEqual(current, settings);
        assert.match(css, /--accent-primary:#0F766E/);
        assert.match(css, /\[data-theme="dark"\]\{--accent-primary:#2DD4BF/);
        assert.match(css, /--story-font-serif:'Iowan Old Style'/);
        assert.doesNotMatch(css, /--story-font-sans/);
      } finally {
        await close();
      }
    });
  });
}

describe('settings handlers', () => {
  it('ask for a session on every admin route', async () => {
    const auth = createPasscodeAuth({ passcode: 'open sesame', secret: 'a-test-secret-that-is-long-enough-to-sign' });
    const { request } = harness({ auth });
    for (const [path, method] of [['/resume', 'GET'], ['/resume', 'DELETE'], ['/seo', 'GET'], ['/seo', 'PUT'], ['/seo/overrides', 'PUT'], ['/appearance', 'PUT']] as const) {
      assert.equal((await request(path, { method, ...(method === 'GET' ? {} : { json: {} }) })).status, 401, `${method} ${path}`);
    }
  });

  it('answers 404 at /resume when there is no base and no upload', async () => {
    const site = createSiteData({ modules: SITE_DATA_MODULES, services: { media: createMemoryMediaStore() } });
    assert.equal((await site.reads.resume.respond(new Request('http://site.local/resume'))).status, 404);
    assert.equal(await site.reads.resume.available(), false);
  });
});

describe('seo helpers', () => {
  it('builds a sitemap without hidden or noindex pages, and robots that keep them out', () => {
    const entries = buildSitemap(
      [{ path: '/', priority: 1 }, { path: '/work', priority: 0.8 }, { path: '/resume' }, { path: '/stories/field-notes' }, { path: '/stories/field-notes' }, { path: '/stories/draft-one' }],
      { siteUrl: 'https://example.com/', isVisible: (path) => path !== '/resume', overrides: [{ path: '/stories/draft-one', robotsIndex: false }] },
    );
    assert.deepEqual(entries.map((entry) => entry.url), ['https://example.com', 'https://example.com/work', 'https://example.com/stories/field-notes']);
    const robots = buildRobots({ siteUrl: 'https://example.com', disallow: ['/admin', '/api'], hidden: ['/resume'] });
    assert.deepEqual(robots.rules[0].disallow, ['/admin', '/api', '/resume']);
    assert.equal(robots.sitemap, 'https://example.com/sitemap.xml');
  });

  it('applies the template, merges in priority order and escapes JSON-LD', () => {
    const meta = resolvePageMetadata({
      path: '/stories/x', siteUrl: 'https://example.com', fallbacks: config.seo.fallbacks,
      content: { title: 'A map', description: 'From the platform.', image: '/cover.svg' },
      override: { title: null, description: 'Overridden.', ogImage: null, keywords: null, robotsIndex: null, robotsFollow: null },
    });
    assert.deepEqual(meta.title, { absolute: 'A map · Lena Ortiz' });
    assert.equal(meta.description, 'Overridden.');
    assert.deepEqual(meta.openGraph?.images, [{ url: '/cover.svg' }]);
    assert.equal(meta.alternates?.canonical, '/stories/x');
    const script = jsonLdScript(personSchema({ siteUrl: 'https://example.com', name: 'Lena </script> Ortiz' }));
    assert.ok(!script.includes('</script>'));
    assert.match(script, /"@id":"https:\/\/example.com\/#person"/);
  });

  it('boots the visitor’s theme before paint and checks host options', () => {
    const options = configureAppearance(undefined);
    const script = appearanceBootScript({ ...options.defaults, sunny: true, defaultTheme: 'dark' }, 'site-theme');
    assert.match(script, /t="dark"/);
    assert.match(script, /true\?'sunny'/);
    assert.equal(appearanceCss(options.defaults, options), '');
    assert.throws(() => configureAppearance({ accents: [{ id: 'red', label: 'Red', light: 'red', dark: null }] }), /should look like/);
    assert.throws(() => configureAppearance({ sans: [{ id: 'x', label: 'X', stack: 'a;} body{display:none' }] }), /can't be used/);
  });
});
