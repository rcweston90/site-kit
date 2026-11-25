/**
 * Errors this package adds to story-core's contract errors, and how every
 * error becomes a response body an editor can show as is.
 */

import {
  AddressTakenError,
  DraftConflictError,
  PublicationConflictError,
  StoryMovedError,
  type StoryErrorBody,
} from '@rcweston/story-core';
import { RENAME_STALE_MESSAGE, StoryRenameError } from './validation.js';

/** The story didn't pass validation. Answer 400 (or 422 for a publish). */
export class InvalidStoryError extends Error {
  readonly problems: string[];
  constructor(problems: string[], message = 'This story has problems to fix before it can be saved.') {
    super(message);
    this.name = 'InvalidStoryError';
    this.problems = problems;
  }
}

/** Nothing is saved at that address, or the version asked for isn't part of the story. Answer 404. */
export class StoryNotFoundError extends Error {
  constructor(message = 'There’s no story at this address.') {
    super(message);
    this.name = 'StoryNotFoundError';
  }
}

/**
 * Stores speak the contract's errors. A rename plan that fails for a reason
 * the contract names (moved, stale, taken) is turned into that error; the
 * rest stay `StoryRenameError`s, which the handlers also understand.
 */
export function contractRenameError(error: unknown): unknown {
  if (!(error instanceof StoryRenameError)) return error;
  if (error.code === 'moved' && error.movedTo) return new StoryMovedError(error.movedTo);
  if (error.code === 'stale') return new DraftConflictError(RENAME_STALE_MESSAGE);
  if (error.code === 'address' && error.problem === 'taken') return new AddressTakenError(error.message);
  if (error.code === 'not-found') return new StoryNotFoundError(error.message);
  return error;
}

export interface ErrorResponseParts {
  status: number;
  body: StoryErrorBody;
}

export const SERVER_ERROR_MESSAGE = 'Something went wrong on the server. Nothing was changed. Try again in a moment.';

/** Known errors become their status and plain words; anything else is a 500 that says nothing internal. */
export function errorParts(error: unknown): ErrorResponseParts | null {
  if (error instanceof StoryMovedError) {
    return { status: 409, body: { error: error.message, code: 'STORY_MOVED', movedTo: error.movedTo } };
  }
  if (error instanceof DraftConflictError || error instanceof PublicationConflictError) {
    return { status: 409, body: { error: error.message, code: 'CONFLICT' } };
  }
  if (error instanceof AddressTakenError) {
    return { status: 409, body: { error: error.message, code: 'ADDRESS' } };
  }
  if (error instanceof InvalidStoryError) {
    return { status: 400, body: { error: error.message, code: 'INVALID', problems: error.problems } };
  }
  if (error instanceof StoryNotFoundError) {
    return { status: 404, body: { error: error.message, code: 'NOT_FOUND' } };
  }
  if (error instanceof StoryRenameError) {
    if (error.code === 'moved') return { status: 409, body: { error: error.message, code: 'STORY_MOVED', movedTo: error.movedTo } };
    if (error.code === 'stale') return { status: 409, body: { error: error.message, code: 'CONFLICT' } };
    if (error.code === 'not-found') return { status: 404, body: { error: error.message, code: 'NOT_FOUND' } };
    if (error.code === 'address') return { status: 422, body: { error: error.message, code: 'ADDRESS' } };
    if (error.code === 'unavailable') return { status: 503, body: { error: error.message } };
    return { status: 400, body: { error: error.message, code: 'INVALID' } };
  }
  return null;
}

/** Postgres error codes for "someone else changed this first". */
export function isConcurrencyFailure(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === '40001' || code === '40P01' || code === '23505';
}
