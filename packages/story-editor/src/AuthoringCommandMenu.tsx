import type { ComponentPropsWithRef, ComponentPropsWithoutRef, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { menuItemClass, menuLabelClass, menuSurfaceClass } from './menu.js';
import { commandMenuStyles as styles, chromeStyles } from './classes.js';

interface MenuItem {
  key: string;
  group: string;
}

interface RowContent {
  label: string;
  icon: LucideIcon;
  hint?: string;
  keys?: string;
}

type CommandRowProps = RowContent & (
  | ({ as: 'button' } & ComponentPropsWithoutRef<'button'>)
  | ({ as: 'div' } & ComponentPropsWithoutRef<'div'>)
);

export function AuthoringCommandRow({ as, icon: Icon, label, hint, keys, className, ...props }: CommandRowProps) {
  const content = <>
    <span aria-hidden="true" data-command-icon className={chromeStyles.authoringCommandMenuStack}>
      <Icon className={chromeStyles.authoringCommandMenuIcon} strokeWidth={1.75} />
    </span>
    <span className={chromeStyles.authoringCommandMenuTruncated}>
      {label}
      {hint && <span className={chromeStyles.authoringCommandMenuPart}>{hint}</span>}
    </span>
    {keys && <kbd className={chromeStyles.authoringCommandMenuKeys}>{keys}</kbd>}
  </>;
  const rowClass = `${menuItemClass} ${styles.row} ${className ?? ''}`;
  return as === 'button' ? <button type="button" {...props as ComponentPropsWithoutRef<'button'>} className={rowClass}>{content}</button>
    : <div {...props as ComponentPropsWithoutRef<'div'>} className={rowClass}>{content}</div>;
}

/** Presentation only. Each editor owns command matching, keyboard behavior,
 * accessibility role, caret anchor and selection. */
export function AuthoringCommandMenu<Item extends MenuItem>({
  items, renderItem, empty, footer, className, ...props
}: ComponentPropsWithRef<'div'> & {
  items: Item[];
  renderItem: (item: Item, index: number) => ReactNode;
  empty: ReactNode;
  footer: string;
}) {
  return <div {...props} data-authoring-command-menu="" className={`${menuSurfaceClass} ${styles.menu} ${className ?? ''}`}>
    {items.length === 0 && <p role="status" className={styles.empty}>{empty}</p>}
    {items.map((item, index) => <div key={item.key} role="presentation">
      {items[index - 1]?.group !== item.group && <div role="presentation" data-command-group className={menuLabelClass}>{item.group}</div>}
      {renderItem(item, index)}
    </div>)}
    <p aria-hidden="true" className={chromeStyles.authoringCommandMenuKeys2}>{footer}</p>
  </div>;
}
