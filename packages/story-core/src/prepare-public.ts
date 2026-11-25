import type { Story, StoryBlock, StoryChapter, StoryInsightColumn, StoryMedia } from './types.js';
import { completedCta } from './cta.js';
import { resolvePublishedMedia, type MediaResolveOptions } from './media.js';
import { normalizeYouTubeUrl } from './youtube.js';
import { normalizePdfUrl } from './pdf.js';
import { isPlainJsonObject } from './json.js';
import { hasText, toSet } from './internal.js';

/*
 * A story can be published unfinished (the publish checklist lists what's
 * missing as notes), so readers get what's written and nothing that isn't:
 * a block with no text is left out, as are the empty rows of a list. A block
 * that is only partly written keeps its written parts.
 *
 * Every piece of media is resolved once. What can't load is removed rather
 * than framed, and what can load keeps its URLs but loses its `shot`: the
 * production notes (sources, what to crop, which recordings hold private
 * data) never reach the page payload.
 */

export interface PreparePublicOptions extends MediaResolveOptions {
  /** The custom block components the host registers. When given, a custom
   *  block naming anything else is left out of the page. */
  customBlocks?: Iterable<string>;
}

interface Context {
  media: MediaResolveOptions;
  customBlocks: ReadonlySet<string> | null;
}

function withoutShot(media: StoryMedia): StoryMedia {
  const out: StoryMedia = { ...media };
  delete out.shot;
  return out;
}

function publicMedia(media: StoryMedia | undefined, context: Context): StoryMedia | null {
  if (!media) return null;
  if (media.sourceMode === 'youtube') {
    const youtubeUrl = normalizeYouTubeUrl(media.youtubeUrl);
    return youtubeUrl ? withoutShot({ ...media, youtubeUrl }) : null;
  }
  if (media.sourceMode === 'pdf') {
    const pdfUrl = normalizePdfUrl(media.pdfUrl);
    return pdfUrl ? withoutShot({ ...media, pdfUrl }) : null;
  }
  const { src, poster } = resolvePublishedMedia(media, context.media);
  if (!src) return null;
  const out = withoutShot({ ...media, src, ...(poster ? { poster } : {}) });
  if (!poster) delete out.poster;
  return out;
}

function mediaList(items: readonly StoryMedia[], context: Context): StoryMedia[] {
  return items.map((media) => publicMedia(media, context)).filter((media): media is StoryMedia => media !== null);
}

function prepareBlock(block: StoryBlock, context: Context): StoryBlock | null {
  switch (block.type) {
    case 'media': {
      const media = publicMedia(block.media, context);
      return media ? { ...block, media } : null;
    }
    case 'cta': {
      const cta = completedCta(block.label, block.href, block.newTab);
      if (!cta) return null;
      const out = { ...block, ...cta };
      if (!cta.newTab) delete out.newTab;
      return out;
    }
    // Nothing to read, nothing on the page; a table keeps its empty cells.
    case 'table':
      return block.rows.some((row) => row.some(hasText)) ? block : null;
    case 'code':
      return hasText(block.code) ? block : null;
    case 'custom': {
      if (!hasText(block.component)) return null;
      if (context.customBlocks && !context.customBlocks.has(block.component)) return null;
      if (block.props !== undefined && !isPlainJsonObject(block.props)) return null;
      return block;
    }
    case 'gallery': {
      const items = mediaList(block.items, context);
      if (!items.length) return null;
      // A row or stack left with one image reads as that image on its own,
      // its caption shown; a grid keeps its plate.
      if (items.length === 1 && (block.layout ?? 'grid') !== 'grid') {
        const [media] = items;
        return {
          type: 'media',
          ...(block.id ? { id: block.id } : {}),
          media: media.caption || !block.caption ? media : { ...media, caption: block.caption },
          width: (media.aspect ?? 1.6) >= 1.3 ? 'wide' : 'text',
        };
      }
      return { ...block, items };
    }
    case 'decision': {
      if (!hasText(block.call) && !hasText(block.because)) return null;
      if (!block.media) return block;
      const media = publicMedia(block.media, context);
      const out = { ...block };
      if (media) out.media = media;
      else delete out.media;
      return out;
    }
    case 'prose':
      return block.paragraphs.some(hasText) ? block : null;
    case 'subhead':
    case 'note':
      return hasText(block.text) ? block : null;
    case 'quote':
      return hasText(block.quote.quote) ? block : null;
    case 'callout':
      return block.body.paragraphs.some(hasText) ? block : null;
    case 'insight': {
      // Media without footage goes; the card leaves out its other empty
      // parts itself, and an empty card goes whole.
      const columns = block.columns.map((column) => {
        if (!column.media) return column;
        const media = mediaList(column.media, context);
        const next: StoryInsightColumn = { ...column, media };
        if (!media.length) delete next.media;
        return next;
      });
      const written = hasText(block.title) || columns.some((column) => column.body.paragraphs.some(hasText) || column.media?.length);
      return written ? { ...block, columns } : null;
    }
    case 'steps': {
      const items = block.items.filter((item) => hasText(item.title) || hasText(item.body));
      return items.length ? { ...block, items } : null;
    }
    case 'outcomes': {
      const items = block.items.filter((item) => hasText(item.value) || hasText(item.label));
      return items.length ? { ...block, items } : null;
    }
    case 'metrics': {
      const items = block.items.filter((item) => hasText(item.value) || hasText(item.description));
      return items.length ? { ...block, items } : null;
    }
    case 'ledger': {
      const keep = (items: string[] | undefined) => items?.filter(hasText);
      const ledger = {
        ...block.ledger,
        led: keep(block.ledger.led),
        made: keep(block.ledger.made),
        influenced: keep(block.ledger.influenced),
        notMe: keep(block.ledger.notMe),
        partners: block.ledger.partners?.filter((partner) => hasText(partner.role) || hasText(partner.owned)),
      };
      const written = [ledger.led, ledger.made, ledger.influenced, ledger.notMe, ledger.partners].some((items) => items?.length);
      return written ? { ...block, ledger } : null;
    }
    case 'implemented':
    case 'influenced': {
      const items = block.items.filter(hasText);
      if (!items.length) return null;
      if (block.type === 'implemented') {
        const publicBlock = { ...block };
        delete publicBlock.sourceLedger;
        return { ...publicBlock, items };
      }
      return { ...block, items };
    }
    case 'partners': {
      const items = block.items.filter((partner) => hasText(partner.role) || hasText(partner.owned));
      return items.length ? { ...block, items } : null;
    }
    case 'contribution': {
      const publicBlock = { ...block };
      delete publicBlock.sourceLedger;
      if (block.variant === 'partners') {
        const items = block.items.filter((item): item is { role: string; owned: string } => typeof item !== 'string' && (hasText(item.role) || hasText(item.owned)));
        return items.length ? { ...publicBlock, items } : null;
      }
      const items = block.items.filter((item): item is string => typeof item === 'string' && hasText(item));
      return items.length ? { ...publicBlock, items } : null;
    }
    case 'collaboration': {
      const groups = block.map.groups.filter((group) => hasText(group.label) || hasText(group.detail));
      const center = hasText(block.map.center.label) || hasText(block.map.center.detail);
      return center || groups.length ? { ...block, map: { ...block.map, groups } } : null;
    }
    case 'followUp': {
      const items = block.items.flatMap((item) => {
        if (!hasText(item.title) && !hasText(item.teaser)) return [];
        const media = publicMedia(item.media, context);
        const next = { ...item };
        if (media) next.media = media;
        else delete next.media;
        if (!item.link?.href || (!hasText(item.link.label) && !hasText(item.title))) delete next.link;
        return [next];
      });
      if (!items.length) return null;
      const next = { ...block, items };
      const cta = block.cta && completedCta(block.cta.label, block.cta.href);
      if (cta) next.cta = { label: cta.label, href: cta.href };
      else delete next.cta;
      return next;
    }
    default:
      return block;
  }
}

