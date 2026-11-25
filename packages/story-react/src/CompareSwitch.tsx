import { useStoryEnvironment } from './context.js';
import { compareStyles as styles } from './classes.js';

export interface CompareItem {
  key: string;
  label: string;
  href: string;
}

/**
 * A small switch for comparing a story with another version of it, such as
 * the page it replaced (Original · New). The host decides who sees it and
 * where each version lives.
 */
export function CompareSwitch({ items, current, label = 'Compare versions' }: { items: readonly CompareItem[]; current: string; label?: string }) {
  const { renderLink } = useStoryEnvironment();
  return (
    <nav aria-label={label} className={styles.switch}>
      {items.map((item) =>
        item.key === current ? (
          <span key={item.key} className={styles.item} aria-current="page">
            {item.label}
          </span>
        ) : (
          <span key={item.key} className={styles.itemSlot}>{renderLink({ href: item.href, className: styles.item, children: item.label })}</span>
        ),
      )}
    </nav>
  );
}
