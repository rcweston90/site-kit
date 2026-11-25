import { useCallback, useEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useEditorState, type ChainedCommands, type Editor } from '@tiptap/react';
import { BubbleMenu, type BubbleMenuProps } from '@tiptap/react/menus';
import { DropdownMenu, Popover } from 'radix-ui';
import {
  Bold, Check, ChevronDown, Code, ExternalLink, Heading2, Heading3, Heading4, Heading5, Heading6, Highlighter, Italic, Link2, List, ListIndentDecrease, ListIndentIncrease, ListOrdered, MoreHorizontal, MoveVertical, Pencil, Pilcrow,
  RemoveFormatting, Strikethrough, Trash2, Type, Underline, Unlink, type LucideIcon,
} from 'lucide-react';
import { menuContentClass, menuItemClass, menuLabelClass, menuSurfaceClass } from './menu.js';
import type { HighlightColor } from '@rcweston/story-core';
import { canChangeListIndent, changeListIndent, listToggleState, selectedListKind, setStoryLarge, setStoryTextStyle, storyLargeActive, toggleStoryList, type StoryTextStyle } from './story-prose-schema.js';
import { safeStoryHref } from '@rcweston/story-core';
import { proseEditorStyles as styles, chromeStyles } from './classes.js';
import { mobileToolbarFrame } from '@rcweston/story-react';

/*
 * Interaction and composition adapted from Tiptap UI Components' MIT-licensed
 * Toolbar, Button, LinkPopover, MarkButton, ListButton, and UndoRedoButton.
 * Copyright (c) 2025 Tiptap. https://github.com/ueberdosis/tiptap-ui-components
 */

export type SelectionToolbarOptions = NonNullable<BubbleMenuProps['options']>;

type ToolKey = 'image' | 'more' | 'done' | 'style' | 'spacing' | 'bold' | 'italic' | 'bullets' | 'numbered' | 'underline' | 'strike' | 'code' | 'highlight' | 'link' | 'clear';
/** The buttons on screen, in order: one style menu, then marks. */
const ORDER: ToolKey[] = ['style', 'spacing', 'bold', 'italic', 'bullets', 'numbered', 'underline', 'strike', 'code', 'highlight', 'link', 'clear'];

/** Portalled surfaces (the style menu, the link popover) are part of the
 *  edit: focus moving into them neither ends nor resets it. */
export const PROSE_SURFACE = 'data-story-prose-surface';

/** The shared text-style symbol set. The compact toolbar shows only the
 *  current symbol; the dropdown and slash menu pair it with the full name. */
export interface AuthoringTextStyle { value: string; label: string; icon: LucideIcon; keys: string }

export const TEXT_STYLES: AuthoringTextStyle[] = [
  { value: 'text', label: 'Normal text', icon: Pilcrow, keys: '⌘⌥0' },
  { value: 'large', label: 'Large text', icon: Type, keys: '⌘⌥1' },
  { value: 'heading2', label: 'Heading 2', icon: Heading2, keys: '⌘⌥2' },
  { value: 'heading3', label: 'Heading 3', icon: Heading3, keys: '⌘⌥3' },
  { value: 'heading4', label: 'Heading 4', icon: Heading4, keys: '⌘⌥4' },
  { value: 'heading5', label: 'Heading 5', icon: Heading5, keys: '⌘⌥5' },
  { value: 'heading6', label: 'Heading 6', icon: Heading6, keys: '⌘⌥6' },
  { value: 'bullets', label: 'Bulleted list', icon: List, keys: '⌘⇧8' },
  { value: 'numbered', label: 'Numbered list', icon: ListOrdered, keys: '⌘⇧7' },
];

export const isTextStyleOption = (entry: AuthoringTextStyle) => entry.value !== 'bullets' && entry.value !== 'numbered';

export function ListToggleButton({ editor, kind, state, tabIndex, className = styles.toolbarButton }: {
  editor: Editor; kind: 'bulletList' | 'orderedList'; state: ReturnType<typeof listToggleState>; tabIndex?: number; className?: string;
}) {
  const Icon = kind === 'bulletList' ? List : ListOrdered;
  const label = kind === 'bulletList' ? 'Bulleted list' : 'Numbered list';
  const key = kind === 'bulletList' ? 8 : 7;
  return <button type="button" data-story-editor-action className={className} tabIndex={tabIndex}
    aria-pressed={state.kind === kind} aria-disabled={!state.enabled} aria-label={label}
    aria-keyshortcuts={`Meta+Shift+${key} Control+Shift+${key}`} title={state.enabled ? label : 'Lists are available for Text and Large text'}
    onPointerDown={event => event.preventDefault()} onClick={() => toggleStoryList(editor, kind)}>
    <Icon aria-hidden="true" />
  </button>;
}

