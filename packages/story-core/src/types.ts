/**
 * Stories: the content model.
 *
 * A story is a long-form case study the way a reader meets it: a hero, an
 * at-a-glance summary, then chapters (by default Situation, Task, Action,
 * Result), each a run of typed blocks, and an optional hindsight coda.
 */

export interface Quote {
  quote: string;
  name: string;
  role: string;
  context?: string;
}

export interface Metric {
  value: string;
  description: string;
  context?: string;
  baseline?: string;
}

/** The original STAR chapter keys remain the default for new stories. */
export type StarChapterKey = 'situation' | 'task' | 'action' | 'result';
/** Stable section identity. It is never derived from the editable title. */
export type StoryChapterKey = string;

/** Shared layout vocabulary. Stories choose values independently; these are
 * schemas for reusable renderers, not references to mutable cross-story copy. */
export const STORY_LAYOUT_OPTIONS = {
  glancePresentation: ['editorial', 'clean', 'none'],
  chapterDensity: ['default', 'compact'],
  chapterColumns: ['one', 'two'],
  proseFormat: ['paragraphs', 'bullets', 'numbered'],
  mediaWidth: ['text', 'wide', 'full'],
  mediaAlign: ['left', 'center'],
  mediaFrame: ['mat', 'bleed'],
  mediaMat: ['page', 'grey', 'cool', 'warm', 'amber', 'teal', 'ink'],
  mediaMatPadding: ['small', 'medium', 'large'],
  tone: ['neutral', 'cool', 'warm', 'panel'],
  insightLayout: ['columns', 'split', 'rows'],
  insightSurface: ['card', 'panel', 'open'],
  insightTitleWidth: ['measure', 'full'],
  spacerSize: ['small', 'medium', 'large', 'xl'],
  galleryColumns: ['two', 'three', 'four'],
  galleryLayout: ['horizontal', 'vertical', 'grid'],
  galleryAlignment: ['auto', 'normal', 'custom'],
  calloutTone: ['neutral', 'info', 'success', 'warning'],
  calloutIcon: ['info', 'check', 'warning', 'sparkle'],
  calloutPresentation: ['soft', 'outline', 'accent', 'panel'],
  outcomesLayout: ['lead', 'even'],
} as const;

export const STORY_BLOCK_TYPES = [
  'prose',
  'subhead',
  'media',
  'decision',
  'insight',
  'quote',
  'callout',
  'metrics',
  'outcomes',
  'ledger',
  'implemented',
  'influenced',
  'partners',
  'contribution',
  'collaboration',
  'followUp',
  'steps',
  'note',
  'cta',
  'divider',
  'spacer',
  'gallery',
  'table',
  'code',
  'custom',
] as const;

export const STORY_CHAPTERS: { key: StarChapterKey; label: string }[] = [
  { key: 'situation', label: 'Situation' },
  { key: 'task', label: 'Task' },
  { key: 'action', label: 'Action' },
  { key: 'result', label: 'Result' },
];

/** The footage a slot is waiting for. Rendered as a visible slot in development
 *  only — production never shows an empty frame. */
export interface StoryShot {
  /** What the clip or still should show. */
  brief: string;
  /** Where it can be cut from — a recording's file name and timestamps. */
  source?: string;
  /** Target length for a clip, e.g. "8–12s loop". */
  length?: string;
  /** A draft cut, served only by a development media route so it can be judged
   *  in place; ignored in production. */
  draft?: string;
}

/** Plain JSON, for custom block props. */
export type StoryJsonValue = string | number | boolean | null | StoryJsonValue[] | { [key: string]: StoryJsonValue };

export type StoryMatPreset = (typeof STORY_LAYOUT_OPTIONS.mediaMat)[number];
export type StoryMatColor = StoryMatPreset | `#${string}`;
export type StoryMatPadding = (typeof STORY_LAYOUT_OPTIONS.mediaMatPadding)[number];

