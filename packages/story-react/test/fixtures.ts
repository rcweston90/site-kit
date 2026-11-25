import type { Story, StoryBlock, StoryMedia } from '@rcweston/story-core';

/*
 * A made-up story for the reader tests: Fieldnote Studio and the people in
 * it. Media points at neutral placeholder paths (jsdom loads no images); nothing here describes real work.
 */


export const image = (name: string, alt = `Placeholder ${name}`): StoryMedia => ({ kind: 'image', src: `/placeholder/${name}.svg`, alt, aspect: 16 / 10 });

/** One block of every built-in type, each with a distinct id. */
export const everyBlock: StoryBlock[] = [
  { id: 'b-prose', type: 'prose', paragraphs: ['Notes lived in **six** tools.', 'Nobody could find them.'] },
  { id: 'b-subhead', type: 'subhead', text: 'A subheading about notes' },
  { id: 'b-media', type: 'media', media: image('hero', 'A stack of index cards'), width: 'wide' },
  { id: 'b-decision', type: 'decision', call: 'Start with a reading view.', because: 'People read more than they write.', over: 'A new tool' },
  { id: 'b-insight', type: 'insight', title: 'Reading beats writing', columns: [{ label: 'Seen', body: { paragraphs: ['Most visits were reads.'] } }, { label: 'Heard', body: { paragraphs: ['People wanted search.'] } }] },
  { id: 'b-quote', type: 'quote', quote: { quote: 'I rewrote the same summary three times.', name: 'Ada Park', role: 'Research lead' } },
  { id: 'b-callout', type: 'callout', title: 'Worth knowing', body: { paragraphs: ['The guide is read-only by design.'] } },
  { id: 'b-metrics', type: 'metrics', items: [{ value: '4', description: 'tools retired' }] },
  { id: 'b-outcomes', type: 'outcomes', items: [{ value: '50%', label: 'less time in synthesis' }] },
  { id: 'b-ledger', type: 'ledger', ledger: { led: ['The guide layout'], influenced: ['Interview practice'] } },
  { id: 'b-implemented', type: 'implemented', label: 'What I built', items: ['The tagging scheme'] },
  { id: 'b-influenced', type: 'influenced', label: 'What I shaped', items: ['How interviews run'] },
  { id: 'b-partners', type: 'partners', label: 'Who else', items: [{ role: 'Engineering', owned: 'Search' }] },
  { id: 'b-contribution', type: 'contribution', variant: 'implemented', label: 'Also built', items: ['The index page'] },
  { id: 'b-collaboration', type: 'collaboration', map: { center: { label: 'Studio', detail: 'Four researchers' }, groups: [{ label: 'Engineering', detail: 'Two engineers' }] } },
  { id: 'b-followup', type: 'followUp', heading: 'More to talk about', items: [{ title: 'The tagging scheme', teaser: 'How tags were chosen.' }] },
  { id: 'b-steps', type: 'steps', items: [{ title: 'Collect', body: 'Gather every note.' }, { title: 'Tag', body: 'Tag each one.' }] },
  { id: 'b-note', type: 'note', text: 'A margin note.' },
  { id: 'b-divider', type: 'divider' },
  { id: 'b-cta', type: 'cta', label: 'Read the guide', href: 'https://example.test/guide' },
  { id: 'b-spacer', type: 'spacer', size: 'large' },
  { id: 'b-table', type: 'table', rows: [['Tool', 'Notes'], ['Docs', '120']], caption: 'Where notes lived' },
  { id: 'b-code', type: 'code', code: 'tag: interview', caption: 'A tag' },
  { id: 'b-custom', type: 'custom', component: 'FieldMap', title: 'Where the notes came from', caption: 'Pins by source', props: { pins: 3 } },
  { id: 'b-gallery', type: 'gallery', layout: 'horizontal', items: [image('index', 'The guide index'), image('entry', 'One guide entry')], caption: 'The index and an entry.' },
];

export function story(overrides: Partial<Story> = {}): Story {
  const base: Story = {
    slug: 'field-notes-that-travel',
    company: 'Fieldnote Studio',
    title: 'Field notes that travel',
    thesis: 'One shared field guide cut synthesis time in half.',
    period: '2025',
    status: 'Shipped',
    facts: [{ id: 'fact-role', label: 'Role', value: 'Design lead' }],
    hero: image('hero', 'A desk of index cards'),
    glance: { situation: 'Notes lived in six tools.', task: 'One place to read them.', action: 'A shared guide.', result: 'Half the time.' },
    outcomes: [],
    credits: [{ id: 'credit-ada', name: 'Ada Park', role: 'Research lead' }],
    chapters: [
      { key: 'situation', title: 'Notes were everywhere', blocks: structuredClone(everyBlock) },
      { key: 'result', title: 'Half the time to synthesis', blocks: [{ id: 'r-prose', type: 'prose', paragraphs: ['Synthesis now takes two days.'] }] },
    ],
    summary: 'One shared field guide for a research studio.',
  };
  return { ...base, ...overrides };
}
