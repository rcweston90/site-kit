import './setup-dom.ts';
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { XRay, getXRay, matchRoutes, resetXRayConfig, setRhythmGrid, setXRay } from '../src/index.ts';
import { setXRayAllowed } from '../src/store.ts';

let root: Root | null = null;
let container: HTMLElement | null = null;

async function render(props: Parameters<typeof XRay>[0]) {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(XRay, props));
  });
  // Let the lazy inspector chunk and any verify promise settle.
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

const altX = () =>
  act(async () => {
    window.dispatchEvent(new window.KeyboardEvent('keydown', { code: 'KeyX', key: '≈', altKey: true, bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
  });

const launcher = () => document.querySelector('button[aria-label^="X-ray"]');
const dock = () => document.querySelector('[role="region"][aria-label="X-ray inspector"]');

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = container = null;
  setXRay(false);
  setXRayAllowed(false);
  setRhythmGrid(false);
  sessionStorage.clear();
  localStorage.clear();
  resetXRayConfig();
});

test('disabled, X-ray renders nothing and ignores ⌥X', async () => {
  await render({ enabled: false });
  assert.equal(launcher(), null);
  await altX();
  assert.equal(getXRay(), false);
  assert.equal(dock(), null);
});

test('enabled, the launcher shows and ⌥X opens the inspector', async () => {
  await render({ enabled: true });
  assert.ok(launcher(), 'launcher');
  await altX();
  assert.equal(getXRay(), true);
  for (let i = 0; i < 10 && !dock(); i++) await act(async () => new Promise((r) => setTimeout(r, 10)));
  assert.ok(dock(), 'dock');
  assert.equal(launcher(), null, 'the launcher steps aside while open');
});

test('launcher={false} keeps the button away but the shortcut works', async () => {
  await render({ enabled: true, launcher: false });
  assert.equal(launcher(), null);
  await altX();
  assert.equal(getXRay(), true);
});

test('a failing verify keeps X-ray unavailable', async () => {
  let asked = 0;
  await render({
    enabled: true,
    verify: async () => {
      asked++;
      return false;
    },
  });
  assert.equal(asked, 1);
  assert.equal(launcher(), null);
  setXRay(true);
  assert.equal(getXRay(), false);
});

test('a passing verify is asked once per tab', async () => {
  let asked = 0;
  const verify = async () => {
    asked++;
    return true;
  };
  await render({ enabled: true, verify });
  assert.ok(launcher());
  await act(async () => root!.unmount());
  container!.remove();
  setXRayAllowed(false);
  await render({ enabled: true, verify });
  assert.ok(launcher());
  assert.equal(asked, 1);
});

test('routes decide where it mounts', async () => {
  await render({ enabled: true, routes: matchRoutes(['/guides']) });
  assert.equal(launcher(), null, 'the page is /docs/intro');
  await act(async () => root!.unmount());
  container!.remove();
  await render({ enabled: true, routes: matchRoutes(['/docs']) });
  assert.ok(launcher());
  await act(async () => root!.unmount());
  container!.remove();
  await render({ enabled: true, pathname: '/guides/post', routes: matchRoutes(['/guides']) });
  assert.ok(launcher(), 'a pathname prop wins over the window');
});

test('the rhythm prop sets the baseline grid and its label', async () => {
  await render({ enabled: true, rhythm: { unit: 8 } });
  await act(async () => setRhythmGrid(true));
  const grid = document.querySelector('.xr-grid') as HTMLElement | null;
  assert.ok(grid, 'grid');
  assert.equal(grid.style.getPropertyValue('--xr-grid-minor'), '16px');
  assert.equal(grid.style.getPropertyValue('--xr-grid-major'), '48px');
  assert.match(grid.textContent ?? '', /16 px baseline · 48 px major/);
});

test('?xray=1 opens it once allowed', async () => {
  window.history.replaceState(null, '', '/docs/intro?xray=1');
  try {
    await render({ enabled: true });
    assert.equal(getXRay(), true);
  } finally {
    window.history.replaceState(null, '', '/docs/intro');
  }
});
