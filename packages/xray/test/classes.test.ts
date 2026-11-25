import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { rhythmStyles, styles } from '../src/classes.ts';

// The stylesheet is plain CSS (a library can't count on the host's CSS
// modules), so the class map and the stylesheet must agree by hand.

const src = new URL('../src/', import.meta.url);
const css = await readFile(new URL('styles.css', src), 'utf8');
const rules = css.replace(/\/\*[\s\S]*?\*\//g, '');
const selectors = new Set([...rules.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]));

test('every class in the maps is a selector in styles.css', () => {
  for (const [key, cls] of Object.entries({ ...styles, ...rhythmStyles })) {
    assert.ok(selectors.has(cls), `${key} → .${cls} is missing from styles.css`);
  }
});

test('every class is prefixed, and every selector in styles.css is in a map', () => {
  const mapped = new Set<string>([...Object.values(styles), ...Object.values(rhythmStyles)]);
  for (const cls of selectors) {
    assert.ok(cls.startsWith('xr-'), `.${cls} is not prefixed`);
    assert.ok(mapped.has(cls), `.${cls} has no entry in classes.ts`);
  }
});

test('no component uses a class the maps lack', async () => {
  const files = (await readdir(src)).filter((f) => f.endsWith('.tsx'));
  assert.ok(files.length >= 4);
  for (const file of files) {
    const text = await readFile(new URL(file, src), 'utf8');
    for (const [, name] of text.matchAll(/\bstyles\.(\w+)/g)) assert.ok(name in styles || name in rhythmStyles, `${file}: styles.${name}`);
    assert.doesNotMatch(text, /\bstyles\[/, `${file}: computed class lookups can't be checked`);
    assert.doesNotMatch(text, /\.module\.css/, `${file} still imports a CSS module`);
    // Literal class names would skip the map; X-ray's own classes all come from it.
    for (const [, value] of text.matchAll(/className="([^"]+)"/g)) assert.fail(`${file}: literal className "${value}"`);
  }
});

test('styles.css uses only its own custom properties, each with a fallback at the source', () => {
  const used = new Set([...rules.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]));
  for (const name of used) assert.ok(name.startsWith('--xr') || name.startsWith('--xray-'), name);
  // Every public --xray-* read has a fallback value.
  for (const m of rules.matchAll(/var\((--xray-[\w-]+)(,?)/g)) assert.equal(m[2], ',', `${m[1]} has no fallback`);
});
