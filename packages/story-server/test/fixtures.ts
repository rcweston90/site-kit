/** Synthetic stories and media for the tests. Every name here is made up. */

import type { Story } from '@rcweston/story-core';

export function sampleStory(slug: string, overrides: Partial<Story> = {}): Story {
  return {
    slug,
    company: 'Fieldnote Studio',
    title: 'A field guide that learned to listen',
    thesis: 'As the design lead, I rebuilt the guide around questions readers asked, which halved support tickets.',
    period: '2025',
    facts: [
      { label: 'Role', value: 'Design lead' },
      { label: 'Team', value: 'Ada Park, Theo Lund' },
    ],
    glance: {
      situation: 'Readers could not find answers in the guide.',
      task: 'Make the guide answer the questions people bring to it.',
      action: 'Reorganised every page around a reader question.',
      result: 'Support tickets fell by half in a quarter.',
    },
    chapters: [
      { key: 'situation', title: 'Readers were lost in the guide.', blocks: [{ id: 'b1', type: 'prose', paragraphs: ['The guide had grown one page at a time.'] }] },
      { key: 'task', title: 'Answer the question on the page.', blocks: [{ id: 'b2', type: 'prose', paragraphs: ['Every page needed a question it answered.'] }] },
      { key: 'action', title: 'We rewrote it around questions.', blocks: [{ id: 'b3', type: 'prose', paragraphs: ['We sorted a year of tickets into questions.'] }] },
      { key: 'result', title: 'Fewer people needed to ask.', blocks: [{ id: 'b4', type: 'prose', paragraphs: ['Tickets fell by half.'] }] },
    ],
    ...overrides,
  };
}

/** A story whose chapter titles differ, so two versions don't share content. */
export function editedStory(slug: string, note: string, overrides: Partial<Story> = {}): Story {
  const story = sampleStory(slug, overrides);
  return { ...story, thesis: `${story.thesis} (${note})` };
}

const PNG_HEAD = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Bytes that start like a PNG. Not a real image, but every byte check here reads only the head. */
export function pngBytes(length = 64, fill = 7): Uint8Array {
  const bytes = new Uint8Array(length).fill(fill);
  bytes.set(PNG_HEAD);
  return bytes;
}

export function pdfBytes(length = 64): Uint8Array {
  const bytes = new Uint8Array(length).fill(0x20);
  bytes.set(new TextEncoder().encode('%PDF-1.7\n'));
  return bytes;
}

export function file(bytes: Uint8Array, name: string, type: string): File {
  return new File([bytes as Uint8Array<ArrayBuffer>], name, { type });
}
