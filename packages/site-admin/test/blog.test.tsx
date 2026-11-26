import { dom } from './setup-dom.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { ReactElement } from 'react';
import type { BlogEditorState, BlogPostContent, BlogPostDocument, BlogPostSummary } from '@rcweston/site-data/client';
import { AdminProvider } from '../src/config.tsx';
import { ADMIN_MODULES } from '../src/registry.ts';
import BlogAdminClient from '../src/modules/blog/BlogAdminClient.tsx';
import BlogEditorClient from '../src/modules/blog/BlogEditorClient.tsx';
import BlogDraftPreview from '../src/modules/blog/BlogDraftPreview.tsx';
import { applyPostChanges, comparePostChange, diffPost, postBlocks } from '../src/modules/blog/post-drift.ts';
import { validateBlogBodyImage } from '../src/modules/blog/blog-image-input.ts';

/*
 * The Posts module: the review's three-way comparison, the list and the
 * editor mounted in jsdom against a fake site-data API. Everything here is
 * made up for the test.
 */

const post = (overrides: Partial<BlogPostContent> = {}): BlogPostContent => ({
  title: 'Field notes that travel',
  description: 'How a small studio keeps research usable.',
  tags: ['research'],
  imageUrl: '',
  html: '<p>First paragraph.</p><h2>Method</h2><p>Second paragraph.</p>',
  ...overrides,
});

/* ── The review's comparison ─────────────────────────────────────────── */

test('post drift: a field only the published version changed is safe to bring in; one both changed is a conflict', () => {
  const base = post();
  const original = post({ title: 'Field notes that last', description: 'A new summary.' });
  const draft = post({ description: 'My own summary.' });
  const changes = diffPost({ base, original, draft });
  assert.deepEqual(changes.map((change) => [change.where, change.kind]), [['Title', 'safe'], ['Summary', 'conflict']]);
  assert.equal(changes[1].yours, 'edited');
  const applied = applyPostChanges(draft, changes);
  assert.equal(applied.title, 'Field notes that last');
  assert.equal(applied.description, 'A new summary.');
  assert.deepEqual(comparePostChange(changes[1]).parts[0], { label: '', yours: { kind: 'text', text: 'My own summary.' }, original: { kind: 'text', text: 'A new summary.' } });
});

test('post drift: body blocks the published version added or changed come in where they were, around the draft’s own edits', () => {
  const base = post();
  const original = post({ html: '<p>First paragraph.</p><aside data-blog-callout="info"><p>A new callout.</p></aside><h2>Method</h2><p>Second paragraph, revised.</p>' });
  const draft = post({ html: '<p>First paragraph.</p><h2>Method</h2><p>Second paragraph.</p><p>My closing line.</p>' });
  const changes = diffPost({ base, original, draft });
  assert.equal(changes.length, 2);
  assert.ok(changes.every((change) => change.kind === 'safe'));
  assert.match(changes[0].where, /A new callout/);
  assert.equal(changes[0].what, 'New in the published version');
  assert.equal(changes[1].what, 'Changed');
  const applied = applyPostChanges(draft, changes);
  assert.deepEqual(postBlocks(applied.html), [
    '<p>First paragraph.</p>',
    '<aside data-blog-callout="info"><p>A new callout.</p></aside>',
    '<h2>Method</h2>',
    '<p>Second paragraph, revised.</p>',
    '<p>My closing line.</p>',
  ]);
  assert.deepEqual(diffPost({ base, original, draft: applied }), []);
});

test('post drift: a paragraph both sides edited is a conflict, and nothing shows once the draft matches', () => {
  const base = post();
  const original = post({ html: '<p>First paragraph, theirs.</p><h2>Method</h2><p>Second paragraph.</p>' });
  const draft = post({ html: '<p>First paragraph, mine.</p><h2>Method</h2><p>Second paragraph.</p>' });
  const [change] = diffPost({ base, original, draft });
  assert.equal(change.kind, 'conflict');
  assert.equal(change.yours, 'edited');
  assert.equal(comparePostChange(change).parts[0].yours.kind, 'text');
  assert.equal(applyPostChanges(draft, [change]).html, original.html);
  assert.deepEqual(diffPost({ base, original, draft: original }), []);
});

test('post images: raster files up to 4 MB', () => {
  const file = (type: string, size: number) => new dom.window.File([new Uint8Array(size)], 'cover', { type }) as unknown as File;
  assert.equal(validateBlogBodyImage(file('image/png', 10)), null);
  assert.equal(validateBlogBodyImage(file('image/avif', 10)), null);
  assert.match(validateBlogBodyImage(file('image/svg+xml', 10)) ?? '', /PNG, JPEG/);
  assert.match(validateBlogBodyImage(file('image/png', 0)) ?? '', /empty/);
  assert.match(validateBlogBodyImage(file('image/png', 4 * 1024 * 1024 + 1)) ?? '', /4 MB/);
});

