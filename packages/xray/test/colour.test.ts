import assert from 'node:assert/strict';
import { test } from 'node:test';
import { colourKey, contrastRatio, over, parseColor, rankTokens, toHex, wcag } from '../src/colour.ts';

const near = (a: number, b: number, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);

test('computed colours parse in every form browsers hand back', () => {
  assert.deepEqual(parseColor('rgb(0, 85, 204)'), { r: 0, g: 85, b: 204, a: 1 });
  assert.deepEqual(parseColor('rgba(255, 255, 255, 0.65)'), { r: 255, g: 255, b: 255, a: 0.65 });
  assert.deepEqual(parseColor('rgb(10 20 30 / 50%)'), { r: 10, g: 20, b: 30, a: 0.5 });
  assert.deepEqual(parseColor('color(srgb 1 0 0.5 / 0.25)'), { r: 255, g: 0, b: 127.5, a: 0.25 });
  assert.equal(parseColor('transparent')?.a, 0);
  assert.equal(parseColor('oklch(0.5 0.1 200)'), null);
  assert.equal(parseColor(''), null);
});

test('hex is upper-case six digits, rounding the channels', () => {
  assert.equal(toHex({ r: 0, g: 85, b: 204, a: 1 }), '#0055CC');
  assert.equal(toHex({ r: 254.6, g: 0.4, b: 16, a: 0.3 }), '#FF0010');
  assert.equal(colourKey({ r: 254.6, g: 0.4, b: 16, a: 0.304 }), '255,0,16,30');
});

test('translucent layers composite over what sits beneath them', () => {
  const white = { r: 255, g: 255, b: 255, a: 1 };
  const half = over({ r: 0, g: 0, b: 0, a: 0.5 }, white);
  near(half.r, 127.5);
  assert.equal(half.a, 1);
  assert.deepEqual(over({ r: 9, g: 9, b: 9, a: 0 }, white), white);
});

test('contrast matches the WCAG reference values', () => {
  const black = { r: 0, g: 0, b: 0, a: 1 };
  const white = { r: 255, g: 255, b: 255, a: 1 };
  near(contrastRatio(black, white), 21);
  // White on a mid blue passes AA for body text; on a lighter blue only for large text.
  near(contrastRatio(white, { r: 0, g: 85, b: 204, a: 1 }), 6.62, 0.01);
  near(contrastRatio(white, { r: 77, g: 147, b: 240, a: 1 }), 3.11, 0.01);
});

test('large text gets the lower AA bar', () => {
  assert.deepEqual(wcag(3.5, 16, 400), { large: false, aa: false, aaa: false });
  assert.deepEqual(wcag(3.5, 24, 400), { large: true, aa: true, aaa: false });
  assert.deepEqual(wcag(3.5, 19, 700), { large: true, aa: true, aaa: false });
  assert.deepEqual(wcag(7.2, 13, 400), { large: false, aa: true, aaa: true });
});

test('tokens are named semantic-first, scale last, Tailwind and X-ray internals never', () => {
  assert.deepEqual(rankTokens(['--color-blue-600', '--tw-ring-color', '--color-brand', '--brand', '--brand', '--xray-panel', '--xr-off']), [
    '--brand',
    '--color-brand',
    '--color-blue-600',
  ]);
});
