import type { ReactNode } from 'react';
import { parseInlineMarkup, type InlineNode } from '@rcweston/story-core';

/** Text with every stored newline as a line break. A soft return is one
 *  newline and a hard return in a plain field two, so the reader shows the
 *  line, or the blank line, the editor's pre-wrap field shows. */
function withBreaks(text: string, key: string | number): ReactNode[] {
  return text.split('\n').flatMap((line, index) => (index === 0 ? [line] : [<br key={`${key}-br-${index}`} />, line]));
}

/** A plain multiline field as typed: its line breaks kept, no markup read. */
export function StoryLines({ value }: { value?: string }) {
  return <>{withBreaks(value ?? '', 'line')}</>;
}

function renderNodes(nodes: InlineNode[], key: string): ReactNode[] {
  return nodes.flatMap((node, index): ReactNode[] => {
    const at = `${key}-${index}`;
    if (node.type === 'text') return withBreaks(node.text, at);
    // <mark> and <code> are styled from the story root (styles.css).
    if (node.type === 'code') return [<code key={at}>{node.text}</code>];
    if (node.type === 'link') {
      return [<a key={at} data-story-prose-link href={node.href} target={node.newTab ? '_blank' : undefined} rel={node.newTab || node.href.startsWith('http') ? 'noopener noreferrer' : undefined}>{renderNodes(node.children, at)}</a>];
    }
    const children = renderNodes(node.children, at);
    if (node.mark === 'bold') return [<strong key={at}>{children}</strong>];
    if (node.mark === 'italic') return [<em key={at}>{children}</em>];
    if (node.mark === 'underline') return [<u key={at}>{children}</u>];
    if (node.mark === 'strike') return [<s key={at}>{children}</s>];
    return [<mark key={at} data-color={node.color}>{children}</mark>];
  });
}

/** A deliberately small, safe inline-markup renderer (inline-markup.ts).
 * Content remains plain JSON strings and React escapes every text node; no
 * HTML is accepted. */
export function StoryRichText({ value }: { value: string }) {
  return <>{renderNodes(parseInlineMarkup(value), 'rich')}</>;
}

/**
 * One paragraph of rich text as the editor shows it. A hard return makes a
 * paragraph, so a blank one keeps its line; a soft return is a line break,
 * and one at the very end opens a line of its own, which a browser only
 * draws after a second <br> (ProseMirror adds the same one).
 */
export function StoryRichParagraph({ value }: { value: string }) {
  if (!value.trim()) return <br />;
  return <><StoryRichText value={value} />{/\n\s*$/.test(value) && <br />}</>;
}
