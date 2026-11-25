import type { Story, StoryBlock, StoryMedia } from '@rcweston/story-core';
import { chapterShortName } from '@rcweston/story-react';
import type { PublicationIssue } from '@rcweston/story-core';

/**
 * Plain-language publish checklist rows. The publication gate reports issues
 * by data path (`story.chapters[0].blocks[1].media`), which is right for the
 * server and meaningless to the person writing the story. This turns each
 * one into where it is on the page, what to do about it, and the canvas
 * region to jump to.
 *
 * Kept free of React so the mapping is unit-tested on its own.
 */
export interface PublicationIssueLabel {
  /** Where on the page, e.g. "The brief · Image 2" — sections go by their heading. Never a data path. */
  where: string;
  /** What to do about it, in plain words. */
  what: string;
  /** The canvas region (`data-story-editor-id`) that holds the problem. */
  selectionId: string;
}

/** A deduplicated row, carrying the severity it was raised at. */
export interface PublicationChecklistRow extends PublicationIssueLabel {
  severity: PublicationIssue['severity'];
  code: PublicationIssue['code'];
  path: string;
}

/* Reader-facing block names. These mirror STORY_BLOCK_LABELS in
   StoryBlockEditor.tsx, which can't be imported here: it is a client UI
   module with a CSS-module import, so it would drag React into a pure
   function and break the node test. Media blocks are named by what they hold
   (Image / Video) because that's what the person sees on the page, and
   "Legacy metrics" loses its engineering prefix. The Record type makes a new
   block type a compile error here too. */
const BLOCK_NAMES: Record<Exclude<StoryBlock['type'], 'media'>, string> = {
  prose: 'Prose',
  subhead: 'Subheading',
  decision: 'Decision',
  insight: 'Insight',
  quote: 'Quote',
  callout: 'Callout',
  metrics: 'Metrics',
  outcomes: 'Outcomes',
  ledger: 'Contribution ledger',
  implemented: 'Implemented',
  influenced: 'Influenced',
  partners: 'Partners',
  contribution: 'Contribution',
  collaboration: 'Collaboration map',
  followUp: 'Follow-up topics',
  steps: 'Steps',
  note: 'Margin note',
  cta: 'Button',
  divider: 'Divider',
  spacer: 'Spacer',
  gallery: 'Image group',
  table: 'Table',
  code: 'Code',
  custom: 'Custom block',
};

const LEDGER_GROUPS: Record<string, string> = {
  led: 'Led',
  made: 'Made',
  influenced: 'Influenced',
  notMe: 'Not mine',
};

const HERO_FIELDS: Record<string, { selectionId: string; label: string }> = {
  title: { selectionId: 'hero-copy', label: 'Title' },
  thesis: { selectionId: 'hero-copy', label: 'Thesis' },
  disclosure: { selectionId: 'hero-copy', label: 'Disclosure' },
  company: { selectionId: 'hero-meta', label: 'Company' },
  period: { selectionId: 'hero-meta', label: 'Period' },
  projectYear: { selectionId: 'hero-meta', label: 'Project year' },
  status: { selectionId: 'hero-meta', label: 'Status' },
  companyLogo: { selectionId: 'hero-meta', label: 'Company logo' },
};

/** Collections whose emptiness is fixed by adding something or hiding the
 *  whole thing; a leaf string is fixed by typing. */
const TEXT_COLLECTIONS = new Set(['paragraphs']);
const ITEM_COLLECTIONS = new Set(['items', 'groups', 'ledger', 'credits']);

/** One step of a path into the story: a field name or a list index. */
export type StoryPathSegment = string | number;
type Segment = StoryPathSegment;

/** `story.chapters[0].blocks[1].media.alt` → ['chapters', 0, 'blocks', 1, 'media', 'alt']. */
export function parseIssuePath(path: string): Segment[] {
  const segments = (path.match(/[^.[\]]+/g) ?? []).map((part) => (/^\d+$/.test(part) ? Number(part) : part));
  return segments[0] === 'story' ? segments.slice(1) : segments;
}

const nth = (value: Segment | undefined) => (typeof value === 'number' ? value + 1 : undefined);
const join = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(' · ');
const mediaNoun = (media: StoryMedia | undefined) => (media?.kind === 'video' ? 'Video' : media?.kind === 'image' ? 'Image' : undefined);

