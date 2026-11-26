import type { Story } from '@rcweston/story-core';

/**
 * Seed stories for the demo: the portfolio of Lena Ortiz, a made-up product
 * designer at Fieldnote Studio. Every company, person, number and quote here
 * is invented. Pictures are kept in the media store (see lib/seed-media.ts),
 * so the image library has them too: the wireframes in public/samples, and a
 * cover per story drawn in content/covers.ts.
 */

/** Where the story handlers serve a seeded picture. */
export const seedMedia = (slug: string, file: string) => `/api/story/media/stories/${slug}/${file}`;
const cover = (slug: string, alt: string): Story['hero'] => ({ kind: 'image', src: seedMedia(slug, 'cover.svg'), alt, aspect: 1.6 });

export const fieldNotes: Story = {
  slug: 'field-notes',
  company: 'Fieldnote Studio',
  title: 'Turning a pile of research notes into a weekly decision',
  thesis: 'As the only product designer, I replaced a quarterly research report with a fifteen-minute Friday decision, and the time from interview to roadmap change fell from about a month to six days.',
  period: '2025 to 2026',
  projectYear: '2025',
  status: 'Shipped',
  disclosure: 'Fictional company; every name and number is made up for this demo.',
  facts: [
    { id: 'role', label: 'Role', value: 'Product designer' },
    { id: 'team', label: 'Team', value: 'Research lead, PM, two engineers' },
    { id: 'timeline', label: 'Timeline', value: 'Ten weeks' },
    { id: 'scope', label: 'Scope', value: 'Research workflow' },
  ],
  hero: cover('field-notes', 'Handwritten note cards fanned across a warm desk.'),
  glance: {
    situation: 'Researchers ran about forty interviews a quarter, and two of them changed the roadmap.',
    task: 'Make what we heard each week change a decision that same week, without a new tool.',
    action: 'Replaced the quarterly report with a shared board, a Thursday sort and a fifteen-minute decision every Friday.',
    result: 'Roadmap changes traced to research rose from two a quarter to nine, and the wait fell from 31 days to six.',
  },
  outcomes: [
    { id: 'o1', value: '9', label: 'roadmap changes traced to research', baseline: 'from 2 a quarter', evidence: 'before-after', timeframe: 'first full quarter' },
    { id: 'o2', value: '6 days', label: 'from interview to decision', baseline: 'from about 31', evidence: 'observed' },
  ],
  counterfactual: 'Without the Friday decision, the board would have been one more place nobody checked.',
  chapters: [
    {
      key: 'situation',
      title: 'We learned plenty. We just learned it a month too late.',
      blocks: [
        { id: 's1', type: 'prose', paragraphs: [
          'Fieldnote makes scheduling software for small service businesses. Its three-person research team ran about forty customer interviews a quarter, and the findings were good. They arrived as a forty-page report in the last week of the quarter, after the next roadmap was already set.',
          'So by the time anyone read that a feature confused people, we had committed to building the next three on top of it. Each interview was also spread across **four different tools**: the recording in one, notes in two more, highlights in a spreadsheet. Even the researchers couldn\'t say which findings were new and which they\'d heard ten times.',
        ], large: [0] },
        { id: 's2', type: 'media', width: 'text', media: { kind: 'image', src: seedMedia('field-notes', 'tools-before.svg'), alt: 'Four app windows side by side: recordings, interview notes, team notes and a highlights sheet.', caption: 'Before: one interview, four places to look.', aspect: 1.6 } },
        { id: 's3', type: 'quote', quote: { quote: 'We were very good at learning things a month too late.', name: 'Ada Park', role: 'Research lead', context: 'At the kickoff, about the quarterly report.' } },
        { id: 's4', type: 'subhead', text: 'What it cost' },
        { id: 's5', type: 'prose', format: 'bullets', paragraphs: [
          'Two roadmap changes a quarter traced back to research.',
          'About 31 days from an interview to any decision it touched.',
          'Researchers spent the last two weeks of every quarter writing, not talking to customers.',
        ] },
      ],
    },
    {
      key: 'task',
      title: 'Make one decision a week, from what we heard that week.',
      blocks: [
        { id: 't1', type: 'prose', paragraphs: [
          'Jun, our PM, and I wrote the brief in one line: every Friday, one product decision, made in the open and linked to the notes behind it.',
          'Keeping it to one was the point. A backlog of insights asks someone to go and look. One decision with a date on it gets made.',
        ] },
        { id: 't2', type: 'callout', title: 'Constraints', tone: 'info', icon: 'info', body: { paragraphs: [
          'No new tool to learn. The board had to live where the notes already were.',
          'No new meeting for engineers. They could join on Friday, but never had to.',
          'Ten weeks to show it worked, before the next planning cycle.',
        ], format: 'bullets' } },
        { id: 't3', type: 'ledger', ledger: {
          led: ['The weekly loop and the Friday decision format', 'How notes are tagged and sorted'],
          made: ['Every board view and template', 'The decision log'],
          partners: [
            { role: 'Research', owned: 'Tagging and the Thursday sort' },
            { role: 'Product', owned: 'Running the Friday call' },
            { role: 'Engineering', owned: 'Importing notes from the call recorder' },
          ],
          notMe: ['The interview programme itself'],
        } },
      ],
    },
    {
      key: 'action',
      title: 'A board for the notes, and fifteen minutes on Friday.',
      blocks: [
        { id: 'a1', type: 'prose', paragraphs: [
          'I started by sitting in on six interviews and following each set of notes afterwards. Nothing was lost. It just never reached the people who could act on it. So the problem wasn\'t storage. It was the lack of a moment where someone had to decide.',
        ] },
        { id: 'a2', type: 'media', width: 'wide', media: { kind: 'image', src: seedMedia('field-notes', 'flow.svg'), alt: 'Four steps in a row: capture, sort, review, share.', caption: 'The weekly loop: capture on the day, sort on Thursday, decide on Friday, share the call.', aspect: 1.6 } },
        { id: 'a3', type: 'steps', items: [
          { title: 'Capture', body: 'Notes go on the board the same day, tagged by the question they answer.' },
          { title: 'Sort', body: 'On Thursday the researcher groups the week\'s notes and picks the strongest question.' },
          { title: 'Decide', body: 'On Friday, fifteen minutes, one call, written down with the notes behind it.' },
          { title: 'Share', body: 'The call goes in the decision log and in the team channel before lunch.' },
        ] },
        { id: 'a4', type: 'subhead', text: 'The calls that shaped it' },
        { id: 'a5', type: 'decision', call: 'One decision a week, not a backlog of insights.', over: 'An insight backlog the PM could pull from', because: 'A backlog asks someone to go and look. A weekly decision arrives on its own, with a date and an owner.', cost: 'Some good findings waited a week or two for their turn.', status: 'held', mine: 'Proposed it and designed the format' },
        { id: 'a6', type: 'decision', call: 'Tag notes by the question they answer, not by feature.', context: 'We started with eight questions and cut to five after week three. Eight was too many to sort in an hour.', over: 'Feature tags, which matched the roadmap', because: 'Feature tags sorted notes into things we had already decided to build. Question tags showed what we still didn\'t know.', cost: 'The first month of notes had to be retagged by hand.', status: 'revised', mine: 'Designed the tags; research owned the list' },
        { id: 'a7', type: 'gallery', layout: 'horizontal', columns: 'two', items: [
          { kind: 'image', src: seedMedia('field-notes', 'board.svg'), alt: 'A four-column board of note cards.', heading: 'The board', aspect: 1.6 },
          { kind: 'image', src: seedMedia('field-notes', 'mobile.svg'), alt: 'A phone showing a list of five notes.', heading: 'Capture on a phone', aspect: 1.6 },
        ], caption: 'Researchers add notes from a phone straight after a call; the board sorts them by question.' },
        { id: 'a8', type: 'insight', label: 'What changed my mind', title: 'The team didn\'t need more research. It needed a moment to use it.', columns: [
          { id: 'a8a', label: 'What we saw', body: { paragraphs: ['In week two, the Friday call made a decision in eleven minutes that two quarterly reports had already flagged.'] } },
          { id: 'a8b', label: 'What it meant', body: { paragraphs: ['The findings had always been good enough. What was missing was a time and a place where someone had to decide.'] } },
          { id: 'a8c', label: 'The catch', highlight: true, body: { paragraphs: ['When one Friday was skipped, the next week\'s notes piled up and the habit nearly broke. We moved the call to a slot nobody could book over.'] } },
        ] },
        { id: 'a9', type: 'note', text: 'The Friday call was open to anyone. Five people came on an average week.' },
      ],
    },
    {
      key: 'result',
      title: 'Research started showing up in the roadmap.',
      blocks: [
        { id: 'r1', type: 'outcomes', layout: 'lead', items: [
          { id: 'r1a', value: '9', label: 'roadmap changes traced to research', baseline: 'from 2 a quarter', evidence: 'before-after', timeframe: 'first full quarter' },
          { id: 'r1b', value: '6 days', label: 'from interview to decision', baseline: 'from about 31', evidence: 'observed', note: 'The baseline is an estimate from 20 interviews in the quarter before.' },
          { id: 'r1c', value: '15 min', label: 'for the Friday decision', evidence: 'observed' },
        ] },
        { id: 'r2', type: 'prose', paragraphs: [
          'The biggest change came in week four. We dropped a reporting tab three weeks before it went into build, after four customers in a row said they would never open it. That freed most of a sprint for invoice status on the day view, which customers had asked for in nine interviews.',
        ] },
        { id: 'r3', type: 'media', width: 'wide', media: { kind: 'image', src: seedMedia('field-notes', 'decision-log.svg'), alt: 'A list of five weekly decisions, each with a date and the number of notes behind it.', caption: 'The decision log: every Friday call, with the notes that led to it.', aspect: 1.6 } },
        { id: 'r4', type: 'table', caption: 'Per quarter, before and after.', rows: [
          ['', 'Before', 'After'],
          ['Interviews', '40', '38'],
          ['Decisions traced to research', '2', '9'],
          ['Days from interview to decision', '31', '6'],
          ['Researcher days spent on the report', '10', '2'],
        ] },
        { id: 'r5', type: 'callout', title: 'Still running', tone: 'success', icon: 'check', body: { paragraphs: ['A year on, the Friday call still happens. The quarterly report became a two-page summary that takes two days to write instead of two weeks.'] } },
      ],
    },
  ],
  decisions: {
    title: 'More on the calls',
    intro: 'Two questions people asked when I showed this work.',
    items: [
      { id: 'd1', title: 'Why Friday?', detail: 'Interviews clustered early in the week, so by Friday there was a full week of notes and the researcher had Thursday to sort them. Decisions made on Friday could go into Monday\'s planning.' },
      { id: 'd2', title: 'Why not buy a research repository?', detail: 'We trialled one. It stored notes well, but nobody opened it unless they were already looking for something. The gap was the habit, not the storage.' },
    ],
  },
  hindsight: { title: 'What I\'d do differently', paragraphs: [
    'I\'d invite engineering to the Friday call from the first week, not the fifth. Their questions made the decisions sharper, and they would have trusted the board sooner.',
    'I\'d also measure the wait before we started, rather than rebuild it from old tickets afterwards.',
  ] },
  credits: [
    { id: 'c1', name: 'Ada Park', role: 'Research lead' },
    { id: 'c2', name: 'Jun Ito', role: 'Product manager' },
    { id: 'c3', name: 'Sam Rivera', role: 'Engineering' },
  ],
  related: ['quiet-onboarding'],
  summary: 'How a fifteen-minute Friday decision made research change the roadmap.',
};

