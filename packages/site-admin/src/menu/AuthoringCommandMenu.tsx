import type { ComponentPropsWithRef, ComponentPropsWithoutRef, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { adminMenuItemClass, adminMenuLabelClass, adminMenuSurfaceClass } from './admin-menu.js';

// The module CSS lives in theme.css as .sa-command-menu, -row and -empty.
const styles = { menu: 'sa-command-menu', row: 'sa-command-row', empty: 'sa-command-empty' };

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
    <span aria-hidden="true" data-command-icon className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-default text-foreground-muted">
      <Icon className="h-4 w-4" strokeWidth={1.75} />
    </span>
    <span className="min-w-0 flex-1 truncate">
      {label}
      {hint && <span className="ml-2 text-foreground-muted">{hint}</span>}
    </span>
    {keys && <kbd className="shrink-0 font-mono text-xs text-foreground-muted">{keys}</kbd>}
  </>;
  const rowClass = `${adminMenuItemClass} ${styles.row} ${className ?? ''}`;
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
  return <div {...props} data-authoring-command-menu="" className={`${adminMenuSurfaceClass} ${styles.menu} ${className ?? ''}`}>
    {items.length === 0 && <p role="status" className={styles.empty}>{empty}</p>}
    {items.map((item, index) => <div key={item.key} role="presentation">
      {items[index - 1]?.group !== item.group && <div role="presentation" data-command-group className={adminMenuLabelClass}>{item.group}</div>}
      {renderItem(item, index)}
    </div>)}
    <p aria-hidden="true" className="m-0 border-t border-default px-3 pt-half font-mono text-xs leading-baseline text-foreground-muted">{footer}</p>
  </div>;
}
