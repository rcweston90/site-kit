import { CtaFields } from './CtaEditor.js';
import CalloutAppearanceEditor from './CalloutAppearanceEditor.js';
import { useId, useRef, useState, type ComponentPropsWithoutRef, type KeyboardEvent, type ReactNode, type Ref } from 'react';
import { DropdownMenu } from 'radix-ui';
import { ArrowDown, ArrowUp, ChevronDown, Check, Circle, Info, Sparkles, TriangleAlert, CopyPlus, Ellipsis, Eye, EyeOff, ListPlus, Pipette, Plus, RotateCcw, Trash2, Upload, X } from 'lucide-react';
import { menuContentClass, menuItemClass, menuSeparatorClass } from './menu.js';
import { type Metric, type StoryBlock, type StoryEvidence, type StoryInsightColumn, type StoryLedger, type StoryMatColor, type StoryMatPreset, type StoryMedia, type StoryOutcome } from '@rcweston/story-core';
import { STORY_UPLOAD_ACCEPT } from './upload-checks.js';
import { storyListItems, withProseFormat, type StoryProseFormat } from '@rcweston/story-core';
import { createEditorItemId } from './model.js';
import { controlStyles as controls, chromeStyles } from './classes.js';
import { MediaDisplayEditor } from './MediaDisplayEditor.js';
import { EditorSelect } from './Select.js';
import { PREVIEW_UPLOAD_NOTE, useFileDrop, useStoryMediaUpload, type UploadedStoryMedia } from './media-upload-client.js';
import { clampMediaPosition, embedFramingHidesControls, embedFramingStyle, mediaFramingStyle, normalizeMediaFraming } from '@rcweston/story-react';
import { mediaNoun, mediaSource, mediaSourceAspect, mediaSupports, youTubeStill } from '@rcweston/story-core';
import { youTubeLinkAspect } from '@rcweston/story-core';
import { useStoryEnvironment } from '@rcweston/story-react';
import { STORY_MAT_PRESETS, isStoryMatPreset, lowMatContrast, normalizeMatHex, sharedMatColor, storyMatStyle } from '@rcweston/story-react';

const inputClass = controls.input;
const textareaClass = controls.textarea;
type HistoryMode = 'record' | 'merge';
type ChangeHandler<T> = (value: T, history?: HistoryMode) => void;

const optional = (value: string): string | undefined => value.trim() ? value : undefined;

export const mediaDisplayLabel = (media: StoryMedia, fallback: string): string => {
  // Read structurally: a media heading is optional in older documents.
  const heading = (media as StoryMedia & { heading?: string }).heading?.trim();
  const authored = heading || media.alt.trim() || media.caption?.trim();
  if (authored) return authored;
  const source = media.src?.split(/[?#]/)[0].split('/').filter(Boolean).at(-1);
  if (!source || media.src?.startsWith('blob:')) return fallback;
  try { return decodeURIComponent(source); } catch { return source; }
};

const THUMB_LABELS = { image: 'IMG', video: 'VID', document: 'PDF' } as const;
const MEDIA_NOUNS = { image: 'Image', video: 'Video', document: 'Document' } as const;

type MediaBlock = Extract<StoryBlock, { type: 'media' }>;

/** A block that becomes a YouTube video starts at the text column: a 16:9
 *  player any wider takes most of a laptop screen. The author can widen it
 *  again; only the switch to YouTube sets it. */
function widthForSource(block: MediaBlock, next: StoryMedia): MediaBlock['width'] {
  return mediaSource(next) === 'youtube' && mediaSource(block.media) !== 'youtube' ? 'text' : block.width;
}

function MediaThumb({ media }: { media: StoryMedia }) {
  const sourceMode = mediaSource(media);
  const source = sourceMode === 'youtube' ? youTubeStill(media)
    : sourceMode === 'pdf' ? undefined
      : media.kind === 'video' ? media.poster : media.src;
  return source
    ? <span aria-hidden="true" className={controls.mediaThumb} style={{ backgroundImage: `url(${JSON.stringify(source).slice(1, -1)})` }} />
    : <span aria-hidden="true" className={controls.mediaThumb} data-empty>{THUMB_LABELS[mediaNoun(media)]}</span>;
}

function MediaIdentity({ media, eyebrow, fallback }: { media: StoryMedia; eyebrow: string; fallback: string }) {
  return (
    <div className={controls.mediaIdentity}>
      <MediaThumb media={media} />
      <span className={controls.mediaIdentityCopy}>
        <span className={controls.mediaEyebrow}>{eyebrow}</span>
        <span className={controls.mediaName}>{mediaDisplayLabel(media, fallback)}</span>
      </span>
    </div>
  );
}

function MediaPicker({ items, labels, selected, onSelect }: { items: readonly StoryMedia[]; labels: readonly string[]; selected: number; onSelect: (index: number) => void }) {
  const moveFocus = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = index;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % items.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + items.length) % items.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = items.length - 1;
    else return;
    event.preventDefault();
    onSelect(next);
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  };
  return (
    <div className={controls.mediaPicker} role="tablist" aria-label="Images and videos in this group">
      {items.map((media, index) => (
        <button key={`${labels[index]}-${index}`} type="button" role="tab" aria-selected={selected === index} tabIndex={selected === index ? 0 : -1} className={controls.mediaChoice} onClick={() => onSelect(index)} onKeyDown={(event) => moveFocus(event, index)}>
          <MediaThumb media={media} />
          <span className={controls.mediaChoiceCopy}><span>{labels[index]}</span><small>{mediaDisplayLabel(media, `Empty ${media.kind}`)}</small></span>
        </button>
      ))}
    </div>
  );
}

export const STORY_BLOCK_LABELS: Record<StoryBlock['type'], string> = {
  prose: 'Prose',
  subhead: 'Subheading',
  media: 'Media',
  decision: 'Decision',
  insight: 'Insight',
  quote: 'Quote',
  callout: 'Callout',
  metrics: 'Legacy metrics',
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

export const EVIDENCE_OPTIONS: readonly { value: StoryEvidence | ''; label: string }[] = [
  { value: '', label: 'No evidence label' },
  { value: 'experiment', label: 'Experiment' },
  { value: 'before-after', label: 'Before / after' },
  { value: 'leading', label: 'Leading signal' },
  { value: 'observed', label: 'Observed' },
  { value: 'testimony', label: 'Testimony' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'plan', label: 'Measurement plan' },
];

/** A titled group in the settings drawer. Untitled sections still get the
 *  hairline so consecutive groups stay distinct. Other props reach the
 *  <section> (media settings take a dropped file anywhere in theirs). */
export function SettingsSection({
  title,
  children,
  ...props
}: { title?: string; children: ReactNode } & Omit<ComponentPropsWithoutRef<'section'>, 'title' | 'children' | 'className'>) {
  return (
    <section className={controls.section} {...props}>
      {title && <h3 className={controls.sectionTitle}>{title}</h3>}
      {children}
    </section>
  );
}

/** The whole drawer for a selection whose every setting is its text. */
export function NothingToSet() {
  return <p className={controls.quiet}>Nothing else to set here — edit the text on the page.</p>;
}

/** A folded group; `meta` states what's inside so a closed fold still says
 *  whether it needs attention. Opens on mount when `initiallyOpen`. */
export function Disclosure({ summary, meta, initiallyOpen = false, children }: { summary: string; meta?: string; initiallyOpen?: boolean; children: ReactNode }) {
  // Read once: re-deriving `open` from content would fold the group shut
  // while someone is typing into it.
  const [open] = useState(initiallyOpen);
  return (
    <details className={controls.disclosure} open={open || undefined}>
      <summary>
        {summary}
        {meta && <span className={controls.summaryMeta}>{meta}</span>}
        <ChevronDown aria-hidden="true" className={controls.chevron} />
      </summary>
      <div className={controls.disclosureBody}>{children}</div>
    </details>
  );
}

export function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  disabled = false,
  readOnly = false,
  help,
  inline = false,
  publicationInput,
}: {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  type?: 'text' | 'url' | 'number';
  disabled?: boolean;
  readOnly?: boolean;
  help?: string;
  inline?: boolean;
  publicationInput?: string;
}) {
  return (
    <label className={controls.field} data-layout={inline ? 'inline' : undefined}>
      {label}
      <input
        type={type}
        data-publication-input={publicationInput}
        value={value}
        onChange={(event) => onChange?.(event.currentTarget.value)}
        placeholder={placeholder}
        disabled={disabled}
        readOnly={readOnly}
        className={inputClass}
      />
      {help && <span className={controls.help}>{help}</span>}
    </label>
  );
}