function blockName(block: StoryBlock): string {
  if (block.type === 'media') return mediaNoun(block.media) ?? 'Media';
  return BLOCK_NAMES[block.type];
}

/** "Image 2" means the second image in its section, not the second block —
 *  numbered the way a reader would count down the page. Hidden blocks count
 *  because the editor canvas still shows them. */
function numberedBlockName(blocks: StoryBlock[], index: number): string {
  const name = blockName(blocks[index]);
  const ordinal = blocks.slice(0, index + 1).filter((block) => blockName(block) === name).length;
  return `${name} ${ordinal}`;
}

/** The part of a block an issue points at, when the block has more than one
 *  field worth telling apart. `rest` is the path after `blocks[j]`. */
function blockPart(block: StoryBlock, rest: Segment[]): string | undefined {
  const [first, second, third] = rest;
  switch (block.type) {
    case 'gallery':
      if (first === 'items' && typeof second === 'number') return `${mediaNoun(block.items[second]) ?? 'Item'} ${second + 1}`;
      return undefined;
    case 'table':
      if (first === 'rows' && typeof second === 'number' && typeof third === 'number') return `Row ${second + 1} · Column ${third + 1}`;
      return undefined;
    case 'decision':
      if (first === 'call') return 'Call';
      if (first === 'because') return 'Rationale';
      if (first === 'options' && nth(second)) return `Option ${nth(second)}`;
      if (first === 'mechanism' && nth(second)) return `Step ${nth(second)}`;
      if (first === 'media') return mediaNoun(block.media) ?? 'Media';
      return undefined;
    case 'insight':
      if (first === 'title') return 'Title';
      if (first === 'label') return 'Label';
      if (first === 'columns' && typeof second === 'number') {
        const column = block.columns[second]?.label.trim() || `Column ${second + 1}`;
        const [, , , item] = rest;
        if (third === 'media' && typeof item === 'number') return `${column} · ${mediaNoun(block.columns[second]?.media?.[item]) ?? 'Media'} ${item + 1}`;
        return column;
      }
      if (first === 'steps' && nth(second)) return `Step ${nth(second)}`;
      if (first === 'footer') return block.footer?.label.trim() || 'Closing line';
      return undefined;
    case 'quote':
      if (first === 'quote' && second === 'name') return 'Name';
      if (first === 'quote' && second === 'role') return 'Role';
      return undefined;
    case 'callout':
      if (first === 'title') return 'Title';
      if (first === 'body') return 'Body';
      return undefined;
    case 'metrics':
      return first === 'items' && nth(second) ? `Metric ${nth(second)}` : undefined;
    case 'outcomes':
      return first === 'items' && nth(second) ? `Outcome ${nth(second)}` : undefined;
    case 'steps':
      return first === 'items' && nth(second) ? `Step ${nth(second)}` : undefined;
    case 'ledger':
      if (first !== 'ledger' || typeof second !== 'string') return undefined;
      if (second === 'partners') return nth(third) ? `Partner ${nth(third)}` : 'Partners';
      return LEDGER_GROUPS[second];
    case 'implemented':
    case 'influenced':
      return first === 'items' && nth(second) ? `Item ${nth(second)}` : undefined;
    case 'partners':
      return first === 'items' && nth(second) ? `Partner ${nth(second)}` : undefined;
    case 'contribution':
      return first === 'items' && nth(second) ? `${block.variant === 'partners' ? 'Partner' : 'Item'} ${nth(second)}` : undefined;
    case 'collaboration':
      if (first !== 'map') return undefined;
      if (second === 'center') return 'Center';
      if (second === 'groups' && nth(third)) return `Group ${nth(third)}`;
      return undefined;
    default:
      return undefined;
  }
}

/** The media object an issue names, so copy can say "image" or "video". */
function mediaAt(story: Story, segments: Segment[]): StoryMedia | undefined {
  let node: unknown = story;
  let media: StoryMedia | undefined;
  for (const segment of segments) {
    if (node === null || typeof node !== 'object') break;
    node = (node as Record<string | number, unknown>)[segment];
    if (node && typeof node === 'object' && 'kind' in node) media = node as StoryMedia;
  }
  return media;
}

/** The preview card isn't on the page: its settings sit with the media it
 *  follows, the split graphic's when that leads and the hero's otherwise. */
export function previewCardSettingsId(story: Story): 'hero-media' | 'hero-graphic' {
  return story.heroLayout === 'split-graphic' && story.heroGraphic ? 'hero-graphic' : 'hero-media';
}

