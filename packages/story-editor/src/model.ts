import { STORY_CHAPTERS, type RelatedStoryOption, type StoryJsonValue, type Story, type StoryBlock, type StoryChapter, type StoryChapterKey, type StoryInsightColumn, type StoryRichText } from '@rcweston/story-core';
import { richTextFromPlain } from '@rcweston/story-core';

/** A title as a reader tells them apart: case, punctuation, curly quotes and
 *  a leading marker emoji don't make two stories look different. */
const titleLooks = (title: string) => title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/**
 * The stories whose title reads like another's (a review copy, a comparison,
 * or this story itself, `currentTitle`), so the picker can show their
 * addresses and no two entries look like the same story.
 */
export function lookAlikeStories(options: readonly RelatedStoryOption[], currentTitle = ''): Set<string> {
  const counts = new Map<string, number>();
  for (const title of [currentTitle, ...options.map((study) => study.title)]) {
    const looks = titleLooks(title);
    if (looks) counts.set(looks, (counts.get(looks) ?? 0) + 1);
  }
  return new Set(options.filter((study) => (counts.get(titleLooks(study.title)) ?? 0) > 1).map((study) => study.slug));
}

export interface EditorDraftState {
  story: Story;
  savedStory: Story;
  saveState: 'idle' | 'saving' | 'saved' | 'error';
  message: string | null;
  past: Story[];
  future: Story[];
  inlineBase: Story | null;
}

export type EditorDraftAction =
  | { type: 'edit'; story: Story; history?: 'record' | 'merge' }
  | { type: 'canvas-edit'; story: Story; boundary: boolean }
  | { type: 'canvas-history'; direction: 'undo' | 'redo' }
  | { type: 'inline-start' }
  | { type: 'inline-commit' }
  | { type: 'inline-cancel' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'save-start' }
  /** `autosave`: the editor saved on its own while the author kept working.
   *  The canvas and its undo history stay exactly as they are. */
  | { type: 'save-success'; story: Story; submittedStory: Story; version: number; autosave?: boolean }
  | { type: 'save-error'; message: string }
  | { type: 'load-version'; story: Story; version: number }
  | { type: 'reset'; story: Story; message?: string };

export function createEditorDraftState(story: Story): EditorDraftState {
  return {
    story: structuredClone(story),
    savedStory: structuredClone(story),
    saveState: 'idle',
    message: null,
    past: [],
    future: [],
    inlineBase: null,
  };
}