export interface StoryMedia {
  kind: 'video' | 'image';
  /** Selects an allowlisted YouTube embed without overwriting the stored
   * image/video source, so switching back restores the previous media. */
  sourceMode?: 'media' | 'youtube' | 'pdf';
  youtubeUrl?: string;
  /** A PDF served by your media route, shown
   * in the browser's own viewer when `sourceMode` is `pdf`. Mobile browsers
   * that only render a first page rely on `link` to open the whole file. */
  pdfUrl?: string;
  /** A self-contained animated SVG. Rendered in an object so its timeline can
   *  be paused, while ordinary SVGs continue through the image path. */
  animated?: boolean;
  /** Hosted URL. Absent = a slot still waiting for its footage. */
  src?: string;
  /** Video poster — also the still shown when motion is reduced. */
  poster?: string;
  /** Optional editorial heading rendered directly above this media item. */
  heading?: string;
  alt: string;
  caption?: string;
  /** Optional supporting link shown with the caption. The media itself keeps
   * its zoom/play behavior, so editing a link never makes those controls
   * ambiguous. */
  link?: { href: string; label?: string };
  /** Width ÷ height. Reserves the box before anything loads. Default 16/10. */
  aspect?: number;
  /** Optional reader viewport. The source file and its measured `aspect` stay
   * untouched; this only controls how it is framed on the page. */
  framing?: {
    /** Viewport width ÷ height. Absent keeps the source's measured shape. */
    aspect?: number;
    /** `cover` crops around the focal point; `contain` shows the whole file. */
    fit?: 'cover' | 'contain';
    /** Percent coordinates used by CSS object-position. Defaults to centre. */
    x?: number;
    y?: number;
    /** Optional card/viewport magnification. 1 keeps the source at its fitted size. */
    zoom?: number;
  };
  /** Optional presentation overrides. Omitted fields retain the reader defaults. */
  appearance?: {
    /** Mat spacing in px, capped responsively at 15% of its width per side. */
    matInsetX?: number;
    matInsetY?: number;
    radius?: number;
    borderWidth?: number;
    borderStyle?: 'solid' | 'dashed' | 'dotted';
    borderTone?: 'edge' | 'ink' | 'accent';
    outlineWidth?: number;
    outlineOffset?: number;
    outlineTone?: 'edge' | 'ink' | 'accent';
    shadow?: 'none' | 'soft' | 'lifted' | 'crisp';
  };
  /** Initial expanded still view, independent of inline cropping. */
  expansion?: { enabled?: boolean; zoom?: number; x?: number; y?: number };
  /** `mat` seats product UI on a tinted plate; `bleed` lets film or
   *  photography fill the frame edge to edge. Default `mat`. */
  frame?: 'mat' | 'bleed';
  /** The mat's colour: a preset (a theme token, so it follows the reader's
   *  theme) or a `#rrggbb` hex, the same in every theme. Absent = the
   *  story's tone. */
  matColor?: StoryMatColor;
  /** The margin of plate around the media: `small` 12→24px, `medium`
   *  24→48px, `large` 24→72px (phone → 768px and up). Absent = the
   *  story's, which is `medium` unless the story sets its own. */
  matPadding?: StoryMatPadding;
  /** Short UI clips loop silently while on screen. Anything longer than a
   *  gesture gets real controls instead. Default true for video. */
  loop?: boolean;
  shot?: StoryShot;
}

/** How a result is known — shown as a tag beside it. Strongest first. */
export type StoryEvidence =
  | 'experiment'     // A/B or holdout, with a baseline
  | 'before-after'   // pre/post launch comparison
  | 'leading'        // adoption, activation, task success, eval pass rate
  | 'observed'       // usability sessions, support themes, sales calls
  | 'testimony'      // what customers or partners said, attributed by role
  | 'shipped'        // what launched, to whom, and who reused it
  | 'plan';          // what would be measured, and why

export const EVIDENCE_LABEL: Record<StoryEvidence, string> = {
  experiment: 'Experiment',
  'before-after': 'Before / after',
  leading: 'Leading signal',
  observed: 'Observed',
  testimony: 'In their words',
  shipped: 'Shipped',
  plan: 'Measurement plan',
};

/** A result, with enough context to survive a reference call: what moved,
 *  from what, over how long, and how it's known. */
