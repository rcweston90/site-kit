import {
  EVIDENCE_LABEL,
  STORY_BLOCK_TYPES,
  STORY_CHAPTERS,
  STORY_LAYOUT_OPTIONS,
  STORY_LIST_MAX_DEPTH,
  isStoryHeadingLevel,
} from './types.js';
import type { StoryDocumentSeed } from './document.js';
import { contentSha256, stableJson, storyDocumentId } from './identity.js';
import { MEDIA_APPEARANCE_LIMITS, MEDIA_APPEARANCE_OPTIONS, MEDIA_EXPANSION_KEYS } from './media-appearance.js';
import { IMAGE_ZOOM_LEVELS } from './image-lightbox.js';
import { normalizeYouTubeUrl } from './youtube.js';
import { isOptionalProjectYear, PROJECT_YEAR_ERROR } from './project-year.js';
import { normalizePdfUrl } from './pdf.js';
import { upgradeLegacyMediaBlock } from './media-groups.js';
import { ctaHref, ctaLabel } from './cta.js';
import { plainJsonProblem } from './json.js';
import { isRecord, SLUG_PATTERN } from './internal.js';

/*
 * Structural validation. A story that passes `validateStory` has the shape
 * the types describe, every enum value is one a renderer knows, nothing in
 * it reaches a reader's inline style unchecked, and it serializes to stable
 * JSON. It says nothing about completeness: see publication.ts for that.
 */

/** A chapter's stable key. Never derived from its editable title. */
export const STORY_SECTION_KEY_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,95})$/;
/** A logo variant id the host keeps for a company. */
export const COMPANY_LOGO_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,79}$/;
/** A custom block's component name, as the host's registry keys it. */
export const CUSTOM_BLOCK_COMPONENT_PATTERN = /^[A-Za-z][A-Za-z0-9_.:/-]{0,95}$/;

const BLOCK_TYPES = new Set<string>(STORY_BLOCK_TYPES);
const EVIDENCE_TYPES = Object.keys(EVIDENCE_LABEL);

function requireString(record: Record<string, unknown>, key: string, path: string, errors: string[], nonEmpty = false) {
  const value = record[key];
  if (typeof value !== 'string' || (nonEmpty && value.trim() === '')) {
    errors.push(`${path}.${key} must be ${nonEmpty ? 'a non-empty string' : 'a string'}.`);
  }
}

function optionalString(record: Record<string, unknown>, key: string, path: string, errors: string[]) {
  if (record[key] !== undefined && typeof record[key] !== 'string') {
    errors.push(`${path}.${key} must be a string when present.`);
  }
}

function optionalBoolean(record: Record<string, unknown>, key: string, path: string, errors: string[]) {
  if (record[key] !== undefined && typeof record[key] !== 'boolean') {
    errors.push(`${path}.${key} must be a boolean when present.`);
  }
}

function optionalEnum(record: Record<string, unknown>, key: string, path: string, allowed: readonly string[], errors: string[]) {
  const value = record[key];
  if (value !== undefined && (typeof value !== 'string' || !allowed.includes(value))) {
    errors.push(`${path}.${key} must be one of: ${allowed.join(', ')}.`);
  }
}

/** A link a reader can follow from media or a follow-up topic. */
function validateLink(value: unknown, path: string, errors: string[]) {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object when present.`);
    return;
  }
  requireString(value, 'href', path, errors, true);
  optionalString(value, 'label', path, errors);
  const href = value.href;
  if (typeof href === 'string' && href.trim() && !/^\/(?!\/)/.test(href) && !/^https?:\/\//i.test(href)) {
    errors.push(`${path}.href must be a path or an http(s) URL.`);
  }
}

/** `large` on rich text: paragraph positions, ascending, each once. */
function validateLargeParagraphs(value: unknown, paragraphs: unknown, path: string, errors: string[]) {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array of paragraph positions when present.`);
    return;
  }
  const count = Array.isArray(paragraphs) ? paragraphs.length : 0;
  value.forEach((item, index) => {
    if (!Number.isInteger(item) || (item as number) < 0 || (item as number) >= count) {
      errors.push(`${path}[${index}] must be a whole-number paragraph position from 0 to ${Math.max(count - 1, 0)}.`);
    } else if (index > 0 && Number.isInteger(value[index - 1]) && (item as number) <= (value[index - 1] as number)) {
      errors.push(`${path}[${index}] must be greater than the position before it (ascending, each once).`);
    }
  });
}