export function editorDraftReducer(state: EditorDraftState, action: EditorDraftAction): EditorDraftState {
  switch (action.type) {
    case 'edit':
      return {
        ...state,
        story: action.story,
        // Editing remains available while a request is in flight, but the
        // Save control must keep saying "Saving…" until that request settles.
        saveState: state.saveState === 'saving' ? 'saving' : 'idle',
        message: null,
        past: action.history === 'merge' || JSON.stringify(state.story) === JSON.stringify(action.story)
          ? state.past
          : [...state.past, structuredClone(state.story)],
        future: action.history === 'merge' ? state.future : [],
      };
    case 'canvas-edit': {
      if (JSON.stringify(state.story) === JSON.stringify(action.story)) return state;
      if (action.boundary) {
        const committed = editorDraftReducer(state, { type: 'inline-commit' });
        return editorDraftReducer(committed, { type: 'edit', story: action.story, history: 'record' });
      }
      const active = editorDraftReducer(state, { type: 'inline-start' });
      return editorDraftReducer({ ...active, future: [] }, { type: 'edit', story: action.story, history: 'merge' });
    }
    case 'canvas-history': {
      // Use the same chronology for the toolbar and native document shortcuts.
      // Commit changed text before undo so it has a redo entry; an empty focus
      // group must not consume an action or erase existing redo.
      const committed = editorDraftReducer(state, { type: 'inline-commit' });
      return editorDraftReducer(committed, { type: action.direction });
    }
    case 'inline-start':
      return state.inlineBase ? state : { ...state, inlineBase: structuredClone(state.story) };
    case 'inline-commit':
      if (!state.inlineBase) return state;
      if (JSON.stringify(state.inlineBase) === JSON.stringify(state.story)) return { ...state, inlineBase: null };
      return { ...state, past: [...state.past, state.inlineBase], future: [], inlineBase: null };
    case 'inline-cancel':
      return state.inlineBase
        ? { ...state, story: state.inlineBase, inlineBase: null, saveState: 'idle', message: null }
        : state;
    case 'undo': {
      if (state.inlineBase) {
        return { ...state, story: state.inlineBase, inlineBase: null, saveState: 'idle', message: 'Inline edit undone.' };
      }
      const previous = state.past.at(-1);
      if (!previous) return state;
      return {
        ...state,
        story: structuredClone(previous),
        past: state.past.slice(0, -1),
        future: [structuredClone(state.story), ...state.future],
        saveState: 'idle',
        message: 'Change undone.',
      };
    }
    case 'redo': {
      const next = state.future[0];
      if (!next) return state;
      return {
        ...state,
        story: structuredClone(next),
        past: [...state.past, structuredClone(state.story)],
        future: state.future.slice(1),
        saveState: 'idle',
        message: 'Change redone.',
      };
    }
    case 'save-start':
      return { ...state, saveState: 'saving', message: null };
    case 'save-success': {
      // The author can keep typing while the immutable version is appended.
      // Only replace the canvas when it still matches the submitted snapshot;
      // otherwise advance the saved baseline and leave newer input untouched.
      // Either way undo and redo survive the save, as in any doc editor: ⌘Z
      // after ⌘S steps back, and the story reads as unsaved again.
      const changedDuringSave = JSON.stringify(state.story) !== JSON.stringify(action.submittedStory);
      if (action.autosave) {
        // What was typed is the baseline, not the server's tidied copy: never
        // swap the story (or the canvas) under the caret, and never leave a
        // difference that would make the next autosave save the same thing.
        return {
          ...state,
          savedStory: structuredClone(action.submittedStory),
          saveState: changedDuringSave ? 'idle' : 'saved',
          message: null,
        };
      }
      if (changedDuringSave) {
        return {
          ...state,
          savedStory: structuredClone(action.story),
          saveState: 'idle',
          message: 'Saved. Changes made while saving aren’t saved yet.',
        };
      }
      return {
        ...state,
        story: structuredClone(action.story),
        savedStory: structuredClone(action.story),
        saveState: 'saved',
        message: 'Saved. Nothing was published.',
        inlineBase: null,
      };
    }
    case 'save-error':
      return { ...state, saveState: 'error', message: action.message };
    case 'load-version':
      return {
        ...state,
        story: structuredClone(action.story),
        saveState: 'idle',
        message: `Version ${action.version} loaded into the editor. Save to create a new draft.`,
        past: [...state.past, structuredClone(state.story)],
        future: [],
        inlineBase: null,
      };
    case 'reset':
      // A message here is a one-off status (e.g. after the address changed);
      // the next edit clears it like any other.
      return { ...createEditorDraftState(action.story), message: action.message ?? null };
  }
}

export function isStoryDirty(state: Pick<EditorDraftState, 'story' | 'savedStory'>): boolean {
  return JSON.stringify(state.story) !== JSON.stringify(state.savedStory);
}

export function reconcileStorySelection(story: Story, selectedId: string): string {
  if (!selectedId.startsWith('block:')) return selectedId;
  const [, chapterKey, blockId] = selectedId.split(':');
  const chapter = story.chapters.find((item) => item.key === chapterKey);
  if (!chapter) return 'story';
  return chapter.blocks.some((block, index) => (block.id ?? String(index)) === blockId)
    ? selectedId
    : `chapter:${chapter.key}`;
}

export function moveItem<T>(items: readonly T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) return [...items];
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function moveItemToIndex<T>(items: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= items.length || to < 0 || to >= items.length || from === to) return [...items];
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function moveChapterRelative(
  chapters: readonly StoryChapter[],
  sourceKey: StoryChapterKey,
  targetKey: StoryChapterKey,
  placement: 'before' | 'after',
): StoryChapter[] {
  if (sourceKey === targetKey) return [...chapters];
  const source = chapters.find((chapter) => chapter.key === sourceKey);
  if (!source || !chapters.some((chapter) => chapter.key === targetKey)) return [...chapters];
  const next = chapters.filter((chapter) => chapter.key !== sourceKey);
  const targetIndex = next.findIndex((chapter) => chapter.key === targetKey);
  next.splice(targetIndex + (placement === 'after' ? 1 : 0), 0, source);
  return next;
}

