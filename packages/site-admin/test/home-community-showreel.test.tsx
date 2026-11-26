import './setup-dom.ts';
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { EMPTY_COMMUNITY, type CommunityContent, type CommunityResponse, type HomeAboutResponse, type HomeHeaderImagesResponse, type ShowreelResponse } from '@rcweston/site-data/client';
import { AdminProvider } from '../src/config.tsx';
import { ADMIN_MODULES } from '../src/registry.ts';
import { buildAdminNav } from '../src/shell/navigation.ts';
import { CommunityScreen, communityModule } from '../src/modules/community/index.ts';
import { HomeScreen, homeModule } from '../src/modules/home/index.ts';
import { ShowreelScreen, showreelModule } from '../src/modules/showreel/index.ts';
import { CONFLICT_MESSAGE } from '../src/modules/home/conflict.ts';

type Handler = (url: string, init: RequestInit) => { status?: number; body: unknown };
const calls: { url: string; method: string; body: unknown }[] = [];
const realFetch = globalThis.fetch;

function serve(handler: Handler) {
  globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    const method = init.method ?? 'GET';
    calls.push({ url, method, body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined });
    const { status = 200, body } = handler(url, init);
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = realFetch;
  calls.length = 0;
  localStorage.clear();
  document.body.innerHTML = '';
});

const router = { pathname: '/admin', push() {}, replace() {} };

async function render(node: ReactNode) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<AdminProvider router={router} config={{ siteApi: '/api/site', storyApi: '/api/story' }} modules={ADMIN_MODULES}>{node}</AdminProvider>);
  });
  // Let the load effects settle.
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  return { container, unmount: () => act(async () => root.unmount()) };
}

const click = (element: Element | null | undefined) => act(async () => {
  assert.ok(element, 'element to click');
  element.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 0));
});

/** Sets a controlled input's value the way React notices. */
const type = (element: Element | null | undefined, value: string) => act(async () => {
  assert.ok(element, 'element to type into');
  const input = element as HTMLInputElement | HTMLTextAreaElement;
  const proto = input instanceof window.HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(input, value);
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
});

const button = (container: Element, text: string) => [...container.querySelectorAll('button')].find((item) => item.textContent?.trim() === text);
const statusText = (container: Element) => [...container.querySelectorAll('[role="status"]')].map((item) => item.textContent).join(' | ');

test('Home, Community and Showreel land in Publishing at the original slots', () => {
  const groups = buildAdminNav([...ADMIN_MODULES], { adminBase: '/admin' });
  const publishing = groups.find((group) => group.label === 'Publishing');
  assert.deepEqual(publishing?.items.map((item) => [item.name, item.href]), [
    ['Home', '/admin/home'],
    ['Community', '/admin/community'],
    ['Showreel', '/admin/showreel'],
  ]);
  assert.deepEqual([homeModule, communityModule, showreelModule].map((module) => module.nav[0].order), [0, 10, 70]);
});

const about = (version: number, tagline = 'Quiet maps for busy places.'): HomeAboutResponse => ({
  about: { tagline, bio: ['First paragraph.'], fastFacts: ['Wayfinding'] },
  defaults: { tagline: 'Default', bio: [], fastFacts: [] },
  customized: version > 0,
  version,
  updatedAt: null,
});
const header: HomeHeaderImagesResponse = { images: [null, null, null], shots: [], version: 0, updatedAt: null };

test('Home: shows the copy, saves with its version, and a 409 keeps the edit and says so', async () => {
  let stored = about(2);
  serve((url, init) => {
    if (url.endsWith('/home/header-images')) return { body: header };
    if (init.method === 'PUT') return { status: 409, body: { error: 'Saved somewhere else.', code: 'CONFLICT', current: stored } };
    return { body: stored };
  });
  const { container, unmount } = await render(<HomeScreen />);
  const tagline = container.querySelector<HTMLTextAreaElement>('#tagline');
  assert.equal(tagline?.value, 'Quiet maps for busy places.');
  assert.match(container.textContent ?? '', /Currently showing your edits/);
  assert.match(container.textContent ?? '', /No default photo/);

  stored = about(3, 'Someone else’s line.');
  await type(tagline, 'My new line.');
  await click(button(container, 'Save'));
  const put = calls.find((call) => call.method === 'PUT');
  assert.deepEqual(put?.body, { tagline: 'My new line.', bio: ['First paragraph.'], fastFacts: ['Wayfinding'], expectedVersion: 2 });
  assert.equal(container.querySelector<HTMLTextAreaElement>('#tagline')?.value, 'My new line.', 'the edit stays in the form');
  assert.ok(statusText(container).includes(CONFLICT_MESSAGE), statusText(container));

  // Saving again goes with the version that was there at the conflict.
  serve((url, init) => {
    if (url.endsWith('/home/header-images')) return { body: header };
    if (init.method === 'PUT') return { body: about(4, 'My new line.') };
    return { body: stored };
  });
  await click(button(container, 'Save'));
  assert.equal((calls.filter((call) => call.method === 'PUT').at(-1)?.body as { expectedVersion: number }).expectedVersion, 3);
  await unmount();
});

