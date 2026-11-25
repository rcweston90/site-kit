import type { ComponentType } from 'react';
import type { StoryBlock, StoryFieldPath, StoryDraftPath, StoryMedia, StoryRichText, StoryJsonValue } from '@rcweston/story-core';

export type StoryProseBlock = Extract<StoryBlock, { type: 'prose' }>;
export type SpacerSize = NonNullable<Extract<StoryBlock, { type: 'spacer' }>['size']>;

/** The two halves of a prose block split at the caret (either null when empty). */
export interface StoryProseSplit<T extends StoryRichText> { before: T | null; after: T | null }

/** What the reader hands an inline text field when it renders one for editing. */
export interface InlineTextProps {
  value: string;
  path: StoryFieldPath;
  editor: StoryRenderEditor;
  selectionId: string;
  label: string;
  placeholder?: string;
  multiline?: boolean;
}

export interface InlineAddProps {
  label: string;
  /** aria-label of the field to focus once the new item has rendered. */
  focusLabel: string;
  editor: StoryRenderEditor;
  selectionId: string;
  onAdd: () => void;
  className?: string;
}

export interface ProseEditorProps<T extends StoryRichText = StoryRichText> {
  value: T;
  onChange: (next: T) => void;
  selectionId: string;
  editor: StoryRenderEditor;
  label?: string;
  placeholder?: string;
  onInsertBlock?: (type: StoryBlock['type'], split: StoryProseSplit<T>) => void;
  onInsertFiles?: (files: File[], split: StoryProseSplit<T>) => void;
}

export interface CtaEditorProps {
  value: { label: string; href: string; newTab?: boolean };
  onSave: (value: { label: string; href: string; newTab?: boolean }) => void;
}

export interface SpacerControlProps {
  size: SpacerSize;
  onChange: (size: SpacerSize) => void;
}

export interface MediaEmptySlotProps {
  media: StoryMedia;
  aspect: number;
  editor: StoryRenderEditor;
  path: StoryFieldPath;
  selectionId: string;
}

/**
 * The editing pieces the reader renders in place when it's given an editor.
 * The reader itself has no rich-text engine or menus: `@rcweston/story-editor`
 * supplies these (a ProseMirror field, a contenteditable line, a CTA dialog),
 * so the reader stays small for readers.
 */
export interface StoryEditingSlots {
  InlineText: ComponentType<InlineTextProps>;
  InlineAdd: ComponentType<InlineAddProps>;
  // Generic components can't be typed as ComponentType<ProseEditorProps<T>> for every T.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Prose: ComponentType<ProseEditorProps<any>>;
  Cta?: ComponentType<CtaEditorProps>;
  SpacerControl?: ComponentType<SpacerControlProps>;
  MediaEmptySlot?: ComponentType<MediaEmptySlotProps>;
}

export interface StoryRenderEditor {
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Writes one field. Text, or a measured number such as a media aspect. */
  onTextInput: (path: StoryFieldPath, value: string | number) => void;
  onTextDraftChange: (path: StoryFieldPath, value: string, changed: boolean, resolvePath?: StoryDraftPath) => void;
  onTextEditStart: () => void;
  onTextEditEnd: () => void;
  /** Escape: the text edit ends and is kept, as on blur (⌘Z takes it back in
   *  one step), and focus moves to the block's controls. */
  onTextEditLeave: () => void;
  onBlockInput: (chapterIndex: number, blockIndex: number, block: StoryBlock) => void;
  /** The slash menu in a prose block chose a block: it goes at the caret,
   *  the prose split around it (either half null when nothing is left). */
  onInsertBlock?: (chapterIndex: number, blockIndex: number, type: StoryBlock['type'], split: StoryProseSplit<StoryProseBlock>) => void;
  /** Images pasted or dropped into a prose block: an image block (a group for
   *  several) at the caret, the prose split around it, each file uploading. */
  onInsertFiles?: (chapterIndex: number, blockIndex: number, files: File[], split: StoryProseSplit<StoryProseBlock>) => void;
  onChapterDrop: (sourceKey: string, targetKey: string, placement: 'before' | 'after') => void;
  /** The editing components the reader renders in place. */
  ui: StoryEditingSlots;
}

export function isStoryVisible(value: boolean | undefined): boolean {
  return value !== false;
}

// ─── Custom blocks ───────────────────────────────────────────────────────────

export interface BlockRenderProps<P = Record<string, StoryJsonValue>> {
  props: P;
  title?: string;
  caption?: string;
  /** True inside the editor. A block can show extra affordances there. */
  editing: boolean;
}

export interface BlockInspectorProps<P = Record<string, StoryJsonValue>> {
  props: P;
  onChange: (props: P) => void;
}

/** One component the host offers as a `custom` block. */
export interface BlockDefinition<P = Record<string, StoryJsonValue>> {
  /** What the editor calls it in menus and placeholders. */
  label: string;
  Render: ComponentType<BlockRenderProps<P>>;
  /** Props a new block starts with. */
  defaultProps?: P;
  /** Settings shown in the editor's inspector for this block. */
  Inspector?: ComponentType<BlockInspectorProps<P>>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type BlockRegistry = Record<string, BlockDefinition<any>>;