/**
 * A block one step up or down the page. Inside its section it trades places
 * with its neighbour; at the section's edge it crosses into the next section
 * (the bottom of the one above, the top of the one below — an empty one too),
 * so a block can travel the whole story a step at a time. Null at the very
 * first or last spot, where there is nowhere to go.
 */
export function moveStoryBlock(
  story: Story,
  chapterIndex: number,
  blockIndex: number,
  direction: -1 | 1,
): { story: Story; chapterIndex: number; blockIndex: number } | null {
  const chapter = story.chapters[chapterIndex];
  const block = chapter?.blocks[blockIndex];
  if (!block) return null;
  const withChapters = (change: (chapter: StoryChapter, index: number) => StoryChapter) => ({
    ...story,
    chapters: story.chapters.map(change),
  });

  const target = blockIndex + direction;
  if (target >= 0 && target < chapter.blocks.length) {
    return {
      story: withChapters((item, index) => (index === chapterIndex ? { ...item, blocks: moveItem(item.blocks, blockIndex, direction) } : item)),
      chapterIndex,
      blockIndex: target,
    };
  }

  const nextChapterIndex = chapterIndex + direction;
  const nextChapter = story.chapters[nextChapterIndex];
  if (!nextChapter) return null;
  const landing = direction === 1 ? 0 : nextChapter.blocks.length;
  return {
    story: withChapters((item, index) => {
      if (index === chapterIndex) return { ...item, blocks: item.blocks.filter((_, at) => at !== blockIndex) };
      if (index === nextChapterIndex) return { ...item, blocks: direction === 1 ? [block, ...item.blocks] : [...item.blocks, block] };
      return item;
    }),
    chapterIndex: nextChapterIndex,
    blockIndex: landing,
  };
}

/** Move one block to the end of a named section without changing its identity.
 * The stable block id keeps selection, undo, saved drafts and reader anchors
 * attached to the same authored component. */
export function moveStoryBlockToChapter(
  story: Story,
  sourceChapterIndex: number,
  blockIndex: number,
  targetChapterKey: StoryChapterKey,
): { story: Story; chapterIndex: number; blockIndex: number } | null {
  const source = story.chapters[sourceChapterIndex];
  const block = source?.blocks[blockIndex];
  const targetChapterIndex = story.chapters.findIndex((chapter) => chapter.key === targetChapterKey);
  if (!source || !block || targetChapterIndex < 0 || targetChapterIndex === sourceChapterIndex) return null;
  const landing = story.chapters[targetChapterIndex].blocks.length;
  return {
    story: {
      ...story,
      chapters: story.chapters.map((chapter, index) => {
        if (index === sourceChapterIndex) return { ...chapter, blocks: chapter.blocks.filter((_, at) => at !== blockIndex) };
        if (index === targetChapterIndex) return { ...chapter, blocks: [...chapter.blocks, block] };
        return chapter;
      }),
    },
    chapterIndex: targetChapterIndex,
    blockIndex: landing,
  };
}

export function createChapter(key: StoryChapterKey): StoryChapter {
  const label = STORY_CHAPTERS.find((chapter) => chapter.key === key)?.label ?? key;
  return {
    key,
    title: `${label}: add a clear narrative statement`,
    blocks: [createStoryBlock('prose')],
  };
}

export function createCustomChapter(title = 'New section'): StoryChapter {
  return {
    key: createEditorItemId('section'),
    title,
    blocks: [createStoryBlock('prose')],
  };
}

export function removeChapterWithConfirmation(
  story: Story,
  key: StoryChapterKey,
  confirm: (message: string) => boolean,
): Story {
  const chapter = story.chapters.find((item) => item.key === key);
  if (!chapter || story.chapters.length <= 1) return story;
  if (!confirm(`Remove the section “${chapter.title || 'Untitled section'}”?`)) return story;
  const count = chapter.blocks.length;
  if (!confirm(`Delete “${chapter.title || 'Untitled section'}” and its ${count} content ${count === 1 ? 'block' : 'blocks'}? This removes them from this draft; uploaded media files are not deleted. You can undo this change.`)) return story;
  return { ...story, chapters: story.chapters.filter((item) => item.key !== key) };
}

