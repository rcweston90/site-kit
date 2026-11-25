import assert from 'node:assert/strict';
import { test } from 'node:test';
import { groupLines, inkOf, leadingOf, lineBoxesOf, type Fragment } from '../src/text.ts';
import { raysFrom } from '../src/measure.ts';

// 16px text with an 18px content area (ascent 14.5, descent 3.5), cap height
// 11.6, x-height 8.6, on a 24px line height — a typical body setting.
const body = (top: number, left: number, right: number, extra: Partial<Fragment> = {}): Fragment => ({
  top,
  bottom: top + 18,
  left,
  right,
  ascent: 14.5,
  descent: 3.5,
  cap: 11.6,
  xHeight: 8.6,
  lineHeight: 24,
  ...extra,
});

test('runs on the same line group; the baseline sits ascent below the content top', () => {
  // Two runs (text, then a link) on line one; one run on line two, 24px down.
  const lines = groupLines([body(3, 0, 120), body(3, 120, 200), body(27, 0, 90)]);
  assert.equal(lines.length, 2);
  assert.equal(lines[0].baseline, 17.5);
  assert.equal(lines[0].left, 0);
  assert.equal(lines[0].right, 200);
  assert.ok(Math.abs(lines[0].capTop - 5.9) < 1e-9);
  assert.ok(Math.abs(lines[0].xTop - 8.9) < 1e-9);
  // The 24px line box centres the 18px content area: 3px of half-leading each side.
  assert.equal(lines[0].lineTop, 0);
  assert.equal(lines[0].lineBottom, 24);
  assert.equal(leadingOf(lines), 24);
});

test('the letters span cap height to last baseline; the line boxes span the leading', () => {
  const lines = groupLines([body(3, 10, 210), body(27, 10, 150)]);
  assert.deepEqual(inkOf(lines), { top: lines[0].capTop, bottom: 41.5, left: 10, right: 210 });
  assert.deepEqual(lineBoxesOf(lines), { top: 0, bottom: 48, left: 10, right: 210 });
  assert.equal(inkOf([]), null);
});

test('a bigger run on a line sets its baseline and cap height', () => {
  const big = body(0, 100, 180, { bottom: 30, ascent: 24, descent: 6, cap: 19, lineHeight: 36 });
  const lines = groupLines([body(8, 0, 100), big]);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].baseline, 24);
  assert.equal(lines[0].capTop, 5);
});

test('normal line height falls back to the content area', () => {
  const [line] = groupLines([body(0, 0, 50, { lineHeight: null })]);
  assert.equal(line.lineBottom - line.lineTop, 18);
});

test('rays stop at the nearest edge each way, and inside a box at its own edges', () => {
  const card = { top: 100, bottom: 300, left: 100, right: 500 };
  const title = { top: 124, bottom: 148, left: 124, right: 400 };
  // Pointer in the card's top padding, above the title.
  assert.deepEqual(raysFrom(200, 110, [card, title]), { up: 100, down: 124, left: 100, right: 500 });
  // Pointer outside everything: nothing above or to the left.
  assert.deepEqual(raysFrom(50, 50, [card]), { up: null, down: null, left: null, right: null });
  assert.deepEqual(raysFrom(50, 200, [card]), { up: null, down: null, left: null, right: 100 });
});