/** The highlight menu's choices, in order. The default (⌘⇧H, `==`) is
 *  orange and saves as plain ==text==; the others name their colour. */
export const HIGHLIGHTS: { value: 'none' | 'default' | HighlightColor; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'default', label: 'Orange' },
  { value: 'yellow', label: 'Yellow' },
  { value: 'red', label: 'Red' },
  { value: 'green', label: 'Green' },
  { value: 'teal', label: 'Teal' },
  { value: 'blue', label: 'Blue' },
  { value: 'purple', label: 'Purple' },
  { value: 'grey', label: 'Grey' },
];

const applyStoryStyle = (editor: Editor, style: string) => { setStoryTextStyle(editor, style as StoryTextStyle); };

export interface SelectionToolbarState {
  style: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  code: boolean;
  highlight: boolean;
  /** The highlight's colour, when it isn't the default. */
  highlightColor?: HighlightColor | null;
  link: boolean;
}

function ToolbarSeparator() {
  return <span aria-hidden="true" className={styles.toolbarSeparator} />;
}

function ToolbarButton({ label, shortLabel, title = label, shortcuts, active, tabIndex, onClick, children }: {
  label: string;
  /** Compact visible caption; the full label remains the accessible name. */
  shortLabel?: string;
  /** Tooltip, when it says more than the label (its shortcuts). */
  title?: string;
  /** `aria-keyshortcuts`, for shortcuts the label doesn't spell out. */
  shortcuts?: string;
  active?: boolean;
  tabIndex: number;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return <button
    type="button"
    data-story-editor-action
    className={styles.toolbarButton}
    aria-label={label}
    title={title}
    aria-keyshortcuts={shortcuts}
    aria-pressed={active}
    tabIndex={tabIndex}
    onPointerDown={(event) => event.preventDefault()}
    onClick={onClick}
  >{children}<span className={styles.toolbarLabel}>{shortLabel ?? label.split(' (')[0]}</span></button>;
}

/**
 * For a button that opens a portalled surface (the style menu, the link
 * popover). Tiptap hides the bubble when the text loses focus to anything
 * outside it, which would detach the very button the surface is anchored to
 * and drop it in the page's corner. Focus goes to the button first, which is
 * inside the bubble, so the bubble stays; the editor keeps its selection.
 */
function keepBubble(event: React.PointerEvent<HTMLButtonElement>) {
  if (event.button === 0) event.currentTarget.focus({ preventScroll: true });
}

export function LinkPopover({ editor, active, tabIndex, request, validateHref = safeStoryHref, compact = false }: { editor: Editor; active: boolean; tabIndex?: number; request: number; validateHref?: (url: string) => string | null | undefined; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [newTab, setNewTab] = useState(false);
  const [anchorToSelection, setAnchorToSelection] = useState(false);
  const [error, setError] = useState('');
  const dismissedOutside = useRef(false);
  // A keyboard request can beat the selection bubble's first positioning.
  // Anchor to the text in that case instead of a hidden trigger at (0, 0).
  const selectionAnchor = useRef({
    getBoundingClientRect: () => {
      const { top, right, bottom, left } = editor.view.coordsAtPos(editor.state.selection.head, -1);
      return new DOMRect(left, top, right - left, bottom - top);
    },
  });

  const openPopover = (fromKeyboard = false) => {
    setAnchorToSelection(fromKeyboard && !compact);
    const link = editor.getAttributes('link');
    setUrl(String(link.href ?? ''));
    setNewTab(link.target === '_blank');
    setError('');
    dismissedOutside.current = false;
    setOpen(true);
  };
  // ⌘K in the text asks for the popover; the request count changing is the ask.
  const handled = useRef(request);
  useEffect(() => {
    if (request === handled.current) return;
    handled.current = request;
    openPopover(true);
  });

  const applyLink = () => {
    if (url.trim() === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      setOpen(false);
      return;
    }
    const href = validateHref(url);
    if (!href) {
      setError(validateHref === safeStoryHref ? 'Use https://, http://, mailto:, /path, or #anchor.' : 'Use a web address, mailto:, tel:, /path, ./path, ../path, ?query, or #anchor.');
      return;
    }
    const attrs = { href, target: newTab ? '_blank' : null };
    // With nothing selected the address itself becomes the linked words.
    if (editor.state.selection.empty && !active) editor.chain().focus().insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs }] }).run();
    else editor.chain().focus().extendMarkRange('link').setLink(attrs).run();
    setOpen(false);
  };

  const removeLink = () => {
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
    setOpen(false);
  };

  const content = <Popover.Content
    {...{ [PROSE_SURFACE]: '' }}
    className={styles.linkPopover}
    side={compact ? 'top' : 'bottom'}
    sideOffset={8}
    collisionPadding={12}
    align="start"
    data-story-editor-action
    onKeyDown={compact ? (event) => event.stopPropagation() : undefined}
    onInteractOutside={() => { dismissedOutside.current = true; }}
    // Closing hands focus back to the text (with the selection intact),
    // not to the link button, unless the person clicked or tabbed elsewhere.
    onCloseAutoFocus={(event) => {
      event.preventDefault();
      if (!dismissedOutside.current) editor.commands.focus();
    }}
  >
    <label className={styles.linkLabel}>
      Link URL
      <input
        className={styles.linkInput}
        type="url"
        value={url}
        placeholder="https://example.com"
        autoComplete="off"
        onChange={(event) => { setUrl(event.target.value); setError(''); }}
        onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); applyLink(); } }}
      />
    </label>
    <label className={styles.linkTarget}>
      <input type="checkbox" checked={newTab} onChange={(event) => setNewTab(event.target.checked)} />
      Open in new tab
    </label>
    {error ? <p className={styles.linkError} role="alert">{error}</p> : null}
    <div className={styles.linkActions}>
      <button type="button" className={styles.linkAction} onClick={applyLink}>Apply</button>
      <button type="button" className={styles.linkRemove} onClick={removeLink} disabled={!active}><Trash2 aria-hidden="true" /> Remove</button>
    </div>
  </Popover.Content>;
  return <Popover.Root open={open} onOpenChange={(next) => { if (next) openPopover(); else setOpen(false); }}>
    {anchorToSelection && <Popover.Anchor virtualRef={selectionAnchor} />}
    <Popover.Trigger asChild>
      <button
        type="button"
        data-story-editor-action
        className={styles.toolbarButton}
        aria-label="Add or edit link"
        title="Link (⌘K)"
        aria-keyshortcuts="Meta+K Control+K"
        aria-pressed={active}
        tabIndex={tabIndex}
        onPointerDown={keepBubble}
      ><Link2 aria-hidden="true" />{!compact && <span className={styles.toolbarLabel}>Link</span>}</button>
    </Popover.Trigger>
    {compact ? content : <Popover.Portal>{content}</Popover.Portal>}
  </Popover.Root>;
}

