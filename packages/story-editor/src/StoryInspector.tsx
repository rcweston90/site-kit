import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronRight, Plus, X } from 'lucide-react';
import type { Story, StoryBlock, StoryChapter, StoryMedia, StoryOutcome, StoryTone, StoryVisibility } from '@rcweston/story-core';
import type { StoryCompany } from '@rcweston/story-react';
import { heroLogo } from '@rcweston/story-react';
import { storyMatStyle, storyToneMat } from '@rcweston/story-react';
import { STORY_ADDRESS_MESSAGES, formatStoryAddressInput, storyAddressProblem, suggestStoryAddress } from '@rcweston/story-core';
import StoryBlockEditor, {
  EVIDENCE_OPTIONS,
  Field,
  ItemRows,
  MediaEditor,
  NothingToSet,
  SelectField,
  SettingsSection,
  TextArea,
  Toggle,
} from './StoryBlockEditor.js';
import { hasInlineAssetCopy, inlineAssetPath } from './continuous/asset-copy.js';
import { controlStyles as controls, chromeStyles } from './classes.js';
import { previewCardSettingsId } from './publication-issue-labels.js';
import { EditorSelect } from './Select.js';
import { createCustomChapter, createEditorItemId, lookAlikeStories, moveItem } from './model.js';
import type { RelatedStoryOption } from '@rcweston/story-core';

const buttonClass = controls.button;

type HistoryMode = 'record' | 'merge';

/** Text controls whose edits are story edits (undoable as one step). The
 *  address field isn't: it moves the story rather than editing it. */
function isTextControl(target: EventTarget | null): target is HTMLInputElement | HTMLTextAreaElement {
  if (target instanceof Element && target.closest('[data-story-address-form]')) return false;
  return (target instanceof HTMLTextAreaElement)
    || (target instanceof HTMLInputElement && !target.readOnly && !target.disabled && ['text', 'url', 'number'].includes(target.type));
}

function InspectorPanel({
  children,
  tone,
  onEditStart,
  onEditEnd,
  onEditCancel,
}: {
  children: ReactNode;
  /** The panel opens outside the story, so it carries the story's mat for
   *  the "Story default" swatch to show. */
  tone: StoryTone | undefined;
  onEditStart: () => void;
  onEditEnd: () => void;
  onEditCancel: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const start = (event: FocusEvent) => {
      if (isTextControl(event.target)) onEditStart();
    };
    const commit = (event: FocusEvent) => {
      if (!isTextControl(event.target)) return;
      queueMicrotask(onEditEnd);
    };
    const cancel = (event: KeyboardEvent) => {
      if (event.isComposing || event.key !== 'Escape' || !isTextControl(event.target)) return;
      const target = event.target;
      event.preventDefault();
      onEditCancel();
      panel.ownerDocument.defaultView?.requestAnimationFrame(() => target.blur());
    };
    panel.addEventListener('focusin', start);
    panel.addEventListener('focusout', commit);
    panel.addEventListener('keydown', cancel);
    return () => {
      panel.removeEventListener('focusin', start);
      panel.removeEventListener('focusout', commit);
      panel.removeEventListener('keydown', cancel);
    };
  }, [onEditCancel, onEditEnd, onEditStart]);

  return (
    <div
      ref={panelRef}
      className={controls.panel}
      style={storyMatStyle(storyToneMat(tone))}
    >
      {children}
    </div>
  );
}

function AddButton({ children, label, onClick }: { children: string; label?: string; onClick: () => void }) {
  return <button type="button" className={controls.textButton} aria-label={label} onClick={onClick}><Plus aria-hidden="true" />{children}</button>;
}

function AddCustomSection({ story, onChange, onSelect }: {
  story: Story;
  onChange: (story: Story, history?: HistoryMode) => void;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const close = () => {
    setOpen(false);
    setName('');
  };

  const create = (event: FormEvent) => {
    event.preventDefault();
    const title = name.trim();
    if (!title) {
      inputRef.current?.focus();
      return;
    }
    const chapter = { ...createCustomChapter(), title };
    onChange({ ...story, chapters: [...story.chapters, chapter] }, 'record');
    onSelect(`chapter:${chapter.key}`);
    close();
  };

  if (!open) {
    return (
      <button type="button" className={buttonClass} onClick={() => setOpen(true)}>
        <Plus aria-hidden="true" />Add custom section
      </button>
    );
  }

  return (
    <form className={controls.panel} onSubmit={create}>
      <label className={controls.field} htmlFor={inputId}>
        Section name
        <input
          ref={inputRef}
          id={inputId}
          className={controls.input}
          value={name}
          placeholder="For example, What changed"
          onChange={(event) => setName(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing || event.key !== 'Escape') return;
            event.preventDefault();
            close();
          }}
        />
      </label>
      <div className={controls.moveActions}>
        <button type="submit" className={primaryButton} disabled={!name.trim()}>Create section</button>
        <button type="button" className={controls.button} onClick={close}>Cancel</button>
      </div>
    </form>
  );
}

