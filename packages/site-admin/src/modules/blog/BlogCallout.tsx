'use client';

import { useId } from 'react';
import { Node, NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type Editor, type NodeViewProps } from '@tiptap/react';
import { closeHistory } from '@tiptap/pm/history';
import { BLOG_CALLOUT_TONES, blogCalloutTone } from '@rcweston/site-data/client';

const name = 'blogCallout';

function BlogCalloutView({ node, updateAttributes }: NodeViewProps) {
  const tone = blogCalloutTone(node.attrs.tone);
  const id = useId();
  return <NodeViewWrapper as="aside" data-blog-callout={tone} aria-label={BLOG_CALLOUT_TONES[tone]}>
    <div className="blog-callout-controls" contentEditable={false}>
      <fieldset>
        <legend>Callout tone</legend>
        <div className="blog-callout-options">
          {Object.entries(BLOG_CALLOUT_TONES).map(([value, label]) => <label key={value}>
            <input type="radio" name={id} value={value} checked={tone === value}
              onChange={() => updateAttributes({ tone: blogCalloutTone(value) })} />
            <span>{label}</span>
          </label>)}
        </div>
      </fieldset>
    </div>
    <NodeViewContent className="blog-callout-body" />
  </NodeViewWrapper>;
}

export const BlogCalloutNode = Node.create({
  name,
  group: 'block',
  content: '(paragraph|heading|bulletList|orderedList|blockquote|codeBlock)+',
  defining: true,
  addAttributes: () => ({ tone: { default: 'neutral', rendered: false } }),
  parseHTML: () => [{
    tag: 'aside[data-blog-callout]',
    getAttrs: element => ({ tone: blogCalloutTone(element.getAttribute('data-blog-callout')) }),
  }],
  renderHTML({ node }) {
    const tone = blogCalloutTone(node.attrs.tone);
    return ['aside', { 'data-blog-callout': tone, 'aria-label': BLOG_CALLOUT_TONES[tone] }, 0];
  },
  addNodeView: () => ReactNodeViewRenderer(BlogCalloutView),
  addKeyboardShortcuts() {
    return {
      Enter: () => {
        const { $from, empty } = this.editor.state.selection;
        if (!empty || $from.depth !== 2 || $from.parent.type.name !== 'paragraph' || $from.parent.content.size
          || $from.node(1).type.name !== name || $from.index(1) !== $from.node(1).childCount - 1) return false;
        return this.editor.commands.lift(name);
      },
    };
  },
});

export function canInsertBlogCallout(editor: Editor) {
  const { $from, $to } = editor.state.selection;
  return $from.depth === 1 && $to.depth === 1 && $from.parent === $to.parent
    && $from.parent.type.name === 'paragraph' && editor.can().wrapIn(name);
}

/** Wrap the active top-level text line, without replacing selected words or marks. */
export function insertBlogCallout(editor: Editor) {
  if (!canInsertBlogCallout(editor)) return false;
  const inserted = editor.chain().command(({ tr }) => { closeHistory(tr); return true; }).wrapIn(name).run();
  if (inserted) editor.commands.focus(undefined, { scrollIntoView: false });
  return inserted;
}