/* ── Mounted ─────────────────────────────────────────────────────────── */

type Call = { method: string; url: string; body: unknown };

function documentOf(id: string, content: BlogPostContent, parentDocumentId: string | null, sourceKind: BlogPostDocument['sourceKind'] = 'editor', sourceRef = ''): BlogPostDocument {
  return { id, parentDocumentId, sourceKind, sourceRef, contentSha256: id, content, createdAt: '2026-03-02T10:00:00.000Z' };
}

function stateOf(documents: BlogPostDocument[], publishedDocumentId: string | null, slug = 'field-notes'): BlogEditorState {
  return {
    post: { id: 7, slug, createdAt: '2026-03-01T10:00:00.000Z' },
    content: documents[0].content,
    documents,
    liveContent: documents.find((document) => document.id === publishedDocumentId)?.content ?? null,
    publishedDocumentId,
  };
}

function fakeApi(routes: (call: Call) => { status?: number; body: unknown } | undefined) {
  const calls: Call[] = [];
  (globalThis as { fetch: typeof fetch }).fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body ?? null;
    const call = { method: init.method ?? 'GET', url, body };
    calls.push(call);
    const answer = routes(call) ?? { status: 404, body: { error: 'Not here.' } };
    return new Response(JSON.stringify(answer.body), { status: answer.status ?? 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return calls;
}

function router() {
  const moves: string[] = [];
  return { moves, router: { pathname: '/admin/blog', push: (href: string) => { moves.push(`push ${href}`); }, replace: (href: string) => { moves.push(`replace ${href}`); } } };
}

async function settle() {
  for (let i = 0; i < 8; i++) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

async function mount(element: ReactElement, nav = router()) {
  const container = dom.window.document.createElement('div');
  dom.window.document.body.append(container);
  const root = createRoot(container);
  await act(async () => { root.render(<AdminProvider router={nav.router} modules={ADMIN_MODULES}>{element}</AdminProvider>); });
  await settle();
  return { container, moves: nav.moves, unmount: () => { act(() => root.unmount()); container.remove(); } };
}

const setValue = async (field: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  const proto = field instanceof dom.window.HTMLTextAreaElement ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(field, value);
  await act(async () => { field.dispatchEvent(new dom.window.Event('input', { bubbles: true })); });
};
const click = async (element: Element) => { await act(async () => { (element as HTMLElement).click(); }); await settle(); };
const button = (container: HTMLElement, label: string) => [...container.querySelectorAll('button')].find((node) => node.textContent?.trim() === label)!;

const summary = (overrides: Partial<BlogPostSummary> = {}): BlogPostSummary => ({
  id: 1, slug: 'field-notes', title: 'Field notes that travel', description: 'A summary.', tags: [], imageUrl: '', readingTime: '2 min read',
  published: false, unpublishedChanges: false, latestDocumentId: 'post:1:v1', publishedDocumentId: null,
  createdAt: '2026-03-01T10:00:00.000Z', updatedAt: '2026-03-01T10:00:00.000Z', ...overrides,
});

test('Posts list: every post with its state; Publish puts the newest version live', async () => {
  const draft = summary();
  const live = summary({ id: 2, slug: 'quiet-tools', title: 'Quiet tools', published: true, unpublishedChanges: true, latestDocumentId: 'post:2:v2', publishedDocumentId: 'post:2:v1' });
  const calls = fakeApi(({ method, url }) => {
    if (method === 'GET' && url === '/api/site/blog') return { body: { posts: [draft, live] } };
    if (method === 'POST' && url === '/api/site/blog/field-notes/publish') {
      const doc = documentOf('post:1:v1', post(), null);
      return { body: stateOf([doc], doc.id) };
    }
    return undefined;
  });
  const { container, unmount } = await mount(<BlogAdminClient />);
  assert.match(container.textContent ?? '', /Manage Posts/);
  assert.match(container.textContent ?? '', /2 posts/);
  assert.match(container.textContent ?? '', /Unpublished changes/);
  const badges = [...container.querySelectorAll('h2 + span')].map((node) => node.textContent);
  assert.deepEqual(badges, ['Draft', 'Published']);
  await click(button(container, 'Publish'));
  const publish = calls.find((call) => call.url.endsWith('/publish'))!;
  assert.deepEqual(publish.body, { documentId: 'post:1:v1', expectedPublishedDocumentId: null });
  assert.match(container.textContent ?? '', /Post published/);
  assert.deepEqual([...container.querySelectorAll('h2 + span')].map((node) => node.textContent), ['Published', 'Published']);
  unmount();
});

test('New post: the address follows the title, Save draft creates it and opens its editor', async () => {
  const calls = fakeApi(({ method, url, body }) => {
    if (url === '/api/site/blog/related') return { body: { choices: [] } };
    if (method === 'POST' && url === '/api/site/blog') {
      const { slug, content } = body as { slug: string; content: BlogPostContent };
      return { status: 201, body: stateOf([documentOf('post:9:v1', content, null)], null, slug) };
    }
    return undefined;
  });
  const { container, moves, unmount } = await mount(<BlogEditorClient mode="create" />);
  assert.match(container.textContent ?? '', /New post/);
  assert.match(container.textContent ?? '', /Not saved yet/);
  await setValue(container.querySelector<HTMLTextAreaElement>('#blog-title')!, 'Notes from the field');
  assert.equal(container.querySelector<HTMLInputElement>('#blog-slug')!.value, 'notes-from-the-field');
  await click(button(container, 'Save draft'));
  const create = calls.find((call) => call.method === 'POST' && call.url === '/api/site/blog')!;
  assert.equal((create.body as { slug: string }).slug, 'notes-from-the-field');
  assert.equal((create.body as { content: BlogPostContent }).content.title, 'Notes from the field');
  assert.deepEqual(moves, ['replace /admin/blog/notes-from-the-field/edit']);
  unmount();
});

test('Edit post: a save goes over the newest version; a stale one says why and keeps the edits', async () => {
  const doc = documentOf('post:7:v1', post(), null);
  let stale = false;
  const calls = fakeApi(({ method, url, body }) => {
    if (url === '/api/site/blog/related') return { body: { choices: [] } };
    if (method === 'GET' && url === '/api/site/blog/field-notes') return { body: stateOf([doc], null) };
    if (method === 'PUT' && url === '/api/site/blog/field-notes') {
      if (stale) return { status: 409, body: { error: 'This post has a newer draft. Reload it before saving another version.', code: 'CONFLICT' } };
      const next = documentOf('post:7:v2', (body as { content: BlogPostContent }).content, 'post:7:v1');
      return { body: stateOf([next, doc], null) };
    }
    return undefined;
  });
  const { container, unmount } = await mount(<BlogEditorClient mode="edit" slug="field-notes" />);
  assert.match(container.textContent ?? '', /Edit post/);
  assert.match(container.textContent ?? '', /Draft/);
  assert.equal(container.querySelector<HTMLTextAreaElement>('#blog-title')!.value, 'Field notes that travel');
  await setValue(container.querySelector<HTMLTextAreaElement>('#blog-title')!, 'Field notes, revised');
  await click(button(container, 'Save draft'));
  const put = calls.find((call) => call.method === 'PUT')!;
  assert.equal((put.body as { parentDocumentId: string }).parentDocumentId, 'post:7:v1');
  assert.match(container.textContent ?? '', /Saved/);

  stale = true;
  await setValue(container.querySelector<HTMLTextAreaElement>('#blog-title')!, 'Field notes, again');
  await click(button(container, 'Save draft'));
  assert.equal((calls.filter((call) => call.method === 'PUT').at(-1)!.body as { parentDocumentId: string }).parentDocumentId, 'post:7:v2');
  assert.match(container.textContent ?? '', /newer draft/);
  assert.equal(container.querySelector<HTMLTextAreaElement>('#blog-title')!.value, 'Field notes, again');
  unmount();
});

test('Edit post: a draft restored from before the last publish shows the published version’s updates', async () => {
  const first = documentOf('post:7:v1', post(), null);
  const live = documentOf('post:7:v2', post({ title: 'Field notes that last' }), 'post:7:v1');
  const restored = documentOf('post:7:v3', post(), 'post:7:v2', 'restore', 'post:7:v1');
  fakeApi(({ method, url }) => {
    if (url === '/api/site/blog/related') return { body: { choices: [] } };
    if (method === 'GET' && url === '/api/site/blog/field-notes') return { body: stateOf([restored, live, first], live.id) };
    return undefined;
  });
  const { container, unmount } = await mount(<BlogEditorClient mode="edit" slug="field-notes" />);
  assert.match(container.textContent ?? '', /Live/);
  const notice = container.querySelector('[data-post-updates-notice]');
  assert.ok(notice, 'the notice shows');
  assert.match(notice!.textContent ?? '', /1 update your draft doesn’t have/);
  unmount();
});

test('Draft preview: sanitized, with Learn more cards resolved from the catalog', async () => {
  const html = '<p>Hello <a href="javascript:alert(1)">there</a></p><blog-related-tile data-kind="post" data-id="3"></blog-related-tile><script>bad()</script>';
  const { container, unmount } = await mount(<BlogDraftPreview title="" content={html} imageUrl="" headingRef={{ current: null }} relatedChoices={[{ kind: 'post', id: '3', title: 'Quiet tools', slug: 'quiet-tools' }]} />);
  assert.match(container.textContent ?? '', /Untitled post/);
  assert.equal(container.querySelector('script'), null);
  assert.equal(container.querySelector('a[href^="javascript"]'), null);
  const card = container.querySelector('a[data-related-tile]');
  assert.equal(card?.getAttribute('href'), '/blog/quiet-tools');
  assert.match(card?.textContent ?? '', /Quiet tools/);
  unmount();
});
