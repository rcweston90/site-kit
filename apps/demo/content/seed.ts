import type { Story } from '@rcweston/story-core';

/**
 * Seed stories for the demo. Every name, number and quote here is made up:
 * Fieldnote Studio and its people don't exist. Media are the neutral
 * wireframes in public/media.
 */

export const fieldNotes: Story = {
  slug: 'field-notes',
  company: 'Fieldnote Studio',
  title: 'Turning a pile of research notes into a weekly decision',
  thesis: 'As the product designer, I rebuilt how the team turns interviews into one shared decision each week, which cut the time from interview to roadmap change from a month to a week.',
  period: '2025 to 2026',
  status: 'Shipped',
  disclosure: 'Fictional company; every number is made up for this demo.',
  facts: [
    { id: 'role', label: 'Role', value: 'Product designer' },
    { id: 'team', label: 'Team', value: 'Two engineers, a researcher, a PM' },
    { id: 'timeline', label: 'Timeline', value: 'Ten weeks' },
  ],
  hero: {
    kind: 'image',
    src: '/samples/dashboard.svg',
    alt: 'A wireframe dashboard with three counters and a bar chart that rises week by week.',
    aspect: 1.6,
  },
  glance: {
    situation: 'Researchers held forty interviews a quarter, and almost none changed the roadmap.',
    task: 'Make research change decisions within the week it happens.',
    action: 'Replaced the quarterly report with a weekly board and one decision ritual.',
    result: 'Roadmap changes traced to research went from two a quarter to nine.',
  },
  outcomes: [
    { id: 'o1', value: '9', label: 'roadmap changes traced to research in a quarter', baseline: 'from 2', evidence: 'before-after', timeframe: 'first full quarter' },
    { id: 'o2', value: '1 week', label: 'from interview to decision', baseline: 'from about a month', evidence: 'observed' },
  ],
  counterfactual: 'Without the weekly ritual, the board would have been one more place nobody checked.',
  chapters: [
    {
      key: 'situation',
      title: 'Research was thorough, and nobody acted on it.',
      blocks: [
        { id: 's1', type: 'prose', paragraphs: [
          'Every quarter the research team wrote a careful report. By the time it was read, the decisions it could have changed were already made.',
          'Interviews lived in **four different tools**, so even the researchers couldn\'t say which findings were new.',
        ], large: [0] },
        { id: 's2', type: 'quote', quote: { quote: 'We were very good at learning things a month too late.', name: 'Ada Park', role: 'Research lead' } },
      ],
    },
    {
      key: 'task',
      title: 'Make one decision a week, from what we heard that week.',
      blocks: [
        { id: 't1', type: 'prose', paragraphs: [
          'The brief was small on purpose: one decision a week, made in the open, tied to the notes that justified it.',
        ] },
        { id: 't2', type: 'callout', title: 'Constraint', tone: 'info', icon: 'info', body: { paragraphs: ['No new tool for the team to learn. The board had to live where notes already were.'] } },
      ],
    },
    {
      key: 'action',
      title: 'A board for the notes, and a ritual for the decision.',
      blocks: [
        { id: 'a1', type: 'media', width: 'wide', media: { kind: 'image', src: '/samples/flow.svg', alt: 'Four steps in a row: capture, sort, review, share.', caption: 'The weekly loop, from capture to a shared decision.', aspect: 1.6 } },
        { id: 'a2', type: 'decision', call: 'One decision per week, not a backlog of insights.', over: 'An insight backlog the PM could pull from', because: 'A backlog asks someone to go and look. A weekly decision arrives on its own.', cost: 'Some good findings waited a week for their turn.', status: 'held' },
        { id: 'a3', type: 'steps', items: [
          { title: 'Capture', body: 'Notes go in the same day, tagged by question.' },
          { title: 'Sort', body: 'The researcher groups them on Thursday.' },
          { title: 'Decide', body: 'Friday, fifteen minutes, one call written down.' },
        ] },
        { id: 'a4', type: 'gallery', layout: 'horizontal', columns: 'two', items: [
          { kind: 'image', src: '/samples/board.svg', alt: 'A four-column board of note cards.', aspect: 1.6 },
          { kind: 'image', src: '/samples/mobile.svg', alt: 'A phone showing a list of five notes.', aspect: 1.6 },
        ], caption: 'The board on desktop, and capture on a phone.' },
      ],
    },
    {
      key: 'result',
      title: 'Research started showing up in the roadmap.',
      blocks: [
        { id: 'r1', type: 'outcomes', layout: 'lead', items: [
          { id: 'r1a', value: '9', label: 'roadmap changes traced to research', baseline: 'from 2 a quarter', evidence: 'before-after' },
          { id: 'r1b', value: '15 min', label: 'for the Friday decision', evidence: 'observed' },
        ] },
        { id: 'r2', type: 'table', caption: 'Before and after, per quarter.', rows: [
          ['', 'Before', 'After'],
          ['Interviews', '40', '38'],
          ['Decisions traced to research', '2', '9'],
          ['Days from interview to decision', '31', '6'],
        ] },
      ],
    },
  ],
  hindsight: { title: 'What I\'d do differently', paragraphs: ['I\'d have invited engineering to the Friday call from the first week, not the fifth.'] },
  credits: [
    { id: 'c1', name: 'Ada Park', role: 'Research lead' },
    { id: 'c2', name: 'Sam Rivera', role: 'Engineering' },
  ],
  related: ['quiet-onboarding'],
  summary: 'How a weekly ritual made research change the roadmap.',
};