function validateRichTextHeadings(value: unknown, paragraphs: unknown, path: string, errors: string[]) {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array of subheading positions when present.`);
    return;
  }
  const count = Array.isArray(paragraphs) ? paragraphs.length : 0;
  const seen = new Set<number>();
  value.forEach((item, at) => {
    if (!isRecord(item) || !Number.isInteger(item.index) || (item.index as number) < 0 || (item.index as number) >= count) {
      errors.push(`${path}[${at}].index must be a whole-number paragraph position from 0 to ${Math.max(count - 1, 0)}.`);
      return;
    }
    if (!isStoryHeadingLevel(item.level)) errors.push(`${path}[${at}].level must be a heading level from 2 to 6.`);
    if (seen.has(item.index as number)) errors.push(`${path}[${at}].index must be unique.`);
    seen.add(item.index as number);
  });
}

/** `listItems` on rich text: list items among paragraphs, by position. */
function validateRichTextListItems(value: unknown, paragraphs: unknown, path: string, errors: string[]) {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array of list item positions when present.`);
    return;
  }
  const count = Array.isArray(paragraphs) ? paragraphs.length : 0;
  const seen = new Set<number>();
  value.forEach((item, at) => {
    if (!isRecord(item) || !Number.isInteger(item.index) || (item.index as number) < 0 || (item.index as number) >= count) {
      errors.push(`${path}[${at}].index must be a whole-number paragraph position from 0 to ${Math.max(count - 1, 0)}.`);
      return;
    }
    if (item.format !== 'bullets' && item.format !== 'numbered') errors.push(`${path}[${at}].format must be bullets or numbered.`);
    if (seen.has(item.index as number)) errors.push(`${path}[${at}].index must be unique.`);
    seen.add(item.index as number);
    if (item.depth !== undefined && (!Number.isInteger(item.depth) || Number(item.depth) < 0 || Number(item.depth) > STORY_LIST_MAX_DEPTH)) {
      errors.push(`${path}[${at}].depth must be a whole number from 0 to ${STORY_LIST_MAX_DEPTH}.`);
    }
    if (item.large !== undefined && item.large !== true) errors.push(`${path}[${at}].large must be true when present.`);
  });
  const positions = new Map<number, { depth: number; at: number }>();
  value.forEach((item, at) => {
    if (isRecord(item) && Number.isInteger(item.index) && Number(item.index) >= 0 && Number(item.index) < count) {
      positions.set(item.index as number, { depth: Number.isInteger(item.depth) ? item.depth as number : 0, at });
    }
  });
  for (const [index, { depth, at }] of positions) {
    if (depth <= 0 || depth > STORY_LIST_MAX_DEPTH) continue;
    const previous = positions.get(index - 1);
    if (!previous || depth > previous.depth + 1) errors.push(`${path}[${at}].depth needs a preceding list item at the parent level.`);
  }
}

function validateStringArray(value: unknown, path: string, errors: string[]) {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array.`);
    return;
  }
  value.forEach((item, index) => {
    if (typeof item !== 'string') errors.push(`${path}[${index}] must be a string.`);
  });
}

/** Rich text: paragraphs, their large, subheading and list item positions,
 *  and an optional list format. */
function validateRichText(value: unknown, path: string, errors: string[]) {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`);
    return;
  }
  validateStringArray(value.paragraphs, `${path}.paragraphs`, errors);
  validateLargeParagraphs(value.large, value.paragraphs, `${path}.large`, errors);
  validateRichTextHeadings(value.headings, value.paragraphs, `${path}.headings`, errors);
  validateRichTextListItems(value.listItems, value.paragraphs, `${path}.listItems`, errors);
  if (value.format !== undefined && value.format !== 'paragraphs' && Array.isArray(value.listItems)
      && value.listItems.some((item) => isRecord(item) && (item.large === true || (typeof item.depth === 'number' && item.depth > 0)))) {
    errors.push(`${path}.listItems with size or nesting cannot also use the flat list format.`);
  }
  optionalBoolean(value, 'lede', path, errors);
  optionalEnum(value, 'format', path, STORY_LAYOUT_OPTIONS.proseFormat, errors);
}