/** The paragraph style, as a menu: what the selection is now, and the six it
 *  can be. Replaces a row of style buttons that came and went with lists. */
function ListFormattingItems({ editor, showScale = true }: { editor: Editor; showScale?: boolean }) {
  if (!selectedListKind(editor.state)) return null;
  return <>
    <DropdownMenu.Label className={menuLabelClass}>List formatting</DropdownMenu.Label>
    {showScale && <DropdownMenu.CheckboxItem className={menuItemClass} checked={storyLargeActive(editor.state)}
      onCheckedChange={checked => setStoryLarge(editor, checked === true)}>
      <Type aria-hidden="true" className={chromeStyles.tiptapAuthoringToolbarIcon} />
      <span className={chromeStyles.tiptapAuthoringToolbarPart}>Large text</span>
      <DropdownMenu.ItemIndicator><Check aria-hidden="true" className={chromeStyles.tiptapAuthoringToolbarIcon2} /></DropdownMenu.ItemIndicator>
    </DropdownMenu.CheckboxItem>}
    {([1, -1] as const).map(direction => {
      const Icon = direction === 1 ? ListIndentIncrease : ListIndentDecrease;
      const label = direction === 1 ? 'Indent list item' : 'Outdent list item';
      return <DropdownMenu.Item key={direction} className={menuItemClass}
        aria-label={label} aria-keyshortcuts={direction === 1 ? 'Tab' : 'Shift+Tab'}
        disabled={!canChangeListIndent(editor, direction)} onSelect={() => changeListIndent(editor, direction)}>
        <Icon aria-hidden="true" className={chromeStyles.tiptapAuthoringToolbarIcon} />
        <span className={chromeStyles.tiptapAuthoringToolbarPart}>{label}</span>
        <kbd aria-hidden="true" className={chromeStyles.tiptapAuthoringToolbarKeys}>{direction === 1 ? 'Tab' : '⇧Tab'}</kbd>
      </DropdownMenu.Item>;
    })}
  </>;
}

