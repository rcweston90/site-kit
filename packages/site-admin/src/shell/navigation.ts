import type { AdminConfig } from '../config.js';
import { adminPath } from '../config.js';
import { ADMIN_NAV_GROUPS, type AdminModule, type AdminNavEntry, type AdminNavGroupLabel } from '../modules/define.js';

export interface AdminNavItem {
  name: string;
  href: string;
  description: string;
  external?: boolean;
  /** Other paths whose pages belong to this item. */
  owns: readonly string[];
}

export interface AdminNavGroup {
  label: AdminNavGroupLabel;
  items: readonly AdminNavItem[];
}

/**
 * The admin information architecture, from the enabled modules and any custom
 * entries: five fixed groups (empty ones drop out), each item in its slot.
 * Child and edit routes inherit the closest parent item, so an editor still
 * names the collection it belongs to without a sidebar entry of its own.
 */
export function buildAdminNav(
  modules: readonly AdminModule[],
  config: Pick<AdminConfig, 'adminBase'>,
  custom: readonly AdminNavEntry[] = [],
): AdminNavGroup[] {
  const entries = [...modules.flatMap((module) => module.nav ?? []), ...custom];
  return ADMIN_NAV_GROUPS.map((label) => ({
    label,
    items: entries
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => entry.group === label)
      .sort((a, b) => (a.entry.order ?? 1000) - (b.entry.order ?? 1000) || a.index - b.index)
      .map(({ entry }) => ({
        name: entry.name,
        href: adminPath(config, entry.path),
        description: entry.description,
        external: entry.external,
        owns: (entry.owns ?? []).map((path) => adminPath(config, path)),
      })),
  })).filter((group) => group.items.length > 0);
}

const under = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

export function findCurrentAdminNavItem(groups: readonly AdminNavGroup[], pathname: string, adminBase: string): AdminNavItem | undefined {
  const items = groups.flatMap((group) => group.items).filter((item) => !item.external);
  const owner = items.find((item) => item.owns.some((path) => under(pathname, path)));
  if (owner) return owner;
  return items
    .filter((item) => (item.href === adminBase ? pathname === adminBase : under(pathname, item.href)))
    .sort((a, b) => b.href.length - a.href.length)[0];
}

export function findAdminNavGroup(groups: readonly AdminNavGroup[], item: AdminNavItem): AdminNavGroup | undefined {
  return groups.find((group) => group.items.includes(item));
}
