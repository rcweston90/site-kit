import type { Story } from './types.js';
import type { SlugRedirect } from './contract.js';
import { contentSha256, storyDocumentId } from './identity.js';
import { SLUG_PATTERN, toSet } from './internal.js';

/*
 * Renaming a story's address (its slug), as pure functions: address rules and
 * plain-language messages shared by the editor and the server, the plan a
 * rename applies, and the redirect bookkeeping. Nothing here touches a
 * database or a runtime built-in, so an editor can import it to validate live.
 */

export const STORY_ADDRESS_MIN_LENGTH = 3;
export const STORY_ADDRESS_MAX_LENGTH = 80;

/**
 * Addresses no story takes by default: words a host is likely to route beside
 * its stories (`/stories/new`, `/stories/edit`), and keys an object registry
 * inherits. Extend it with `reservedStoryAddresses(...)` for your own routes.
 */
export const RESERVED_STORY_ADDRESSES: ReadonlySet<string> = new Set([
  'new', 'edit', 'admin', 'api', 'index', 'preview', 'draft', 'drafts',
  'media', 'static', 'constructor', 'prototype',
]);

/** The default reserved addresses plus your own route segments. */
export function reservedStoryAddresses(...extra: Iterable<string>[]): ReadonlySet<string> {
  const set = new Set(RESERVED_STORY_ADDRESSES);
  for (const list of extra) for (const slug of list) set.add(slug);
  return set;
}

export type StoryAddressProblem =
  | 'empty'
  | 'characters'
  | 'dashes'
  | 'too-short'
  | 'too-long'
  | 'unchanged'
  | 'reserved'
  | 'taken';

/** What the editor says about an address, in the author's words, not the database's. */
export const STORY_ADDRESS_MESSAGES: Record<StoryAddressProblem, string> = {
  empty: 'Enter an address.',
  characters: 'Use lowercase letters, numbers and dashes.',
  dashes: 'Start and end with a letter or number, with one dash between words.',
  'too-short': `Use at least ${STORY_ADDRESS_MIN_LENGTH} characters.`,
  'too-long': `Use ${STORY_ADDRESS_MAX_LENGTH} characters or fewer.`,
  unchanged: 'That’s the current address.',
  reserved: 'That address belongs to another page.',
  taken: 'That address is taken.',
};

export const RENAME_UNAVAILABLE_MESSAGES = {
  schema: 'Renaming needs a one-time storage update before it can be used.',
  environment: 'Addresses can only be changed on the server that stores your stories.',
} as const;

/** Forgiving input: capitals and spaces become what the address needs, and a
 *  pasted link or path keeps only its last segment. Anything else is left for
 *  validation to explain. */
export function formatStoryAddressInput(value: string): string {
  let text = value.trim();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text) || text.startsWith('/')) {
    const path = text.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, '').replace(/[?#].*$/, '');
    const segments = path.split('/').filter(Boolean);
    text = segments.length ? segments[segments.length - 1] : '';
  }
  return text.toLowerCase().replace(/\s+/g, '-');
}

/** A kebab-case address from a title: "Mapping the field notes" becomes
 *  "mapping-the-field-notes". Long titles are cut at a word break. */
export function suggestStoryAddress(title: string): string {
  const base = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (base.length <= STORY_ADDRESS_MAX_LENGTH) return base;
  const cut = base.slice(0, STORY_ADDRESS_MAX_LENGTH + 1);
  const wordBreak = cut.lastIndexOf('-');
  return (wordBreak >= STORY_ADDRESS_MIN_LENGTH ? cut.slice(0, wordBreak) : base.slice(0, STORY_ADDRESS_MAX_LENGTH))
    .replace(/-+$/, '');
}

export interface StoryAddressCheck {
  current: string;
  taken: Iterable<string>;
  /** Defaults to RESERVED_STORY_ADDRESSES. */
  reserved?: ReadonlySet<string>;
}

/** The first thing wrong with `candidate` as this story's new address, or null. */
export function storyAddressProblem(
  candidate: string,
  { current, taken, reserved = RESERVED_STORY_ADDRESSES }: StoryAddressCheck,
): StoryAddressProblem | null {
  if (!candidate) return 'empty';
  if (/[^a-z0-9-]/.test(candidate)) return 'characters';
  if (!SLUG_PATTERN.test(candidate)) return 'dashes';
  if (candidate === current) return 'unchanged';
  if (candidate.length < STORY_ADDRESS_MIN_LENGTH) return 'too-short';
  if (candidate.length > STORY_ADDRESS_MAX_LENGTH) return 'too-long';
  if (reserved.has(candidate)) return 'reserved';
  if (toSet(taken).has(candidate)) return 'taken';
  return null;
}