function StyleMenu({ editor, style, tabIndex, textStyles, onTextStyle }: { editor: Editor; style: string; tabIndex: number; textStyles: AuthoringTextStyle[]; onTextStyle: (editor: Editor, style: string) => void }) {
  const options = textStyles.filter(isTextStyleOption);
  const current = options.find(entry => entry.value === style) ?? options[0];
  const Symbol = current.icon;
  return <DropdownMenu.Root modal={false}>
    <DropdownMenu.Trigger asChild>
      <button
        type="button"
        data-story-editor-action
        className={`${styles.toolbarButton} ${styles.styleButton}`}
        aria-label={`Text style: ${current.label}`}
        title={current.label}
        tabIndex={tabIndex}
        onPointerDown={keepBubble}
      >
        <Symbol aria-hidden="true" />
        <span className={styles.styleLabel}>{current.label}</span>
        <ChevronDown aria-hidden="true" className={styles.styleChevron} />
      </button>
    </DropdownMenu.Trigger>
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        {...{ [PROSE_SURFACE]: '' }}
        data-story-editor-action
        className={menuContentClass}
        align="start"
        sideOffset={6}
        collisionPadding={12}
        onCloseAutoFocus={(event) => { event.preventDefault(); editor.commands.focus(undefined, { scrollIntoView: false }); }}
      >
        <DropdownMenu.Label className={menuLabelClass}>Turn into</DropdownMenu.Label>
        <DropdownMenu.RadioGroup value={current.value} onValueChange={(next) => onTextStyle(editor, next)}>
          {options.map((entry) => (
            <DropdownMenu.RadioItem key={entry.value} value={entry.value} aria-label={entry.label} className={menuItemClass}>
              <entry.icon aria-hidden="true" className={chromeStyles.tiptapAuthoringToolbarIcon} />
              <span className={chromeStyles.tiptapAuthoringToolbarPart}>{entry.label}</span>
              <kbd className={chromeStyles.tiptapAuthoringToolbarKeys}>{entry.keys}</kbd>
              <span className={chromeStyles.tiptapAuthoringToolbarStack}><DropdownMenu.ItemIndicator><Check aria-hidden="true" className={chromeStyles.tiptapAuthoringToolbarIcon2} /></DropdownMenu.ItemIndicator></span>
            </DropdownMenu.RadioItem>
          ))}
        </DropdownMenu.RadioGroup>
        <ListFormattingItems editor={editor} showScale={false} />
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  </DropdownMenu.Root>;
}

export type ParagraphSpacing = 'default' | 'tight' | 'roomy';

const SPACING_OPTIONS = [
  ['default', 'Default spacing'], ['tight', 'Tight spacing'], ['roomy', 'Roomy spacing'],
] as const;

function ParagraphSpacingMenu({ editor, value, onChange, tabIndex, compact }: {
  editor: Editor; value: ParagraphSpacing; onChange: (value: ParagraphSpacing) => void; tabIndex: number; compact: boolean;
}) {
  return <DropdownMenu.Root modal={false}>
    <DropdownMenu.Trigger asChild>
      <button type="button" data-story-editor-action className={styles.toolbarButton} aria-label="Paragraph spacing"
        title="Paragraph spacing" data-active={value !== 'default' || undefined} tabIndex={tabIndex} onPointerDown={keepBubble}>
        <MoveVertical aria-hidden="true" /><span className={styles.toolbarLabel}>Spacing</span>
      </button>
    </DropdownMenu.Trigger>
    <DropdownMenu.Portal>
      <DropdownMenu.Content {...{ [PROSE_SURFACE]: '' }} data-story-editor-action className={menuContentClass}
        side={compact ? 'top' : 'bottom'} align="start" sideOffset={6} collisionPadding={12}
        onCloseAutoFocus={event => { event.preventDefault(); editor.commands.focus(undefined, { scrollIntoView: false }); }}>
        <DropdownMenu.Label className={menuLabelClass}>Paragraph spacing</DropdownMenu.Label>
        <DropdownMenu.RadioGroup value={value} onValueChange={next => {
          const option = SPACING_OPTIONS.find(([id]) => id === next);
          if (option) onChange(option[0]);
        }}>
          {SPACING_OPTIONS.map(([id, label]) => <DropdownMenu.RadioItem key={id} value={id} aria-label={label} className={menuItemClass}>
            <span className={chromeStyles.tiptapAuthoringToolbarPart}>{label}</span>
            <DropdownMenu.ItemIndicator><Check aria-hidden="true" className={chromeStyles.tiptapAuthoringToolbarIcon2} /></DropdownMenu.ItemIndicator>
          </DropdownMenu.RadioItem>)}
        </DropdownMenu.RadioGroup>
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  </DropdownMenu.Root>;
}

/** Highlight, as a menu of colours with a swatch for each, like a doc
 *  editor's; the button's name says the selection's colour. */