function validateInsightColumn(value: unknown, path: string, errors: string[]) {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`);
    return;
  }
  optionalString(value, 'id', path, errors);
  requireString(value, 'label', path, errors);
  validateRichText(value.body, `${path}.body`, errors);
  if (value.media !== undefined) {
    if (!Array.isArray(value.media)) errors.push(`${path}.media must be an array when present.`);
    else value.media.forEach((item, index) => validateMedia(item, `${path}.media[${index}]`, errors));
  }
  optionalBoolean(value, 'highlight', path, errors);
}

const isPositiveNumber = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value > 0;

function validateMedia(value: unknown, path: string, errors: string[]) {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`);
    return;
  }
  if (value.kind !== 'video' && value.kind !== 'image') {
    errors.push(`${path}.kind must be image or video.`);
  }
  optionalEnum(value, 'sourceMode', path, ['media', 'youtube', 'pdf'] as const, errors);
  optionalString(value, 'youtubeUrl', path, errors);
  optionalString(value, 'pdfUrl', path, errors);
  if (value.sourceMode === 'youtube' && !normalizeYouTubeUrl(typeof value.youtubeUrl === 'string' ? value.youtubeUrl : undefined)) {
    errors.push(`${path}.youtubeUrl must be a supported YouTube link when YouTube is selected.`);
  }
  // Choosing PDF before pasting its link must still save; a link that isn't
  // a PDF is the error.
  if (value.sourceMode === 'pdf' && typeof value.pdfUrl === 'string' && value.pdfUrl.trim() && !normalizePdfUrl(value.pdfUrl)) {
    errors.push(`${path}.pdfUrl must be a PDF link (a path or an https URL ending in .pdf) when PDF is selected.`);
  }
  requireString(value, 'alt', path, errors);
  for (const key of ['src', 'poster', 'heading', 'caption'] as const) optionalString(value, key, path, errors);
  for (const key of ['animated', 'loop'] as const) optionalBoolean(value, key, path, errors);
  if (value.link !== undefined) validateLink(value.link, `${path}.link`, errors);
  optionalEnum(value, 'frame', path, STORY_LAYOUT_OPTIONS.mediaFrame, errors);
  optionalEnum(value, 'matPadding', path, STORY_LAYOUT_OPTIONS.mediaMatPadding, errors);
  // The colour reaches the reader's inline style, so only a preset name or a
  // bare six-digit hex gets through.
  if (value.matColor !== undefined
    && !(STORY_LAYOUT_OPTIONS.mediaMat as readonly unknown[]).includes(value.matColor)
    && !(typeof value.matColor === 'string' && /^#[0-9a-f]{6}$/i.test(value.matColor))) {
    errors.push(`${path}.matColor must be a mat preset or a #rrggbb colour when present.`);
  }
  if (value.aspect !== undefined && !isPositiveNumber(value.aspect)) {
    errors.push(`${path}.aspect must be a positive finite number when present.`);
  }
  for (const name of ['appearance', 'expansion'] as const) {
    const settings = value[name];
    if (settings === undefined) continue;
    if (!isRecord(settings)) {
      errors.push(`${path}.${name} must be an object when present.`);
      continue;
    }
    const limits: Record<string, number> = name === 'appearance' ? MEDIA_APPEARANCE_LIMITS : { x: 100, y: 100 };
    const allowed: readonly string[] = name === 'appearance'
      ? [...Object.keys(MEDIA_APPEARANCE_LIMITS), ...Object.keys(MEDIA_APPEARANCE_OPTIONS)]
      : MEDIA_EXPANSION_KEYS;
    for (const key of Object.keys(settings)) {
      if (!allowed.includes(key)) errors.push(`${path}.${name}.${key} is not a supported setting.`);
    }
    for (const [key, max] of Object.entries(limits)) {
      const v = settings[key];
      if (v !== undefined && (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > max)) {
        errors.push(`${path}.${name}.${key} must be between 0 and ${max} when present.`);
      }
    }
    if (name === 'appearance') {
      for (const [key, choices] of Object.entries(MEDIA_APPEARANCE_OPTIONS)) optionalEnum(settings, key, `${path}.${name}`, choices, errors);
    } else {
      optionalBoolean(settings, 'enabled', `${path}.${name}`, errors);
      if (settings.zoom !== undefined && !(IMAGE_ZOOM_LEVELS as readonly unknown[]).includes(settings.zoom)) {
        errors.push(`${path}.${name}.zoom must be a supported image zoom level.`);
      }
    }
  }
  if (value.framing !== undefined) {
    if (!isRecord(value.framing)) {
      errors.push(`${path}.framing must be an object when present.`);
    } else {
      optionalEnum(value.framing, 'fit', `${path}.framing`, ['cover', 'contain'] as const, errors);
      if (value.framing.aspect !== undefined && !isPositiveNumber(value.framing.aspect)) {
        errors.push(`${path}.framing.aspect must be a positive finite number when present.`);
      }
      for (const key of ['x', 'y'] as const) {
        const position = value.framing[key];
        if (position !== undefined && (typeof position !== 'number' || !Number.isFinite(position) || position < 0 || position > 100)) {
          errors.push(`${path}.framing.${key} must be between 0 and 100 when present.`);
        }
      }
      const zoom = value.framing.zoom;
      if (zoom !== undefined && (typeof zoom !== 'number' || !Number.isFinite(zoom) || zoom < 1 || zoom > 3)) {
        errors.push(`${path}.framing.zoom must be between 1 and 3 when present.`);
      }
    }
  }
  if (value.shot !== undefined) {
    if (!isRecord(value.shot)) {
      errors.push(`${path}.shot must be an object when present.`);
    } else {
      requireString(value.shot, 'brief', `${path}.shot`, errors);
      for (const key of ['source', 'length', 'draft'] as const) optionalString(value.shot, key, `${path}.shot`, errors);
    }
  }
}

function validateOutcome(value: unknown, path: string, errors: string[]) {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`);
    return;
  }
  requireString(value, 'value', path, errors);
  requireString(value, 'label', path, errors);
  optionalString(value, 'id', path, errors);
  for (const key of ['evidenceLabel', 'baseline', 'timeframe', 'note'] as const) optionalString(value, key, path, errors);
  optionalEnum(value, 'evidence', path, EVIDENCE_TYPES, errors);
  optionalBoolean(value, 'hidden', path, errors);
}

function validateMetric(value: unknown, path: string, errors: string[]) {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`);
    return;
  }
  requireString(value, 'value', path, errors);
  requireString(value, 'description', path, errors);
  optionalString(value, 'context', path, errors);
  optionalString(value, 'baseline', path, errors);
}

