import { Node } from '@tiptap/react';
import { BLOG_RELATED_TILE, relatedTileMarkerAttrs, relatedTileReference } from '@rcweston/site-data/client';

export const BLOG_RELATED_NODE = 'blogRelatedTile';
export const BlogRelatedTileModel = Node.create({
  name: BLOG_RELATED_NODE,
  group: 'block',
  atom: true,
  addAttributes: () => ({ kind: { default: null, rendered: false }, id: { default: null, rendered: false }, newTab: { default: false, rendered: false } }),
  parseHTML: () => [{ tag: BLOG_RELATED_TILE, getAttrs: element => ({ ...relatedTileReference(element.getAttribute('data-kind'), element.getAttribute('data-id')), newTab: element.getAttribute('data-open') === 'new-tab' }) }],
  renderHTML({ node }) {
    const ref = relatedTileReference(node.attrs.kind, node.attrs.id);
    return [BLOG_RELATED_TILE, ref ? relatedTileMarkerAttrs(ref, node.attrs.newTab === true) : {}];
  },
});