/** Every older address that now sends readers to `slug`. */
export function formerAddressesOf(slug: string, redirects: readonly SlugRedirect[]): string[] {
  return redirects.filter((redirect) => redirect.to === slug).map((redirect) => redirect.from);
}

export interface TakenStoryAddressSources {
  current: string;
  /** Slugs with saved versions. */
  documentSlugs: Iterable<string>;
  /** Slugs with a live publication. */
  publicationSlugs?: Iterable<string>;
  /** Slugs the host keeps its own record under (a listing card, a page). */
  hostSlugs?: Iterable<string>;
  /** Slugs of stories authored in code. */
  authoredSlugs?: Iterable<string>;
  redirects: readonly SlugRedirect[];
}

/**
 * Addresses already in use, for the editor's live check. A story's own former
 * addresses stay available to it (renaming back is allowed) unless a host
 * record or a live page has since claimed one.
 */
export function takenStoryAddresses({
  current,
  documentSlugs,
  publicationSlugs = [],
  hostSlugs = [],
  authoredSlugs = [],
  redirects,
}: TakenStoryAddressSources): string[] {
  const hosts = new Set(hostSlugs);
  const publications = new Set(publicationSlugs);
  const reclaimable = new Set(formerAddressesOf(current, redirects)
    .filter((slug) => !hosts.has(slug) && !publications.has(slug)));
  const taken = new Set([
    ...documentSlugs,
    ...hosts,
    ...publications,
    ...authoredSlugs,
    ...redirects.map((redirect) => redirect.from),
  ]);
  taken.delete(current);
  for (const slug of reclaimable) taken.delete(slug);
  return [...taken].sort();
}

/**
 * The redirect table after renaming `from` to `to`, kept flat: every address
 * that pointed at `from` now points straight at `to`, so resolving an old
 * address is one lookup and never a chain. Renaming back to a former address
 * retires that address's own redirect.
 */
export function collapseRedirects(existing: readonly SlugRedirect[], rename: SlugRedirect): SlugRedirect[] {
  const rows = new Map(existing.map((redirect) => [redirect.from, redirect.to]));
  rows.delete(rename.to);
  for (const [from, to] of rows) {
    if (to === rename.from) rows.set(from, rename.to);
  }
  rows.set(rename.from, rename.to);
  return [...rows].map(([from, to]) => ({ from, to })).sort((a, b) => a.from.localeCompare(b.from));
}

/** The authored story of an older address this story was renamed from,
 *  carrying the new slug. Authored stories are code and keep their original
 *  slug, so callers try the address's own first and fall back to this: a
 *  renamed story never loses its authored fallback. */
export function authoredStoryFromFormerAddress(
  slug: string,
  formerSlugs: readonly string[],
  lookup: (slug: string) => Story | undefined,
): Story | undefined {
  for (const former of formerSlugs) {
    const story = lookup(former);
    if (story) return { ...story, slug };
  }
  return undefined;
}

/**
 * Lookups that survive a rename. Code-keyed maps (authored stories, covers,
 * an ordering list) keep the slug a story was written under; these try the
 * current address first, then the addresses it was renamed from. With no
 * redirects every lookup is exactly the direct one.
 */
export function createAddressAliases(redirects: readonly SlugRedirect[]) {
  const former = new Map<string, string[]>();
  for (const redirect of redirects) former.set(redirect.to, [...(former.get(redirect.to) ?? []), redirect.from]);
  const formerOf = (slug: string): string[] => former.get(slug) ?? [];
  return {
    formerOf,
    /** The first value found under the address, else under a former one. */
    lookup<T>(slug: string, find: (slug: string) => T | undefined): T | undefined {
      for (const candidate of [slug, ...formerOf(slug)]) {
        const value = find(candidate);
        if (value !== undefined) return value;
      }
      return undefined;
    },
    /** An authored story for the address, carrying the address's own slug. */
    story(slug: string, find: (slug: string) => Story | undefined): Story | undefined {
      return find(slug) ?? authoredStoryFromFormerAddress(slug, formerOf(slug), find);
    },
    /** The slug a code-keyed list knows this address by. */
    knownAs(slug: string, known: ReadonlySet<string> | readonly string[]): string {
      const set = known instanceof Set ? known : new Set(known as readonly string[]);
      return [slug, ...formerOf(slug)].find((candidate) => set.has(candidate)) ?? slug;
    },
  };
}

