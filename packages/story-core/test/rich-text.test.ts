import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeInlineText, highlightColor, parseInlineMarkup, safeInlineHref, serializeInlineRuns, type InlineNode } from '../src/inline-markup.ts';
import { protectInlineEscapes, restoreInlineEscapes } from '../src/inline-markup-escapes.ts';
import {
  inlineStoryMarkupToHtml,
  isEmptyRichText,
  proseBlockToHtml,
  richTextFromPlain,
  storyListRunRows,
  storyProseRuns,
  tiptapDocToProseBlock,
  visibleStoryListRows,
  withLargeParagraphs,
  withProseFormat,
} from '../src/story-rich-text-model.ts';
import { validateStory } from '../src/model.ts';
import { preparePublicStory } from '../src/prepare-public.ts';
import type { StoryRichText } from '../src/types.ts';
import { story } from './fixtures.ts';

type Doc = Parameters<typeof tiptapDocToProseBlock>[0];
const save = (text: string) => tiptapDocToProseBlock(
  { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] } as Doc,
  { paragraphs: [''] },
).paragraphs[0];
const unhtml = (html: string) => html.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

test('literal markup characters survive save and read without backslashes', () => {
  const text = 'Plain [x] and 2*3 and snake_case \\ end';
  assert.equal(unhtml(inlineStoryMarkupToHtml(save(text))), text);
});

test('repeated load and save cycles are stable (escapes never pile up)', () => {
  let saved = save('A [note] with *stars* typed literally');
  for (let i = 0; i < 3; i++) saved = save(unhtml(inlineStoryMarkupToHtml(saved)));
  assert.equal(saved, save('A [note] with *stars* typed literally'));
});

test('escaped characters inside formatting stay literal and keep the formatting', () => {
  const marked = '**bold \\[x\\]** and *it\\_alic* and [lin\\*k](https://example.com)';
  assert.equal(inlineStoryMarkupToHtml(marked), '<strong>bold [x]</strong> and <em>it_alic</em> and <a href="https://example.com">lin*k</a>');
  assert.equal(restoreInlineEscapes(protectInlineEscapes('a\\*b')), 'a*b', 'an escaped character reads as itself');
});

test('soft returns save as newlines and load back as line breaks', () => {
  const saved = tiptapDocToProseBlock({ type: 'doc', content: [{ type: 'paragraph', content: [
    { type: 'text', text: 'Line one' }, { type: 'hardBreak' }, { type: 'text', text: 'two', marks: [{ type: 'bold' }] },
  ] }] } as Doc, { paragraphs: [''] }).paragraphs[0];
  assert.equal(saved, 'Line one\n**two**');
  assert.equal(inlineStoryMarkupToHtml(saved), 'Line one<br><strong>two</strong>');
});

test('a blank paragraph loads empty, so a reload never saves it back as a soft return', () => {
  assert.equal(proseBlockToHtml({ paragraphs: ['a', '', 'b'] }), '<p>a</p><p></p><p>b</p>');
  assert.equal(proseBlockToHtml({ paragraphs: ['a', '\n', 'b'] }), '<p>a</p><p></p><p>b</p>');
  assert.equal(proseBlockToHtml({ paragraphs: ['a', ''], format: 'bullets' }), '<ul><li><p>a</p></li><li><p></p></li></ul>');
});

type Run = { text: string; marks: string[]; href?: string };
function runsOf(nodes: InlineNode[], marks: string[] = [], href?: string, out: Run[] = []): Run[] {
  for (const node of nodes) {
    if (node.type === 'text' || node.type === 'code') {
      const set = node.type === 'code' ? [...marks, 'code'] : marks;
      const sorted = [...set].sort();
      const last = out.at(-1);
      if (last && last.href === href && last.marks.join() === sorted.join()) last.text += node.text;
      else out.push({ text: node.text, marks: sorted, ...(href ? { href } : {}) });
    } else if (node.type === 'link') runsOf(node.children, marks, node.href, out);
    else runsOf(node.children, [...marks, node.mark], href, out);
  }
  return out;
}

