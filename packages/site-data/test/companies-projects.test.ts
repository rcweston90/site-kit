import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import type { AuthAdapter, Story } from '@rcweston/story-core';
import { createMemoryDocumentStore, createMemoryMediaStore, createOpenAuth } from '@rcweston/story-server/memory';
import { createPasscodeAuth } from '@rcweston/story-server/passcode';
import {
  companyFolderLogos,
  companyProfileInput,
  companyUsage,
  createSiteData,
  isCompanyLogoUploadSrc,
  migrate,
  normalizeCompanyLogoLibrary,
  parseBulkProjectRequest,
  patchForBulkProjectChange,
  resolveCompanyLogo,
  SITE_DATA_MODULES,
} from '../src/index.ts';

function story(slug: string, company: string, title = `The ${slug.replace(/-/g, ' ')}`): Story {
  return {
    slug,
    company,
    title,
    thesis: 'As the design lead, I rebuilt the guide around questions readers asked.',
    period: '2025',
    facts: [],
    glance: { situation: 'Lost readers.', task: 'Answer them.', action: 'Rewrote it.', result: 'Fewer tickets.' },
    chapters: [
      { key: 'situation', title: 'Lost.', blocks: [] },
      { key: 'task', title: 'Answer.', blocks: [] },
      { key: 'action', title: 'Rewrite.', blocks: [] },
      { key: 'result', title: 'Fewer.', blocks: [] },
    ],
  };
}

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82]);

const at = (handle: (request: Request) => Promise<Response>) => (path: string, init: RequestInit & { json?: unknown } = {}) =>
  handle(
    new Request(`http://site.local/api/site${path}`, {
      ...init,
      headers: { ...(init.json !== undefined ? { 'content-type': 'application/json' } : {}), ...(init.headers as Record<string, string> | undefined) },
      body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
    }),
  );

async function seedStories(documents: ReturnType<typeof createMemoryDocumentStore>) {
  const source = { kind: 'test', ref: 'seed' };
  for (const [slug, company] of [['field-notes', 'Fieldnote Studio'], ['transit-map', 'Tidewater Transit']] as const) {
    await documents.saveDraft({ slug, content: story(slug, company), parentDocumentId: null, source });
  }
}

