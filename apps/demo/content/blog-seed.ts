import type { BlogPostContent, BlogSeed } from '@rcweston/site-data';

/*
 * The demo's posts, written once into an empty store. All of it is made up:
 * Lena Ortiz writes about the practice at Fieldnote Studio. Covers are the
 * generated sample drawings in public/samples.
 *
 * - Three are live; one of them was edited from an older draft after it went
 *   live, so its editor shows "The published version has updates…".
 * - Two are drafts nobody has seen.
 * - One was published and then taken down: it keeps its history, readers see nothing.
 */

const post = (content: Partial<BlogPostContent> & Pick<BlogPostContent, 'title' | 'html'>): BlogPostContent => ({
  description: '',
  tags: [],
  imageUrl: '',
  ...content,
});

const card = (kind: 'case-study' | 'post', id: string | number) => `<blog-related-tile data-kind="${kind}" data-id="${id}"></blog-related-tile>`;
const callout = (tone: 'neutral' | 'info' | 'success' | 'warning', html: string) => `<aside data-blog-callout="${tone}">${html}</aside>`;
const button = (label: string, href: string) => `<p data-blog-cta=""><a href="${href}" data-cms-cta="">${label}</a></p>`;

const travelFirst = post({
  title: 'Field notes that travel',
  description: 'How a small studio keeps research usable after the project that paid for it ends.',
  tags: ['research', 'process'],
  imageUrl: '/samples/board.svg',
  html: [
    '<p data-large="true">Most research dies in a slide deck. The notes that survive are the ones written for someone who wasn’t in the room.</p>',
    '<p>At Fieldnote Studio we keep one page per conversation. It has three parts: what the person was trying to do, where it went wrong, and the exact words they used. Nothing else.</p>',
    '<h2>Write for the next reader</h2>',
    '<p>The next reader is usually you, six months later, with no memory of the call. Write the date, who spoke, and what you were testing at the top. A note without its question is a quote without a source.</p>',
    callout('info', '<p><strong>Try this:</strong> before you close a note, read only its first line. If it doesn’t say what you learned, rewrite it until it does.</p>'),
    '<h2>Keep the words</h2>',
    '<p>Paraphrase is where findings drift. When Jun Ito said a form “felt like a test I hadn’t studied for”, that sentence did more in the review than any chart.</p>',
    '<ul><li><p>Quote, then summarise.</p></li><li><p>Mark what you inferred with <em>I think</em>.</p></li><li><p>Link the recording, never paste it.</p></li></ul>',
    card('case-study', 'field-notes'),
  ].join(''),
});

const travelLive = post({
  ...travelFirst,
  description: 'How a small studio keeps research usable after the project that paid for it ends, and what we cut to get there.',
  html: travelFirst.html.replace(
    '<h2>Keep the words</h2>',
    '<p>We also stopped tagging notes by project. Tags by question (“why do people abandon the second step?”) outlive the project, and the next team can find them.</p><h2>Keep the words</h2>',
  ) + button('Read the field notes case study', '/stories/field-notes'),
});

// A draft brought back from before the live version, with an edit of its own.
const travelRestored = post({
  ...travelFirst,
  title: 'Field notes that travel well',
});

const summaries = post({
  title: 'Research summaries people finish',
  description: 'One page, five headings, and a rule about adjectives.',
  tags: ['writing', 'research'],
  imageUrl: '/samples/decision-log.svg',
  html: [
    '<p>A summary is finished when the reader can act on it without asking you a question. Ours fit on one page and always use the same five headings, so readers know where to look.</p>',
    '<ol><li><p>What we asked</p></li><li><p>Who we asked</p></li><li><p>What we heard</p></li><li><p>What we think it means</p></li><li><p>What we’d do next</p></li></ol>',
    callout('warning', '<p>No adjectives in “What we heard”. “Users loved it” is an opinion; “four of six finished without help” is a finding.</p>'),
    '<p>Sam Rivera reads every summary before it goes out and deletes one sentence. It is almost always the best-sounding one.</p>',
    card('post', 1),
    button('Download the summary template', '/samples/decision-log.svg'),
  ].join(''),
});

const sketching = post({
  title: 'A week of sketching with Ada Park',
  description: 'What changed when the whole team drew the flow before anyone opened a design tool.',
  tags: ['workshops'],
  imageUrl: '/samples/flow.svg',
  html: [
    '<p>Ada Park ran our planning week with a rule: no screens until Thursday. Everyone drew the flow on paper, one step per card, and we argued about the cards instead of the pixels.</p>',
    '<h2>What we noticed</h2>',
    '<p>The arguments were shorter. A card is cheap, so nobody defended one for long. By Wednesday the flow had lost three steps that would have taken a week to design and a month to remove.</p>',
    '<blockquote><p>“Draw it badly first. Bad drawings are honest about what you don’t know yet.”</p></blockquote>',
    card('case-study', 'transit-map'),
  ].join(''),
});

const quietDefaults = post({
  title: 'Small tools, quiet defaults',
  description: 'A draft on choosing defaults that nobody has to notice.',
  tags: ['design'],
  html: [
    '<p>The best default is the one nobody changes because nobody needs to. This is a draft about how we test that.</p>',
    callout('neutral', '<p>To do: add the two examples from the clinic booking work.</p>'),
  ].join(''),
});

const naming = post({
  title: 'Notes on naming things',
  description: '',
  tags: [],
  html: '<p>Start with the verb the person would use. Then remove every word that only the team understands.</p>',
});

const update = post({
  title: 'Studio update: spring',
  description: 'An older note about who joined and what we were working on.',
  tags: ['studio'],
  imageUrl: '/samples/dashboard.svg',
  html: '<p>Jun Ito joined to lead research operations, and we moved the studio library onto shelves people can actually reach.</p>',
});

export const blogSeed: BlogSeed[] = [
  { slug: 'field-notes-that-travel', createdAt: '2026-02-10T09:00:00.000Z', versions: [travelFirst, travelLive, travelRestored], published: 1, restoredFrom: 0 },
  { slug: 'research-summaries-people-finish', createdAt: '2026-03-04T09:00:00.000Z', versions: [summaries], published: 0 },
  { slug: 'a-week-of-sketching', createdAt: '2026-04-15T09:00:00.000Z', versions: [sketching], published: 0 },
  { slug: 'small-tools-quiet-defaults', createdAt: '2026-05-02T09:00:00.000Z', versions: [quietDefaults], published: null },
  { slug: 'notes-on-naming-things', createdAt: '2026-05-20T09:00:00.000Z', versions: [naming], published: null },
  { slug: 'studio-update-spring', createdAt: '2025-04-01T09:00:00.000Z', versions: [update], published: 0, hidden: true },
];