export function TextArea({
  label,
  value,
  onChange,
  rows = 3,
  placeholder,
  help,
  ref,
  publicationInput,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
  help?: string;
  ref?: Ref<HTMLTextAreaElement>;
  publicationInput?: string;
}) {
  return (
    <label className={controls.field}>
      {label}
      <textarea
        ref={ref}
        data-publication-input={publicationInput}
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        placeholder={placeholder}
        className={textareaClass}
      />
      {help && <span className={controls.help}>{help}</span>}
    </label>
  );
}

export function RichTextArea({
  label,
  value,
  onChange,
  rows = 7,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  const id = useId();
  const ref = useRef<HTMLTextAreaElement>(null);

  const wrapSelection = (before: string, after: string, fallback: string) => {
    const textarea = ref.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = value.slice(start, end) || fallback;
    const next = `${value.slice(0, start)}${before}${selected}${after}${value.slice(end)}`;
    onChange(next);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  };

  return (
    <div className={controls.field}>
      <label htmlFor={id}>{label}</label>
      <div className={controls.formatToolbar} role="toolbar" aria-label={`${label} formatting`}>
        <button type="button" className={controls.formatButton} aria-label="Bold" title="Bold" onMouseDown={(event) => event.preventDefault()} onClick={() => wrapSelection('**', '**', 'bold text')}><strong>B</strong></button>
        <button type="button" className={controls.formatButton} aria-label="Italic" title="Italic" onMouseDown={(event) => event.preventDefault()} onClick={() => wrapSelection('*', '*', 'italic text')}><em>I</em></button>
        <button type="button" className={controls.formatButton} aria-label="Add link" title="Add link" onMouseDown={(event) => event.preventDefault()} onClick={() => wrapSelection('[', '](https://)', 'link text')}>Link</button>
      </div>
      <textarea id={id} ref={ref} rows={rows} value={value} placeholder={placeholder} onChange={(event) => onChange(event.currentTarget.value)} className={textareaClass} />
      <span className={controls.help}>Select text, then apply bold, italic, or a safe link. Paragraphs stay separated by a blank line.</span>
    </div>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  compact = false,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  compact?: boolean;
}) {
  const group = useId();
  // Small, finite choices stay visible: one vocabulary and one interaction
  // for surfaces, alignment, density, tone and icons. Catalogs stay compact.
  if (options.length <= 5) return (
    <fieldset className={controls.choiceField}>
      <legend>{label}{label === 'Icon' && <span className={controls.choiceCurrent}> · {options.find(option => option.value === value)?.label}</span>}</legend>
      <div className={controls.choiceOptions} data-count={options.length} data-compact={compact || undefined}>
        {options.map(option => {
          const Icon = label === 'Icon' ? ({ '': Circle, info: Info, check: Check, warning: TriangleAlert, sparkle: Sparkles }[option.value as string]) : undefined;
          return <label key={option.value} className={controls.choiceOption} title={option.label} data-icon={Boolean(Icon) || undefined} data-selected={option.value === value || undefined}>
            <input type="radio" name={group} value={option.value} checked={option.value === value} onChange={() => onChange(option.value)} />
            {Icon && <Icon size={16} aria-hidden="true" />}
            <span>{option.label}</span>
          </label>;
        })}
      </div>
    </fieldset>
  );
  return (
    <label className={controls.field} data-layout="inline">
      {label}
      <EditorSelect value={value} onChange={(event) => onChange(event.currentTarget.value as T)}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </EditorSelect>
    </label>
  );
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className={controls.toggle}>
      {label}
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.currentTarget.checked)} />
    </label>
  );
}

function move<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/**
 * Orders, hides and removes the items of a list whose words are edited on
 * the page. Removal is instant: the editor's undo restores it, so a confirm
 * dialog would only slow the common case down.
 */
/** A copy of a row. Rows the editor keys by id (outcomes, columns, topics)
 *  get a fresh one, or the copy would share its original's identity. */
function duplicateItem<T>(item: T): T {
  const copy = structuredClone(item);
  if (copy && typeof copy === 'object' && 'id' in copy && typeof copy.id === 'string') {
    (copy as { id: string }).id = createEditorItemId(copy.id.split('-')[0] || 'item');
  }
  return copy;
}

/**
 * One menu per row, the same family as a block's ⋮⋮ menu: move, duplicate,
 * add below, remove. ⌥↑ / ⌥↓ on the button move the row without opening it,
 * the way ⌘⇧↑ / ⌘⇧↓ move a block.
 */
