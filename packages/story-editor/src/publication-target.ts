import type { Story } from '@rcweston/story-core';
import type { PublicationIssue } from '@rcweston/story-core';
import { parseIssuePath } from './publication-issue-labels.js';

export type PublicationTarget =
  | { kind: 'canvas'; selector?: string }
  | { kind: 'settings'; selector?: string; item?: number }
  | { kind: 'section' };

export function publicationTarget(story: Story, issue: Pick<PublicationIssue, 'path' | 'code'>): PublicationTarget {
  const segments = parseIssuePath(issue.path);
  const [root, section, third, index, ...rest] = segments;
  const block = root === 'chapters' && typeof section === 'number' && third === 'blocks' && typeof index === 'number'
    ? story.chapters[section]?.blocks[index] : undefined;
  const leaf = segments.at(-1);
  const mediaRoot = root === 'hero' || root === 'heroGraphic' || root === 'workPreview';
  const galleryItem = block?.type === 'gallery' && rest[0] === 'items' && typeof rest[1] === 'number' ? rest[1] : undefined;
  const mediaSettings = mediaRoot || block?.type === 'media' || galleryItem !== undefined;
  if (mediaSettings && issue.code !== 'empty-visible-content') {
    const name = issue.code === 'missing-media-alt' ? 'alt' : leaf === 'poster' ? 'poster' : leaf === 'href' ? 'link' : 'source';
    const prefix = root === 'workPreview' ? '[data-publication-work-card] ' : '';
    return { kind: 'settings', item: galleryItem, selector: `${prefix}[data-publication-input="${name}"]` };
  }
  if (root === 'related' && typeof section === 'number') return { kind: 'settings', selector: `[data-publication-related="${section}"]` };
  if (root === 'companyLogo') return { kind: 'settings' };
  if (root === 'title' || root === 'thesis' || root === 'disclosure' || root === 'company' || root === 'status' || root === 'period' || root === 'projectYear') {
    const labels = { title: 'Story title', thesis: 'Story thesis', disclosure: 'Story disclosure', company: 'Company', status: 'Story status', period: 'Story period', projectYear: 'Project year' };
    return { kind: 'canvas', selector: `[aria-label="${labels[root]}"]` };
  }
  if (root === 'facts' && typeof section === 'number' && (third === 'label' || third === 'value')) {
    return { kind: 'canvas', selector: `[aria-label="Fact ${section + 1} ${third}"]` };
  }
  if (root === 'decisions' && section === 'title') return { kind: 'canvas', selector: '[aria-label="Decisions section title"]' };
  if (root === 'decisions' && section === 'items' && typeof third === 'number' && (index === 'title' || index === 'detail')) {
    return { kind: 'canvas', selector: `[aria-label="Decision ${third + 1} ${index}"]` };
  }
  if (block?.type === 'gallery' && issue.code === 'empty-visible-content') {
    return { kind: 'settings', selector: '[data-publication-input="add-image"]' };
  }
  if (root === 'chapters' && third === 'title') return { kind: 'canvas', selector: 'h2' };
  if (block?.type === 'prose' && rest[0] === 'paragraphs') return { kind: 'canvas' };
  if (block?.type === 'subhead' && rest[0] === 'text') return { kind: 'canvas' };
  if (block?.type === 'note' && rest[0] === 'text') return { kind: 'canvas', selector: '[data-document-node="storyNote"],[data-plain-asset-placeholder],p' };
  if (block?.type === 'callout' && rest[0] === 'body') return { kind: 'canvas', selector: '[data-document-node="calloutBody"] p,[data-story-prose-surface] [contenteditable]' };
  if (root === 'chapters' && !block) return { kind: 'section' };
  if (block?.type === 'subhead' && !rest.length) return { kind: 'section' };
  return { kind: 'settings' };
}
