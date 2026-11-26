/**
 * The community page: mentoring, recorded talks and the groups you show up
 * for. Browser-safe: the admin editor imports the types and the normaliser
 * from here, so this file must never reach a store.
 */

/** A recorded talk. The page shows the year, the title, `kind · venue`, and
 *  `action · minutes min` on the right. */
export interface CommunityTalk {
  /** ISO date it aired (YYYY-MM-DD); the page shows the year. */
  date: string;
  title: string;
  venue: string;
  /** Optional one-line summary shown beneath the format and venue. */
  description: string;
  /** Podcast, Talk, Panel, Seminar… — free text so a new format needs no deploy. */
  kind: string;
  /** What following the link does — the recording is the destination ("Watch", "Listen"). */
  action: string;
  /** Running time; null leaves the " · N min" off. */
  minutes: number | null;
  href: string;
  /** Kept in the admin, left off the page. An addition to the original, which hid a line by emptying it. */
  hidden?: boolean;
}

/** A community group the owner shows up for. */
export interface CommunityGroup {
  name: string;
  /** One line on what the group runs. */
  about: string;
  href: string;
  /** Names the destination: "Events" for an events calendar, "Website" for the group's own site. */
  action: string;
  /** Kept in the admin, left off the page. */
  hidden?: boolean;
}

/**
 * Everything a reader sees on the community page. Admin-editable (Admin →
 * Community); the host's `defaults` config is the shipped copy, used until
 * someone saves an edit.
 *
 * Prose fields (summary, intros, pitch, body, notes) accept the inline
 * `[label](url)` and `**bold**` markup that InlineRichText renders.
 * Row fields (talks, groups) are plain text: each row is already a link.
 */
export interface CommunityContent {
  title: string;
  summary: string;
  /** The header button. Empty label or href hides it. */
  contactLabel: string;
  contactHref: string;
  mentoring: {
    heading: string;
    intro: string;
    bookingLabel: string;
    bookingHref: string;
    bookingNote: string;
    pitch: string;
    /** Paragraphs under the pitch. */
    body: string[];
    topicsHeading: string;
    topics: string[];
    history: string;
  };
  speaking: { heading: string; intro: string; talks: CommunityTalk[] };
  events: { heading: string; intro: string; groups: CommunityGroup[] };
}

/** A page with every heading and nothing else, for a host that ships no copy. */
export const EMPTY_COMMUNITY: CommunityContent = {
  title: 'Community',
  summary: '',
  contactLabel: '',
  contactHref: '',
  mentoring: { heading: 'Mentoring', intro: '', bookingLabel: '', bookingHref: '', bookingNote: '', pitch: '', body: [], topicsHeading: 'Ask me about', topics: [], history: '' },
  speaking: { heading: 'Speaking', intro: '', talks: [] },
  events: { heading: 'Events', intro: '', groups: [] },
};

/** Schemes that can't execute script, matching InlineRichText's rule, so a
 *  pasted `javascript:` URL can't become a live link on the page. */
