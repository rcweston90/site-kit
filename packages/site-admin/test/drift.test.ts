import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Story, StoryBlock } from '@rcweston/story-core';
import { applyOriginalChange, applyOriginalChanges, diffOriginal, findDriftBase, type OriginalChange } from '../src/drift/model.ts';
import { diffWords } from '../src/drift/compare.ts';

// The review step: what the published version changed since the draft and it
// parted, which of those the draft lacks, and bringing them in. A fictional
// story; the cases follow the original's own suite.

type Media = Extract<StoryBlock, { type: 'media' }>;

const base: Story = {
  slug: 'harbor-map',
  company: 'Fieldnote Studio',
  title: 'The shared title',
  thesis: 'One sentence about the work.',
  period: '2025',
  facts: [{ id: 'fact-role', label: 'Role', value: 'Design lead' }],
  hero: { kind: 'image', src: '/images/hero.png', alt: 'The hero' },
  glance: { situation: '', task: '', action: '', result: '' },
  chapters: [
    {
      key: 'situation',
      title: 'Where things stood',
      blocks: [
        { id: 'b-prose', type: 'prose', paragraphs: ['First paragraph.'] },
        { id: 'b-quote', type: 'quote', quote: { quote: 'A quote.', name: 'Jun Ito', role: 'Researcher' } },
      ],
    },
    {
      key: 'task',
      title: 'The brief',
      blocks: [
        { id: 't-prose', type: 'prose', paragraphs: ['Task prose.'] },
        { id: 't-one', type: 'media', media: { kind: 'image', src: '/images/one.png', alt: 'One' } },
        { id: 't-two', type: 'media', media: { kind: 'image', src: '/images/two.png', alt: 'Two' } },
        { id: 't-steps', type: 'steps', items: [{ title: 'Step', body: 'Body' }] },
      ],
    },
    { key: 'action', title: 'What we did', blocks: [{ id: 'a-prose', type: 'prose', paragraphs: ['Action prose.'] }] },
    { key: 'result', title: 'What changed', blocks: [{ id: 'r-prose', type: 'prose', paragraphs: ['Result prose.'] }] },
  ],
} as Story;

const clone = (story: Story) => structuredClone(story);
const chapter = (story: Story, key: string) => story.chapters.find((item) => item.key === key)!;
const kinds = (changes: OriginalChange[]) => changes.map(({ id, kind, yours }) => ({ id, kind, ...(yours ? { yours } : {}) }));

test('a published version that has not changed reports nothing, whatever the draft did', () => {
  const draft = clone(base);
  draft.title = 'The author’s title';
  chapter(draft, 'task').blocks.splice(1, 1);
  draft.facts.push({ id: 'fact-team', label: 'Team', value: 'Three people' });
  assert.deepEqual(diffOriginal({ base, original: clone(base), draft }), []);
});

test('a change the draft lacks is safe; bringing it in matches the published version', () => {
  const original = clone(base);
  original.thesis = 'A sharper sentence.';
  const draft = clone(base);
  const changes = diffOriginal({ base, original, draft });
  assert.deepEqual(kinds(changes), [{ id: 'field:thesis', kind: 'safe' }]);
  const next = applyOriginalChange(draft, changes[0]);
  assert.equal(next.thesis, 'A sharper sentence.');
  assert.deepEqual(diffOriginal({ base, original, draft: next }), []);
});

test('a field both sides changed is a conflict; one the draft already matches is nothing', () => {
  const original = { ...clone(base), title: 'The published title', thesis: 'A sharper sentence.' };
  const draft = clone(base);
  draft.title = 'The author’s title';
  draft.thesis = 'A sharper sentence.';
  assert.deepEqual(kinds(diffOriginal({ base, original, draft })), [{ id: 'field:title', kind: 'conflict', yours: 'edited' }]);
});

test('a block the author moved is still found by its id, and replaced where it now is', () => {
  const original = clone(base);
  (chapter(original, 'task').blocks[1] as Media).media.src = '/images/one-new.png';
  const draft = clone(base);
  const task = chapter(draft, 'task');
  task.blocks = [task.blocks[3], task.blocks[0], task.blocks[2], task.blocks[1]];
  const changes = diffOriginal({ base, original, draft });
  assert.equal(changes.length, 1);
  assert.equal(changes[0].kind, 'safe');
  const next = applyOriginalChange(draft, changes[0]);
  assert.equal((chapter(next, 'task').blocks[3] as Media).media.src, '/images/one-new.png');
  assert.deepEqual(chapter(next, 'task').blocks.map((block) => block.id), ['t-steps', 't-prose', 't-two', 't-one']);
});