export interface StoryOutcome {
  /** Stable editor identity. Optional for backward compatibility. */
  id?: string;
  value: string;
  label: string;
  evidence?: StoryEvidence;
  /** The author's own wording for the evidence tag. Blank or absent prints
   *  the default for `evidence` ("Measurement plan", "Experiment"…). */
  evidenceLabel?: string;
  /** "from 14 min", "vs. the previous quarter" — omit rather than invent. */
  baseline?: string;
  timeframe?: string;
  /** Sample, source, caveats, and whose work it was. */
  note?: string;
  /** Editorial visibility. Hidden rows stay in the immutable document so they
   * can be restored without reconstructing content. */
  hidden?: boolean;
}

/** Who did what — the reviewer's first question on any team project. */
export interface StoryLedger {
  led?: string[];
  made?: string[];
  influenced?: string[];
  partners?: { role: string; owned: string }[];
  /** Work in the story that belongs to someone else. */
  notMe?: string[];
  /** The author's own headings for each row. Blank or absent prints the
   *  default ("I led", "I made", "I influenced", "Not mine", "Partners"). */
  ledLabel?: string;
  madeLabel?: string;
  influencedLabel?: string;
  notMeLabel?: string;
  partnersLabel?: string;
}

export interface StoryDecisionOption {
  label: string;
  whyNot: string;
}

/** A deliberately simplified collaboration map. It communicates the working
 *  relationships that made a decision possible, not a precise org chart. */
export interface StoryCollaboration {
  center: { label: string; detail: string };
  groups: { label: string; detail: string }[];
  note?: string;
}

/**
 * Rich text: paragraphs (each with inline **bold**, *italic* and
 * [links](href)), any of them subheadings or list items, or the same strings
 * as one bulleted or numbered list. Prose
 * blocks are this shape, and so is every body in an insight card, so both are
 * edited with the same selection pill and render with the same rules.
 */
export const STORY_LIST_MAX_DEPTH = 3;

export const STORY_HEADING_LEVELS = [2, 3, 4, 5, 6] as const;
export type StoryHeadingLevel = typeof STORY_HEADING_LEVELS[number];
export function isStoryHeadingLevel(value: unknown): value is StoryHeadingLevel {
  return STORY_HEADING_LEVELS.some(level => level === value);
}

export interface StoryRichText {
  paragraphs: string[];
  /** Semantic subheadings inside the rich-text flow. Positions refer to
   * `paragraphs`; body text is implied for positions not listed. */
  headings?: { index: number; level: StoryHeadingLevel }[];
  /** Positions in `paragraphs` set in large text, ascending, each once.
   *  List rows keep their own large style in listItems; legacy lists ignore this field. */
  large?: number[];
  /** The older form of `large: [0]` (first paragraph large). Still read
   *  when `large` is absent, so stored documents keep their look; the
   *  editor replaces it with `large` only when the styling changes. */
  lede?: boolean;
  /** Paragraphs by default; the same authored strings can render as a
   * bulleted or numbered list without destructive content conversion. */
  format?: typeof STORY_LAYOUT_OPTIONS.proseFormat[number];
  /** List items among paragraphs, by position in `paragraphs`, so a list
   *  can sit between paragraphs in one block. Neighbouring items of one
   *  kind, at one depth and under the same parent, read as one list.
   *  Top-level rows omit depth. A simple flat, unstyled list may use format. */
  listItems?: {
    index: number;
    format: Exclude<typeof STORY_LAYOUT_OPTIONS.proseFormat[number], 'paragraphs'>;
    depth?: number;
    large?: true;
  }[];
}

/** One labelled point in an insight card: "What we learned", "Friction". */
export interface StoryInsightColumn {
  /** Stable editor identity. */
  id?: string;
  label: string;
  body: StoryRichText;
  /** Images or clips under the point's text, each in its own shape. */
  media?: StoryMedia[];
  /** Set apart as its own tinted panel — the friction, the catch. */
  highlight?: boolean;
}