function ItemMenu({ position, first, last, onMove, onDuplicate, onAddBelow, onRemove }: {
  /** "fact 2", or "I led item 2" in a block with several lists. */
  position: string;
  first: boolean;
  last: boolean;
  onMove: (direction: -1 | 1) => void;
  onDuplicate: () => void;
  onAddBelow?: () => void;
  onRemove: () => void;
}) {
  const icon = chromeStyles.blockEditorIcon;
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className={controls.iconButton}
          aria-label={`Actions for ${position}`}
          aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
          title="Move, duplicate or remove (⌥↑ ⌥↓ to move)"
          onKeyDown={(event) => {
            if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
            event.preventDefault();
            if (event.key === 'ArrowUp' ? !first : !last) onMove(event.key === 'ArrowUp' ? -1 : 1);
          }}
        ><Ellipsis aria-hidden="true" /></button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={menuContentClass} align="end" sideOffset={4} collisionPadding={12} data-story-editor-action>
          <DropdownMenu.Item className={menuItemClass} disabled={first} onSelect={() => onMove(-1)}>
            <ArrowUp aria-hidden="true" className={icon} />Move up<kbd aria-hidden="true" className={chromeStyles.blockEditorKeys}>⌥↑</kbd>
          </DropdownMenu.Item>
          <DropdownMenu.Item className={menuItemClass} disabled={last} onSelect={() => onMove(1)}>
            <ArrowDown aria-hidden="true" className={icon} />Move down<kbd aria-hidden="true" className={chromeStyles.blockEditorKeys}>⌥↓</kbd>
          </DropdownMenu.Item>
          <DropdownMenu.Item className={menuItemClass} onSelect={onDuplicate}>
            <CopyPlus aria-hidden="true" className={icon} />Duplicate
          </DropdownMenu.Item>
          {onAddBelow && (
            <DropdownMenu.Item className={menuItemClass} onSelect={onAddBelow}>
              <ListPlus aria-hidden="true" className={icon} />Add one below
            </DropdownMenu.Item>
          )}
          <DropdownMenu.Separator className={menuSeparatorClass} />
          <DropdownMenu.Item className={`${menuItemClass} ${chromeStyles.blockEditorItem}`} onSelect={onRemove}>
            <Trash2 aria-hidden="true" className={chromeStyles.blockEditorIcon2} />Remove {position}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function ItemRows<T>({
  items,
  noun,
  label,
  preview,
  onChange,
  create,
  visibility,
  details,
  itemKey,
}: {
  items: readonly T[];
  /** Singular, lower case: "fact" → "Add fact", "Move fact 2 up". */
  noun: string;
  /** Optional list label, for blocks that hold several lists. */
  label?: string;
  preview: (item: T, index: number) => string;
  onChange: ChangeHandler<T[]>;
  create?: () => T;
  /** Per-item show/hide, for lists whose items can be hidden from readers. */
  visibility?: { get: (item: T) => boolean; set: (item: T, hidden: boolean) => T };
  details?: (item: T, index: number, change: ChangeHandler<T>) => ReactNode;
  itemKey?: (item: T, index: number) => string | number;
}) {
  const replace = (index: number, next: T, history?: HistoryMode) => onChange(items.map((entry, at) => at === index ? next : entry), history);
  return (
    <div className={controls.list}>
      {label && <p className={controls.listLabel}>{label}</p>}
      {items.length > 0 && (
        <ol className={controls.items}>
          {items.map((item, index) => {
            const text = preview(item, index).trim();
            const isHidden = visibility?.get(item) ?? false;
            // Several lists can share a block (the ledger), so names carry the list.
            const position = `${label ? `${label} ` : ''}${noun} ${index + 1}`;
            return (
              <li key={itemKey?.(item, index) ?? index} className={controls.item} data-hidden={isHidden || undefined}>
                <div className={controls.itemRow}>
                  <span className={controls.itemPreview} data-empty={!text || undefined}>{text || `Empty ${noun}`}</span>
                  {visibility && (
                    <button type="button" className={controls.iconButton} aria-label={`${isHidden ? 'Show' : 'Hide'} ${position}`} title={isHidden ? 'Show' : 'Hide'} onClick={() => replace(index, visibility.set(item, !isHidden), 'record')}>
                      {isHidden ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                    </button>
                  )}
                  <ItemMenu
                    position={position}
                    first={index === 0}
                    last={index === items.length - 1}
                    onMove={(direction) => onChange(move([...items], index, direction), 'record')}
                    onDuplicate={() => onChange([...items.slice(0, index + 1), duplicateItem(item), ...items.slice(index + 1)], 'record')}
                    onAddBelow={create && (() => onChange([...items.slice(0, index + 1), create(), ...items.slice(index + 1)], 'record'))}
                    onRemove={() => onChange(items.filter((_, at) => at !== index), 'record')}
                  />
                </div>
                {details && <div className={controls.itemDetails}>{details(item, index, (next, history) => replace(index, next, history))}</div>}
              </li>
            );
          })}
        </ol>
      )}
      {create && (
        <button type="button" className={controls.textButton} aria-label={label ? `Add ${noun} to ${label}` : undefined} onClick={() => onChange([...items, create()], 'record')}>
          <Plus aria-hidden="true" />Add {noun}
        </button>
      )}
    </div>
  );
}

/** Switching kind drops the settings only the other kind has. */
function withKind(media: StoryMedia, kind: StoryMedia['kind']): StoryMedia {
  const next = { ...media, kind };
  if (kind === 'image') {
    delete next.poster;
    delete next.loop;
  } else {
    delete next.animated;
  }
  return next;
}

/** An uploaded file becomes the source, and sets the kind and shape. Any
 *  poster goes with the old file: a poster is a frame of the clip it was cut
 *  from; so does the old shape, if the new file's couldn't be read. */
export function withUploadedFile(media: StoryMedia, uploaded: UploadedStoryMedia): StoryMedia {
  const next = withKind({ ...media, src: uploaded.src }, uploaded.kind);
  delete next.poster;
  if (uploaded.aspect) next.aspect = uploaded.aspect;
  else delete next.aspect;
  return next;
}

type StoryMediaUpload = ReturnType<typeof useStoryMediaUpload>;

/** Upload into `media`: the file becomes its source in one step ⌘Z takes
 *  back, then its description is next, so the alt text opens and takes focus.
 *  `altRef` goes on that text area; `drop` takes a file dropped on the
 *  settings. */
function useMediaFileUpload(media: StoryMedia, onChange: ChangeHandler<StoryMedia>) {
  const altRef = useRef<HTMLTextAreaElement>(null);
  const upload = useStoryMediaUpload((uploaded) => {
    onChange(withUploadedFile(media, uploaded), 'record');
    const alt = altRef.current;
    const fold = alt?.closest('details');
    if (fold) fold.open = true;
    alt?.focus();
  });
  const drop = useFileDrop(upload.state.status === 'uploading' ? null : upload.start);
  return { upload, drop, altRef };
}

/**
 * The top of the media settings: pick a file (a real file input behind the
 * label, so it's keyboard reachable) or drop one anywhere on the settings.
 * Progress, the result and errors read out from one status line.
 */
function MediaUploadControl({ media, upload, dragging }: { media: StoryMedia; upload: StoryMediaUpload; dragging: boolean }) {
  const inputId = useId();
  const { state } = upload;
  const busy = state.status === 'uploading';
  // "Uploaded" holds only while the file is still the source: an undo or a
  // pasted URL makes it untrue.
  const current = state.status === 'done' && state.src === media.src;
  const message = state.status === 'uploading'
    ? `Uploading ${state.name}…`
    : state.status === 'error'
      ? state.message
      : current
        ? state.preview ? `${PREVIEW_UPLOAD_NOTE}.` : 'Uploaded. Now describe it for screen readers.'
        : '';
  return (
    <div className={controls.upload} data-dragging={dragging || undefined}>
      <input
        id={inputId}
        type="file"
        accept={STORY_UPLOAD_ACCEPT}
        className={controls.uploadInput}
        disabled={busy}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          // Cleared so choosing the same file again (a retry) still fires.
          event.currentTarget.value = '';
          if (file) upload.start(file);
        }}
      />
      <label htmlFor={inputId} className={controls.uploadZone} data-busy={busy || undefined}>
        <Upload aria-hidden="true" className={controls.uploadIcon} />
        <span className={controls.uploadText}>
          <span className={controls.uploadLabel}>{busy ? 'Uploading…' : media.src ? 'Replace with another file' : 'Upload image or video'}</span>
          <span className={controls.uploadHint}>
            {dragging ? 'Release to upload' : <><span className={controls.uploadDropHint}>Or drop one here · up to 4 MB</span><span className={controls.uploadTouchHint}>Up to 4 MB</span></>}
          </span>
        </span>
      </label>
      <p className={controls.uploadStatus} role="status" data-tone={state.status === 'error' ? 'error' : undefined}>{message}</p>
      {state.status === 'error' && state.retryable && (
        <button type="button" className={controls.textButton} onClick={upload.retry}>
          <RotateCcw aria-hidden="true" />Retry
        </button>
      )}
    </div>
  );
}

const FRAME_ASPECTS = [
  { value: '', label: 'Source shape' },
  { value: String(16 / 9), label: 'Landscape · 16:9' },
  { value: String(3 / 2), label: 'Photo · 3:2' },
  { value: String(4 / 3), label: 'Classic · 4:3' },
  { value: '1', label: 'Square · 1:1' },
  { value: String(4 / 5), label: 'Portrait · 4:5' },
  { value: String(21 / 9), label: 'Wide · 21:9' },
] as const;

/** A preview card's frame: an index tile's artwork is 3:2. */
const CARD_ASPECT = 3 / 2;
const CARD_ZOOMS = [1, 1.1, 1.25, 1.5, 1.75, 2] as const;
const zoomLabel = (zoom: number) => `${Math.round(zoom * 100)}%`;

/** A transactional framing surface: changes stay in this preview until Apply,
 * so Cancel never dirties the story. Its CSS comes from the reader helper.
 * `card` frames a preview card instead: the card's fixed shape, always filled,
 * with zoom in place of the viewport and fit the card doesn't use. */
