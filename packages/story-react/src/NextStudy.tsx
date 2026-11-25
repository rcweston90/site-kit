import type { StoryTeaser } from '@rcweston/story-core';
import { useStoryEnvironment } from './context.js';
import { nextStyles as styles } from './classes.js';

/**
 * The way out is the way on: the next story as a card, with its summary,
 * and a link back to the index when the host has one.
 */
export function NextStudy({ next, href, indexLink }: {
  next: StoryTeaser;
  /** Where the card links. */
  href: string;
  /** The way back to every story, e.g. `{ href: '/stories', label: 'All stories' }`. */
  indexLink?: { href: string; label: string };
}) {
  const { renderLink } = useStoryEnvironment();
  return (
    <nav aria-label="Next story" className={styles.next}>
      <div className={styles.head}>
        <h2 className={styles.heading}>Next</h2>
        {indexLink && renderLink({ href: indexLink.href, className: styles.all, children: indexLink.label })}
      </div>
      <article className={styles.card}>
        {next.company && <p className={styles.company}>{next.company}</p>}
        <h3 className={styles.title}>{next.title}</h3>
        {next.summary && <p className={styles.summary}>{next.summary}</p>}
        {/* The link covers the card rather than wrapping it. */}
        {renderLink({ href, className: styles.cardLink, 'aria-label': `${next.title}, read next`, children: null })}
      </article>
    </nav>
  );
}
