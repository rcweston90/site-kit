import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isStoryVisible, storyFieldKey, updateStoryBlock, updateStoryField, updateStoryFieldValue } from '../src/editor.ts';
import { createStory, newStoryFields, newStorySlug } from '../src/create.ts';
import { validatePublication } from '../src/publication.ts';
import { validateStory, validateStoryDraft } from '../src/model.ts';
import { chapterName, chapterNavItems, chapterShortName } from '../src/chapter-navigation.ts';
import { reservedStoryAddresses } from '../src/rename.ts';
import { fixtureStory, story } from './fixtures.ts';

test('a field update returns a new story and leaves the old one untouched', () => {
  const before = story();
  const snapshot = structuredClone(before);
  const after = updateStoryField(before, ['chapters', 0, 'blocks', 0, 'paragraphs', 1], 'Rewritten.');
  assert.deepEqual(before, snapshot);
  const prose = after.chapters[0].blocks[0];
  assert.ok(prose.type === 'prose');
  assert.equal(prose.paragraphs[1], 'Rewritten.');
  assert.equal(after.chapters[1], before.chapters[1], 'untouched branches are shared');
  assert.equal(updateStoryField(before, ['title'], 'New title').title, 'New title');
  assert.equal(updateStoryField(before, ['chapters', 0, 'blocks', 1, 'media', 'aspect'], 1.5).chapters[0].blocks[1].type, 'quote');
});

test('paths that miss leave the story as it was', () => {
  const before = story();
  assert.deepEqual(updateStoryField(before, ['chapters', 9, 'title'], 'x'), before);
  assert.deepEqual(updateStoryField(before, ['chapters', -1, 'title'], 'x'), before);
  assert.deepEqual(updateStoryField(before, ['title', 'deeper'], 'x'), before);
  assert.equal(updateStoryField(before, [], 'x'), before);
  const polluted = updateStoryField(before, ['__proto__', 'polluted'], 'x');
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
  assert.deepEqual(polluted, before);
});

test('the same path mechanics work on any nested value', () => {
  const media = { kind: 'image', alt: '', framing: { x: 10 } };
  assert.deepEqual(updateStoryFieldValue(media, ['framing', 'x'], 40), { kind: 'image', alt: '', framing: { x: 40 } });
  assert.equal(storyFieldKey(['chapters', 2, 'blocks', 0, 'text']), 'chapters.2.blocks.0.text');
});

test('a block update replaces one block in place', () => {
  const before = story();
  const after = updateStoryBlock(before, 1, 0, { type: 'note', text: 'Swapped.' });
  assert.deepEqual(after.chapters[1].blocks[0], { type: 'note', text: 'Swapped.' });
  assert.equal(after.chapters[1].blocks[1], before.chapters[1].blocks[1]);
  assert.equal(updateStoryBlock(before, 1, 9, { type: 'divider' }), before);
  assert.equal(isStoryVisible(undefined), true);
  assert.equal(isStoryVisible(false), false);
});

test('a new story is a blank STAR outline that saves as a draft and publishes with notes', () => {
  const blank = createStory({ title: 'Mapping the Field', company: ' Fieldnote Studio ' });
  assert.equal(blank.slug, 'mapping-the-field');
  assert.equal(blank.company, 'Fieldnote Studio');
  assert.deepEqual(blank.chapters.map((chapter) => [chapter.key, chapter.title]), [['situation', 'Situation'], ['task', 'Task'], ['action', 'Action'], ['result', 'Result']]);
  assert.deepEqual(blank.chapters[0].blocks, [{ id: 'mapping-the-field-situation-opening', type: 'prose', paragraphs: [''] }]);
  assert.deepEqual(validateStoryDraft(blank), []);
  assert.ok(validateStory(blank).some((error) => /thesis/.test(error)), 'complete-story validation still wants a thesis');
  const readiness = validatePublication(blank);
  assert.deepEqual(readiness.errors, [], 'unfinished never blocks publishing');
  assert.ok(readiness.warnings.length >= 4);
  assert.equal(createStory({ title: 'Anything', slug: 'chosen-address' }).slug, 'chosen-address');
  assert.throws(() => createStory({ title: '!!!' }), /usable address/);
  assert.throws(() => createStory({ title: 'New' }), /usable address/, 'a reserved address');
  assert.throws(() => createStory({ title: 'Archive' }, reservedStoryAddresses(['archive'])), /usable address/);
});

test('the new-story form fields and their address are checked', () => {
  assert.deepEqual(newStoryFields({ title: '  A title  ' }), { title: 'A title' });
  assert.deepEqual(newStoryFields({ title: 'A', slug: 'a-b', company: ' Co ' }), { title: 'A', slug: 'a-b', company: 'Co' });
  for (const bad of [null, 'text', {}, { title: '' }, { title: 'x'.repeat(121) }, { title: 'A', slug: 'Not Valid' }, { title: 'A', company: 3 }]) {
    assert.equal(newStoryFields(bad), null, JSON.stringify(bad));
  }
  assert.equal(newStorySlug('Field guide'), 'field-guide');
  assert.equal(newStorySlug('Ed'), null, 'too short to be an address');
  assert.equal(newStorySlug('new'), null);
});

test('section names are plain text, shortened at a word break', () => {
  assert.equal(chapterName('**Notes** were [everywhere](/x) &amp; nowhere'), 'Notes were everywhere & nowhere');
  assert.equal(chapterName('  '), 'Untitled section');
  assert.equal(chapterShortName('Short'), 'Short');
  assert.equal(chapterShortName('The studio kept its interview notes in six different places', 30), 'The studio kept its interview…');
  const nav = chapterNavItems([...fixtureStory.chapters, { key: 'hidden-one', title: 'Hidden', blocks: [], hidden: true }]);
  assert.deepEqual(nav.map((item) => item.key), ['situation', 'task', 'action', 'result']);
});