export function HighlightMenu({ editor, active, color, tabIndex, compact = false }: { editor: Editor; active: boolean; color: HighlightColor | null; tabIndex?: number; compact?: boolean }) {
  const value = active ? color ?? 'default' : 'none';
  const current = HIGHLIGHTS.find((entry) => entry.value === value) ?? HIGHLIGHTS[0];
  const pick = (next: string) => {
    if (next === 'none') editor.chain().focus().unsetMark('highlight').run();
    else editor.chain().focus().setMark('highlight', { color: next === 'default' ? null : next }).run();
  };
  const menu = (
    <DropdownMenu.Content
      {...{ [PROSE_SURFACE]: '' }}
      data-story-editor-action
      className={menuSurfaceClass}
      align="start"
      side={compact ? 'top' : 'bottom'}
      onKeyDown={compact ? (event) => event.stopPropagation() : undefined}
      sideOffset={6}
      collisionPadding={12}
      onCloseAutoFocus={(event) => { event.preventDefault(); editor.commands.focus(); }}
    >
      <DropdownMenu.Label className={menuLabelClass}>Highlight</DropdownMenu.Label>
      <DropdownMenu.RadioGroup value={value} onValueChange={pick}>
        {HIGHLIGHTS.map((entry) => (
          <DropdownMenu.RadioItem key={entry.value} value={entry.value} className={menuItemClass}>
            <span aria-hidden="true" className={styles.highlightSwatch} data-color={entry.value}>A</span>
            <span className={chromeStyles.tiptapAuthoringToolbarPart}>{entry.label}</span>
            {entry.value === 'default' ? <kbd className={chromeStyles.tiptapAuthoringToolbarKeys}>⌘⇧H</kbd> : null}
            <span className={chromeStyles.tiptapAuthoringToolbarStack}><DropdownMenu.ItemIndicator><Check aria-hidden="true" className={chromeStyles.tiptapAuthoringToolbarIcon2} /></DropdownMenu.ItemIndicator></span>
          </DropdownMenu.RadioItem>
        ))}
      </DropdownMenu.RadioGroup>
    </DropdownMenu.Content>
  );
  return <DropdownMenu.Root modal={false}>
    <DropdownMenu.Trigger asChild>
      <button
        type="button"
        data-story-editor-action
        className={styles.toolbarButton}
        aria-label={active ? `Highlight: ${current.label}` : 'Highlight'}
        title="Highlight"
        data-active={active || undefined}
        tabIndex={tabIndex}
        onPointerDown={keepBubble}
      >
        <Highlighter aria-hidden="true" />
        {!compact && <span className={styles.toolbarLabel}>Highlight</span>}
      </button>
    </DropdownMenu.Trigger>
    <DropdownMenu.Portal>{menu}</DropdownMenu.Portal>
  </DropdownMenu.Root>;
}

/** Less common inline marks grouped behind a compact selection-toolbar action. */
export function MoreInlineFormats({ editor }: { editor: Editor }) {
  const marks = [
    { key: 'underline', label: 'Underline', shortcut: '⌘U', Icon: Underline },
    { key: 'strike', label: 'Strikethrough', shortcut: '⌘⇧S', Icon: Strikethrough },
    { key: 'code', label: 'Inline code', shortcut: '⌘E', Icon: Code },
  ] as const;
  return <DropdownMenu.Root modal={false}>
    <DropdownMenu.Trigger asChild>
      <button type="button" className={styles.toolbarButton} data-story-editor-action aria-label="More formatting" title="More formatting" onPointerDown={keepBubble}>
        <MoreHorizontal aria-hidden="true" />
      </button>
    </DropdownMenu.Trigger>
    <DropdownMenu.Content
      {...{ [PROSE_SURFACE]: '' }}
      data-story-editor-action
      className={menuSurfaceClass}
      side="top"
      align="end"
      sideOffset={6}
      collisionPadding={12}
      onKeyDown={(event) => event.stopPropagation()}
      onCloseAutoFocus={(event) => { event.preventDefault(); editor.commands.focus(undefined, { scrollIntoView: false }); }}
    >
      <DropdownMenu.Label className={menuLabelClass}>More formatting</DropdownMenu.Label>
      {marks.map(({ key, label, shortcut, Icon }) => <DropdownMenu.CheckboxItem
        key={key}
        checked={editor.isActive(key)}
        className={menuItemClass}
        onSelect={() => editor.chain().focus().toggleMark(key).run()}
      >
        <Icon aria-hidden="true" className={chromeStyles.tiptapAuthoringToolbarIcon} />
        <span className={chromeStyles.tiptapAuthoringToolbarPart}>{label}</span>
        <kbd aria-hidden="true" className={chromeStyles.tiptapAuthoringToolbarKeys}>{shortcut}</kbd>
        <span className={chromeStyles.tiptapAuthoringToolbarStack}><DropdownMenu.ItemIndicator><Check aria-hidden="true" className={chromeStyles.tiptapAuthoringToolbarIcon2} /></DropdownMenu.ItemIndicator></span>
      </DropdownMenu.CheckboxItem>)}
      <DropdownMenu.Item className={menuItemClass} onSelect={() => editor.chain().focus().unsetAllMarks().run()}>
        <RemoveFormatting aria-hidden="true" className={chromeStyles.tiptapAuthoringToolbarIcon} />
        <span className={chromeStyles.tiptapAuthoringToolbarPart}>Clear formatting</span>
      </DropdownMenu.Item>
      <ListFormattingItems editor={editor} />
    </DropdownMenu.Content>
  </DropdownMenu.Root>;
}

