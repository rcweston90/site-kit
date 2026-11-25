import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RENAME_ERROR_STATUS,
  RESERVED_STORY_ADDRESSES,
  STORY_ADDRESS_MESSAGES,
  StoryRenameError,
  authoredStoryFromFormerAddress,
  collapseRedirects,
  createAddressAliases,
  formatStoryAddressInput,
  formerAddressesOf,
  planStoryRename,
  reservedStoryAddresses,
  resolveRenameRequest,
  storyAddressProblem,
  suggestStoryAddress,
  takenStoryAddresses,
  type RenameRouteDeps,
  type StoryAddressProblem,
  type StoryRenameErrorCode,
  type StoryRenameFacts,
} from '../src/rename.ts';
import type { SlugRedirect } from '../src/contract.ts';
import { contentSha256 } from '../src/identity.ts';
import { validateStory } from '../src/model.ts';
import { story as fixture } from './fixtures.ts';

const FROM = 'field-notes-that-travel';
const TO = 'a-shared-field-guide';
const story = (slug: string, title = 'Field notes that travel') => fixture({ slug, title });
const noTarget: StoryRenameFacts['target'] = { maxVersion: 0, hasHostRecord: false, hasPublication: false, hasAuthoredStory: false, redirectsTo: null };

function baseFacts(overrides: Partial<StoryRenameFacts> = {}): StoryRenameFacts {
  const latest = { id: `story:${FROM}:v3`, content: story(FROM) };
  return {
    from: FROM,
    to: TO,
    expectedLatestDocumentId: latest.id,
    latestDocument: latest,
    publishedDocument: null,
    authoredStory: story(FROM, 'Authored title'),
    fromRedirectsTo: null,
    fromHasHostRecord: true,
    target: noTarget,
    ...overrides,
  };
}

function expectRenameError(run: () => unknown, code: StoryRenameErrorCode, problem?: StoryAddressProblem) {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof StoryRenameError);
    assert.equal(error.code, code);
    if (problem) assert.equal(error.problem, problem);
    return true;
  });
}