export function missingChapterKeys(chapters: readonly StoryChapter[]): StoryChapterKey[] {
  const present = new Set(chapters.map((chapter) => chapter.key));
  return STORY_CHAPTERS.map((chapter) => chapter.key).filter((key) => !present.has(key));
}

export function createStoryBlock(type: StoryBlock['type'], options: { component?: string; props?: Record<string, StoryJsonValue> } = {}): StoryBlock {
  const id = createEditorItemId('block');
  switch (type) {
    case 'prose': return { id, type, paragraphs: [''] };
    case 'subhead': return { id, type, text: '' };
    case 'media': return { id, type, media: { kind: 'image', alt: '' }, width: 'wide' };
    case 'decision': return { id, type, call: '', because: '', status: 'held', presentation: 'card' };
    // Headings a finding usually needs; each is the author's to rename.
    case 'insight': return {
      id, type, label: '', title: '',
      columns: [
        { id: createEditorItemId('column'), label: 'What we learned', body: { paragraphs: [''] } },
        { id: createEditorItemId('column'), label: 'Why it mattered', body: { paragraphs: [''] } },
        { id: createEditorItemId('column'), label: 'Friction', body: { paragraphs: [''] }, highlight: true },
      ],
    };
    case 'quote': return { id, type, quote: { quote: '', name: '', role: '' } };
    case 'callout': return { id, type, title: '', body: { paragraphs: [''] }, tone: 'neutral', presentation: 'soft' };
    case 'metrics': return { id, type, items: [{ value: '', description: '' }] };
    case 'outcomes': return { id, type, items: [{ id: createEditorItemId('outcome'), value: '', label: '', evidence: 'observed' }] };
    case 'ledger': return { id, type, ledger: { led: [], made: [], influenced: [], partners: [], notMe: [] } };
    case 'implemented': return { id, type, label: 'Implemented', items: [''] };
    case 'influenced': return { id, type, label: 'Influenced', items: [''] };
    case 'partners': return { id, type, label: 'Partners', items: [{ role: '', owned: '' }] };
    case 'contribution': return { id, type, variant: 'implemented', label: 'Implemented', items: [''] };
    case 'collaboration': return {
      id, type,
      map: { center: { label: '', detail: '' }, groups: [{ label: '', detail: '' }] },
    };
    case 'followUp': return {
      id, type, heading: 'More we can talk about', intro: '',
      items: [{ id: createEditorItemId('topic'), title: '', teaser: '', icon: 'layers' }],
    };
    case 'steps': return { id, type, items: [{ title: '', body: '' }] };
    case 'note': return { id, type, text: '' };
    case 'cta': return { id, type, label: '', href: '' };
    case 'divider': return { id, type };
    case 'spacer': return { id, type, size: 'medium' };
    // Two columns, a heading row and one row of cells; the menu adds more.
    case 'table': return { id, type, rows: [['', ''], ['', '']] };
    case 'code': return { id, type, code: '' };
    // A component from the host's block registry, named when it's inserted.
    case 'custom': return { id, type, component: options.component ?? '', props: structuredClone(options.props ?? {}) };
    // A new image group starts as two slots side by side.
    case 'gallery': return { id, type, layout: 'horizontal', items: [{ kind: 'image', alt: '' }, { kind: 'image', alt: '' }] };
  }
}