const community = (content: Partial<CommunityContent> = {}): CommunityResponse => ({
  content: { ...EMPTY_COMMUNITY, ...content },
  defaults: EMPTY_COMMUNITY,
  customized: false,
  version: 0,
  updatedAt: null,
  path: '/community',
});

test('Community: an empty page loads, rows hide and move, and the preview leaves hidden rows off', async () => {
  const talk = (title: string) => ({ date: '2026-03-01', title, venue: 'Harbor Hall', description: '', kind: 'Talk', action: 'Watch', minutes: 20, href: 'https://example.com/' + title });
  serve(() => ({ body: community({ speaking: { heading: 'Speaking', intro: '', talks: [talk('One'), talk('Two')] } }) }));
  let previewed: CommunityContent | null = null;
  const Preview = ({ content }: { content: CommunityContent }) => { previewed = content; return <p>{content.speaking.talks.map((t) => t.title).join(',')}</p>; };
  const { container, unmount } = await render(<CommunityScreen Preview={Preview} />);
  assert.match(container.textContent ?? '', /Currently showing the shipped defaults/);
  assert.equal(container.querySelector('a[href="/community"]')?.textContent, 'View the page ↗');

  await click(container.querySelector('[aria-label="Hide Talks 1"]'));
  assert.equal(container.querySelector('[aria-label="Show Talks 1"]')?.getAttribute('aria-pressed'), 'true');
  assert.deepEqual(previewed!.speaking.talks.map((t) => t.title), ['Two']);

  await click(container.querySelector('[aria-label="Move Talks 1 down"]'));
  await click(button(container, 'Save'));
  const put = calls.find((call) => call.method === 'PUT')?.body as { content: CommunityContent; expectedVersion: number };
  assert.deepEqual(put.content.speaking.talks.map((t) => [t.title, t.hidden ?? false]), [['Two', false], ['One', true]]);
  assert.equal(put.expectedVersion, 0);
  await unmount();
});

test('Community: a failed load says why instead of the form', async () => {
  serve(() => ({ status: 500, body: { error: 'down' } }));
  const { container, unmount } = await render(<CommunityScreen />);
  assert.equal(container.querySelector('[role="alert"]')?.textContent?.length !== 0, true);
  assert.equal(container.querySelector('#title'), null);
  await unmount();
});

test('Showreel: nothing set says so; a Figma link previews before Save and saves with its version', async () => {
  const empty: ShowreelResponse = { setting: null, defaultUrl: '', links: null, version: 0, path: '/showreel' };
  serve((_url, init) => init.method === 'PUT'
    ? { body: { ...empty, setting: { url: 'https://www.figma.com/deck/abc/Reel', updatedAt: '2026-11-01T00:00:00Z' }, links: { kind: 'deck', deck: 'https://www.figma.com/deck/abc/Reel', embed: 'https://embed.figma.com/deck/abc/Reel?embed-host=site-kit', video: null, poster: null }, version: 1 } }
    : { body: empty });
  const { container, unmount } = await render(<ShowreelScreen />);
  assert.match(container.textContent ?? '', /Nothing is set yet/);
  await type(container.querySelector('#deck-url'), 'https://figma.com/deck/abc/Reel');
  assert.match(container.querySelector('iframe')?.getAttribute('src') ?? '', /^https:\/\/embed\.figma\.com\/deck\/abc/);
  await click(button(container, 'Save'));
  assert.deepEqual(calls.find((call) => call.method === 'PUT')?.body, { url: 'https://figma.com/deck/abc/Reel', expectedVersion: 0 });
  assert.match(container.textContent ?? '', /Currently playing your reel/);
  await unmount();
});
