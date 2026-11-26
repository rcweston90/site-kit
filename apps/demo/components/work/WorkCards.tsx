import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import type { WorkCard } from '@/lib/published';
import styles from './Work.module.css';

/** A study's cover: its hero picture, the same one the story opens with. */
export function WorkCover({ card, className }: { card: WorkCard; className?: string }) {
  const cover = card.cover;
  if (!cover) return null;
  const src = cover.kind === 'video' ? cover.poster : cover.src;
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      className={className}
      style={cover.objectPosition ? { objectPosition: cover.objectPosition } : undefined}
    />
  );
}

/** The archive grid: one card per published story, in the saved order. */
export function WorkGrid({ cards }: { cards: WorkCard[] }) {
  return (
    <div className={styles.grid}>
      {cards.map((card) => (
        <Link key={card.slug} href={`/stories/${card.slug}`} className={styles.tile} aria-label={`${card.title} — view case study`} data-work-card="">
          <div className={styles.artwork}>
            <WorkCover card={card} className={styles.cover} />
          </div>
          <div className={styles.copy}>
            <h3 className={styles.title}>{card.title}</h3>
            <div className={styles.identity}>
              <span className={styles.meta}>
                {card.company && <span className={styles.org}>{card.company}</span>}
                {card.year && <span className={styles.category}>{card.year}</span>}
              </span>
              <ArrowUpRight className={styles.status} size={18} strokeWidth={1.75} aria-hidden="true" />
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