function validateQuote(value: unknown, path: string, errors: string[]) {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`);
    return;
  }
  for (const key of ['quote', 'name', 'role'] as const) requireString(value, key, path, errors);
  optionalString(value, 'context', path, errors);
}

function validatePartners(value: unknown, path: string, errors: string[]) {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array.`);
    return;
  }
  value.forEach((partner, index) => {
    const partnerPath = `${path}[${index}]`;
    if (!isRecord(partner)) {
      errors.push(`${partnerPath} must be an object.`);
      return;
    }
    requireString(partner, 'role', partnerPath, errors);
    requireString(partner, 'owned', partnerPath, errors);
  });
}

function validateLedger(value: unknown, path: string, errors: string[]) {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`);
    return;
  }
  for (const key of ['led', 'made', 'influenced', 'notMe'] as const) {
    if (value[key] !== undefined) validateStringArray(value[key], `${path}.${key}`, errors);
  }
  for (const key of ['ledLabel', 'madeLabel', 'influencedLabel', 'notMeLabel', 'partnersLabel'] as const) optionalString(value, key, path, errors);
  if (value.partners !== undefined) validatePartners(value.partners, `${path}.partners`, errors);
}

function validateCollaboration(value: unknown, path: string, errors: string[]) {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`);
    return;
  }
  if (!isRecord(value.center)) {
    errors.push(`${path}.center must be an object.`);
  } else {
    requireString(value.center, 'label', `${path}.center`, errors);
    requireString(value.center, 'detail', `${path}.center`, errors);
  }
  if (!Array.isArray(value.groups)) {
    errors.push(`${path}.groups must be an array.`);
  } else {
    value.groups.forEach((group, index) => {
      const groupPath = `${path}.groups[${index}]`;
      if (!isRecord(group)) {
        errors.push(`${groupPath} must be an object.`);
        return;
      }
      requireString(group, 'label', groupPath, errors);
      requireString(group, 'detail', groupPath, errors);
    });
  }
  optionalString(value, 'note', path, errors);
}

/** The props problem of a custom block, as a validation message, or null. */
export function customPropsProblem(props: unknown, path: string): string | null {
  if (props === undefined) return null;
  if (!isRecord(props)) return `${path}.props must be a plain JSON object when present.`;
  const problem = plainJsonProblem(props);
  return problem ? `${path}.props${problem.at} must be plain JSON (it ${problem.reason}).` : null;
}

function validateCustom(value: Record<string, unknown>, path: string, errors: string[]) {
  requireString(value, 'component', path, errors);
  if (typeof value.component === 'string' && value.component.trim() && !CUSTOM_BLOCK_COMPONENT_PATTERN.test(value.component)) {
    errors.push(`${path}.component must be a registry name: a letter, then letters, numbers, dots, colons, slashes, dashes or underscores.`);
  }
  const props = customPropsProblem(value.props, path);
  if (props) errors.push(props);
  optionalString(value, 'title', path, errors);
  optionalString(value, 'caption', path, errors);
}

