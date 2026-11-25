import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchRoutes } from '../src/routes.ts';

// A made-up site: X-ray on the home page and three public sections, never
// on the internal review pages that sit under one of them.
const isInspectable = matchRoutes(['/', '/docs', '/gallery', '/journal'], ['/docs/review']);

test('the included sections and the pages inside them match', () => {
  for (const path of ['/', '/docs', '/docs/getting-started', '/docs/api', '/gallery', '/journal', '/journal/a-post', '/journal/', '/docs?filter=new', '/gallery#top']) {
    assert.equal(isInspectable(path), true, path);
  }
});

test('excluded pages, other sections and look-alike paths do not', () => {
  for (const path of [
    '/settings',
    '/settings/billing',
    '/internal/fixtures',
    '/docs-preview',
    '/docs-lab',
    '/gallery-old',
    '/journalism',
    '/docs/review',
    '/docs/review/layouts',
    '/about',
    '',
    null,
    undefined,
  ]) {
    assert.equal(isInspectable(path), false, String(path));
  }
});

test("'/' in the include list means the home page, not everything", () => {
  const homeOnly = matchRoutes(['/']);
  assert.equal(homeOnly('/'), true);
  assert.equal(homeOnly(''), false);
  assert.equal(homeOnly('/docs'), false);
});

test('an exclude wins over an include that contains it', () => {
  const all = matchRoutes(['/app'], ['/app/admin']);
  assert.equal(all('/app/projects'), true);
  assert.equal(all('/app/admin'), false);
  assert.equal(all('/app/admin/users'), false);
});
