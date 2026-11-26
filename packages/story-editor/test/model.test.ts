import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Schema } from '@tiptap/pm/model';
import { EditorState } from '@tiptap/pm/state';
import { history, undo, redo } from '@tiptap/pm/history';
import { validatePublication, type PublicationIssue, type Story, type StoryBlock, type StoryMedia } from '@rcweston/story-core';
import { storyToDocument, documentToStory, assetSettingsId } from '../src/continuous/model.ts';
import { canAddImage, appendGroupImages, brokenGroupBlocks, currentImageTarget, replaceImageBlocks } from '../src/continuous/image-groups.ts';
import { emptyAssetState, emptyMediaState } from '../src/continuous/empty-asset-state.ts';
import { describePublicationIssue, describePublicationIssues, parseIssuePath } from '../src/publication-issue-labels.ts';
import { publicationTarget } from '../src/publication-target.ts';
import { locateBlock, duplicateBlockAt, deleteBlockAt, moveBlockTo, locateRange, moveRange, blockSelectionId } from '../src/block-actions.ts';
import { findInStory, replaceInStory, storyFindPattern } from '../src/story-find.ts';
import { checkStoryUpload, matchesStoryUploadSignature, STORY_UPLOAD_MAX_BYTES } from '../src/upload-checks.ts';
import { story } from './fixtures.ts';

/*
 * These run the editor's pure model without a browser. The continuous
 * document is ProseMirror JSON, so its conversions and history run here with a
 * small schema; only the live editor view needs layout jsdom does not have.
 */

// ─── Continuous document <-> story ──────────────────────────────────────────

test('a full story round trips through the continuous document unchanged', () => {
  const source = story();
  assert.deepEqual(documentToStory(structuredClone(storyToDocument(source)), source), source);
});

test('the document keeps chapter composition and block rhythm cues', () => {
  const source = story();
  const doc = storyToDocument(source);
  const section = doc.content!.find((node) => node.type === 'storySection')!;
  const chapter = source.chapters.find((item) => item.key === section.attrs!.key)!;
  assert.equal(section.attrs!.columns, chapter.columns ?? 'one');
  assert.equal(section.attrs!.density, chapter.density ?? 'default');
  const authored = section.content!.filter((node) => node.attrs?.origin);
  assert.ok(authored.some((node) => node.attrs?.blockStart === true));
  for (const node of authored.filter((item) => item.attrs?.blockStart)) assert.equal(node.attrs?.blockKind, node.attrs?.origin.block.type);
});

test('a heading edit keeps every embedded asset', () => {
  const source = story();
  const doc = storyToDocument(source);
  const chapter = doc.content!.find((node) => node.type === 'storySection')!;
  chapter.content![0].content = [{ type: 'text', text: 'Updated heading' }];
  const next = documentToStory(doc, source);
  assert.equal(next.chapters[0].title, 'Updated heading');
  assert.deepEqual(next.chapters.map((c) => c.blocks), source.chapters.map((c) => c.blocks));
});

test('new paragraphs and media land in document order', () => {
  const source = story();
  const doc = storyToDocument(source);
  const chapter = doc.content!.find((node) => node.type === 'storySection')!;
  chapter.content!.push({ type: 'paragraph', content: [{ type: 'text', text: 'New paragraph' }] });
  chapter.content!.push({ type: 'storyAsset', attrs: { block: { type: 'media', id: 'new-image', media: { kind: 'image', src: '/placeholder/new.svg', alt: 'New' } } } });
  const next = documentToStory(doc, source);
  assert.equal(next.chapters[0].blocks.at(-1)?.id, 'new-image');
  assert.deepEqual(next.chapters[0].blocks.at(-2), { type: 'prose', paragraphs: ['New paragraph'] });
});

test('header, closing regions and unknown metadata survive a body edit', () => {
  const source = { ...story(), customMetadata: { retained: true } } as Story & { customMetadata: { retained: boolean } };
  const doc = storyToDocument(source);
  assert.ok(doc.content!.some((node) => node.type === 'storyHero'));
  assert.ok(doc.content!.some((node) => node.type === 'storyHindsight'));
  assert.ok(doc.content!.some((node) => node.type === 'storyCredits'));
  const section = doc.content!.find((node) => node.type === 'storySection')!;
  section.content![0].content = [{ type: 'text', text: 'Updated chapter title' }];
  const next = documentToStory(doc, source);
  const before = structuredClone(source) as Partial<typeof source>;
  const after = structuredClone(next) as Partial<typeof next>;
  delete before.chapters;
  delete after.chapters;
  assert.deepEqual(after, before);
});

