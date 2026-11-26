import './setup-dom.ts';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { AuthAdapter, MediaStore } from '@rcweston/story-core';
import { SITE_DATA_MODULES, createSiteData } from '@rcweston/site-data';
import { commitPendingDelete } from '@rcweston/save-kit';
import { AdminProvider } from '../src/config.tsx';
import { ADMIN_MODULES } from '../src/registry.ts';
import { buildAdminNav } from '../src/shell/navigation.ts';
import type { AdminModule } from '../src/modules/define.ts';
import { ResumeScreen } from '../src/modules/resume/ResumeScreen.tsx';
import { SeoScreen } from '../src/modules/seo/SeoScreen.tsx';
import { AppearanceScreen } from '../src/modules/appearance/AppearanceScreen.tsx';

// ── A real site-data backend in memory, behind a stubbed fetch ──────────────

function memoryMedia(): MediaStore {
  const objects = new Map<string, { bytes: Uint8Array; contentType: string }>();
  return {
    put: async ({ key, bytes, contentType }) => {
      objects.set(key, { bytes, contentType });
      return { key };
    },
    get: async (key) => {
      const found = objects.get(key);
      return found ? ({ body: found.bytes, contentType: found.contentType, size: found.bytes.byteLength } as never) : null;
    },
    head: async (key) => {
      const found = objects.get(key);
      return found ? ({ contentType: found.contentType, size: found.bytes.byteLength } as never) : null;
    },
    delete: async (key) => void objects.delete(key),
    list: async (prefix) => ({ keys: [...objects.keys()].filter((key) => key.startsWith(prefix)) }),
  };
}

const openAuth: AuthAdapter = {
  getSession: async () => ({ role: 'admin', subject: 'test' }),
  requireAdmin: async () => ({ role: 'admin', subject: 'test' }),
  canViewProtected: async () => true,
};

const pdf = (text: string) => new TextEncoder().encode(`%PDF-1.4\n% ${text}\n%%EOF\n`);

function backend(stories: unknown[] = []) {
  const site = createSiteData({
    modules: SITE_DATA_MODULES,
    config: {
      'site-resources': { pages: [{ path: '/work', label: 'Work' }], resources: [{ id: 'resume', path: '/resume', label: 'Résumé', description: 'Work resource buttons and the sitemap.' }] },
      resume: { base: { filename: 'lena-ortiz-resume.pdf', read: async () => pdf('base'), modifiedAt: '2026-11-01T00:00:00.000Z' } },
      seo: { siteUrl: 'https://example.com', fallbacks: { titleTemplate: '%s · Lena Ortiz', defaultTitle: 'Lena Ortiz', description: 'Case studies.', keywords: [], siteName: 'Lena Ortiz' } },
    },
    services: { media: memoryMedia() },
  });
  const handlers = site.handlers({ auth: openAuth, revalidate: () => undefined });
  const requests: string[] = [];
  const send = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'https://app.example');
    requests.push(`${init?.method ?? 'GET'} ${url.pathname}`);
    if (url.pathname === '/api/story/stories') return Response.json({ stories });
    if (url.pathname.startsWith('/api/site/')) return handlers.handle(new Request(url, init));
    return new Response('{}', { status: 404 });
  };
  globalThis.fetch = send as typeof fetch;
  // Another tab's write, straight to the handlers.
  const elsewhere = (path: string, method: string, body: unknown) =>
    handlers.handle(new Request(`https://app.example/api/site${path}`, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  return { site, requests, elsewhere };
}

// ── Rendering helpers ───────────────────────────────────────────────────────

const router = { pathname: '/admin', push: () => undefined, replace: () => undefined };
const mounted: (() => Promise<void>)[] = [];

async function render(node: React.ReactNode) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<AdminProvider router={router} modules={ADMIN_MODULES}>{node}</AdminProvider>);
  });
  await settle();
  mounted.push(async () => {
    await act(async () => root.unmount());
    container.remove();
  });
  return container;
}

/** Let fetches and their state updates finish. */
const settle = async () => {
  for (let i = 0; i < 6; i += 1) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
};

const byText = (container: Element, selector: string, text: string) =>
  [...container.querySelectorAll(selector)].find((element) => element.textContent?.trim() === text) as HTMLElement | undefined;

const click = async (element: Element | null | undefined) => {
  assert.ok(element, 'the element to click is on the page');
  await act(async () => { (element as HTMLElement).click(); });
  await settle();
};

