import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { buildSpec, offRhythm, y } from '../src/spec.ts';
import { breakpointOf, cssModuleOf, prettyFamily, trackingToken, tracksOf, type Inspection } from '../src/inspect.ts';
import { configureXRay, resetXRayConfig } from '../src/config.ts';

afterEach(() => {
  resetXRayConfig();
});

const zero = { top: 0, right: 0, bottom: 0, left: 0 };
const card: Inspection = {
  name: 'p.title',
  component: 'PricingCard',
  selector: 'main > section > p',
  crumbs: ['main', 'section', 'title'],
  width: 264,
  height: 48,
  layout: 'block',
  margin: { ...zero, bottom: 24 },
  padding: { top: 24, right: 32, bottom: 23, left: 32 },
  border: zero,
  gap: null,
  tracks: null,
  space: { above: 24, below: 59.3, right: 16 },
  children: [],
  type: { family: 'Inter', stack: 'Inter', weight: 600, size: 22, leading: 24, tracking: 0, trackingToken: 'normal', transform: 'none' },
  colour: {
    text: { hex: '#404040', alpha: 1, tokens: ['--ink'] },
    background: { hex: '#F8F9FB', alpha: 1, tokens: ['--surface'], overImage: false },
    border: null,
    contrast: { ratio: 9.81, large: false, aa: true, aaa: true },
  },
  pinned: true,
  between: null,
};

test('vertical values read as their rhythm step, a multiple of 12, or off-grid', () => {
  assert.equal(y(24), '24 (minor)');
  assert.equal(y(36), '36 (3×12)');
  assert.equal(y(23), '23 ⚠ off-grid');
  assert.equal(y(0), '0');
});

test('the spec names the element, its tokens and exactly what is off the rhythm', () => {
  const spec = buildSpec(card, { path: '/', viewport: [1440, 900], breakpoint: 'xl' });
  assert.match(spec, /^### `p\.title` · PricingCard$/m);
  assert.match(spec, /- Page: \/ · 1440 × 900 \(xl\)/);
  assert.match(spec, /- Padding \(top · right · bottom · left\): 24 \(minor\) · 32 · 23 ⚠ off-grid · 32/);
  assert.match(spec, /- Space to siblings: above 24 \(minor\) · below 59\.3 ⚠ off-grid · right 16/);
  assert.match(spec, /- Type: Inter 600 · 22 \/ 24 \(minor\) · tracking 0em \(normal\)$/m);
  assert.match(spec, /text #404040 `--ink` on #F8F9FB `--surface` — 9\.81:1 AA ✓ AAA ✓/);
  assert.match(spec, /- Rhythm: ⚠ off the 12px grid — padding-bottom 23, space below 59\.3$/);
});

test('a clean element says so', () => {
  const clean = { ...card, padding: { ...card.padding, bottom: 24 }, space: { above: 24, below: 48 } };
  assert.deepEqual(offRhythm(clean), []);
  assert.match(buildSpec(clean, { path: '/', viewport: [390, 844], breakpoint: 'base' }), /- Rhythm: ✓ every vertical value is on the 12px grid/);
});

test('names come out the way the source spells them', () => {
  assert.deepEqual(cssModuleOf('PricingCard-module__lu3UTG__title'), { file: 'PricingCard.module.css', local: 'title' });
  assert.equal(cssModuleOf('gap-6'), null);
  assert.equal(prettyFamily('__Inter_d65c78, __Inter_Fallback_d65c78, system-ui'), 'Inter');
  assert.equal(prettyFamily('__JetBrains_Mono_3c557b, "JetBrains Mono", monospace'), 'JetBrains Mono');
  assert.equal(prettyFamily('"Inter", system-ui'), 'Inter');
  assert.deepEqual(tracksOf('264px 264px 264.5px'), [264, 264, 264.5]);
  assert.deepEqual(tracksOf('none'), []);
});

test('tracking is named by the configured tokens: Tailwind by default, your own when set', () => {
  assert.equal(trackingToken(0.1), 'widest');
  assert.equal(trackingToken(-0.025), 'tight');
  assert.equal(trackingToken(0.16), null);
  configureXRay({
    tracking: [
      { name: 'label', em: 0.16 },
      { name: 'label-wide', em: 0.21 },
      { name: 'normal', em: 0 },
    ],
  });
  assert.equal(trackingToken(0.16), 'label');
  assert.equal(trackingToken(0.21), 'label-wide');
  assert.equal(trackingToken(0.13), null);
});

test('breakpoints follow Tailwind’s defaults', () => {
  assert.equal(breakpointOf(390), 'base');
  assert.equal(breakpointOf(640), 'sm');
  assert.equal(breakpointOf(1023), 'md');
  assert.equal(breakpointOf(1440), 'xl');
  assert.equal(breakpointOf(1600), '2xl');
});