export type StoryBlock = (
  /** Body copy. Any paragraph can be set a step larger, like a paragraph
   *  style in a doc editor (see `large`). */
  | ({ type: 'prose' } & StoryRichText)
  /** A short inline heading inside a chapter. */
  | { type: 'subhead'; text: string }
  /** `text` sits on the reading measure, `wide` spans the column, `full`
   *  breaks out to the page edge. */
  | {
      type: 'media';
      media: StoryMedia;
      width?: typeof STORY_LAYOUT_OPTIONS.mediaWidth[number];
      /** Positions a single image independently of the chapter's left text rail. Default `left`. */
      align?: typeof STORY_LAYOUT_OPTIONS.mediaAlign[number];
    }
  /** A judgment call, stated as a tradeoff. `over` is the short form of the
   *  rejected option; `options` lists the real alternatives when there were
   *  several. `cost` is what got worse. `status` says whether the call held. */
  | {
      type: 'decision';
      call: string;
      context?: string;
      over?: string;
      options?: StoryDecisionOption[];
      because: string;
      cost?: string;
      status?: 'held' | 'revised' | 'reversed';
      /** Proposed, decided, influenced, executed — my part in the call. */
      mine?: string;
      /** Editable labels for the editorial decision fields. Older documents
       *  use the reader-facing defaults in the renderer. */
      contextLabel?: string;
      rationaleLabel?: string;
      tradeoffLabel?: string;
      contributionLabel?: string;
      /** The card's own headings: over the call ("The call") and over the
       *  alternatives ("Options", or "Over" for a single one). The card also
       *  reads contextLabel / rationaleLabel / tradeoffLabel, defaulting to
       *  "Context" / "Because" / "Cost". */
      callLabel?: string;
      alternativesLabel?: string;
      media?: StoryMedia;
      /** A lighter editorial treatment for decisions already established by surrounding prose. */
      presentation?: 'card' | 'editorial';
      /** Optional authored steps for the editorial decision diagram. Older
       * documents show the call and its alternatives only. */
      mechanism?: string[];
    }
  /** A finding stated as a headline, with its supporting points as labelled
   *  columns. Everything on it is the author's words: the label, the column
   *  headings, how many columns there are and which one stands out. */
  | {
      type: 'insight';
      /** A short custom line above the title ("Key insight"). Absent = none. */
      label?: string;
      title: string;
      /** `measure` holds the title to a reading width; `full` runs it across
       *  the card. Default `measure`. */
      titleWidth?: typeof STORY_LAYOUT_OPTIONS.insightTitleWidth[number];
      /** `columns` sets the points side by side, `split` puts the title
       *  beside them, `rows` lists them under it. Default `columns`. */
      layout?: typeof STORY_LAYOUT_OPTIONS.insightLayout[number];
      /** `card` is a tinted box, `panel` a dark one, `open` sits on the page
       *  with no box. Default `card`. */
      surface?: typeof STORY_LAYOUT_OPTIONS.insightSurface[number];
      columns: StoryInsightColumn[];
      /** Optional numbered sequence under the columns. */
      steps?: string[];
      /** Optional closing line with its own heading ("My contribution"). */
      footer?: { label: string; body: StoryRichText };
    }
  | { type: 'quote'; quote: Quote }
  /** A compact editorial aside. The title and icon are independently optional;
   * the body uses the same structured rich text as prose blocks. */
  | {
      type: 'callout';
      title?: string;
      body: StoryRichText;
      tone?: typeof STORY_LAYOUT_OPTIONS.calloutTone[number];
      icon?: typeof STORY_LAYOUT_OPTIONS.calloutIcon[number];
      /** Optional catalogue keys. Older readers retain the established tone and icon above. */
      appearance?: { palette?: string; icon?: string };
      /** Visual structure, independent from semantic tone. Default `soft`;
       *  `accent` is retired and renders as `soft`. */
      presentation?: typeof STORY_LAYOUT_OPTIONS.calloutPresentation[number];
    }
  /** Legacy metric rows (adapted studies). New stories use `outcomes`. */
  | { type: 'metrics'; items: Metric[]; note?: string }
  | {
      type: 'outcomes';
      items: StoryOutcome[];
      note?: string;
      /** `lead` sets the first result large with the rest as a ledger beside
       *  it; `even` gives every result the same size and column. Default `lead`. */
      layout?: typeof STORY_LAYOUT_OPTIONS.outcomesLayout[number];
    }
  | { type: 'ledger'; ledger: StoryLedger }
  | { type: 'implemented'; label?: string; items: string[]; /** Draft provenance retained when a legacy ledger is split into independent blocks. */ sourceLedger?: StoryLedger }
  | { type: 'influenced'; label?: string; items: string[] }
  | { type: 'partners'; label?: string; items: { role: string; owned: string }[] }
  | { type: 'contribution'; variant: 'implemented' | 'influenced' | 'partners'; label?: string; items: (string | { role: string; owned: string })[]; sourceLedger?: StoryLedger }
  | { type: 'collaboration'; map: StoryCollaboration }
  /** An invitation to continue the conversation around
   * related work without publishing the private walkthrough itself. */
  | {
      type: 'followUp';
      heading: string;
      intro?: string;
      items: {
        id?: string;
        title: string;
        teaser: string;
        icon?: 'layers' | 'sparkles' | 'workflow' | 'users';
        media?: StoryMedia;
        link?: { href: string; label?: string };
      }[];
      cta?: { label: string; href: string };
    }
  | { type: 'steps'; items: { title: string; body: string }[] }
  /** A margin note — sits beside the prose on wide screens. */
  | { type: 'note'; text: string }
  /** A hairline across the column between two blocks, like the one that
   *  opens a section. Takes no room of its own beyond the usual gaps. */
  | { type: 'divider' }
  | { type: 'cta'; label: string; href: string; newTab?: boolean }
  /** Extra room between two blocks: 24 / 48 / 72 / 144px on top of the usual
   *  gap. Nothing a reader sees. Default `medium`. */
  | { type: 'spacer'; size?: typeof STORY_LAYOUT_OPTIONS.spacerSize[number] }
  /** An image group: two or more images or clips, each in its own shape
   *  (never cropped), with each one's heading above it. `horizontal` sets
   *  them side by side, `vertical` stacks them at full width with their
   *  captions, and `grid` lays them on one plate in `columns` (default
   *  `three`). Absent is `grid`, the only layout a group had before. Media
   *  pairs and before/after comparisons are groups now; stored documents
   *  that still hold them are upgraded on read (see media-groups.ts). */
  /** A grid of plain-text cells, rows by columns (every row as wide as the
   *  first). The first row is the column headings unless `headerRow` is
   *  false. Wide tables scroll sideways on phones rather than squeeze. */
  | { type: 'table'; rows: string[][]; headerRow?: boolean; caption?: string }
  /** Code or another fixed-width text, shown as typed (no markup read). */
  | { type: 'code'; code: string; caption?: string }
  /** A block your app provides. `component` names an entry in the host's
   *  block registry; `props` must be plain JSON so a document never holds
   *  code or markup. Unknown components render nothing for readers and a
   *  labelled placeholder in the editor. */
  | { type: 'custom'; component: string; props?: Record<string, StoryJsonValue>; title?: string; caption?: string }
  | {
      type: 'gallery';
      items: StoryMedia[];
      caption?: string;
      layout?: typeof STORY_LAYOUT_OPTIONS.galleryLayout[number];
      columns?: typeof STORY_LAYOUT_OPTIONS.galleryColumns[number];
      /** Opt-in sizing for a side-by-side gallery. Omitted preserves historic column weights. */
      alignment?: typeof STORY_LAYOUT_OPTIONS.galleryAlignment[number];
    }
) & {
  /** Stable editor identity. Optional for backward compatibility. */
  id?: string;
  /** Hidden modules remain editable in the admin canvas but are omitted from
   * reader-facing rendering. */
  hidden?: boolean;
};

