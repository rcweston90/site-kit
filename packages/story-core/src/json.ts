import type { StoryJsonValue } from './types.js';

/*
 * Plain JSON, the only thing a custom block's props may hold: null, booleans,
 * finite numbers, strings, arrays and plain objects. No functions, class
 * instances, dates, undefined values, cycles or symbol keys, so a document
 * never carries code and always round-trips through storage unchanged.
 */

/** Deeper than this is a mistake, not a block. */
export const PLAIN_JSON_MAX_DEPTH = 32;

/** Where `value` stops being plain JSON, as a path suffix and a reason, or null. */
export function plainJsonProblem(value: unknown): { at: string; reason: string } | null {
  const stack = new Set<object>();
  const visit = (entry: unknown, at: string, depth: number): { at: string; reason: string } | null => {
    if (depth > PLAIN_JSON_MAX_DEPTH) return { at, reason: `nests deeper than ${PLAIN_JSON_MAX_DEPTH} levels` };
    if (entry === null || typeof entry === 'string' || typeof entry === 'boolean') return null;
    if (typeof entry === 'number') return Number.isFinite(entry) ? null : { at, reason: 'is not a finite number' };
    if (entry === undefined) return { at, reason: 'is undefined' };
    if (typeof entry !== 'object') return { at, reason: `is a ${typeof entry}` };
    if (stack.has(entry)) return { at, reason: 'is a circular reference' };
    stack.add(entry);
    try {
      if (Array.isArray(entry)) {
        for (let index = 0; index < entry.length; index += 1) {
          if (!(index in entry)) return { at: `${at}[${index}]`, reason: 'is an empty slot' };
          const problem = visit(entry[index], `${at}[${index}]`, depth + 1);
          if (problem) return problem;
        }
        return null;
      }
      const prototype = Object.getPrototypeOf(entry);
      if (prototype !== Object.prototype && prototype !== null) return { at, reason: 'is not a plain object' };
      if (Object.getOwnPropertySymbols(entry).length) return { at, reason: 'has symbol keys' };
      for (const [key, child] of Object.entries(entry)) {
        const problem = visit(child, `${at}.${key}`, depth + 1);
        if (problem) return problem;
      }
      return null;
    } finally {
      stack.delete(entry);
    }
  };
  return visit(value, '', 0);
}

export function isPlainJson(value: unknown): value is StoryJsonValue {
  return plainJsonProblem(value) === null;
}

/** Plain-JSON props for a custom block: a plain object of plain JSON. */
export function isPlainJsonObject(value: unknown): value is Record<string, StoryJsonValue> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && isPlainJson(value);
}
