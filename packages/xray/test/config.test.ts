import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { configureXRay, getXRayConfig, gridLabel, paletteCss, paletteStyle, resetXRayConfig, rhythmFrom } from '../src/config.ts';
import { formatPx, rhythmFit, unitsLabel } from '../src/measure.ts';
import { buildSpec, offRhythm, y } from '../src/spec.ts';
import { classFor } from '../src/nudge.ts';
import { spacingOnScale } from '../src/coverage.ts';
import { breakpointOf, trackingToken } from '../src/inspect.ts';
import { breakpointWidths } from '../src/responsive.ts';
import type { Inspection } from '../src/inspect.ts';

afterEach(() => {
  resetXRayConfig();
});

const zero = { top: 0, right: 0, bottom: 0, left: 0 };
const card: Inspection = {
  name: 'div.panel',
  component: 'Panel',
  selector: 'main > div',
  crumbs: ['main', 'panel'],
  width: 320,
  height: 64,
  layout: 'block',
  margin: zero,
  padding: { top: 16, right: 16, bottom: 20, left: 16 },
  border: zero,
  gap: null,
  tracks: null,
  space: { above: 24, below: 32 },
  children: [],
  type: null,
  colour: {
    text: { hex: '#111111', alpha: 1, tokens: [] },
    background: { hex: '#FFFFFF', alpha: 1, tokens: [], overImage: false },
    border: null,
    contrast: null,
  },
  pinned: true,
  between: null,
};

test('the defaults are the 12px rhythm the tests are written against', () => {
  const r = getXRayConfig().rhythm;
  assert.equal(r.unit, 12);
  assert.deepEqual(r.steps.map((s) => [s.px, s.name]), [
    [12, 'half'],
    [24, 'minor'],
    [48, 'minor-2'],
    [72, 'major'],
    [144, 'major-2'],
  ]);
  assert.equal(r.minor, 24);
  assert.equal(r.major, 72);
  assert.equal(r.horizontal, 4);
  assert.equal(gridLabel(), '24 px baseline · 72 px major');
});

test('an 8px rhythm changes what counts as on the grid', () => {
  configureXRay({
    rhythm: {
      unit: 8,
      steps: [
        { px: 8, name: 'xs' },
        { px: 16, name: 'sm' },
        { px: 32, name: 'md' },
        { px: 64, name: 'lg' },
      ],
    },
  });
  assert.deepEqual(rhythmFit(16), { fit: 'token', name: 'sm' });
  assert.deepEqual(rhythmFit(64), { fit: 'token', name: 'lg' });
  assert.deepEqual(rhythmFit(24), { fit: 'grid', units: 3 }, '24 is three 8s, not a named step');
  assert.deepEqual(rhythmFit(12), { fit: 'off' }, '12 is off an 8px grid');
  assert.deepEqual(rhythmFit(15.6), { fit: 'token', name: 'sm' });
  assert.equal(unitsLabel(3), '3×8');
  // minor and major follow the unit when not given.
  assert.equal(getXRayConfig().rhythm.minor, 16);
  assert.equal(getXRayConfig().rhythm.major, 48);
  assert.equal(gridLabel(), '16 px baseline · 48 px major');
});

test('the copied spec speaks the configured rhythm', () => {
  configureXRay({ rhythm: { unit: 8, steps: [{ px: 8, name: 'xs' }, { px: 16, name: 'sm' }, { px: 32, name: 'md' }, { px: 64, name: 'lg' }] } });
  assert.equal(y(16), '16 (sm)');
  assert.equal(y(24), '24 (3×8)');
  assert.equal(y(20), '20 ⚠ off-grid');
  assert.deepEqual(offRhythm(card), ['padding-bottom 20']);
  const spec = buildSpec(card, { path: '/example', viewport: [1280, 800], breakpoint: 'xl' });
  assert.match(spec, /- Padding \(top · right · bottom · left\): 16 \(sm\) · 16 · 20 ⚠ off-grid · 16/);
  assert.match(spec, /- Space to siblings: above 24 \(3×8\) · below 32 \(md\)/);
  assert.match(spec, /- Rhythm: ⚠ off the 8px grid — padding-bottom 20$/);
  assert.doesNotMatch(spec, /12px|×12/);

  const clean = { ...card, padding: { ...card.padding, bottom: 16 } };
  assert.match(buildSpec(clean, { path: '/', viewport: [390, 844], breakpoint: 'base' }), /- Rhythm: ✓ every vertical value is on the 8px grid/);
});

