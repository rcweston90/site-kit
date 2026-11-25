import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasPublishableMediaSource, isBlockingIssue, validatePublication } from '../src/publication.ts';
import type { PublicationIssueCode } from '../src/contract.ts';
import type { StoryBlock } from '../src/types.ts';
import { FIXTURE_SLUG, fixtureStory, image, story, withBlock } from './fixtures.ts';

const known = { knownSlugs: ['a-second-study', FIXTURE_SLUG], customBlocks: ['FieldMap'] };
const codes = (block: StoryBlock, options = known) => {
  const { errors, warnings } = validatePublication(withBlock(block), options);
  return { errors: errors.map((issue) => issue.code), warnings: warnings.map((issue) => issue.code) };
};

test('the fixture story is ready to publish with nothing to note', () => {
  assert.deepEqual(validatePublication(fixtureStory, known), { errors: [], warnings: [] });
});

test('unfinished never blocks publishing: empty visible content is a note', () => {
  const unfinished = story({ facts: [{ label: 'Role', value: '' }] });
  unfinished.chapters[0].blocks.push({ type: 'prose', paragraphs: [''] }, { type: 'subhead', text: '' });
  unfinished.chapters[1].blocks = [{ type: 'spacer' }, { type: 'divider' }];
  const { errors, warnings } = validatePublication(unfinished, known);
  assert.deepEqual(errors, []);
  assert.ok(warnings.length >= 4);
  assert.ok(warnings.every((issue) => issue.severity === 'warning' && !isBlockingIssue(issue.code)));
  assert.ok(warnings.some((issue) => issue.path === 'story.facts[0].value'));
  assert.ok(warnings.some((issue) => issue.path === 'story.chapters[1].blocks' && /no visible modules/.test(issue.message)));
});

test('only an invalid story or an unloadable source blocks', () => {
  const blocking: PublicationIssueCode[] = ['invalid-story', 'invalid-media-source'];
  for (const code of blocking) assert.equal(isBlockingIssue(code), true);
  for (const code of ['empty-visible-content', 'missing-media-alt', 'unresolved-required-media', 'unknown-custom-block'] as const) {
    assert.equal(isBlockingIssue(code), false);
  }
  const unsafe = story({ hero: { kind: 'image', src: 'javascript:alert(1)', alt: 'x' } });
  assert.deepEqual(validatePublication(unsafe).errors.map((issue) => [issue.code, issue.path]), [['invalid-media-source', 'story.hero.src']]);
  assert.deepEqual(codes({ type: 'media', media: { ...image('x'), src: 'data:image/png;base64,AA' } }).errors, ['invalid-media-source']);
  assert.deepEqual(codes({ type: 'media', media: { ...image('x'), poster: 'javascript:x' } }).errors, ['invalid-media-source']);
});

test('hidden blocks, chapters and switched-off sections are never a problem', () => {
  const hidden = story({ visibility: { facts: false, credits: false, hindsight: false, heroMedia: false } });
  hidden.facts.push({ label: '', value: '' });
  hidden.credits!.push({ name: '', role: '' });
  hidden.hindsight = { title: '', paragraphs: [] };
  hidden.hero = { kind: 'image', alt: '' };
  hidden.chapters[0].blocks.push({ type: 'prose', paragraphs: [''], hidden: true });
  hidden.chapters.push({ key: 'appendix', title: '', blocks: [], hidden: true });
  assert.deepEqual(validatePublication(hidden, known), { errors: [], warnings: [] });
});

test('media without footage is a note; footage counts once its key is uploaded', () => {
  const waiting = { ...image('x'), src: undefined, shot: { brief: 'The index page', draft: 'fieldnote/index.png' } };
  assert.equal(hasPublishableMediaSource(waiting), false);
  assert.equal(hasPublishableMediaSource(waiting, ['fieldnote/index.png']), true);
  assert.equal(hasPublishableMediaSource(undefined), false);
  assert.deepEqual(codes({ type: 'media', media: waiting }).warnings, ['unresolved-required-media']);
  assert.deepEqual(codes({ type: 'media', media: waiting }, { ...known, uploadedMediaKeys: ['fieldnote/index.png'] } as never).warnings, []);
  assert.deepEqual(codes({ type: 'media', media: { ...image('x'), alt: '' } }).warnings, ['missing-media-alt']);
  // An optional hero with nothing to load is left out, with a note.
  const noHero = story({ hero: { kind: 'image', alt: '' } });
  assert.deepEqual(validatePublication(noHero).warnings.map((issue) => issue.code), ['unresolved-optional-media']);
});

