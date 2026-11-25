// The scrub check must fail on every kind of leak, and fail closed when it
// can't run. Each case builds a throwaway git repo and runs the real script.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const salt = 'test-salt:';
const hash = (term) => createHash('sha256').update(salt + term).digest('hex');

function repo(files, { denylist = { salt, hashes: [hash('examplecorp'), hash('secret-project-name')] } } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'scrub-'));
  mkdirSync(join(root, 'scripts'));
  copyFileSync(join(here, 'scrub.mjs'), join(root, 'scripts', 'scrub.mjs'));
  if (denylist) writeFileSync(join(root, 'scripts', 'scrub-denylist.json'), JSON.stringify(denylist));
  execFileSync('git', ['init', '-q'], { cwd: root });
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), body);
  }
  return root;
}
const scrub = (root) => spawnSync(process.execPath, ['scripts/scrub.mjs'], { cwd: root, encoding: 'utf8' });

test('a clean repo passes', () => {
  const result = scrub(repo({ 'src/a.ts': 'export const a = 1;\n' }));
  assert.equal(result.status, 0, result.stderr);
});

test('each kind of leak fails', () => {
  const cases = {
    'private/notes.txt': 'x',
    'public/fonts/a.woff2': 'x',
    'data/snapshots/projects.json': '{}',
    '.env.local': 'X=1',
    'CLAUDE.md': '# notes',
    'img/shot.png': 'x',
    'src/key.ts': 'const k = "AKIAABCDEFGHIJKLMNOP";',
    'src/pem.ts': '-----BEGIN RSA PRIVATE KEY-----',
    'src/env.ts': 'process.env.POSTGRES_URL',
    'src/host.ts': 'https://abc123.public.blob.vercel-storage.com/x.png',
    'src/path.ts': '// from /Users/someone/Desktop',
    'src/name.ts': '// built for ExampleCorp',
    'src/slug.ts': "const slug = 'secret-project-name';",
    'src/secret-project-name.ts': 'export {};',
    'src/local.ts': '// mentions zebracorn',
  };
  for (const [path, body] of Object.entries(cases)) {
    const root = repo({ 'src/ok.ts': 'export {};', [path]: body, '.scrub-local.txt': 'zebracorn\n', '.gitignore': '.scrub-local.txt\n' });
    const result = scrub(root);
    assert.equal(result.status, 1, `${path} should fail:\n${result.stdout}`);
    assert.match(result.stderr, new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${path} is named`);
  }
});

test('a hit names the term by hash, never in plain text', () => {
  const result = scrub(repo({ 'src/name.ts': '// ExampleCorp' }));
  assert.equal(result.status, 1);
  assert.doesNotMatch(result.stderr, /examplecorp/i);
  assert.match(result.stderr, /term #[0-9a-f]{8}/);
});

test('an allowed line passes, and only that line', () => {
  const files = { 'src/name.ts': '// ExampleCorp\n// ExampleCorp\n', 'scripts/scrub-allow.txt': 'src/name.ts:1 # a test fixture\n' };
  const result = scrub(repo(files));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /src\/name\.ts:2/);
  assert.doesNotMatch(result.stderr, /src\/name\.ts:1 /);
});

test('it fails closed without a denylist, with an empty one, or outside git', () => {
  assert.equal(scrub(repo({ 'a.ts': '' }, { denylist: null })).status, 1);
  assert.equal(scrub(repo({ 'a.ts': '' }, { denylist: { salt, hashes: [] } })).status, 1);
  const bare = mkdtempSync(join(tmpdir(), 'scrub-nogit-'));
  mkdirSync(join(bare, 'scripts'));
  copyFileSync(join(here, 'scrub.mjs'), join(bare, 'scripts', 'scrub.mjs'));
  const result = spawnSync(process.execPath, ['scripts/scrub.mjs'], { cwd: bare, encoding: 'utf8', env: { ...process.env, GIT_CEILING_DIRECTORIES: tmpdir() } });
  assert.equal(result.status, 1);
});