let editorItemSequence = 0;
export function createEditorItemId(prefix: string): string {
  editorItemSequence += 1;
  if (typeof globalThis.crypto?.randomUUID === 'function') return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now().toString(36)}-${editorItemSequence.toString(36)}`;
}

/** Adds stable editor identities without mutating or reseeding stored content.
 * The loaded draft remains authoritative, including intentional omissions. */
export function normalizeStoryForEditor(input: Story): Story {
  const story = structuredClone(input);
  story.facts = story.facts.map((fact, index) => ({ ...fact, id: fact.id ?? `fact-${story.slug}-${index + 1}` }));
  story.outcomes = story.outcomes?.map((outcome, index) => ({ ...outcome, id: outcome.id ?? `outcome-${story.slug}-${index + 1}` }));
  story.credits = story.credits?.map((credit, index) => ({ ...credit, id: credit.id ?? `credit-${story.slug}-${index + 1}` }));
  if (story.decisions) {
    story.decisions.items = story.decisions.items.map((item, index) => ({ ...item, id: item.id ?? `decision-${story.slug}-${index + 1}` }));
  }
  story.chapters = story.chapters.map((chapter) => {
    return {
      ...chapter,
      blocks: chapter.blocks.map((block, index) => {
        return { ...block, id: block.id ?? `block-${story.slug}-${chapter.key}-${index + 1}` } as StoryBlock;
      }),
    };
  });
  return story;
}

const normalizeStringList = (items: readonly string[] | undefined): string[] | undefined => {
  if (!items) return undefined;
  return items.map((item) => item.trim()).filter(Boolean);
};

/** Normalizes fields that intentionally keep raw whitespace while an inspector
 * control is focused. Saving uses this pure boundary so keyboard saves cannot
 * race a textarea's deferred blur cleanup. */
export function normalizeStoryForSave(input: Story): Story {
  const story = structuredClone(input);
  if (story.related) story.related = normalizeStringList(story.related) ?? [];
  if (story.hindsight) {
    story.hindsight.paragraphs = normalizeStringList(story.hindsight.paragraphs) ?? [];
  }
  story.chapters = story.chapters.map((chapter) => ({
    ...chapter,
    blocks: chapter.blocks.map((block) => {
      if (block.type === 'decision') {
        const mechanism = normalizeStringList(block.mechanism);
        return { ...block, mechanism: mechanism?.length ? mechanism : undefined };
      }
      if (block.type === 'insight') {
        const steps = normalizeStringList(block.steps);
        return { ...block, steps: steps?.length ? steps : undefined };
      }
      if (block.type === 'ledger') {
        return {
          ...block,
          ledger: {
            ...block.ledger,
            led: normalizeStringList(block.ledger.led),
            made: normalizeStringList(block.ledger.made),
            influenced: normalizeStringList(block.ledger.influenced),
            notMe: normalizeStringList(block.ledger.notMe),
          },
        };
      }
      if (block.type === 'implemented' || block.type === 'influenced') {
        return { ...block, items: normalizeStringList(block.items) ?? [] };
      }
      if (block.type === 'partners') {
        return { ...block, items: block.items.map((partner) => ({ role: partner.role.trim(), owned: partner.owned.trim() })).filter((partner) => partner.role || partner.owned) };
      }
      if (block.type === 'contribution') {
        const items = block.variant === 'partners'
          ? block.items.filter((item): item is { role: string; owned: string } => typeof item !== 'string').map((partner) => ({ role: partner.role.trim(), owned: partner.owned.trim() })).filter((partner) => partner.role || partner.owned)
          : normalizeStringList(block.items.filter((item): item is string => typeof item === 'string')) ?? [];
        return { ...block, items };
      }
      return block;
    }),
  }));
  return story;
}

export function swapStoryBlock(block: StoryBlock, target: StoryBlock['type']): StoryBlock | null {
  if (block.type === target) return block;
  const shared = { id: block.id, hidden: block.hidden };
  if (target === 'prose' && (block.type === 'subhead' || block.type === 'note')) {
    return { ...shared, type: 'prose', paragraphs: [block.text] };
  }
  if ((target === 'subhead' || target === 'note') && block.type === 'prose') {
    return { ...shared, type: target, text: block.paragraphs.join('\n\n') };
  }
  if ((block.type === 'subhead' || block.type === 'note') && (target === 'subhead' || target === 'note')) {
    return { ...shared, type: target, text: block.text };
  }
  // Text and a callout hold the same rich text; a callout's title and look
  // are the only extras, so only an untitled callout turns back.
  if (block.type === 'prose' && target === 'callout') {
    const body: StoryRichText = { paragraphs: block.paragraphs };
    for (const key of ['format', 'lede', 'large', 'headings', 'listItems'] as const) if (block[key] !== undefined) Object.assign(body, { [key]: block[key] });
    return { ...shared, type: 'callout', title: '', body, tone: 'neutral', presentation: 'soft' };
  }
  if (block.type === 'callout' && target === 'prose' && !block.title?.trim()) {
    return { ...shared, type: 'prose', ...block.body };
  }
  // One image and a group of one show the same footage; a group's caption
  // becomes the image's own when it has none.
  if (block.type === 'media' && target === 'gallery') {
    return { ...shared, type: 'gallery', layout: 'horizontal', items: [block.media] };
  }
  if (block.type === 'gallery' && target === 'media' && block.items.length === 1) {
    const [media] = block.items;
    return { ...shared, type: 'media', media: media.caption || !block.caption ? media : { ...media, caption: block.caption }, width: 'wide' };
  }
  if (block.type === 'metrics' && target === 'outcomes') {
    return {
      ...shared,
      type: 'outcomes',
      items: block.items.map((item, index) => ({
        id: createEditorItemId(`outcome-${index + 1}`),
        value: item.value,
        label: item.description,
        baseline: item.baseline,
        note: item.context,
      })),
      note: block.note,
    };
  }
  if (block.type === 'decision' && target === 'insight' && decisionFitsInsight(block)) {
    // The headings the decision showed become the columns' own; the
    // trade-off stays the one set apart.
    const editorial = block.presentation === 'editorial';
    const column = (label: string, text: string | undefined, highlight?: true): StoryInsightColumn => ({
      id: createEditorItemId('column'),
      label,
      body: richTextFromPlain(text),
      ...(highlight ? { highlight } : {}),
    });
    const columns = [
      block.context?.trim() ? column(block.contextLabel ?? (editorial ? 'Known inputs' : 'Context'), block.context) : null,
      column(block.rationaleLabel ?? (editorial ? 'Design rationale' : 'Because'), block.because),
      block.cost?.trim() ? column(block.tradeoffLabel ?? (editorial ? 'Page-owner trade-off' : 'Cost'), block.cost, true) : null,
    ].filter((entry): entry is StoryInsightColumn => entry !== null);
    const steps = block.mechanism?.filter((step) => step.trim());
    return {
      ...shared,
      type: 'insight',
      title: block.call,
      columns,
      ...(steps?.length ? { steps } : {}),
      ...(block.mine?.trim() ? { footer: { label: block.contributionLabel ?? 'My contribution', body: richTextFromPlain(block.mine) } } : {}),
    };
  }
  if (block.type === 'outcomes' && target === 'metrics') {
    return {
      ...shared,
      type: 'metrics',
      items: block.items.map((item) => ({ value: item.value, description: item.label, baseline: item.baseline, context: item.note })),
      note: block.note,
    };
  }
  return null;
}

/** An insight holds everything a decision shows except its alternatives,
 *  its "instead of" and its media, so only a decision without them turns into
 *  one without losing anything a reader sees. */
function decisionFitsInsight(block: Extract<StoryBlock, { type: 'decision' }>): boolean {
  return !block.options?.length && !block.over?.trim() && !block.media;
}

export function supportedBlockSwaps(block: StoryBlock): StoryBlock['type'][] {
  if (block.type === 'prose') return ['prose', 'subhead', 'note', 'callout'];
  if (block.type === 'callout') return block.title?.trim() ? ['callout'] : ['prose', 'callout'];
  if (block.type === 'media') return ['media', 'gallery'];
  if (block.type === 'gallery') return block.items.length === 1 ? ['media', 'gallery'] : ['gallery'];
  if (block.type === 'subhead' || block.type === 'note') return ['prose', 'subhead', 'note'];
  if (block.type === 'metrics') return ['metrics', 'outcomes'];
  if (block.type === 'decision') return decisionFitsInsight(block) ? ['decision', 'insight'] : ['decision'];
  if (block.type === 'outcomes') {
    const canBecomeMetrics = block.items.every((item) => !item.id && !item.evidence && !item.timeframe && !item.hidden);
    return canBecomeMetrics ? ['metrics', 'outcomes'] : ['outcomes'];
  }
  return [block.type];
}
