import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planDocumentImports, planDraftDocumentImports, validateStory, validateStoryDraft, type ExistingDocumentIdentity } from '../src/model.ts';
import { PROJECT_YEAR_ERROR } from '../src/project-year.ts';
import type { Story, StoryBlock, StoryRichText } from '../src/types.ts';
import { FIXTURE_SLUG, fixtureStory, image, seedFor, story, withBlock } from './fixtures.ts';

const errorsFor = (block: unknown) => validateStory(withBlock(block as StoryBlock));
const hasError = (errors: string[], pattern: RegExp) => assert.ok(errors.some((error) => pattern.test(error)), `expected ${pattern} in ${JSON.stringify(errors)}`);

test('the fixture story is valid, and the slug it was saved under is enforced', () => {
  assert.deepEqual(validateStory(fixtureStory), []);
  assert.deepEqual(validateStory(fixtureStory, FIXTURE_SLUG), []);
  assert.deepEqual(validateStory(fixtureStory, 'another-story'), ['slug must remain another-story.']);
  hasError(validateStory(story({ slug: 'Not A Slug' })), /slug has an invalid format/);
  assert.deepEqual(validateStory(null), ['Content must be an object.']);
  assert.deepEqual(validateStory([]), ['Content must be an object.']);
});

test('required copy blocks publishing validation but not drafts', () => {
  const blank = story({ company: '', thesis: '' });
  hasError(validateStory(blank), /story\.company must be a non-empty string/);
  hasError(validateStory(blank), /story\.thesis must be a non-empty string/);
  assert.deepEqual(validateStoryDraft(blank), []);
  // Drafts keep every other check.
  hasError(validateStoryDraft(story({ slug: 'Bad Slug', company: '' })), /slug has an invalid format/);
  hasError(validateStoryDraft({ ...story(), chapters: 'none' }), /chapters/);
  hasError(validateStoryDraft(story({ hero: { kind: 'video' as never as 'image', alt: 3 as never } })), /story\.hero\.alt must be a string/);
  // An unsafe source is shape-valid; publication readiness blocks it (publication.test.ts).
  assert.deepEqual(validateStoryDraft(story({ hero: { kind: 'image', src: 'javascript:alert(1)', alt: '' } })), []);
});

test('blank STAR scaffolding saves as a draft without invented prose', () => {
  const draft: Story = {
    ...story(),
    company: '',
    thesis: '',
    glance: { situation: '', task: '', action: '', result: '' },
    chapters: fixtureStory.chapters.map((chapter) => ({ key: chapter.key, title: '', blocks: [{ type: 'prose', paragraphs: [''] }] })),
  };
  assert.deepEqual(validateStoryDraft(draft), []);
});

test('unknown block types are rejected, including the removed journey and prototype blocks', () => {
  for (const type of ['journey', 'prototype', 'carousel']) {
    hasError(errorsFor({ type, title: 'x' }), /type must be one of: .*custom/);
  }
  hasError(errorsFor({ type: 'journey', stages: [] }), /type must be one of/);
});

test('custom blocks name a registry component and carry plain JSON props', () => {
  assert.deepEqual(errorsFor({ type: 'custom', component: 'FieldMap' }), []);
  assert.deepEqual(errorsFor({ type: 'custom', component: 'charts/BarChart', props: { values: [1, 2.5, null], label: 'x', nested: { on: true } }, title: 'A', caption: 'B' }), []);
  // A blank component is unfinished, not malformed: the draft saves.
  assert.deepEqual(errorsFor({ type: 'custom', component: '' }), []);
  hasError(errorsFor({ type: 'custom' }), /component must be a string/);
  hasError(errorsFor({ type: 'custom', component: '1Chart' }), /component must be a registry name/);
  hasError(errorsFor({ type: 'custom', component: 'Bar Chart' }), /component must be a registry name/);
  hasError(errorsFor({ type: 'custom', component: 'X', props: [] }), /props must be a plain JSON object/);
  hasError(errorsFor({ type: 'custom', component: 'X', props: 'text' }), /props must be a plain JSON object/);
  hasError(errorsFor({ type: 'custom', component: 'X', props: { n: Number.NaN } }), /props\.n must be plain JSON \(it is not a finite number\)/);
  hasError(errorsFor({ type: 'custom', component: 'X', props: { at: new Date(0) } }), /props\.at must be plain JSON \(it is not a plain object\)/);
  hasError(errorsFor({ type: 'custom', component: 'X', props: { run: () => 1 } }), /props\.run must be plain JSON \(it is a function\)/);
  hasError(errorsFor({ type: 'custom', component: 'X', props: { list: [1, undefined] } }), /props\.list\[1\] must be plain JSON/);
  hasError(errorsFor({ type: 'custom', component: 'X', title: 3 }), /title/);
});