test('removing the header or a section fails with a plain message instead of losing content', () => {
  const source = story();
  const noHeader = storyToDocument(source);
  noHeader.content = noHeader.content!.filter((node) => node.type !== 'storyHero');
  assert.throws(() => documentToStory(noHeader, source), /story header has to stay/);
  const noSection = storyToDocument(source);
  noSection.content!.splice(noSection.content!.findIndex((node) => node.type === 'storySection'), 1);
  assert.throws(() => documentToStory(noSection, source), /section cannot be removed/);
});

test('a duplicated asset never duplicates its block id', () => {
  const source = story();
  const doc = storyToDocument(source);
  const section = doc.content!.find((node) => node.type === 'storySection' && node.content!.some((child) => child.type === 'storyAsset' && child.attrs?.block?.id))!;
  const asset = section.content!.find((child) => child.type === 'storyAsset' && child.attrs?.block?.id)!;
  section.content!.splice(section.content!.indexOf(asset) + 1, 0, structuredClone(asset));
  const ids = documentToStory(doc, source).chapters.flatMap((chapter) => chapter.blocks.map((block) => block.id).filter(Boolean));
  assert.equal(new Set(ids).size, ids.length);
});

test('italic with a coloured highlight survives save and reload', () => {
  const source = story();
  const doc = storyToDocument(source);
  const text = doc.content!.flatMap((section) => section.content ?? []).find((node) => node.type === 'paragraph' && node.content?.some((child) => child.type === 'text'))!;
  text.content = [{ type: 'text', text: 'Combined emphasis', marks: [{ type: 'italic' }, { type: 'highlight', attrs: { color: 'green' } }] }];
  const saved = documentToStory(doc, source);
  const encoded = saved.chapters.flatMap((chapter) => chapter.blocks).find((block) => block.type === 'prose' && block.paragraphs.some((p) => p.includes('Combined emphasis')));
  assert.ok(encoded?.type === 'prose');
  assert.match(encoded.paragraphs.join('\n'), /\*==\{green\}Combined emphasis==\*/);
  assert.deepEqual(documentToStory(storyToDocument(saved), saved), saved);
});

test('a callout edit changes that callout only', () => {
  const source = story();
  const doc = storyToDocument(source);
  const callouts = doc.content!.flatMap((section) => section.content ?? []).filter((node) => node.type === 'storyCallout');
  assert.equal(callouts.length, 2);
  const untouched = structuredClone(callouts[1].attrs!.block);
  callouts[0].content![0].content = [{ type: 'text', text: 'Edited callout' }];
  const next = documentToStory(doc, source).chapters.flatMap((chapter) => chapter.blocks).filter((block) => block.type === 'callout');
  assert.equal(next[0].title, 'Edited callout');
  assert.equal(next[0].id, 'b-callout');
  assert.deepEqual(next[1], untouched);
});

test('a note keeps its line breaks as plain text', () => {
  const source = story();
  const note = source.chapters[0].blocks.find((block) => block.type === 'note')!;
  if (note.type !== 'note') throw new Error('no note');
  note.text = 'Literal **note**\nSecond line';
  const doc = storyToDocument(source);
  assert.deepEqual(documentToStory(doc, source), source);
  const node = doc.content!.flatMap((section) => section.content ?? []).find((item) => item.type === 'storyNote')!;
  assert.deepEqual(node.content!.map((child) => child.type), ['text', 'hardBreak', 'text']);
  node.content![2].text = 'Edited note';
  assert.deepEqual(documentToStory(doc, source).chapters[0].blocks.find((block) => block.type === 'note'), { ...note, text: 'Literal **note**\nEdited note' });
});

test('settings target the asset at its current position, and a stale source fails closed', () => {
  const source = story();
  const blank: StoryBlock = { type: 'media', media: { kind: 'image', alt: '' } };
  source.chapters[0].blocks = [blank, { type: 'divider' }, structuredClone(blank)];
  const doc = storyToDocument(source);
  assert.equal(assetSettingsId(doc, source, 1, 1), 'block:situation:0');
  assert.equal(assetSettingsId(doc, source, 1, 3), 'block:situation:2');
  const contents = doc.content![1].content!;
  const moved = contents.splice(3, 1)[0];
  contents.splice(1, 0, moved);
  const after = documentToStory(doc, source);
  assert.equal(assetSettingsId(doc, after, 1, 2), 'block:situation:1');
  assert.equal(assetSettingsId(doc, source, 1, 2), null);
});

// ─── Image groups (with real ProseMirror history) ───────────────────────────