export interface StoryChapter {
  key: StoryChapterKey;
  /** A statement, not a label: "Engineers wouldn't act on an answer they couldn't check." */
  title: string;
  blocks: StoryBlock[];
  /** Tightens the chapter heading-to-body and between-block rhythm. */
  density?: typeof STORY_LAYOUT_OPTIONS.chapterDensity[number];
  /** Text layout for this section. Omitted documents remain a single,
   * full-frame column; two columns stack automatically on narrow screens. */
  columns?: typeof STORY_LAYOUT_OPTIONS.chapterColumns[number];
  /** Hidden chapters remain in the document and can be shown again. */
  hidden?: boolean;
}

export interface StoryFact {
  id?: string;
  label: string;
  value: string;
  hidden?: boolean;
}

export interface StoryCredit {
  id?: string;
  name: string;
  role: string;
  hidden?: boolean;
}

export interface StoryDecisionDetail {
  id?: string;
  title: string;
  /** Safe inline markup supports bold, italic, and links. */
  detail: string;
  /** Reader-facing initial state; the native disclosure remains interactive. */
  expanded?: boolean;
}

export interface StoryDecisionSection {
  title: string;
  intro?: string;
  items: StoryDecisionDetail[];
  /** Hidden sections remain in the immutable draft and can be restored. */
  hidden?: boolean;
}

