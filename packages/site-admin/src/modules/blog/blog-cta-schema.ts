import { Node } from '@tiptap/core';
import { completedCmsCta } from '@rcweston/site-data/client';

export const BLOG_CTA_NODE = 'blogCta';

export const BlogCtaModel = Node.create({
  name: BLOG_CTA_NODE,
  group: 'block',
  atom: true,
  selectable: true,
  addAttributes: () => ({ label: { default: '', rendered: false }, href: { default: '', rendered: false }, newTab: { default: false, rendered: false } }),
  parseHTML: () => [{
    tag: 'p[data-blog-cta]',
    priority: 100,
    getAttrs: element => {
      const link = element.querySelector(':scope > a[data-cms-cta]');
      return completedCmsCta(link?.textContent, link?.getAttribute('href'), link?.getAttribute('target') === '_blank') ?? {};
    },
  }],
  renderHTML: ({ node }) => {
    const cta = completedCmsCta(node.attrs.label, node.attrs.href, node.attrs.newTab);
    return cta
      ? ['p', { 'data-blog-cta': '' }, ['a', { href: cta.href, 'data-cms-cta': '', ...(cta.newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {}) }, cta.label]]
      : ['p', { 'data-blog-cta': '' }];
  },
});
