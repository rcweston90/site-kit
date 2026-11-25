import { Suspense, lazy, useEffect, useMemo, useRef, useState, type FocusEvent } from 'react';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import { TextSelection } from '@tiptap/pm/state';
import { storyMediaFiles } from './media-upload-client.js';
import { useMediaQuery } from '@rcweston/story-react';
import type { StoryBlock, StoryRichText } from '@rcweston/story-core';
import type { StoryRenderEditor } from '@rcweston/story-react';
import { highlightColor } from '@rcweston/story-core';
import { proseBlockToHtml, safeStoryHref, storyLargeParagraphs, storyProseRuns, storySubheadings, tiptapDocToProseBlock } from '@rcweston/story-core';
import { coercePastedSlice, storyProseExtensions, storySlashKey, storyTextStyle, type StoryProsePosition } from './story-prose-schema.js';
import { PROSE_SURFACE, type SelectionToolbarOptions } from './TiptapAuthoringToolbar.js';
import { blockStyles as blockStyles } from '@rcweston/story-react';
import { proseEditorStyles as styles } from './classes.js';

// Tiptap's bubble menu touches `document` while rendering and the editor only
// exists on the client anyway, so keep it (and the prosemirror-tables code it
// pulls in) out of the server render.
const TiptapSelectionToolbar = lazy(() => import('./TiptapAuthoringToolbar.js').then((toolbar) => ({ default: toolbar.TiptapSelectionToolbar })));
const TiptapLinkChip = lazy(() => import('./TiptapAuthoringToolbar.js').then((toolbar) => ({ default: toolbar.TiptapLinkChip })));
// Editor-only too, and it brings the block catalog with it.
const StorySlashMenu = lazy(() => import('./StorySlashMenu.js'));

/** Where a block inserted from the slash menu splits this text: what stays
 *  above it and what follows it, each null when nothing would be left. */
export interface StoryProseSplit<T extends StoryRichText> { before: T | null; after: T | null }

type RichJson = { type?: string; text?: string; content?: RichJson[] };

const hasWords = (node: RichJson): boolean => Boolean(node.text?.trim()) || (node.content ?? []).some(hasWords);

// The schema only admits what tiptapDocToProseBlock can save; the reader's list
// and large-text classes keep lists and large paragraphs exactly as published.
const PROSE_PLACEHOLDER = 'Write, or type / for a component';
const extensionsFor = (placeholder: string) => storyProseExtensions({
  listClass: blockStyles.proseList,
  largeClass: blockStyles.lede,
  placeholder,
});
const proseExtensions = extensionsFor(PROSE_PLACEHOLDER);

/** Same text, large paragraphs, subheadings and list items, however each
 *  block records them (an older `lede: true` and `large: [0]` look the same,
 *  as do a list block and the same items listed one by one). */
function sameProse(a: StoryRichText, b: StoryRichText): boolean {
  const largeA = storyLargeParagraphs(a);
  const largeB = storyLargeParagraphs(b);
  const headingsA = [...storySubheadings(a)];
  const headingsB = [...storySubheadings(b)];
  return a.paragraphs.length === b.paragraphs.length
    && a.paragraphs.every((paragraph, index) => paragraph === b.paragraphs[index])
    && largeA.length === largeB.length
    && largeA.every((index, at) => index === largeB[at])
    && JSON.stringify(headingsA) === JSON.stringify(headingsB)
    && JSON.stringify(storyProseRuns(a)) === JSON.stringify(storyProseRuns(b));
}

/**
 * Rich text edited in place: a prose block, or one body of an insight card.
 * `onChange` receives the text with the value's other fields kept, on every
 * keystroke, and once more with the starting value if the edit is cancelled.
 */
