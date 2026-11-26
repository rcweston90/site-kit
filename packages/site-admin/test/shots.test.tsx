import './setup-dom.ts';
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { ShotRecord } from '@rcweston/site-data/client';
import { AdminProvider } from '../src/config.tsx';
import { ShotsScreen } from '../src/modules/shots/ShotsScreen.tsx';
import { shotsModule } from '../src/modules/shots/index.ts';
import { buildAdminNav } from '../src/shell/navigation.ts';

const router = { pathname: '/admin/shots', push: () => {}, replace: () => {} };

const shot = (id: number, overrides: Partial<ShotRecord> = {}): ShotRecord => ({
  id,
  url: `/api/site/shots/media/shots/${id}.webp`,
  pathname: `shots/${id}.webp`,
  width: 1600,
  height: 1200,
  blur_data_url: null,
  alt: `Shot ${id}`,
  hidden: false,
  sort_order: id,
  version: 1,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

type Call = { method: string; body: unknown };
let calls: Call[] = [];
const realFetch = globalThis.fetch;

function serve(handler: (call: Call) => { status: number; body: unknown }) {
  calls = [];
  globalThis.fetch = (async (_input: RequestInfo | URL, init: RequestInit = {}) => {
    const call = { method: init.method ?? 'GET', body: typeof init.body === 'string' ? JSON.parse(init.body) : init.body ?? null };
    calls.push(call);
    const { status, body } = handler(call);
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = realFetch;
  document.body.innerHTML = '';
  localStorage.clear();
});

async function render() {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<AdminProvider router={router} modules={[shotsModule]}><ShotsScreen /></AdminProvider>);
  });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
  return { container, unmount: () => act(async () => root.unmount()) };
}

const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });

test('Shots sits in Publishing, counts every shot and offers Upload Shot', async () => {
  const [publishing] = buildAdminNav([shotsModule], { adminBase: '/admin' });
  assert.equal(publishing.label, 'Publishing');
  assert.deepEqual(publishing.items.map((item) => [item.name, item.href, item.description]), [['Shots', '/admin/shots', 'Photography library']]);
  assert.deepEqual(shotsModule.quickActions.map((action) => action.label), ['Upload Shot']);
  const urls: string[] = [];
  const count = await shotsModule.stats[0].count({
    config: { siteApi: '/api/site' } as never,
    read: async <T,>(url: string) => { urls.push(url); return { shots: [shot(1), shot(2, { hidden: true })], order: { version: 0, updatedAt: null } } as T; },
  });
  assert.equal(count, 2);
  assert.deepEqual(urls, ['/api/site/shots']);
});

test('an empty library says so under the dropzone', async () => {
  serve(() => ({ status: 200, body: { shots: [], order: { version: 0, updatedAt: null } } }));
  const { container, unmount } = await render();
  assert.match(container.textContent ?? '', /Manage Shots/);
  assert.match(container.textContent ?? '', /0 shots · drag to reorder/);
  assert.match(container.textContent ?? '', /Drop photos or click to upload/);
  assert.match(container.textContent ?? '', /No shots yet\. Drop photos above\./);
  assert.equal(container.querySelector('a')?.getAttribute('href'), '/shots');
  await unmount();
});

test('the list shows captions, sizes and which shots are hidden', async () => {
  serve(() => ({ status: 200, body: { shots: [shot(1), shot(2, { hidden: true })], order: { version: 3, updatedAt: null } } }));
  const { container, unmount } = await render();
  const inputs = [...container.querySelectorAll('input[placeholder="Caption / alt text"]')] as HTMLInputElement[];
  assert.deepEqual(inputs.map((input) => input.value), ['Shot 1', 'Shot 2']);
  assert.match(container.textContent ?? '', /2 shots · 1 hidden · drag to reorder/);
  assert.match(container.textContent ?? '', /1600×1200/);
  const toggles = [...container.querySelectorAll('button[aria-pressed]')].map((button) => button.textContent);
  assert.deepEqual(toggles, ['Hide', 'Show']);
  await unmount();
});

test('a caption saved elsewhere meanwhile keeps the text typed here and says what was stored', async () => {
  let stored = shot(1, { alt: 'Harbor at dusk', version: 2 });
  serve((call) => {
    if (call.method === 'PATCH') return { status: 409, body: { error: 'Changed elsewhere', current: stored } };
    return { status: 200, body: { shots: [calls.length > 1 ? stored : shot(1)], order: { version: 0, updatedAt: null } } };
  });
  const { container, unmount } = await render();
  const input = container.querySelector('input[placeholder="Caption / alt text"]') as HTMLInputElement;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, 'Ferry crossing');
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  await act(async () => { input.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true })); });
  await settle();
  const patch = calls.find((call) => call.method === 'PATCH');
  assert.deepEqual(patch?.body, { id: 1, alt: 'Ferry crossing', expectedVersion: 1 });
  assert.equal((container.querySelector('input[placeholder="Caption / alt text"]') as HTMLInputElement).value, 'Ferry crossing');
  assert.match(container.textContent ?? '', /Saved elsewhere as “Harbor at dusk”\. Save again to keep yours\./);
  // Saving again names the version it now knows about.
  stored = { ...stored, alt: 'Ferry crossing', version: 3 };
  serve((call) => call.method === 'PATCH'
    ? { status: 200, body: { success: true, shot: stored } }
    : { status: 200, body: { shots: [stored], order: { version: 0, updatedAt: null } } });
  await act(async () => { input.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true })); });
  await settle();
  assert.deepEqual(calls.find((call) => call.method === 'PATCH')?.body, { id: 1, alt: 'Ferry crossing', expectedVersion: 2 });
  assert.doesNotMatch(container.textContent ?? '', /Saved elsewhere/);
  await unmount();
});

test('Hide sends the shot’s version and shows it as hidden', async () => {
  serve((call) => call.method === 'PATCH'
    ? { status: 200, body: { success: true, shot: shot(1, { hidden: true, version: 2 }) } }
    : { status: 200, body: { shots: [shot(1)], order: { version: 0, updatedAt: null } } });
  const { container, unmount } = await render();
  const hide = container.querySelector('button[aria-pressed]') as HTMLButtonElement;
  await act(async () => { hide.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
  await settle();
  assert.deepEqual(calls.find((call) => call.method === 'PATCH')?.body, { id: 1, hidden: true, expectedVersion: 1 });
  assert.equal(container.querySelector('button[aria-pressed]')?.textContent, 'Show');
  assert.match(container.textContent ?? '', /· hidden/);
  await unmount();
});
