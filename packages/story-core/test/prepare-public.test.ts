import { test } from 'node:test';
import assert from 'node:assert/strict';
import { preparePublicStory, prepareStory } from '../src/prepare-public.ts';
import { readingMinutes, storyReadingCounts } from '../src/reading.ts';
import type { Story, StoryBlock, StoryMedia } from '../src/types.ts';
import { fixtureStory, image, story, withBlock } from './fixtures.ts';

const blocksOf = (prepared: Story, chapter = 0) => prepared.chapters[chapter].blocks;
const lastBlock = (block: StoryBlock, options = {}) => blocksOf(preparePublicStory(withBlock(block), options)).at(-1);
const shot = { brief: 'Crop the toolbar out of the recording', source: 'interview-04.mov 01:20' };

test('a finished story reads the same, minus nothing', () => {
  const prepared = preparePublicStory(fixtureStory, { customBlocks: ['FieldMap'] });
  assert.deepEqual(prepared.chapters, fixtureStory.chapters.map((chapter) => ({
    ...chapter,
    blocks: chapter.blocks.map((block) => block.type === 'media' && block.media.sourceMode === 'youtube'
      ? { ...block, media: { ...block.media, youtubeUrl: 'https://www.youtube-nocookie.com/embed/aBcDeFgHiJ0' } }
      : block),
  })));
  assert.equal(fixtureStory.chapters[2].blocks[1].type === 'media' && fixtureStory.chapters[2].blocks[1].media.youtubeUrl, 'https://www.youtube.com/watch?v=aBcDeFgHiJ0', 'the input is never changed');
});

test('production notes never reach the page payload', () => {
  const noted = story({ hero: { ...image('hero'), shot } });
  noted.chapters[0].blocks.push({ type: 'media', media: { ...image('a'), shot } });
  const prepared = preparePublicStory(noted);
  assert.equal(prepared.hero?.shot, undefined);
  const media = blocksOf(prepared).at(-1);
  assert.ok(media?.type === 'media');
  assert.equal(media.media.shot, undefined);
  assert.doesNotMatch(JSON.stringify(prepared), /interview-04|Crop the toolbar/);
});

test('what can’t load is left out rather than framed', () => {
  const waiting: StoryMedia = { kind: 'image', alt: 'Waiting', shot: { brief: 'An index', draft: 'fieldnote/index.png' } };
  assert.equal(lastBlock({ type: 'media', media: waiting })?.type, 'quote', 'the empty media block is gone');
  const served = lastBlock({ type: 'media', media: waiting }, { uploadedMediaKeys: ['fieldnote/index.png'], mediaUrl: (key: string) => `/media/${key}` });
  assert.ok(served?.type === 'media');
  assert.equal(served.media.src, '/media/fieldnote/index.png');
  assert.equal(lastBlock({ type: 'media', media: { kind: 'video', sourceMode: 'youtube', youtubeUrl: 'https://example.com', alt: '' } })?.type, 'quote');
  assert.equal(lastBlock({ type: 'media', media: { kind: 'image', sourceMode: 'pdf', pdfUrl: '/a.txt', alt: '' } })?.type, 'quote');
  const noHero = preparePublicStory(story({ hero: { kind: 'image', alt: '' }, heroLayout: 'split-graphic' }));
  assert.equal('hero' in noHero, false);
  assert.equal(noHero.heroLayout, 'standard', 'a split hero without its graphic falls back');
});

test('blocks with no text are left out, and partly written ones keep their written parts', () => {
  assert.equal(lastBlock({ type: 'prose', paragraphs: ['', ' '] })?.type, 'quote');
  assert.equal(lastBlock({ type: 'note', text: '' })?.type, 'quote');
  assert.equal(lastBlock({ type: 'code', code: '  ' })?.type, 'quote');
  assert.deepEqual(lastBlock({ type: 'steps', items: [{ title: 'Read', body: '' }, { title: '', body: '' }] }), { type: 'steps', items: [{ title: 'Read', body: '' }] });
  assert.deepEqual(lastBlock({ type: 'metrics', items: [{ value: '', description: '' }, { value: '2x', description: 'faster' }] }), { type: 'metrics', items: [{ value: '2x', description: 'faster' }] });
  assert.deepEqual(lastBlock({ type: 'implemented', items: ['', 'Built it'], sourceLedger: { led: ['x'] } }), { type: 'implemented', items: ['Built it'] });
  const ledger = lastBlock({ type: 'ledger', ledger: { led: ['', 'Led it'], made: [''], partners: [{ role: '', owned: '' }] } });
  assert.ok(ledger?.type === 'ledger');
  assert.deepEqual(ledger.ledger.led, ['Led it']);
  assert.deepEqual(ledger.ledger.partners, []);
  const decision = lastBlock({ type: 'decision', call: 'Ship', because: 'Ready', media: { kind: 'image', alt: '' } });
  assert.ok(decision?.type === 'decision');
  assert.equal('media' in decision, false);
});

