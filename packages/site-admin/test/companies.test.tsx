import './setup-dom.ts';
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { CompanyDirectory as Directory, CompanyProfile, ProjectRecord } from '@rcweston/site-data/client';
import { AdminProvider } from '../src/config.tsx';
import { ADMIN_MODULES } from '../src/registry.ts';
import { buildAdminNav, findCurrentAdminNavItem } from '../src/shell/navigation.ts';
import { CompanyDirectory, CompanyEditor, companiesModule } from '../src/modules/companies/index.ts';
import { CompaniesPanel, filterProjects, projectsModule, sortProjects } from '../src/modules/projects/index.ts';

const router = { pathname: '/admin/companies', push: () => undefined, replace: () => undefined };
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

async function render(node: ReactNode) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => { root.render(<AdminProvider router={router} modules={ADMIN_MODULES}>{node}</AdminProvider>); });
  for (let i = 0; i < 5; i++) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  return { container, unmount: () => act(async () => { root.unmount(); container.remove(); }) };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const company = (overrides: Partial<CompanyProfile> = {}): CompanyProfile => ({
  slug: 'tidewater-transit', name: 'Tidewater Transit', summary: 'Regional ferries and buses.', website: null, logoUrl: '/logos/tidewater-transit.svg',
  logoLibrary: { logos: [], defaultId: null }, version: 1, updatedAt: '2026-11-01T00:00:00.000Z', ...overrides,
});
const button = (container: Element, label: string) => [...container.querySelectorAll('button')].find((node) => node.textContent?.includes(label));

test('Companies sits in Portfolio between Work and Image library; project details belong to Work', () => {
  const groups = buildAdminNav(ADMIN_MODULES, { adminBase: '/admin' });
  const portfolio = groups.find((group) => group.label === 'Portfolio')!;
  assert.deepEqual(portfolio.items.map((item) => item.name), ['Work', 'Companies', 'Image library']);
  assert.equal(portfolio.items[1]!.description, 'Manage company profiles and assigned case studies');
  assert.equal(findCurrentAdminNavItem(groups, '/admin/companies/profile/tidewater-transit', '/admin')?.name, 'Companies');
  assert.equal(findCurrentAdminNavItem(groups, '/admin/projects/route-planner/edit', '/admin')?.name, 'Work');
  assert.equal(companiesModule.id, 'companies');
  assert.deepEqual(projectsModule.quickActions.map((action) => action.label), ['New prototype']);
});

test('an empty directory says how to start, and a search that matches nothing says so', async () => {
  const empty: Directory = { schemaAvailable: true, companies: [], memberships: [] };
  const view = await render(<CompanyDirectory fixture={empty} />);
  assert.match(view.container.textContent ?? '', /No companies yet\. Add one to start assigning case studies\./);
  assert.ok([...view.container.querySelectorAll('a')].some((link) => link.getAttribute('href') === '/admin/companies/new' && link.textContent === 'New company'));
  await view.unmount();

  const listed = await render(<CompanyDirectory fixture={{ schemaAvailable: true, companies: [company()], memberships: [{ storySlug: 'transit-map', companySlug: 'tidewater-transit', version: 1, updatedAt: null }] }} />);
  assert.match(listed.container.textContent ?? '', /Tidewater Transit/);
  assert.match(listed.container.textContent ?? '', /1 assigned case study/);
  const search = listed.container.querySelector<HTMLInputElement>('input[type="search"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(search, 'harbor');
    search.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  assert.match(listed.container.textContent ?? '', /No companies match your search\./);
  await listed.unmount();
});

test('a save over a newer version is refused with the reason, and the edit stays', async () => {
  const calls: { method: string; url: string; body?: string }[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ method: init.method ?? 'GET', url, body: typeof init.body === 'string' ? init.body : undefined });
    if (url.endsWith('/assets')) return json({ projects: [], usedBy: [] });
    if (init.method === 'PUT') return json({ error: 'This company changed somewhere else. Reload to see the latest, then try again.', code: 'CONFLICT', current: company({ version: 2 }) }, 409);
    return json({ company: company() });
  }) as typeof fetch;
  const view = await render(<CompanyEditor slug="tidewater-transit" />);
  const name = view.container.querySelector<HTMLInputElement>('input[maxlength="120"]')!;
  assert.equal(name.value, 'Tidewater Transit');
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(name, 'Tidewater Ferries');
    name.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  await act(async () => { button(view.container, 'Save company')!.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
  for (let i = 0; i < 5; i++) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  const put = calls.find((call) => call.method === 'PUT')!;
  assert.equal(put.url, '/api/site/companies/profile/tidewater-transit');
  assert.equal(JSON.parse(put.body!).expectedVersion, 1);
  assert.match(view.container.textContent ?? '', /changed somewhere else/);
  assert.equal(name.value, 'Tidewater Ferries');
  await view.unmount();
});

test('the Companies panel counts studies and filters by name', async () => {
  const chosen: string[] = [];
  const view = await render(<CompaniesPanel companies={[{ ...company(), count: 2 }, { ...company({ slug: 'unassigned', name: 'Unassigned', updatedAt: null, summary: '' }), count: 1 }]} total={3} filter="all" onFilter={(value) => chosen.push(value)} schemaAvailable />);
  assert.match(view.container.textContent ?? '', /3 studies/);
  assert.match(view.container.textContent ?? '', /2 companies/);
  assert.equal(button(view.container, 'All companies')!.getAttribute('aria-pressed'), 'true');
  await act(async () => { button(view.container, 'Tidewater Transit')!.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
  assert.deepEqual(chosen, ['Tidewater Transit']);
  // Only a saved profile has an Edit link.
  assert.deepEqual([...view.container.querySelectorAll('a[aria-label^="Edit"]')].map((link) => link.getAttribute('href')), ['/admin/companies/profile/tidewater-transit']);
  await view.unmount();
});

test('prototype rows: search across their fields, sort stably, order as the site does', () => {
  const record = (slug: string, overrides: Partial<ProjectRecord> = {}): ProjectRecord => ({
    slug, title: slug, description: '', tags: [], image: null, images: [], featured: false, date: '2025-01-01', role: null, org: null,
    type: 'Prototype', duration: null, url: null, version: 1, updatedAt: '2026-01-01T00:00:00.000Z', ...overrides,
  });
  const all = [record('route-planner', { url: 'https://example.com/route', tags: ['Maps'], date: '2024-03-01' }), record('stop-finder', { date: '2025-06-01' }), record('field-notes', { type: null })];
  assert.deepEqual(filterProjects(all, 'prototype', '').map((item) => item.slug), ['route-planner', 'stop-finder']);
  assert.deepEqual(filterProjects(all, 'prototype', 'maps').map((item) => item.slug), ['route-planner']);
  assert.deepEqual(filterProjects(all, 'record', '').map((item) => item.slug), ['field-notes']);
  const prototypes = filterProjects(all, 'prototype', '');
  assert.deepEqual(sortProjects(prototypes, { key: 'order', direction: 'asc' }).map((item) => item.slug), ['stop-finder', 'route-planner']);
  assert.deepEqual(sortProjects(prototypes, { key: 'order', direction: 'asc' }, ['route-planner']).map((item) => item.slug), ['route-planner', 'stop-finder']);
  assert.deepEqual(sortProjects(prototypes, { key: 'status', direction: 'desc' }).map((item) => item.slug), ['route-planner', 'stop-finder']);
});