for (const backend of ['memory', 'postgres'] as const) {
  describe(`companies and projects on ${backend}`, () => {
    async function setup(options: { auth?: AuthAdapter } = {}) {
      const revalidated: string[][] = [];
      const documents = createMemoryDocumentStore();
      await seedStories(documents);
      const media = createMemoryMediaStore();
      const sql = backend === 'postgres' ? new PGlite() : undefined;
      if (sql) await migrate({ client: sql, modules: SITE_DATA_MODULES });
      // The companies module reads Work records through the projects module's reads, as a host wires it.
      let site: ReturnType<typeof createSiteData<typeof SITE_DATA_MODULES>>;
      site = createSiteData({
        modules: SITE_DATA_MODULES,
        sql,
        config: {
          companies: { workRecords: async () => (await site.reads.projects.records()).map(({ slug, title, org, type }) => ({ slug, title, org, type })) },
          projects: { features: [{ slug: 'site-readme', href: '/', title: 'How this site is made' }] },
        },
        services: { documents, media, mediaVisibility: 'public' },
      });
      const handlers = site.handlers({ auth: options.auth ?? createOpenAuth(), revalidate: (paths) => void revalidated.push(paths) });
      return { site, media, revalidated, request: at(handlers.handle), close: async () => sql?.close() };
    }

    it('reads nothing before anything is saved', async () => {
      const { site, request, close } = await setup();
      try {
        assert.deepEqual(await (await request('/companies')).json(), { schemaAvailable: true, companies: [], memberships: [] });
        assert.equal(await site.reads.companies.companyOf('field-notes'), null);
        assert.equal(await site.reads.companies.logoOf('field-notes'), null);
        assert.deepEqual(await site.reads.projects.records(), []);
        assert.deepEqual(await site.reads.projects.prototypes(), []);
        const [feature] = await site.reads.projects.features();
        assert.equal(feature.title, 'How this site is made');
        assert.equal(feature.version, 0);
      } finally {
        await close();
      }
    });

    it('creates, edits, assigns, uploads a logo and deletes a company', async () => {
      const { site, media, revalidated, request, close } = await setup();
      try {
        assert.equal((await request('/companies', { method: 'POST', json: { name: '  ' } })).status, 400);
        assert.equal((await request('/companies', { method: 'POST', json: { name: 'New' } })).status, 400, 'reserved address');
        const created = await request('/companies', { method: 'POST', json: { name: 'Fieldnote Studio', summary: 'A small research studio.', website: 'https://fieldnote.example' } });
        assert.equal(created.status, 201);
        const company = (await created.json()).company;
        assert.equal(company.slug, 'fieldnote-studio');
        assert.equal(company.version, 1);
        assert.deepEqual(company.logoLibrary, { logos: [], defaultId: null });
        assert.deepEqual(revalidated.at(-1), ['/', '/work']);
        const twin = await request('/companies', { method: 'POST', json: { name: 'FIELDNOTE studio' } });
        assert.equal(twin.status, 409);

        // A save on an old version keeps the person's edit and says why.
        const ok = await request('/companies/profile/fieldnote-studio', { method: 'PUT', json: { name: 'Fieldnote Studio', summary: 'Research and design.', website: company.website, logoUrl: null, expectedVersion: 1 } });
        assert.equal(ok.status, 200);
        assert.equal((await ok.json()).company.version, 2);
        const stale = await request('/companies/profile/fieldnote-studio', { method: 'PUT', json: { name: 'Fieldnote Studio', summary: 'Older.', expectedVersion: 1 } });
        assert.equal(stale.status, 409);
        const conflict = await stale.json();
        assert.match(conflict.error, /changed in another tab/);
        assert.equal(conflict.current.summary, 'Research and design.');
        assert.equal((await request('/companies/profile/fieldnote-studio', { method: 'PUT', json: { name: 'Fieldnote Studio', website: 'ftp://nope', expectedVersion: 2 } })).status, 400);
        assert.equal((await request('/companies/profile/nobody', { method: 'PUT', json: { name: 'Nobody', expectedVersion: 1 } })).status, 404);

        // Logos: checked by type and bytes, stored under the story media prefix.
        const form = new FormData();
        form.set('file', new File([PNG], 'mark.png', { type: 'image/png' }));
        const uploaded = await request('/companies/profile/fieldnote-studio/logo', { method: 'POST', body: form });
        assert.equal(uploaded.status, 200);
        const { src, key } = await uploaded.json();
        assert.ok(isCompanyLogoUploadSrc(src), src);
        assert.ok(await media.head(key));
        const fake = new FormData();
        fake.set('file', new File([new TextEncoder().encode('<svg/>')], 'mark.png', { type: 'image/png' }));
        assert.equal((await request('/companies/profile/fieldnote-studio/logo', { method: 'POST', body: fake })).status, 415);
        const svg = new FormData();
        svg.set('file', new File([new TextEncoder().encode('<svg/>')], 'mark.svg', { type: 'image/svg+xml' }));
        assert.equal((await request('/companies/profile/fieldnote-studio/logo', { method: 'POST', body: svg })).status, 415);

        const library = { logos: [{ id: 'mark', name: 'Mark', url: src }], defaultId: 'mark' };
        const withLogo = await request('/companies/profile/fieldnote-studio', { method: 'PUT', json: { name: 'Fieldnote Studio', summary: 'Research and design.', website: company.website, logoUrl: null, logoLibrary: library, expectedVersion: 2 } });
        assert.equal(withLogo.status, 200);
        assert.equal((await request('/companies/profile/fieldnote-studio', { method: 'PUT', json: { name: 'Fieldnote Studio', logoLibrary: { logos: [{ id: 'Bad Id', name: 'x', url: src }], defaultId: null }, expectedVersion: 3 } })).status, 400);

        // Assigning a story: the public story header reads the company and its logo.
        assert.equal((await request('/companies/assign', { method: 'PUT', json: { storySlug: 'field-notes', companySlug: 'nobody' } })).status, 409);
        const assigned = await request('/companies/assign', { method: 'PUT', json: { storySlug: 'field-notes', companySlug: 'fieldnote-studio' } });
        assert.equal(assigned.status, 200);
        assert.deepEqual(revalidated.at(-1), ['/', '/work', '/stories/field-notes']);
        assert.equal((await site.reads.companies.companyOf('field-notes'))?.name, 'Fieldnote Studio');
        assert.equal(await site.reads.companies.logoOf('field-notes'), src);

        const assets = await (await request('/companies/profile/fieldnote-studio/assets')).json();
        assert.deepEqual(assets.projects.map((project: { slug: string; kind: string; source: string }) => [project.slug, project.kind, project.source]), [['field-notes', 'Case study', 'Company assignment']]);
        assert.deepEqual(assets.usedBy, ['field-notes']);

        // Deleting: confirmed by address, refused while anything belongs to it.
        assert.equal((await request('/companies/profile/fieldnote-studio', { method: 'DELETE', json: { expectedVersion: 3 } })).status, 400);
        const used = await request('/companies/profile/fieldnote-studio', { method: 'DELETE', json: { confirmation: 'fieldnote-studio', expectedVersion: 3 } });
        assert.equal(used.status, 409);
        assert.deepEqual((await used.json()).stories, ['field-notes']);
        // Moved elsewhere, the story's own company text still names it.
        await request('/companies', { method: 'POST', json: { name: 'Harbor Lane Clinics' } });
        await request('/companies/assign', { method: 'PUT', json: { storySlug: 'field-notes', companySlug: 'harbor-lane-clinics' } });
        assert.equal((await request('/companies/profile/fieldnote-studio', { method: 'DELETE', json: { confirmation: 'fieldnote-studio', expectedVersion: 3 } })).status, 200);
        assert.equal((await request('/companies/profile/fieldnote-studio')).status, 404);
        // A company a story names by its own text can't go until the story moves.
        await request('/companies', { method: 'POST', json: { name: 'Tidewater Transit' } });
        const named = await request('/companies/profile/tidewater-transit', { method: 'DELETE', json: { confirmation: 'tidewater-transit', expectedVersion: 1 } });
        assert.deepEqual((await named.json()).stories, ['transit-map']);
        await request('/companies/assign', { method: 'PUT', json: { storySlug: 'field-notes', companySlug: null } });
        assert.equal(await site.reads.companies.companyOf('field-notes'), null);
        assert.equal((await request('/companies/profile/harbor-lane-clinics', { method: 'DELETE', json: { confirmation: 'harbor-lane-clinics', expectedVersion: 1 } })).status, 200);
      } finally {
        await close();
      }
    });

    it('keeps project details, creates prototypes, refuses renames and stale saves, and edits in bulk', async () => {
      const { site, revalidated, request, close } = await setup();
      try {
        const derived = await (await request('/projects/field-notes')).json();
        assert.equal(derived.project.version, 0);
        assert.equal(derived.project.org, 'Fieldnote Studio');
        assert.equal((await request('/projects/nothing-here')).status, 404);

        assert.equal((await request('/projects', { method: 'POST', json: { slug: 'quick-mock', title: 'Quick mock', date: '2024-02-01', type: 'Growth' } })).status, 400);
        assert.equal((await request('/projects', { method: 'POST', json: { slug: 'field-notes', title: 'Field notes', date: '2024-02-01', type: 'Prototype' } })).status, 409);
        assert.equal((await request('/projects', { method: 'POST', json: { slug: 'site-readme', title: 'Readme', date: '2024-02-01', type: 'Prototype' } })).status, 409);
        const created = await request('/projects', { method: 'POST', json: { slug: 'route-planner', title: 'Route planner', date: '2024-02-01', type: 'Prototype', url: 'https://prototypes.example/route', org: 'Tidewater Transit' } });
        assert.equal(created.status, 201);
        assert.equal((await created.json()).project.version, 1);
        assert.equal((await request('/projects', { method: 'POST', json: { slug: 'route-planner', title: 'Again', date: '2024-02-01', type: 'Prototype' } })).status, 409);
        assert.equal((await site.reads.projects.prototypes()).length, 1);

        // Details for a story save beside it, from version 0.
        const saved = await request('/projects/field-notes', { method: 'PUT', json: { title: 'Field notes', description: 'Research that ships.', type: '0-1 Product', date: '2025-03-01', tags: ['Research', 'research', 'Ops'], expectedVersion: 0 } });
        assert.equal(saved.status, 200);
        const project = (await saved.json()).project;
        assert.deepEqual(project.tags, ['research', 'Ops']);
        assert.equal(project.version, 1);
        assert.deepEqual(revalidated.at(-1), ['/', '/work', '/stories/field-notes']);
        assert.equal((await request('/projects/field-notes', { method: 'PUT', json: { slug: 'new-address', title: 'Field notes' } })).status, 409);
        const stale = await request('/projects/field-notes', { method: 'PUT', json: { title: 'Older', expectedVersion: 0 } });
        assert.equal(stale.status, 409);
        assert.equal((await stale.json()).current.description, 'Research that ships.');
        assert.equal((await request('/projects/field-notes', { method: 'PUT', json: { image: 'javascript:alert(1)', expectedVersion: 1 } })).status, 400);
        // A partial save (a site feature's card) keeps the rest.
        const card = await request('/projects/site-readme', { method: 'PUT', json: { title: 'How it’s made', description: 'Notes on the build.' } });
        assert.equal((await card.json()).project.url, '/');

        // The companies module sees Work records by organization.
        await request('/companies', { method: 'POST', json: { name: 'Tidewater Transit' } });
        const assets = await (await request('/companies/profile/tidewater-transit/assets')).json();
        assert.deepEqual(assets.projects.map((entry: { slug: string; kind: string }) => [entry.slug, entry.kind]), [['route-planner', 'Prototype']]);

        const bulk = await request('/projects/bulk', { method: 'PATCH', json: { slugs: ['route-planner', 'gone'], change: { field: 'tags', operation: 'add', value: ['Maps'] } } });
        assert.equal(bulk.status, 207);
        const result = await bulk.json();
        assert.deepEqual(result.updated.map((entry: { tags: string[] }) => entry.tags), [['Maps']]);
        assert.deepEqual(result.failed.map((entry: { slug: string }) => entry.slug), ['gone']);
        assert.equal((await request('/projects/bulk', { method: 'PATCH', json: { slugs: ['route-planner'], change: { field: 'slug', operation: 'set', value: 'x' } } })).status, 400);

        const copy = await request('/projects/route-planner/duplicate', { method: 'POST' });
        assert.equal(copy.status, 201);
        const copied = (await copy.json()).project;
        assert.equal(copied.slug, 'route-planner-copy');
        assert.equal(copied.url, null);

        assert.equal((await request('/projects/field-notes', { method: 'DELETE', json: {} })).status, 409);
        assert.equal((await request('/projects/route-planner', { method: 'DELETE', json: { expectedVersion: 1 } })).status, 409);
        assert.equal((await request('/projects/route-planner', { method: 'DELETE', json: { expectedVersion: 2 } })).status, 200);
        assert.equal((await request('/projects/route-planner', { method: 'DELETE', json: {} })).status, 404);
        const snapshots = await site.stores.projects.snapshots();
        assert.ok(snapshots.length >= 6);
        assert.equal(snapshots[0].reason, 'pre-delete');
      } finally {
        await close();
      }
    });
  });
}