export interface StoryVisibility {
  facts?: boolean;
  heroMedia?: boolean;
  readTime?: boolean;
  glance?: boolean;
  headlineOutcomes?: boolean;
  counterfactual?: boolean;
  hindsight?: boolean;
  credits?: boolean;
}

/** The plate colour media sits on. Maps to the surface tokens in tokens.css. */
export type StoryTone = typeof STORY_LAYOUT_OPTIONS.tone[number];

export interface Story {
  slug: string;
  company: string;
  companyLogo?: string;
  /** Saved logo variant from the assigned company, otherwise inherit its default. */
  companyLogoId?: string;
  title: string;
  /** One sentence: as [role], I [key move], which [outcome]. Under the title. */
  thesis: string;
  /** Shown beside the logo, e.g. "2025" or "2025 — 2026". */
  period?: string;
  /** Optional four-digit year for this case study, independent of its company. */
  projectYear?: string;
  /** Shipped, Beta, Internal, Concept, Sunset — what state the work is in. */
  status?: string;
  /** How much is shown and how: "Customer anonymized", "Recreated; data fictional". */
  disclosure?: string;
  facts: StoryFact[];
  hero?: StoryMedia;
  /** Optional media selected specifically for Home/Work cards. It reuses the
   * same protected-media vocabulary as the reader without changing its hero. */
  workPreview?: StoryMedia;
  /** Optional secondary visual beside the hero copy. */
  heroGraphic?: StoryMedia;
  heroLayout?: 'standard' | 'split-graphic';
  /** Optional top-level hero treatment. Legacy drafts default to the shared
   * edition cover without rewriting their stored content. */
  heroPresentation?: 'edition-cover' | 'offset-plate';
  /** STAR in four sentences, for the reader who only has thirty seconds. */
  glance: Record<StarChapterKey, string>;
  /** `clean` removes editorial chrome and repeated role/team/timeline facts.
   * `none` lets an authored story move directly from its hero into the chapters. */
  glancePresentation?: typeof STORY_LAYOUT_OPTIONS.glancePresentation[number];
  /** Two or three headline results, with how they're known. */
  outcomes?: StoryOutcome[];
  /** What wouldn't have happened without me — one sentence. */
  counterfactual?: string;
  /** Named collaborators and roles. Closes the story. */
  credits?: StoryCredit[];
  /** The credits' heading. Blank or absent prints "Made with". */
  creditsTitle?: string;
  chapters: StoryChapter[];
  /** Optional closing accordion for decisions that benefit from more detail. */
  decisions?: StoryDecisionSection;
  /** Hindsight — what I'd do differently. Closes the story. */
  hindsight?: { title: string; paragraphs: string[] };
  tone?: StoryTone;
  /** Curated next reads; the first one becomes the "next" card. */
  related?: string[];
  /** One line for the next-study card. Falls back to the thesis. */
  summary?: string;
  /** Optional presentation switches. Omitted values are visible, preserving
   * every existing document without a migration. */
  visibility?: StoryVisibility;
}

/** What the next-study card needs — resolved on the server. */
export interface StoryTeaser {
  slug: string;
  title: string;
  company: string;
  summary: string;
}