export const quietOnboarding: Story = {
  slug: 'quiet-onboarding',
  company: 'Fieldnote Studio',
  title: 'An onboarding that gets out of the way',
  thesis: 'As the designer on growth, I replaced a seven-step tour with one useful first task, and more new teams came back in their second week.',
  period: '2026',
  status: 'Beta',
  disclosure: 'Fictional company; every number is made up for this demo.',
  facts: [
    { id: 'role', label: 'Role', value: 'Designer, growth' },
    { id: 'timeline', label: 'Timeline', value: 'Six weeks' },
  ],
  hero: { kind: 'image', src: '/samples/mobile.svg', alt: 'A phone showing a short list of notes.', aspect: 1.6 },
  glance: {
    situation: 'New teams finished the tour and never came back.',
    task: 'Get a new team to one useful result in its first session.',
    action: 'Cut the tour and started every team on a real first note.',
    result: 'Second-week return rose from 31% to 44% in the beta.',
  },
  chapters: [
    { key: 'situation', title: 'The tour taught the product, not the job.', blocks: [
      { id: 'q1', type: 'prose', paragraphs: ['Seven tooltips explained every panel. None of them helped anyone write their first note.'] },
    ] },
    { key: 'task', title: 'One useful result, in one session.', blocks: [
      { id: 'q2', type: 'prose', format: 'bullets', paragraphs: ['No tooltips before the first note.', 'A real example the team can edit, not a fake one to dismiss.', 'Everything else waits until it\'s needed.'] },
    ] },
    { key: 'action', title: 'Start with the work.', blocks: [
      { id: 'q3', type: 'code', code: 'first-session:\n  open: a note with today\'s date\n  suggest: "What did you hear this week?"\n  later: board, tags, sharing', caption: 'The whole onboarding, as the team wrote it down.' },
      { id: 'q4', type: 'custom', component: 'signup-funnel', title: 'Where new teams stopped', props: { steps: ['Sign up', 'First note', 'Second note', 'Came back'], before: [100, 54, 33, 31], after: [100, 81, 58, 44] } },
    ] },
    { key: 'result', title: 'More teams came back.', blocks: [
      { id: 'q5', type: 'outcomes', layout: 'even', items: [
        { id: 'q5a', value: '44%', label: 'returned in week two', baseline: 'from 31%', evidence: 'experiment', note: 'Beta cohort against a holdout, made-up numbers.' },
      ] },
    ] },
  ],
  related: ['field-notes'],
};

/** A draft that was never published, so the editor has an unfinished story to open. */
export const draftOnly: Story = {
  slug: 'pricing-page',
  company: 'Fieldnote Studio',
  title: 'A pricing page people can read',
  thesis: '',
  facts: [],
  glance: { situation: '', task: '', action: '', result: '' },
  chapters: [
    { key: 'situation', title: 'Nobody could tell which plan they needed.', blocks: [
      { id: 'p1', type: 'prose', paragraphs: ['Draft: start from the support tickets about plans.'] },
    ] },
    { key: 'task', title: '', blocks: [] },
    { key: 'action', title: '', blocks: [] },
    { key: 'result', title: '', blocks: [] },
  ],
};

/** Stories the demo publishes on first run, and one it leaves as a draft. */
export const seed = { published: [fieldNotes, quietOnboarding], drafts: [draftOnly] };