test('a block the published version only moved is no change', () => {
  const moved = clone(base);
  const task = chapter(moved, 'task');
  task.blocks = [task.blocks[3], task.blocks[0], task.blocks[1], task.blocks[2]];
  assert.deepEqual(diffOriginal({ base, original: moved, draft: clone(base) }), []);
});

test('a removed block: safe when untouched, a conflict when edited, and keep mine puts it back', () => {
  const original = clone(base);
  chapter(original, 'task').blocks.splice(1, 1);
  const draft = clone(base);
  const changes = diffOriginal({ base, original, draft });
  assert.deepEqual(kinds(changes).map(({ kind }) => kind), ['safe']);
  assert.deepEqual(chapter(applyOriginalChange(draft, changes[0]), 'task').blocks.map((block) => block.id), ['t-prose', 't-two', 't-steps']);

  const edited = clone(base);
  (chapter(edited, 'task').blocks[1] as Media).media.caption = 'The author’s caption';
  const conflict = diffOriginal({ base, original, draft: edited });
  assert.deepEqual(kinds(conflict).map(({ kind, yours }) => [kind, yours]), [['conflict', 'edited']]);
  const removed = applyOriginalChange(edited, conflict[0], 'original');
  assert.deepEqual(applyOriginalChange(removed, conflict[0], 'draft'), edited);
});

test('bringing in every safe update leaves the conflicts as the author wrote them', () => {
  const original = { ...clone(base), title: 'The published title', thesis: 'A sharper sentence.' };
  (chapter(original, 'task').blocks[1] as Media).media.src = '/images/one-new.png';
  const draft = clone(base);
  draft.title = 'The author’s title';
  const changes = diffOriginal({ base, original, draft });
  assert.deepEqual(changes.map((change) => change.kind).sort(), ['conflict', 'safe', 'safe']);
  const next = applyOriginalChanges(draft, changes.filter((change) => change.kind === 'safe'));
  assert.equal(next.title, 'The author’s title');
  assert.equal(next.thesis, 'A sharper sentence.');
  assert.equal((chapter(next, 'task').blocks[1] as Media).media.src, '/images/one-new.png');
  assert.deepEqual(chapter(next, 'situation'), chapter(draft, 'situation'));
  assert.deepEqual(diffOriginal({ base, original, draft: next }).map((change) => change.id), ['field:title']);
});

test('the drift base is the versions’ nearest shared ancestor, following restores', () => {
  const doc = (id: string, parentDocumentId: string | null, sourceKind = 'admin-editor', sourceRef = '') => ({ id, parentDocumentId, sourceKind, sourceRef });
  // v1 → v2 (published) and v1 → v3 (the draft, saved over v1 in another tab).
  const split = [doc('v3', 'v1'), doc('v2', 'v1'), doc('v1', null)];
  assert.equal(findDriftBase(split, 'v2', 'v3')?.id, 'v1');
  // The draft grew from the published version: it already has everything.
  assert.equal(findDriftBase([doc('v3', 'v2'), doc('v2', 'v1'), doc('v1', null)], 'v2', 'v3'), null);
  // A restore of v1 shares v1's history.
  assert.equal(findDriftBase([doc('v4', 'v3', 'restore', 'v1'), doc('v3', 'v2'), doc('v2', 'v1'), doc('v1', null)], 'v3', 'v4')?.id, 'v1');
  assert.equal(findDriftBase(split, null, 'v3'), null);
  assert.equal(findDriftBase([], 'v2'), null);
});

test('changed words are marked on each side, a changed phrase as one run', () => {
  const marked = (spans: { text: string; changed: boolean }[]) => spans.filter((span) => span.changed).map((span) => span.text);
  const { yours, original } = diffWords('Reuse the audience query on every page.', 'Reuse the shared audience query on busy pages.');
  assert.deepEqual(marked(yours), ['every page.']);
  assert.deepEqual(marked(original), ['shared', 'busy pages.']);
  assert.equal(yours.map((span) => span.text).join(''), 'Reuse the audience query on every page.');
  assert.deepEqual(marked(diffWords('Same words.', 'Same words.').original), []);
});
