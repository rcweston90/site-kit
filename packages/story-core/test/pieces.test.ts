import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CTA_LABEL_MAX, completedCta, ctaHref, ctaLabel } from '../src/cta.ts';
import { PLAIN_JSON_MAX_DEPTH, isPlainJson, isPlainJsonObject, plainJsonProblem } from '../src/json.ts';
import { CALLOUT_PALETTES, calloutAppearanceAttributes, calloutTone, setCalloutIcon, setCalloutPalette, type StoryCallout } from '../src/callout-appearance.ts';
import { PROJECT_YEAR_ERROR, isOptionalProjectYear } from '../src/project-year.ts';
import { isSourceCommit, verifyStorySourceProvenance, type GitRunResult } from '../src/provenance.ts';

test('CTA links are same-origin paths, anchors, https or mailto', () => {
  for (const href of ['/contact', '/a/b?c=d', '#top', 'https://example.com', 'https://example.com/a?b=c', 'mailto:hi@example.com', 'MAILTO:hi@example.com?subject=Hello']) {
    assert.equal(ctaHref(href), href, href);
  }
  assert.equal(ctaHref('  /contact  '), '/contact');
  for (const href of [undefined, 3, '', '#', '//example.com', 'http://example.com', 'https://', 'https://user:pw@example.com', 'javascript:alert(1)', 'data:text/html,x',
    'mailto:', 'mailto:someone', '/a b', '/a\\b', '/a\u0000', 'ftp://example.com', 'x'.repeat(3000)]) {
    assert.equal(ctaHref(href), undefined, String(href).slice(0, 40));
  }
});

test('a CTA is complete only with a short label and a safe link', () => {
  assert.equal(ctaLabel(' Book a call '), 'Book a call');
  assert.equal(ctaLabel('x'.repeat(CTA_LABEL_MAX + 1)), undefined);
  assert.equal(ctaLabel('a\u0007'), undefined);
  assert.deepEqual(completedCta('Read', '/read'), { label: 'Read', href: '/read' });
  assert.deepEqual(completedCta('Read', 'https://example.com', true), { label: 'Read', href: 'https://example.com', newTab: true });
  assert.deepEqual(completedCta('Read', '/read', 'yes'), { label: 'Read', href: '/read' });
  assert.equal(completedCta('', '/read'), null);
  assert.equal(completedCta('Read', 'http://example.com'), null);
});

test('plain JSON is finite, acyclic, plain and shallow enough', () => {
  assert.equal(isPlainJson({ a: [1, 'two', null, true, { b: -0.5 }] }), true);
  assert.equal(isPlainJson('text'), true);
  assert.equal(isPlainJsonObject([]), false);
  assert.equal(isPlainJsonObject(Object.create(null)), true);
  const shared = { x: 1 };
  assert.equal(isPlainJson({ a: shared, b: shared }), true, 'a shared reference is not a cycle');
  const cycle: Record<string, unknown> = {};
  cycle.self = cycle;
  assert.deepEqual(plainJsonProblem(cycle), { at: '.self', reason: 'is a circular reference' });
  assert.deepEqual(plainJsonProblem({ a: { b: Number.POSITIVE_INFINITY } }), { at: '.a.b', reason: 'is not a finite number' });
  assert.deepEqual(plainJsonProblem({ m: new Map() }), { at: '.m', reason: 'is not a plain object' });
  assert.deepEqual(plainJsonProblem({ n: 10n }), { at: '.n', reason: 'is a bigint' });
  assert.deepEqual(plainJsonProblem({ [Symbol('s')]: 1 }), { at: '', reason: 'has symbol keys' });
  // eslint-disable-next-line no-sparse-arrays
  assert.deepEqual(plainJsonProblem([1, , 3]), { at: '[1]', reason: 'is an empty slot' });
  let deep: unknown = 1;
  for (let i = 0; i <= PLAIN_JSON_MAX_DEPTH; i++) deep = [deep];
  assert.match(plainJsonProblem(deep)?.reason ?? '', /deeper than/);
});