export function StoryProseEditor<T extends StoryRichText>({
  value: block,
  onChange,
  selectionId,
  editor: renderEditor,
  label = 'Story prose',
  placeholder = PROSE_PLACEHOLDER,
  onInsertBlock,
  onInsertFiles,
}: {
  value: T;
  onChange: (next: T) => void;
  selectionId: string;
  editor: StoryRenderEditor;
  /** The text box's accessible name. */
  label?: string;
  placeholder?: string;
  /** A prose block's own text: the slash menu can insert any block at the
   *  caret, splitting the text around it. Elsewhere it only restyles. */
  onInsertBlock?: (type: StoryBlock['type'], split: StoryProseSplit<T>) => void;
  /** A prose block's own text: images pasted or dropped into it become an
   *  image block at the caret (or the drop point), splitting the text. */
  onInsertFiles?: (files: File[], split: StoryProseSplit<T>) => void;
}) {
  const blockRef = useRef(block);
  // The editor's handlers are bound once; the latest callback is read here.
  const onChangeRef = useRef(onChange);
  const extensions = useMemo(() => (placeholder === PROSE_PLACEHOLDER ? proseExtensions : extensionsFor(placeholder)), [placeholder]);
  const focusedRef = useRef(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const chipRef = useRef<HTMLDivElement>(null);
  // Pasting or dropping images: the handlers are bound once, so they read the
  // latest insert through this ref.
  const insertFilesRef = useRef<((files: File[]) => void) | null>(null);
  // Escape, read the same way: the key handler is bound once too.
  const leaveRef = useRef<(() => void) | null>(null);
  // ⌘K asks the toolbar for its link popover.
  const [linkRequest, setLinkRequest] = useState(0);
  // ProseMirror hands a drop to transformPasted before it knows where the
  // content will land, so the drop handler records the point first.
  const dropRef = useRef<StoryProsePosition | null>(null);
  const [editing, setEditing] = useState(false);
  const mobileToolbar = useMediaQuery('(max-width: 767px)');
  // Touch browsers draw their own copy/paste callout above a selection, so the
  // menu sits below it there, clear of the selection handles.
  const coarsePointer = useMediaQuery('(pointer: coarse)');
  const menuOptions = useMemo<SelectionToolbarOptions>(() => (
    coarsePointer ? { placement: 'bottom', offset: 24, flip: true, shift: { padding: 16 } } : { placement: 'top', offset: 8, flip: true, shift: { padding: 16 } }
  ), [coarsePointer]);

  useEffect(() => { blockRef.current = block; }, [block]);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  // The toolbar, its style menu and its link popover live outside the
  // contenteditable; moving focus between them and the text is still one
  // edit, so it doesn't commit.
  const insideEdit = (target: EventTarget | null) => target instanceof Node
    && ([editor?.view.dom, menuRef.current, chipRef.current].some((element) => element?.contains(target))
      || (target instanceof Element && Boolean(target.closest(`[${PROSE_SURFACE}]`))));

  const endEdit = () => {
    if (!focusedRef.current) return;
    focusedRef.current = false;
    setEditing(false);
    renderEditor.onTextEditEnd();
  };

  const editor = useEditor({
    immediatelyRender: false,
    extensions,
    content: proseBlockToHtml(block),
    editorProps: {
      attributes: {
        class: styles.content,
        'aria-label': label,
        'aria-description': 'Select text to format it. Alt+F10 moves to the formatting toolbar.',
      },
      // ProseMirror claims every Escape (it calls preventDefault), so leaving
      // the text is handled here, not in a wrapper's onKeyDown. An open slash
      // menu comes after this prop and closes itself on its own Escape.
      handleKeyDown: (view, event) => {
        if (event.key !== 'Escape' || event.isComposing || storySlashKey.getState(view.state)?.active) return false;
        leaveRef.current?.();
        return true;
      },
      handlePaste: (_view, event) => {
        const files = storyMediaFiles(event.clipboardData);
        if (!files.length || !insertFilesRef.current) return false;
        event.preventDefault();
        insertFilesRef.current(files);
        return true;
      },
      transformPasted: (slice, view) => {
        const landing = dropRef.current ?? view.state.selection.$from;
        dropRef.current = null;
        return coercePastedSlice(slice, landing);
      },
      // ⌘- or Ctrl-click follows a link in a new tab, as in a doc editor. A
      // plain click only places the caret, so a link's words stay editable;
      // the link chip offers the address from there.
      handleClick: (view, _pos, event) => {
        if (!(event.metaKey || event.ctrlKey) || !(event.target instanceof Element)) return false;
        const link = event.target.closest('a[href]');
        const href = link && view.dom.contains(link) ? safeStoryHref(link.getAttribute('href')) : null;
        if (!href) return false;
        event.preventDefault();
        window.open(href, '_blank', 'noopener,noreferrer');
        return true;
      },
      handleDOMEvents: {
        drop: (view, event) => {
          const point = view.posAtCoords({ left: event.clientX, top: event.clientY });
          const files = storyMediaFiles(event.dataTransfer);
          if (files.length && insertFilesRef.current) {
            // The image lands where it was dropped: the caret goes there first.
            event.preventDefault();
            if (point) view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(point.pos))));
            insertFilesRef.current(files);
            return true;
          }
          dropRef.current = point ? view.state.doc.resolve(point.pos) : null;
          // ProseMirror's own handler runs next, in this same task; a drop it
          // ignores must not leave the point behind for the next paste.
          queueMicrotask(() => { dropRef.current = null; });
          return false;
        },
      },
    },
    // globals.css styles `.tiptap.ProseMirror` for the blog editor (300px
    // min-height, padding, 1.75 leading, muted paragraphs, disc lists) and
    // those rules outrank `.prose p`. Dropping Tiptap's class lets the reader's
    // rules through; the class is only a styling hook.
    onMount: ({ editor: instance }) => instance.view.dom.classList.remove('tiptap'),
    onFocus: () => {
      if (focusedRef.current) return;
      focusedRef.current = true;
      setEditing(true);
      renderEditor.onSelect(selectionId);
      renderEditor.onTextEditStart();
    },
    onUpdate: ({ editor: instance }) => onChangeRef.current(tiptapDocToProseBlock(instance.getJSON(), blockRef.current)),
    onBlur: ({ event }) => {
      if (insideEdit(event.relatedTarget)) return;
      endEdit();
    },
  });

  const state = useEditorState({ editor, selector: ({ editor: instance }) => ({
    style: instance ? storyTextStyle(instance) : 'text' as const,
    bold: instance?.isActive('bold') ?? false,
    italic: instance?.isActive('italic') ?? false,
    underline: instance?.isActive('underline') ?? false,
    strike: instance?.isActive('strike') ?? false,
    code: instance?.isActive('code') ?? false,
    highlight: instance?.isActive('highlight') ?? false,
    highlightColor: instance?.isActive('highlight') ? highlightColor(instance.getAttributes('highlight').color) : null,
    link: instance?.isActive('link') ?? false,
    href: instance?.isActive('link') ? String(instance.getAttributes('link').href ?? '') : '',
    slash: instance ? storySlashKey.getState(instance.state) ?? null : null,
  }) });

  // Outside an edit only (focus may be in the toolbar, not the text). Compare
  // the model, not HTML: the list class and entity escaping make the two HTML
  // strings differ even when the text is identical.
  useEffect(() => {
    if (!editor || editor.isFocused || focusedRef.current) return;
    if (sameProse(tiptapDocToProseBlock(editor.getJSON(), block), block)) return;
    editor.commands.setContent(proseBlockToHtml(block), { emitUpdate: false });
  }, [block, editor]);

  /** The edit ends here (no commit of its own, so whatever is inserted and
   *  the text around it are one step to undo) and the text splits at the
   *  caret: an empty paragraph there goes, the rest stays either side. */
  const splitAtCaret = (instance: Editor): StoryProseSplit<T> => {
    const content = (instance.getJSON().content ?? []) as RichJson[];
    const index = instance.state.selection.$from.index(0);
    const here = content[index];
    const beforeNodes = here && hasWords(here) ? content.slice(0, index + 1) : content.slice(0, index);
    const afterNodes = content.slice(index + 1);
    const part = (nodes: RichJson[]) => (nodes.some(hasWords) ? tiptapDocToProseBlock({ type: 'doc', content: nodes }, blockRef.current) : null);
    const split = { before: part(beforeNodes), after: part(afterNodes) };
    focusedRef.current = false;
    setEditing(false);
    instance.commands.setContent(proseBlockToHtml(split.before ?? blockRef.current), { emitUpdate: false });
    instance.view.dom.blur();
    return split;
  };
  useEffect(() => {
    insertFilesRef.current = editor && onInsertFiles ? (files) => onInsertFiles(files, splitAtCaret(editor)) : null;
    /* Escape leaves the text and keeps it: the edit commits as on blur, so
       ⌘Z takes back everything typed since entering it in one step, and the
       block's controls take focus. */
    leaveRef.current = editor ? () => {
      endEdit();
      editor.commands.blur();
      renderEditor.onTextEditLeave();
    } : null;
  });

  if (!editor) return null;

  /** The slash menu chose a block: the paragraph the caret is in splits the
   *  text (an empty one goes), and the block lands between the halves. The
   *  text edit ends here without a commit of its own, so the insert and the
   *  text around it are one step to undo. */
  const insertBlock = onInsertBlock && ((type: StoryBlock['type']) => onInsertBlock(type, splitAtCaret(editor)));

  /** Link the selection, or the link the caret is in. The popover hangs off
   *  the selection toolbar, which shows only for a selection (on phones it is
   *  always there, and links an empty caret by inserting the address itself). */
  const requestLink = () => {
    if (editor.state.selection.empty && editor.isActive('link')) editor.chain().focus().extendMarkRange('link').run();
    if (!editor.state.selection.empty || mobileToolbar) setLinkRequest((count) => count + 1);
  };

  return <div className={styles.shell}>
    <EditorContent editor={editor} onKeyDown={(event) => {
      // Handled in the text already (Escape, and the slash menu's keys).
      if (event.nativeEvent.isComposing || event.defaultPrevented) return;
      if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        requestLink();
        return;
      }
      if (event.key === 'F10' && event.altKey) {
        // The toolbar for a selection, the link chip for a caret in a link;
        // whichever is hidden is out of the document.
        const first = [menuRef.current?.querySelector<HTMLElement>('button[tabindex="0"]'), chipRef.current?.querySelector<HTMLElement>('a, button')]
          .find((element) => element?.isConnected);
        if (!first) return;
        event.preventDefault();
        first.focus();
      }
    }} />
    <Suspense fallback={null}>
    {editing && state?.slash?.active && <StorySlashMenu editor={editor} slash={state.slash} onInsertBlock={insertBlock} />}
    <TiptapSelectionToolbar
      menuRef={menuRef}
      linkRequest={linkRequest}
      editor={editor}
      open={editing}
      mobile={mobileToolbar}
      options={menuOptions}
      onMobileDone={() => leaveRef.current?.()}
      onBlur={(event: FocusEvent) => { if (!insideEdit(event.relatedTarget)) endEdit(); }}
      state={state ?? { style: 'text', bold: false, italic: false, underline: false, strike: false, code: false, highlight: false, link: false }}
    />
    <TiptapLinkChip
      chipRef={chipRef}
      editor={editor}
      open={editing}
      href={state?.href ?? ''}
      onEdit={requestLink}
      onBlur={(event: FocusEvent) => { if (!insideEdit(event.relatedTarget)) endEdit(); }}
    />
    </Suspense>
  </div>;
}
