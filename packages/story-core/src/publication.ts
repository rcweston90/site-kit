import type { Story, StoryBlock, StoryMedia } from './types.js';
import type { PublicationIssue, PublicationIssueCode, PublicationReadiness } from './contract.js';
import { isSupportedMediaSource } from './media-source.js';
import { normalizeYouTubeUrl } from './youtube.js';
import { normalizePdfUrl } from './pdf.js';
import { customPropsProblem } from './model.js';
import { hasText, toSet } from './internal.js';

/*
 * Publication readiness: unfinished never blocks publishing.
 *
 * Only what would break or endanger the live page stops a publish: a story
 * that isn't valid, or a media source that isn't a path or a web address.
 * Everything else is a note: unfinished text, footage not uploaded yet,
 * missing descriptions, a custom block the host doesn't register. The author
 * can publish past notes; the checklist keeps them in view, and the reader
 * leaves out what's empty (prepare-public.ts) instead of printing a gap.
 */

export interface PublicationValidationOptions {
  /** Every story that exists. When given, related stories are checked against it. */
  knownSlugs?: Iterable<string>;
  /** Keys in the host's media store. A media item whose only source is an
   *  uploaded draft key counts as having footage. */
  uploadedMediaKeys?: Iterable<string>;
  /** The custom block components the host registers. When given, a custom
   *  block naming anything else is a note (`unknown-custom-block`). */
  customBlocks?: Iterable<string>;
}

const BLOCKING = new Set<PublicationIssueCode>(['invalid-story', 'invalid-media-source']);

/** Whether an issue with this code stops a publish. */
export function isBlockingIssue(code: PublicationIssueCode): boolean {
  return BLOCKING.has(code);
}

function issue(issues: PublicationIssue[], code: PublicationIssueCode, path: string, message: string) {
  issues.push({ severity: BLOCKING.has(code) ? 'error' : 'warning', code, path, message });
}

/** Whether a reader would see something load for this media. */
export function hasPublishableMediaSource(
  media: StoryMedia | undefined,
  uploadedMediaKeys: Iterable<string> = [],
): boolean {
  if (!media) return false;
  if (media.sourceMode === 'youtube') return Boolean(normalizeYouTubeUrl(media.youtubeUrl));
  if (media.sourceMode === 'pdf') return Boolean(normalizePdfUrl(media.pdfUrl));
  if (isSupportedMediaSource(media.src)) return true;
  return Boolean(media.shot?.draft && toSet(uploadedMediaKeys).has(media.shot.draft));
}

function requireVisibleText(issues: PublicationIssue[], value: string | undefined, path: string, label: string) {
  if (!hasText(value)) issue(issues, 'empty-visible-content', path, `${label} is visible but empty.`);
}

function requireMedia(issues: PublicationIssue[], media: StoryMedia, path: string, uploaded: ReadonlySet<string>) {
  if (media.sourceMode === 'youtube') {
    if (!normalizeYouTubeUrl(media.youtubeUrl)) {
      issue(issues, 'invalid-media-source', `${path}.youtubeUrl`, 'Paste a valid YouTube video link.');
      return;
    }
    if (!hasText(media.alt)) issue(issues, 'missing-media-alt', `${path}.alt`, 'Embedded video needs an accessible title.');
    return;
  }
  if (media.sourceMode === 'pdf') {
    // An empty link is unfinished (a note); only a link that can't load blocks.
    if (!hasText(media.pdfUrl)) {
      issue(issues, 'unresolved-required-media', `${path}.pdfUrl`, 'Link the PDF this module embeds.');
      return;
    }
    if (!normalizePdfUrl(media.pdfUrl)) {
      issue(issues, 'invalid-media-source', `${path}.pdfUrl`, 'Link a PDF: a path or an https URL ending in .pdf.');
      return;
    }
    if (!hasText(media.alt)) issue(issues, 'missing-media-alt', `${path}.alt`, 'Embedded document needs an accessible title.');
    return;
  }
  if (hasText(media.src) && !isSupportedMediaSource(media.src)) {
    issue(issues, 'invalid-media-source', `${path}.src`, 'Media sources must be a path or an HTTP(S) URL.');
    return;
  }
  if (hasText(media.poster) && !isSupportedMediaSource(media.poster)) {
    issue(issues, 'invalid-media-source', `${path}.poster`, 'Video posters must be a path or an HTTP(S) URL.');
    return;
  }
  if (!hasPublishableMediaSource(media, uploaded)) {
    issue(issues, 'unresolved-required-media', path, 'This visible media module has no source a reader can load yet.');
    return;
  }
  if (!hasText(media.alt)) issue(issues, 'missing-media-alt', `${path}.alt`, 'Published media needs alternative text.');
}