const schema = new Schema({ nodes: {
  doc: { content: 'storyHero storySection' }, storyHero: {},
  storySection: { attrs: { key: { default: 'task' }, columns: { default: 'one' }, density: { default: 'default' }, hidden: { default: false } }, content: 'sectionTitle (storyAsset | storyNote | paragraph)+' },
  sectionTitle: { content: 'text*' },
  storyAsset: { atom: true, attrs: { block: { default: null }, origin: { default: null }, blockAnchor: { default: null } } },
  storyNote: { content: 'inline*', attrs: { block: { default: null }, origin: { default: null }, blockAnchor: { default: null } } },
  paragraph: { content: 'inline*', attrs: { landing: { default: false } } },
  text: { group: 'inline' }, hardBreak: { inline: true, group: 'inline' },
} });
const first: StoryMedia = { kind: 'image', src: '/placeholder/one.svg', alt: 'First', caption: 'First caption', framing: { x: 40, y: 60, zoom: 1.1 }, frame: 'mat', link: { href: '/about', label: 'Reference' } };
const second: StoryMedia = { kind: 'image', src: '/placeholder/two.svg', alt: 'Second' };
const freshIds = () => { let i = 0; return () => `fresh-${++i}`; };
const single: StoryBlock = { type: 'media', id: 'selected-image', media: first, align: 'center', width: 'text' };
const groupStory = (block: StoryBlock): Story => ({ ...story(), hindsight: undefined, credits: [], chapters: [{ key: 'task', title: 'Examples', blocks: [{ type: 'divider', id: 'before' }, block, { type: 'divider', id: 'after' }] }] });

test('an image becomes an ordered group, and unsupported media is left alone', () => {
  assert.equal(canAddImage({ type: 'media', media: { ...first, sourceMode: 'pdf' } }), false);
  assert.equal(canAddImage({ type: 'media', media: { ...first, src: undefined } }), false);
  assert.equal(appendGroupImages(single, [], freshIds()), null);
  const gallery = appendGroupImages(single, [second], freshIds());
  if (gallery?.type !== 'gallery') throw new Error('no gallery');
  assert.equal(gallery.id, single.id);
  assert.equal(gallery.layout, 'vertical');
  assert.deepEqual(gallery.items, [first, second]);
  const grown = appendGroupImages({ ...gallery, layout: 'horizontal' }, [second, second], freshIds());
  assert.equal(grown?.type === 'gallery' && grown.layout, 'grid');
});

test('grouping and breaking up are separate undo steps that restore cleanly', () => {
  const source = groupStory(single);
  const doc = schema.nodeFromJSON(storyToDocument(source));
  const state = EditorState.create({ doc, plugins: [history()] });
  let pos = 0;
  doc.descendants((node, at) => { if (node.attrs.block?.id === single.id) pos = at; });
  const current = doc.nodeAt(pos)!.attrs.block;
  const ids = freshIds();
  const grouped = replaceImageBlocks(state, pos, current, [appendGroupImages(current, [second], ids)!]);
  assert.ok(grouped);
  const active = state.apply(grouped);
  const group = active.doc.nodeAt(pos)!.attrs.block;
  const broken = replaceImageBlocks(active, pos, group, brokenGroupBlocks({ ...group, caption: 'Shared caption' }, ids));
  assert.ok(broken);
  const split = active.apply(broken);
  assert.equal(split.doc.nodeAt(pos)!.attrs.blockAnchor, 'task:selected-image');
  let undone = split;
  assert.ok(undo(undone, (tr) => { undone = undone.apply(tr); }));
  assert.ok(undone.doc.eq(active.doc));
  assert.ok(undo(undone, (tr) => { undone = undone.apply(tr); }));
  assert.ok(undone.doc.eq(doc));
  assert.ok(redo(undone, (tr) => { undone = undone.apply(tr); }));
  assert.ok(undone.doc.eq(active.doc));
});

test('the image picker finds the intended asset and rejects a stale snapshot', () => {
  const doc = schema.nodeFromJSON(storyToDocument(groupStory(single)));
  assert.deepEqual(currentImageTarget(doc, undefined, 'task:selected-image', single)?.block, single);
  assert.equal(currentImageTarget(doc, undefined, 'task:selected-image', { ...single, media: second }), null);
});

test('empty assets offer a contextual action, not a blank', () => {
  assert.equal(emptyAssetState({ type: 'gallery', items: [] }, true)?.action, 'Add gallery images');
  assert.equal(emptyAssetState({ type: 'metrics', items: [] }, true)?.action, 'Add metrics');
  assert.equal(emptyAssetState({ type: 'note', text: '' }, true), null);
  assert.equal(emptyAssetState({ type: 'divider' }, true), null);
  assert.equal(emptyAssetState({ type: 'steps', items: [] }, false)?.action, 'Add steps');
  assert.equal(emptyMediaState({ kind: 'image', alt: '' }).action, 'Add media');
  assert.equal(emptyMediaState({ kind: 'image', alt: '', sourceMode: 'youtube' }).action, 'Link YouTube video');
  assert.equal(emptyMediaState({ kind: 'image', alt: '', sourceMode: 'pdf' }).action, 'Link PDF');
});

