/** Visible viewport geometry for a sheet above the phone's software keyboard.
 * The viewport can also pan while an input is focused, so offsetTop matters. */
export function blogKeyboardFrame(layoutHeight: number, viewportHeight: number, viewportTop: number) {
  return {
    bottom: Math.max(0, Math.round(layoutHeight - viewportHeight - viewportTop)),
    maxHeight: Math.max(0, Math.round(viewportHeight - 24)),
  };
}

type Rect = { top: number; right: number; bottom: number; left: number };
export type BlogImageActionPosition = { top: number; left: number; placement: 'above' | 'below' | 'side' | 'overlay' };
const EDGE = 8;
const GAP = 6;

/** Floating editor chrome does not reserve space or move the selected image.
 * Try the actual gaps around it before using a small overlay as a last resort. */
export function blogImageActionPosition({
  image, viewport, editor, dockBottom = 0, previousBottom, nextTop, button,
}: {
  image: Rect; viewport: Rect; editor: Pick<Rect, 'left' | 'right'>;
  dockBottom?: number; previousBottom?: number; nextTop?: number;
  button: { width: number; height: number };
}): BlogImageActionPosition | null {
  const top = Math.max(viewport.top + EDGE, dockBottom + GAP);
  const bottom = viewport.bottom - EDGE;
  const left = Math.max(viewport.left + EDGE, editor.left);
  const right = Math.min(viewport.right - EDGE, editor.right);
  const { width, height } = button;
  if (!width || !height || right - left < width || bottom - top < height) return null;
  const visibleTop = Math.max(image.top, top);
  const visibleBottom = Math.min(image.bottom, bottom);
  const minVisible = Math.min(24, image.bottom - image.top);
  if (visibleBottom - visibleTop < minVisible || minVisible <= 0 || image.right <= left || image.left >= right) return null;
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));
  const x = clamp(image.right - width, left, right - width);
  const above = image.top - GAP - height;
  const below = image.bottom + GAP;
  if (above >= Math.max(top, (previousBottom ?? top) + GAP)) return { top: above, left: x, placement: 'above' };
  if (below + height <= Math.min(bottom, (nextTop ?? bottom + GAP) - GAP)) return { top: below, left: x, placement: 'below' };
  const sideTop = clamp(visibleTop, top, bottom - height);
  if (image.right + GAP + width <= right) return { top: sideTop, left: image.right + GAP, placement: 'side' };
  if (image.left - GAP - width >= left) return { top: sideTop, left: image.left - GAP - width, placement: 'side' };
  return { top: clamp(visibleTop + GAP, top, bottom - height), left: x - Math.min(GAP, x - left), placement: 'overlay' };
}
