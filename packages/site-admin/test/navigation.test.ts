import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ADMIN_MODULES } from '../src/registry.ts';
import { defineAdminModule } from '../src/modules/define.ts';
import { buildAdminNav, findAdminNavGroup, findCurrentAdminNavItem } from '../src/shell/navigation.ts';
import { adminRecordTitle, adminTitle } from '../src/title/index.ts';
import { copySlug, fullOrder, nextWorkSort, sortStoryRows, type StoryRow } from '../src/screens/work/model.ts';

const config = { adminBase: '/admin' };
const names = (groups: ReturnType<typeof buildAdminNav>) => groups.map((group) => [group.label, group.items.map((item) => item.name)]);

test('the nav is built from the enabled modules, empty groups left out', () => {
  assert.deepEqual(names(buildAdminNav(ADMIN_MODULES, config)), [
    ['Overview', ['Dashboard']],
    ['Publishing', ['Posts']],
    ['Portfolio', ['Work', 'Image library']],
  ]);
  const [, , portfolio] = buildAdminNav(ADMIN_MODULES, config);
  assert.deepEqual(portfolio.items.map((item) => item.href), ['/admin/stories', '/admin/image-library']);
});

test('a module lands in its group at its slot; custom links follow, external ones keep their address', () => {
  const home = defineAdminModule({ id: 'home', title: 'Home', nav: [{ group: 'Publishing', name: 'Home', path: 'home', description: 'Home copy', order: 0 }] });
  const groups = buildAdminNav([...ADMIN_MODULES, home], config, [
    { group: 'Tools', name: 'Style guide', path: '/style-guide', description: 'Type', external: true, order: 100 },
  ]);
  assert.deepEqual(names(groups), [
    ['Overview', ['Dashboard']],
    ['Publishing', ['Home', 'Posts']],
    ['Portfolio', ['Work', 'Image library']],
    ['Tools', ['Style guide']],
  ]);
  assert.equal(groups[3].items[0].href, '/style-guide');
  assert.equal(groups[3].items[0].external, true);
});

test('child routes belong to the closest item; the dashboard matches only itself', () => {
  const groups = buildAdminNav(ADMIN_MODULES, { adminBase: '/cms' });
  assert.equal(findCurrentAdminNavItem(groups, '/cms', '/cms')?.name, 'Dashboard');
  assert.equal(findCurrentAdminNavItem(groups, '/cms/stories/new', '/cms')?.name, 'Work');
  assert.equal(findCurrentAdminNavItem(groups, '/cms/stories/harbor-map', '/cms')?.name, 'Work');
  assert.equal(findCurrentAdminNavItem(groups, '/cms/nowhere', '/cms'), undefined);
  const work = findCurrentAdminNavItem(groups, '/cms/image-library', '/cms')!;
  assert.equal(findAdminNavGroup(groups, work)?.label, 'Portfolio');
});

test('tab titles: the template, and a record’s name only for a signed-in admin', async () => {
  assert.equal(adminTitle('Work'), 'Work — Admin');
  assert.equal(adminTitle('  '), 'Admin');
  const lookupName = () => 'Harbor   wayfinding';
  assert.equal(await adminRecordTitle('Story', { authenticated: () => true, lookupName }), 'Harbor wayfinding · Story');
  assert.equal(await adminRecordTitle('Story', { authenticated: () => false, lookupName }), 'Edit story');
  assert.equal(await adminRecordTitle('Story', { authenticated: () => true, lookupName: () => { throw new Error('offline'); } }), 'Edit story');
  const long = await adminRecordTitle('Story', { authenticated: () => true, lookupName: () => 'A'.repeat(80) });
  assert.ok(long.startsWith(`${'A'.repeat(47)}…`));
});

const row = (slug: string, overrides: Partial<StoryRow> = {}): StoryRow => ({
  slug,
  title: slug,
  company: 'Fieldnote Studio',
  year: '2024',
  updatedAt: '2026-01-01T00:00:00.000Z',
  version: 1,
  published: true,
  listed: true,
  placementVersion: 0,
  cover: null,
  ...overrides,
});

test('Work: the site’s order first, unplaced rows newest first after it; other sorts are the view only', () => {
  const rows = [row('a', { year: '2022' }), row('b', { year: '2025' }), row('c', { year: '2023', title: 'Alpha' })];
  assert.deepEqual(sortStoryRows(rows, { key: 'order', direction: 'asc' }, ['c']).map((item) => item.slug), ['c', 'b', 'a']);
  assert.deepEqual(sortStoryRows(rows, { key: 'title', direction: 'asc' }).map((item) => item.slug), ['a', 'c', 'b']);
  assert.deepEqual(sortStoryRows(rows, { key: 'date', direction: 'desc' }).map((item) => item.slug), ['b', 'c', 'a']);
  assert.deepEqual(fullOrder(['c'], ['b', 'c', 'a']), ['c', 'b', 'a']);
});

test('Work: the order column never reverses; dates start newest first; a second click flips', () => {
  const start = { key: 'title' as const, direction: 'asc' as const };
  assert.deepEqual(nextWorkSort(start, 'order'), { key: 'order', direction: 'asc' });
  assert.deepEqual(nextWorkSort(start, 'updated'), { key: 'updated', direction: 'desc' });
  assert.deepEqual(nextWorkSort(start, 'title'), { key: 'title', direction: 'desc' });
  assert.equal(copySlug('harbor-map', new Set()), 'harbor-map-copy');
  assert.equal(copySlug('harbor-map', new Set(['harbor-map-copy', 'harbor-map-copy-2'])), 'harbor-map-copy-3');
});
