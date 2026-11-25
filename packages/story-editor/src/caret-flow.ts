import type { Editor } from '@tiptap/react';

/*
 * ↑ and ↓ carry the caret from one text box on the page to the next, as in a
 * doc: ↓ on a box's last line goes to the next box's first line, ↑ on its
 * first line to the previous box's last, in the same column where it can.
 * Every block, title and caption is its own contenteditable, so without this
 * the caret stops at each one's edge. Boxes with no text (a divider, an
 * image) are passed over; a table steps to the cell above or below.
 */

const EDITABLE = '[contenteditable="true"]';
/** Clear of the sticky top bar when the next line is brought into view. */
const TOP_CLEARANCE = 72;
const BOTTOM_CLEARANCE = 24;

type Direction = 1 | -1;

/** The boxes a text box's content draws: one per line of text, plus each
 *  paragraph's or list's own box. */
function contentRects(element: Element): DOMRect[] {
  const range = document.createRange();
  range.selectNodeContents(element);
  return [...range.getClientRects()].filter((rect) => rect.height > 0);
}

function caretRect(range: Range, editable: HTMLElement): DOMRect {
  const rect = [...range.getClientRects()].find((item) => item.height > 0);
  if (rect) return rect;
  // An empty line has no text to measure: its paragraph (or the box) does.
  const { startContainer: node, startOffset: offset } = range;
  const element = node instanceof Element ? (node.childNodes[offset] instanceof Element ? node.childNodes[offset] : node) : node.parentElement;
  return (element && editable.contains(element) ? element : editable).getBoundingClientRect();
}

/** Whether no line lies beyond the caret, in the direction of travel. */
function atEdge(editable: HTMLElement, caret: DOMRect, direction: Direction): boolean {
  const middle = caret.top + caret.height / 2;
  return !contentRects(editable).some((rect) => (direction > 0 ? rect.top > middle : rect.bottom < middle));
}

function visible(element: HTMLElement) {
  return element.getClientRects().length > 0;
}

/** The next text box in reading order; in a table, the next row's cell. */
function neighbour(page: HTMLElement, from: HTMLElement, direction: Direction): HTMLElement | null {
  const boxes = [...page.querySelectorAll<HTMLElement>(EDITABLE)].filter(visible);
  let start = from;
  const cell = from.closest<HTMLTableCellElement>('td, th');
  const table = cell?.closest('table');
  if (cell && table) {
    const row = cell.parentElement as HTMLTableRowElement;
    const below = table.rows[row.rowIndex + direction]?.cells[cell.cellIndex]?.querySelector<HTMLElement>(EDITABLE);
    if (below && visible(below)) return below;
    // Leaving the table: carry on from its last cell (or before its first).
    const cells = boxes.filter((box) => table.contains(box));
    start = (direction > 0 ? cells[cells.length - 1] : cells[0]) ?? from;
  }
  const at = boxes.indexOf(start);
  return at < 0 ? null : boxes[at + direction] ?? null;
}

function pointRange(x: number, y: number): Range | null {
  if (document.caretPositionFromPoint) {
    const position = document.caretPositionFromPoint(x, y);
    if (!position) return null;
    const range = document.createRange();
    range.setStart(position.offsetNode, position.offset);
    return range;
  }
  return document.caretRangeFromPoint?.(x, y) ?? null;
}

/** Put the caret on the target's first line (going down) or last (going up),
 *  as near column `x` as that line allows. */
function placeCaret(target: HTMLElement, direction: Direction, x: number) {
  const rects = contentRects(target);
  const line = rects.length
    ? rects.reduce((best, rect) => (direction > 0 ? (rect.top < best.top ? rect : best) : (rect.bottom > best.bottom ? rect : best)))
    : target.getBoundingClientRect();
  // A few pixels inside the line, which a tall first line (large text) or a
  // short one (a caption) both contain.
  let y = direction > 0 ? line.top + Math.min(6, line.height / 2) : line.bottom - Math.min(6, line.height / 2);
  // The line has to be on screen to find a spot on it, so bring it in first.
  const shift = y < TOP_CLEARANCE ? y - TOP_CLEARANCE : y > window.innerHeight - BOTTOM_CLEARANCE ? y - window.innerHeight + BOTTOM_CLEARANCE : 0;
  if (shift) {
    window.scrollBy({ top: shift, behavior: 'instant' });
    y -= shift;
  }
  const column = Math.min(Math.max(x, line.left + 1), line.right - 1);
  const tiptap = (target as HTMLElement & { editor?: Editor }).editor;
  if (tiptap && !tiptap.isDestroyed) {
    // Focus now, not on Tiptap's next frame (its focus command waits one), so
    // a second ↑ / ↓ pressed straight after lands in this box.
    const at = tiptap.view.posAtCoords({ left: column, top: y });
    tiptap.commands.setTextSelection(at ? at.pos : direction > 0 ? 0 : tiptap.state.doc.content.size);
    tiptap.view.focus();
    return;
  }
  const range = pointRange(column, y);
  target.focus({ preventScroll: true });
  const selection = document.getSelection();
  if (!selection) return;
  if (range && target.contains(range.startContainer)) {
    selection.collapse(range.startContainer, range.startOffset);
  } else {
    selection.selectAllChildren(target);
    if (direction > 0) selection.collapseToStart();
    else selection.collapseToEnd();
  }
}

/**
 * Handle ↑ / ↓ from a text box on the page. Returns true when the caret moved
 * to another box (the caller then prevents the default), false when the key
 * belongs to the box itself: the caret has a line to move to within it, text
 * is selected, or this is the first or last box on the page.
 */
export function flowCaret(page: HTMLElement, editable: HTMLElement, direction: Direction): boolean {
  const selection = document.getSelection();
  if (!selection?.rangeCount || !selection.isCollapsed) return false;
  const range = selection.getRangeAt(0);
  if (!editable.contains(range.startContainer)) return false;
  const caret = caretRect(range, editable);
  if (!atEdge(editable, caret, direction)) return false;
  const target = neighbour(page, editable, direction);
  if (!target) return false;
  placeCaret(target, direction, caret.left);
  return true;
}

/** The text box a key event came from, if it is one of the page's. */
export function pageEditable(page: HTMLElement, target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof HTMLElement) || !target.isContentEditable) return null;
  const editable = target.closest<HTMLElement>(EDITABLE);
  return editable && page.contains(editable) ? editable : null;
}