test('every mark reads, alone and nested', () => {
  assert.equal(inlineStoryMarkupToHtml('**b** *i* ++u++ ~~s~~ ==h== `c`'), '<strong>b</strong> <em>i</em> <u>u</u> <s>s</s> <mark>h</mark> <code>c</code>');
  assert.equal(inlineStoryMarkupToHtml('***both***'), '<strong><em>both</em></strong>');
  assert.equal(inlineStoryMarkupToHtml('**a *b* c**'), '<strong>a <em>b</em> c</strong>');
  assert.equal(inlineStoryMarkupToHtml('*a **b** c*'), '<em>a <strong>b</strong> c</em>');
  assert.equal(inlineStoryMarkupToHtml('[**bold link**](/x)'), '<a href="/x"><strong>bold link</strong></a>');
  assert.equal(inlineStoryMarkupToHtml('`**not bold**`'), '<code>**not bold**</code>', 'code is literal');
});

test('lone tildes, equals, pluses and unsafe links stay text', () => {
  assert.equal(inlineStoryMarkupToHtml('About ~3 weeks, a = b'), 'About ~3 weeks, a = b');
  assert.equal(inlineStoryMarkupToHtml('x == y'), 'x == y');
  assert.equal(inlineStoryMarkupToHtml('[click](javascript:alert)'), 'click');
  assert.equal(inlineStoryMarkupToHtml('a\\*b\\~\\~c\\`'), 'a*b~~c`');
  assert.equal(escapeInlineText('~3 and ~~x~~ == `y`'), '\\~3 and \\~\\~x\\~\\~ \\=\\= \\`y\\`');
  assert.equal(escapeInlineText('about ~3 weeks'), 'about ~3 weeks');
  assert.equal(inlineStoryMarkupToHtml('1 + 1 and C++'), '1 + 1 and C++');
  assert.equal(escapeInlineText('C++ and 1 + 1'), 'C\\+\\+ and 1 + 1');
});

test('links are paths, anchors or web addresses', () => {
  assert.equal(safeInlineHref('/about'), '/about');
  assert.equal(safeInlineHref('https://example.com/a?b=1'), 'https://example.com/a?b=1');
  assert.equal(safeInlineHref('javascript:alert(1)'), null);
  assert.equal(safeInlineHref(42), null);
});

test('whatever the editor saves reads back with the same marks', () => {
  const marks = ['bold', 'italic', 'underline', 'strike', 'highlight'] as const;
  const words = ['a', 'bc', ' ', 'd e', '~', '=', '+', '++', '*', '_', '[x]', '`', '3 ~ 4', '1 + 1', 'f'];
  let seed = 7;
  const random = () => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed / 2 ** 31; };
  for (let round = 0; round < 400; round += 1) {
    const runs: Run[] = [];
    const length = 1 + Math.floor(random() * 6);
    for (let at = 0; at < length; at += 1) {
      const code = random() < 0.12;
      const set = code ? ['code'] : marks.filter(() => random() < 0.4);
      const href = !code && random() < 0.15 ? '/link' : undefined;
      runs.push({ text: words[Math.floor(random() * words.length)], marks: set, ...(href ? { href } : {}) });
    }
    const saved = serializeInlineRuns(runs.map((run) => ({ ...run, marks: run.marks as never })));
    const want: Run[] = [];
    for (const run of runs) {
      const sorted = [...run.marks].sort();
      const last = want.at(-1);
      if (last && last.href === run.href && last.marks.join() === sorted.join()) last.text += run.text;
      else want.push({ text: run.text, marks: sorted, ...(run.href ? { href: run.href } : {}) });
    }
    assert.deepEqual(runsOf(parseInlineMarkup(saved)), want, `round ${round}: ${JSON.stringify(runs)} gave ${saved}`);
  }
});

test('strike, code and highlight survive a save from the editor', () => {
  const doc = { type: 'doc', content: [{ type: 'paragraph', content: [
    { type: 'text', text: 'old', marks: [{ type: 'strike' }] },
    { type: 'text', text: ' ' },
    { type: 'text', text: 'npm i', marks: [{ type: 'code' }] },
    { type: 'text', text: ' ' },
    { type: 'text', text: 'key', marks: [{ type: 'highlight' }, { type: 'bold' }] },
    { type: 'text', text: ' ' },
    { type: 'text', text: 'under', marks: [{ type: 'underline' }] },
  ] }] } as Doc;
  const block = tiptapDocToProseBlock(doc, { paragraphs: [''] });
  assert.deepEqual(block.paragraphs, ['~~old~~ `npm i` **==key==** ++under++']);
  assert.equal(proseBlockToHtml(block), '<p><s>old</s> <code>npm i</code> <strong><mark>key</mark></strong> <u>under</u></p>');
});