test('a subheading with nothing after it heads nothing', () => {
  const headed = story();
  headed.chapters[0].blocks = [{ type: 'subhead', text: 'One' }, { type: 'subhead', text: 'Two' }, { type: 'prose', paragraphs: ['Body'] }, { type: 'subhead', text: 'Last' }];
  assert.deepEqual(blocksOf(preparePublicStory(headed)).map((block) => block.type === 'subhead' ? block.text : block.type), ['Two', 'prose']);
});

test('image groups keep their loadable items, and a row of one becomes that image', () => {
  const group = lastBlock({ id: 'g', type: 'gallery', layout: 'horizontal', caption: 'Both', items: [image('a'), { kind: 'image', alt: '' }] });
  assert.deepEqual(group, { type: 'media', id: 'g', media: { ...image('a'), caption: 'Both' }, width: 'wide' });
  const grid = lastBlock({ type: 'gallery', layout: 'grid', items: [image('a'), { kind: 'image', alt: '' }] });
  assert.ok(grid?.type === 'gallery');
  assert.equal(grid.items.length, 1);
  assert.equal(lastBlock({ type: 'gallery', items: [{ kind: 'image', alt: '' }] })?.type, 'quote');
});

test('calls to action keep only safe links', () => {
  assert.deepEqual(lastBlock({ type: 'cta', label: ' Book a call ', href: 'mailto:hello@example.com', newTab: false }), { type: 'cta', label: 'Book a call', href: 'mailto:hello@example.com' });
  assert.deepEqual(lastBlock({ type: 'cta', label: 'Read', href: 'https://example.com', newTab: true }), { type: 'cta', label: 'Read', href: 'https://example.com', newTab: true });
  for (const href of ['javascript:alert(1)', 'http://example.com', '']) {
    assert.equal(lastBlock({ type: 'cta', label: 'Go', href })?.type, 'quote', href);
  }
  const followUp = lastBlock({ type: 'followUp', heading: 'More', items: [{ title: 'A', teaser: 'B', link: { href: '' } }], cta: { label: 'All', href: 'javascript:x' } });
  assert.ok(followUp?.type === 'followUp');
  assert.equal('cta' in followUp, false);
  assert.equal('link' in followUp.items[0], false);
});

test('custom blocks publish only when registered, named and plain', () => {
  const custom = { type: 'custom', component: 'FieldMap', props: { zoom: 2 } } as const;
  assert.deepEqual(lastBlock(custom), custom, 'with no registry, every named block passes');
  assert.deepEqual(lastBlock(custom, { customBlocks: ['FieldMap'] }), custom);
  assert.equal(lastBlock(custom, { customBlocks: ['Other'] })?.type, 'quote');
  assert.equal(lastBlock({ type: 'custom', component: ' ' })?.type, 'quote');
  assert.equal(lastBlock({ type: 'custom', component: 'FieldMap', props: { at: new Date(0) } as never })?.type, 'quote');
});

test('hidden chapters, blocks, facts and credits are removed from the payload', () => {
  const hidden = story();
  hidden.chapters[0].hidden = true;
  hidden.chapters[1].blocks[0].hidden = true;
  hidden.facts[0].hidden = true;
  hidden.credits![1].hidden = true;
  hidden.decisions = { title: 'More', items: [{ title: 'Why', detail: 'Because' }], hidden: true };
  const prepared = preparePublicStory(hidden);
  assert.deepEqual(prepared.chapters.map((chapter) => chapter.key), ['task', 'action', 'result']);
  assert.equal(prepared.chapters[0].blocks.length, 1);
  assert.deepEqual(prepared.facts.map((fact) => fact.label), ['Team']);
  assert.deepEqual(prepared.credits?.map((credit) => credit.name), ['Ada Park']);
  assert.equal('decisions' in prepared, false);
  const empty = preparePublicStory(story({ hindsight: { title: 'Later', paragraphs: [''] } }));
  assert.equal('hindsight' in empty, false);
});

test('development passes the story through untouched', () => {
  const draft = story({ hero: { kind: 'image', alt: '', shot } });
  assert.equal(prepareStory(draft, { development: true }), draft);
  assert.equal(prepareStory(draft).hero, undefined);
});

test('reading time counts the words and pictures a reader meets', () => {
  const counts = storyReadingCounts(fixtureStory);
  assert.ok(counts.words > 50);
  assert.equal(counts.pictures, 3, 'two gallery images and the video; the hero is not counted');
  const withProps = withBlock({ type: 'custom', component: 'FieldMap', props: { label: 'many words that nobody reads on the page' } });
  assert.equal(storyReadingCounts(withProps).words, counts.words, 'custom props are data, not prose');
  assert.equal(readingMinutes(fixtureStory), 1);
  const long = story();
  long.chapters[0].blocks.push({ type: 'prose', paragraphs: [Array.from({ length: 2300 }, () => 'word').join(' ')] });
  const { words, pictures } = storyReadingCounts(long);
  assert.equal(readingMinutes(long), Math.round(words / 230 + pictures / 6));
  assert.ok(words >= 2300);
  assert.equal(readingMinutes(story({ chapters: [] })), undefined);
});
