/**
 * Schema conformance suite (Ajv, dev-only).
 *
 * `core/screenjson/validate.js` is a hand-written subset validator that ships
 * in the browser bundle — see its header comment and README's "zero runtime
 * dependencies beyond React" for why. This suite is the check that subset
 * validator is honest: every document it calls `valid: true` is run here
 * against the real vendored ScreenJSON schema via Ajv. A gap between the two
 * — the hand-written validator accepting something the real schema
 * rejects — fails here instead of shipping silently.
 *
 * Ajv itself never ships; it is a devDependency used only from `tests/`.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { parseFountain } from '../src/core/parsers/fountain.js';
import { validateDocument } from '../src/core/screenjson/validate.js';
import { scenes } from '../src/core/screenjson/query.js';
import { serializeFountain } from '../src/core/serializers/script.js';
import { serializeScreenJson } from '../src/core/serializers/screenjson.js';
import { createBreakdown, addTagInstance, createInstance } from '../src/core/breakdown/model.js';
import { checkSchemaConformance } from './helpers/ajv-conformance.js';

const here = dirname(fileURLToPath(import.meta.url));
const fountainSample = readFileSync(
  join(here, '..', 'public', 'samples', 'little-red-riding-hood.fountain'),
  'utf8'
);

function load() {
  return parseFountain(fountainSample).document;
}

/** Fails with the first few Ajv errors shown, so a break is diagnosable from the test output alone. */
function assertSchemaConformant(doc, label) {
  const handWritten = validateDocument(doc);
  assert.equal(handWritten.valid, true, `${label}: hand-written validator rejected its own fixture`);

  const ajvResult = checkSchemaConformance(doc);
  const preview = ajvResult.errors
    .slice(0, 5)
    .map((e) => `${e.path}: ${e.message}`)
    .join('; ');
  assert.equal(ajvResult.valid, true, `${label}: Ajv found what the hand-written validator missed — ${preview}`);
}

test('conformance: a plain Fountain import matches the real schema', () => {
  assertSchemaConformant(load(), 'fountain import');
});

test('conformance: the Fountain sample round-trips through serialize/reparse and stays conformant', () => {
  const doc = load();
  const { document: reparsed } = parseFountain(serializeFountain(doc));
  assertSchemaConformant(reparsed, 'fountain round-trip');
});

test('conformance: the ScreenJSON export projection (tags + note highlights) matches the real schema', () => {
  const doc = load();
  const scene = scenes(doc)[0];
  const element = scene.body.find((e) => e.type === 'action');
  const text = element.text.en;
  const start = [...text.slice(0, text.indexOf('table'))].length;

  let breakdown = createBreakdown(doc);
  breakdown = addTagInstance(breakdown, {
    category: 'props',
    label: 'Worn Table',
    instance: createInstance({
      scene,
      element,
      start,
      end: start + 'table'.length,
      text: 'table'
    })
  });

  const exported = serializeScreenJson(doc, breakdown);
  assertSchemaConformant(exported, 'screenjson export');
});

test('conformance: the FDX sample matches the real schema', async () => {
  if (typeof globalThis.DOMParser === 'undefined') {
    const { DOMParser } = await import('linkedom');
    globalThis.DOMParser = DOMParser;
  }
  const { parseFdx } = await import('../src/core/parsers/fdx.js');
  const fdx = readFileSync(join(here, '..', 'public', 'samples', 'three-bears.fdx'), 'utf8');
  const { document } = parseFdx(fdx);
  assertSchemaConformant(document, 'fdx import');
});

test('conformance: the Ajv harness itself actually catches a broken document', () => {
  const doc = load();
  const broken = { ...doc, document: { ...doc.document, scenes: [] } };
  const { valid, errors } = checkSchemaConformance(broken);
  assert.equal(valid, false);
  assert.ok(errors.length > 0);
});
