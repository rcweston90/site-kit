import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import type { PrototypeCard, WorkCard } from '@/lib/published';
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
        <Link key={card.slug} href={card.href ?? `/stories/${card.slug}`} className={styles.tile} aria-label={`${card.title} — ${card.href ? 'open' : 'view case study'}`} data-work-card="">
          <div className={styles.artwork}>
            <WorkCover card={card} className={styles.cover} />
          </div>
          <div className={styles.copy}>
            <h3 className={styles.title}>{card.title}</h3>
            <div className={styles.identity}>
              <span className={styles.meta}>
                {/* The name is in the label beside it; the mark is decoration. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {card.logo && <img src={card.logo} alt="" width={96} height={24} className={styles.logo} data-company-logo="" />}
                {card.company && <span className={styles.org}>{card.company}</span>}
                {card.label && <span className={styles.category}>{card.label}</span>}
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

/** Prototypes: cards that open the prototype itself, in a new tab. */
export function PrototypeGrid({ cards }: { cards: PrototypeCard[] }) {
  return (
    <div className={styles.grid}>
      {cards.map((card) => (
        <a key={card.slug} href={card.url} target="_blank" rel="noopener noreferrer" className={styles.tile} aria-label={`${card.title} — open prototype (new tab)`} data-prototype-card="">
          <div className={styles.copy}>
            <h3 className={styles.title}>{card.title}</h3>
            {card.description && <p className={styles.summary}>{card.description}</p>}
            <div className={styles.identity}>
              <span className={styles.meta}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {card.logo && <img src={card.logo} alt="" width={96} height={24} className={styles.logo} data-company-logo="" />}
                {card.company && <span className={styles.org}>{card.company}</span>}
                {card.year && <span className={styles.category}>{card.year}</span>}
              </span>
              <ArrowUpRight className={styles.status} size={18} strokeWidth={1.75} aria-hidden="true" />
            </div>
          </div>
        </a>
      ))}
    </div>
  );
}
