import { Extension, mergeAttributes, type Editor, type AnyExtension } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { EditorLink } from './editor-link.js';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { StoryHighlight, StoryListBackwardDelete, StoryParagraphStyle, StorySlash, StoryTypography, changeListIndent, enterInStoryLargeText, listToggleState, selectedListKind, setStoryLarge, toggleStoryList } from '@rcweston/story-editor';
import { safeBlogUrl } from '@rcweston/site-data/client';
import { BlogCtaModel } from './blog-cta-schema.js';
import { BlogRelatedTileModel } from './blog-related-tile-schema.js';
import { BlogCalloutNode } from './BlogCallout.js';

/** Block images cannot carry an inline Link mark reliably. Preserve the
 * containing image link as an image attribute across HTML load/save cycles. */
const BlogImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      href: {
        default: null,
        rendered: false,
        parseHTML: (element: HTMLElement) => safeBlogUrl(element.closest('a[href]')?.getAttribute('href') ?? '') ?? null,
      },
      linkTarget: {
        default: null,
        rendered: false,
        parseHTML: (element: HTMLElement) => element.closest('a[href]')?.getAttribute('target') === '_blank' ? '_blank' : null,
      },
    };
  },
  renderHTML({ node, HTMLAttributes }) {
    const image = ['img', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes)] as const;
    const href = safeBlogUrl(String(node.attrs.href ?? ''));
    return href ? ['a', { href, ...(node.attrs.linkTarget === '_blank' ? { target: '_blank' } : {}), rel: 'noopener noreferrer' }, image] : image;
  },
});

/** Blog HTML admits media, quotes, code and nested lists. Reusing the case-study
 * prose schema itself would silently discard those existing nodes on save. */
export function blogEditorExtensions(codeBlock?: AnyExtension, relatedNode: AnyExtension = BlogRelatedTileModel, ctaNode: AnyExtension = BlogCtaModel) {
  return [
    StarterKit.configure({ codeBlock: codeBlock ? false : {}, link: false, heading: { levels: [1, 2, 3, 4, 5, 6] } }),
    EditorLink.configure({ openOnClick: false, isAllowedUri: (url) => Boolean(safeBlogUrl(url)) }),
    BlogImage,
    BlogCalloutNode,
    ctaNode,
    relatedNode,
    Placeholder.configure({ placeholder: 'Write, or type / to insert' }),
    ...(codeBlock ? [codeBlock] : []),
    StorySlash,
    ...blogTextExtensions(),
  ];
}

/** Shared typography and list behavior. */
export function blogTextExtensions() {
  return [
    StoryParagraphStyle,
    StoryHighlight,
    StoryTypography,
    StoryListBackwardDelete,
    Extension.create({
      name: 'blogTextKeys',
      priority: 1000,
      addKeyboardShortcuts() {
        return {
          Enter: () => enterInStoryLargeText(this.editor),
          Tab: () => changeListIndent(this.editor, 1),
          'Shift-Tab': () => changeListIndent(this.editor, -1),
          'Mod-Alt-0': () => setBlogTextStyle(this.editor, 'text'),
          'Mod-Alt-1': () => setBlogTextStyle(this.editor, 'large'),
          'Mod-Shift-8': () => { toggleStoryList(this.editor, 'bulletList'); return true; },
          'Mod-Shift-7': () => { toggleStoryList(this.editor, 'orderedList'); return true; },
          'Mod-\\': () => this.editor.chain().focus().unsetAllMarks().run(),
        };
      },
    }),
  ];
}

export function blogTextStyle(editor: Editor): string {
  if (editor.isActive('codeBlock')) return 'codeBlock';
  if (editor.isActive('blockquote')) return 'quote';
  const list = selectedListKind(editor.state);
  if (list) return list === 'bulletList' ? 'bullets' : 'numbered';
  if (editor.isActive('heading')) return `heading${editor.getAttributes('heading').level}`;
  return editor.isActive('paragraph', { large: true }) ? 'large' : 'text';
}

/** Keep the blog's nested lists and code intact, using its own schema's commands. */
export function setBlogTextStyle(editor: Editor, style: string): boolean {
  if (style === 'bullets' || style === 'numbered') {
    const type = style === 'bullets' ? 'bulletList' : 'orderedList';
    const current = listToggleState(editor.state);
    return current.enabled && (current.kind === type || toggleStoryList(editor, type));
  }
  if (style === 'quote') return editor.isActive('blockquote') || editor.chain().focus().toggleBlockquote().run();
  if (style === 'codeBlock') return editor.chain().focus().setCodeBlock().run();
  if ((style === 'text' || style === 'large') && (selectedListKind(editor.state) || (editor.isActive('blogCallout') && editor.isActive('paragraph')))) return setStoryLarge(editor, style === 'large');
  const chain = editor.chain().focus();
  if (!editor.isActive('blogCallout')) chain.clearNodes();
  if (/^heading[1-6]$/.test(style)) return chain.setHeading({ level: Number(style.slice(-1)) as 1 | 2 | 3 | 4 | 5 | 6 }).run();
  return chain.setParagraph().updateAttributes('paragraph', { large: style === 'large' }).run();
}