test('YouTube and PDF modules check their links and accessible titles', () => {
  assert.deepEqual(codes({ type: 'media', media: { kind: 'video', sourceMode: 'youtube', youtubeUrl: 'https://youtu.be/aBcDeFgHiJ0', alt: '' } }).warnings, ['missing-media-alt']);
  assert.deepEqual(codes({ type: 'media', media: { kind: 'video', sourceMode: 'youtube', youtubeUrl: 'https://example.com/v', alt: 'x' } }).errors, ['invalid-media-source']);
  assert.deepEqual(codes({ type: 'media', media: { kind: 'image', sourceMode: 'pdf', alt: 'Brochure' } }), { errors: [], warnings: ['unresolved-required-media'] });
  assert.deepEqual(codes({ type: 'media', media: { kind: 'image', sourceMode: 'pdf', pdfUrl: '/media/a.doc', alt: 'x' } }).errors, ['invalid-media-source']);
  assert.deepEqual(codes({ type: 'media', media: { kind: 'image', sourceMode: 'pdf', pdfUrl: '/media/brochure.pdf', alt: 'Brochure' } }), { errors: [], warnings: [] });
});

test('custom blocks warn when the host has not registered them, and need plain JSON props', () => {
  assert.deepEqual(codes({ type: 'custom', component: 'FieldMap' }), { errors: [], warnings: [] });
  const unknown = validatePublication(withBlock({ type: 'custom', component: 'Orbit' }), known);
  assert.deepEqual(unknown.errors, []);
  assert.deepEqual(unknown.warnings.map((issue) => [issue.code, issue.path]), [['unknown-custom-block', 'story.chapters[0].blocks[2].component']]);
  assert.match(unknown.warnings[0].message, /Orbit/);
  // Without a registry there is nothing to check against.
  assert.deepEqual(codes({ type: 'custom', component: 'Orbit' }, {} as never), { errors: [], warnings: [] });
  assert.deepEqual(codes({ type: 'custom', component: '' }).warnings, ['empty-visible-content']);
  assert.deepEqual(codes({ type: 'custom', component: 'FieldMap', props: { when: new Date(0) } as never }).errors, ['invalid-story']);
  assert.deepEqual(codes({ type: 'custom', component: 'FieldMap', props: { n: Infinity } }).errors, ['invalid-story']);
});

test('a subheading needs content after it, and quotes need a name or a role', () => {
  const trailing = codes({ type: 'subhead', text: 'What came next' });
  assert.deepEqual(trailing.warnings, ['empty-visible-content']);
  assert.deepEqual(codes({ type: 'quote', quote: { quote: 'Useful.', name: '', role: 'Researcher' } }).warnings, []);
  assert.deepEqual(codes({ type: 'quote', quote: { quote: 'Useful.', name: '', role: '' } }).warnings, ['empty-visible-content']);
});

test('lists and groups note each empty row by its path', () => {
  const { warnings } = validatePublication(withBlock({ type: 'steps', items: [{ title: 'Read', body: '' }] }), known);
  assert.deepEqual(warnings.map((issue) => issue.path), ['story.chapters[0].blocks[2].items[0].body']);
  assert.deepEqual(codes({ type: 'gallery', items: [] }).warnings, ['empty-visible-content']);
  assert.deepEqual(codes({ type: 'metrics', items: [{ value: '2x', description: '' }] }).warnings, ['empty-visible-content']);
  assert.deepEqual(codes({ type: 'outcomes', items: [{ value: '', label: 'x', hidden: true }] }).warnings, ['empty-visible-content']);
  assert.deepEqual(codes({ type: 'cta', label: 'Read more', href: '' }).warnings, ['empty-visible-content']);
});

test('related stories are checked against the stories that exist, when given', () => {
  const related = story({ related: [FIXTURE_SLUG, 'gone-story', 'a-second-study', 'a-second-study'] });
  const { warnings } = validatePublication(related, known);
  assert.deepEqual(warnings.map((issue) => issue.code), ['self-related-story', 'broken-related-story', 'duplicate-related-story']);
  assert.deepEqual(validatePublication(related).warnings, [], 'without knownSlugs nothing is checked');
});

test('a split-graphic hero needs its graphic', () => {
  const split = story({ heroLayout: 'split-graphic' });
  assert.deepEqual(validatePublication(split).warnings.map((issue) => issue.path), ['story.heroGraphic']);
  assert.deepEqual(validatePublication(story({ heroLayout: 'split-graphic', heroGraphic: image('side') })).warnings, []);
});