/**
 * Formatting for a prose block, shown only while text is selected: a floating
 * pill anchored to the selection (Tiptap BubbleMenu). It is a WAI-ARIA toolbar
 * with one Tab stop: Tab (outside a list) or Alt+F10 from the text moves into
 * it, arrow keys / Home / End move between buttons, Escape returns to the text.
 */
export function TiptapSelectionToolbar({ editor, open, mobile, options, menuRef, linkRequest, onBlur, state, textStyles = TEXT_STYLES, onTextStyle = applyStoryStyle, validateHref = safeStoryHref, onMobileDone, onMobileInsertImage, allowLinks = true, paragraphSpacing }: {
  editor: Editor;
  /** False hides the pill even if Tiptap still holds it open (it can linger after a toolbar click). */
  open: boolean;
  /** Phones keep formatting reachable above the software keyboard while the editor has focus. */
  mobile: boolean;
  options: SelectionToolbarOptions;
  /** Opt into a compact mobile toolbar with a Done action and expandable extra marks. */
  onMobileDone?: () => void;
  /** Optional image insertion without scrolling back to the top of a long article. */
  onMobileInsertImage?: () => void;
  allowLinks?: boolean;
  paragraphSpacing?: { value: ParagraphSpacing; onChange: (value: ParagraphSpacing) => void };
  /** Receives Tiptap's positioned wrapper around the pill. */
  menuRef: RefObject<HTMLDivElement | null>;
  /** Bumped by ⌘K in the text: open the link popover. */
  linkRequest: number;
  onBlur: (event: FocusEvent<HTMLDivElement>) => void;
  state: SelectionToolbarState;
  /** Another HTML author can reuse these controls with its own document schema. */
  textStyles?: AuthoringTextStyle[];
  onTextStyle?: (editor: Editor, style: string) => void;
  /** Link URL policy for this author; defaults to the story link policy. */
  validateHref?: (url: string) => string | null | undefined;
}) {
  const [focusKey, setFocusKey] = useState<ToolKey>('style');
  const [expanded, setExpanded] = useState(false);
  const compact = mobile && Boolean(onMobileDone);
  const lists = useEditorState({ editor, selector: ({ editor }) => ({ ...listToggleState(editor.state), large: storyLargeActive(editor.state) }) });
  const displayStyle = state.style === 'bullets' || state.style === 'numbered' ? (lists.large ? 'large' : 'text') : state.style;
  const toolbarOrder: ToolKey[] = compact ? ['style', 'spacing', 'bold', 'italic', 'bullets', 'numbered', 'link', 'more', 'done', ...(expanded ? ['underline', 'strike', 'code', 'highlight', 'clear', ...(onMobileInsertImage ? ['image'] : [])] as ToolKey[] : [])] : ORDER;
  const visibleOrder = toolbarOrder.filter(key => (allowLinks || key !== 'link') && (paragraphSpacing || key !== 'spacing'));
  const [keyboardInset, setKeyboardInset] = useState(0);
  const visibleFocusKey = visibleOrder.includes(focusKey) ? focusKey : 'style';
  const stop = (key: ToolKey) => (key === visibleFocusKey ? 0 : -1);
  const finishMobileFormatting = () => {
    setExpanded(false);
    onMobileDone?.();
  };

  // BubbleMenu makes its positioned wrapper a tab stop (so a click on it keeps
  // the menu open); the roving button is the only stop the toolbar needs.
  useEffect(() => { if (menuRef.current) menuRef.current.tabIndex = -1; }, [menuRef]);
  useEffect(() => {
    if (!mobile || !open) return;
    const viewport = window.visualViewport;
    const measure = () => {
      const selection = editor.state.selection;
      const position = editor.view.coordsAtPos(selection.head);
      const frame = mobileToolbarFrame(
        window.innerHeight,
        viewport?.height ?? window.innerHeight,
        viewport?.offsetTop ?? 0,
        menuRef.current?.getBoundingClientRect().height ?? 54,
        position.top,
        position.bottom,
      );
      setKeyboardInset(frame.keyboardInset);
      if (frame.scrollBy) window.scrollBy({ top: frame.scrollBy, behavior: 'auto' });
    };
    let frame = 0;
    const update = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => { frame = 0; measure(); });
    };
    update();
    const toolbarSize = new ResizeObserver(update);
    if (menuRef.current) toolbarSize.observe(menuRef.current);
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    editor.on('selectionUpdate', update);
    editor.on('update', update);
    return () => {
      window.cancelAnimationFrame(frame);
      toolbarSize.disconnect();
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
      editor.off('selectionUpdate', update);
      editor.off('update', update);
    };
  }, [editor, menuRef, mobile, open]);

  // A keyboard user formatting from the toolbar keeps focus there (so Bold then
  // Italic is two key presses); a pointer click never moved focus off the text.
  const chain = (): ChainedCommands => editor.chain();

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // The link popover is a React child but not a DOM child; its keys are its own.
    if (!(event.target instanceof HTMLButtonElement) || !event.currentTarget.contains(event.target)) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      editor.commands.focus();
      return;
    }
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')];
    const current = buttons.indexOf(event.target);
    const next = event.key === 'ArrowRight' ? (current + 1) % buttons.length
      : event.key === 'ArrowLeft' ? (current - 1 + buttons.length) % buttons.length
        : event.key === 'Home' ? 0
          : event.key === 'End' ? buttons.length - 1
            : null;
    if (next === null) return;
    event.preventDefault();
    // The buttons on screen are ORDER, in order.
    setFocusKey(visibleOrder[next] ?? 'style');
    buttons[next]?.focus();
  };

  const mark = (name: 'bold' | 'italic' | 'underline' | 'strike' | 'code') => () => chain().toggleMark(name).run();
  const buttons = {
    style: <StyleMenu editor={editor} style={displayStyle} tabIndex={stop('style')} textStyles={textStyles} onTextStyle={onTextStyle} />,
    spacing: paragraphSpacing ? <ParagraphSpacingMenu editor={editor} {...paragraphSpacing} tabIndex={stop('spacing')} compact={compact} /> : null,
    bold: <ToolbarButton label="Bold (⌘B)" shortcuts="Meta+B Control+B" active={state.bold} tabIndex={stop('bold')} onClick={mark('bold')}><Bold aria-hidden="true" /></ToolbarButton>,
    italic: <ToolbarButton label="Italic (⌘I)" shortcuts="Meta+I Control+I" active={state.italic} tabIndex={stop('italic')} onClick={mark('italic')}><Italic aria-hidden="true" /></ToolbarButton>,
    bullets: <ListToggleButton editor={editor} kind="bulletList" state={lists} tabIndex={stop('bullets')} />,
    numbered: <ListToggleButton editor={editor} kind="orderedList" state={lists} tabIndex={stop('numbered')} />,
    underline: <ToolbarButton label="Underline (⌘U)" shortcuts="Meta+U Control+U" active={state.underline} tabIndex={stop('underline')} onClick={mark('underline')}><Underline aria-hidden="true" /></ToolbarButton>,
    strike: <ToolbarButton label="Strikethrough (⌘⇧S)" shortLabel="Strike" shortcuts="Meta+Shift+S Control+Shift+S" active={state.strike} tabIndex={stop('strike')} onClick={mark('strike')}><Strikethrough aria-hidden="true" /></ToolbarButton>,
    code: <ToolbarButton label="Inline code (⌘E)" shortLabel="Code" shortcuts="Meta+E Control+E" active={state.code} tabIndex={stop('code')} onClick={mark('code')}><Code aria-hidden="true" /></ToolbarButton>,
    highlight: <HighlightMenu editor={editor} active={state.highlight} color={state.highlightColor ?? null} tabIndex={stop('highlight')} />,
    link: allowLinks ? <LinkPopover editor={editor} active={state.link} tabIndex={stop('link')} request={linkRequest} validateHref={validateHref} /> : null,
    clear: <ToolbarButton label="Clear formatting (⌘\)" shortLabel="Clear" shortcuts="Meta+Backslash Control+Backslash" tabIndex={stop('clear')} onClick={() => chain().unsetAllMarks().run()}><RemoveFormatting aria-hidden="true" /></ToolbarButton>,
  };
  const controls = compact ? <>
    <div className={styles.compactRow}>
      {buttons.style}{buttons.spacing}{buttons.bold}{buttons.italic}{buttons.bullets}{buttons.numbered}{buttons.link}
      <button type="button" className={`${styles.toolbarButton} ${styles.compactUtility}`} aria-label="More formatting" title="More formatting" aria-expanded={expanded} tabIndex={stop('more')} onPointerDown={(event) => event.preventDefault()} onClick={(event) => { if (expanded && event.currentTarget.parentElement?.nextElementSibling?.contains(document.activeElement)) event.currentTarget.focus({ preventScroll: true }); setExpanded(!expanded); }}><MoreHorizontal aria-hidden="true" /></button>
      <button type="button" className={`${styles.toolbarButton} ${styles.compactUtility}`} aria-label="Done formatting" title="Done" tabIndex={stop('done')} onClick={finishMobileFormatting}><Check aria-hidden="true" /></button>
    </div>
    {expanded && <div className={styles.compactExtras}>{buttons.underline}{buttons.strike}{buttons.code}{buttons.highlight}{buttons.clear}{onMobileInsertImage && <button type="button" className={styles.toolbarButton} tabIndex={stop('image')} onClick={onMobileInsertImage}>Image</button>}</div>}
  </> : <>{buttons.style}<ToolbarSeparator />{buttons.spacing}{buttons.bold}{buttons.italic}{buttons.bullets}{buttons.numbered}{buttons.underline}{buttons.strike}{buttons.code}{buttons.highlight}{buttons.link}<ToolbarSeparator />{buttons.clear}</>;

  if (mobile) {
    if (!open) return null;
    return createPortal(<div
      ref={menuRef}
      className={`${styles.toolbar} ${styles.mobileToolbar} ${compact ? styles.compactToolbar : ''}`}
      role="toolbar"
      aria-label="Text formatting"
      data-story-editor-action
      data-story-mobile-formatting
      style={{ bottom: `calc(${keyboardInset}px + env(safe-area-inset-bottom) + 8px)` }}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
    >{controls}</div>, document.body);
  }

  return <BubbleMenu
    ref={menuRef}
    editor={editor}
    options={options}
    className={styles.toolbar}
    role="toolbar"
    aria-label="Text formatting"
    data-story-editor-action
    hidden={!open}
    onKeyDown={onKeyDown}
    onBlur={onBlur}
  >
    {controls}
  </BubbleMenu>;
}