/** An optional region in story settings: a switch once it exists, "Add"
 *  before — an absent region has nothing on the page to open settings from.
 *  `addLabel` names a more specific add, e.g. "Use the original animation". */
function RegionRow({ label, shown, onShow, onAdd, addLabel }: { label: string; shown: boolean; onShow: (show: boolean) => void; onAdd?: () => void; addLabel?: string }) {
  return (
    <li>
      {onAdd
        ? <div className={controls.region}>{label}<AddButton label={addLabel ? undefined : `Add ${label.toLowerCase()}`} onClick={onAdd}>{addLabel ?? 'Add'}</AddButton></div>
        : <Toggle label={label} checked={shown} onChange={onShow} />}
    </li>
  );
}

/** What the reader sees move or not: a clip or animated SVG is an animation. */
const heroMediaWord = (media: StoryMedia) => (media.animated ? 'animation' : media.kind === 'video' ? 'video' : 'image');
const heroGraphicWord = (media: StoryMedia) => (media.kind === 'video' || media.animated ? 'animation' : 'graphic');

/** Removal is instant; the editor's undo brings it back. */
function RemoveButton({ children, onClick }: { children: string; onClick: () => void }) {
  return <button type="button" className={controls.textButton} onClick={onClick}><X aria-hidden="true" />{children}</button>;
}

function visible(value: boolean | undefined) { return value !== false; }

/**
 * The studies this one recommends, picked from the stories that exist. Rows
 * order and remove them; the first one readers can open is the next-study
 * card, so a story saved only as drafts is flagged and passed over until it's
 * published. A slug that no longer names a story stays listed and flagged
 * until it's removed, since dropping it quietly would change the page behind
 * the author's back. Studies titled alike (a review copy, this story itself)
 * show their address. Without `options` (no list to check against) slugs are
 * listed as they are.
 */