test('media shape, links, YouTube and PDF sources validate', () => {
  assert.deepEqual(errorsFor({ type: 'media', media: image('ok') }), []);
  assert.deepEqual(errorsFor({ type: 'media', media: { ...image('remote'), src: 'https://cdn.example.com/a.png' } }), []);
  hasError(errorsFor({ type: 'media', media: { ...image('x'), kind: 'model' } }), /kind must be image or video/);
  hasError(errorsFor({ type: 'media', media: { ...image('x'), sourceMode: 'interactive' } }), /sourceMode must be one of: media, youtube, pdf/);
  hasError(errorsFor({ type: 'media', media: { ...image('x'), sourceMode: 'youtube', youtubeUrl: 'https://vimeo.com/1' } }), /supported YouTube link/);
  hasError(errorsFor({ type: 'media', media: { ...image('x'), matColor: 'red; background: url(x)' } }), /matColor/);
  hasError(errorsFor({ type: 'media', media: { ...image('x'), appearance: { radius: 999 } } }), /appearance\.radius must be between 0 and 48/);
  hasError(errorsFor({ type: 'media', media: { ...image('x'), appearance: { glow: 1 } } }), /appearance\.glow is not a supported setting/);
  hasError(errorsFor({ type: 'media', media: { ...image('x'), expansion: { zoom: 33 } } }), /supported image zoom level/);
  hasError(errorsFor({ type: 'media', media: { ...image('x'), framing: { zoom: 5 } } }), /framing\.zoom must be between 1 and 3/);
  hasError(errorsFor({ type: 'media', media: { ...image('x'), link: { href: 'javascript:alert(1)' } } }), /link\.href must be a path or an http\(s\) URL/);
  hasError(errorsFor({ type: 'media', media: { kind: 'image', alt: '', sourceMode: 'pdf', pdfUrl: '/media/a.txt' } }), /pdfUrl must be a PDF link/);
  assert.deepEqual(errorsFor({ type: 'media', media: { kind: 'image', alt: 'A brochure', sourceMode: 'pdf', pdfUrl: '/media/brochure.pdf' } }), []);
});

test('call-to-action links are same-origin paths, https or mailto', () => {
  for (const href of ['/contact', '#top', 'https://example.com/book', 'mailto:hello@example.com', 'mailto:hello@example.com?subject=Hi', '']) {
    assert.deepEqual(errorsFor({ type: 'cta', label: 'Get in touch', href }), [], href);
  }
  for (const href of ['http://example.com', 'javascript:alert(1)', '//example.com', 'ftp://example.com', 'mailto:nobody', 'https://user:pw@example.com']) {
    hasError(errorsFor({ type: 'cta', label: 'Go', href }), /href must be a link: a path on this site, an https URL or a mailto address/);
  }
});

test('company logo ids are plain lowercase ids, and project years are four digits', () => {
  assert.deepEqual(validateStory(story({ companyLogoId: 'fieldnote-mark' })), []);
  for (const id of ['Fieldnote', 'a b', '-lead', '']) {
    hasError(validateStory(story({ companyLogoId: id })), /companyLogoId must be a lowercase id/);
  }
  assert.deepEqual(validateStory(story({ projectYear: undefined })), []);
  for (const projectYear of ['25', '2025a', 'next year']) {
    assert.ok(validateStory(story({ projectYear })).includes(PROJECT_YEAR_ERROR), projectYear);
    assert.ok(validateStoryDraft(story({ projectYear })).includes(PROJECT_YEAR_ERROR), projectYear);
  }
});

