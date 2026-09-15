# Vendored ScreenJSON schema

`schema.json` is vendored from
[screenjson/screenjson-schema](https://github.com/screenjson/screenjson-schema),
pinned to commit `9069c938b96ae62636976d450621eb5c0079f267` on `develop` (the
repo has no tagged releases, per `breakdown-tool-research-and-plan.md` §3.1 —
pin a commit, don't track the branch).

Source path at that commit: `src/json-schema/schema.json`.

Used only by the dev-time Ajv conformance check in
`tests/conformance.test.js` / `tests/helpers/ajv-conformance.js`. Nothing in
`src/` reads this file — see `src/core/screenjson/validate.js` for why the
shipped validator is hand-written instead.

## Known issue in this schema

Every element subtype (`$defs.action`, `$defs.dialogue`, `$defs.cue`, ...) is
composed as:

```json
{
  "allOf": [
    { "$ref": "#/$defs/element" },
    { "additionalProperties": false, "properties": { "type": "...", "text": "..." } }
  ]
}
```

`additionalProperties: false` only considers the properties declared in its
*own* schema object, not its `allOf` siblings — so `id`/`authors` (declared on
`element`) get rejected as unexpected by the second branch, and `type`/`text`
get rejected as unexpected by `element`'s own `additionalProperties: false`.
No element instance can pass this schema as published. `ajv-conformance.js`
patches this at load time (hoists `unevaluatedProperties: false` — the 2020-12
keyword designed for exactly this) rather than working around it ad hoc.

Worth filing upstream; re-check on the next pin bump.

## Updating the pin

1. Get the new commit's SHA from the `develop` branch.
2. Re-fetch `src/json-schema/schema.json` at that commit into this file.
3. Update the commit hash above.
4. Run `npm test` — `tests/conformance.test.js` will catch both new schema
   requirements BreakCraft doesn't yet satisfy and whether the
   `additionalProperties`/`allOf` bug above has been fixed upstream (if so,
   simplify `fixAllOfAdditionalPropertiesComposition` accordingly).
