import Link from '@tiptap/extension-link';

/** A text link opens here unless its author or source explicitly sets _blank.
 * Reader and editor serialization only ever emit a safe target/rel pair. */
export const EditorLink = Link.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      target: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('target') === '_blank' ? '_blank' : null,
        renderHTML: (attributes: Record<string, unknown>) => attributes.target === '_blank' ? { target: '_blank', rel: 'noopener noreferrer' } : {},
      },
      rel: { default: null, rendered: false, parseHTML: () => null },
    };
  },
}).configure({ HTMLAttributes: { target: null, rel: null } });
