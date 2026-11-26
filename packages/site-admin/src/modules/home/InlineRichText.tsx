import { Fragment, type ReactNode } from 'react';
import { AdminLink as Link } from '../../router.js';

// One pass over both patterns so their order in the source is preserved.
const TOKEN = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*/g;

/**
 * Only schemes that can't execute script. An unrecognised href renders as
 * plain text rather than a link, so a pasted `javascript:` URL is inert.
 */
function safeHref(href: string): string | null {
  if (href.startsWith('/') || href.startsWith('#')) return href;
  if (/^(https?:|mailto:|tel:)/i.test(href)) return href;
  return null;
}

/**
 * Renders the small subset of inline markup used by admin-editable copy:
 * `[label](url)` links and `**bold**`. Everything else is literal text.
 *
 * This exists so body copy can live in the database as a plain string.
 */
export function InlineRichText({
  text,
  linkClassName = 'text-accent-primary font-bold hover:underline',
}: { text: string; linkClassName?: string }) {
  const nodes: ReactNode[] = [];
  let cursor = 0;

  for (const match of text.matchAll(TOKEN)) {
    const start = match.index ?? 0;
    if (start > cursor) nodes.push(text.slice(cursor, start));
    cursor = start + match[0].length;

    const [, label, rawHref, bold] = match;

    if (bold !== undefined) {
      nodes.push(<strong className="font-bold">{bold}</strong>);
      continue;
    }

    const href = safeHref(rawHref);
    if (!href) {
      nodes.push(match[0]);
    } else if (href.startsWith('/') || href.startsWith('#')) {
      nodes.push(
        <Link href={href} className={linkClassName}>
          {label}
        </Link>
      );
    } else {
      nodes.push(
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClassName}
        >
          {label}
        </a>
      );
    }
  }

  if (cursor < text.length) nodes.push(text.slice(cursor));

  return (
    <>
      {nodes.map((node, i) => (
        <Fragment key={i}>{node}</Fragment>
      ))}
    </>
  );
}

export default InlineRichText;
