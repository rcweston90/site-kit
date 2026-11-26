import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import type { AuthAdapter, Story } from '@rcweston/story-core';
import { createMemoryDocumentStore, createMemoryMediaStore, createOpenAuth } from '@rcweston/story-server/memory';
import { createPasscodeAuth } from '@rcweston/story-server/passcode';
import {
  createSiteData,
  migrate,
  sanitizeBlogHtml,
  seedBlog,
  SITE_DATA_MODULES,
  type BlogEditorState,
  type BlogPostContent,
  type BlogPostSummary,
  type BlogSeed,
} from '../src/index.ts';

const post = (title: string, html = '<p>Field notes from the studio.</p>', extra: Partial<BlogPostContent> = {}): BlogPostContent => ({
  title,
  description: `About ${title.toLowerCase()}.`,
  tags: ['process'],
  imageUrl: '',
  html,
  ...extra,
});

function story(slug: string, title: string): Story {
  return {
    slug,
    company: 'Fieldnote Studio',
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

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1]);

function harness(options: { sql?: PGlite; auth?: AuthAdapter; revalidated?: string[][] } = {}) {
  const documents = createMemoryDocumentStore();
  const media = createMemoryMediaStore();
  const site = createSiteData({ modules: SITE_DATA_MODULES, sql: options.sql, services: { documents, media, mediaVisibility: 'public' } });
  const handlers = site.handlers({ auth: options.auth ?? createOpenAuth(), revalidate: (paths) => void options.revalidated?.push(paths) });
  const request = (path: string, init: RequestInit & { json?: unknown } = {}) =>
    handlers.handle(
      new Request(`http://site.local/api/site${path}`, {
        ...init,
        headers: { ...(init.json !== undefined ? { 'content-type': 'application/json' } : {}), ...(init.headers as Record<string, string> | undefined) },
        body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
      }),
    );
  return { site, documents, media, request };
}