export function isSafeHref(href: string): boolean {
  return /^(https?:|mailto:|tel:|\/|#)/i.test(href);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A stored string as typed (trimmed); anything else falls back. Empty is
 *  kept: clearing an optional line is how an editor removes it. */
const text = (value: unknown, fallback: string) => (typeof value === 'string' ? value.trim() : fallback);
/** Headings and the title can't be empty — a section needs a name to be labelled by. */
const label = (value: unknown, fallback: string) => text(value, fallback) || fallback;
const lines = (value: unknown, fallback: string[]) =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string').map((v) => v.trim()).filter(Boolean) : fallback;

function talks(value: unknown, fallback: CommunityTalk[]): CommunityTalk[] {
  if (!Array.isArray(value)) return fallback;
  return value.filter(isRecord).map((t) => ({
    date: text(t.date, ''),
    title: text(t.title, ''),
    venue: text(t.venue, ''),
    description: text(t.description, ''),
    kind: text(t.kind, ''),
    action: text(t.action, ''),
    minutes: typeof t.minutes === 'number' && Number.isFinite(t.minutes) && t.minutes > 0 ? Math.round(t.minutes) : null,
    href: text(t.href, ''),
    ...(t.hidden === true ? { hidden: true } : {}),
  })).filter((t) => t.title && t.href);
}

function groups(value: unknown, fallback: CommunityGroup[]): CommunityGroup[] {
  if (!Array.isArray(value)) return fallback;
  return value.filter(isRecord).map((g) => ({
    name: text(g.name, ''),
    about: text(g.about, ''),
    href: text(g.href, ''),
    action: text(g.action, ''),
    ...(g.hidden === true ? { hidden: true } : {}),
  })).filter((g) => g.name && g.href);
}

/**
 * Stored (or submitted) JSON → a complete page, field by field. A missing or
 * mistyped field takes the fallback rather than failing the whole document,
 * so a bad save or an older row degrades to the shipped copy, never a blank
 * page. Rows without a title/name and a link are dropped.
 */
export function normalizeCommunity(raw: unknown, fallback: CommunityContent = EMPTY_COMMUNITY): CommunityContent {
  const r = isRecord(raw) ? raw : {};
  const m = isRecord(r.mentoring) ? r.mentoring : {};
  const s = isRecord(r.speaking) ? r.speaking : {};
  const e = isRecord(r.events) ? r.events : {};
  return {
    title: label(r.title, fallback.title),
    summary: text(r.summary, fallback.summary),
    contactLabel: text(r.contactLabel, fallback.contactLabel),
    contactHref: text(r.contactHref, fallback.contactHref),
    mentoring: {
      heading: label(m.heading, fallback.mentoring.heading),
      intro: text(m.intro, fallback.mentoring.intro),
      bookingLabel: text(m.bookingLabel, fallback.mentoring.bookingLabel),
      bookingHref: text(m.bookingHref, fallback.mentoring.bookingHref),
      bookingNote: text(m.bookingNote, fallback.mentoring.bookingNote),
      pitch: text(m.pitch, fallback.mentoring.pitch),
      body: lines(m.body, fallback.mentoring.body),
      topicsHeading: text(m.topicsHeading, fallback.mentoring.topicsHeading),
      topics: lines(m.topics, fallback.mentoring.topics),
      history: text(m.history, fallback.mentoring.history),
    },
    speaking: {
      heading: label(s.heading, fallback.speaking.heading),
      intro: text(s.intro, fallback.speaking.intro),
      talks: talks(s.talks, fallback.speaking.talks),
    },
    events: {
      heading: label(e.heading, fallback.events.heading),
      intro: text(e.intro, fallback.events.intro),
      groups: groups(e.groups, fallback.events.groups),
    },
  };
}

/** The page as visitors see it: hidden talks and groups left off. */
export function visibleCommunity(content: CommunityContent): CommunityContent {
  return {
    ...content,
    speaking: { ...content.speaking, talks: content.speaking.talks.filter((talk) => !talk.hidden) },
    events: { ...content.events, groups: content.events.groups.filter((group) => !group.hidden) },
  };
}

/** Every link on the page that isn't a safe scheme, named for the editor. */
export function unsafeCommunityLinks(content: CommunityContent): string[] {
  const links: [string, string][] = [
    ['Header button link', content.contactHref],
    ['Booking link', content.mentoring.bookingHref],
    ...content.speaking.talks.map((t, i): [string, string] => [`Talk ${i + 1} link`, t.href]),
    ...content.events.groups.map((g, i): [string, string] => [`Group ${i + 1} link`, g.href]),
  ];
  return links.filter(([, href]) => href && !isSafeHref(href)).map(([name]) => name);
}

export interface CommunityResponse {
  content: CommunityContent;
  defaults: CommunityContent;
  customized: boolean;
  /** 0 while the shipped copy shows. Send it back as `expectedVersion`. */
  version: number;
  updatedAt: string | null;
  /** Where the page is on the site. */
  path: string;
}

export interface CommunityConfig {
  /** The page's shipped copy and lists. */
  defaults: CommunityContent;
  /** Where the page lives, for revalidation and the admin's "View the page" link. Default `/community`. */
  path: string;
}

export function configureCommunity(config: Partial<CommunityConfig> | undefined): CommunityConfig {
  const path = config?.path ?? '/community';
  if (!/^\/[a-z0-9\-/]*$/.test(path)) throw new Error(`community: ${path} isn't a site path like /community.`);
  return { defaults: normalizeCommunity(config?.defaults ?? EMPTY_COMMUNITY, EMPTY_COMMUNITY), path };
}

/** The community module's route, relative to where site-data is mounted. */
export const communityPaths = {
  page: () => '/community',
};