export const quietOnboarding: Story = {
  slug: 'quiet-onboarding',
  company: 'Fieldnote Studio',
  title: 'An onboarding that gets out of the way',
  thesis: 'As the designer on growth, I replaced a seven-step tour with one useful first task, and more new teams came back in their second week.',
  period: '2026',
  projectYear: '2026',
  status: 'Beta',
  disclosure: 'Fictional company; every number is made up for this demo.',
  facts: [
    { id: 'role', label: 'Role', value: 'Designer, growth' },
    { id: 'timeline', label: 'Timeline', value: 'Six weeks' },
  ],
  hero: { kind: 'image', src: seedMedia('field-notes', 'mobile.svg'), alt: 'A phone showing a short list of notes.', aspect: 1.6 },
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
  summary: 'Replacing a seven-step tour with one real first task.',
};

/** A draft that was never published, so the editor has an unfinished story to open. */
export const draftOnly: Story = {
  slug: 'pricing-page',
  company: 'Fieldnote Studio',
  title: 'A pricing page people can read',
  thesis: '',
  hero: cover('pricing-page', 'Three price cards standing on folded paper.'),
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

export const transitMap: Story = {
  slug: 'transit-map',
  company: 'Tidewater Transit',
  title: 'A route map you can read from the platform',
  thesis: 'As the lead designer on a three-month contract, I redrew a regional bus map around the questions riders ask on the platform, and wrong-bus complaints fell by more than half.',
  period: '2024',
  projectYear: '2024',
  status: 'Shipped',
  disclosure: 'Fictional client; every name and number is made up for this demo.',
  facts: [
    { id: 'role', label: 'Role', value: 'Lead designer' },
    { id: 'team', label: 'Team', value: 'Planner, cartographer, two drivers as advisers' },
    { id: 'timeline', label: 'Timeline', value: 'Twelve weeks' },
    { id: 'scope', label: 'Scope', value: 'Print map, stop signs, web map' },
  ],
  hero: cover('transit-map', 'A transit route diagram drawn on drafting paper.'),
  glance: {
    situation: 'The old map showed every street, and riders still boarded the wrong bus.',
    task: 'Answer the platform question, "does this bus go where I need?", in five seconds.',
    action: 'Cut the streets, drew the routes as lines, and put the same diagram on every stop.',
    result: 'Wrong-bus complaints fell from 41 a month to 17 in the first quarter.',
  },
  outcomes: [
    { id: 'o1', value: '−58%', label: 'wrong-bus complaints', baseline: 'from 41 a month', evidence: 'before-after', timeframe: 'first quarter' },
  ],
  chapters: [
    { key: 'situation', title: 'A street map that answered the wrong question.', blocks: [
      { id: 'tm1', type: 'prose', paragraphs: [
        'The map in every shelter was a street map with the routes drawn over it. It was accurate, and riders still could not tell which of three buses at a stop would take them to the hospital.',
        'Drivers told us the same story: the question at the door was never "where is this street?" It was "do you go past the market?"',
      ] },
      { id: 'tm2', type: 'quote', quote: { quote: 'I answer the same four questions all day, and none of them are about streets.', name: 'Sam Rivera', role: 'Driver adviser', context: 'On a ride-along in week one.' } },
    ] },
    { key: 'task', title: 'Five seconds, from the platform.', blocks: [
      { id: 'tm3', type: 'prose', format: 'bullets', paragraphs: ['Readable from two metres away.', 'The same diagram on the map, the stop sign and the web.', 'No street names unless a stop is named after one.'] },
    ] },
    { key: 'action', title: 'Lines, not streets.', blocks: [
      { id: 'tm4', type: 'prose', paragraphs: ['We kept only what a rider needs at the stop: the routes as straight lines at three angles, the stops where they cross, and the places people go.'] },
      { id: 'tm5', type: 'decision', call: 'Name stops after destinations, not cross streets.', over: 'Cross-street names, which the schedules already used', because: 'Riders asked for the market, the hospital and the library, never for an intersection.', cost: 'Two stops needed new signs before launch.', status: 'held', mine: 'Proposed it and tested it with riders' },
      { id: 'tm6', type: 'table', caption: 'Five-second test, before and after (made-up numbers).', rows: [
        ['', 'Old map', 'New map'],
        ['Found the right route', '9 of 20', '18 of 20'],
        ['Median time', '14 s', '4 s'],
      ] },
    ] },
    { key: 'result', title: 'Fewer riders on the wrong bus.', blocks: [
      { id: 'tm7', type: 'outcomes', layout: 'even', items: [
        { id: 'tm7a', value: '−58%', label: 'wrong-bus complaints', baseline: 'from 41 a month', evidence: 'before-after', timeframe: 'first quarter' },
        { id: 'tm7b', value: '4 s', label: 'to find a route in testing', baseline: 'from 14 s', evidence: 'observed' },
      ] },
    ] },
  ],
  credits: [
    { id: 'c1', name: 'Sam Rivera', role: 'Driver adviser' },
    { id: 'c2', name: 'Ada Park', role: 'Rider research' },
  ],
  related: ['field-notes'],
  summary: 'Redrawing a bus map around the questions riders ask on the platform.',
};

export const clinicBooking: Story = {
  slug: 'clinic-booking',
  company: 'Harbor Lane Clinics',
  title: 'Booking a clinic visit in under a minute',
  thesis: 'As the product designer, I cut the online booking flow from nine screens to three, and more patients booked without calling.',
  period: '2023',
  projectYear: '2023',
  status: 'Shipped',
  disclosure: 'Fictional client; every name and number is made up for this demo.',
  facts: [
    { id: 'role', label: 'Role', value: 'Product designer' },
    { id: 'timeline', label: 'Timeline', value: 'Eight weeks' },
  ],
  hero: cover('clinic-booking', 'A paper week planner with five appointments marked.'),
  glance: {
    situation: 'Most patients gave up online and phoned instead.',
    task: 'Let a patient book a routine visit without help.',
    action: 'Asked for the time first and the details last, on three screens.',
    result: 'Online bookings rose from 22% to 48% of all visits.',
  },
  chapters: [
    { key: 'situation', title: 'Nine screens before a time.', blocks: [
      { id: 'cb1', type: 'prose', paragraphs: ['The form asked for insurance, history and a reason for the visit before it showed a single free slot.'] },
    ] },
    { key: 'task', title: 'Show the time first.', blocks: [
      { id: 'cb2', type: 'prose', paragraphs: ['Patients book around their week. The time decides everything else, so it had to come first.'] },
    ] },
    { key: 'action', title: 'Three screens.', blocks: [
      { id: 'cb3', type: 'steps', items: [
        { title: 'Pick a time', body: 'The next free slots near you, a week at a glance.' },
        { title: 'Say who it is for', body: 'Your name and date of birth, or someone in your family.' },
        { title: 'Confirm', body: 'Everything else can wait for the front desk.' },
      ] },
    ] },
    { key: 'result', title: 'Half of visits booked online.', blocks: [
      { id: 'cb4', type: 'outcomes', layout: 'even', items: [
        { id: 'cb4a', value: '48%', label: 'of visits booked online', baseline: 'from 22%', evidence: 'before-after', timeframe: 'six months' },
      ] },
    ] },
  ],
  summary: 'Cutting a nine-screen booking flow to three.',
};

/** The published version adds a chapter of results; the draft was restored from before it, so the editor shows the update to review. */
export const buttonAudit: Story = {
  slug: 'button-audit',
  company: 'Fieldnote Studio',
  title: 'Forty buttons down to four',
  thesis: 'As the designer who owned the component library, I audited every button in the product and replaced forty variants with four, and new screens shipped faster.',
  period: '2025',
  projectYear: '2025',
  status: 'Shipped',
  disclosure: 'Fictional company; every number is made up for this demo.',
  facts: [
    { id: 'role', label: 'Role', value: 'Design systems' },
    { id: 'timeline', label: 'Timeline', value: 'Five weeks' },
  ],
  hero: cover('button-audit', 'Rows of button shapes sorted on a light table.'),
  glance: {
    situation: 'The product had forty kinds of button, and nobody knew which to use.',
    task: 'Leave one obvious choice for every job a button does.',
    action: 'Screenshotted every button, sorted them by job, and kept four.',
    result: 'Review comments about buttons dropped to almost none.',
  },
  chapters: [
    { key: 'situation', title: 'Forty ways to say "save".', blocks: [
      { id: 'ba1', type: 'prose', paragraphs: ['Every team had added the button it needed. After four years there were forty, in eleven sizes.'] },
      { id: 'ba2', type: 'gallery', layout: 'horizontal', columns: 'two', items: [
        { kind: 'image', src: seedMedia('button-audit', 'dashboard.svg'), alt: 'A wireframe dashboard with three counters and a bar chart.', heading: 'Where most of them lived', aspect: 1.6 },
        { kind: 'image', src: seedMedia('button-audit', 'board.svg'), alt: 'A four-column board of screenshots sorted by job.', heading: 'The sort', aspect: 1.6 },
      ], caption: 'Every button, screenshotted and sorted by the job it does.' },
    ] },
    { key: 'task', title: 'One choice per job.', blocks: [
      { id: 'ba3', type: 'prose', paragraphs: ['A designer should never have to pick between two buttons that do the same thing.'] },
    ] },
    { key: 'action', title: 'Sort by job, keep four.', blocks: [
      { id: 'ba4', type: 'code', code: 'primary   — the one thing this screen is for\nsecondary — everything else you can do here\nquiet     — actions in a list or a toolbar\ndanger    — anything you can’t take back', caption: 'The four that stayed.' },
    ] },
    { key: 'result', title: 'Faster screens, quieter reviews.', blocks: [
      { id: 'ba5', type: 'prose', paragraphs: ['New screens stopped arguing about buttons. The rest of the library followed the same sort the next quarter.'] },
    ] },
  ],
  summary: 'Auditing forty button variants down to four.',
};

/** What the published version adds over the first draft. */
export const buttonAuditPublished: Story = {
  ...buttonAudit,
  outcomes: [
    { id: 'o1', value: '4', label: 'button variants', baseline: 'from 40', evidence: 'observed' },
  ],
  chapters: buttonAudit.chapters.map((chapter) => chapter.key !== 'result' ? chapter : {
    ...chapter,
    blocks: [
      ...chapter.blocks,
      { id: 'ba6', type: 'outcomes', layout: 'even', items: [
        { id: 'ba6a', value: '4', label: 'button variants left', baseline: 'from 40', evidence: 'observed' },
        { id: 'ba6b', value: '−80%', label: 'review comments about buttons', baseline: 'over a quarter', evidence: 'before-after' },
      ] },
    ],
  }),
};

/** The draft restored from before the published version, with an edit of its own. */
export const buttonAuditRestored: Story = {
  ...buttonAudit,
  title: 'Forty buttons, down to four',
};

/** A draft that was never published. */
export const archiveSearch: Story = {
  slug: 'archive-search',
  company: 'Northfold Library',
  title: 'Search that finds the letter, not the folder',
  thesis: '',
  projectYear: '2026',
  facts: [],
  hero: cover('archive-search', 'Archive shelves lined with boxes and bound spines.'),
  glance: { situation: 'Researchers found the right box, then searched it by hand.', task: '', action: '', result: '' },
  chapters: [
    { key: 'situation', title: 'The catalogue stopped at the box.', blocks: [
      { id: 'as1', type: 'prose', paragraphs: ['Draft: write up the three visits to the reading room first.'] },
    ] },
    { key: 'task', title: '', blocks: [] },
    { key: 'action', title: '', blocks: [] },
    { key: 'result', title: '', blocks: [] },
  ],
};

/**
 * What the demo saves on first run:
 * - `published`: published as they are;
 * - `drafts`: saved, never published;
 * - `drift`: published, then a draft restored from before the publish;
 * - `order`: the Work order; `hidden`: published but left off Work.
 */
export const seed = {
  published: [fieldNotes, transitMap, quietOnboarding, clinicBooking],
  drafts: [draftOnly, archiveSearch],
  drift: { first: buttonAudit, published: buttonAuditPublished, restored: buttonAuditRestored },
  order: ['field-notes', 'transit-map', 'button-audit', 'quiet-onboarding', 'clinic-booking'],
  hidden: ['clinic-booking'],
};

/** The pictures each story keeps in the media store. Covers are drawn in content/covers.ts; the rest are files in public/samples. */
export const seedFiles: Record<string, string[]> = {
  'field-notes': ['tools-before.svg', 'flow.svg', 'board.svg', 'mobile.svg', 'decision-log.svg'],
  'button-audit': ['dashboard.svg', 'board.svg'],
};
