import { Extension } from '@tiptap/core';
import { safeInlineHref } from '@rcweston/story-core';

/** The link settings the prose editor hands StarterKit's bundled link mark.
 *  A typed or pasted https:// address becomes a link; a bare domain stays
 *  text. Only the links a reader can follow safely are allowed at all. */
export const EDITOR_LINK_OPTIONS = {
  openOnClick: false,
  autolink: true,
  defaultProtocol: 'https',
  isAllowedUri: (url: string) => Boolean(safeInlineHref(url)),
  shouldAutoLink: (url: string) => /^https?:\/\//i.test(url),
  HTMLAttributes: { target: null, rel: null },
} as const;

/** A text link opens here unless its author or source explicitly sets _blank.
 *  Reader and editor serialization only ever emit a safe target/rel pair. */
export const EditorLinkTarget = Extension.create({
  name: 'storyLinkTarget',
  addGlobalAttributes() {
    return [{
      types: ['link'],
      attributes: {
        target: {
          default: null,
          parseHTML: (element: HTMLElement) => element.getAttribute('target') === '_blank' ? '_blank' : null,
          renderHTML: (attributes: Record<string, unknown>) => attributes.target === '_blank' ? { target: '_blank', rel: 'noopener noreferrer' } : {},
        },
        rel: { default: null, rendered: false, parseHTML: () => null },
      },
    }];
  },
});