describe('companies and projects routes', () => {
  it('ask for a session and refuse other sites', async () => {
    const auth = createPasscodeAuth({ passcode: 'open sesame', secret: 'a-test-secret-that-is-long-enough-to-sign' });
    const site = createSiteData({ modules: SITE_DATA_MODULES });
    const locked = at(site.handlers({ auth }).handle);
    assert.equal((await locked('/companies')).status, 401);
    assert.equal((await locked('/projects')).status, 401);
    assert.equal((await locked('/projects/field-notes')).status, 401);
    const open = at(site.handlers({ auth: createOpenAuth() }).handle);
    assert.equal((await open('/companies', { method: 'POST', json: { name: 'Elsewhere' }, headers: { origin: 'https://elsewhere.example' } })).status, 403);
    assert.equal((await open('/projects/bulk', { method: 'PATCH', json: {}, headers: { origin: 'https://elsewhere.example' } })).status, 403);
  });
});

describe('company and project helpers', () => {
  it('check profiles, libraries and logos', () => {
    assert.deepEqual(companyProfileInput({ name: ' Northfold Library ', website: '' }), { slug: 'northfold-library', name: 'Northfold Library', summary: '', website: null, logoUrl: null });
    assert.ok('error' in companyProfileInput({ name: 'A', logoUrl: 'http://insecure.example/logo.png' }));
    assert.equal(normalizeCompanyLogoLibrary({ logos: [{ id: 'a', name: 'A', url: '/a.svg' }], defaultId: 'b' }), null);
    const company = { slug: 'northfold-library', name: 'Northfold Library', logoUrl: '/old.svg', logoLibrary: { logos: [{ id: 'wide', name: 'Wide', url: '/wide.svg' }], defaultId: null } };
    assert.equal(resolveCompanyLogo(company), '/old.svg');
    assert.equal(resolveCompanyLogo(company, 'wide'), '/wide.svg');
    assert.equal(resolveCompanyLogo({ ...company, logoLibrary: { ...company.logoLibrary, defaultId: 'wide' } }, 'gone'), '/wide.svg');
    assert.deepEqual(companyFolderLogos(company).map((logo) => [logo.id, logo.isDefault]), [['profile', true], ['wide', false]]);
    assert.deepEqual(companyUsage(company, { memberships: [{ storySlug: 'a', companySlug: 'other' }], named: [{ slug: 'a', company: 'Northfold Library' }, { slug: 'b', company: 'northfold library' }] }), ['b']);
  });

  it('take only the bulk shapes they know', () => {
    assert.equal(parseBulkProjectRequest({ slugs: ['a', 'a'], change: { field: 'featured', operation: 'set', value: true } }).ok, false);
    assert.equal(parseBulkProjectRequest({ slugs: ['a'], change: { field: 'vaulted', operation: 'set', value: true } }).ok, false);
    const parsed = parseBulkProjectRequest({ slugs: ['a'], change: { field: 'tags', operation: 'remove', value: ['ops'] } });
    assert.ok(parsed.ok);
    if (parsed.ok) assert.deepEqual(patchForBulkProjectChange({ tags: ['Ops', 'Maps'] }, parsed.request.change), { tags: ['Maps'] });
  });
});
