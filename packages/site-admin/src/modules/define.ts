import type { ComponentType } from 'react';
import type { AdminConfig } from '../config.js';

/** The sidebar's groups, in order. A module's items land in one of them. */
export const ADMIN_NAV_GROUPS = ['Overview', 'Publishing', 'Portfolio', 'Site Settings', 'Tools'] as const;
export type AdminNavGroupLabel = (typeof ADMIN_NAV_GROUPS)[number];

export interface AdminNavEntry {
  group: AdminNavGroupLabel;
  name: string;
  /** Relative to the admin (`''` is the dashboard, `stories` is `/admin/stories`), or absolute (`/studio`, `https://…`). */
  path: string;
  /** The link's title, and what the dashboard says about it. */
  description: string;
  /** Opens outside the admin (shows ↗). */
  external?: boolean;
  /** Its place in the group, low first. See MODULES.md for the slots the original uses. */
  order?: number;
  /** Other admin-relative paths that belong to this item, e.g. an editor under a different URL. */
  owns?: readonly string[];
}

/** What a module gives an admin screen to fetch with. */
export interface AdminContextForModule {
  config: AdminConfig;
  /** `GET` a handler as JSON; null when it fails. */
  read: <T>(url: string) => Promise<T | null>;
}

export interface AdminStat {
  /** "Work", "Posts". */
  label: string;
  path: string;
  order?: number;
  count: (context: AdminContextForModule) => Promise<number>;
}

export interface AdminQuickAction {
  label: string;
  path: string;
  order?: number;
}

export interface AdminDashboardSection {
  id: string;
  order?: number;
  Component: ComponentType;
}

/**
 * One admin module: what it adds to the sidebar and the dashboard. Its
 * screens are ordinary components the host mounts at its routes (see
 * MODULES.md); the module only says where they are.
 */
export interface AdminModule {
  id: string;
  title: string;
  nav?: readonly AdminNavEntry[];
  stats?: readonly AdminStat[];
  quickActions?: readonly AdminQuickAction[];
  dashboard?: readonly AdminDashboardSection[];
}

export function defineAdminModule<const M extends AdminModule>(module: M): M {
  return module;
}
