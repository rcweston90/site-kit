/** Geometry shared by the phone toolbar and its caret reveal. `coordsAtPos`
 * uses layout-viewport coordinates, while the software keyboard changes the
 * visual viewport. Keep the active line between the browser chrome and the
 * toolbar instead of letting the fixed controls cover what is being typed. */
export function mobileToolbarFrame(layoutHeight: number, viewportHeight: number, viewportTop: number, toolbarHeight: number, selectionTop: number, selectionBottom: number) {
  const keyboardInset = Math.max(0, Math.round(layoutHeight - viewportHeight - viewportTop));
  const safeTop = viewportTop + 12;
  const safeBottom = viewportTop + viewportHeight - toolbarHeight - 20;
  const scrollBy = selectionBottom > safeBottom
    ? Math.ceil(selectionBottom - safeBottom)
    : selectionTop < safeTop
      ? Math.floor(selectionTop - safeTop)
      : 0;
  return { keyboardInset, scrollBy };
}
