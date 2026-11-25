import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classFor, propertyFor } from '../src/nudge.ts';
import { roleOf } from '../src/layers.ts';
import { tallyValues } from '../src/spacing.ts';

test('a nudged value is written up as the class that makes it real', () => {
  assert.equal(classFor('padding-top', 24), 'pt-minor');
  assert.equal(classFor('padding-bottom', 48), 'pb-minor-2');
  assert.equal(classFor('margin-top', -12), '-mt-half');
  assert.equal(classFor('padding-left', 16), 'pl-4');
  assert.equal(classFor('padding-right', 0), 'pr-0');
  assert.equal(classFor('row-gap', 36), 'gap-y-9');
  assert.equal(classFor('column-gap', 13), 'gap-x-[13px]');
});

test('arrows map to the side they point at; gap takes rows up and down, columns across', () => {
  assert.equal(propertyFor('padding', 'top'), 'padding-top');
  assert.equal(propertyFor('margin', 'left'), 'margin-left');
  assert.equal(propertyFor('gap', 'bottom'), 'row-gap');
  assert.equal(propertyFor('gap', 'right'), 'column-gap');
});

test('elements are named the way a designer would point at them', () => {
  const el = (tag: string, attrs: Record<string, string> = {}) => ({ tagName: tag, getAttribute: (k: string) => attrs[k] ?? null }) as unknown as Element;
  const text = { paints: false, text: true, media: false };
  const box = { paints: true, text: false, media: false };
  assert.equal(roleOf(el('H2'), text), 'Heading 2');
  assert.equal(roleOf(el('P'), text), 'Paragraph');
  assert.equal(roleOf(el('SPAN'), text), 'Text');
  assert.equal(roleOf(el('SPAN'), { ...text, paints: true }), 'Label');
  assert.equal(roleOf(el('A'), text), 'Link');
  assert.equal(roleOf(el('A'), { ...text, paints: true }), 'Button link');
  assert.equal(roleOf(el('DIV', { role: 'button' }), box), 'Button');
  assert.equal(roleOf(el('DIV'), box), 'Box');
  assert.equal(roleOf(el('svg'), { paints: false, text: false, media: true }), 'Icon');
  assert.equal(roleOf(el('SECTION'), null), 'Section');
  assert.equal(roleOf(el('DIV'), null), 'Group');
});

test('redlines tally the spacing a component uses, most common first, per axis', () => {
  const m = (axis: 'x' | 'y', value: number) => ({ measure: { axis, from: 0, to: value, at: 0, value } });
  const measures = [m('y', 24), m('y', 12), m('y', 24), m('y', 23.96), m('y', 13), m('x', 16), m('y', 0)];
  // 23.96 is 24 as laid out; zeros aren't spacing.
  assert.deepEqual(tallyValues(measures, 'y'), [
    [24, 3],
    [12, 1],
    [13, 1],
  ]);
  assert.deepEqual(tallyValues(measures, 'x'), [[16, 1]]);
});
