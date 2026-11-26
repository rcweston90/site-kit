/**
 * appearance: how the public site looks for every visitor.
 *
 *   GET /appearance   AppearanceState: the settings, their version and the options to choose from
 *   PUT /appearance   { settings, expectedVersion? }
 *
 * Public layouts read `reads.appearance.current()` and put
 * `appearanceCss(…)` and `appearanceBootScript(…)` in the page.
 */

import { defineModule } from '../../module.js';
import { InvalidInputError, expectedVersionOf, json, readBody } from '../../http.js';
import { createMemoryTable, createPostgresTable, type VersionedTable } from '../../versioned.js';
import { MIGRATIONS } from './migrations.generated.js';
import {
  AppearanceInputError,
  appearanceCss,
  configureAppearance,
  parseAppearance,
  storedAppearance,
  type AppearanceConfig,
  type AppearanceSettings,
  type AppearanceState,
} from './model.js';

export * from './model.js';

export type AppearanceStore = VersionedTable<AppearanceSettings>;

export interface AppearanceReads {
  /** The settings in effect (the defaults when nothing is saved, or the read fails). */
  current(): Promise<AppearanceSettings>;
  /** The settings and the stylesheet that applies them. */
  styles(): Promise<{ settings: AppearanceSettings; css: string }>;
}

const KEY = 'site';

const optionsOf = (config: AppearanceConfig) => ({ accents: config.accents, sans: config.sans, serif: config.serif });

async function stateOf(store: AppearanceStore, config: AppearanceConfig): Promise<AppearanceState> {
  const row = await store.get(KEY);
  return {
    settings: row ? storedAppearance(row.value, config) : config.defaults,
    version: row?.version ?? 0,
    updatedAt: row?.updatedAt ?? null,
    options: optionsOf(config),
  };
}

export const appearance = defineModule({
  id: 'appearance',
  title: 'Appearance',
  migrationRange: [2800, 2899],
  migrations: MIGRATIONS,
  configure: configureAppearance,
  createMemoryStore: (): AppearanceStore => createMemoryTable<AppearanceSettings>(),
  createPostgresStore: (sql): AppearanceStore =>
    createPostgresTable<AppearanceSettings>(sql, {
      table: 'site_appearance', keyColumn: 'key', columns: ['body'],
      toRow: (value) => [JSON.stringify(value)], fromRow: (row) => row.body as AppearanceSettings,
    }),
  handlers: ({ store, config, revalidate }) => [
    { method: 'GET', path: '', handle: async () => json(await stateOf(store, config)) },
    {
      method: 'PUT',
      path: '',
      handle: async ({ request }) => {
        const body = await readBody(request);
        let settings: AppearanceSettings;
        try {
          settings = parseAppearance(body.settings, config);
        } catch (error) {
          if (error instanceof AppearanceInputError) throw new InvalidInputError(error.message);
          throw error;
        }
        const saved = await store.set(KEY, settings, expectedVersionOf(body));
        await revalidate(['/']);
        return json({ settings: storedAppearance(saved.value, config), version: saved.version, updatedAt: saved.updatedAt, options: optionsOf(config) } satisfies AppearanceState);
      },
    },
  ],
  publicReads: (store, config): AppearanceReads => {
    const current = async () => {
      try {
        const row = await store.get(KEY);
        return row ? storedAppearance(row.value, config) : config.defaults;
      } catch (error) {
        console.error('[site-data] appearance: reading the settings failed, using the defaults:', error);
        return config.defaults;
      }
    };
    return {
      current,
      styles: async () => {
        const settings = await current();
        return { settings, css: appearanceCss(settings, config) };
      },
    };
  },
});