function MediaFramingEditor({ media, onChange, card = false }: { media: StoryMedia; onChange: ChangeHandler<StoryMedia>; card?: boolean }) {
  const original = media.framing;
  const initial = (): NonNullable<StoryMedia['framing']> => card
    ? { x: original?.x ?? 50, y: original?.y ?? 50, zoom: original?.zoom }
    : { aspect: original?.aspect, fit: original?.fit ?? 'cover', x: original?.x ?? 50, y: original?.y ?? 50 };
  const [draft, setDraft] = useState(initial);
  const [saved, setSaved] = useState(false);
  const previewMedia = { ...media, framing: draft };
  // A YouTube player is previewed by its still (the poster, else YouTube's),
  // placed as the reader places the player, so the crop shown is the crop
  // readers get.
  const embedStill = youTubeStill(media);
  const source = embedStill ?? media.src;
  const noun = mediaNoun(media);
  const sourceAspect = mediaSourceAspect(media);
  const cover = card || (draft.fit ?? 'cover') === 'cover';
  const zoom = draft.zoom ?? 1;
  // An authored zoom between the steps (1.42) stays choosable as it is.
  const zooms = CARD_ZOOMS.some((step) => step === zoom) ? CARD_ZOOMS : [...CARD_ZOOMS, zoom].sort((a, b) => a - b);
  const moveToPointer = (element: HTMLElement, clientX: number, clientY: number) => {
    if (!cover) return;
    const rect = element.getBoundingClientRect();
    setDraft((value) => ({
      ...value,
      x: clampMediaPosition(((clientX - rect.left) / rect.width) * 100),
      y: clampMediaPosition(((clientY - rect.top) / rect.height) * 100),
    }));
    setSaved(false);
  };
  const reset = () => {
    setDraft(card ? { x: 50, y: 50 } : { fit: 'cover', x: 50, y: 50 });
    setSaved(false);
  };
  const cancel = () => {
    setDraft(initial());
    setSaved(false);
  };
  // The card scales from the centre, as a preview card's cover does.
  const style = card && zoom > 1 ? { ...mediaFramingStyle(previewMedia), transform: `scale(${zoom})` } : mediaFramingStyle(previewMedia);
  return (
    <Disclosure summary="Framing and focus" meta={media.framing ? 'Custom' : card ? 'Centred' : 'Source shape'}>
      <p className={controls.help}>
        {card
          ? 'Drag the subject into focus, and zoom in if it reads small. This preview is the card’s shape.'
          : 'Choose the viewport, then drag the subject into focus. This preview uses the same crop as the reader.'}
      </p>
      <div
        className={controls.cropPreview}
        style={{ aspectRatio: String(card ? CARD_ASPECT : draft.aspect ?? sourceAspect) }}
        data-draggable={cover || undefined}
        role="slider"
        aria-label={card ? 'Adjust the card’s focus' : `Adjust ${noun} focus`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={draft.x ?? 50}
        aria-valuetext={`${draft.x ?? 50}% across, ${draft.y ?? 50}% down`}
        tabIndex={cover ? 0 : -1}
        onPointerDown={(event) => {
          if (!cover) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          moveToPointer(event.currentTarget, event.clientX, event.clientY);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) moveToPointer(event.currentTarget, event.clientX, event.clientY);
        }}
        onKeyDown={(event) => {
          if (!cover || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
          event.preventDefault();
          const step = event.shiftKey ? 10 : 2;
          setDraft((value) => ({
            ...value,
            x: clampMediaPosition((value.x ?? 50) + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0)),
            y: clampMediaPosition((value.y ?? 50) + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0)),
          }));
          setSaved(false);
        }}
      >
        {embedStill ? (
          <span className={controls.cropEmbed} style={embedFramingStyle(previewMedia, sourceAspect)}>
            {/* A plain img: a small editor-only still. */}
            <img src={embedStill} alt={media.alt} />
          </span>
        ) : source && media.kind === 'video' ? (
          <video src={source} poster={media.poster} controls playsInline preload="metadata" aria-label={media.alt || 'Video framing preview'} style={style} />
        ) : source ? (
          <img src={source} alt={media.alt} style={style} />
        ) : <span className={controls.cropEmpty}>{media.sourceMode === 'youtube' ? 'Paste a YouTube link to preview its framing.' : 'Add an image or video to preview its framing.'}</span>}
        {source && cover && <span className={controls.focusMarker} style={{ left: `${draft.x ?? 50}%`, top: `${draft.y ?? 50}%` }} aria-hidden="true" />}
      </div>
      {card ? (
        <SelectField
          label="Zoom"
          value={String(zoom)}
          options={zooms.map((step) => ({ value: String(step), label: zoomLabel(step) }))}
          onChange={(value) => { setDraft((current) => ({ ...current, zoom: Number(value) > 1 ? Number(value) : undefined })); setSaved(false); }}
        />
      ) : <>
        <SelectField
          label="Viewport"
          value={draft.aspect ? String(draft.aspect) : ''}
          options={[...FRAME_ASPECTS]}
          onChange={(value) => { setDraft((current) => ({ ...current, aspect: value ? Number(value) : undefined })); setSaved(false); }}
        />
        <SelectField
          label="Fit"
          value={draft.fit ?? 'cover'}
          options={[{ value: 'cover', label: 'Fill frame (crop)' }, { value: 'contain', label: `Show whole ${noun}` }]}
          onChange={(fit) => { setDraft((current) => ({ ...current, fit })); setSaved(false); }}
        />
      </>}
      <p className={controls.cropReadout} aria-live="polite">
        {cover ? `Focus ${draft.x ?? 50}% across, ${draft.y ?? 50}% down${card ? ` · ${zoomLabel(zoom)}` : ''} · arrow keys nudge` : `Whole ${noun} shown · focus is not used`}
      </p>
      {embedStill && embedFramingHidesControls(previewMedia, sourceAspect) && (
        <p className={controls.help}>This crop trims YouTube’s control bar, which runs along the player’s bottom edge. Readers can still click the video to play. To keep the bar, drag the focus to the bottom and use a viewport at least as wide as the video.</p>
      )}
      <div className={controls.cropActions}>
        <button type="button" className={controls.button} onClick={reset}>Reset</button>
        <button type="button" className={controls.button} onClick={cancel}>Cancel</button>
        <button type="button" className={controls.button} disabled={!source} onClick={() => {
          onChange({ ...media, framing: normalizeMediaFraming(draft) }, 'record');
          setSaved(true);
        }}>Apply framing</button>
      </div>
      <p className={controls.uploadStatus} role="status">{saved ? 'Framing applied. Save the story to keep it.' : ''}</p>
    </Disclosure>
  );
}

/** `rgb(…)` or `color(srgb …)`, as getComputedStyle reports a colour → `#rrggbb`. */
function computedHex(css: string): `#${string}` | undefined {
  const rgb = css.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  const srgb = css.match(/^color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)/);
  const channels = rgb ? rgb.slice(1, 4).map(Number) : srgb ? srgb.slice(1, 4).map((value) => Math.round(Number(value) * 255)) : null;
  return channels ? normalizeMatHex(channels.map((value) => value.toString(16).padStart(2, '0')).join('')) : undefined;
}

/**
 * The colour of the plate an image sits on: the story's default, a preset
 * that follows the reader's theme, or any colour at all — from the system
 * picker (which opens on the colour showing now, so a preset can be nudged)
 * or typed as a hex. One drag through the picker is one undo step; the hex
 * field is a text field, which the settings panel already makes one step
 * from focus to blur (StoryInspector's InspectorPanel), so it only merges.
 */