/** The address as a link chip shows it: no scheme, no www, no closing slash. */
const shortHref = (href: string) => href.replace(/^(?:https?:\/\/)?(?:www\.)?/i, '').replace(/\/$/, '') || href;

/** For a caret, not a selection: the selection toolbar has that. */
const caretInLink: NonNullable<BubbleMenuProps['shouldShow']> = ({ editor, view, state, element }) => (
  editor.isEditable && state.selection.empty && editor.isActive('link') && (view.hasFocus() || element.contains(document.activeElement))
);

/**
 * The link the caret is in, as a doc editor shows it: its address, which
 * opens in a new tab (so trying a link never leaves the editor), then Edit and
 * Remove. A click in a link only places the caret, as it must for the words to
 * stay editable, so this is how a link is followed or changed without
 * selecting it first. ⌘-click follows it straight away.
 */
export function TiptapLinkChip({ editor, open, href, chipRef, onEdit, onBlur }: {
  editor: Editor;
  /** False hides the chip, as for the selection toolbar. */
  open: boolean;
  /** The link the caret is in; empty when it isn't in one. */
  href: string;
  chipRef: RefObject<HTMLDivElement | null>;
  /** Opens the selection toolbar's link popover on the whole link (⌘K). */
  onEdit: () => void;
  onBlur: (event: FocusEvent<HTMLDivElement>) => void;
}) {
  // Hung under the link itself, so the chip stays put as the caret moves
  // through it; at a link's very edge it falls back to the caret.
  const linkElement = useCallback(() => {
    if (editor.isDestroyed || !editor.isInitialized) return null;
    const { node } = editor.view.domAtPos(editor.state.selection.from);
    const link = (node instanceof Element ? node : node.parentElement)?.closest('a');
    return link && editor.view.dom.contains(link) ? link : null;
  }, [editor]);

  const removeLink = () => {
    const { from } = editor.state.selection;
    editor.chain().focus().extendMarkRange('link').unsetLink().setTextSelection(from).run();
  };

  return <BubbleMenu
    ref={chipRef}
    editor={editor}
    pluginKey="storyLinkChip"
    shouldShow={caretInLink}
    getReferencedVirtualElement={linkElement}
    options={CHIP_OPTIONS}
    className={styles.toolbar}
    role="group"
    aria-label="Link"
    {...{ [PROSE_SURFACE]: '' }}
    data-story-editor-action
    hidden={!open || !href}
    onKeyDown={(event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      editor.commands.focus();
    }}
    onBlur={onBlur}
  >
    <a
      className={styles.linkChipHref}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={`Open ${href} in a new tab`}
      onPointerDown={(event) => event.preventDefault()}
    ><ExternalLink aria-hidden="true" /><span>{shortHref(href)}</span></a>
    <ToolbarSeparator />
    <ToolbarButton label="Edit link (⌘K)" shortLabel="Edit" shortcuts="Meta+K Control+K" tabIndex={0} onClick={onEdit}><Pencil aria-hidden="true" /></ToolbarButton>
    <ToolbarButton label="Remove link" shortLabel="Remove" tabIndex={0} onClick={removeLink}><Unlink aria-hidden="true" /></ToolbarButton>
  </BubbleMenu>;
}

const CHIP_OPTIONS: SelectionToolbarOptions = { placement: 'bottom-start', offset: 8, flip: true, shift: { padding: 16 } };
