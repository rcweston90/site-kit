/** Helpers shared inside the package. Not part of the public API. */

export type Fields = Record<string, unknown>;

export function isRecord(value: unknown): value is Fields {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function hasText(value: string | undefined | null): boolean {
  return Boolean(value?.trim());
}

/** The same set when one is passed, so hot paths don't copy. */
export function toSet<T>(values: Iterable<T> | undefined): ReadonlySet<T> {
  if (!values) return new Set<T>();
  return values instanceof Set ? values : new Set(values);
}

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