function MatColorField({ value, mixed = false, onChange }: { value: StoryMatColor | undefined; mixed?: boolean; onChange: (value: StoryMatColor | undefined, history: HistoryMode) => void }) {
  const name = useId();
  const custom = value && !isStoryMatPreset(value) ? value : undefined;
  const lowContrast = lowMatContrast(custom);
  const swatchesRef = useRef<HTMLDivElement>(null);
  // The picker's starting colour when no custom one is set yet.
  const [seed, setSeed] = useState<`#${string}`>();
  const [draft, setDraft] = useState<string | null>(null);
  // Whether this stretch of picking has its undo step yet.
  const recorded = useRef(false);
  const pick = (next: StoryMatColor) => {
    onChange(next, recorded.current ? 'merge' : 'record');
    recorded.current = true;
  };
  const begin = () => {
    recorded.current = false;
    if (custom) return;
    const chip = swatchesRef.current?.querySelector('input:checked + span');
    const shown = chip && computedHex(getComputedStyle(chip).backgroundColor);
    if (shown) setSeed(shown);
  };
  // The panel closes the field's undo step a microtask after blur, so a hex
  // landing on blur still belongs to it.
  const commitDraft = () => {
    const hex = draft === null ? undefined : normalizeMatHex(draft);
    if (hex && hex !== custom) onChange(hex, 'merge');
    setDraft(null);
  };
  const presets = [{ value: '', label: 'Story default' }, ...STORY_MAT_PRESETS];
  return (
    <fieldset className={controls.matField}>
      <legend>Matte color</legend>
      <div ref={swatchesRef} className={controls.swatches}>
        {presets.map((preset) => (
          <label key={preset.value || 'default'} className={controls.swatch} title={preset.label}>
            <input
              type="radio"
              name={name}
              value={preset.value}
              checked={!mixed && !custom && (value ?? '') === preset.value}
              aria-label={preset.label}
              onChange={() => onChange(preset.value ? preset.value as StoryMatPreset : undefined, 'record')}
            />
            <span className={controls.swatchChip} style={storyMatStyle(preset.value)} />
          </label>
        ))}
      </div>
      <div className={controls.customRow}>
        <label className={controls.swatch} data-selected={custom && !mixed ? true : undefined} title="Custom color">
          <input
            type="color"
            value={custom ?? seed ?? ''}
            aria-label="Pick a custom matte color"
            onPointerDown={begin}
            onFocus={begin}
            onChange={(event) => { const hex = normalizeMatHex(event.currentTarget.value); if (hex) pick(hex); }}
          />
          <span className={controls.swatchChip} style={storyMatStyle(custom)} data-empty={custom ? undefined : true}><Pipette aria-hidden="true" /></span>
        </label>
        <input
          type="text"
          className={`${inputClass} ${controls.hexInput}`}
          value={draft ?? custom ?? ''}
          placeholder="Hex, like #RRGGBB"
          aria-label="Custom matte color as a hex code"
          spellCheck={false}
          autoComplete="off"
          maxLength={7}
          onChange={(event) => {
            const text = event.currentTarget.value;
            setDraft(text);
            // Six digits are a whole colour: show it while typing. Three wait
            // for Enter or leaving the field, or #abc would flash on the way
            // to #abcdef.
            const hex = text.replace(/^#/, '').length === 6 ? normalizeMatHex(text) : undefined;
            if (hex) onChange(hex, 'merge');
          }}
          onBlur={commitDraft}
          onKeyDown={(event) => {
            if (event.key === 'Enter') { event.preventDefault(); commitDraft(); }
            // The panel puts the colour back; the typed text goes with it, or
            // leaving the field would apply it again.
            if (event.key === 'Escape') setDraft(null);
          }}
        />
      </div>
      {mixed
        ? <p className={controls.help}>The images in this group differ. Pick one to set them all.</p>
        : lowContrast
          ? <p className={controls.help} role="status">Text on this color — a full band’s caption, a grid’s headings — reads at {lowContrast.toFixed(1)}:1, under the 4.5:1 minimum. A lighter or darker shade fixes it.</p>
          : custom && <p className={controls.help}>A custom color stays the same in light and dark themes; presets follow the reader’s theme.</p>}
    </fieldset>
  );
}

/**
 * Media settings. `onPage` says which of the media's words the canvas already
 * renders as editable text for this placement, so the drawer doesn't repeat
 * them: a single image shows its caption and link label; a pair item or the
 * hero graphic's link does not. `ownPlate` is false where the media sits on a
 * plate its parent draws (a grid), whose colour is set there. `padded` is
 * false where the plate's margin isn't the media's: a full band, whose plate
 * runs to the window's edges. `notice` sits right under the source, where a
 * change to it is made.
 */
export function MediaEditor({
  media,
  onChange,
  label = 'Media',
  onPage = {},
  ownPlate = true,
  padded = true,
  notice,
  layout,
  hideRecordedAspect = false,
}: {
  media: StoryMedia;
  onChange: ChangeHandler<StoryMedia>;
  label?: string;
  onPage?: { caption?: boolean; link?: boolean };
  ownPlate?: boolean;
  padded?: boolean;
  notice?: ReactNode;
  /** Continuous media panel: sources and layout precede the other settings. */
  layout?: ReactNode;
  hideRecordedAspect?: boolean;
}) {
  const captionOnPage = onPage.caption ?? true;
  const linkOnPage = onPage.link ?? true;
  const { upload, drop, altRef } = useMediaFileUpload(media, onChange);
  const changeShot = (key: 'brief' | 'source' | 'length' | 'draft', value: string) => {
    const nextShot = { brief: '', ...media.shot, [key]: key === 'brief' ? value : optional(value) };
    const hasContent = Boolean(nextShot.brief.trim() || nextShot.source || nextShot.length || nextShot.draft);
    onChange({ ...media, shot: hasContent ? nextShot : undefined });
  };
  // Only the source fields differ by source. Every setting after them is
  // shared, or asks MEDIA_SOURCE_FEATURES whether this source can have it,
  // so a YouTube or PDF embed gets what a file gets.
  const sourceMode = mediaSource(media);
  const noun = mediaNoun(media);
  const canUpload = upload.available && mediaSupports(media, 'upload');
  const sourceSettings = (
    <>
      <SelectField
        label="Source type"
        compact={Boolean(layout)}
        value={sourceMode}
        options={[{ value: 'media', label: 'Image or video' }, { value: 'youtube', label: 'YouTube' }, { value: 'pdf', label: 'PDF' }]}
        onChange={(next) => onChange({ ...media, sourceMode: next === 'media' ? undefined : next }, 'record')}
      />
      {canUpload && <MediaUploadControl media={media} upload={upload} dragging={drop.over} />}
      {sourceMode === 'youtube' ? (
        <Field label="YouTube link" publicationInput="source" type="url" value={media.youtubeUrl ?? ''} placeholder="https://www.youtube.com/watch?v=…" help="YouTube, youtu.be, Shorts and Live links work. Readers see the poster, or YouTube’s own still, until they click it to play." onChange={(youtubeUrl) => onChange({ ...media, youtubeUrl: optional(youtubeUrl), aspect: youTubeLinkAspect(youtubeUrl, media.aspect) })} />
      ) : sourceMode === 'pdf' ? (
        <Field label="PDF link" publicationInput="source" value={media.pdfUrl ?? ''} placeholder="/files/document.pdf" help="A PDF your app serves. Readers see it in their browser’s viewer; add a caption link so phones can open the whole file." onChange={(pdfUrl) => onChange({ ...media, pdfUrl: optional(pdfUrl) })} />
      ) : (
        <Field label="Source URL" publicationInput="source" type="url" value={media.src ?? ''} placeholder="/images/example.png" onChange={(src) => onChange({ ...media, src: optional(src) })} />
      )}
      {mediaSupports(media, 'poster') && noun === 'video' && (
        <Field label="Poster URL" publicationInput="poster" type="url" value={media.poster ?? ''} onChange={(poster) => onChange({ ...media, poster: optional(poster) })} />
      )}
      {notice}
    </>
  );
  const mediaDetails = (
    <>
      <Field
        label="Heading above media"
        value={media.heading ?? ''}
        placeholder="Add an optional heading"
        help="Story copy shown immediately above this image, video or recording."
        onChange={(heading) => onChange({ ...media, heading: optional(heading) })}
      />
      {sourceMode === 'media' && (
        <SelectField
          label="Kind"
          value={media.kind}
          options={[{ value: 'image', label: 'Image' }, { value: 'video', label: 'Video' }]}
          onChange={(kind) => onChange(withKind(media, kind), 'record')}
        />
      )}
      <MediaDisplayEditor key={`${sourceMode}:${(sourceMode === 'youtube' ? media.youtubeUrl : media.src) ?? 'empty'}`} media={media} onChange={onChange} ownPlate={ownPlate} padded={padded} />
      {mediaSupports(media, 'playback') && media.kind === 'video' && (
        <SelectField
          label="Playback"
          value={media.loop === undefined ? '' : media.loop ? 'loop' : 'once'}
          options={[{ value: '', label: 'Default (loop)' }, { value: 'loop', label: 'Loop silently' }, { value: 'once', label: 'Play once' }]}
          onChange={(loop) => onChange({ ...media, loop: loop === '' ? undefined : loop === 'loop' }, 'record')}
        />
      )}
      {sourceMode === 'media' && media.kind === 'image' && (
        <Toggle label="Animated SVG" checked={media.animated ?? false} onChange={(animated) => onChange({ ...media, animated: animated || undefined }, 'record')} />
      )}
      <Field
        label="Link URL" publicationInput="link"
        type="url"
        value={media.link?.href ?? ''}
        placeholder="https://… or /path"
        help={linkOnPage && media.link ? 'Edit the link text on the page.' : undefined}
        onChange={(href) => onChange({ ...media, link: href.trim() ? { href: href.trim(), label: media.link?.label } : undefined })}
      />
      {!linkOnPage && (
        <Field
          label="Link label"
          value={media.link?.label ?? ''}
          placeholder="View source"
          disabled={!media.link}
          help={!media.link ? 'Add a supporting link before setting its label.' : undefined}
          onChange={(linkLabel) => onChange({ ...media, link: media.link ? { ...media.link, label: optional(linkLabel) } : undefined })}
        />
      )}
      {!captionOnPage && (
        <TextArea label="Caption" rows={2} value={media.caption ?? ''} onChange={(caption) => onChange({ ...media, caption: optional(caption) })} />
      )}
      <Disclosure summary="Alt text" meta={media.alt.trim() ? undefined : 'Missing'} initiallyOpen={!media.alt.trim()}>
        <TextArea ref={altRef} publicationInput="alt" label={media.sourceMode === 'youtube' ? 'Video title for screen readers' : media.sourceMode === 'pdf' ? 'Document title for screen readers' : `Describe the ${media.kind} for screen readers`} rows={2} value={media.alt} onChange={(alt) => onChange({ ...media, alt })} />
      </Disclosure>
      <Disclosure summary="Size and production notes" meta={media.shot ? 'Notes' : undefined}>
        {!hideRecordedAspect && <Field
          label="Aspect ratio"
          type="number"
          inline
          value={media.aspect?.toString() ?? ''}
          placeholder="1.6"
          onChange={(value) => {
            const parsed = Number(value);
            onChange({ ...media, aspect: value && Number.isFinite(parsed) && parsed > 0 ? parsed : undefined });
          }}
        />}
        <TextArea label="Capture brief" rows={2} value={media.shot?.brief ?? ''} onChange={(brief) => changeShot('brief', brief)} />
        <Field label="Source" value={media.shot?.source ?? ''} onChange={(source) => changeShot('source', source)} />
        <Field label="Target length" value={media.shot?.length ?? ''} onChange={(length) => changeShot('length', length)} />
        <Field label="Draft path" value={media.shot?.draft ?? ''} onChange={(draft) => changeShot('draft', draft)} />
        {media.shot && (
          <button type="button" className={controls.textButton} onClick={() => {
            const next = { ...media };
            delete next.shot;
            onChange(next, 'record');
          }}><X aria-hidden="true" />Clear production notes</button>
        )}
      </Disclosure>
    </>
  );
  const dropProps = canUpload ? drop.handlers : {};
  return layout ? (
    <>
      <SettingsSection title="Source" {...dropProps}>{sourceSettings}</SettingsSection>
      {layout}
      <SettingsSection title="Details">{mediaDetails}</SettingsSection>
    </>
  ) : (
    <SettingsSection title={label} {...dropProps}>
      <MediaIdentity media={media} eyebrow="Editing" fallback={`Untitled ${noun}`} />
      {sourceSettings}
      {mediaDetails}
    </SettingsSection>
  );
}


/**
 * Outcome rows for an outcomes block. Value, label, baseline, timeframe and
 * note are all on the page; the evidence label is chosen from a fixed set.
 */
function OutcomeRows({ items, onChange }: { items: StoryOutcome[]; onChange: ChangeHandler<StoryOutcome[]> }) {
  return (
    <ItemRows
      items={items}
      noun="outcome"
      preview={(item) => [item.value, item.label].filter((part) => part.trim()).join(' — ')}
      itemKey={(item, index) => item.id ?? index}
      visibility={{ get: (item) => item.hidden ?? false, set: (item, hidden) => ({ ...item, hidden: hidden || undefined }) }}
      details={(item, _index, change) => (
        <SelectField label="Evidence" value={item.evidence ?? ''} options={EVIDENCE_OPTIONS} onChange={(evidence) => change({ ...item, evidence: evidence || undefined }, 'record')} />
      )}
      create={(): StoryOutcome => ({ id: createEditorItemId('outcome'), value: '', label: '', evidence: 'observed' })}
      onChange={onChange}
    />
  );
}

type GalleryBlock = Extract<StoryBlock, { type: 'gallery' }>;

/** Every image group, whatever its layout: pick an image to edit it, move it
 *  within the group or take it out. Layout lives in the block's Style menu
 *  with every other block's presentation. Opens on `initialItem`, the image
 *  clicked on the page. */
function MediaGroupEditor({ block, initialItem = 0, onChange, contentInInspector = false }: { block: GalleryBlock; initialItem?: number; onChange: ChangeHandler<GalleryBlock>; contentInInspector?: boolean }) {
  const [requested, setSelected] = useState(initialItem);
  const selected = Math.max(0, Math.min(requested, block.items.length - 1));
  const labels = block.items.map((media, index) => `${MEDIA_NOUNS[mediaNoun(media)]} ${index + 1}`);
  // Only a stacked group prints each image's caption and link on the page.
  const stacked = block.layout === 'vertical';
  // A grid seats every image on one plate, so its colour is the group's.
  const grid = (block.layout ?? 'grid') === 'grid';
  const plateColor = sharedMatColor(block.items);
  const sideBySide = block.layout === 'horizontal';
  const item = block.items[selected];
  const updateItems = (items: StoryMedia[], history: HistoryMode = 'record') => onChange({ ...block, items }, history);
  return <>
    {sideBySide && <SettingsSection title="Alignment">
      <SelectField label="Frame alignment" value={block.alignment ?? ''} options={[
        { value: '', label: 'Keep existing layout' },
        { value: 'auto', label: 'Auto match' },
        { value: 'normal', label: 'Normal' },
        { value: 'custom', label: 'Custom' },
      ]} onChange={alignment => onChange({ ...block, alignment: alignment || undefined }, 'record')} />
      <p className={controls.quiet}>{block.alignment === 'auto' ? 'Match frame sizes without cropping.'
        : block.alignment === 'normal' ? 'Use each source’s natural proportions.'
        : block.alignment === 'custom' ? 'Set the frame ratio for each image below.'
        : 'Keep the original widths and ratios until you choose an alignment.'}</p>
    </SettingsSection>}
    {contentInInspector && <SettingsSection title="Content">
      <TextArea label="Image group caption" value={block.caption ?? ''} onChange={(caption) => onChange({ ...block, caption: optional(caption) })} />
    </SettingsSection>}
    <SettingsSection title="Images in this group">
      {block.items.length ? <MediaPicker items={block.items} labels={labels} selected={selected} onSelect={setSelected} /> : <p className={controls.quiet}>This group has no images yet.</p>}
      {block.items.length > 0 && <div className={controls.groupActions} aria-label={`Controls for ${labels[selected]}`}>
        <button type="button" className={controls.button} disabled={selected === 0} onClick={() => { updateItems(move(block.items, selected, -1)); setSelected(selected - 1); }}><ArrowUp aria-hidden="true" />Move earlier</button>
        <button type="button" className={controls.button} disabled={selected === block.items.length - 1} onClick={() => { updateItems(move(block.items, selected, 1)); setSelected(selected + 1); }}><ArrowDown aria-hidden="true" />Move later</button>
        <button type="button" className={controls.button} onClick={() => { updateItems(block.items.filter((_, index) => index !== selected)); setSelected(Math.max(0, selected - 1)); }}><X aria-hidden="true" />Remove image</button>
      </div>}
      <button type="button" className={controls.textButton} data-publication-input="add-image" onClick={() => { updateItems([...block.items, { kind: 'image', alt: '' }]); setSelected(block.items.length); }}><Plus aria-hidden="true" />Add image</button>
      {grid && block.items.length > 0 && (
        <MatColorField
          value={plateColor}
          mixed={!plateColor && block.items.some((media) => media.matColor)}
          onChange={(matColor, history) => updateItems(block.items.map((media) => ({ ...media, matColor })), history)}
        />
      )}
    </SettingsSection>
    {item && sideBySide && block.alignment === 'custom' && <SettingsSection title="Custom frame">
      <Field label={`${labels[selected]} frame ratio`} type="number" value={item.framing?.aspect?.toString() ?? ''}
        placeholder="Auto" help="Width divided by height, for example 1.6. Clear to use the source ratio."
        onChange={value => {
          const ratio = Number(value);
          updateItems(block.items.map((media, index) => index === selected ? { ...media, framing: { ...media.framing, aspect: Number.isFinite(ratio) && ratio > 0 ? ratio : undefined } } : media));
        }} />
    </SettingsSection>}
    {item && <MediaEditor label={labels[selected]} media={item} ownPlate={!grid} hideRecordedAspect={sideBySide && Boolean(block.alignment)} onPage={{ caption: stacked && !contentInInspector, link: stacked && !contentInInspector }} onChange={(media, history) => updateItems(block.items.map((item, index) => index === selected ? media : item), history)} />}
  </>;
}

type CustomBlock = Extract<StoryBlock, { type: 'custom' }>;

/** A host component's settings: which one it is, the words around it, and
 *  the definition's own inspector when it has one. */
function CustomBlockSettings({ block, onChange }: { block: CustomBlock; onChange: ChangeHandler<CustomBlock> }) {
  const { blocks } = useStoryEnvironment();
  const names = Object.keys(blocks);
  const definition = Object.prototype.hasOwnProperty.call(blocks, block.component) ? blocks[block.component] : undefined;
  const options = names.map((name) => ({ value: name, label: blocks[name].label }));
  if (block.component && !definition) options.unshift({ value: block.component, label: `${block.component} (not registered)` });
  const Inspector = definition?.Inspector;
  return (
    <>
      <SettingsSection title="Component">
        {options.length > 0
          ? <SelectField label="Component" value={block.component} options={options} onChange={(component) => onChange({ ...block, component, props: block.props ?? structuredClone(blocks[component]?.defaultProps ?? {}) }, 'record')} />
          : <p className={controls.help}>No custom blocks are registered. Pass a <code>blocks</code> registry to the editor to offer some.</p>}
        {Inspector && <Inspector props={block.props ?? definition?.defaultProps ?? {}} onChange={(props) => onChange({ ...block, props }, 'record')} />}
      </SettingsSection>
      <SettingsSection title="Story copy">
        <Field label="Title above the block" value={block.title ?? ''} placeholder="Add an optional title" onChange={(title) => onChange({ ...block, title: optional(title) })} />
        <TextArea label="Caption below the block" rows={2} value={block.caption ?? ''} placeholder="Add an optional caption" onChange={(caption) => onChange({ ...block, caption: optional(caption) })} />
      </SettingsSection>
    </>
  );
}

const LEDGER_LISTS: { key: 'led' | 'made' | 'influenced' | 'notMe'; label: string }[] = [
  { key: 'led', label: 'I led' },
  { key: 'made', label: 'I made' },
  { key: 'influenced', label: 'I influenced' },
  { key: 'notMe', label: 'Not mine' },
];

/**
 * The settings for one story block — only what isn't editable as text on the
 * canvas. Blocks whose every field is on the page say so in one line.
 */
export default function StoryBlockEditor({
  block,
  mediaItem,
  onChange,
  compactMedia = false,
  stepAddOnCanvas = false,
  contentInInspector = false,
}: {
  block: StoryBlock;
  /** Image groups: which image to open on (the one clicked on the page). */
  mediaItem?: number;
  onChange: ChangeHandler<StoryBlock>;
  compactMedia?: boolean;
  stepAddOnCanvas?: boolean;
  /** The continuous canvas displays atomic assets; provide their copy here. */
  contentInInspector?: boolean;
}) {
  switch (block.type) {
    case 'prose': {
      // Large text is a paragraph style, set in the text (the selection pill)
      // or for the whole block from the block menu's Style submenu. Lists
      // among paragraphs are set in the text too; picking a format here
      // replaces them for the whole block.
      const mixed = (block.format ?? 'paragraphs') === 'paragraphs' && storyListItems(block).size > 0;
      const formats: { value: StoryProseFormat | 'mixed'; label: string }[] = [{ value: 'paragraphs', label: 'Paragraphs' }, { value: 'bullets', label: 'Bulleted list' }, { value: 'numbered', label: 'Numbered list' }];
      return (
        <SettingsSection title="Format">
          <SelectField
            label="Text format"
            value={mixed ? 'mixed' : block.format ?? 'paragraphs'}
            options={mixed ? [...formats, { value: 'mixed', label: 'Paragraphs and lists' }] : formats}
            onChange={(format) => { if (format !== 'mixed') onChange(withProseFormat(block, format), 'record'); }}
          />
        </SettingsSection>
      );
    }
    case 'note':
      return contentInInspector ? <SettingsSection title="Content">
        <TextArea label="Note" value={block.text} onChange={(text) => onChange({ ...block, text })} />
      </SettingsSection> : <NothingToSet />;
    case 'quote':
      return contentInInspector ? <SettingsSection title="Content">
        <TextArea label="Quotation" value={block.quote.quote} onChange={(quote) => onChange({ ...block, quote: { ...block.quote, quote } })} />
        <Field label="Attribution" value={block.quote.name} onChange={(name) => onChange({ ...block, quote: { ...block.quote, name } })} />
        <Field label="Attribution role" value={block.quote.role} onChange={(role) => onChange({ ...block, quote: { ...block.quote, role } })} />
        <TextArea label="Quote context" value={block.quote.context ?? ''} onChange={(context) => onChange({ ...block, quote: { ...block.quote, context: optional(context) } })} />
      </SettingsSection> : <NothingToSet />;
    case 'subhead':
    case 'divider':
      return <NothingToSet />;
    case 'cta':
      return <SettingsSection title="Button"><CtaFields key={block.id ?? 'button'} value={block} onSave={value => onChange({ ...block, ...value }, 'record')} /></SettingsSection>;
    case 'spacer':
      // The primary control is embedded in the spacer on the page. Keep this
      // functional fallback for restored/deep-linked settings state instead
      // of the former dead-end “nothing to set” panel.
      return (
        <SettingsSection title="Size">
          <SelectField
            label="Extra space"
            value={block.size ?? 'medium'}
            options={[
              { value: 'small', label: 'Small · normal gap only' },
              { value: 'medium', label: 'Medium · +24 px' },
              { value: 'large', label: 'Large · +72 px' },
              { value: 'xl', label: 'Extra large · +144 px' },
            ]}
            onChange={(size) => onChange({ ...block, size }, 'record')}
          />
        </SettingsSection>
      );
    case 'callout':
      return (<>
        <SettingsSection title="Appearance">
          <SelectField
            label="Surface"
            value={!block.presentation || block.presentation === 'accent' ? 'soft' : block.presentation}
            options={[{ value: 'soft', label: 'Soft surface' }, { value: 'outline', label: 'Outline' }, { value: 'panel', label: 'Dark panel' }]}
            onChange={(presentation) => onChange({ ...block, presentation }, 'record')}
          />
          <CalloutAppearanceEditor block={block} onChange={(next) => onChange(next, 'record')} />
        </SettingsSection>
      </>);
    case 'media': {
      const layout = (
        <SettingsSection title="Layout">
          <SelectField
            label="Width"
            compact={compactMedia}
            value={block.width ?? 'wide'}
            options={[{ value: 'text', label: 'Text column' }, { value: 'wide', label: 'Wide' }, { value: 'full', label: 'Full band' }]}
            onChange={(width) => onChange({ ...block, width }, 'record')}
          />
          {block.width !== 'full' && (
            <SelectField
              label={compactMedia ? 'Alignment' : 'Image alignment'}
              compact={compactMedia}
              value={block.align ?? 'left'}
              options={[{ value: 'left', label: 'Left rail' }, { value: 'center', label: 'Centered' }]}
              onChange={(align) => onChange({ ...block, align: align === 'left' ? undefined : align }, 'record')}
            />
          )}
        </SettingsSection>
      );
      return (
        <>
          {!compactMedia && layout}
          <MediaEditor media={block.media} onPage={contentInInspector ? { caption: false, link: false } : undefined} layout={compactMedia ? layout : undefined} padded={block.width !== 'full'} onChange={(media, history) => onChange({ ...block, media, width: widthForSource(block, media) }, history)} />
        </>
      );
    }
    case 'gallery':
      // Keyed by the clicked image, so clicking another one in the same group
      // switches to it while the settings stay open.
      return <MediaGroupEditor key={mediaItem} block={block} initialItem={mediaItem} onChange={onChange} contentInInspector={contentInInspector} />;
    case 'custom':
      return <CustomBlockSettings block={block} onChange={onChange} />;
    case 'insight':
      // Everything else on an insight is edited on the page or in its Style
      // menu; order and removal are the two things text can't express.
      return (
        <>
          <SettingsSection title="Columns">
            <ItemRows
              items={block.columns}
              noun="column"
              preview={(column) => column.label || column.body.paragraphs.join(' ')}
              create={block.columns.length < 4 ? () => ({ id: createEditorItemId('column'), label: '', body: { paragraphs: [''] } }) : undefined}
              itemKey={(column, index) => column.id ?? index}
              onChange={(columns, history) => onChange({ ...block, columns }, history)}
              details={(column, index, change) => column.media?.length ? (
                <Disclosure summary={`Images and videos · ${column.media.length}`}>
                  <ItemRows<StoryMedia>
                    items={column.media}
                    noun="item"
                    label={column.label.trim() || `Column ${index + 1}`}
                    preview={(media) => media.alt || (media.src ? media.src.split('/').pop() ?? '' : '')}
                    onChange={(media, history) => {
                      const next: StoryInsightColumn = { ...column, media };
                      if (!media.length) delete next.media;
                      change(next, history);
                    }}
                    details={(media, at, changeMedia) => (
                      <Disclosure summary={`Edit ${media.kind === 'video' ? 'video' : 'image'} ${at + 1}`} meta={media.src ? undefined : 'No file yet'}>
                        <MediaEditor label={`Item ${at + 1}`} media={media} onPage={{ caption: false, link: false }} onChange={changeMedia} />
                      </Disclosure>
                    )}
                  />
                </Disclosure>
              ) : null}
            />
          </SettingsSection>
          <SettingsSection title="Steps">
            <ItemRows
              items={block.steps ?? []}
              noun="step"
              preview={(step) => step}
              create={() => ''}
              onChange={(steps, history) => onChange({ ...block, steps: steps.length ? steps : undefined }, history)}
            />
          </SettingsSection>
        </>
      );
    case 'metrics':
      return (
        <SettingsSection title="Metrics">
          <ItemRows<Metric>
            items={block.items}
            noun="metric"
            preview={(item) => [item.value, item.description].filter((part) => part.trim()).join(' — ')}
            create={() => ({ value: '', description: '' })}
            onChange={(items, history) => onChange({ ...block, items }, history)}
          />
        </SettingsSection>
      );
    case 'outcomes':
      return (
        <SettingsSection title="Outcomes">
          <OutcomeRows items={block.items} onChange={(items, history) => onChange({ ...block, items }, history)} />
        </SettingsSection>
      );
    case 'ledger': {
      const { ledger } = block;
      const partners = ledger.partners ?? [];
      const changeLedger = (next: StoryLedger, history?: HistoryMode) => onChange({ ...block, ledger: next }, history);
      return (
        <SettingsSection title="Lists">
          {LEDGER_LISTS.map(({ key, label }) => (
            <ItemRows
              key={key}
              label={label}
              items={ledger[key] ?? []}
              noun="item"
              preview={(item) => item}
              create={() => ''}
              onChange={(items, history) => changeLedger({ ...ledger, [key]: items }, history)}
            />
          ))}
          <ItemRows
            label="Partners"
            items={partners}
            noun="partner"
            preview={(item) => [item.role, item.owned].filter((part) => part.trim()).join(' — ')}
            create={() => ({ role: '', owned: '' })}
            onChange={(items, history) => changeLedger({ ...ledger, partners: items }, history)}
          />
        </SettingsSection>
      );
    }
    case 'implemented':
    case 'influenced':
      return (
        <SettingsSection title={block.type === 'implemented' ? 'Implemented' : 'Influenced'}>
          <ItemRows items={block.items} noun="item" preview={(item) => item} create={() => ''} onChange={(items, history) => onChange({ ...block, items }, history)} />
        </SettingsSection>
      );
    case 'partners':
      return (
        <SettingsSection title="Partners">
          <ItemRows items={block.items} noun="partner" preview={(item) => [item.role, item.owned].filter((part) => part.trim()).join(' — ')} create={() => ({ role: '', owned: '' })} onChange={(items, history) => onChange({ ...block, items }, history)} />
        </SettingsSection>
      );
    case 'contribution': {
      const changeVariant = (variant: 'implemented' | 'influenced' | 'partners') => {
        const items = variant === 'partners'
          ? block.items.filter((item): item is { role: string; owned: string } => typeof item !== 'string')
          : block.items.filter((item): item is string => typeof item === 'string');
        onChange({ ...block, variant, label: variant[0].toUpperCase() + variant.slice(1), items: items.length ? items : variant === 'partners' ? [{ role: '', owned: '' }] : [''] });
      };
      return (
        <>
          <SettingsSection title="Contribution style">
            <SelectField label="Variant" value={block.variant} options={[{ value: 'implemented', label: 'Implemented' }, { value: 'influenced', label: 'Influenced' }, { value: 'partners', label: 'Partners' }]} onChange={changeVariant} />
          </SettingsSection>
          <SettingsSection title="Items">
            {block.variant === 'partners' ? (
              <ItemRows items={block.items.filter((item): item is { role: string; owned: string } => typeof item !== 'string')} noun="partner" preview={(item) => [item.role, item.owned].filter((part) => part.trim()).join(' — ')} create={() => ({ role: '', owned: '' })} onChange={(items, history) => onChange({ ...block, items }, history)} />
            ) : (
              <ItemRows items={block.items.filter((item): item is string => typeof item === 'string')} noun="item" preview={(item) => item} create={() => ''} onChange={(items, history) => onChange({ ...block, items }, history)} />
            )}
          </SettingsSection>
        </>
      );
    }
    case 'collaboration':
      return (
        <SettingsSection title="Groups">
          <ItemRows
            items={block.map.groups}
            noun="group"
            preview={(group) => group.label}
            create={() => ({ label: '', detail: '' })}
            onChange={(groups, history) => onChange({ ...block, map: { ...block.map, groups } }, history)}
          />
        </SettingsSection>
      );
    case 'followUp':
      return (
        <>
          <SettingsSection title="Topics">
            <ItemRows
              items={block.items}
              noun="topic"
              preview={(item) => item.title || item.teaser}
              itemKey={(item, index) => item.id ?? index}
              create={() => ({ id: createEditorItemId('topic'), title: '', teaser: '', icon: 'layers' as const })}
              onChange={(items, history) => onChange({ ...block, items }, history)}
              details={(item, index, change) => (
                <Disclosure summary={`Topic ${index + 1} options`}>
                  <SelectField label="Icon" value={item.icon ?? 'layers'} options={[{ value: 'layers', label: 'Layers' }, { value: 'sparkles', label: 'Sparkles' }, { value: 'workflow', label: 'Workflow' }, { value: 'users', label: 'People' }]} onChange={(icon) => change({ ...item, icon }, 'record')} />
                  <Field label="Link destination" type="url" value={item.link?.href ?? ''} placeholder="/about or https://…" onChange={(href) => change({ ...item, link: href.trim() ? { href, label: item.link?.label } : undefined })} />
                  {item.link && <Field label="Link text" value={item.link.label ?? ''} placeholder="Explore this topic" onChange={(label) => change({ ...item, link: { ...item.link!, label: optional(label) } })} />}
                  {item.media ? <>
                    <MediaEditor label="Optional image" media={item.media} onPage={{ caption: false, link: false }} onChange={(media, history) => change({ ...item, media }, history)} />
                    <button type="button" className={controls.textButton} onClick={() => { const next = { ...item }; delete next.media; change(next, 'record'); }}><X aria-hidden="true" />Remove image</button>
                  </> : <button type="button" className={controls.textButton} onClick={() => change({ ...item, media: { kind: 'image', alt: '' } }, 'record')}><Plus aria-hidden="true" />Add image</button>}
                </Disclosure>
              )}
            />
          </SettingsSection>
          <SettingsSection title="Follow-up action">
            <Toggle label="Show follow-up action" checked={Boolean(block.cta)} onChange={(checked) => onChange({ ...block, cta: checked ? (block.cta ?? { label: '', href: '' }) : undefined }, 'record')} />
            {block.cta && <Field label="Destination" type="url" value={block.cta.href} placeholder="/about or https://…" onChange={(href) => onChange({ ...block, cta: { ...block.cta!, href } })} />}
          </SettingsSection>
        </>
      );
    case 'steps':
      return (
        <SettingsSection title="Steps">
          <ItemRows
            items={block.items}
            noun="step"
            preview={(step) => step.title || step.body}
            create={stepAddOnCanvas ? undefined : () => ({ title: '', body: '' })}
            onChange={(items, history) => onChange({ ...block, items }, history)}
          />
        </SettingsSection>
      );
    case 'decision': {
      const editorial = block.presentation === 'editorial';
      const media = block.media;
      return (
        <>
          <SettingsSection title="Layout">
            <SelectField
              label="Presentation"
              value={block.presentation ?? 'card'}
              options={[{ value: 'card', label: 'Card' }, { value: 'editorial', label: 'Editorial' }]}
              onChange={(presentation) => onChange({ ...block, presentation }, 'record')}
            />
            {!editorial && (
              <SelectField
                label="Status"
                value={block.status ?? 'held'}
                options={[{ value: 'held', label: 'Held' }, { value: 'revised', label: 'Revised later' }, { value: 'reversed', label: 'Reversed' }]}
                onChange={(status) => onChange({ ...block, status }, 'record')}
              />
            )}
            {/* The card prints the contribution inside its status line, which
                isn't editable text; the editorial layout gives it its own
                editable paragraph. */}
            {!editorial && <TextArea label="My contribution" rows={2} value={block.mine ?? ''} help="Shown after the status in the card’s header." onChange={(mine) => onChange({ ...block, mine: optional(mine) })} />}
            {editorial && <p className={controls.quiet}>Status, alternatives and media show in the Card layout.</p>}
          </SettingsSection>
          {editorial ? (
            <SettingsSection title="Steps">
              <ItemRows
                items={block.mechanism ?? []}
                noun="step"
                preview={(step) => step}
                create={() => ''}
                onChange={(mechanism, history) => onChange({ ...block, mechanism: mechanism.length ? mechanism : undefined }, history)}
              />
            </SettingsSection>
          ) : (
            <>
              <SettingsSection title="Alternatives">
                <ItemRows
                  items={block.options ?? []}
                  noun="alternative"
                  preview={(option) => [option.label, option.whyNot].filter((part) => part.trim()).join(' — ')}
                  create={() => ({ label: '', whyNot: '' })}
                  onChange={(options, history) => onChange({ ...block, options: options.length ? options : undefined }, history)}
                />
              </SettingsSection>
              {media ? (
                <>
                  <MediaEditor label="Media" media={media} onChange={(next, history) => onChange({ ...block, media: next }, history)} />
                  <button type="button" className={controls.textButton} onClick={() => {
                    const next = { ...block };
                    delete next.media;
                    onChange(next, 'record');
                  }}><X aria-hidden="true" />Remove media</button>
                </>
              ) : (
                <SettingsSection title="Media">
                  <button type="button" className={controls.textButton} onClick={() => onChange({ ...block, media: { kind: 'image', alt: '' } }, 'record')}><Plus aria-hidden="true" />Add media</button>
                </SettingsSection>
              )}
            </>
          )}
        </>
      );
    }
  }
}