test('a title suggests a kebab-case address', () => {
  assert.equal(suggestStoryAddress('Mapping the field notes'), 'mapping-the-field-notes');
  assert.equal(suggestStoryAddress('  Café & Résumé: v2!  '), 'cafe-and-resume-v2');
  assert.equal(suggestStoryAddress('Don’t ship the “AI” button'), 'dont-ship-the-ai-button');
  assert.equal(suggestStoryAddress(''), '');
  const long = suggestStoryAddress('One shared field guide for every interview across the whole studio without a second tool anywhere at all');
  assert.ok(long.length <= 80);
  assert.match(long, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
});

test('typing is forgiving: capitals, spaces and pasted links become an address', () => {
  assert.equal(formatStoryAddressInput('Mapping The Field Notes'), 'mapping-the-field-notes');
  assert.equal(formatStoryAddressInput('https://example.com/stories/field-guide?ref=x#top'), 'field-guide');
  assert.equal(formatStoryAddressInput('/work/field-guide/'), 'field-guide');
  assert.equal(formatStoryAddressInput('half_typed'), 'half_typed', 'other characters are left for validation to explain');
});

test('address validation names the first problem in plain language', () => {
  const check = (candidate: string, taken: string[] = []) => storyAddressProblem(candidate, { current: FROM, taken });
  assert.equal(check(''), 'empty');
  assert.equal(check('field_notes'), 'characters');
  assert.equal(check('Field'), 'characters');
  assert.equal(check('field--notes'), 'dashes');
  assert.equal(check('-field'), 'dashes');
  assert.equal(check('field-'), 'dashes');
  assert.equal(check(FROM), 'unchanged');
  assert.equal(check('ab'), 'too-short');
  assert.equal(check('a'.repeat(81)), 'too-long');
  assert.equal(check('a'.repeat(80)), null);
  for (const reserved of ['new', 'edit', 'admin', 'api', 'constructor', 'prototype']) {
    assert.ok(RESERVED_STORY_ADDRESSES.has(reserved));
    assert.equal(check(reserved), 'reserved');
  }
  assert.equal(check('field-guide', ['field-guide']), 'taken');
  assert.equal(check(TO, ['field-guide']), null);
  for (const message of Object.values(STORY_ADDRESS_MESSAGES)) {
    assert.doesNotMatch(message, /slug|redirect|database|migration|immutable/i);
  }
});

test('hosts extend the reserved addresses with their own routes', () => {
  const reserved = reservedStoryAddresses(['archive', 'tags']);
  assert.ok(reserved.has('archive') && reserved.has('new'));
  assert.ok(!RESERVED_STORY_ADDRESSES.has('archive'), 'the default set is never changed');
  assert.equal(storyAddressProblem('archive', { current: FROM, taken: [], reserved }), 'reserved');
  assert.equal(storyAddressProblem('archive', { current: FROM, taken: [] }), null);
  expectRenameError(() => planStoryRename(baseFacts({ to: 'archive' }), { reserved }), 'address', 'reserved');
});

test('taken addresses cover every identity, but a story may move back to its own old address', () => {
  const redirects: SlugRedirect[] = [
    { from: 'old-notes', to: 'field-guide' },
    { from: 'old-cloud', to: 'cloud-studies' },
    { from: 'field-guide-draft', to: 'field-guide' },
  ];
  const taken = takenStoryAddresses({
    current: 'field-guide',
    documentSlugs: ['old-notes', 'field-guide', 'show-the-work'],
    hostSlugs: ['field-guide', 'cloud-studies', 'field-guide-draft'],
    publicationSlugs: ['show-the-work'],
    authoredSlugs: ['old-notes', 'show-the-work', 'cloud-studies'],
    redirects,
  });
  assert.deepEqual(taken, ['cloud-studies', 'field-guide-draft', 'old-cloud', 'show-the-work']);
  assert.ok(!taken.includes('field-guide'), 'the current address is "unchanged", not "taken"');
  assert.ok(!taken.includes('old-notes'), 'its own former address is reclaimable');
  assert.deepEqual(formerAddressesOf('field-guide', redirects), ['old-notes', 'field-guide-draft']);
  assert.deepEqual(takenStoryAddresses({ current: 'x-y', documentSlugs: ['a-b'], redirects: [] }), ['a-b']);
});

test('redirects stay flat: renaming again re-points every older address, never a chain', () => {
  let rows = collapseRedirects([], { from: 'a', to: 'b' });
  assert.deepEqual(rows, [{ from: 'a', to: 'b' }]);
  rows = collapseRedirects(rows, { from: 'b', to: 'c' });
  assert.deepEqual(rows, [{ from: 'a', to: 'c' }, { from: 'b', to: 'c' }]);
  rows = collapseRedirects(rows, { from: 'c', to: 'a' });
  assert.deepEqual(rows, [{ from: 'b', to: 'a' }, { from: 'c', to: 'a' }]);
  rows = collapseRedirects([...rows, { from: 'x', to: 'y' }], { from: 'a', to: 'd' });
  assert.deepEqual(rows, [{ from: 'a', to: 'd' }, { from: 'b', to: 'd' }, { from: 'c', to: 'd' }, { from: 'x', to: 'y' }]);

  const names = ['p', 'q', 'r', 's', 't'];
  let table: SlugRedirect[] = [];
  let current = 'p';
  for (let step = 0; step < 40; step += 1) {
    const next = names[(step * 7 + 3) % names.length];
    if (next === current) continue;
    table = collapseRedirects(table, { from: current, to: next });
    current = next;
    const sources = new Set(table.map((row) => row.from));
    for (const row of table) {
      assert.notEqual(row.from, row.to);
      assert.ok(!sources.has(row.to), `chain through ${row.to}`);
      assert.equal(row.to, current);
    }
  }
});

test('an authored story serves its renamed address with the new slug', () => {
  const lookup = (slug: string) => (slug === 'old-notes' ? story('old-notes', 'Old notes') : undefined);
  const moved = authoredStoryFromFormerAddress(TO, ['older-still', 'old-notes'], lookup);
  assert.equal(moved?.slug, TO);
  assert.equal(moved?.title, 'Old notes');
  assert.equal(authoredStoryFromFormerAddress('nothing-here', [], lookup), undefined);
});

test('address aliases look up under the current address, then former ones', () => {
  const aliases = createAddressAliases([{ from: 'old-notes', to: TO }, { from: 'older-still', to: TO }]);
  assert.deepEqual(aliases.formerOf(TO), ['old-notes', 'older-still']);
  const covers = new Map([['older-still', 'cover.svg']]);
  assert.equal(aliases.lookup(TO, (slug) => covers.get(slug)), 'cover.svg');
  assert.equal(aliases.knownAs(TO, ['old-notes', 'other']), 'old-notes');
  assert.equal(aliases.story(TO, (slug) => (slug === 'old-notes' ? story('old-notes') : undefined))?.slug, TO);

  const direct = createAddressAliases([]);
  assert.equal(direct.lookup('a-b', (slug) => (slug === 'a-b' ? 1 : undefined)), 1);
  assert.equal(direct.knownAs('a-b', new Set(['c-d'])), 'a-b');
});

test('an unpublished story continues from its latest draft as version 1 at the new address', () => {
  const facts = baseFacts();
  const before = structuredClone(facts);
  const plan = planStoryRename(facts, { sourceCommit: 'abc1234' });
  assert.equal(plan.documents.length, 1);
  const [document] = plan.documents;
  assert.equal(document.id, `story:${TO}:v1`);
  assert.equal(document.version, 1);
  assert.equal(document.parentDocumentId, null, 'the parent must share the slug, so the first copy has none');
  assert.equal(document.content.slug, TO);
  assert.equal(document.sourceKind, 'rename');
  assert.equal(document.sourceRef, FROM);
  assert.equal(document.sourceCommit, 'abc1234');
  assert.equal(document.contentSha256, contentSha256(document.content));
  assert.deepEqual(validateStory(document.content, TO), []);
  assert.equal(plan.publishDocumentId, null);
  assert.equal(plan.removeOldPublication, false);
  assert.equal(plan.moveHostRecord, true);
  assert.deepEqual(plan.redirects, { retire: null, repointFrom: FROM, add: { from: FROM, to: TO } });
  assert.deepEqual(facts, before, 'old versions are never rewritten');
  assert.equal(planStoryRename(facts).documents[0].sourceCommit, '');
  assert.equal(planStoryRename(facts, { checksum: () => 'fixed' }).documents[0].contentSha256, 'fixed');
});

test('a live story stays live at the new address, and unpublished edits stay unpublished', () => {
  const latest = { id: `story:${FROM}:v3`, content: story(FROM, 'Draft title') };
  const current = planStoryRename(baseFacts({ latestDocument: latest, publishedDocument: latest }));
  assert.equal(current.documents.length, 1);
  assert.equal(current.publishDocumentId, `story:${TO}:v1`);
  assert.equal(current.removeOldPublication, true);

  const live = { id: `story:${FROM}:v2`, content: story(FROM, 'Live title') };
  const older = planStoryRename(baseFacts({ latestDocument: latest, publishedDocument: live }));
  assert.deepEqual(older.documents.map((document) => [document.id, document.content.title, document.parentDocumentId]), [
    [`story:${TO}:v1`, 'Live title', null],
    [`story:${TO}:v2`, 'Draft title', `story:${TO}:v1`],
  ]);
  assert.equal(older.publishDocumentId, `story:${TO}:v1`, 'the live copy, not the draft');
});

test('a story that only exists as an authored story moves from it', () => {
  const plan = planStoryRename(baseFacts({ latestDocument: null, expectedLatestDocumentId: null, fromHasHostRecord: false }));
  assert.equal(plan.documents[0].content.title, 'Authored title');
  assert.equal(plan.documents[0].content.slug, TO);
  assert.equal(plan.moveHostRecord, false);
  expectRenameError(() => planStoryRename(baseFacts({ latestDocument: null, authoredStory: null, expectedLatestDocumentId: null })), 'not-found');
});

test('a rename refuses stale editors, moved stories and addresses in use', () => {
  const plan = (facts: Partial<StoryRenameFacts>) => () => planStoryRename(baseFacts(facts));
  expectRenameError(plan({ expectedLatestDocumentId: `story:${FROM}:v2` }), 'stale');
  expectRenameError(plan({ expectedLatestDocumentId: null }), 'stale');
  expectRenameError(plan({ fromRedirectsTo: 'somewhere-new' }), 'moved');
  expectRenameError(plan({ to: 'new' }), 'address', 'reserved');
  expectRenameError(plan({ to: 'Shared' }), 'address', 'characters');
  expectRenameError(plan({ to: FROM }), 'address', 'unchanged');
  expectRenameError(plan({ target: { ...noTarget, maxVersion: 2 } }), 'address', 'taken');
  expectRenameError(plan({ target: { ...noTarget, hasHostRecord: true } }), 'address', 'taken');
  expectRenameError(plan({ target: { ...noTarget, hasPublication: true } }), 'address', 'taken');
  expectRenameError(plan({ target: { ...noTarget, hasAuthoredStory: true } }), 'address', 'taken');
  expectRenameError(plan({ target: { ...noTarget, redirectsTo: 'someone-else' } }), 'address', 'taken');
  const moved = (() => { try { plan({ fromRedirectsTo: 'somewhere-new' })(); } catch (error) { return error; } })();
  assert.equal((moved as StoryRenameError).movedTo, 'somewhere-new');
});

test('moving back to a former address continues its version numbers and retires its redirect', () => {
  const back = {
    from: TO,
    to: FROM,
    expectedLatestDocumentId: `story:${TO}:v1`,
    latestDocument: { id: `story:${TO}:v1`, content: story(TO) },
  };
  const plan = planStoryRename(baseFacts({ ...back, target: { maxVersion: 5, hasHostRecord: false, hasPublication: false, hasAuthoredStory: true, redirectsTo: TO } }));
  assert.equal(plan.documents[0].id, `story:${FROM}:v6`);
  assert.equal(plan.redirects.retire, FROM);
  expectRenameError(() => planStoryRename(baseFacts({ ...back, target: { maxVersion: 5, hasHostRecord: true, hasPublication: false, hasAuthoredStory: true, redirectsTo: TO } })), 'address', 'taken');
});

test('the rename endpoint answers every outcome in plain language', async () => {
  const calls: string[] = [];
  const deps = (overrides: Partial<RenameRouteDeps> = {}): RenameRouteDeps => ({
    isAdmin: async () => true,
    unavailableReason: async () => null,
    rename: async ({ from, to }) => {
      calls.push(`rename ${from} to ${to}`);
      return { from, to, documentIds: [`story:${to}:v1`], publishedDocumentId: null };
    },
    afterRename: ({ from, to }) => calls.push(`after ${from} ${to}`),
    reportError: () => calls.push('logged'),
    ...overrides,
  });
  const body = { newSlug: TO, expectedLatestDocumentId: `story:${FROM}:v3` };

  const ok = await resolveRenameRequest(FROM, body, deps());
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body.documentIds, [`story:${TO}:v1`]);
  assert.deepEqual(calls.splice(0), [`rename ${FROM} to ${TO}`, `after ${FROM} ${TO}`]);

  assert.equal((await resolveRenameRequest(FROM, body, deps({ isAdmin: async () => false }))).status, 401);
  const off = await resolveRenameRequest(FROM, body, deps({ unavailableReason: async () => 'Not here.' }));
  assert.deepEqual(off, { status: 503, body: { error: 'Not here.', code: 'RENAME_UNAVAILABLE' } });
  for (const bad of [null, 'text', {}, { newSlug: 3, expectedLatestDocumentId: null }, { newSlug: TO }]) {
    const response = await resolveRenameRequest(FROM, bad, deps());
    assert.equal(response.status, 400);
    assert.equal(response.body.code, 'RENAME_INVALID');
  }
  assert.deepEqual(calls, [], 'nothing runs for a refused request');

  const refused = await resolveRenameRequest(FROM, body, deps({ rename: async () => { throw new StoryRenameError('not-found', 'Nothing here.'); } }));
  assert.deepEqual(refused, { status: RENAME_ERROR_STATUS['not-found'], body: { error: 'Nothing here.', code: 'RENAME_NOT_FOUND', problem: undefined, movedTo: undefined } });
  const taken = await resolveRenameRequest(FROM, body, deps({ rename: async () => { throw new StoryRenameError('address', STORY_ADDRESS_MESSAGES.taken, { problem: 'taken' }); } }));
  assert.equal(taken.status, 422);
  assert.equal(taken.body.problem, 'taken');

  const crashed = await resolveRenameRequest(FROM, body, deps({ rename: async () => { throw new Error('connection reset'); } }));
  assert.equal(crashed.status, 500);
  assert.doesNotMatch(String(crashed.body.error), /connection/);
  assert.deepEqual(calls, ['logged']);
});