test('highlight colours read, save and stay apart; unknown colours fall back', () => {
  assert.equal(highlightColor('green'), 'green');
  assert.equal(highlightColor('magenta'), null);
  assert.equal(inlineStoryMarkupToHtml('==o== =={green}g== =={grey}**b**=='), '<mark>o</mark> <mark data-color="green">g</mark> <mark data-color="grey"><strong>b</strong></mark>');
  assert.equal(serializeInlineRuns([{ text: 'emphasis', marks: ['italic', 'highlight'], highlight: 'green' }]), '*=={green}emphasis==*');
  const saved = serializeInlineRuns([
    { text: 'a', marks: ['highlight'] },
    { text: 'b', marks: ['highlight'], highlight: 'blue' },
    { text: 'c', marks: ['highlight', 'bold'], highlight: 'blue' },
    { text: 'd', marks: ['highlight'] },
  ]);
  assert.equal(saved, '==a===={blue}b**c**====d==');
  assert.equal(inlineStoryMarkupToHtml(saved), '<mark>a</mark><mark data-color="blue">b<strong>c</strong></mark><mark>d</mark>');
  assert.equal(serializeInlineRuns([{ text: '{red} alert', marks: ['highlight'] }]), '==\\{red} alert==');
  const fromEditor = tiptapDocToProseBlock({ type: 'doc', content: [{ type: 'paragraph', content: [
    { type: 'text', text: 'cool', marks: [{ type: 'highlight', attrs: { color: 'blue' } }] },
    { type: 'text', text: ' ' },
    { type: 'text', text: 'odd', marks: [{ type: 'highlight', attrs: { color: 'magenta' } }] },
  ] }] } as Doc, { paragraphs: [''] });
  assert.deepEqual(fromEditor.paragraphs, ['=={blue}cool== ==odd==']);
});

test('new-tab links round-trip with a safe target', () => {
  const href = 'https://example.com/reference?a=1&b=2';
  const saved = tiptapDocToProseBlock({ type: 'doc', content: [{ type: 'paragraph', content: [
    { type: 'text', text: 'Existing', marks: [{ type: 'link', attrs: { href } }] },
    { type: 'text', text: 'New tab', marks: [{ type: 'link', attrs: { href, target: '_blank' } }, { type: 'bold' }] },
  ] }] } as Doc, { paragraphs: [''] }).paragraphs[0];
  assert.equal(saved, `[Existing](${href})[**New tab**](${href} "_blank")`);
  assert.match(inlineStoryMarkupToHtml(saved), /<a [^>]+target="_blank" rel="noopener noreferrer"><strong>New tab<\/strong><\/a>/);
});

const nested: StoryRichText = {
  paragraphs: ['Before', '**Parent**', 'Child [source](/about)', 'Deeper\nline', 'Child two', 'Sibling style', 'Sibling', 'After'],
  listItems: [
    { index: 1, format: 'bullets', large: true }, { index: 2, format: 'numbered', depth: 1 },
    { index: 3, format: 'bullets', depth: 2, large: true }, { index: 4, format: 'numbered', depth: 1 },
    { index: 5, format: 'bullets', depth: 1 }, { index: 6, format: 'bullets' },
  ],
};

test('nested list rows keep exact bodies, marks, ancestry, size and adjoining text', () => {
  const list = storyProseRuns(nested)[1];
  assert.equal(list.type, 'list');
  if (list.type !== 'list') return;
  const rows = storyListRunRows(list);
  assert.deepEqual(rows.map((row) => [row.index, row.large]), [[1, true], [6, undefined]]);
  assert.deepEqual(rows[0].children?.map((child) => [child.format, child.indices]), [['numbered', [2, 4]], ['bullets', [5]]]);
  assert.equal(proseBlockToHtml(nested), '<p>Before</p><ul><li><p data-large="true"><strong>Parent</strong></p><ol><li><p>Child <a href="/about">source</a></p><ul><li><p data-large="true">Deeper<br>line</p></li></ul></li><li><p>Child two</p></li></ol><ul><li><p>Sibling style</p></li></ul></li><li><p>Sibling</p></li></ul><p>After</p>');
});

