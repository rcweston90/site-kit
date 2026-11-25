import { dom } from './setup-dom.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ReactElement } from 'react';
import { StoryPage, type BlockRegistry, type StoryRenderEditor, type StoryEditingSlots } from '../src/index.ts';
import { everyBlock, story } from './fixtures.ts';

function render(element: ReactElement): { container: HTMLElement; root: Root; unmount: () => void } {
  const container = dom.window.document.createElement('div');
  dom.window.document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(element));
  return { container, root, unmount: () => { act(() => root.unmount()); container.remove(); } };
}

const FieldMap: BlockRegistry[string]['Render'] = ({ props, editing }) => (
  <div data-testid="field-map" data-editing={editing ? 'yes' : 'no'}>{`Pins: ${String(props.pins)}`}</div>
);
const registry: BlockRegistry = { FieldMap: { label: 'Field map', Render: FieldMap } };

/** A minimal editor: plain elements in place of the rich editing slots. */
function fakeEditor(): StoryRenderEditor {
  const ui: StoryEditingSlots = {
    InlineText: ({ value, label }) => <span data-inline-field={label}>{value}</span>,
    InlineAdd: ({ label, onAdd }) => <button type="button" onClick={onAdd}>{label}</button>,
    Prose: ({ value, label }) => <div data-prose-field={label ?? 'Prose'}>{value.paragraphs.join(' ')}</div>,
  };
  return {
    selectedId: null,
    onSelect() {}, onTextInput() {}, onTextDraftChange() {}, onTextEditStart() {}, onTextEditEnd() {}, onTextEditLeave() {},
    onBlockInput() {}, onChapterDrop() {},
    ui,
  };
}

const anchors = (container: HTMLElement) => [...container.querySelectorAll('[data-story-block-anchor]')].map((node) => node.getAttribute('data-story-block-anchor'));

test('every built-in block type renders for readers', () => {
  const { container, unmount } = render(<StoryPage story={story()} blocks={registry} chapterBar={false} />);
  const rendered = new Set(anchors(container));
  // The spacer is room, not content, but still has its anchor.
  for (const block of everyBlock) {
    const anchor = `situation:${block.id}`;
    // Ledgers split into several sections; the media, gallery and contribution blocks carry the anchor on their root.
    assert.ok(rendered.has(anchor) || container.innerHTML.includes(block.id!), `${block.type} (${block.id}) rendered`);
  }
  const text = container.textContent ?? '';
  for (const phrase of ['Notes lived in', 'A subheading about notes', 'Start with a reading view.', 'Reading beats writing', 'I rewrote the same summary three times.', 'Worth knowing', 'less time in synthesis', 'The tagging scheme', 'How interviews run', 'Four researchers', 'More to talk about', 'Gather every note.', 'A margin note.', 'Read the guide', 'Where notes lived', 'tag: interview', 'Pins: 3', 'The index and an entry.']) {
    assert.ok(text.includes(phrase), `page text includes “${phrase}”`);
  }
  assert.equal(container.querySelector('a[data-story-cta]')?.getAttribute('href'), 'https://example.test/guide');
  assert.ok(container.querySelector('table'), 'the table block renders a table');
  assert.ok(container.querySelector('pre code'), 'the code block renders as preformatted code');
  assert.ok(container.querySelector('hr'), 'the divider renders a rule');
  unmount();
});

test('the page is the story: title, thesis and chapter headings', () => {
  const { container, unmount } = render(<StoryPage story={story()} chapterBar={false} />);
  assert.equal(container.querySelector('h1')?.textContent, 'Field notes that travel');
  const text = container.textContent ?? '';
  assert.ok(text.includes('One shared field guide cut synthesis time in half.'));
  assert.ok(text.includes('Notes were everywhere'));
  assert.ok(text.includes('Half the time to synthesis'));
  unmount();
});

test('hidden blocks and hidden chapters are left out for readers', () => {
  const s = story();
  s.chapters[0].blocks.find((block) => block.id === 'b-quote')!.hidden = true;
  s.chapters[1].hidden = true;
  const { container, unmount } = render(<StoryPage story={s} chapterBar={false} />);
  const text = container.textContent ?? '';
  assert.ok(!text.includes('I rewrote the same summary three times.'), 'hidden block omitted');
  assert.ok(!text.includes('Half the time to synthesis'), 'hidden chapter omitted');
  assert.ok(!text.includes('Synthesis now takes two days.'), 'hidden chapter body omitted');
  assert.ok(text.includes('Notes were everywhere'), 'visible chapter kept');
  unmount();
});