test('chapters may be renamed and added, but keys stay unique', () => {
  const extra = story();
  extra.chapters.push({ key: 'appendix', title: 'Appendix', blocks: [{ type: 'prose', paragraphs: ['More.'] }] });
  assert.deepEqual(validateStory(extra), []);
  const duplicate = story();
  duplicate.chapters.push(structuredClone(duplicate.chapters[0]));
  hasError(validateStory(duplicate), /duplicate situation/);
});

test('related stories must be valid slugs', () => {
  assert.deepEqual(validateStory(story({ related: ['one-more'] })), []);
  hasError(validateStory(story({ related: ['Not valid'] })), /related\[0\] has an invalid slug format/);
});

test('large paragraphs and nested list rows validate their positions and ancestry', () => {
  const withProse = (body: Partial<StoryRichText>) => errorsFor({ type: 'prose', paragraphs: ['A', 'B', 'C'], ...body });
  assert.deepEqual(withProse({ large: [0, 2], lede: true }), []);
  hasError(withProse({ large: [3] }), /large/);
  assert.deepEqual(withProse({ listItems: [{ index: 0, format: 'bullets' }, { index: 1, format: 'numbered', depth: 1, large: true }] }), []);
  hasError(withProse({ listItems: [{ index: 1, format: 'bullets', depth: 1 }] }), /preceding list item/);
  hasError(withProse({ listItems: [{ index: 0, format: 'bullets' }, { index: 1, format: 'bullets', depth: 2 }] }), /preceding list item/);
  hasError(withProse({ listItems: [{ index: 0, format: 'bullets', depth: 4 }] }), /whole number from 0 to 3/);
  hasError(withProse({ listItems: [{ index: 0, format: 'bullets', large: false as never }] }), /large must be true/);
  hasError(withProse({ listItems: [{ index: 0, format: 'bullets' }, { index: 0, format: 'bullets' }] }), /must be unique/);
  hasError(withProse({ format: 'bullets', listItems: [{ index: 0, format: 'bullets' }, { index: 1, format: 'bullets', depth: 1 }] }), /cannot also use the flat list format/);
});

test('stored pairs and comparisons validate as the image groups they are now', () => {
  assert.deepEqual(errorsFor({ type: 'pair', items: [image('a'), image('b')] }), []);
  assert.deepEqual(errorsFor({ type: 'compare', before: image('a'), after: image('b') }), []);
});

test('imports insert once, skip identical reruns and refuse conflicts with a reason', () => {
  const first = seedFor(story());
  const edited = story({ title: 'Field notes, revised' });
  const second = seedFor(edited, 2, first.id);
  const [insertFirst, insertSecond] = planDocumentImports([first, second], []);
  assert.equal(insertFirst.action, 'insert');
  assert.equal(insertSecond.action, 'insert');

  const existing: ExistingDocumentIdentity[] = [{ id: first.id, slug: first.slug, version: 1, contentSha256: first.contentSha256 }];
  assert.deepEqual(planDocumentImports([first], existing).map((item) => item.action), ['skip']);

  const reasonFor = (seed: typeof first, rows: ExistingDocumentIdentity[] = []) => {
    const [item] = planDocumentImports([seed], rows);
    assert.equal(item.action, 'conflict');
    return item.action === 'conflict' ? item.reason : '';
  };
  assert.match(reasonFor({ ...first, id: 'story:other:v1' }), /ID does not match/);
  assert.match(reasonFor({ ...first, contentSha256: '0'.repeat(64) }), /checksum does not match/);
  assert.match(reasonFor({ ...second, parentDocumentId: 'story:missing:v9' }), /Parent document does not exist/);
  assert.match(reasonFor(seedFor(edited, 1), existing), /different content or identity/);
  assert.match(reasonFor(seedFor(story(), 3), existing), /Identical content already exists/);
  assert.match(reasonFor(seedFor(story({ company: '' }))), /company must be a non-empty string/);
  const [, duplicate] = planDocumentImports([first, first], []);
  assert.equal(duplicate.action, 'conflict');

  // Draft imports accept blank copy but keep every identity check.
  assert.deepEqual(planDraftDocumentImports([seedFor(story({ company: '', thesis: '' }))], []).map((item) => item.action), ['insert']);
  assert.equal(planDraftDocumentImports([{ ...seedFor(story({ company: '' })), contentSha256: 'x' }], [])[0].action, 'conflict');
});