test('callout appearance maps palettes onto stable data attributes', () => {
  const callout: StoryCallout = { type: 'callout', body: { paragraphs: ['Note'] } };
  assert.deepEqual(calloutAppearanceAttributes(callout), { 'data-tone': 'neutral', 'data-presentation': 'soft', 'data-callout-palette': undefined });
  const teal = setCalloutPalette(callout, 'teal');
  assert.equal(teal.tone, 'info');
  assert.deepEqual(calloutAppearanceAttributes({ ...teal, presentation: 'outline' }), { 'data-tone': 'info', 'data-presentation': 'outline', 'data-callout-palette': 'teal' });
  assert.equal(calloutAppearanceAttributes({ ...callout, appearance: { palette: 'made-up' } })['data-callout-palette'], undefined);
  assert.equal(calloutTone('loud'), 'neutral');
  assert.equal(new Set(CALLOUT_PALETTES.map((palette) => palette.key)).size, CALLOUT_PALETTES.length);
  const custom = setCalloutIcon(teal, 'lightbulb');
  assert.equal(custom.icon, 'info');
  assert.equal(custom.appearance?.icon, 'lightbulb');
  const known = setCalloutIcon(custom, 'check');
  assert.equal(known.icon, 'check');
  assert.equal(known.appearance?.icon, undefined);
  assert.equal(setCalloutIcon(callout).appearance, undefined);
});

test('project years are optional four-digit years', () => {
  for (const value of [undefined, '', '2025', '1999']) assert.equal(isOptionalProjectYear(value), true, String(value));
  for (const value of ['25', '20255', '0999', 'year', 2025]) assert.equal(isOptionalProjectYear(value), false, String(value));
  assert.match(PROJECT_YEAR_ERROR, /year/i);
});

function fakeGit(overrides: Record<string, GitRunResult> = {}) {
  const calls: string[][] = [];
  const git = (args: string[]): GitRunResult => {
    calls.push(args);
    const key = args.slice(0, 2).join(' ');
    if (overrides[key]) return overrides[key];
    if (args[0] === 'rev-parse' && args[1] === '--verify') return { status: 0, stdout: 'abc1234def5678\n', stderr: '' };
    if (args[0] === 'rev-parse') return { status: 0, stdout: 'feedbeef00\n', stderr: '' };
    if (args[0] === 'status') return { status: 0, stdout: '', stderr: '' };
    if (args[0] === 'diff') return { status: 0, stdout: '', stderr: '' };
    return { status: 1, stdout: '', stderr: 'unknown' };
  };
  return { git, calls };
}

test('provenance proves the sources match a commit, with git injected', () => {
  const { git, calls } = fakeGit();
  const verified = verifyStorySourceProvenance({ requestedCommit: 'abc1234', sourceRefs: ['stories/b.ts', 'stories/a.ts'], extraPaths: ['stories/index.ts'], git });
  assert.deepEqual(verified, { sourceCommit: 'abc1234def5678', currentHead: 'feedbeef00', sourceRefs: ['stories/a.ts', 'stories/b.ts'], workingTreeClean: true, sourceMatchesCommit: true });
  assert.deepEqual(calls.at(-1), ['diff', '--quiet', 'abc1234def5678', '--', 'stories/a.ts', 'stories/b.ts', 'stories/index.ts']);
  assert.equal(isSourceCommit('abc1234'), true);
  assert.equal(isSourceCommit('xyz'), false);
});

test('provenance refuses bad commits, odd paths, dirty trees and drift', () => {
  const run = (input: Partial<Parameters<typeof verifyStorySourceProvenance>[0]>, git = fakeGit().git) =>
    () => verifyStorySourceProvenance({ requestedCommit: 'abc1234', sourceRefs: ['stories/a.ts'], git, ...input });
  assert.throws(run({ requestedCommit: 'main' }), /hexadecimal Git SHA/);
  assert.throws(run({ sourceRefs: [] }), /authored story file/);
  for (const path of ['../secret.ts', '/abs/a.ts', 'stories/a.js', 'stories/./a.ts']) {
    assert.throws(run({ sourceRefs: [path] }), /authored story file/, path);
  }
  assert.throws(run({ sourceRefs: ['custom/a.yaml'], isSourceRef: (path) => path.endsWith('.ts') }), /authored story file/);
  assert.doesNotThrow(run({ sourceRefs: ['custom/a.yaml'], isSourceRef: (path) => path.endsWith('.yaml') }));
  assert.throws(run({}, fakeGit({ 'status --porcelain': { status: 0, stdout: ' M stories/a.ts', stderr: '' } }).git), /uncommitted changes/);
  assert.throws(run({}, fakeGit({ 'diff --quiet': { status: 1, stdout: '', stderr: '' } }).git), /do not match source commit/);
  assert.throws(run({}, fakeGit({ 'diff --quiet': { status: 128, stdout: '', stderr: 'bad object' } }).git), /bad object/);
  assert.throws(run({}, fakeGit({ 'rev-parse --verify': { status: 128, stdout: '', stderr: 'unknown revision' } }).git), /unknown revision/);
});
