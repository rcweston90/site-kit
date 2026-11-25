/** Source shapes the reader renders without interpreting script-like URLs:
 *  a path on this site, or an http(s) URL. */
export function isSupportedMediaSource(value: string | undefined): boolean {
  if (!value) return false;
  const source = value.trim();
  return /^\/(?!\/)/.test(source) || /^https?:\/\//i.test(source);
}

export function normalizeMediaSource(value: string | undefined): string | undefined {
  return isSupportedMediaSource(value) ? value!.trim() : undefined;
}
