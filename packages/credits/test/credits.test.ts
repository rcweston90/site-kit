import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { assertCredits, checkCredits, creditsToMarkdown, defineCredits, formatProblems } from '../src/index.ts';
import { run } from '../src/cli.ts';

// A made-up project: a small web app with three packages and one doc.
function fixture(pkg: Record<string, unknown> = {}) {
  const root = mkdtempSync(join(tmpdir(), 'credits-'));
  mkdirSync(join(root, 'docs'));
  writeFileSync(join(root, 'docs', 'type.md'), '# Type\n');
  writeFileSync(join(root, 'package.json'), JSON.stringify({
    name: 'example-app',
    dependencies: { 'example-framework': '^1.0.0', 'example-icons': '^2.0.0', '@example/internal': 'workspace:*' },
    devDependencies: { 'example-types': '^1.0.0' },
    ...pkg,
  }));
  return root;
}

const credits = defineCredits({
  fields: [
    {
      id: 'engineering',
      title: 'Engineering',
      summary: 'The code.',
      credits: [
        { role: 'Framework', name: 'Example Framework', note: 'Routing and rendering', href: 'https://example.com/framework', packages: ['example-framework'] },
        { role: 'Icons', name: 'Example Icons', note: 'Every icon | in the UI', href: 'https://example.com/icons', packages: ['example-icons'] },
      ],
    },
    {
      id: 'type',
      title: 'Type',
      credits: [{ role: 'Typeface', name: 'Example Sans', note: 'Headings and body', where: 'docs/type.md' }],
    },
  ],
  uncredited: { 'example-types': 'Type definitions only; nothing ships.' },
});

test('honest credits pass, and workspace links are left out', () => {
  assert.deepEqual(checkCredits(credits, { root: fixture() }), []);
  assert.doesNotThrow(() => assertCredits(credits, { root: fixture() }));
});

test('a new dependency fails until it has a credit or a reason', () => {
  const root = fixture({ dependencies: { 'example-framework': '^1', 'example-icons': '^2', 'example-new-thing': '^0.1' } });
  const problems = checkCredits(credits, { root });
  assert.deepEqual(problems.map((problem) => problem.code), ['uncredited-package']);
  assert.equal(problems[0].package, 'example-new-thing');
  assert.throws(() => assertCredits(credits, { root }), /example-new-thing \(in package\.json\) needs a credit/);
});

test('a removed dependency makes its credit and its reason stale', () => {
  const root = fixture({ dependencies: { 'example-framework': '^1' }, devDependencies: {} });
  const codes = checkCredits(credits, { root }).map((problem) => `${problem.code}:${problem.package}`);
  assert.deepEqual(codes.sort(), ['stale-credit:example-icons', 'stale-reason:example-types']);
});

test('a package can’t be both credited and excused, and an excuse needs words', () => {
  const root = fixture();
  const codes = checkCredits({ ...credits, uncredited: { 'example-types': ' ', 'example-icons': 'tiny' } }, { root }).map((problem) => problem.code);
  assert.ok(codes.includes('credited-and-uncredited'));
  assert.ok(codes.includes('empty-reason'));
});

test('fields have unique kebab ids, rows are unique, links are https and paths exist', () => {
  const root = fixture();
  const broken = defineCredits({
    fields: [
      { id: 'Engineering', title: 'Engineering', credits: [
        { role: 'Framework', name: 'Example Framework', href: 'http://example.com', packages: ['example-framework', 'example-icons'] },
        { role: 'Framework', name: 'Example Framework' },
      ] },
      { id: 'Engineering', title: 'Again', credits: [] },
      { id: 'docs', title: 'Docs', credits: [{ role: 'Guide', name: 'Guide', where: 'docs/type.md · docs/missing.md' }] },
    ],
    uncredited: { 'example-types': 'types' },
  });
  const codes = checkCredits(broken, { root }).map((problem) => problem.code).sort();
  assert.deepEqual(codes, ['bad-field-id', 'bad-field-id', 'duplicate-field', 'duplicate-row', 'empty-field', 'insecure-link', 'missing-path']);
  assert.equal(checkCredits(broken, { root, checkPaths: false }).some((problem) => problem.code === 'missing-path'), false);
});

test('ignore, include and several package.json files', () => {
  const root = fixture();
  mkdirSync(join(root, 'packages', 'ui'), { recursive: true });
  writeFileSync(join(root, 'packages', 'ui', 'package.json'), JSON.stringify({ peerDependencies: { 'example-peer': '^1' }, dependencies: { 'example-ui-only': '^1' } }));
  const both = { root, packageJson: ['package.json', 'packages/ui/package.json'] };
  assert.deepEqual(checkCredits(credits, both).map((problem) => problem.package), ['example-ui-only']);
  assert.deepEqual(checkCredits(credits, { ...both, ignore: [/^example-ui/] }), []);
  assert.deepEqual(
    checkCredits(credits, { ...both, ignore: ['example-ui-only'], include: ['dependencies', 'devDependencies', 'peerDependencies'] }).map((problem) => problem.package),
    ['example-peer'],
  );
  assert.equal(checkCredits(credits, { root, packageJson: ['nope.json'] })[0].code, 'unreadable-package-json');
});

test('problems read as sentences', () => {
  assert.equal(formatProblems([]), 'Credits check passed.');
  assert.match(formatProblems([{ code: 'stale-credit', message: 'a is credited but gone' }]), /^Credits check found 1 problem:\n  ✗ a is credited but gone$/);
});

test('the same data renders as a Markdown credits section', () => {
  const markdown = creditsToMarkdown(credits.fields);
  assert.match(markdown, /^### Engineering\n\nThe code\.\n\n\| Role \| Credit \| What it does here \|/);
  assert.match(markdown, /\| Icons \| \[Example Icons\]\(https:\/\/example\.com\/icons\) \| Every icon \\\| in the UI \|/);
  assert.match(markdown, /### Type\n\n\| Role/);
});

test('the CLI exits 0 when honest, 1 with problems, 2 without a config', async () => {
  const root = fixture();
  writeFileSync(join(root, 'credits.config.json'), JSON.stringify(credits));
  const out: string[] = [];
  const log = (line: string) => out.push(line);
  assert.equal(await run([], root, log, log), 0);
  assert.match(out.join('\n'), /passed/);

  writeFileSync(join(root, 'credits.config.mjs'), `export default { fields: ${JSON.stringify(credits.fields)}, uncredited: {} };`);
  out.length = 0;
  assert.equal(await run(['--json'], root, log, log), 1);
  const report = JSON.parse(out.join('\n'));
  assert.equal(report.ok, false);
  assert.equal(report.problems[0].package, 'example-types');

  assert.equal(await run(['--config', 'missing.mjs'], root, log, log), 2);
  assert.equal(await run(['--bogus'], root, log, log), 2);
  assert.equal(await run(['--help'], root, log, log), 0);
});
