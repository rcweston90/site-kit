/** Percentages of the screen-fitting overview, not of the source pixels. */
export const IMAGE_ZOOM_LEVELS = [25, 50, 75, 100, 125, 150, 200, 300, 400] as const;
export type ImageZoom = (typeof IMAGE_ZOOM_LEVELS)[number];
/** Leave breathing room around an opened image instead of filling every edge. */
export const DEFAULT_IMAGE_ZOOM: ImageZoom = 75;
export interface ImageSize { width: number; height: number }

export function isImageZoom(value: unknown): value is ImageZoom {
  return (IMAGE_ZOOM_LEVELS as readonly unknown[]).includes(value);
}

export function stepImageZoom(zoom: ImageZoom, direction: -1 | 1): ImageZoom {
  const index = IMAGE_ZOOM_LEVELS.indexOf(zoom);
  return IMAGE_ZOOM_LEVELS[Math.max(0, Math.min(IMAGE_ZOOM_LEVELS.length - 1, index + direction))];
}

/** The size an opened image is drawn at. Zoom steps are relative to the
 *  screen-fitting size, so a high-density capture zooms like any other. */
export function lightboxImageSize(source: ImageSize, viewport: ImageSize, zoom: ImageZoom): ImageSize | undefined {
  if (![source.width, source.height, viewport.width, viewport.height, zoom].every((value) => Number.isFinite(value) && value > 0)) return undefined;
  const fit = Math.min(viewport.width / source.width, viewport.height / source.height);
  const scale = fit * zoom / 100;
  return { width: source.width * scale, height: source.height * scale };
}
