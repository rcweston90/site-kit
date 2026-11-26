import type { CommunityContent } from '@rcweston/site-data/client';

/**
 * The community page's shipped copy: what /community shows until someone
 * saves an edit in Admin → Community. Lena Ortiz, the events, the podcasts
 * and the groups are made up for the demo; every link is a reserved example
 * address. The last talk is hidden, as a draft would be: the admin lists it,
 * the page leaves it off.
 */
export const COMMUNITY: CommunityContent = {
  title: 'Community',
  summary: 'Mentoring designers in research and product, recorded talks on decision-making, and the [Lisbon groups](#events-heading) I show up for.',
  contactLabel: 'Email me',
  contactHref: 'mailto:hello@example.com',
  mentoring: {
    heading: 'Mentoring',
    intro: 'Free 30-minute calls for designers early in research or product roles.',
    bookingLabel: 'Book a call',
    bookingHref: 'https://example.com/book',
    bookingNote: 'Two slots a week, booked through **Fieldnote Office Hours**.',
    pitch: 'Bring the decision you are stuck on, not your portfolio. We will find the smallest next step together.',
    body: [
      'Most calls are about the work around the screen: how to run a study with no budget, how to write a brief a team will read, how to say no to a feature without losing the room.',
      'I also review case studies, but only for what they claim. If a study says the redesign worked, we look for the evidence together.',
    ],
    topicsHeading: 'Ask me about',
    topics: [
      'Running research on a small team',
      'Writing briefs and decision logs',
      'Moving from visual to product design',
      'Service maps and journey work',
      'Measuring a change after launch',
      'Interview loops and portfolios',
      'Plain-language UI writing',
      'Working with engineers early',
    ],
    history: 'I have mentored since 2019, first through the [Northfold Library](https://example.com/library) volunteer program.',
  },
  speaking: {
    heading: 'Speaking',
    intro: 'Recorded talks, panels and podcasts, newest first.',
    talks: [
      { date: '2026-05-14', title: 'One decision with a date', venue: 'Harbor Design Week', description: 'Why decision logs beat insight decks, with three examples from small research teams.', kind: 'Talk', action: 'Watch', minutes: 28, href: 'https://example.com/talks/decision-date' },
      { date: '2025-10-02', title: 'Maps people read in five seconds', venue: 'The Wayfinding Hour', description: '', kind: 'Podcast', action: 'Listen', minutes: 46, href: 'https://example.com/podcasts/maps' },
      { date: '2025-03-20', title: 'Research with no budget', venue: 'Northfold Talks', description: 'A panel on guerrilla research, recruiting and consent.', kind: 'Panel', action: 'Watch', minutes: 52, href: 'https://example.com/talks/no-budget' },
      { date: '2024-06-11', title: 'Plain words are a feature', venue: 'Tidewater Product Night', description: '', kind: 'Talk', action: 'Watch', minutes: 19, href: 'https://example.com/talks/plain-words' },
      { date: '2026-11-30', title: 'Measuring the wait (draft)', venue: 'Lisbon Research Circle', description: 'Not recorded yet: kept hidden until the video is up.', kind: 'Talk', action: 'Watch', minutes: null, href: 'https://example.com/talks/measuring-the-wait', hidden: true },
    ],
  },
  events: {
    heading: 'Events',
    intro: 'Groups in Lisbon I help run or turn up to most months.',
    groups: [
      { name: 'Lisbon Research Circle', about: 'Monthly show-and-tell for researchers and designers.', href: 'https://example.com/research-circle', action: 'Events' },
      { name: 'Tidewater Product Night', about: 'Talks and open critique, every second Thursday.', href: 'https://example.com/product-night', action: 'Events' },
      { name: 'Northfold Talks', about: 'Recorded panels on public-service design.', href: 'https://example.com/northfold', action: 'Website' },
    ],
  },
};