interface VisibleContext {
  issues: PublicationIssue[];
  uploaded: ReadonlySet<string>;
  customBlocks: ReadonlySet<string> | null;
}

function validateVisibleBlock(block: StoryBlock, path: string, { issues, uploaded, customBlocks }: VisibleContext) {
  switch (block.type) {
    case 'prose':
      if (!block.paragraphs.some(hasText)) {
        issue(issues, 'empty-visible-content', `${path}.paragraphs`, 'Visible prose needs at least one non-empty paragraph.');
      }
      break;
    case 'subhead':
      requireVisibleText(issues, block.text, `${path}.text`, 'Visible subheading');
      break;
    case 'note':
      requireVisibleText(issues, block.text, `${path}.text`, 'Visible note');
      break;
    case 'media':
      requireMedia(issues, block.media, `${path}.media`, uploaded);
      break;
    case 'table':
      if (!block.rows.some((row) => row.some(hasText))) issue(issues, 'empty-visible-content', `${path}.rows`, 'Visible table needs at least one filled cell.');
      break;
    case 'code':
      requireVisibleText(issues, block.code, `${path}.code`, 'Visible code');
      break;
    case 'custom': {
      const props = customPropsProblem(block.props, path);
      if (props) issue(issues, 'invalid-story', `${path}.props`, props);
      if (!hasText(block.component)) {
        issue(issues, 'empty-visible-content', `${path}.component`, 'Choose which custom block this is.');
      } else if (customBlocks && !customBlocks.has(block.component)) {
        issue(issues, 'unknown-custom-block', `${path}.component`, `No custom block named “${block.component}” is registered, so readers won't see it.`);
      }
      break;
    }
    case 'gallery':
      if (block.items.length === 0) issue(issues, 'empty-visible-content', `${path}.items`, 'Visible image group needs at least one image or video.');
      block.items.forEach((media, index) => requireMedia(issues, media, `${path}.items[${index}]`, uploaded));
      break;
    case 'decision':
      requireVisibleText(issues, block.call, `${path}.call`, 'Visible decision call');
      requireVisibleText(issues, block.because, `${path}.because`, 'Visible decision rationale');
      block.options?.forEach((option, index) => {
        requireVisibleText(issues, option.label, `${path}.options[${index}].label`, 'Visible decision option label');
        requireVisibleText(issues, option.whyNot, `${path}.options[${index}].whyNot`, 'Visible decision option rationale');
      });
      block.mechanism?.forEach((step, index) => requireVisibleText(issues, step, `${path}.mechanism[${index}]`, 'Visible decision mechanism step'));
      if (block.media) requireMedia(issues, block.media, `${path}.media`, uploaded);
      break;
    case 'insight':
      requireVisibleText(issues, block.title, `${path}.title`, 'Visible insight title');
      if (block.label !== undefined) requireVisibleText(issues, block.label, `${path}.label`, 'Visible insight label');
      if (block.columns.length === 0) issue(issues, 'empty-visible-content', `${path}.columns`, 'Visible insight needs at least one column.');
      block.columns.forEach((column, index) => {
        requireVisibleText(issues, column.label, `${path}.columns[${index}].label`, 'Visible insight column heading');
        if (!column.body.paragraphs.some(hasText) && !column.media?.length) {
          issue(issues, 'empty-visible-content', `${path}.columns[${index}].body`, 'Visible insight column has no text.');
        }
        column.media?.forEach((media, at) => requireMedia(issues, media, `${path}.columns[${index}].media[${at}]`, uploaded));
      });
      block.steps?.forEach((step, index) => requireVisibleText(issues, step, `${path}.steps[${index}]`, 'Visible insight step'));
      if (block.footer && !block.footer.body.paragraphs.some(hasText)) {
        issue(issues, 'empty-visible-content', `${path}.footer.body`, 'Visible insight closing line has no text.');
      }
      break;
    case 'quote':
      requireVisibleText(issues, block.quote.quote, `${path}.quote.quote`, 'Visible quotation');
      // Anonymised quotes keep only a role; only a quote with no attribution
      // at all is a problem.
      if (!hasText(block.quote.name) && !hasText(block.quote.role)) {
        issue(issues, 'empty-visible-content', `${path}.quote.role`, 'Visible quotation needs a name or a role.');
      }
      break;
    case 'callout':
      if (!block.body.paragraphs.some(hasText)) issue(issues, 'empty-visible-content', `${path}.body`, 'Visible callout needs body text.');
      break;
    case 'cta':
      requireVisibleText(issues, block.label, `${path}.label`, 'Visible button label');
      requireVisibleText(issues, block.href, `${path}.href`, 'Visible button link');
      break;
    case 'metrics':
      if (block.items.length === 0) issue(issues, 'empty-visible-content', `${path}.items`, 'Visible metrics need at least one item.');
      block.items.forEach((item, index) => {
        requireVisibleText(issues, item.value, `${path}.items[${index}].value`, 'Visible metric value');
        requireVisibleText(issues, item.description, `${path}.items[${index}].description`, 'Visible metric description');
      });
      break;
    case 'outcomes': {
      const visibleItems = block.items.map((item, index) => ({ item, index })).filter(({ item }) => !item.hidden);
      if (visibleItems.length === 0) issue(issues, 'empty-visible-content', `${path}.items`, 'Visible outcomes need at least one visible item.');
      visibleItems.forEach(({ item, index }) => {
        requireVisibleText(issues, item.value, `${path}.items[${index}].value`, 'Visible outcome value');
        requireVisibleText(issues, item.label, `${path}.items[${index}].label`, 'Visible outcome label');
      });
      break;
    }
    case 'ledger': {
      const groups = ['led', 'made', 'influenced', 'notMe'] as const;
      const authored = groups.flatMap((group) => (block.ledger[group] ?? []).map((value, index) => {
        requireVisibleText(issues, value, `${path}.ledger.${group}[${index}]`, 'Visible contribution item');
        return value;
      }));
      (block.ledger.partners ?? []).forEach((partner, index) => {
        requireVisibleText(issues, partner.role, `${path}.ledger.partners[${index}].role`, 'Visible partner role');
        requireVisibleText(issues, partner.owned, `${path}.ledger.partners[${index}].owned`, 'Visible partner ownership');
        authored.push(partner.role, partner.owned);
      });
      if (!authored.some(hasText)) issue(issues, 'empty-visible-content', `${path}.ledger`, 'Visible contribution ledger needs at least one non-empty item.');
      break;
    }
    case 'implemented':
    case 'influenced':
      if (block.items.length === 0) issue(issues, 'empty-visible-content', `${path}.items`, `Visible ${block.type} section needs at least one item.`);
      block.items.forEach((item, index) => requireVisibleText(issues, item, `${path}.items[${index}]`, `Visible ${block.type} item`));
      break;
    case 'partners':
      if (block.items.length === 0) issue(issues, 'empty-visible-content', `${path}.items`, 'Visible partners section needs at least one partner.');
      block.items.forEach((partner, index) => {
        requireVisibleText(issues, partner.role, `${path}.items[${index}].role`, 'Visible partner role');
        requireVisibleText(issues, partner.owned, `${path}.items[${index}].owned`, 'Visible partner ownership');
      });
      break;
    case 'contribution':
      if (block.items.length === 0) issue(issues, 'empty-visible-content', `${path}.items`, `Visible ${block.variant} section needs at least one item.`);
      block.items.forEach((item, index) => {
        if (block.variant === 'partners') {
          if (typeof item === 'string') return;
          requireVisibleText(issues, item.role, `${path}.items[${index}].role`, 'Visible partner role');
          requireVisibleText(issues, item.owned, `${path}.items[${index}].owned`, 'Visible partner ownership');
        } else if (typeof item === 'string') {
          requireVisibleText(issues, item, `${path}.items[${index}]`, `Visible ${block.variant} item`);
        }
      });
      break;
    case 'collaboration':
      requireVisibleText(issues, block.map.center.label, `${path}.map.center.label`, 'Visible collaboration center label');
      requireVisibleText(issues, block.map.center.detail, `${path}.map.center.detail`, 'Visible collaboration center detail');
      if (block.map.groups.length === 0) issue(issues, 'empty-visible-content', `${path}.map.groups`, 'Visible collaboration map needs at least one group.');
      block.map.groups.forEach((group, index) => {
        requireVisibleText(issues, group.label, `${path}.map.groups[${index}].label`, 'Visible collaboration group label');
        requireVisibleText(issues, group.detail, `${path}.map.groups[${index}].detail`, 'Visible collaboration group detail');
      });
      break;
    case 'followUp':
      requireVisibleText(issues, block.heading, `${path}.heading`, 'Visible follow-up heading');
      if (block.items.length === 0) issue(issues, 'empty-visible-content', `${path}.items`, 'Visible follow-up section needs at least one topic.');
      block.items.forEach((item, index) => {
        requireVisibleText(issues, item.title, `${path}.items[${index}].title`, 'Visible follow-up topic title');
        requireVisibleText(issues, item.teaser, `${path}.items[${index}].teaser`, 'Visible follow-up topic teaser');
        if (item.media) requireMedia(issues, item.media, `${path}.items[${index}].media`, uploaded);
      });
      break;
    case 'steps':
      if (block.items.length === 0) issue(issues, 'empty-visible-content', `${path}.items`, 'Visible steps need at least one item.');
      block.items.forEach((item, index) => {
        requireVisibleText(issues, item.title, `${path}.items[${index}].title`, 'Visible step title');
        requireVisibleText(issues, item.body, `${path}.items[${index}].body`, 'Visible step body');
      });
      break;
  }
}

