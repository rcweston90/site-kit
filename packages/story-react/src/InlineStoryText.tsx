import type { InlineAddProps, InlineTextProps } from './editor.js';

/**
 * An editable field in place: the editor's own inline text component, which
 * the reader receives through `editor.ui`. Readers never render this; they get
 * the plain value.
 */
export function InlineStoryText(props: InlineTextProps) {
  const { InlineText } = props.editor.ui;
  return <InlineText {...props} />;
}

/** Editor only: a quiet "+ Add …" line that appends an empty item in place. */
export function InlineStoryAdd(props: InlineAddProps) {
  const { InlineAdd } = props.editor.ui;
  return <InlineAdd {...props} />;
}
