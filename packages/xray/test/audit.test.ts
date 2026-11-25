import assert from 'node:assert/strict';
import test from 'node:test';

import { groupIssues, paddingOffGrid, type Issue } from '../src/audit.ts';
import { groupCoverage, spacingOnScale, type CoverageResult } from '../src/coverage.ts';

const element = {} as Element;
const issue = (group: string, value = 2): Issue => ({
  kind: 'gap',
  el: element,
  values: [value],
  x: 0,
  y: 0,
  group,
});

test('border-aware padding accepts only an exact visual rhythm inset', () => {
  assert.equal(paddingOffGrid(23, 1), false, '23px padding plus a 1px rule is visually 24px');
  assert.equal(paddingOffGrid(22, 1), true, 'a border must not hide a genuinely off-grid 23px inset');
  assert.equal(paddingOffGrid(23, 0), true, '23px without a border remains a finding');
  assert.equal(paddingOffGrid(24, 1), false, 'padding already on-grid remains valid');
});

test('audit groups repeated component findings while retaining every member', () => {
  const groups = groupIssues([issue('Activity heatmap'), issue('Activity heatmap'), issue('Navigation controls')], () => 'fallback');

  assert.equal(groups.length, 2);
  assert.equal(groups[0]?.label, 'Activity heatmap');
  assert.equal(groups[0]?.issues.length, 2);
  assert.equal(groups.reduce((sum, group) => sum + group.issues.length, 0), 3);
});

test('coverage separates intentional token-derived values from literals and keeps members', () => {
  const results: CoverageResult[] = [
    { el: element, ok: true, status: 'intentional', source: 'responsive token mix', misses: ['fill colour'] },
    { el: element, ok: true, status: 'intentional', source: 'responsive token mix', misses: ['fill colour'] },
    { el: element, ok: false, status: 'literal', misses: ['fill colour'] },
    { el: element, ok: true, status: 'system', misses: [] },
  ];
  const groups = groupCoverage(results);

  assert.equal(groups.length, 2);
  assert.equal(groups.find((group) => group.status === 'intentional')?.items.length, 2);
  assert.equal(groups.find((group) => group.status === 'literal')?.items.length, 1);
  assert.equal(groups.reduce((sum, group) => sum + group.items.length, 0), 3);
});

test('token coverage applies border and micro scales without weakening ordinary rhythm', () => {
  assert.equal(spacingOnScale(23, true, undefined, 72, 1), true);
  assert.equal(spacingOnScale(22, true, undefined, 72, 1), false);
  assert.equal(spacingOnScale(18, true, 'micro', 72), true);
  assert.equal(spacingOnScale(18, true, undefined, 72), false);
});

test('horizontal spacing sits on the 4px step or the page gutter', () => {
  assert.equal(spacingOnScale(16, false, undefined, 72), true);
  assert.equal(spacingOnScale(13, false, undefined, 72), false);
  assert.equal(spacingOnScale(70, false, undefined, 70), true, 'the gutter itself counts');
});
