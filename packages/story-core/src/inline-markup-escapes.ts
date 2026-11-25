/**
 * Prose is stored as a small markup (see inline-markup.ts), and the editor
 * saves a literal `\`, `*`, `_`, `[`, `]` or `` ` ``, and a `+`, `~` or `=`
 * that could pair up, or a `{` that would read as a highlight's colour, with
 * a backslash in front so it can't be read back as markup. Both readers of
 * that markup (the public StoryRichText and the editor's loader) must honour
 * the escape, or the backslashes show on the page and pile up with every save.
 *
 * Escaped characters are swapped for private-use code points while the
 * token pattern runs (they can't match a marker there) and swapped back in
 * whatever text the reader emits.
 */
const ESCAPABLE = '\\*_[]~=`+{';
const FIRST_PLACEHOLDER = 0xe000;
const PLACEHOLDERS = new RegExp(`[\\u${FIRST_PLACEHOLDER.toString(16)}-\\u${(FIRST_PLACEHOLDER + ESCAPABLE.length - 1).toString(16)}]`, 'g');

export function protectInlineEscapes(value: string): string {
  return value.replace(/\\([\\*_[\]~=`+{])/g, (_, char: string) => String.fromCharCode(FIRST_PLACEHOLDER + ESCAPABLE.indexOf(char)));
}

export function restoreInlineEscapes(value: string): string {
  return value.replace(PLACEHOLDERS, (placeholder) => ESCAPABLE[placeholder.charCodeAt(0) - FIRST_PLACEHOLDER]);
}
