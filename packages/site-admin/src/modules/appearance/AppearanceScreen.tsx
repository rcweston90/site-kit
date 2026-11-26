'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  APPEARANCE_THEMES,
  APPEARANCE_THEME_LABELS,
  siteDataPaths,
  type AppearanceSettings,
  type AppearanceState,
} from '@rcweston/site-data/client';
import { SaveStatus, useListSave } from '@rcweston/save-kit';
import { AdminSelect } from '../../menu/index.js';
import { adminRead, adminRequest } from '../../request.js';
import { useAdminConfig } from '../../config.js';

const cardClass = 'flex items-center justify-between gap-4 p-4 rounded-md bg-card-bg border border-foreground-muted/20';

function Card({ title, detail, children }: { title: string; detail: string; children: ReactNode }) {
  return (
    <div className={cardClass}>
      <div className="min-w-0">
        <div className="font-mono text-sm font-semibold text-foreground uppercase tracking-wider">
          {title}
        </div>
        <div className="font-mono text-xs text-foreground-muted mt-1">
          {detail}
        </div>
      </div>
      {children}
    </div>
  );
}

/**
 * How the public site looks for every visitor: sunny mode, the theme a first
 * visit starts on, the accent and the typefaces. Each change saves at once.
 */
export function AppearanceScreen() {
  const config = useAdminConfig();
  const url = `${config.siteApi}${siteDataPaths.appearance()}`;
  const [state, setState] = useState<AppearanceState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { status } = useListSave();
  const saving = status.pending.length > 0;

  const load = useCallback(async () => {
    const data = await adminRead<AppearanceState | null>(url, null);
    if (data) {
      setState(data);
      setError(null);
    } else {
      setError('Failed to load appearance settings');
    }
  }, [url]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (change: Partial<AppearanceSettings>, success: string) => {
    if (!state) return;
    const before = state;
    const settings = { ...state.settings, ...change };
    setState({ ...state, settings });
    const result = await status.run(() => adminRequest<AppearanceState>(url, {
      method: 'PUT',
      body: JSON.stringify({ settings, expectedVersion: before.version }),
    }), {
      key: 'appearance',
      success,
      onSaved: (saved) => setState(saved),
    });
    // Not saved (changed somewhere else first, or no connection): show what's saved now.
    if (!result.ok) {
      setState(before);
      void load();
    }
  };

  if (!state) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="mb-12 pb-6 border-b-2 border-foreground-muted/30">
          <h1 className="font-mono text-3xl md:text-4xl font-bold text-foreground uppercase tracking-wide">
            Appearance
          </h1>
        </div>
        {error ? (
          <div className="flex items-center gap-4">
            <p className="text-red-500 font-mono text-sm">{error}</p>
            <button
              onClick={() => void load()}
              className="px-4 py-2 rounded-md border-2 border-foreground-muted text-foreground hover:border-foreground transition-colors font-mono text-xs uppercase tracking-wider"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="text-foreground-muted font-mono text-sm uppercase tracking-wider">Loading...</div>
        )}
      </div>
    );
  }

  const { settings, options } = state;
  const sunnyOn = settings.sunny;

  return (
    <div>
      <div className="max-w-4xl mx-auto">
        <div className="mb-12 pb-6 border-b-2 border-foreground-muted/30">
          <h1 className="font-mono text-3xl md:text-4xl font-bold text-foreground uppercase tracking-wide">
            Appearance
          </h1>
        </div>

        <SaveStatus status={status} className="mb-minor" />

        <div className="flex flex-col gap-3 max-w-md">
          <Card title="Sunny mode" detail="Drifting cloud shadows across the site">
            <button
              type="button"
              role="switch"
              aria-checked={sunnyOn}
              aria-label="Sunny mode"
              disabled={saving}
              onClick={() => void save({ sunny: !sunnyOn }, sunnyOn ? 'Sunny mode is off' : 'Sunny mode is on')}
              className={`relative flex-shrink-0 w-12 h-7 rounded-full transition-colors ${
                sunnyOn ? 'bg-accent-primary' : 'bg-foreground-muted/30'
              }`}
            >
              <span
                className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white transition-transform ${
                  sunnyOn ? 'translate-x-5' : ''
                }`}
              />
            </button>
          </Card>

          <Card title="Default theme" detail="What a first visit shows; a visitor’s own pick wins">
            <div role="radiogroup" aria-label="Default theme" className="flex flex-shrink-0 rounded-md border border-foreground-muted/30 overflow-hidden">
              {APPEARANCE_THEMES.map((theme) => {
                const on = settings.defaultTheme === theme;
                return (
                  <button
                    key={theme}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    disabled={saving}
                    onClick={() => !on && void save({ defaultTheme: theme }, `New visitors see ${APPEARANCE_THEME_LABELS[theme]}`)}
                    className={`px-2.5 py-1.5 font-mono text-xs uppercase tracking-wider transition-colors ${
                      on ? 'bg-foreground text-background' : 'text-foreground-muted hover:text-foreground'
                    }`}
                  >
                    {APPEARANCE_THEME_LABELS[theme]}
                  </button>
                );
              })}
            </div>
          </Card>

          <Card title="Accent" detail="Links, buttons and highlights">
            <div role="radiogroup" aria-label="Accent" className="flex flex-shrink-0 items-center gap-2">
              {options.accents.map((accent) => {
                const on = settings.accent === accent.id;
                return (
                  <button
                    key={accent.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-label={accent.label}
                    title={accent.label}
                    disabled={saving}
                    onClick={() => !on && void save({ accent: accent.id }, `Accent is ${accent.label}`)}
                    className={`w-7 h-7 rounded-full border-2 transition-shadow ${
                      on ? 'border-foreground ring-2 ring-offset-2 ring-offset-card-bg ring-foreground/30' : 'border-foreground-muted/30'
                    }`}
                    style={{ background: accent.light ?? 'var(--accent-primary)' }}
                  />
                );
              })}
            </div>
          </Card>

          <Card title="Sans typeface" detail="Headings, labels and interface text">
            <AdminSelect
              aria-label="Sans typeface"
              value={settings.sans}
              disabled={saving}
              onChange={(e) => void save({ sans: e.target.value }, 'Sans typeface saved')}
              compact
              shellClassName="flex-shrink-0"
              className="font-mono"
            >
              {options.sans.map((font) => (
                <option key={font.id} value={font.id}>{font.label}</option>
              ))}
            </AdminSelect>
          </Card>

          <Card title="Serif typeface" detail="Story body text">
            <AdminSelect
              aria-label="Serif typeface"
              value={settings.serif}
              disabled={saving}
              onChange={(e) => void save({ serif: e.target.value }, 'Serif typeface saved')}
              compact
              shellClassName="flex-shrink-0"
              className="font-mono"
            >
              {options.serif.map((font) => (
                <option key={font.id} value={font.id}>{font.label}</option>
              ))}
            </AdminSelect>
          </Card>
        </div>
      </div>
    </div>
  );
}