test('hidden blocks and chapters stay in the editor, marked hidden', () => {
  const s = story();
  s.chapters[0].blocks.find((block) => block.id === 'b-quote')!.hidden = true;
  s.chapters[1].hidden = true;
  const { container, unmount } = render(<StoryPage story={s} editor={fakeEditor()} chapterBar={false} />);
  assert.ok(container.querySelector('[data-story-block-anchor="situation:b-quote"][data-story-hidden]'), 'hidden block is present and marked');
  assert.ok(container.querySelector('section[data-story-hidden]') || container.querySelector('[data-story-hidden]'), 'hidden chapter is present and marked');
  assert.ok((container.textContent ?? '').includes('Half the time to synthesis'));
  unmount();
});

test('a custom block renders its registered component with its props, title and caption', () => {
  const { container, unmount } = render(<StoryPage story={story()} blocks={registry} chapterBar={false} />);
  const node = container.querySelector('[data-testid="field-map"]');
  assert.ok(node, 'the registered component rendered');
  assert.equal(node.textContent, 'Pins: 3');
  assert.equal(node.getAttribute('data-editing'), 'no');
  const figure = node.closest('figure');
  assert.ok(figure?.textContent?.includes('Where the notes came from'), 'title shown');
  assert.ok(figure?.textContent?.includes('Pins by source'), 'caption shown');
  unmount();
});

test('a custom block falls back to the definition’s default props', () => {
  const s = story();
  const block = s.chapters[0].blocks.find((b) => b.id === 'b-custom')!;
  if (block.type === 'custom') delete block.props;
  const { container, unmount } = render(<StoryPage story={s} blocks={{ FieldMap: { label: 'Field map', Render: FieldMap, defaultProps: { pins: 7 } } }} chapterBar={false} />);
  assert.equal(container.querySelector('[data-testid="field-map"]')?.textContent, 'Pins: 7');
  unmount();
});

test('a custom block knows it is being edited', () => {
  const { container, unmount } = render(<StoryPage story={story()} blocks={registry} editor={fakeEditor()} chapterBar={false} />);
  assert.equal(container.querySelector('[data-testid="field-map"]')?.getAttribute('data-editing'), 'yes');
  unmount();
});

test('an unknown custom block renders nothing for readers', () => {
  const { container, unmount } = render(<StoryPage story={story()} blocks={{}} chapterBar={false} />);
  assert.equal(container.querySelector('[data-story-block-anchor="situation:b-custom"]'), null);
  assert.ok(!(container.textContent ?? '').includes('Where the notes came from'));
  assert.ok(!(container.textContent ?? '').includes('FieldMap'));
  unmount();
});

test('an unknown custom block shows a labelled placeholder in the editor', () => {
  const { container, unmount } = render(<StoryPage story={story()} editor={fakeEditor()} chapterBar={false} />);
  const placeholder = container.querySelector('[data-story-block-anchor="situation:b-custom"]');
  assert.ok(placeholder, 'placeholder rendered');
  assert.match(placeholder.textContent ?? '', /No component named “FieldMap” is registered\./);
  unmount();
});

test('a registry entry named like an Object property is not mistaken for a component', () => {
  const s = story();
  const block = s.chapters[0].blocks.find((b) => b.id === 'b-custom')!;
  if (block.type === 'custom') block.component = 'toString';
  const { container, unmount } = render(<StoryPage story={s} blocks={registry} chapterBar={false} />);
  assert.equal(container.querySelector('[data-story-block-anchor="situation:b-custom"]'), null);
  unmount();
});

test('links go through renderLink', () => {
  const seen: string[] = [];
  const { container, unmount } = render(
    <StoryPage
      story={story()}
      chapterBar={false}
      backLink={{ href: '/stories', label: 'Stories' }}
      next={{ slug: 'a-second-study', title: 'A second study', company: 'Fieldnote Studio', summary: 'Another one.' }}
      hrefFor={(slug) => `/stories/${slug}`}
      renderLink={({ href, children, ...rest }) => { seen.push(href); return <a href={href} data-routed="" {...rest}>{children}</a>; }}
    />,
  );
  assert.ok(seen.includes('/stories'), 'back link routed');
  assert.ok(seen.includes('/stories/a-second-study'), 'next card routed');
  assert.ok(container.querySelector('a[data-routed][href="/stories/a-second-study"]'));
  unmount();
});