// ─── Publication checklist ──────────────────────────────────────────────────

const broken: Story = {
  ...story(),
  companyLogo: 'logo.png',
  facts: [{ label: 'Role', value: '' }],
  hero: { kind: 'video', src: 'file:///clip.mp4', alt: '' },
  chapters: [
    { key: 'situation', title: 'Where things stood', blocks: [
      { id: 'p1', type: 'prose', paragraphs: [''] },
      { type: 'media', media: { kind: 'image', alt: 'No source yet' } },
      { id: 'm2', type: 'media', media: { kind: 'image', src: '/placeholder/a.svg', alt: '' } },
    ] },
    { key: 'task', title: 'The brief', blocks: [{ id: 'd1', type: 'decision', call: 'Make the call', because: '', options: [{ label: '', whyNot: '' }] }] },
    { key: 'action', title: 'What we did', blocks: [{ id: 'n1', type: 'note', text: 'Hidden', hidden: true }] },
    { key: 'result', title: 'What changed', blocks: [{ id: 'group1', type: 'gallery', layout: 'horizontal', items: [{ kind: 'image', src: '/placeholder/a.svg', alt: 'A' }, { kind: 'video', alt: 'B' }] }] },
  ],
  related: ['field-notes-that-travel', 'ghost', 'ghost'],
};
const readiness = validatePublication(broken, { knownSlugs: ['field-notes-that-travel'], uploadedMediaKeys: [] });
const issues = [...readiness.errors, ...readiness.warnings];
const labelFor = (path: string, code?: PublicationIssue['code']) => {
  const issue = issues.find((entry) => entry.path === path && (!code || entry.code === code));
  assert.ok(issue, `no issue at ${path}: ${issues.map((entry) => `${entry.code}@${entry.path}`).join(', ')}`);
  return describePublicationIssue(broken, issue);
};

test('gate paths parse into segments', () => {
  assert.deepEqual(parseIssuePath('story.chapters[0].blocks[12].media.alt'), ['chapters', 0, 'blocks', 12, 'media', 'alt']);
  assert.deepEqual(parseIssuePath('story.related[2]'), ['related', 2]);
});

test('issues are named by place, numbered by type and keep their canvas id', () => {
  assert.deepEqual(labelFor('story.hero.src'), { where: 'Hero · Video', what: 'Needs an uploaded video', selectionId: 'hero-media' });
  assert.deepEqual(labelFor('story.facts[0].value'), { where: 'Hero · Fact 1', what: 'Needs text', selectionId: 'facts' });
  assert.equal(labelFor('story.chapters[0].blocks[0].paragraphs').selectionId, 'block:situation:p1');
  assert.equal(labelFor('story.chapters[0].blocks[1].media').selectionId, 'block:situation:1');
  assert.deepEqual(labelFor('story.chapters[0].blocks[2].media.alt'), { where: 'Where things stood · Image 2', what: 'Needs a description for screen readers', selectionId: 'block:situation:m2' });
  assert.equal(labelFor('story.chapters[1].blocks[0].because').where, 'The brief · Decision 1 · Rationale');
  assert.equal(labelFor('story.chapters[3].blocks[0].items[1]').where, 'What changed · Image group 1 · Video 2');
  assert.equal(labelFor('story.chapters[2].blocks').selectionId, 'chapter:action');
  assert.equal(labelFor('story.related[1]', 'broken-related-story').selectionId, 'story');
});

test('the checklist puts errors first, drops repeats and never shows a data path', () => {
  const rows = describePublicationIssues(broken, issues);
  const firstWarning = rows.findIndex((row) => row.severity === 'warning');
  if (firstWarning >= 0) assert.ok(rows.slice(firstWarning).every((row) => row.severity === 'warning'));
  assert.equal(describePublicationIssues(broken, [...issues, issues[0]]).length, rows.length);
  for (const row of rows) for (const text of [row.where, row.what]) assert.doesNotMatch(text, /story\.|\[\d+\]/, text);
});