for (const backend of ['memory', 'postgres'] as const) {
  describe(`blog (${backend})`, () => {
    const withSite = async (run: (h: ReturnType<typeof harness> & { revalidated: string[][] }) => Promise<void>) => {
      const sql = backend === 'postgres' ? new PGlite() : undefined;
      try {
        if (sql) await migrate({ client: sql, modules: SITE_DATA_MODULES });
        const revalidated: string[][] = [];
        await run({ ...harness({ sql, revalidated }), revalidated });
      } finally {
        await sql?.close();
      }
    };

    it('creates, saves drafts over the newest version only, and refuses a stale one', () =>
      withSite(async ({ request }) => {
        assert.deepEqual(await (await request('/blog')).json(), { posts: [] });
        const created = await request('/blog', { method: 'POST', json: { slug: 'first-light', content: post('First light') } });
        assert.equal(created.status, 201);
        const state = (await created.json()) as BlogEditorState;
        assert.equal(state.documents.length, 1);
        assert.equal(state.publishedDocumentId, null);
        const parent = state.documents[0].id;

        const saved = (await (await request('/blog/first-light', { method: 'PUT', json: { content: post('First light, again'), parentDocumentId: parent } })).json()) as BlogEditorState;
        assert.equal(saved.documents.length, 2);
        assert.equal(saved.documents[0].parentDocumentId, parent);
        assert.equal(saved.content.title, 'First light, again');

        const stale = await request('/blog/first-light', { method: 'PUT', json: { content: post('Elsewhere'), parentDocumentId: parent } });
        assert.equal(stale.status, 409);
        const body = (await stale.json()) as { code: string; current: BlogEditorState };
        assert.equal(body.code, 'CONFLICT');
        assert.equal(body.current.content.title, 'First light, again');

        const unchanged = (await (await request('/blog/first-light', { method: 'PUT', json: { content: post('First light, again'), parentDocumentId: saved.documents[0].id } })).json()) as BlogEditorState;
        assert.equal(unchanged.documents.length, 2, 'the same content saves no new version');

        const taken = await request('/blog', { method: 'POST', json: { slug: 'first-light', content: post('Twice') } });
        assert.equal(taken.status, 409);
        assert.equal(((await taken.json()) as { code: string }).code, 'ADDRESS');
      }));

    it('folds autosaves into one working version, and keeps hand saves and published versions', () =>
      withSite(async ({ request }) => {
        const put = async (title: string, parentDocumentId: string, autosave = true) =>
          (await (await request('/blog/drafting', { method: 'PUT', json: { content: post(title), parentDocumentId, autosave } })).json()) as BlogEditorState;
        const created = (await (await request('/blog', { method: 'POST', json: { slug: 'drafting', content: post('Drafting') } })).json()) as BlogEditorState;
        const first = created.documents[0].id;

        // The first autosave builds on the created version, so it adds one.
        const a = await put('Drafting, a', first);
        assert.equal(a.documents.length, 2);
        assert.equal(a.documents[0].sourceRef, 'autosave');
        const working = a.documents[0].id;

        // The next ones rewrite it in place: same id, so the editor's parent still matches.
        const b = await put('Drafting, ab', working);
        const c = await put('Drafting, abc', working);
        assert.equal(c.documents.length, 2);
        assert.equal(b.documents[0].id, working);
        assert.equal(c.documents[0].id, working);
        assert.equal(c.content.title, 'Drafting, abc');

        // A save by hand keeps that point: it adds a version, and the next autosave adds another.
        const kept = await put('Drafting, abc', working, false);
        assert.equal(kept.documents.length, 2, 'the same content saves no new version');
        const handSaved = await put('Drafting, by hand', working, false);
        assert.equal(handSaved.documents.length, 3);
        const after = await put('Drafting, then typing', handSaved.documents[0].id);
        assert.equal(after.documents.length, 4);

        // Once readers see the autosaved version, the next autosave leaves it alone.
        await request('/blog/drafting/publish', { method: 'POST', json: { documentId: after.documents[0].id, expectedPublishedDocumentId: null } });
        const overLive = await put('Drafting, past the live one', after.documents[0].id);
        assert.equal(overLive.documents.length, 5);
        assert.equal(overLive.liveContent?.title, 'Drafting, then typing');
      }));

    it('publishes, keeps readers on the published version while a draft moves on, and unpublishes', () =>
      withSite(async ({ request, site, revalidated }) => {
        const state = (await (await request('/blog', { method: 'POST', json: { slug: 'tide-tables', content: post('Tide tables', '<p>One</p>') } })).json()) as BlogEditorState;
        assert.deepEqual(await site.reads.blog.posts(), []);
        const published = (await (await request('/blog/tide-tables/publish', { method: 'POST', json: { documentId: state.documents[0].id, expectedPublishedDocumentId: null } })).json()) as BlogEditorState;
        assert.equal(published.publishedDocumentId, state.documents[0].id);
        assert.deepEqual(revalidated.at(-1), ['/blog', '/blog/tide-tables']);

        const draft = (await (await request('/blog/tide-tables', { method: 'PUT', json: { content: post('Tide tables', '<p>Two</p>'), parentDocumentId: state.documents[0].id } })).json()) as BlogEditorState;
        assert.equal(draft.liveContent?.html, '<p>One</p>');
        assert.equal((await site.reads.blog.post('tide-tables'))?.html, '<p>One</p>');
        const [summary] = ((await (await request('/blog')).json()) as { posts: BlogPostSummary[] }).posts;
        assert.equal(summary.published, true);
        assert.equal(summary.unpublishedChanges, true);

        const stale = await request('/blog/tide-tables/publish', { method: 'POST', json: { documentId: draft.documents[0].id, expectedPublishedDocumentId: null } });
        assert.equal(stale.status, 409);
        const again = await request('/blog/tide-tables/publish', { method: 'POST', json: { documentId: draft.documents[0].id, expectedPublishedDocumentId: state.documents[0].id } });
        assert.equal(again.status, 200);
        assert.equal((await site.reads.blog.post('tide-tables'))?.html, '<p>Two</p>');

        const down = (await (await request('/blog/tide-tables/unpublish', { method: 'POST', json: {} })).json()) as BlogEditorState;
        assert.equal(down.publishedDocumentId, null);
        assert.equal(await site.reads.blog.post('tide-tables'), null);
        assert.equal(down.documents.length, 2, 'unpublishing keeps every version');
      }));

    it('renames on save, deletes, and answers 404 for a missing post', () =>
      withSite(async ({ request, revalidated }) => {
        const state = (await (await request('/blog', { method: 'POST', json: { slug: 'old-name', content: post('Old name') } })).json()) as BlogEditorState;
        await request('/blog', { method: 'POST', json: { slug: 'other', content: post('Other') } });
        const clash = await request('/blog/old-name', { method: 'PUT', json: { slug: 'other', content: post('Old name'), parentDocumentId: state.documents[0].id } });
        assert.equal(clash.status, 409);
        const moved = (await (await request('/blog/old-name', { method: 'PUT', json: { slug: 'new-name', content: post('New name'), parentDocumentId: state.documents[0].id } })).json()) as BlogEditorState;
        assert.equal(moved.post.slug, 'new-name');
        assert.equal(moved.post.id, state.post.id, 'a rename keeps the post’s id');
        assert.deepEqual(revalidated.at(-1), ['/blog', '/blog/old-name', '/blog/new-name']);
        assert.equal((await request('/blog/old-name')).status, 404);
        assert.equal((await request('/blog/new-name', { method: 'DELETE' })).status, 200);
        assert.equal((await request('/blog/new-name')).status, 404);
        assert.equal((await request('/blog/new-name', { method: 'DELETE' })).status, 404);
      }));

    it('refuses what doesn’t make sense with a sentence', () =>
      withSite(async ({ request }) => {
        const bad = async (path: string, init: RequestInit & { json?: unknown }, pattern: RegExp) => {
          const response = await request(path, init);
          assert.equal(response.status, 400, path);
          assert.match(((await response.json()) as { error: string }).error, pattern);
        };
        await bad('/blog', { method: 'POST', json: { slug: 'Not A Slug', content: post('x') } }, /lower-case/);
        await bad('/blog', { method: 'POST', json: { slug: 'related', content: post('x') } }, /used by the admin/);
        await bad('/blog', { method: 'POST', json: { slug: 'fine', content: post('') } }, /needs a title/);
        await bad('/blog', { method: 'POST', json: { slug: 'fine', content: post('x', '<p>x</p>', { imageUrl: 'javascript:alert(1)' }) } }, /cover image/);
        await bad('/blog', { method: 'POST', json: { slug: 'fine', content: { ...post('x'), tags: 'one' } } }, /tags/);
        await bad('/blog', { method: 'POST', body: 'nope', headers: { 'content-type': 'application/json' } }, /couldn’t be read/);
      }));

    it('resolves Learn more cards to published posts and case studies, and drops the rest', () =>
      withSite(async ({ request, site, documents }) => {
        const saved = await documents.saveDraft({ slug: 'field-guide', content: story('field-guide', 'The field guide'), parentDocumentId: null, source: { kind: 'editor', ref: '' } } as never);
        await documents.publish({ slug: 'field-guide', documentId: saved.id, expectedPublishedDocumentId: null });
        const target = (await (await request('/blog', { method: 'POST', json: { slug: 'target', content: post('Target & co') } })).json()) as BlogEditorState;
        await request('/blog/target/publish', { method: 'POST', json: { documentId: target.documents[0].id, expectedPublishedDocumentId: null } });
        const draftOnly = (await (await request('/blog', { method: 'POST', json: { slug: 'draft-only', content: post('Draft only') } })).json()) as BlogEditorState;
        const html = [
          `<p>Read on.</p><blog-related-tile data-kind="post" data-id="${target.post.id}" data-open="new-tab"></blog-related-tile>`,
          `<blog-related-tile data-kind="case-study" data-id="field-guide"></blog-related-tile>`,
          `<blog-related-tile data-kind="post" data-id="${draftOnly.post.id}"></blog-related-tile>`,
          '<script>alert(1)</script><img src="javascript:x" onerror="x"><a href="javascript:x">bad</a>',
        ].join('');
        const source = (await (await request('/blog', { method: 'POST', json: { slug: 'source', content: post('Source', html) } })).json()) as BlogEditorState;
        await request('/blog/source/publish', { method: 'POST', json: { documentId: source.documents[0].id, expectedPublishedDocumentId: null } });
        const read = await site.reads.blog.post('source');
        assert.ok(read);
        assert.match(read.html, /<a data-related-tile href="\/blog\/target" target="_blank" rel="noopener noreferrer"><span><small>Learn more · Post<\/small><strong>Target &amp; co<\/strong>/);
        assert.match(read.html, /href="\/work\/field-guide"><span><small>Learn more · Case study<\/small><strong>The field guide<\/strong>/);
        assert.doesNotMatch(read.html, /Draft only|script|javascript|onerror/);
        assert.match(read.html, /<a>bad<\/a>/);

        const { choices } = (await (await request('/blog/related')).json()) as { choices: { title: string; kind: string }[] };
        assert.deepEqual(choices.map((choice) => [choice.kind, choice.title]), [['post', 'Source'], ['post', 'Target & co'], ['case-study', 'The field guide']]);
        assert.deepEqual((await site.reads.blog.posts()).map((entry) => entry.slug).sort(), ['source', 'target']);
        assert.equal(await site.reads.blog.count(), 3);
      }));

    it('uploads body images through the media store, checking their bytes', () =>
      withSite(async ({ request, media }) => {
        const form = new FormData();
        form.set('slug', 'with-pictures');
        form.set('file', new File([PNG], 'sketch.png', { type: 'image/png' }));
        const response = await request('/blog/upload', { method: 'POST', body: form });
        assert.equal(response.status, 200);
        const { src, key } = (await response.json()) as { src: string; key: string };
        assert.match(key, /^stories\/posts\/with-pictures\/[0-9a-f]{16}\.png$/);
        assert.equal(src, `/api/story/media/${key.split('/').join('/')}`);
        assert.ok(await media.head(key));

        const fake = new FormData();
        fake.set('slug', 'with-pictures');
        fake.set('file', new File([new TextEncoder().encode('<svg></svg>')], 'sketch.png', { type: 'image/png' }));
        assert.equal((await request('/blog/upload', { method: 'POST', body: fake })).status, 415);
      }));

    it('seeds once: drafts, a published post with a newer draft, a hidden one and a restore', () =>
      withSite(async ({ site, request }) => {
        const seeds: BlogSeed[] = [
          { slug: 'live', createdAt: '2026-03-01T09:00:00.000Z', versions: [post('Live')], published: 0 },
          { slug: 'moved-on', createdAt: '2026-02-01T09:00:00.000Z', versions: [post('Moved on', '<p>a</p>'), post('Moved on', '<p>b</p>'), post('Moved on', '<p>a</p>')], published: 1, restoredFrom: 0 },
          { slug: 'hidden', createdAt: '2026-01-01T09:00:00.000Z', versions: [post('Hidden')], published: null, hidden: true },
          { slug: 'draft', createdAt: '2025-12-01T09:00:00.000Z', versions: [post('Draft')], published: null },
        ];
        assert.equal(await seedBlog(site.stores.blog, seeds), 4);
        assert.equal(await seedBlog(site.stores.blog, seeds), 0, 'a second run seeds nothing');
        const { posts } = (await (await request('/blog')).json()) as { posts: BlogPostSummary[] };
        assert.deepEqual(posts.map((entry) => [entry.slug, entry.published, entry.unpublishedChanges]), [
          ['live', true, false],
          ['moved-on', true, true],
          ['hidden', false, false],
          ['draft', false, false],
        ]);
        const movedOn = (await (await request('/blog/moved-on')).json()) as BlogEditorState;
        assert.equal(movedOn.documents[0].sourceKind, 'restore');
        assert.equal(movedOn.documents[0].sourceRef, movedOn.documents[2].id);
        assert.equal(movedOn.publishedDocumentId, movedOn.documents[1].id);
        assert.equal((await request('/blog/hidden')).status, 200);
        assert.equal(await site.reads.blog.post('hidden'), null);
        assert.deepEqual((await site.reads.blog.posts()).map((entry) => entry.slug), ['live', 'moved-on']);
      }));
  });
}