function RelatedStories({ related, options, currentTitle, onChange }: {
  related: readonly string[];
  options?: readonly RelatedStoryOption[];
  /** This story's title, so a study named like it shows its address. */
  currentTitle: string;
  onChange: (related: string[]) => void;
}) {
  const labelId = useId();
  const known = new Map(options?.map((study) => [study.slug, study]));
  const lookAlike = lookAlikeStories(options ?? [], currentTitle);
  const remaining = options?.filter((study) => !related.includes(study.slug)) ?? [];
  const unpublished = remaining.filter((study) => study.unpublished);
  // Keyed by slug (and which repeat of it), so a moved row keeps its focus.
  const repeats = new Map<string, number>();
  const keys = related.map((slug) => {
    const nth = repeats.get(slug) ?? 0;
    repeats.set(slug, nth + 1);
    return `${slug}:${nth}`;
  });
  const move = (index: number, direction: -1 | 1, button: HTMLButtonElement) => {
    onChange(moveItem(related, index, direction));
    // At either end the arrow just pressed turns off; hand focus to the other.
    const landing = index + direction;
    if (landing === 0 || landing === related.length - 1) {
      const row = button.closest('li');
      requestAnimationFrame(() => row?.querySelector<HTMLButtonElement>(`[data-move="${-direction}"]`)?.focus());
    }
  };
  const option = (study: RelatedStoryOption) => (
    <option key={study.slug} value={study.slug}>
      {[study.title, study.company].filter(Boolean).join(' — ')}{lookAlike.has(study.slug) ? ` · ${study.slug}` : ''}
    </option>
  );
  return (
    <div className={controls.field} role="group" aria-labelledby={labelId}>
      <span id={labelId}>Related studies</span>
      {related.length > 0 && (
        <ol className={controls.items}>
          {related.map((slug, index) => {
            const study = known.get(slug);
            const name = lookAlike.has(slug) ? `${study?.title} (${slug})` : study?.title ?? slug;
            const note = [
              lookAlike.has(slug) && slug,
              options && !study && 'not found',
              study?.unpublished && 'not published',
            ].filter(Boolean).join(' · ');
            return (
              <li key={keys[index]} className={controls.item}>
                <div className={controls.itemRow}>
                  <span className={controls.itemPreview} title={study ? [study.title, study.company].filter(Boolean).join(' — ') : slug}>
                    <span className={chromeStyles.inspectorTruncated}>
                      {study?.title ?? slug}
                    </span>
                    {note && <span className={chromeStyles.inspectorTruncated2}>{note}</span>}
                  </span>
                  <button type="button" className={controls.iconButton} data-move="-1" aria-label={`Move ${name} up`} title="Move up" disabled={index === 0} onClick={(event) => move(index, -1, event.currentTarget)}><ArrowUp aria-hidden="true" /></button>
                  <button type="button" className={controls.iconButton} data-move="1" aria-label={`Move ${name} down`} title="Move down" disabled={index === related.length - 1} onClick={(event) => move(index, 1, event.currentTarget)}><ArrowDown aria-hidden="true" /></button>
                  <button type="button" className={controls.iconButton} data-publication-related={index} aria-label={`Remove ${name}`} title="Remove" onClick={() => onChange(related.filter((_, at) => at !== index))}><X aria-hidden="true" /></button>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {remaining.length > 0 && (
        // Resets to the prompt after each pick, so it reads as an action.
        <EditorSelect
          aria-label="Add a related study"
          value=""
          onChange={(event) => {
            const slug = event.currentTarget.value;
            if (slug) onChange([...related, slug]);
          }}
        >
          <option value="">Add a study…</option>
          {remaining.filter((study) => !study.unpublished).map(option)}
          {unpublished.length > 0 && <optgroup label="Not published">{unpublished.map(option)}</optgroup>}
        </EditorSelect>
      )}
      <span className={controls.help}>
        {options?.length === 0
          ? 'There are no other studies to recommend yet.'
          : 'Next uses the first published choice shown in Work → Projects. If none qualify, it follows the Work order.'}
      </span>
    </div>
  );
}

/** What Story settings needs to offer a new address. */
export interface StoryAddressSettings {
  /** The story's current address (its slug). */
  slug: string;
  /** Why the address can't change right now, in plain words; null when it can. */
  unavailableReason: string | null;
  /** Addresses already used by other stories or old links. */
  takenAddresses: readonly string[];
  /** There are unsaved edits, which are saved before the story moves. */
  savesFirst: boolean;
  /** Moves the story. Resolves once it has moved; rejects with a message to show. */
  onChange: (next: string) => Promise<void>;
  /** How the address reads in your app, e.g. `(slug) => \`/stories/${slug}\``. Default: the slug. */
  display?: (slug: string) => string;
}

const primaryButton = chromeStyles.inspectorPrimaryButton;

/**
 * The story's address, read as the link a reader would see, with an inline
 * "Change…" that suggests one from the title and checks it as you type. The
 * old address keeps working, so the only consequence worth a line is that.
 */
function AddressSettings({ title, slug, address }: { title: string; slug: string; address?: StoryAddressSettings }) {
  // null while not editing; the field's text otherwise.
  const [draft, setDraft] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [insisted, setInsisted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const changeRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef(false);
  const inputId = useId();
  const messageId = useId();
  const editing = draft !== null;

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    } else if (restoreFocusRef.current) {
      restoreFocusRef.current = false;
      changeRef.current?.focus();
    }
  }, [editing]);

  const current = address?.slug ?? slug;
  const problem = draft === null ? null : storyAddressProblem(draft, { current, taken: address?.takenAddresses ?? [] });
  // "creating-" mid-word is on its way to a valid address: say nothing until
  // the person tries to use it.
  const typingDash = problem === 'dashes' && !insisted && /^[a-z0-9]+(?:-[a-z0-9]+)*-$/.test(draft ?? '');
  const message = failure ?? (problem && !typingDash ? STORY_ADDRESS_MESSAGES[problem] : null);

  const open = () => {
    setDraft(suggestStoryAddress(title) || current);
    setFailure(null);
    setInsisted(false);
  };
  const close = () => {
    restoreFocusRef.current = true;
    setDraft(null);
    setFailure(null);
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (draft === null || pending || !address) return;
    if (problem) {
      setInsisted(true);
      inputRef.current?.focus();
      return;
    }
    setPending(true);
    setFailure(null);
    try {
      // On success the editor moves to the new address, which closes this.
      await address.onChange(draft);
    } catch (reason) {
      setFailure(reason instanceof Error ? reason.message : 'The address couldn’t be changed.');
      setPending(false);
    }
  };

  return (
    <SettingsSection title="Address">
      <div className={controls.region}>
        <span className={chromeStyles.inspectorTruncated3} title={address?.display ? address.display(current) : current}>
          {address?.display ? address.display(current) : current}
        </span>
        {address && !editing && !address.unavailableReason && (
          <button ref={changeRef} type="button" className={controls.textButton} aria-label="Change address" onClick={open}>Change…</button>
        )}
      </div>
      {address?.unavailableReason && <p className={controls.help}>{address.unavailableReason}</p>}
      {address && editing && (
        <form className={controls.panel} data-story-address-form noValidate onSubmit={(event) => void submit(event)}>
          <label className={controls.field} htmlFor={inputId}>
            New address
            <input
              ref={inputRef}
              id={inputId}
              type="text"
              value={draft}
              readOnly={pending}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              aria-invalid={Boolean(problem && !typingDash) || undefined}
              aria-describedby={messageId}
              className={controls.input}
              onChange={(event) => {
                // Reformat in place so the caret stays where the person is typing.
                const input = event.currentTarget;
                const next = formatStoryAddressInput(input.value);
                if (next !== input.value) {
                  const caret = input.selectionStart === null ? null : Math.max(0, input.selectionStart + next.length - input.value.length);
                  input.value = next;
                  if (caret !== null) input.setSelectionRange(caret, caret);
                }
                setDraft(next);
                setFailure(null);
                setInsisted(false);
              }}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing || event.key !== 'Escape') return;
                event.preventDefault();
                if (!pending) close();
              }}
            />
          </label>
          <div id={messageId} aria-live="polite" className={chromeStyles.inspectorStack}>
            {message && <p className={chromeStyles.inspectorP}>{message}</p>}
            <p className={controls.help}>
              The old address will keep working and send readers here.{address.savesFirst ? ' Your unsaved changes are saved first.' : ''}
            </p>
          </div>
          <div className={controls.moveActions}>
            <button type="submit" className={primaryButton} disabled={pending} aria-disabled={Boolean(problem) || undefined}>
              {pending ? 'Changing…' : 'Change address'}
            </button>
            <button type="button" className={controls.button} disabled={pending} onClick={close}>Cancel</button>
          </div>
        </form>
      )}
    </SettingsSection>
  );
}


/**
 * The settings drawer for the current canvas selection. It holds only what
 * can't be edited as text on the page — media sources, visibility, layout
 * variants, list order, slugs — and structural block actions live in the
 * canvas's block menu, so nothing here repeats the document.
 */
export default function StoryInspector({
  story,
  company,
  selectedId,
  mediaItem,
  onChange,
  onSelect,
  onEditStart,
  onEditEnd,
  onEditCancel,
  address,
  relatedStories,
  original,
  compactBlockHelp = false,
}: {
  story: Story;
  company?: StoryCompany | null;
  selectedId: string;
  /** Image groups: the image clicked on the page, shown first. */
  mediaItem?: number;
  onChange: (story: Story, history?: HistoryMode) => void;
  onSelect: (id: string) => void;
  onEditStart: () => void;
  onEditEnd: () => void;
  onEditCancel: () => void;
  /** Story settings only: the address row and its rename flow. Without it
   *  the address is shown read only. */
  address?: StoryAddressSettings;
  /** Story settings only: the other stories Related can pick from. */
  relatedStories?: readonly RelatedStoryOption[];
  /** The story as readers see it now. When the draft has no hero media or
   *  split graphic but this does, adding one brings back its media instead
   *  of an empty slot. */
  original?: Story | null;
  /** Continuous document mode already exposes structural actions beside the asset. */
  compactBlockHelp?: boolean;
}) {
  const update = <K extends keyof Story>(key: K, value: Story[K], history: HistoryMode = 'merge') => onChange({ ...story, [key]: value }, history);
  const originalHero = !story.hero ? original?.hero : undefined;
  const originalGraphic = !story.heroGraphic ? original?.heroGraphic : undefined;
  // One recorded change each, so a single undo takes it back.
  const addHero = originalHero
    ? { label: `Use the original ${heroMediaWord(originalHero)}`, apply: () => update('hero', structuredClone(originalHero), 'record') }
    : { label: undefined, apply: () => update('hero', { kind: 'image', alt: '' }, 'record') };
  const addGraphic = originalGraphic
    ? { label: `Use the original ${heroGraphicWord(originalGraphic)}`, apply: () => onChange({ ...story, heroLayout: 'split-graphic', heroGraphic: structuredClone(originalGraphic) }, 'record') }
    : { label: undefined, apply: () => onChange({ ...story, heroLayout: 'split-graphic', heroGraphic: { kind: 'video', alt: '' } }, 'record') };
  const setVisibility = (key: keyof StoryVisibility, isVisible: boolean) => update('visibility', { ...story.visibility, [key]: isVisible ? undefined : false }, 'record');
  // Keyed by selection so folds and drafts start fresh for each one.
  const panel = (body: ReactNode) => (
    <InspectorPanel key={selectedId} tone={story.tone} onEditStart={onEditStart} onEditEnd={onEditEnd} onEditCancel={onEditCancel}>
      {body}
    </InspectorPanel>
  );

  if (selectedId.startsWith('block:')) {
    const [, chapterKey, blockId] = selectedId.split(':');
    const chapterIndex = story.chapters.findIndex((chapter) => chapter.key === chapterKey);
    const chapter = story.chapters[chapterIndex];
    const blockIndex = chapter?.blocks.findIndex((block, index) => (block.id ?? String(index)) === blockId) ?? -1;
    const block = chapter?.blocks[blockIndex];
    if (chapter && block && chapterIndex >= 0 && blockIndex >= 0) {
      const changeBlock = (next: StoryBlock, history: HistoryMode = 'merge') => onChange({
        ...story,
        chapters: story.chapters.map((item, at) => at === chapterIndex ? { ...item, blocks: item.blocks.map((candidate, blockAt) => blockAt === blockIndex ? next : candidate) } : item),
      }, history);
      const inlineCopy = compactBlockHelp && hasInlineAssetCopy(block)
        && Boolean(inlineAssetPath(story, { block, chapterKey: chapter.key, blockIndex }));
      return panel(
        <>
          {/* Settings hold only what the block's ⋮⋮ menu can't: showing,
              moving, copying and deleting live there (and on the keyboard),
              so they aren't offered twice. */}
          {!(compactBlockHelp && (block.type === 'media' || block.type === 'callout')) && <p className={controls.help}>{inlineCopy ? 'Edit text on the canvas. Use these settings to arrange the rows.' : compactBlockHelp ? 'Edit this asset here. Close settings to keep writing.' : 'Show, move, duplicate or delete this block from its ⋮⋮ menu (⌥E), or drag it by the ⋮⋮.'}</p>}
          <StoryBlockEditor block={block} mediaItem={mediaItem} compactMedia={compactBlockHelp} contentInInspector={compactBlockHelp} stepAddOnCanvas={inlineCopy} onChange={changeBlock} />
        </>,
      );
    }
  }

  if (selectedId.startsWith('chapter:')) {
    const key = selectedId.slice('chapter:'.length);
    const chapterIndex = story.chapters.findIndex((chapter) => chapter.key === key);
    const chapter = story.chapters[chapterIndex];
    if (chapter) {
      const changeChapter = (next: StoryChapter, history: HistoryMode = 'merge') => onChange({ ...story, chapters: story.chapters.map((item, at) => at === chapterIndex ? next : item) }, history);
      return panel(
        <>
          <Toggle label="Show section" checked={!chapter.hidden} onChange={(show) => changeChapter({ ...chapter, hidden: show ? undefined : true }, 'record')} />
          <SettingsSection title="Layout">
            <SelectField label="Density" value={chapter.density ?? 'default'} options={[{ value: 'default', label: 'Default' }, { value: 'compact', label: 'Compact' }]} onChange={(density) => changeChapter({ ...chapter, density }, 'record')} />
            <SelectField label="Text columns" value={chapter.columns ?? 'one'} options={[{ value: 'one', label: 'One column' }, { value: 'two', label: 'Two columns' }]} onChange={(columns) => changeChapter({ ...chapter, columns }, 'record')} />
            <p className={controls.help}>Two columns stack on narrow screens.</p>
          </SettingsSection>
          {/* Sections aren't blocks, so their order isn't in the block menu. */}
          <SettingsSection title="Order">
            <div className={controls.moveActions}>
              <button type="button" className={buttonClass} disabled={chapterIndex === 0} onClick={() => onChange({ ...story, chapters: moveItem(story.chapters, chapterIndex, -1) }, 'record')}>Move up</button>
              <button type="button" className={buttonClass} disabled={chapterIndex === story.chapters.length - 1} onClick={() => onChange({ ...story, chapters: moveItem(story.chapters, chapterIndex, 1) }, 'record')}>Move down</button>
            </div>
          </SettingsSection>
        </>,
      );
    }
  }

  if (selectedId === 'hero-copy') {
    return panel(
      <>
        <NothingToSet />
        <button type="button" className={controls.textButton} onClick={() => onSelect('story')}>Story settings<ChevronRight aria-hidden="true" /></button>
      </>,
    );
  }

  if (selectedId === 'hero-meta') {
    return panel(
      <>
        <LogoSettings story={story} company={company} update={update} />
        <SettingsSection title="Project year">
          <p className={controls.helper}>Edit the year in the story header. It applies only to this story. Use four digits or leave it blank.</p>
        </SettingsSection>
        <SettingsSection title="Read time">
          <Toggle label="Show read time" checked={visible(story.visibility?.readTime)} onChange={(show) => setVisibility('readTime', show)} />
        </SettingsSection>
      </>,
    );
  }

  // A host's own preview-card settings would live with the media the card
  // follows; the package has none of its own.
  const cardNotice = undefined;
  const cardSettings = null;

  if (selectedId === 'hero-media') {
    return panel(
      story.hero ? <>
        <Toggle label="Show hero media" checked={visible(story.visibility?.heroMedia)} onChange={(show) => setVisibility('heroMedia', show)} />
        <MediaEditor media={story.hero} notice={cardNotice} onChange={(hero, history) => update('hero', hero, history)} />
        {cardSettings}
        <RemoveButton onClick={() => update('hero', undefined, 'record')}>Remove hero media</RemoveButton>
      </> : <>
        <AddButton onClick={addHero.apply}>{addHero.label ?? 'Add hero media'}</AddButton>
        {cardSettings}
      </>,
    );
  }

  if (selectedId === 'hero-read-time') {
    return panel(
      <>
        <p className={controls.helper}>Calculated from the visible story.</p>
        <Toggle label="Show read time" checked={visible(story.visibility?.readTime)} onChange={(show) => setVisibility('readTime', show)} />
      </>,
    );
  }

  if (selectedId === 'hero-graphic') {
    const shown = story.heroLayout === 'split-graphic';
    return panel(
      story.heroGraphic ? <>
        <Toggle label="Show split graphic" checked={shown} onChange={(show) => update('heroLayout', show ? 'split-graphic' : 'standard', 'record')} />
        {/* The split layout prints the caption as editable text but never the link. */}
        <MediaEditor media={story.heroGraphic} onPage={{ caption: shown, link: false }} notice={cardNotice} onChange={(heroGraphic, history) => update('heroGraphic', heroGraphic, history)} />
        {cardSettings}
        <RemoveButton onClick={() => update('heroGraphic', undefined, 'record')}>Remove split graphic</RemoveButton>
      </> : <AddButton onClick={addGraphic.apply}>{addGraphic.label ?? 'Add split graphic'}</AddButton>,
    );
  }

  if (selectedId === 'facts') {
    return panel(
      <>
        <Toggle label="Show facts" checked={visible(story.visibility?.facts)} onChange={(show) => setVisibility('facts', show)} />
        <SettingsSection>
          <ItemRows
            items={story.facts}
            noun="fact"
            preview={(fact) => [fact.label, fact.value].filter((part) => part.trim()).join(' — ')}
            itemKey={(fact, index) => fact.id ?? index}
            visibility={{ get: (fact) => fact.hidden ?? false, set: (fact, hidden) => ({ ...fact, hidden: hidden || undefined }) }}
            create={() => ({ id: createEditorItemId('fact'), label: '', value: '' })}
            onChange={(facts, history) => update('facts', facts, history)}
          />
        </SettingsSection>
      </>,
    );
  }

  if (selectedId === 'hindsight') {
    const hindsight = story.hindsight;
    return panel(
      hindsight ? <>
        <Toggle label="Show hindsight" checked={visible(story.visibility?.hindsight)} onChange={(show) => setVisibility('hindsight', show)} />
        <SettingsSection title="Paragraphs">
          <ItemRows
            items={hindsight.paragraphs}
            noun="paragraph"
            preview={(paragraph) => paragraph}
            create={() => ''}
            onChange={(paragraphs, history) => update('hindsight', { ...hindsight, paragraphs }, history)}
          />
        </SettingsSection>
        <RemoveButton onClick={() => update('hindsight', undefined, 'record')}>Remove hindsight</RemoveButton>
      </> : <AddButton onClick={() => update('hindsight', { title: '', paragraphs: [''] }, 'record')}>Add hindsight</AddButton>,
    );
  }

  if (selectedId === 'decisions') {
    const section = story.decisions;
    return panel(
      section ? <>
        <Toggle label="Show decisions section" checked={!section.hidden} onChange={(show) => update('decisions', { ...section, hidden: show ? undefined : true }, 'record')} />
        {/* The page can edit an introduction but has nowhere to click when
            there isn't one, so adding and removing it lives here. */}
        {section.intro === undefined
          ? <AddButton onClick={() => update('decisions', { ...section, intro: '' }, 'record')}>Add introduction</AddButton>
          : <RemoveButton onClick={() => update('decisions', { ...section, intro: undefined }, 'record')}>Remove introduction</RemoveButton>}
        <SettingsSection title="Decisions">
          <ItemRows
            items={section.items}
            noun="decision"
            preview={(item) => item.title}
            itemKey={(item, index) => item.id ?? index}
            details={(item, _index, change) => <Toggle label="Expanded initially" checked={item.expanded ?? false} onChange={(expanded) => change({ ...item, expanded: expanded || undefined }, 'record')} />}
            create={() => ({ id: createEditorItemId('decision'), title: '', detail: '' })}
            onChange={(items, history) => update('decisions', { ...section, items }, history)}
          />
        </SettingsSection>
        <RemoveButton onClick={() => update('decisions', undefined, 'record')}>Remove decisions section</RemoveButton>
      </> : <AddButton onClick={() => update('decisions', { title: 'Decisions', intro: '', items: [{ id: createEditorItemId('decision'), title: '', detail: '' }] }, 'record')}>Add decisions section</AddButton>,
    );
  }

  if (selectedId === 'credits') {
    const credits = story.credits ?? [];
    return panel(
      <>
        <Toggle label="Show credits" checked={visible(story.visibility?.credits)} onChange={(show) => setVisibility('credits', show)} />
        <SettingsSection>
          <ItemRows
            items={credits}
            noun="credit"
            preview={(credit) => [credit.name, credit.role].filter((part) => part.trim()).join(' — ')}
            itemKey={(credit, index) => credit.id ?? index}
            visibility={{ get: (credit) => credit.hidden ?? false, set: (credit, hidden) => ({ ...credit, hidden: hidden || undefined }) }}
            create={() => ({ id: createEditorItemId('credit'), name: '', role: '' })}
            onChange={(next, history) => update('credits', next, history)}
          />
        </SettingsSection>
      </>,
    );
  }

  return panel(
    <>
      <SettingsSection title="Sections">
        <ul className={controls.regions}>
          {story.chapters.map((chapter, index) => (
            <li key={chapter.key} className={controls.region}>
              <button type="button" className={controls.textButton} onClick={() => onSelect(`chapter:${chapter.key}`)}>
                <span className={chromeStyles.inspectorPart}>{String(index + 1).padStart(2, '0')}</span> {chapter.title || 'Untitled section'}
              </button>
            </li>
          ))}
        </ul>
        <AddCustomSection story={story} onChange={onChange} onSelect={onSelect} />
      </SettingsSection>
      <SettingsSection title="Show on page">
        <ul className={controls.regions}>
          <RegionRow label="Facts" shown={visible(story.visibility?.facts)} onShow={(show) => setVisibility('facts', show)} onAdd={story.facts.length ? undefined : () => update('facts', [{ id: createEditorItemId('fact'), label: '', value: '' }], 'record')} />
          <RegionRow label="Read time" shown={visible(story.visibility?.readTime)} onShow={(show) => setVisibility('readTime', show)} />
          <RegionRow label="Hero media" shown={visible(story.visibility?.heroMedia)} onShow={(show) => setVisibility('heroMedia', show)} onAdd={story.hero ? undefined : addHero.apply} addLabel={addHero.label} />
          <RegionRow label="Split graphic" shown={story.heroLayout === 'split-graphic'} onShow={(show) => update('heroLayout', show ? 'split-graphic' : 'standard', 'record')} onAdd={story.heroGraphic ? undefined : addGraphic.apply} addLabel={addGraphic.label} />
          <RegionRow label="Decisions" shown={!story.decisions?.hidden} onShow={(show) => story.decisions && update('decisions', { ...story.decisions, hidden: show ? undefined : true }, 'record')} onAdd={story.decisions ? undefined : () => update('decisions', { title: 'Decisions', intro: '', items: [{ id: createEditorItemId('decision'), title: '', detail: '' }] }, 'record')} />
          <RegionRow label="Hindsight" shown={visible(story.visibility?.hindsight)} onShow={(show) => setVisibility('hindsight', show)} onAdd={story.hindsight ? undefined : () => update('hindsight', { title: '', paragraphs: [''] }, 'record')} />
          <RegionRow label="Credits" shown={visible(story.visibility?.credits)} onShow={(show) => setVisibility('credits', show)} onAdd={story.credits?.length ? undefined : () => update('credits', [{ id: createEditorItemId('credit'), name: '', role: '' }], 'record')} />
        </ul>
      </SettingsSection>
      <SettingsSection title="Look">
        <SelectField
          label="Hero presentation"
          value={story.heroPresentation ?? 'edition-cover'}
          options={[
            { value: 'edition-cover', label: 'Edition cover (1B)' },
            { value: 'offset-plate', label: 'Offset plate — title only (4C)' },
          ]}
          onChange={(heroPresentation) => update('heroPresentation', heroPresentation, 'record')}
        />
        <SelectField label="Tone" value={story.tone ?? 'neutral'} options={[{ value: 'neutral', label: 'Neutral' }, { value: 'cool', label: 'Cool' }, { value: 'warm', label: 'Warm' }, { value: 'panel', label: 'Panel' }]} onChange={(tone) => update('tone', tone, 'record')} />
      </SettingsSection>
      <SettingsSection title="Cards">
        <TextArea label="Card summary" rows={3} value={story.summary ?? ''} help="On your index of stories and the next-story card. If blank, the card uses the thesis." onChange={(summary) => update('summary', summary)} />
        <RelatedStories related={story.related ?? []} options={relatedStories} currentTitle={story.title} onChange={(related) => update('related', related.length ? related : undefined, 'record')} />
      </SettingsSection>
      <SettingsSection title="Index card metric">
        <p className={controls.help}>Not shown on this page. The first measured outcome (value with %, +, -, ~, × or →; evidence not plan or shipped) is the headline number on the story’s index card.</p>
        <ItemRows
          items={story.outcomes ?? []}
          noun="outcome"
          preview={(_outcome, index) => `Outcome ${index + 1}`}
          itemKey={(outcome, index) => outcome.id ?? index}
          details={(outcome, _index, change) => <>
            <Field label="Value" value={outcome.value} placeholder="+14%" onChange={(value) => change({ ...outcome, value })} />
            <Field label="Label" value={outcome.label} onChange={(label) => change({ ...outcome, label })} />
            <SelectField label="Evidence" value={outcome.evidence ?? ''} options={EVIDENCE_OPTIONS} onChange={(evidence) => change({ ...outcome, evidence: evidence || undefined }, 'record')} />
          </>}
          create={(): StoryOutcome => ({ id: createEditorItemId('outcome'), value: '', label: '', evidence: 'observed' })}
          onChange={(outcomes, history) => update('outcomes', outcomes.length ? outcomes : undefined, history)}
        />
      </SettingsSection>
      <LogoSettings story={story} company={company} update={update} />
      {/* Its own section rather than folded under "Advanced": it was the
          fold's only setting, and changing it is now an everyday action. */}
      <AddressSettings title={story.title} slug={story.slug} address={address} />
    </>,
  );
}

/** With a logo the company name isn't printed, so it's only editable here,
 *  where it supplies the logo's alt text. */
function LogoSettings({ story, company, update }: { story: Story; company?: StoryCompany | null; update: <K extends keyof Story>(key: K, value: Story[K], history?: HistoryMode) => void }) {
  const logo = heroLogo(story, company);
  if (logo?.source === 'company') {
    return (
      <SettingsSection title="Logo">
        <p className={controls.helper}>Using the logo your app supplies for {logo.alt}.</p>
      </SettingsSection>
    );
  }
  return (
    <SettingsSection title="Logo">
      <Field label="Company logo URL" type="url" value={story.companyLogo ?? ''} onChange={(companyLogo) => update('companyLogo', companyLogo || undefined)} />
      {story.companyLogo && <Field label="Company name" value={story.company} help="The logo’s alt text." onChange={(company) => update('company', company)} />}
    </SettingsSection>
  );
}
