import type { Story, StoryBlock, StoryMedia } from '../src/types.ts';
import { contentSha256, storyDocumentId } from '../src/identity.ts';
import { STORY_SCHEMA_VERSION, type StoryDocumentSeed } from '../src/document.ts';

/*
 * A made-up story for tests: Fieldnote Studio, a small research studio, and
 * the people in it. Media points at neutral placeholder paths; nothing here
 * describes real work.
 */

export const FIXTURE_SLUG = 'field-notes-that-travel';

export const image = (name: string, alt = `Placeholder ${name}`): StoryMedia => ({
  kind: 'image',
  src: `/media/fieldnote/${name}.svg`,
  alt,
  aspect: 16 / 10,
});

export const fixtureStory: Story = {
  slug: FIXTURE_SLUG,
  company: 'Fieldnote Studio',
  title: 'Field notes that travel',
  thesis: 'As design lead, I turned scattered interview notes into one shared field guide, which cut synthesis time in half.',
  period: '2025',
  projectYear: '2025',
  status: 'Shipped',
  disclosure: 'Names and figures are illustrative.',
  facts: [
    { id: 'fact-role', label: 'Role', value: 'Design lead' },
    { id: 'fact-team', label: 'Team', value: 'Four researchers, two engineers' },
  ],
  hero: image('hero', 'A stack of index cards on a desk'),
  glance: {
    situation: 'Interview notes lived in six tools.',
    task: 'Give the studio one place to read them.',
    action: 'We built a shared field guide.',
    result: 'Synthesis took half as long.',
  },
  glancePresentation: 'clean',
  heroLayout: 'standard',
  outcomes: [{ id: 'outcome-time', value: '50%', label: 'less time in synthesis', evidence: 'before-after' }],
  credits: [
    { id: 'credit-ada', name: 'Ada Park', role: 'Research lead' },
    { id: 'credit-ben', name: 'Ben Ortiz', role: 'Engineer' },
  ],
  chapters: [
    {
      key: 'situation',
      title: 'Notes were everywhere',
      blocks: [
        { id: 'situation-prose', type: 'prose', paragraphs: ['Every project kept its notes in a different place.', 'Nobody could find **last month’s** quotes.'], large: [0] },
        { id: 'situation-quote', type: 'quote', quote: { quote: 'I rewrote the same summary three times.', name: 'Ada Park', role: 'Research lead' } },
      ],
    },
    {
      key: 'task',
      title: 'One place to read them',
      blocks: [
        { id: 'task-prose', type: 'prose', paragraphs: ['The studio needed a single, searchable record.'] },
        {
          id: 'task-decision',
          type: 'decision',
          call: 'Start with a reading view, not an editor.',
          because: 'Most people read notes far more often than they write them.',
          options: [{ label: 'A new note-taking tool', whyNot: 'It would add a seventh place.' }],
        },
      ],
    },
    {
      key: 'action',
      title: 'A field guide, built in the open',
      blocks: [
        { id: 'action-prose', type: 'prose', paragraphs: ['We shipped a guide the whole studio could read.'] },
        {
          id: 'action-video',
          type: 'media',
          media: { kind: 'video', sourceMode: 'youtube', youtubeUrl: 'https://www.youtube.com/watch?v=aBcDeFgHiJ0', alt: 'A walkthrough of the guide' },
          width: 'wide',
        },
        {
          id: 'action-gallery',
          type: 'gallery',
          layout: 'horizontal',
          items: [image('guide-index', 'The guide index'), image('guide-entry', 'One guide entry')],
          caption: 'The index and an entry.',
        },
        { id: 'action-map', type: 'custom', component: 'FieldMap', title: 'Where the notes came from', props: { pins: [{ x: 10, y: 20, label: 'Studio' }], zoom: 2 } },
      ],
    },
    {
      key: 'result',
      title: 'Half the time to synthesis',
      blocks: [
        { id: 'result-prose', type: 'prose', paragraphs: ['Synthesis now takes two days instead of four.'] },
        { id: 'result-implemented', type: 'implemented', label: 'What I built', items: ['The guide layout', 'The tagging scheme'] },
        { id: 'result-influenced', type: 'influenced', label: 'What I shaped', items: ['How the studio runs interviews'] },
        { id: 'result-partners', type: 'partners', label: 'Who else', items: [{ role: 'Engineering', owned: 'Search and storage' }] },
      ],
    },
  ],
  hindsight: { title: 'What I’d do differently', paragraphs: ['Invite the engineers into the first interview round.'] },
  related: ['a-second-study'],
  summary: 'One shared field guide for a research studio.',
};

/** A fresh, deep copy to mutate in a test. */
export function story(overrides: Partial<Story> = {}): Story {
  return { ...structuredClone(fixtureStory), ...overrides };
}

/** The story with one block appended to a chapter (the first by default). */
export function withBlock(block: StoryBlock, chapterIndex = 0, base: Story = story()): Story {
  base.chapters[chapterIndex].blocks.push(block);
  return base;
}

/** A valid import seed for a story at a version. */
export function seedFor(content: Story, version = 1, parentDocumentId: string | null = null): StoryDocumentSeed {
  return {
    id: storyDocumentId(content.slug, version),
    slug: content.slug,
    version,
    schemaVersion: STORY_SCHEMA_VERSION,
    workflowStatus: 'ready',
    content,
    contentSha256: contentSha256(content),
    sourceKind: 'import',
    sourceRef: `stories/${content.slug}.ts`,
    sourceCommit: 'abc1234',
    parentDocumentId,
  };
}