test('the same element reads differently on the default rhythm', () => {
  assert.equal(y(16), '16 ⚠ off-grid');
  assert.equal(y(24), '24 (minor)');
  assert.match(buildSpec(card, { path: '/', viewport: [1280, 800], breakpoint: 'xl' }), /off the 12px grid — padding-top 16, padding-bottom 20, space below 32$/m);
});

test('nudge classes and coverage follow the configured steps', () => {
  configureXRay({ rhythm: { unit: 8, steps: [{ px: 8, name: 'xs' }, { px: 16, name: 'sm' }], horizontal: 8 } });
  assert.equal(classFor('padding-top', 16), 'pt-sm');
  assert.equal(classFor('padding-left', 24), 'pl-3', 'three horizontal steps');
  assert.equal(classFor('padding-left', 12), 'pl-[12px]');
  assert.equal(spacingOnScale(24, true, undefined, 0), true);
  assert.equal(spacingOnScale(12, true, undefined, 0), false);
  assert.equal(spacingOnScale(12, false, undefined, 0), false, '12 is off an 8px horizontal step');
});

test('a partial rhythm completes itself from the unit', () => {
  const r = rhythmFrom({ unit: 4 });
  assert.deepEqual(r.steps.map((s) => s.px), [4, 8, 16, 24, 48]);
  assert.equal(r.minor, 8);
  assert.equal(r.major, 24);
  const explicit = rhythmFrom({ unit: 8, minor: 24, major: 96 });
  assert.equal(explicit.minor, 24);
  assert.equal(explicit.major, 96);
});

test('breakpoints and tracking tokens are configurable, with Tailwind defaults', () => {
  assert.equal(breakpointOf(390), 'base');
  assert.equal(breakpointOf(1280), 'xl');
  assert.equal(trackingToken(0.1), 'widest');
  assert.equal(trackingToken(0.16), null);
  assert.deepEqual(breakpointWidths().map(([n]) => n), ['base', 'sm', 'md', 'lg', 'xl', '2xl']);

  configureXRay({
    breakpoints: [
      { name: 'desktop', min: 1100 },
      { name: 'tablet', min: 700 },
    ],
    baseName: 'phone',
    baseWidth: 375,
    tracking: [{ name: 'eyebrow', em: 0.16 }],
  });
  assert.equal(breakpointOf(375), 'phone');
  assert.equal(breakpointOf(800), 'tablet');
  assert.equal(breakpointOf(1200), 'desktop');
  assert.deepEqual(breakpointWidths(), [
    ['phone', 375],
    ['tablet', 700],
    ['desktop', 1100],
  ]);
  assert.equal(trackingToken(0.16), 'eyebrow');
  assert.equal(trackingToken(0.1), null);
});

test('palette roles take a custom property or a colour, defaulting to --xray-* with fallbacks', () => {
  assert.equal(paletteCss('off'), 'var(--xray-off, #dc2626)');
  assert.deepEqual(paletteStyle(), {}, 'nothing inline until a role is configured');
  configureXRay({ palette: { off: '--brand-danger', panel: '#000' } });
  assert.equal(paletteCss('off'), 'var(--brand-danger, var(--xray-off, #dc2626))');
  assert.equal(paletteCss('panel'), '#000');
  assert.deepEqual(paletteStyle(), { '--xr-off': 'var(--brand-danger, var(--xray-off, #dc2626))', '--xr-panel': '#000' });
  assert.equal(paletteCss('content'), 'var(--xray-content, #3b82f6)', 'other roles keep their defaults');
});

test('configuring is idempotent and notifies only on change', () => {
  const before = getXRayConfig();
  configureXRay({});
  assert.equal(getXRayConfig(), before);
  configureXRay({ rhythm: { unit: 12 } });
  assert.deepEqual(getXRayConfig().rhythm, before.rhythm);
  assert.equal(formatPx(12), '12');
});
