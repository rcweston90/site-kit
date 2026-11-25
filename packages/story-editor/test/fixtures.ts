import type { Story, StoryBlock, StoryDocument, StoryEditorState, StoryMedia } from '@rcweston/story-core';

/*
 * A made-up story for the editor tests: Fieldnote Studio and the people in
 * it. Media points at neutral placeholder paths; nothing here describes real work.
 */

export const image = (name: string, alt = `Placeholder ${name}`): StoryMedia => ({ kind: 'image', src: `/placeholder/${name}.svg`, alt, aspect: 16 / 10 });

export const blocks: StoryBlock[] = [
  { id: 'b-prose', type: 'prose', paragraphs: ['Notes lived in **six** tools.', 'Nobody could find them.'] },
  { id: 'b-media', type: 'media', media: image('desk', 'A stack of index cards'), width: 'wide' },
  { id: 'b-callout', type: 'callout', title: 'Worth knowing', body: { paragraphs: ['The guide is read-only by design.'] } },
  { id: 'b-quote', type: 'quote', quote: { quote: 'I rewrote the same summary three times.', name: 'Ada Park', role: 'Research lead' } },
  { id: 'b-note', type: 'note', text: 'A margin note.' },
  { id: 'b-callout-2', type: 'callout', title: 'Also worth knowing', body: { paragraphs: ['Tags are optional.'] } },
  { id: 'b-divider', type: 'divider' },
  { id: 'b-gallery', type: 'gallery', layout: 'horizontal', items: [image('index', 'The guide index'), image('entry', 'One guide entry')], caption: 'The index and an entry.' },
];

export function story(overrides: Partial<Story> = {}): Story {
  const base: Story = {
    slug: 'field-notes-that-travel',
    company: 'Fieldnote Studio',
    title: 'Field notes that travel',
    thesis: 'One shared field guide cut synthesis time in half.',
    period: '2025',
    facts: [{ id: 'fact-role', label: 'Role', value: 'Design lead' }],
    hero: image('hero', 'A desk of index cards'),
    glance: { situation: 'Notes lived in six tools.', task: 'One place to read them.', action: 'A shared guide.', result: 'Half the time.' },
    outcomes: [],
    credits: [{ id: 'credit-ada', name: 'Ada Park', role: 'Research lead' }],
    hindsight: { title: 'Looking back', paragraphs: ['Start the tags earlier.'] },
    chapters: [
      { key: 'situation', title: 'Notes were everywhere', blocks: structuredClone(blocks) },
      { key: 'result', title: 'Half the time to synthesis', blocks: [{ id: 'r-prose', type: 'prose', paragraphs: ['Synthesis now takes two days.'] }] },
    ],
    summary: 'One shared field guide for a research studio.',
  };
  return { ...base, ...overrides };
}

export function documentFor(content: Story, version: number, parentDocumentId: string | null = null): StoryDocument {
  const at = new Date(Date.UTC(2026, 0, version)).toISOString();
  return {
    id: `doc-${version}`, slug: content.slug, version, schemaVersion: 1, workflowStatus: 'draft', content,
    contentSha256: `sha-${version}`, sourceKind: 'editor', sourceRef: 'test', sourceCommit: '', parentDocumentId,
    createdAt: at, updatedAt: at, published: false,
  };
}

export function editorState(content: Story = story(), overrides: Partial<StoryEditorState> = {}): StoryEditorState {
  const first = documentFor(content, 1);
  return {
    story: content, documents: [first], liveStory: null, publishedDocumentId: null,
    readinessByDocumentId: { [first.id]: { errors: [], warnings: [] } },
    publicationEnabled: true, restoresEnabled: true, renameAvailable: true, renameUnavailableReason: null,
    takenAddresses: [], relatedStories: [], ...overrides,
  };
}
