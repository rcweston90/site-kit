import { Moon, Sun } from 'lucide-react';

import { chromeStyles } from './classes.js';
export type EditorTheme = 'light' | 'dark';

const OPTIONS: ReadonlyArray<{
  value: EditorTheme;
  label: string;
  Icon: typeof Sun;
}> = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
];

/**
 * Light and dark for the writing surface. The host owns the preference: the
 * toggle shows `theme` and reports a choice through `onChange`. No story field
 * or reader preference is involved, and the editor never reloads.
 */
export default function EditorThemeToggle({ compact = false, theme, onChange }: { compact?: boolean; theme: EditorTheme; onChange: (theme: EditorTheme) => void }) {
  const resolvedTheme = theme;
  const setPreference = onChange;

  return (
    <div
      role="group"
      aria-label="Editor color theme"
      className={chromeStyles.themeToggleEditorColorTheme}
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const selected = resolvedTheme === value;
        return (
          <button
            key={value}
            type="button"
            aria-label={`${label} editor theme`}
            aria-pressed={selected}
            title={`${label} editor theme`}
            onClick={() => setPreference(value)}
            className={`${chromeStyles.themeToggleRow} ${selected ? chromeStyles.themeToggleButtonOn : chromeStyles.themeToggleButtonOff}`}
          >
            <Icon aria-hidden="true" className={chromeStyles.themeToggleIcon} strokeWidth={1.75} />
            {!compact && <span className={chromeStyles.themeTogglePart}>{label}</span>}
          </button>
        );
      })}
    </div>
  );
}