test('publish jumps go to the exact field', () => {
  assert.deepEqual(publicationTarget(broken, { path: 'story.chapters[3].blocks[0].items[1].alt', code: 'missing-media-alt' }), { kind: 'settings', item: 1, selector: '[data-publication-input="alt"]' });
  assert.deepEqual(publicationTarget(broken, { path: 'story.chapters[0].blocks[0].paragraphs', code: 'empty-visible-content' }), { kind: 'canvas' });
  assert.deepEqual(publicationTarget(broken, { path: 'story.related[1]', code: 'broken-related-story' }), { kind: 'settings', selector: '[data-publication-related="1"]' });
});

// ─── Block actions, find and uploads ────────────────────────────────────────

test('block actions duplicate, move and delete by selection id', () => {
  const source = story();
  const at = locateBlock(source, 'block:situation:b-note');
  assert.ok(at);
  const duplicated = duplicateBlockAt(source, at);
  const copies = duplicated.story.chapters[0].blocks.filter((block) => block.type === 'note');
  assert.equal(copies.length, 2);
  assert.notEqual(copies[0].id, copies[1].id);
  const target = locateBlock(source, 'block:situation:b-prose')!;
  const moved = moveBlockTo(source, at, target, 'before');
  assert.equal(moved?.story.chapters[0].blocks[0].id, 'b-note');
  const deleted = deleteBlockAt(source, at);
  assert.ok(!deleted.story.chapters[0].blocks.some((block) => block.id === 'b-note'));
  assert.equal(blockSelectionId('situation', { type: 'divider' }, 4), 'block:situation:4');
  const range = locateRange(source, 'block:situation:b-prose', 'block:situation:b-media');
  assert.equal(range?.blocks.length, 2);
  assert.equal(moveRange(source, range!, 1)?.story.chapters[0].blocks[1].id, 'b-prose');
});

test('find and replace work across the story, with case and whole-word options', () => {
  const source = story();
  assert.ok(findInStory(source, 'notes', { matchCase: false, wholeWord: false }).length > 0);
  assert.equal(storyFindPattern('', { matchCase: false, wholeWord: false }), null);
  const { story: next, replaced } = replaceInStory(source, 'Ada Park', 'Rae Lin', { matchCase: true, wholeWord: true });
  assert.ok(replaced >= 1);
  assert.equal(findInStory(next, 'Ada Park', { matchCase: true, wholeWord: true }).length, 0);
});

test('uploads are checked by type, size and signature before they leave the browser', () => {
  assert.equal(checkStoryUpload({ name: 'a.png', type: 'image/png', size: 10 }).ok, true);
  assert.equal(checkStoryUpload({ name: 'a.exe', type: 'application/x-msdownload', size: 10 }).ok, false);
  assert.equal(checkStoryUpload({ name: 'a.png', type: 'image/png', size: STORY_UPLOAD_MAX_BYTES + 1 }).ok, false);
  assert.equal(matchesStoryUploadSignature('image/png', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), true);
  assert.equal(matchesStoryUploadSignature('image/png', new Uint8Array([0, 0, 0, 0])), false);
});

test('an autosave leaves the canvas, the inline edit and undo exactly as they were', async () => {
  const { createEditorDraftState, editorDraftReducer, isStoryDirty } = await import('../src/model.ts');
  const { story: fixture } = await import('./fixtures.ts');
  const base = fixture();
  let state = createEditorDraftState(base);
  state = editorDraftReducer(state, { type: 'inline-start' });
  const typed = { ...base, title: 'Typed' };
  state = editorDraftReducer(state, { type: 'edit', story: typed, history: 'merge' });
  state = editorDraftReducer(state, { type: 'save-start' });
  // The server's copy differs (it tidies and measures): it never replaces what's on screen.
  const tidied = { ...typed, summary: `${typed.summary ?? ''} ` };
  const saved = editorDraftReducer(state, { type: 'save-success', story: tidied, submittedStory: typed, version: 2, autosave: true });
  assert.equal(saved.story, typed, 'the same story object, so the canvas doesn’t redraw');
  assert.equal(saved.inlineBase, state.inlineBase, 'the edit in progress can still be undone in one step');
  assert.equal(saved.saveState, 'saved');
  assert.equal(saved.message, null);
  assert.equal(isStoryDirty(saved), false, 'what was typed is the baseline, so nothing saves twice');

  // Typing during the save keeps the newer text unsaved, quietly.
  const during = editorDraftReducer(editorDraftReducer(state, { type: 'edit', story: { ...typed, title: 'Typed more' }, history: 'merge' }),
    { type: 'save-success', story: tidied, submittedStory: typed, version: 2, autosave: true });
  assert.equal(during.story.title, 'Typed more');
  assert.equal(during.saveState, 'idle');
  assert.equal(during.message, null);
  assert.equal(isStoryDirty(during), true);
});
