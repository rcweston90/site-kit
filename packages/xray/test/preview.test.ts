import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import { matchRoutes } from '../src/routes.ts';

// Two things are pinned here: X-ray mounts only on the routes a host allows,
// and the toggle needs nothing from a server. The route half is
// `matchRoutes`; the server half is checked against the package's own files.

const src = new URL('../src/', import.meta.url);
const read = (name: string) => readFile(new URL(name, src), 'utf8');

test('a host can keep X-ray to its public pages', () => {
  const publicOnly = matchRoutes(['/', '/products', '/stories', '/help'], ['/products/drafts']);
  for (const route of ['/', '/products', '/products/example', '/stories', '/help']) {
    assert.equal(publicOnly(route), true, route);
  }
  for (const route of ['/admin', '/admin/xray', '/products/drafts', '/internal', '/sandbox', '/dev/fixtures']) {
    assert.equal(publicOnly(route), false, route);
  }
});

test('the inspector mounts only once the host allows it, and only while open', async () => {
  const xray = await read('XRay.tsx');
  assert.match(xray, /if \(!allowed\) return null;/);
  assert.match(xray, /\{on && \(/);
  assert.match(xray, /lazy\(\(\) => import\('\.\/XRayInspector\.js'\)\)/);
  assert.doesNotMatch(xray, /from 'next\//);
});

test('nothing in the package talks to a server or reads site paths', async () => {
  const files = (await readdir(src)).filter((f) => /\.(ts|tsx)$/.test(f));
  assert.ok(files.length > 10);
  for (const file of files) {
    const text = await read(file);
    assert.doesNotMatch(text, /\bfetch\(|XMLHttpRequest|sendBeacon|new WebSocket|new EventSource/, file);
    assert.doesNotMatch(text, /from '@\/|from 'next\//, file);
  }
});