function prepareChapter(chapter: StoryChapter, context: Context): StoryChapter {
  const blocks = chapter.blocks
    .filter((block) => !block.hidden)
    .map((block) => prepareBlock(block, context))
    .filter((block): block is StoryBlock => block !== null);
  // A subheading with nothing after it heads nothing.
  return { ...chapter, blocks: blocks.filter((block, index) => block.type !== 'subhead' || (blocks[index + 1] && blocks[index + 1].type !== 'subhead')) };
}

/**
 * The story as a reader's browser should receive it: what's written and can
 * load, with production notes removed. The same preparation serves the live
 * page and an editor's faithful preview. Hidden chapters and blocks are
 * removed too, since a reader never sees them.
 */
export function preparePublicStory(story: Story, options: PreparePublicOptions = {}): Story {
  const context: Context = {
    media: options,
    customBlocks: options.customBlocks ? toSet(options.customBlocks) : null,
  };
  const visibility = story.visibility ?? {};
  const hero = visibility.heroMedia === false ? undefined : publicMedia(story.hero, context) ?? undefined;
  const workPreview = publicMedia(story.workPreview, context) ?? undefined;
  const heroGraphic = publicMedia(story.heroGraphic, context) ?? undefined;
  const hindsight = story.hindsight && { ...story.hindsight, paragraphs: story.hindsight.paragraphs.filter(hasText) };
  const decisions = story.decisions && !story.decisions.hidden
    ? { ...story.decisions, items: story.decisions.items.filter((item) => hasText(item.title) || hasText(item.detail)) }
    : undefined;
  const out: Story = {
    ...story,
    hero,
    workPreview,
    heroGraphic,
    ...(story.heroLayout === 'split-graphic' && !heroGraphic ? { heroLayout: 'standard' as const } : {}),
    facts: story.facts.filter((fact) => !fact.hidden && (hasText(fact.label) || hasText(fact.value))),
    credits: story.credits?.filter((credit) => !credit.hidden && (hasText(credit.name) || hasText(credit.role))),
    decisions: decisions?.items.length ? decisions : undefined,
    hindsight: hindsight?.paragraphs.length ? hindsight : undefined,
    chapters: story.chapters.filter((chapter) => !chapter.hidden).map((chapter) => prepareChapter(chapter, context)),
  };
  for (const key of ['hero', 'workPreview', 'heroGraphic', 'decisions', 'hindsight', 'credits'] as const) {
    if (out[key] === undefined) delete out[key];
  }
  return out;
}

export interface PrepareStoryOptions extends PreparePublicOptions {
  /** In development the story passes through untouched: shot slots and draft
   *  badges are the point there. */
  development?: boolean;
}

/** `preparePublicStory`, except in development, where the story is returned as is. */
export function prepareStory(story: Story, { development = false, ...options }: PrepareStoryOptions = {}): Story {
  return development ? story : preparePublicStory(story, options);
}
