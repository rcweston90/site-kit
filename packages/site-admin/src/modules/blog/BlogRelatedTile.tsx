'use client';

import { createContext, useContext } from 'react';
import { NodeViewWrapper, ReactNodeViewRenderer, type Editor, type NodeViewProps } from '@tiptap/react';
import { closeHistory } from '@tiptap/pm/history';
import { TextSelection } from '@tiptap/pm/state';
import { ArrowUpRight, Trash2 } from 'lucide-react';
import { relatedTileFromKey, relatedTileKey, relatedTileReference, type RelatedTileChoice } from '@rcweston/site-data/client';
import { BLOG_RELATED_NODE, BlogRelatedTileModel } from './blog-related-tile-schema.js';
/* Styles: blog.css. */
const styles = { editor: 'sa-blog-related', title: 'sa-blog-related-title', openMode: 'sa-blog-related-open', notice: 'sa-blog-related-notice' } as const;

export type RelatedTileCatalog = { entries: readonly RelatedTileChoice[]; status: 'loading' | 'error' | 'ready'; retry?: () => void };
export const RelatedTileCatalogContext = createContext<RelatedTileCatalog>({ entries: [], status: 'ready' });

function BlogRelatedTileView({ node, updateAttributes, deleteNode }: NodeViewProps) {
  const { entries, status, retry } = useContext(RelatedTileCatalogContext);
  const reference = relatedTileReference(node.attrs.kind, node.attrs.id);
  const value = reference ? relatedTileKey(reference) : '';
  const selected = entries.find(row => relatedTileKey(row) === value);
  const groups = [
    { label: 'Case studies', rows: entries.filter(row => row.kind === 'case-study') },
    { label: 'Posts', rows: entries.filter(row => row.kind !== 'case-study') },
  ];
  return <NodeViewWrapper as="aside" className={styles.editor} data-blog-related-editor="" contentEditable={false} aria-label="Related content">
    <div className={styles.title}><ArrowUpRight aria-hidden="true" size={16} /> Learn more</div>
    <select aria-label="Related content destination" value={value} disabled={status === 'loading'} onChange={event => {
      const reference = relatedTileFromKey(event.currentTarget.value);
      updateAttributes(reference ?? { kind: null, id: null });
    }}>
      <option value="">{status === 'loading' ? 'Loading published content…' : 'Choose published content'}</option>
      {value && !selected && <option value={value}>{status === 'ready' ? 'Destination no longer available' : 'Previously selected destination'}</option>}
      {groups.map(({ label, rows }) => rows.length > 0 && <optgroup key={label} label={label}>
        {rows.map(row => <option key={relatedTileKey(row)} value={relatedTileKey(row)}>{row.title}</option>)}
      </optgroup>)}
    </select>
    <button type="button" onClick={deleteNode} aria-label="Remove Learn more card"><Trash2 aria-hidden="true" size={16} /></button>
    <label className={styles.openMode}>Open link in
      <select aria-label="Open link in" value={node.attrs.newTab === true ? 'new' : 'same'} onChange={event => updateAttributes({ newTab: event.currentTarget.value === 'new' })}>
        <option value="same">Same tab</option>
        <option value="new">New tab</option>
      </select>
    </label>
    {status === 'error' && <div className={styles.notice} role="status">Couldn’t load published content. {retry && <button type="button" onClick={retry}>Try again</button>}</div>}
  </NodeViewWrapper>;
}

export const BlogRelatedTileNode = BlogRelatedTileModel.extend({
  addNodeView: () => ReactNodeViewRenderer(BlogRelatedTileView, {
    stopEvent: ({ event }) => event.target instanceof Element && Boolean(event.target.closest('button, select, option')),
  }),
});

export function insertBlogRelatedTile(editor: Editor) {
  const state = editor.state;
  const { $to } = state.selection;
  const tile = state.schema.nodes[BLOG_RELATED_NODE];
  if (!tile || $to.depth === 0) return false;
  const next = $to.after(1);
  const insertion = state.doc.resolve(next);
  if (!insertion.parent.canReplaceWith(insertion.index(), insertion.index(), tile)) return false;
  const transaction = closeHistory(state.tr).insert(next, tile.create());
  const end = next + tile.create().nodeSize;
  if (end === transaction.doc.content.size) {
    transaction.insert(end, state.schema.nodes.paragraph.create());
    transaction.setSelection(TextSelection.create(transaction.doc, end + 1));
  }
  editor.view.dispatch(transaction);
  requestAnimationFrame(() => {
    if (editor.isDestroyed) return;
    const element = editor.view.nodeDOM(next);
    if (element instanceof HTMLElement) element.querySelector('select')?.focus({ preventScroll: true });
  });
  return true;
}
