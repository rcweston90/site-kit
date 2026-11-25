import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

// The kit's promise: React and nothing else.
test('the source imports only React and its own files', () => {
  const dir = new URL('../src/', import.meta.url);
  for (const file of readdirSync(dir).filter((name) => /\.tsx?$/.test(name))) {
    const text = readFileSync(new URL(file, dir), 'utf8');
    for (const [, spec] of text.matchAll(/from '([^']+)'/g)) {
      assert.ok(spec === 'react' || spec.startsWith('./'), `${file} imports ${spec}`);
      if (spec.startsWith('./')) assert.match(spec, /\.js$/, `${file}: relative imports end in .js for Node ESM`);
    }
  }
});

test('every class the components use has a rule in styles.css', () => {
  const dir = new URL('../src/', import.meta.url);
  const css = readFileSync(new URL('styles.css', dir), 'utf8');
  for (const file of readdirSync(dir).filter((name) => name.endsWith('.tsx'))) {
    const text = readFileSync(new URL(file, dir), 'utf8');
    for (const [, name] of text.matchAll(/(?:className=\{?|join\(|\[)['"](sk-[a-z-]+)['"]/g)) {
      assert.ok(css.includes(`.${name}`), `${file}: .${name} is styled`);
    }
  }
});