test('nested lists validate and publish unchanged', () => {
  const withLists = story();
  withLists.chapters[0].blocks = [{ type: 'prose', ...nested }, { type: 'callout', body: nested }];
  assert.deepEqual(validateStory(withLists), []);
  assert.deepEqual(preparePublicStory(withLists).chapters[0].blocks, withLists.chapters[0].blocks);
});

test('serializing editor lists emits depth and size only as needed', () => {
  const p = (text: string, large = false) => ({ type: 'paragraph', attrs: { large }, content: [{ type: 'text', text }] });
  const li = (first: ReturnType<typeof p>, ...content: { type: string; content?: object[] }[]) => ({ type: 'listItem', content: [first, ...content] });
  const json = { type: 'doc', content: [{ type: 'bulletList', content: [li(p('Parent', true), { type: 'orderedList', content: [li(p('Child'))] }), li(p('Tail'))] }] };
  assert.deepEqual(tiptapDocToProseBlock(json as Doc, { paragraphs: [''] }), {
    paragraphs: ['Parent', 'Child', 'Tail'], listItems: [{ index: 0, format: 'bullets', large: true }, { index: 1, format: 'numbered', depth: 1 }, { index: 2, format: 'bullets' }],
  });
  assert.deepEqual(tiptapDocToProseBlock({ type: 'doc', content: [{ type: 'bulletList', content: [li(p('A')), li(p('B'))] }] } as Doc, { paragraphs: ['A', 'B'], format: 'bullets' }), { paragraphs: ['A', 'B'], format: 'bullets' });
});

test('legacy paragraph styles on lists never become large item styles', () => {
  assert.equal(proseBlockToHtml({ paragraphs: ['**A**', 'B'], format: 'numbered', large: [0], lede: true }), '<ol><li><p><strong>A</strong></p></li><li><p>B</p></li></ol>');
  assert.equal(proseBlockToHtml({ paragraphs: ['A', 'B'], listItems: [{ index: 0, format: 'bullets' }], large: [0] }), '<ul><li><p>A</p></li></ul><p>B</p>');
});

test('whole-block marker switches keep nested ancestry and large rows', () => {
  const numbered = withProseFormat(nested, 'numbered');
  assert.deepEqual(numbered.listItems?.map((row) => [row.index, row.format, row.depth, row.large]), [
    [0, 'numbered', undefined, undefined], [1, 'numbered', undefined, true], [2, 'numbered', 1, undefined],
    [3, 'numbered', 2, true], [4, 'numbered', 1, undefined], [5, 'numbered', 1, undefined],
    [6, 'numbered', undefined, undefined], [7, 'numbered', undefined, undefined],
  ]);
  assert.deepEqual(withProseFormat(nested, 'paragraphs'), { paragraphs: nested.paragraphs, large: [1, 3] });
  assert.deepEqual(withLargeParagraphs<StoryRichText>({ paragraphs: ['a', 'b'] }, [1]).large, [1]);
});

test('only trailing blank reader rows are hidden, never list versions or children', () => {
  const paragraphs = ['First', '', 'Third', '\n', '', 'Child content', '   '];
  const rows = [
    { index: 0 }, { index: 1 }, { index: 2 }, { index: 3 },
    { index: 4, children: [{ type: 'list' as const, format: 'bullets' as const, indices: [5] }] },
    { index: 6 },
  ];
  assert.deepEqual(visibleStoryListRows(rows, paragraphs).map((row) => row.index), [0, 1, 2, 3, 4]);
});

test('empty rich text and plain-text conversion', () => {
  assert.equal(isEmptyRichText(undefined), true);
  assert.equal(isEmptyRichText({ paragraphs: ['', '  '] }), true);
  assert.equal(isEmptyRichText({ paragraphs: ['x'] }), false);
  assert.deepEqual(richTextFromPlain('One\n\nTwo *x*'), { paragraphs: ['One', 'Two \\*x\\*'] });
  assert.deepEqual(richTextFromPlain('- first\n- second'), { paragraphs: ['first', 'second'], format: 'bullets' });
  assert.deepEqual(richTextFromPlain(undefined), { paragraphs: [''] });
});
