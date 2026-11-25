import { useLayoutEffect, useRef } from 'react';
import type { StoryFieldPath } from '@rcweston/story-core';
import type { StoryRenderEditor } from '@rcweston/story-react';
import { inlineTextStyles as styles } from './classes.js';

function insertPlainText(text: string) {
  // Keep paste and authored returns in the browser's native editing history.
  // Range.insertNode mutates the DOM but creates no undo transaction, so ⌘Z
  // could not reverse a paste or Enter while this field still had focus.
  if (document.execCommand('insertText', false, text)) return;
  const selection = window.getSelection();
  if (!selection?.rangeCount) return;
  const range = selection.getRangeAt(0);
  range.deleteContents();
  const node = document.createTextNode(text);
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function normalizeText(text: string, multiline: boolean, trimTrailing = true) {
  const normalized = text.replace(/\r\n?/g, '\n');
  return multiline
    ? (trimTrailing ? normalized.replace(/\n+$/, '') : normalized)
    : normalized.replace(/\s*\n+\s*/g, ' ').trimEnd();
}

/**
 * Plain `textContent` joins browser-authored `<div>` and `<br>` nodes, which
 * made returns disappear on save. Walk the small contenteditable DOM so both
 * browser-authored blocks and our literal newline text nodes serialize.
 */
function editableText(element: HTMLElement | null) {
  if (!element) return '';

  const readNode = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
    if (!(node instanceof HTMLElement)) return '';
    if (node.tagName === 'BR') return '\n';

    const text = Array.from(node.childNodes, readNode).join('');
    return /^(DIV|P)$/.test(node.tagName) ? `${text}\n` : text;
  };

  return Array.from(element.childNodes, readNode).join('').replace(/\u00a0/g, ' ');
}

export function InlineStoryText({
  value,
  path,
  editor,
  selectionId,
  label,
  placeholder = 'Add text',
  multiline = false,
}: {
  value: string;
  path: StoryFieldPath;
  editor: StoryRenderEditor;
  selectionId: string;
  label: string;
  placeholder?: string;
  multiline?: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const original = useRef(value);
  const draftHistory = useRef<string[]>([value]);
  const draftFuture = useRef<string[]>([]);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || document.activeElement === element) return;
    if (element.textContent !== value) element.textContent = value;
  }, [value]);

  const sendValue = () => {
    const next = editableText(ref.current);
    editor.onTextInput(path, normalizeText(next, multiline));
  };

  const stageValue = () => {
    const next = editableText(ref.current);
    // Keep a return that is still at the caret. Trimming it during the draft
    // rerender erases the break before the author can type the next line.
    // The committed value is still tidied on blur by `sendValue`.
    const normalized = normalizeText(next, multiline, false);
    if (draftHistory.current.at(-1) !== normalized) {
      draftHistory.current.push(normalized);
      draftFuture.current = [];
    }
    editor.onTextDraftChange(path, normalized, normalized !== original.current);
  };

  const restoreDraft = (next: string) => {
    const element = ref.current;
    if (!element) return;
    element.textContent = next;
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    editor.onTextDraftChange(path, next, next !== original.current);
  };

  return (
    <span
      ref={ref}
      contentEditable
      tabIndex={0}
      suppressContentEditableWarning
      role="textbox"
      aria-label={label}
      aria-multiline={multiline || undefined}
      spellCheck
      className={styles.editable}
      data-empty={value.length === 0 || undefined}
      data-placeholder={placeholder}
      onFocus={() => {
        original.current = value;
        draftHistory.current = [value];
        draftFuture.current = [];
        editor.onSelect(selectionId);
        editor.onTextEditStart();
      }}
      onBeforeInput={(event) => {
        if (event.nativeEvent.isComposing) return;
        if (multiline && (event.nativeEvent.inputType === 'insertParagraph' || event.nativeEvent.inputType === 'insertLineBreak')) {
          event.preventDefault();
          // A soft return is one stored line break. A hard return is a blank
          // line between paragraphs. Inserting text ourselves keeps Chrome,
          // Safari and Firefox from producing different div/br DOM shapes.
          insertPlainText(event.nativeEvent.inputType === 'insertParagraph' ? '\n\n' : '\n');
          return;
        }
        if (!multiline && (event.nativeEvent.inputType === 'insertParagraph' || event.nativeEvent.inputType === 'insertLineBreak')) {
          event.preventDefault();
          ref.current?.blur();
        }
      }}
      onInput={stageValue}
      onPaste={(event) => {
        event.preventDefault();
        const source = event.clipboardData.getData('text/plain');
        insertPlainText(multiline ? source : source.replace(/\s*[\r\n]+\s*/g, ' '));
        stageValue();
      }}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) return;
        if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'a') {
          // A standalone contenteditable inside the story can otherwise fall
          // back to page-wide browser selection instead of selecting its text.
          event.preventDefault();
          event.stopPropagation();
          const selection = window.getSelection();
          if (selection) {
            const range = document.createRange();
            range.selectNodeContents(event.currentTarget);
            selection.removeAllRanges();
            selection.addRange(range);
          }
          return;
        }
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
          event.preventDefault();
          if (event.shiftKey) {
            const next = draftFuture.current.pop();
            if (next !== undefined) {
              draftHistory.current.push(next);
              restoreDraft(next);
            }
          } else if (draftHistory.current.length > 1) {
            const current = draftHistory.current.pop();
            if (current !== undefined) draftFuture.current.push(current);
            restoreDraft(draftHistory.current.at(-1) ?? original.current);
          }
          return;
        }
        if (event.key === 'Enter' && multiline) {
          event.preventDefault();
          insertPlainText(event.shiftKey ? '\n' : '\n\n');
          return;
        }
        if (event.key === 'Enter' && !multiline) {
          event.preventDefault();
          ref.current?.blur();
          return;
        }
        if (event.key === 'Escape') {
          // Leaves the text and keeps it, as a blur does; ⌘Z takes it back.
          event.preventDefault();
          ref.current?.blur();
          editor.onTextEditLeave();
        }
      }}
      onBlur={() => {
        sendValue();
        editor.onTextEditEnd();
      }}
    >
      {value}
    </span>
  );
}


/**
 * Editor only: a quiet "+ Add …" line that appends an empty item and puts the
 * caret in it, so a list grows on the page instead of in a settings panel.
 * The change is bracketed as one inline edit, so a single Undo removes it.
 */
export function InlineStoryAdd({
  label,
  focusLabel,
  editor,
  selectionId,
  onAdd,
  className,
}: {
  label: string;
  /** aria-label of the field to focus once the new item has rendered. */
  focusLabel: string;
  editor: StoryRenderEditor;
  selectionId: string;
  onAdd: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={className ? `${styles.add} ${className}` : styles.add}
      // The shell turns clicks on page buttons into block selection; this
      // one is an editing action, so it opts out.
      data-story-editor-action
      onClick={(event) => {
        const block = event.currentTarget.closest('[data-story-editor-id]');
        editor.onSelect(selectionId);
        editor.onTextEditStart();
        onAdd();
        editor.onTextEditEnd();
        requestAnimationFrame(() => {
          block?.querySelector<HTMLElement>(`[aria-label="${CSS.escape(focusLabel)}"]`)?.focus();
        });
      }}
    >
      <span aria-hidden="true">+</span>
      {label}
    </button>
  );
}
