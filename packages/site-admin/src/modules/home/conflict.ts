import { SaveRequestError } from '@rcweston/save-kit';

/** What the status line says when a save meets a newer one from another tab or device. */
export const CONFLICT_MESSAGE = 'This was saved somewhere else while you were editing. Your edits are still here: save again to keep yours, or reload to see theirs.';

/**
 * Runs a save; when the server answers 409 (built on an older version), it
 * first hands the screen what's stored now, so the screen can show it as the
 * saved copy while the person's edit stays in the form, then fails with a
 * sentence that says so. Everything else fails as it came.
 */
export async function withConflict<T>(save: () => Promise<T>, onConflict: () => Promise<void> | void): Promise<T> {
  try {
    return await save();
  } catch (reason) {
    if (reason instanceof SaveRequestError && reason.status === 409) {
      await Promise.resolve(onConflict()).catch(() => undefined);
      throw new SaveRequestError('refused', 409, CONFLICT_MESSAGE);
    }
    throw reason;
  }
}
