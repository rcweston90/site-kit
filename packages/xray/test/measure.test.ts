import assert from 'node:assert/strict';
import { test } from 'node:test';
import { childGaps, formatPx, measureBetween, neighbourGaps, rhythmFit, type Box } from '../src/measure.ts';

// X-ray's numbers are what spacing gets checked against, so the geometry is
// pinned here: which values count as on the (default) rhythm, and which
// distance gets drawn between two boxes.

const box = (left: number, top: number, width: number, height: number): Box => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
});

test('rhythm steps read as their token, other multiples of 12 as on the grid, the rest as off', () => {
  assert.deepEqual(rhythmFit(24), { fit: 'token', name: 'minor' });
  assert.deepEqual(rhythmFit(144), { fit: 'token', name: 'major-2' });
  assert.deepEqual(rhythmFit(0), { fit: 'token', name: '0' });
  assert.deepEqual(rhythmFit(36), { fit: 'grid', units: 3 });
  assert.deepEqual(rhythmFit(13), { fit: 'off' });
  assert.deepEqual(rhythmFit(20), { fit: 'off' });
});

test('half a pixel of layout rounding still counts as the intended value', () => {
  assert.deepEqual(rhythmFit(23.6), { fit: 'token', name: 'minor' });
  assert.deepEqual(rhythmFit(48.4), { fit: 'token', name: 'minor-2' });
  assert.deepEqual(rhythmFit(-12), { fit: 'token', name: 'half' });
  assert.deepEqual(rhythmFit(23.25), { fit: 'off' });
  assert.deepEqual(rhythmFit(22.9), { fit: 'off' });
});

test('values print whole when whole, to one decimal otherwise', () => {
  assert.equal(formatPx(24), '24');
  assert.equal(formatPx(23.96), '24');
  assert.equal(formatPx(23.5), '23.5');
  assert.equal(formatPx(-8), '−8');
});

test('two stacked blocks measure the gap between them, through their shared span', () => {
  const title = box(0, 0, 400, 48);
  const body = box(100, 72, 400, 96);
  const [m, ...rest] = measureBetween(title, body);
  assert.equal(rest.length, 0);
  assert.equal(m.axis, 'y');
  assert.equal(m.value, 24);
  assert.deepEqual(m.span, [100, 400]);
  assert.equal(m.at, 250);
  assert.equal(m.guide, undefined);
  // Order doesn't matter: the measure always runs top to bottom.
  assert.deepEqual(measureBetween(body, title), [m]);
});

test('boxes apart on both axes get both gaps, each with a guide to the far edge', () => {
  const a = box(0, 0, 100, 100);
  const b = box(148, 124, 100, 100);
  const ms = measureBetween(a, b);
  assert.deepEqual(ms.map((m) => [m.axis, m.value]), [['y', 24], ['x', 48]]);
  assert.ok(ms.every((m) => m.guide && !m.span));
});

test('a nested box measures each edge against its container', () => {
  const card = box(0, 0, 400, 200);
  const inner = box(24, 24, 352, 152);
  const ms = measureBetween(card, inner);
  assert.deepEqual(ms.map((m) => [m.axis, m.value]), [['y', 24], ['y', 24], ['x', 24], ['x', 24]]);
});

test('an element finds its nearest sibling on each side, skipping ones it does not line up with', () => {
  const above = box(0, 0, 300, 24);
  const farAbove = box(0, -100, 300, 24);
  const target = box(0, 48, 300, 48);
  const below = box(0, 108, 300, 24);
  const offToTheSide = box(600, 300, 100, 24);
  const right = box(316, 48, 100, 48);
  const boxes = [farAbove, above, target, below, offToTheSide, right];
  const gaps = neighbourGaps(target, boxes);
  assert.deepEqual(gaps.map((m) => [m.axis, m.from, m.to, m.value]), [
    ['y', 24, 48, 24],
    ['y', 96, 108, 12],
    ['x', 300, 316, 16],
  ]);
});

test('a wrapped grid reports its row gaps and column gaps, once each', () => {
  // 3 × 2 cards, 24px column gap, 48px row gap.
  const cards = [0, 1, 2, 3, 4, 5].map((i) => box((i % 3) * 124, Math.floor(i / 3) * 148, 100, 100));
  const gaps = childGaps(cards);
  const cols = gaps.filter((m) => m.axis === 'x');
  const rows = gaps.filter((m) => m.axis === 'y');
  assert.equal(cols.length, 4);
  assert.equal(rows.length, 3);
  assert.ok(cols.every((m) => m.value === 24));
  assert.ok(rows.every((m) => m.value === 48));
});

test('touching blocks show a 0 gap; overlapping ones (negative margins) are not a gap', () => {
  assert.deepEqual(childGaps([box(0, 0, 100, 24), box(0, 24, 100, 24)]).map((m) => m.value), [0]);
  assert.deepEqual(childGaps([box(0, 0, 100, 24), box(0, 12, 100, 24)]), []);
});