/**
 * Publication preflight. Draft validation stays permissive so an editor can
 * save incomplete work; this examines only what a reader would see, and
 * blocks only on what would break it. Hidden blocks and sections, and
 * intentionally text-only sections, are never a problem.
 */
export function validatePublication(story: Story, options: PublicationValidationOptions = {}): PublicationReadiness {
  const issues: PublicationIssue[] = [];
  const uploaded = toSet(options.uploadedMediaKeys);
  const context: VisibleContext = { issues, uploaded, customBlocks: options.customBlocks ? toSet(options.customBlocks) : null };

  if (story.visibility?.heroMedia !== false && story.hero) {
    if (hasText(story.hero.src) && !isSupportedMediaSource(story.hero.src)) {
      issue(issues, 'invalid-media-source', 'story.hero.src', 'Hero media sources must be a path or an HTTP(S) URL.');
    } else if (hasText(story.hero.poster) && !isSupportedMediaSource(story.hero.poster)) {
      issue(issues, 'invalid-media-source', 'story.hero.poster', 'Hero video posters must be a path or an HTTP(S) URL.');
    } else if (!hasPublishableMediaSource(story.hero, uploaded)) {
      issue(issues, 'unresolved-optional-media', 'story.hero', 'Optional hero media will be left out of the published page.');
    } else if (!hasText(story.hero.alt)) {
      issue(issues, 'missing-media-alt', 'story.hero.alt', 'Published hero media needs alternative text.');
    }
  }
  if (story.workPreview) requireMedia(issues, story.workPreview, 'story.workPreview', uploaded);
  if (hasText(story.companyLogo) && !isSupportedMediaSource(story.companyLogo)) {
    issue(issues, 'invalid-media-source', 'story.companyLogo', 'Company logo sources must be a path or an HTTP(S) URL.');
  }
  if (story.heroLayout === 'split-graphic') {
    if (!story.heroGraphic) {
      issue(issues, 'unresolved-required-media', 'story.heroGraphic', 'Split-graphic heroes need a graphic a reader can load.');
    } else {
      requireMedia(issues, story.heroGraphic, 'story.heroGraphic', uploaded);
    }
  }

  if (story.visibility?.facts !== false) {
    story.facts.forEach((fact, index) => {
      if (fact.hidden) return;
      requireVisibleText(issues, fact.label, `story.facts[${index}].label`, 'Visible fact label');
      requireVisibleText(issues, fact.value, `story.facts[${index}].value`, 'Visible fact value');
    });
  }

  story.chapters.forEach((chapter, chapterIndex) => {
    if (chapter.hidden) return;
    const chapterPath = `story.chapters[${chapterIndex}]`;
    const visible = chapter.blocks.map((block, index) => ({ block, index })).filter(({ block }) => !block.hidden);
    // Spacers and dividers are layout, not content: a section of only those is empty.
    if (!visible.some(({ block }) => block.type !== 'spacer' && block.type !== 'divider')) {
      issue(issues, 'empty-visible-content', `${chapterPath}.blocks`, `${chapter.key} is visible but has no visible modules.`);
      return;
    }
    visible.forEach(({ block, index }) => validateVisibleBlock(block, `${chapterPath}.blocks[${index}]`, context));
    visible.forEach(({ block, index }, at) => {
      const next = visible[at + 1]?.block;
      if (block.type === 'subhead' && (!next || next.type === 'subhead')) {
        issue(issues, 'empty-visible-content', `${chapterPath}.blocks[${index}]`, 'A visible subheading needs a visible content module after it.');
      }
    });
  });

  if (story.decisions && !story.decisions.hidden) {
    requireVisibleText(issues, story.decisions.title, 'story.decisions.title', 'Visible decisions title');
    if (story.decisions.items.length === 0) issue(issues, 'empty-visible-content', 'story.decisions.items', 'Visible decisions section needs at least one item.');
    story.decisions.items.forEach((item, index) => {
      requireVisibleText(issues, item.title, `story.decisions.items[${index}].title`, 'Visible decision title');
      requireVisibleText(issues, item.detail, `story.decisions.items[${index}].detail`, 'Visible decision detail');
    });
  }

  if (story.visibility?.hindsight !== false && story.hindsight) {
    requireVisibleText(issues, story.hindsight.title, 'story.hindsight.title', 'Visible hindsight title');
    if (!story.hindsight.paragraphs.some(hasText)) issue(issues, 'empty-visible-content', 'story.hindsight.paragraphs', 'Visible hindsight needs at least one paragraph.');
  }

  if (story.visibility?.credits !== false && story.credits) {
    const visibleCredits = story.credits.map((credit, index) => ({ credit, index })).filter(({ credit }) => !credit.hidden);
    if (story.credits.length > 0 && visibleCredits.length === 0) {
      issue(issues, 'empty-visible-content', 'story.credits', 'The visible credits section needs at least one visible credit.');
    }
    visibleCredits.forEach(({ credit, index }) => {
      requireVisibleText(issues, credit.name, `story.credits[${index}].name`, 'Visible credit name');
      requireVisibleText(issues, credit.role, `story.credits[${index}].role`, 'Visible credit role');
    });
  }

  if (options.knownSlugs) {
    const knownSlugs = toSet(options.knownSlugs);
    const seen = new Set<string>();
    story.related?.forEach((slug, index) => {
      if (slug === story.slug) issue(issues, 'self-related-story', `story.related[${index}]`, 'A story cannot recommend itself.');
      if (seen.has(slug)) issue(issues, 'duplicate-related-story', `story.related[${index}]`, `Related story “${slug}” is listed twice.`);
      seen.add(slug);
      if (!knownSlugs.has(slug)) issue(issues, 'broken-related-story', `story.related[${index}]`, `Related story “${slug}” does not exist.`);
    });
  }

  return {
    errors: issues.filter((entry) => entry.severity === 'error'),
    warnings: issues.filter((entry) => entry.severity === 'warning'),
  };
}