const type = async (element: Element | null | undefined, value: string) => {
  assert.ok(element, 'the field is on the page');
  const field = element as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), 'value')!.set!;
  await act(async () => {
    setter.call(field, value);
    field.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
};

const choose = async (input: Element | null, file: File) => {
  assert.ok(input);
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  await act(async () => { input.dispatchEvent(new window.Event('change', { bubbles: true })); });
  await settle();
};

afterEach(async () => {
  while (mounted.length) await mounted.pop()!();
  localStorage.clear();
});

// ── Nav ─────────────────────────────────────────────────────────────────────

describe('settings modules in the nav', () => {
  it('Resume sits under Publishing; Appearance then SEO under Site Settings', () => {
    const groups = buildAdminNav(ADMIN_MODULES, { adminBase: '/admin' });
    const group = (label: string) => groups.find((g) => g.label === label)?.items.map((item) => [item.name, item.href, item.description]);
    assert.deepEqual(group('Publishing')?.find(([name]) => name === 'Resume'), ['Resume', '/admin/resume', 'Resume document']);
    assert.deepEqual(group('Site Settings'), [
      ['Appearance', '/admin/appearance', 'Display preferences'],
      ['SEO', '/admin/seo', 'Search and sharing metadata'],
    ]);
    const modules: readonly AdminModule[] = ADMIN_MODULES;
    const actions = modules.flatMap((module) => module.quickActions ?? []);
    assert.ok(actions.some((action) => action.label === 'Upload Resume' && action.path === 'resume'));
  });
});

// ── Resume ──────────────────────────────────────────────────────────────────

describe('ResumeScreen', () => {
  it('serves the shipped base, refuses a non-PDF, uploads, and reverts', async () => {
    const { site } = backend();
    const page = await render(<ResumeScreen />);
    assert.match(page.textContent ?? '', /Currently serving the base shipped in the repo\./);
    assert.match(page.textContent ?? '', /lena-ortiz-resume\.pdf/);
    assert.match(page.textContent ?? '', /Shipped base ·/);
    assert.equal((byText(page, 'button', 'Revert to base') as HTMLButtonElement).disabled, true);

    const input = page.querySelector('input[type="file"]');
    await choose(input, new File(['hello'], 'notes.txt', { type: 'text/plain' }));
    assert.match(page.textContent ?? '', /“notes\.txt” isn’t a PDF\. Choose a PDF file\./);

    await choose(input, new File([pdf('mine') as Uint8Array<ArrayBuffer>], 'Lena resume 2026.pdf', { type: 'application/pdf' }));
    assert.match(page.textContent ?? '', /Uploaded — \/resume now serves this file/);
    assert.match(page.textContent ?? '', /Currently serving your upload\./);
    assert.equal((await site.reads.resume.state()).upload?.filename, 'Lena resume 2026.pdf');

    await click(byText(page, 'button', 'Revert to base'));
    assert.match(page.textContent ?? '', /Currently serving the base shipped in the repo\./);
    await act(async () => { commitPendingDelete(); });
    await settle();
    assert.equal((await site.reads.resume.state()).upload, null);
  });

  it('an upload made somewhere else first is a conflict: nothing replaced, the page shows what’s there', async () => {
    const { site } = backend();
    const page = await render(<ResumeScreen />);
    // Another tab uploads after this page loaded.
    const form = new FormData();
    form.append('file', new File([pdf('other tab') as Uint8Array<ArrayBuffer>], 'other.pdf', { type: 'application/pdf' }));
    form.append('expectedVersion', '0');
    const other = await site.handlers({ auth: openAuth, revalidate: () => undefined }).handle(new Request('https://app.example/api/site/resume', { method: 'POST', body: form }));
    assert.equal(other.status, 200);

    await choose(page.querySelector('input[type="file"]'), new File([pdf('mine') as Uint8Array<ArrayBuffer>], 'mine.pdf', { type: 'application/pdf' }));
    assert.match(page.textContent ?? '', /changed somewhere else/);
    assert.equal((await site.reads.resume.state()).upload?.filename, 'other.pdf');
    assert.match(page.textContent ?? '', /other\.pdf/);
  });
});

// ── SEO ─────────────────────────────────────────────────────────────────────

describe('SeoScreen', () => {
  it('starts empty, leaves Posts out without a blog, and saves the defaults', async () => {
    const { site } = backend();
    const page = await render(<SeoScreen />);
    assert.match(page.textContent ?? '', /No static page overrides configured/);
    assert.match(page.textContent ?? '', /No work projects found/);
    assert.doesNotMatch(page.textContent ?? '', /Posts \(/);
    assert.equal((page.querySelector('#seo-field-title-template') as HTMLInputElement).placeholder, '%s · Lena Ortiz');

    await type(page.querySelector('#seo-field-default-title'), 'Lena Ortiz · Designer');
    await type(page.querySelector('#seo-field-twitter-handle'), 'lenaortiz');
    await click(byText(page, 'button', 'Save Defaults'));
    const saved = await site.reads.seo.defaults();
    assert.equal(saved.defaultTitle, 'Lena Ortiz · Designer');
    assert.equal(saved.twitterHandle, '@lenaortiz');
    assert.equal((page.querySelector('#seo-field-twitter-handle') as HTMLInputElement).value, '@lenaortiz');
    assert.equal((await site.reads.seo.metadata('/')).title.absolute, 'Lena Ortiz · Designer');
  });

  it('a stale save of the defaults is refused and keeps what was typed', async () => {
    const { site, elsewhere } = backend();
    const page = await render(<SeoScreen />);
    assert.equal((await elsewhere('/seo', 'PUT', { defaults: { defaultTitle: 'From another tab' }, expectedVersion: 0 })).status, 200);

    await type(page.querySelector('#seo-field-default-title'), 'Mine');
    await click(byText(page, 'button', 'Save Defaults'));
    assert.match(page.textContent ?? '', /changed somewhere else/);
    assert.equal((await site.reads.seo.defaults()).defaultTitle, 'From another tab');
    assert.equal((page.querySelector('#seo-field-default-title') as HTMLInputElement).value, 'Mine');
  });

  it('adds a static page override from the site’s pages, and lists stories with a draft badge', async () => {
    const { site } = backend([
      { slug: 'harbor-map', title: 'Harbor map', company: 'Fieldnote Studio', publishedDocumentId: 'd1' },
      { slug: 'night-bus', title: 'Night bus', company: '', publishedDocumentId: null },
    ]);
    const page = await render(<SeoScreen />);
    assert.match(page.textContent ?? '', /Work \/ Case Studies \(2\)/);
    assert.match(page.textContent ?? '', /Harbor map — Fieldnote Studio/);
    assert.ok(byText(page, 'span', 'Draft'));

    await click(byText(page, 'button', 'Add Override'));
    const select = page.querySelector('#seo-page-path') as HTMLSelectElement;
    assert.deepEqual([...select.options].map((option) => option.value), ['', '/', '/work', '/resume', '__custom__']);
    await act(async () => {
      select.value = '/work';
      select.dispatchEvent(new window.Event('change', { bubbles: true }));
    });
    await type(page.querySelector('#seo-field-title'), 'Selected work');
    await click(byText(page, 'button', 'Save Override'));
    assert.match(page.textContent ?? '', /Static Pages \(1\)/);
    assert.equal((await site.reads.seo.override('/work'))?.title, 'Selected work');
  });
});

// ── Appearance ──────────────────────────────────────────────────────────────

describe('AppearanceScreen', () => {
  it('turns sunny mode on and picks an accent, each saved at once', async () => {
    const { site } = backend();
    const page = await render(<AppearanceScreen />);
    const sunny = page.querySelector('[role="switch"]') as HTMLButtonElement;
    assert.equal(sunny.getAttribute('aria-checked'), 'false');
    await click(sunny);
    assert.equal(sunny.getAttribute('aria-checked'), 'true');
    assert.equal((await site.reads.appearance.current()).sunny, true);

    await click(page.querySelector('[aria-label="Plum"]'));
    assert.equal((await site.reads.appearance.current()).accent, 'plum');
    assert.match((await site.reads.appearance.styles()).css, /--accent-primary:#7E22CE/);
  });

  it('a change made somewhere else first is refused and the page shows what’s saved', async () => {
    const { site, elsewhere } = backend();
    const page = await render(<AppearanceScreen />);
    const settings = await site.reads.appearance.current();
    assert.equal((await elsewhere('/appearance', 'PUT', { settings: { ...settings, defaultTheme: 'dark' }, expectedVersion: 0 })).status, 200);

    await click(page.querySelector('[role="switch"]'));
    assert.match(page.textContent ?? '', /changed somewhere else/);
    assert.equal((await site.reads.appearance.current()).sunny, false);
    assert.equal(page.querySelector('[role="switch"]')?.getAttribute('aria-checked'), 'false');
    assert.equal(byText(page, 'button', 'Dark')?.getAttribute('aria-checked'), 'true');
  });
});