export type StoryAddressAliases = ReturnType<typeof createAddressAliases>;

export type StoryRenameErrorCode = 'unavailable' | 'invalid' | 'address' | 'not-found' | 'moved' | 'stale';

/** A rename that didn't happen, with a message the editor can show as is. */
export class StoryRenameError extends Error {
  readonly code: StoryRenameErrorCode;
  readonly problem?: StoryAddressProblem;
  readonly movedTo?: string;

  constructor(code: StoryRenameErrorCode, message: string, extra: { problem?: StoryAddressProblem; movedTo?: string } = {}) {
    super(message);
    this.name = 'StoryRenameError';
    this.code = code;
    this.problem = extra.problem;
    this.movedTo = extra.movedTo;
  }
}

export const RENAME_ERROR_STATUS: Record<StoryRenameErrorCode, number> = {
  unavailable: 503,
  invalid: 400,
  address: 422,
  'not-found': 404,
  moved: 409,
  stale: 409,
};

export const RENAME_STALE_MESSAGE = 'This story changed somewhere else after you opened it. Reload, then change the address again.';
export const RENAME_MOVED_MESSAGE = 'This story already moved to a new address. Reload to keep editing.';
export const RENAME_NOT_FOUND_MESSAGE = 'There’s no story at this address.';

/** The `code` an HTTP body carries for a rename error: `RENAME_NOT_FOUND`, etc. */
export function renameErrorBodyCode(code: StoryRenameErrorCode): string {
  return `RENAME_${code.toUpperCase().replace(/-/g, '_')}`;
}

/** Everything a rename depends on, read inside the rename's transaction. */
export interface StoryRenameFacts {
  from: string;
  to: string;
  /** The newest version the editor had loaded; null when it had none. */
  expectedLatestDocumentId: string | null;
  latestDocument: { id: string; content: Story } | null;
  publishedDocument: { id: string; content: Story } | null;
  /** The authored story, used only when nothing has been saved yet. */
  authoredStory: Story | null;
  /** `from` is itself an old address: the story has already moved on. */
  fromRedirectsTo: string | null;
  /** The host keeps its own record (a card, a page) under `from`. */
  fromHasHostRecord: boolean;
  target: {
    /** Highest version already saved under `to` (0 when none). */
    maxVersion: number;
    hasHostRecord: boolean;
    hasPublication: boolean;
    hasAuthoredStory: boolean;
    /** `to` is an old address of some story. */
    redirectsTo: string | null;
  };
}

export interface StoryRenameDocumentPlan {
  id: string;
  version: number;
  content: Story;
  contentSha256: string;
  parentDocumentId: string | null;
  sourceKind: 'rename';
  sourceRef: string;
  sourceCommit: string;
}

export interface StoryRenamePlan {
  from: string;
  to: string;
  /** In insert order. Two when the live version is older than the latest
   *  draft: the live copy, then the draft that builds on it. */
  documents: StoryRenameDocumentPlan[];
  /** The document the new address publishes, when the old one was live. */
  publishDocumentId: string | null;
  removeOldPublication: boolean;
  /** Move the host's own record from `from` to `to`. */
  moveHostRecord: boolean;
  redirects: {
    /** `to` was one of this story's former addresses; its redirect retires. */
    retire: string | null;
    /** Rows that pointed at `from` now point at `to`. */
    repointFrom: string;
    add: SlugRedirect;
  };
}

export interface StoryRenameOptions {
  /** Defaults to contentSha256. */
  checksum?: (content: Story) => string;
  sourceCommit?: string;
  reserved?: ReadonlySet<string>;
}

/**
 * The rename as data. Old versions are never rewritten: the story continues
 * under the new address from copies of its latest draft (or authored story)
 * and, when it was live, of the live version too. So a rename never
 * publishes unpublished edits, and the live page never goes dark.
 */
