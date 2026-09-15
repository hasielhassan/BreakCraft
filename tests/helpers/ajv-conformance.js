/**
 * Ajv conformance helper — test-only, never imported from `src/`.
 *
 * BreakCraft ships with zero runtime dependencies beyond React (see README);
 * the hand-written validator in `src/core/screenjson/validate.js` is what
 * actually runs in the browser. Ajv exists only here, as a second opinion in
 * CI: it checks the real vendored schema against documents the hand-written
 * validator already accepts, so a gap in that validator's coverage shows up
 * as a test failure instead of shipping silently.
 *
 * The vendored schema's `$schema` is a custom ScreenJSON URI
 * (`https://screenjson.com/draft/2026-01/schema`) that Ajv does not
 * recognise; everything else in the document already conforms to the
 * 2020-12 vocabulary (`$defs`, etc.), so rewriting just that one field is
 * enough — no other build step is needed.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(here, '..', '..', 'vendor', 'screenjson-schema', 'schema.json');
const rawSchema = JSON.parse(readFileSync(schemaPath, 'utf8'));

/**
 * Works around a composition bug in the vendored schema (as of the pinned
 * commit — see vendor/screenjson-schema/schema.json).
 *
 * Every element subtype (`action`, `dialogue`, `cue`, ...) is written as
 * `allOf: [{$ref: "#/$defs/element"}, {additionalProperties: false, properties: {type, text, ...}}]`.
 * `additionalProperties: false` only ever looks at the properties declared in
 * its *own* schema object — it does not know about its `allOf` sibling — so
 * every real element (which needs fields from both halves: `id`/`authors`
 * from `element`, `type`/`text` from the subtype) fails on both sides at
 * once. This is what JSON Schema 2020-12's `unevaluatedProperties` keyword
 * exists to fix: declared once at the level composing the `allOf`, it sees
 * everything every branch already matched.
 *
 * This rewrites just that pattern — dropping the inner `additionalProperties`
 * and hoisting a single `unevaluatedProperties: false` up to the `allOf`
 * itself — for any `$defs` entry shaped that way, so a real, spec-conformant
 * document validates the way the schema's authors clearly intended.
 */
function fixAllOfAdditionalPropertiesComposition(schema) {
  const patched = structuredClone(schema);
  const defs = patched.$defs ?? {};
  const refName = (ref) => ref?.match(/^#\/\$defs\/([^/]+)$/)?.[1];

  for (const def of Object.values(defs)) {
    if (!Array.isArray(def.allOf)) continue;
    const hasComposedAdditionalProperties = def.allOf.some(
      (branch) => branch.additionalProperties === false && branch.properties
    );
    if (!hasComposedAdditionalProperties) continue;

    for (const branch of def.allOf) {
      // The inline "extension" half, e.g. { type: object, additionalProperties: false, properties: {...} }.
      if (branch.additionalProperties === false) delete branch.additionalProperties;
      // The referenced "base" half, e.g. { $ref: "#/$defs/element" } — same bug, same fix.
      const base = defs[refName(branch.$ref)];
      if (base?.additionalProperties === false) delete base.additionalProperties;
    }
    def.unevaluatedProperties = false;
  }
  return patched;
}

const schema = fixAllOfAdditionalPropertiesComposition({
  ...rawSchema,
  $schema: 'https://json-schema.org/draft/2020-12/schema'
});

const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
const validateFn = ajv.compile(schema);

/** Converts an Ajv JSON Pointer instancePath into the `$.a.b[0].c` style used elsewhere. */
function toDotPath(instancePath) {
  const segments = instancePath.split('/').filter(Boolean);
  let path = '$';
  for (const segment of segments) {
    path += /^\d+$/.test(segment) ? `[${segment}]` : `.${segment}`;
  }
  return path;
}

/**
 * Validates a document against the real vendored ScreenJSON schema.
 *
 * @returns {{valid: boolean, errors: Array<{path: string, message: string}>}}
 */
export function checkSchemaConformance(doc) {
  const valid = validateFn(doc);
  const errors = (validateFn.errors || []).map((error) => ({
    path: toDotPath(error.instancePath) + (error.params?.missingProperty ? `.${error.params.missingProperty}` : ''),
    message: error.message
  }));
  return { valid, errors };
}