interface Location {
  where: string;
  selectionId: string;
  /** Empty chapters and orphaned subheads need their own advice. */
  special?: 'empty-chapter' | 'lonely-subhead';
}

function locate(story: Story, segments: Segment[]): Location {
  const [root, second, third, fourth] = segments;

  if (root === 'chapters' && typeof second === 'number') {
    const chapter = story.chapters[second];
    if (!chapter) return { where: 'Story settings', selectionId: 'story' };
    const section = chapterShortName(chapter.title);
    const chapterId = `chapter:${chapter.key}`;
    if (third === 'blocks' && typeof fourth === 'number') {
      const block = chapter.blocks[fourth];
      if (!block) return { where: section, selectionId: chapterId };
      const rest = segments.slice(4);
      return {
        where: join(section, numberedBlockName(chapter.blocks, fourth), blockPart(block, rest)),
        selectionId: `block:${chapter.key}:${block.id ?? fourth}`,
        special: rest.length === 0 && block.type === 'subhead' ? 'lonely-subhead' : undefined,
      };
    }
    if (third === 'blocks') return { where: section, selectionId: chapterId, special: 'empty-chapter' };
    if (third === 'title') return { where: join(section, 'Title'), selectionId: chapterId };
    return { where: section, selectionId: chapterId };
  }

  if (typeof root === 'string' && HERO_FIELDS[root]) {
    const field = HERO_FIELDS[root];
    return { where: join('Hero', field.label), selectionId: field.selectionId };
  }

  switch (root) {
    case 'hero':
      return { where: join('Hero', mediaNoun(story.hero) ?? 'Media'), selectionId: 'hero-media' };
    case 'heroGraphic':
      // A looping clip or animated SVG is what the reader sees move; a still
      // stays "Graphic".
      return { where: join('Hero', story.heroGraphic?.kind === 'video' || story.heroGraphic?.animated ? 'Animation' : 'Graphic'), selectionId: 'hero-graphic' };
    case 'workPreview':
      return { where: 'Preview card', selectionId: previewCardSettingsId(story) };
    case 'facts':
      return { where: nth(second) ? `Hero · Fact ${nth(second)}` : 'Hero · Facts', selectionId: 'facts' };
    case 'decisions':
      if (second === 'title') return { where: 'Decisions · Title', selectionId: 'decisions' };
      if (second === 'items' && nth(third)) return { where: `Decisions · Item ${nth(third)}`, selectionId: 'decisions' };
      return { where: 'Decisions', selectionId: 'decisions' };
    case 'hindsight':
      return { where: second === 'title' ? 'Hindsight · Title' : 'Hindsight', selectionId: 'hindsight' };
    case 'credits':
      return { where: nth(second) ? `Credits · Credit ${nth(second)}` : 'Credits', selectionId: 'credits' };
    case 'related':
      return { where: 'Story settings · Related stories', selectionId: 'story' };
    default:
      // slug, summary, tone, related and anything the gate learns to check
      // later live in the story settings, not on the canvas.
      return { where: 'Story settings', selectionId: 'story' };
  }
}

function needsUpload(story: Story, segments: Segment[]): string {
  const last = segments[segments.length - 1];
  if (segments[0] === 'companyLogo') return 'Needs an uploaded logo';
  if (last === 'poster') return 'Needs an uploaded poster image';
  const noun = mediaNoun(mediaAt(story, segments));
  return noun ? `Needs an uploaded ${noun.toLowerCase()}` : 'Needs an uploaded image or video';
}