describe('blog handlers', () => {
  it('ask for a session', async () => {
    const auth = createPasscodeAuth({ passcode: 'open sesame', secret: 'a-test-secret-that-is-long-enough-to-sign' });
    const { request } = harness({ auth });
    assert.equal((await request('/blog')).status, 401);
    assert.equal((await request('/blog/anything')).status, 401);
    assert.equal((await request('/blog', { method: 'POST', json: { slug: 'x', content: post('x') } })).status, 401);
  });

  it('read nothing when nothing is published', async () => {
    const { site } = harness();
    assert.deepEqual(await site.reads.blog.posts(), []);
    assert.equal(await site.reads.blog.post('nothing-here'), null);
    assert.equal(await site.reads.blog.post('../etc'), null);
  });
});

describe('sanitizeBlogHtml', () => {
  it('keeps the editor’s vocabulary and rebuilds everything else from it', () => {
    const html = '<h2 class="x">Title</h2><p data-large="true">Big <mark data-color="teal">mark</mark> <mark data-color="hotpink">no</mark></p><aside data-blog-callout="warning"><p>Careful</p></aside><aside><p>plain</p></aside><p data-blog-cta=""><a href="/contact" data-cms-cta="">Talk to us</a></p><p data-blog-cta=""></p><ol start="3"><li><p>three</p></li></ol><a href="https://example.com" target="_blank">out</a><img src="/media/a.png" alt="A">';
    assert.equal(
      sanitizeBlogHtml(html),
      '<h2>Title</h2><p data-large="true">Big <mark data-color="teal">mark</mark> <mark>no</mark></p><aside data-blog-callout="warning" aria-label="Warning"><p>Careful</p></aside><p>plain</p><p><a data-cms-cta="" href="/contact">Talk to us</a></p><ol start="3"><li><p>three</p></li></ol><a href="https://example.com" target="_blank" rel="noopener noreferrer">out</a><img src="/media/a.png" alt="A" loading="lazy">',
    );
    assert.equal(sanitizeBlogHtml('<blog-related-tile data-kind="post" data-id="4"></blog-related-tile>'), '');
    assert.equal(sanitizeBlogHtml('<p>a &amp; b &lt;c&gt;</p>'), '<p>a &amp; b &lt;c&gt;</p>');
  });
});
