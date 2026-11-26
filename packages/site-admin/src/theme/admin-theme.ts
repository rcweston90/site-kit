export const ADMIN_THEME_STORAGE_KEY = 'admin-theme';

export type AdminThemePreference = 'light' | 'dark' | 'system';
export type ResolvedAdminTheme = Exclude<AdminThemePreference, 'system'>;

export const ADMIN_THEME_OPTIONS: ReadonlyArray<{
  value: AdminThemePreference;
  label: string;
}> = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

export function isAdminThemePreference(value: unknown): value is AdminThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function resolveAdminTheme(
  preference: AdminThemePreference,
  systemPrefersDark: boolean,
): ResolvedAdminTheme {
  if (preference === 'system') return systemPrefersDark ? 'dark' : 'light';
  return preference;
}
