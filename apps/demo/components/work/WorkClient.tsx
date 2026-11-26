import type { WorkCard } from '@/lib/published';
import { WorkGrid } from './WorkCards';
import { WorkResourceLinks } from './WorkResourceLinks';
import styles from './Work.module.css';

/** Work: the headline, then every case study switched on for Work, in the order set in the admin. */
export function WorkClient({ cards, resumeHref = null }: { cards: WorkCard[]; resumeHref?: string | null }) {
  return (
    <div className={styles.page} data-work-list="">
      <section className={styles.intro} aria-labelledby="work-title">
        <h1 id="work-title">
          <span>Questions asked,</span>
          <span>answers drawn,</span>
          <span>habits changed</span>
        </h1>
        <p>Case studies from research tools, transit and health care. Each one starts with what people were trying to do.</p>
      </section>
      <hr className={styles.divider} />
      <section aria-labelledby="work-archive-heading">
        <div className={styles.switchRow}>
          <h2 id="work-archive-heading" className={styles.heading}>Projects</h2>
          {cards.length > 0 && <span className={styles.count}>{cards.length} {cards.length === 1 ? 'study' : 'studies'}</span>}
          <WorkResourceLinks resumeHref={resumeHref} />
        </div>
        {cards.length > 0 ? (
          <WorkGrid cards={cards} />
        ) : (
          <div className={styles.empty} role="status">
            <p className={styles.emptyLabel}>Nothing here yet</p>
            <p>Case studies show up here once they’re published and switched on for Work.</p>
          </div>
        )}
      </section>
    </div>
  );
}
