'use client';

import { NodeViewWrapper, ReactNodeViewRenderer, type Editor, type NodeViewProps } from '@tiptap/react';
import { closeHistory } from '@tiptap/pm/history';
import { NodeSelection } from '@tiptap/pm/state';
import { CmsCtaEditor } from '../../components/CmsCtaEditor.js';
import { BLOG_CTA_NODE, BlogCtaModel } from './blog-cta-schema.js';
import { blankBlogLine } from './blog-caret-insert.js';

function BlogCtaView({ node, updateAttributes, deleteNode }: NodeViewProps) {
  return <NodeViewWrapper as="div" data-blog-cta-editor="" className="my-minor" contentEditable={false}>
    <CmsCtaEditor value={{ label: String(node.attrs.label ?? ''), href: String(node.attrs.href ?? ''), newTab: node.attrs.newTab === true }} onSave={updateAttributes} onRemove={deleteNode} />
  </NodeViewWrapper>;
}

export const BlogCta = BlogCtaModel.extend({
  addNodeView: () => ReactNodeViewRenderer(BlogCtaView, {
    stopEvent: ({ event }) => event.target instanceof Element && event.target.closest('[data-blog-cta-editor]') !== null,
  }),
});

export function insertBlogCta(editor: Editor) {
  const { selection, schema } = editor.state;
  const { $from } = selection;
  if ($from.depth !== 1 || !selection.empty || $from.parent.type.name !== 'paragraph') return false;
  const at = blankBlogLine(editor.state) === null ? $from.after(1) : $from.before(1);
  const tr = closeHistory(editor.state.tr).insert(at, schema.nodes[BLOG_CTA_NODE].create());
  editor.view.dispatch(tr.setSelection(NodeSelection.create(tr.doc, at)).scrollIntoView());
  return true;
}