function describeWhat(story: Story, issue: PublicationIssue, segments: Segment[], location: Location): string {
  const relatedSlug = segments[0] === 'related' && typeof segments[1] === 'number' ? story.related?.[segments[1]] : undefined;
  const last = segments[segments.length - 1];
  switch (issue.code) {
    case 'invalid-media-source':
      if (last === 'youtubeUrl' || last === 'pdfUrl') return issue.message;
      return needsUpload(story, segments);
    case 'unresolved-required-media':
      if (last === 'pdfUrl') return issue.message;
      return needsUpload(story, segments);
    case 'unresolved-optional-media': {
      const noun = mediaNoun(mediaAt(story, segments))?.toLowerCase() ?? 'image';
      return `No uploaded ${noun} yet — the live page will leave it out`;
    }
    case 'missing-media-alt':
      return 'Needs a description for screen readers';
    case 'empty-visible-content':
      if (location.special === 'empty-chapter') return 'Has nothing visible — add a block or hide the section';
      if (location.special === 'lonely-subhead') return 'Needs something below it — add a block or hide it';
      if (typeof last === 'string' && TEXT_COLLECTIONS.has(last)) return 'Is empty — add text or hide it';
      if (typeof last === 'string' && ITEM_COLLECTIONS.has(last)) return 'Is empty — add an item or hide it';
      return 'Needs text';
    case 'broken-related-story':
      return relatedSlug ? `Related story “${relatedSlug}” doesn’t exist` : 'Related story link is broken';
    case 'duplicate-related-story':
      return relatedSlug ? `Related story “${relatedSlug}” is listed twice` : 'Related story is listed twice';
    case 'self-related-story':
      return 'Related story points to this story';
    default:
      // A code this map doesn't know yet: the gate's own sentence is still
      // plain language, and far better than the path.
      return issue.message;
  }
}

/* Settings that aren't on the canvas, named in full where a change is
   reported rather than an issue (the checklist's issues there all read
   "Story settings", which its tests pin). */
const SETTINGS_FIELDS: Record<string, string> = {
  summary: 'Card summary',
  tone: 'Tone',
  related: 'Related stories',
  visibility: 'Show on page',
  outcomes: 'Index card metric',
};

/**
 * Where a part of the story sits, by the checklist's names: "Hero · Title",
 * "The brief · Image 2", "Where things stood · Quote 1". `segments` is a path into `story`
 * (`['chapters', 1, 'blocks', 3]`), so name a block from the story that holds
 * it.
 */
export function describeStoryPlace(story: Story, segments: readonly StoryPathSegment[]): string {
  const root = segments[0];
  if (typeof root === 'string' && SETTINGS_FIELDS[root]) return join('Story settings', SETTINGS_FIELDS[root]);
  return locate(story, [...segments]).where;
}

/** Where a part of the story sits and the region that holds it, for jumping
 *  there (find and replace lists its matches this way). */
export function locateStoryPlace(story: Story, segments: readonly StoryPathSegment[]): { where: string; selectionId: string } {
  const root = segments[0];
  if (typeof root === 'string' && SETTINGS_FIELDS[root]) return { where: join('Story settings', SETTINGS_FIELDS[root]), selectionId: 'story' };
  const { where, selectionId } = locate(story, [...segments]);
  return { where, selectionId };
}

export function describePublicationIssue(story: Story, issue: PublicationIssue): PublicationIssueLabel {
  const segments = parseIssuePath(issue.path);
  const location = locate(story, segments);
  return {
    where: location.where,
    what: describeWhat(story, issue, segments, location),
    selectionId: location.selectionId,
  };
}

/**
 * Labels for a whole readiness report, errors first. Only exact duplicates
 * merge, so separate missing fields can each get their own jump.
 */
export function describePublicationIssues(story: Story, issues: readonly PublicationIssue[]): PublicationChecklistRow[] {
  const seen = new Set<string>();
  const rows: PublicationChecklistRow[] = [];
  const entries = issues.map(issue => ({ issue, label: describePublicationIssue(story, issue) }));
  const locations = new Map<string, Set<string>>();
  const locationKey = ({ issue, label }: (typeof entries)[number]) => `${issue.severity}|${issue.code}|${label.where}`;
  for (const entry of entries) {
    const key = locationKey(entry);
    const paths = locations.get(key) ?? new Set<string>();
    paths.add(entry.issue.path);
    locations.set(key, paths);
  }
  for (const severity of ['error', 'warning'] as const) {
    for (const entry of entries) {
      const { issue, label } = entry;
      if (issue.severity !== severity) continue;
      const key = `${severity}|${issue.code}|${issue.path}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const leaf = parseIssuePath(issue.path).at(-1);
      // Make identical messages about distinct subfields distinguishable.
      const fieldNames: Record<string, string> = { label: 'Label', whyNot: 'Reason', value: 'Value', detail: 'Detail', title: 'Title', body: 'Body' };
      const sameLocation = (locations.get(locationKey(entry))?.size ?? 0) > 1;
      const where = sameLocation && typeof leaf === 'string' && fieldNames[leaf] ? `${label.where} · ${fieldNames[leaf]}` : label.where;
      rows.push({ ...label, where, severity, code: issue.code, path: issue.path });
    }
  }
  return rows;
}