export function planStoryRename(
  facts: StoryRenameFacts,
  { checksum = contentSha256, sourceCommit = '', reserved }: StoryRenameOptions = {},
): StoryRenamePlan {
  const { from, to, target } = facts;
  if (facts.fromRedirectsTo) {
    throw new StoryRenameError('moved', RENAME_MOVED_MESSAGE, { movedTo: facts.fromRedirectsTo });
  }
  const latestContent = facts.latestDocument?.content ?? facts.authoredStory;
  if (!latestContent) throw new StoryRenameError('not-found', RENAME_NOT_FOUND_MESSAGE);
  if ((facts.latestDocument?.id ?? null) !== facts.expectedLatestDocumentId) {
    throw new StoryRenameError('stale', RENAME_STALE_MESSAGE);
  }

  const reclaiming = target.redirectsTo === from && !target.hasHostRecord && !target.hasPublication;
  const taken = !reclaiming && (
    target.maxVersion > 0 || target.hasHostRecord || target.hasPublication || target.hasAuthoredStory || target.redirectsTo !== null
  );
  const problem = storyAddressProblem(to, { current: from, taken: taken ? [to] : [], reserved });
  if (problem) throw new StoryRenameError('address', STORY_ADDRESS_MESSAGES[problem], { problem });

  const documents: StoryRenameDocumentPlan[] = [];
  const append = (content: Story, parentDocumentId: string | null) => {
    const version = target.maxVersion + documents.length + 1;
    const moved: Story = { ...structuredClone(content), slug: to };
    const document: StoryRenameDocumentPlan = {
      id: storyDocumentId(to, version),
      version,
      content: moved,
      contentSha256: checksum(moved),
      parentDocumentId,
      sourceKind: 'rename',
      sourceRef: from,
      sourceCommit,
    };
    documents.push(document);
    return document;
  };

  const published = facts.publishedDocument;
  let publishDocumentId: string | null = null;
  if (published && published.id !== facts.latestDocument?.id) {
    const live = append(published.content, null);
    publishDocumentId = live.id;
    append(latestContent, live.id);
  } else {
    const only = append(latestContent, null);
    if (published) publishDocumentId = only.id;
  }

  return {
    from,
    to,
    documents,
    publishDocumentId,
    removeOldPublication: Boolean(published),
    moveHostRecord: facts.fromHasHostRecord,
    redirects: {
      retire: reclaiming ? to : null,
      repointFrom: from,
      add: { from, to },
    },
  };
}

/** What a rename endpoint answers, for any outcome. */
export interface RenameRouteResponse {
  status: number;
  body: Record<string, unknown>;
}

export interface RenameRouteResult {
  from: string;
  to: string;
  documentIds: string[];
  publishedDocumentId: string | null;
}

export interface RenameRouteDeps {
  isAdmin: () => Promise<boolean>;
  /** Why renaming is off here, or null when it can run. */
  unavailableReason: () => Promise<string | null>;
  rename: (input: { from: string; to: string; expectedLatestDocumentId: string | null }) => Promise<RenameRouteResult>;
  afterRename?: (result: RenameRouteResult) => void;
  /** Unexpected failures, for the server log; the editor gets a plain line. */
  reportError?: (error: unknown) => void;
}

/**
 * A rename endpoint's decisions, with every side effect injected so it can be
 * exercised without a session or a database. A route only wires the real
 * dependencies in.
 */
export async function resolveRenameRequest(slug: string, body: unknown, deps: RenameRouteDeps): Promise<RenameRouteResponse> {
  if (!(await deps.isAdmin())) return { status: 401, body: { error: 'Unauthorized' } };
  const reason = await deps.unavailableReason();
  if (reason) return { status: 503, body: { error: reason, code: 'RENAME_UNAVAILABLE' } };

  const input = body as { newSlug?: unknown; expectedLatestDocumentId?: unknown } | null;
  if (
    !input
    || typeof input !== 'object'
    || typeof input.newSlug !== 'string'
    || !(input.expectedLatestDocumentId === null || typeof input.expectedLatestDocumentId === 'string')
  ) {
    return { status: 400, body: { error: 'A new address and the version the editor loaded are required.', code: 'RENAME_INVALID' } };
  }

  try {
    const result = await deps.rename({ from: slug, to: input.newSlug, expectedLatestDocumentId: input.expectedLatestDocumentId });
    deps.afterRename?.(result);
    return { status: 200, body: { ...result } };
  } catch (error) {
    if (error instanceof StoryRenameError) {
      return {
        status: RENAME_ERROR_STATUS[error.code],
        body: { error: error.message, code: renameErrorBodyCode(error.code), problem: error.problem, movedTo: error.movedTo },
      };
    }
    deps.reportError?.(error);
    return { status: 500, body: { error: 'The address couldn’t be changed. Nothing was moved.' } };
  }
}