function validateBlock(stored: unknown, path: string, errors: string[]) {
  // Stored pairs and comparisons are read as the image groups they are now.
  const value = upgradeLegacyMediaBlock(stored);
  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`);
    return;
  }
  if (typeof value.type !== 'string' || !BLOCK_TYPES.has(value.type)) {
    errors.push(`${path}.type must be one of: ${[...BLOCK_TYPES].join(', ')}.`);
    return;
  }
  optionalBoolean(value, 'hidden', path, errors);
  optionalString(value, 'id', path, errors);

  switch (value.type) {
    case 'prose':
      validateRichText(value, path, errors);
      break;
    case 'insight':
      requireString(value, 'title', path, errors);
      optionalString(value, 'label', path, errors);
      optionalEnum(value, 'titleWidth', path, STORY_LAYOUT_OPTIONS.insightTitleWidth, errors);
      optionalEnum(value, 'layout', path, STORY_LAYOUT_OPTIONS.insightLayout, errors);
      optionalEnum(value, 'surface', path, STORY_LAYOUT_OPTIONS.insightSurface, errors);
      if (!Array.isArray(value.columns)) {
        errors.push(`${path}.columns must be an array.`);
      } else {
        value.columns.forEach((column, index) => validateInsightColumn(column, `${path}.columns[${index}]`, errors));
      }
      if (value.steps !== undefined) validateStringArray(value.steps, `${path}.steps`, errors);
      if (value.footer !== undefined) {
        if (!isRecord(value.footer)) {
          errors.push(`${path}.footer must be an object when present.`);
        } else {
          requireString(value.footer, 'label', `${path}.footer`, errors);
          validateRichText(value.footer.body, `${path}.footer.body`, errors);
        }
      }
      break;
    case 'subhead':
    case 'note':
      requireString(value, 'text', path, errors);
      break;
    case 'spacer':
      optionalEnum(value, 'size', path, STORY_LAYOUT_OPTIONS.spacerSize, errors);
      break;
    case 'cta':
      optionalBoolean(value, 'newTab', path, errors);
      requireString(value, 'label', path, errors);
      requireString(value, 'href', path, errors);
      // An unfinished button (blank label or link) saves; a wrong one doesn't.
      if (value.label && !ctaLabel(value.label)) errors.push(`${path}.label must be a short button label.`);
      if (value.href && !ctaHref(value.href)) errors.push(`${path}.href must be a link: a path on this site, an https URL or a mailto address.`);
      break;
    case 'divider':
      break;
    case 'gallery':
      if (!Array.isArray(value.items)) {
        errors.push(`${path}.items must be an array.`);
      } else {
        value.items.forEach((item, index) => validateMedia(item, `${path}.items[${index}]`, errors));
      }
      optionalString(value, 'caption', path, errors);
      optionalEnum(value, 'layout', path, STORY_LAYOUT_OPTIONS.galleryLayout, errors);
      optionalEnum(value, 'columns', path, STORY_LAYOUT_OPTIONS.galleryColumns, errors);
      optionalEnum(value, 'alignment', path, STORY_LAYOUT_OPTIONS.galleryAlignment, errors);
      break;
    case 'table':
      if (!Array.isArray(value.rows) || value.rows.length === 0) {
        errors.push(`${path}.rows must be a non-empty array.`);
      } else {
        const width = Array.isArray(value.rows[0]) ? value.rows[0].length : 0;
        value.rows.forEach((row, index) => {
          if (!Array.isArray(row) || row.length === 0 || row.some((cell) => typeof cell !== 'string')) errors.push(`${path}.rows[${index}] must be a non-empty array of strings.`);
          else if (row.length !== width) errors.push(`${path}.rows[${index}] must have ${width} cells, like the first row.`);
        });
      }
      optionalBoolean(value, 'headerRow', path, errors);
      optionalString(value, 'caption', path, errors);
      break;
    case 'code':
      requireString(value, 'code', path, errors);
      optionalString(value, 'caption', path, errors);
      break;
    case 'custom':
      validateCustom(value, path, errors);
      break;
    case 'media':
      validateMedia(value.media, `${path}.media`, errors);
      optionalEnum(value, 'width', path, STORY_LAYOUT_OPTIONS.mediaWidth, errors);
      optionalEnum(value, 'align', path, STORY_LAYOUT_OPTIONS.mediaAlign, errors);
      break;
    case 'decision':
      requireString(value, 'call', path, errors);
      requireString(value, 'because', path, errors);
      for (const key of [
        'context', 'over', 'cost', 'mine',
        'contextLabel', 'rationaleLabel', 'tradeoffLabel', 'contributionLabel', 'callLabel', 'alternativesLabel',
      ] as const) optionalString(value, key, path, errors);
      optionalEnum(value, 'status', path, ['held', 'revised', 'reversed'], errors);
      optionalEnum(value, 'presentation', path, ['card', 'editorial'], errors);
      if (value.mechanism !== undefined) validateStringArray(value.mechanism, `${path}.mechanism`, errors);
      if (value.media !== undefined) validateMedia(value.media, `${path}.media`, errors);
      if (value.options !== undefined) {
        if (!Array.isArray(value.options)) {
          errors.push(`${path}.options must be an array when present.`);
        } else {
          value.options.forEach((option, index) => {
            const optionPath = `${path}.options[${index}]`;
            if (!isRecord(option)) {
              errors.push(`${optionPath} must be an object.`);
              return;
            }
            requireString(option, 'label', optionPath, errors);
            requireString(option, 'whyNot', optionPath, errors);
          });
        }
      }
      break;
    case 'quote':
      validateQuote(value.quote, `${path}.quote`, errors);
      break;
    case 'callout':
      optionalString(value, 'title', path, errors);
      validateRichText(value.body, `${path}.body`, errors);
      // Style keys can be unknown to this version. Readers only resolve known
      // catalogue keys and otherwise fall back, so saved text stays editable.
      optionalString(value, 'tone', path, errors);
      optionalString(value, 'icon', path, errors);
      if (value.appearance !== undefined) {
        if (!isRecord(value.appearance)) errors.push(`${path}.appearance must be an object.`);
        else {
          optionalString(value.appearance, 'palette', `${path}.appearance`, errors);
          optionalString(value.appearance, 'icon', `${path}.appearance`, errors);
        }
      }
      optionalEnum(value, 'presentation', path, STORY_LAYOUT_OPTIONS.calloutPresentation, errors);
      break;
    case 'metrics':
    case 'outcomes':
      if (!Array.isArray(value.items)) {
        errors.push(`${path}.items must be an array.`);
      } else {
        value.items.forEach((item, index) => {
          if (value.type === 'metrics') validateMetric(item, `${path}.items[${index}]`, errors);
          else validateOutcome(item, `${path}.items[${index}]`, errors);
        });
      }
      optionalString(value, 'note', path, errors);
      if (value.type === 'outcomes') optionalEnum(value, 'layout', path, STORY_LAYOUT_OPTIONS.outcomesLayout, errors);
      break;
    case 'ledger':
      validateLedger(value.ledger, `${path}.ledger`, errors);
      break;
    case 'implemented':
    case 'influenced':
      validateStringArray(value.items, `${path}.items`, errors);
      optionalString(value, 'label', path, errors);
      if (value.type === 'implemented' && value.sourceLedger !== undefined) validateLedger(value.sourceLedger, `${path}.sourceLedger`, errors);
      break;
    case 'partners':
      optionalString(value, 'label', path, errors);
      validatePartners(value.items, `${path}.items`, errors);
      break;
    case 'contribution':
      if (value.variant === undefined) errors.push(`${path}.variant is required.`);
      optionalEnum(value, 'variant', path, ['implemented', 'influenced', 'partners'], errors);
      optionalString(value, 'label', path, errors);
      if (value.variant === 'partners') validatePartners(value.items, `${path}.items`, errors);
      else validateStringArray(value.items, `${path}.items`, errors);
      if (value.sourceLedger !== undefined) validateLedger(value.sourceLedger, `${path}.sourceLedger`, errors);
      break;
    case 'collaboration':
      validateCollaboration(value.map, `${path}.map`, errors);
      break;
    case 'followUp':
      requireString(value, 'heading', path, errors);
      optionalString(value, 'intro', path, errors);
      if (!Array.isArray(value.items)) errors.push(`${path}.items must be an array.`);
      else value.items.forEach((item, index) => {
        const itemPath = `${path}.items[${index}]`;
        if (!isRecord(item)) {
          errors.push(`${itemPath} must be an object.`);
          return;
        }
        optionalString(item, 'id', itemPath, errors);
        requireString(item, 'title', itemPath, errors);
        requireString(item, 'teaser', itemPath, errors);
        optionalEnum(item, 'icon', itemPath, ['layers', 'sparkles', 'workflow', 'users'], errors);
        if (item.media !== undefined) validateMedia(item.media, `${itemPath}.media`, errors);
        if (item.link !== undefined) validateLink(item.link, `${itemPath}.link`, errors);
      });
      if (value.cta !== undefined) {
        if (!isRecord(value.cta)) errors.push(`${path}.cta must be an object when present.`);
        else {
          requireString(value.cta, 'label', `${path}.cta`, errors);
          requireString(value.cta, 'href', `${path}.cta`, errors);
          const href = value.cta.href;
          if (typeof href === 'string' && href && !ctaHref(href)) {
            errors.push(`${path}.cta.href must be a link: a path on this site, an https URL or a mailto address.`);
          }
        }
      }
      break;
    case 'steps':
      if (!Array.isArray(value.items)) {
        errors.push(`${path}.items must be an array.`);
      } else {
        value.items.forEach((item, index) => {
          const itemPath = `${path}.items[${index}]`;
          if (!isRecord(item)) {
            errors.push(`${itemPath} must be an object.`);
            return;
          }
          requireString(item, 'title', itemPath, errors);
          requireString(item, 'body', itemPath, errors);
        });
      }
      break;
  }
}

/**
 * Every structural problem in `value` as a story, in plain sentences; empty
 * when it's valid. With `expectedSlug`, the story must also keep that slug.
 */
export function validateStory(value: unknown, expectedSlug?: string): string[] {
  if (!isRecord(value)) return ['Content must be an object.'];
  const errors: string[] = [];
  for (const key of ['slug', 'company', 'title', 'thesis']) requireString(value, key, 'story', errors, true);
  if (typeof value.slug === 'string' && !SLUG_PATTERN.test(value.slug)) errors.push('slug has an invalid format.');
  if (expectedSlug && value.slug !== expectedSlug) errors.push(`slug must remain ${expectedSlug}.`);

  for (const key of ['companyLogo', 'period', 'status', 'disclosure', 'counterfactual', 'summary', 'creditsTitle'] as const) {
    optionalString(value, key, 'story', errors);
  }
  if (!isOptionalProjectYear(value.projectYear)) errors.push(PROJECT_YEAR_ERROR);
  if (value.companyLogoId !== undefined && (typeof value.companyLogoId !== 'string' || !COMPANY_LOGO_ID_PATTERN.test(value.companyLogoId))) {
    errors.push('story.companyLogoId must be a lowercase id of letters, numbers and dashes.');
  }
  optionalEnum(value, 'glancePresentation', 'story', STORY_LAYOUT_OPTIONS.glancePresentation, errors);
  optionalEnum(value, 'heroLayout', 'story', ['standard', 'split-graphic'], errors);
  optionalEnum(value, 'heroPresentation', 'story', ['edition-cover', 'offset-plate'], errors);
  optionalEnum(value, 'tone', 'story', STORY_LAYOUT_OPTIONS.tone, errors);
  if (value.visibility !== undefined) {
    if (!isRecord(value.visibility)) {
      errors.push('story.visibility must be an object when present.');
    } else {
      for (const key of ['facts', 'heroMedia', 'readTime', 'glance', 'headlineOutcomes', 'counterfactual', 'hindsight', 'credits'] as const) {
        optionalBoolean(value.visibility, key, 'story.visibility', errors);
      }
    }
  }
  if (value.hero !== undefined) validateMedia(value.hero, 'story.hero', errors);
  if (value.workPreview !== undefined) validateMedia(value.workPreview, 'story.workPreview', errors);
  if (value.heroGraphic !== undefined) validateMedia(value.heroGraphic, 'story.heroGraphic', errors);
  if (value.decisions !== undefined) {
    if (!isRecord(value.decisions)) {
      errors.push('story.decisions must be an object when present.');
    } else {
      requireString(value.decisions, 'title', 'story.decisions', errors);
      optionalString(value.decisions, 'intro', 'story.decisions', errors);
      optionalBoolean(value.decisions, 'hidden', 'story.decisions', errors);
      if (!Array.isArray(value.decisions.items)) {
        errors.push('story.decisions.items must be an array.');
      } else {
        value.decisions.items.forEach((item, index) => {
          const itemPath = `story.decisions.items[${index}]`;
          if (!isRecord(item)) {
            errors.push(`${itemPath} must be an object.`);
            return;
          }
          optionalString(item, 'id', itemPath, errors);
          requireString(item, 'title', itemPath, errors);
          requireString(item, 'detail', itemPath, errors);
          optionalBoolean(item, 'expanded', itemPath, errors);
        });
      }
    }
  }

  if (!Array.isArray(value.facts)) {
    errors.push('story.facts must be an array.');
  } else {
    value.facts.forEach((fact, index) => {
      const path = `story.facts[${index}]`;
      if (!isRecord(fact)) {
        errors.push(`${path} must be an object.`);
        return;
      }
      requireString(fact, 'label', path, errors);
      requireString(fact, 'value', path, errors);
      optionalString(fact, 'id', path, errors);
      optionalBoolean(fact, 'hidden', path, errors);
    });
  }

  if (!isRecord(value.glance)) {
    errors.push('story.glance must be an object.');
  } else {
    for (const { key } of STORY_CHAPTERS) requireString(value.glance, key, 'story.glance', errors);
  }

  if (value.outcomes !== undefined) {
    if (!Array.isArray(value.outcomes)) errors.push('story.outcomes must be an array when present.');
    else value.outcomes.forEach((outcome, index) => validateOutcome(outcome, `story.outcomes[${index}]`, errors));
  }

  if (value.credits !== undefined) {
    if (!Array.isArray(value.credits)) errors.push('story.credits must be an array when present.');
    else value.credits.forEach((credit, index) => {
      const path = `story.credits[${index}]`;
      if (!isRecord(credit)) {
        errors.push(`${path} must be an object.`);
        return;
      }
      requireString(credit, 'name', path, errors);
      requireString(credit, 'role', path, errors);
      optionalString(credit, 'id', path, errors);
      optionalBoolean(credit, 'hidden', path, errors);
    });
  }

  if (value.hindsight !== undefined) {
    if (!isRecord(value.hindsight)) {
      errors.push('story.hindsight must be an object when present.');
    } else {
      requireString(value.hindsight, 'title', 'story.hindsight', errors);
      validateStringArray(value.hindsight.paragraphs, 'story.hindsight.paragraphs', errors);
    }
  }

  if (value.related !== undefined) {
    validateStringArray(value.related, 'story.related', errors);
    if (Array.isArray(value.related)) value.related.forEach((slug, index) => {
      if (typeof slug === 'string' && !SLUG_PATTERN.test(slug)) errors.push(`story.related[${index}] has an invalid slug format.`);
    });
  }

  if (!Array.isArray(value.chapters) || value.chapters.length === 0) {
    errors.push('story.chapters must be a non-empty array.');
  } else {
    const seen = new Set<string>();
    value.chapters.forEach((chapter, chapterIndex) => {
      const chapterPath = `story.chapters[${chapterIndex}]`;
      if (!isRecord(chapter)) {
        errors.push(`${chapterPath} must be an object.`);
        return;
      }
      if (typeof chapter.key !== 'string' || !STORY_SECTION_KEY_PATTERN.test(chapter.key)) {
        errors.push(`${chapterPath}.key is invalid.`);
      } else if (seen.has(chapter.key)) {
        errors.push(`story.chapters contains duplicate ${chapter.key}.`);
      } else {
        seen.add(chapter.key);
      }
      // A draft may keep a new section untitled while its author works;
      // navigation supplies a readable fallback.
      requireString(chapter, 'title', chapterPath, errors);
      optionalEnum(chapter, 'density', chapterPath, STORY_LAYOUT_OPTIONS.chapterDensity, errors);
      optionalEnum(chapter, 'columns', chapterPath, STORY_LAYOUT_OPTIONS.chapterColumns, errors);
      optionalBoolean(chapter, 'hidden', chapterPath, errors);
      if (!Array.isArray(chapter.blocks)) {
        errors.push(`${chapterPath}.blocks must be an array.`);
      } else {
        chapter.blocks.forEach((block, blockIndex) => validateBlock(block, `${chapterPath}.blocks[${blockIndex}]`, errors));
      }
    });
  }

  try {
    stableJson(value);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'Content must be JSON serializable.');
  }

  return errors;
}

/** The copy a draft may leave blank while it's being written. */
const INCOMPLETE_DRAFT_COPY = new Set([
  'story.company must be a non-empty string.',
  'story.thesis must be a non-empty string.',
]);

/**
 * Drafts may keep incomplete copy: company and thesis may be blank (glance,
 * chapter titles and rich text already allow empty strings). Identity, shape,
 * enum, media and relationship validation stays strict. Publishing still
 * calls `validateStory`, so a draft never goes live merely because it saved.
 */
export function validateStoryDraft(value: unknown, expectedSlug?: string): string[] {
  return validateStory(value, expectedSlug).filter((error) => !INCOMPLETE_DRAFT_COPY.has(error));
}

/** What an importer needs to know about a version already stored. */
export interface ExistingDocumentIdentity {
  id: string;
  slug: string;
  version: number;
  contentSha256: string;
}

export type ImportPlanItem =
  | { action: 'insert'; seed: StoryDocumentSeed }
  | { action: 'skip'; seed: StoryDocumentSeed; reason: 'identical-id' }
  | { action: 'conflict'; seed: StoryDocumentSeed; reason: string };

function planImportsWithValidator(
  manifest: readonly StoryDocumentSeed[],
  existing: readonly ExistingDocumentIdentity[],
  validate: (value: unknown, expectedSlug?: string) => string[],
): ImportPlanItem[] {
  const existingById = new Map(existing.map((row) => [row.id, row]));
  const existingByVersion = new Map(existing.map((row) => [`${row.slug}:${row.version}`, row]));
  const existingByHash = new Map(existing.map((row) => [`${row.slug}:${row.contentSha256}`, row]));
  const manifestById = new Map(manifest.map((seed) => [seed.id, seed]));
  const manifestIds = new Set<string>();
  const manifestVersions = new Set<string>();

  return manifest.map((seed): ImportPlanItem => {
    const errors = validate(seed.content, seed.slug);
    if (errors.length > 0) return { action: 'conflict', seed, reason: errors.join(' ') };
    let id: string;
    try {
      id = storyDocumentId(seed.slug, seed.version);
    } catch (error) {
      return { action: 'conflict', seed, reason: error instanceof Error ? error.message : 'Invalid slug or version.' };
    }
    if (seed.id !== id) return { action: 'conflict', seed, reason: 'Document ID does not match slug and version.' };
    if (seed.contentSha256 !== contentSha256(seed.content)) {
      return { action: 'conflict', seed, reason: 'Content checksum does not match the document body.' };
    }
    if (manifestIds.has(seed.id)) return { action: 'conflict', seed, reason: 'Duplicate ID in import manifest.' };
    manifestIds.add(seed.id);
    const versionKey = `${seed.slug}:${seed.version}`;
    if (manifestVersions.has(versionKey)) return { action: 'conflict', seed, reason: 'Duplicate slug and version in import manifest.' };
    manifestVersions.add(versionKey);

    if (seed.parentDocumentId) {
      const parent = existingById.get(seed.parentDocumentId) ?? manifestById.get(seed.parentDocumentId);
      if (!parent) return { action: 'conflict', seed, reason: 'Parent document does not exist.' };
      if (parent.id === seed.id) return { action: 'conflict', seed, reason: 'A document cannot be its own parent.' };
      if (parent.slug !== seed.slug) return { action: 'conflict', seed, reason: 'Parent document must have the same slug.' };
    }

    const byId = existingById.get(seed.id);
    if (byId) {
      return byId.slug === seed.slug && byId.version === seed.version && byId.contentSha256 === seed.contentSha256
        ? { action: 'skip', seed, reason: 'identical-id' }
        : { action: 'conflict', seed, reason: 'Existing ID has different content or identity.' };
    }
    if (existingByVersion.has(versionKey)) return { action: 'conflict', seed, reason: 'Slug and version already belong to another document.' };
    if (existingByHash.has(`${seed.slug}:${seed.contentSha256}`)) {
      return { action: 'conflict', seed, reason: 'Identical content already exists under another version.' };
    }
    return { action: 'insert', seed };
  });
}

/**
 * The insert-only plan for importing reviewed, complete stories: what to
 * insert, what's already there (skip, so a rerun is a no-op) and what
 * conflicts, with why. Pure; the store applies it.
 */
export function planDocumentImports(
  manifest: readonly StoryDocumentSeed[],
  existing: readonly ExistingDocumentIdentity[],
): ImportPlanItem[] {
  return planImportsWithValidator(manifest, existing, validateStory);
}

/** The same plan for drafts that may still have blank copy. Identity,
 *  hashes, ancestry and idempotency are checked exactly as for complete
 *  stories. It never publishes. */
export function planDraftDocumentImports(
  manifest: readonly StoryDocumentSeed[],
  existing: readonly ExistingDocumentIdentity[],
): ImportPlanItem[] {
  return planImportsWithValidator(manifest, existing, validateStoryDraft);
}
