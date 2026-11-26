import { Fragment, type ReactNode } from 'react';
import Link from 'next/link';

// One pass over both patterns so their order in the source is preserved.
const TOKEN = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*/g;

/** Only schemes that can't run script; anything else stays plain text. */
function safeHref(href: string): string | null {
  if (href.startsWith('/') || href.startsWith('#')) return href;
  if (/^(https?:|mailto:|tel:)/i.test(href)) return href;
  return null;
}

/**
 * The markup admin-edited copy may carry (Admin → Home, Admin → Community):
 * `[label](url)` links and `**bold**`. Everything else is literal text. The
 * same rules as the admin's preview, in the site's own markup.
 */
export function InlineRichText({ text, linkClassName }: { text: string; linkClassName?: string }) {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const match of text.matchAll(TOKEN)) {
    const start = match.index ?? 0;
    if (start > cursor) nodes.push(text.slice(cursor, start));
    cursor = start + match[0].length;
    const [, label, rawHref, bold] = match;
    if (bold !== undefined) {
      nodes.push(<strong>{bold}</strong>);
      continue;
    }
    const href = safeHref(rawHref);
    if (!href) nodes.push(match[0]);
    else if (href.startsWith('/') || href.startsWith('#')) nodes.push(<Link href={href} className={linkClassName}>{label}</Link>);
    else nodes.push(<a href={href} target="_blank" rel="noopener noreferrer" className={linkClassName}>{label}</a>);
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return <>{nodes.map((node, i) => <Fragment key={i}>{node}</Fragment>)}</>;
}
