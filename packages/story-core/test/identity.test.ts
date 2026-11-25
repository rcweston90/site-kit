import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { sha256Hex, stableJson, storyDocumentId } from '../src/identity.ts';

test('the plain SHA-256 matches node:crypto for many lengths and inputs', () => {
  for (let length = 0; length < 300; length++) {
    const bytes = randomBytes(length);
    assert.equal(sha256Hex(bytes), createHash('sha256').update(bytes).digest('hex'));
  }
  const text = 'Café, naïve, 日本語, and an emoji 🙂';
  assert.equal(sha256Hex(text), createHash('sha256').update(text).digest('hex'));
});

test('stable JSON sorts keys and drops undefined', () => {
  assert.equal(stableJson({ b: 1, a: { d: undefined, c: [2, { z: 1, y: 0 }] } }), '{"a":{"c":[2,{"y":0,"z":1}]},"b":1}');
  assert.throws(() => stableJson({ n: Number.NaN }), /non-finite/);
});

test('document ids are built from a valid slug and version', () => {
  assert.equal(storyDocumentId('field-notes', 3), 'story:field-notes:v3');
  assert.throws(() => storyDocumentId('Bad Slug', 1));
  assert.throws(() => storyDocumentId('ok', 0));
});
