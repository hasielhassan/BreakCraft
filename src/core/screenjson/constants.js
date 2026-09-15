/**
 * Constants mirrored from the published ScreenJSON schema
 * (screenjson/screenjson-schema, Draft 2026-01).
 *
 * These are duplicated here rather than read from the schema at runtime so the
 * app has no fetch dependency. `npm run check:schema` diffs them against the
 * vendored copy in `vendor/screenjson-schema/` and fails on drift.
 */

export const SCREENJSON_VERSION = '1.0.0';

export const GENERATOR = {
  name: 'BreakCraft',
  version: '0.1.0'
};

/** Scene body element types (the discriminated union on `type`). */
export const ELEMENT_TYPES = Object.freeze({
  ACTION: 'action',
  CHARACTER: 'character',
  DIALOGUE: 'dialogue',
  PARENTHETICAL: 'parenthetical',
  TRANSITION: 'transition',
  SHOT: 'shot',
  GENERAL: 'general'
});

/** Element types that carry a `text` map. A `character` cue does not. */
export const TEXT_ELEMENT_TYPES = Object.freeze([
  ELEMENT_TYPES.ACTION,
  ELEMENT_TYPES.DIALOGUE,
  ELEMENT_TYPES.PARENTHETICAL,
  ELEMENT_TYPES.TRANSITION,
  ELEMENT_TYPES.SHOT,
  ELEMENT_TYPES.GENERAL
]);

/** `slugline.context` enum. */
export const SLUGLINE_CONTEXTS = Object.freeze([
  'I/E',
  'INT/EXT',
  'EXT/INT',
  'INT',
  'EXT',
  'POV'
]);

/** Enumerated `slugline.time` values. Custom values are also legal. */
export const SLUGLINE_TIMES = Object.freeze([
  'DAY',
  'NIGHT',
  'DAWN',
  'DUSK',
  'LATER',
  'MOMENTS LATER',
  'CONTINUOUS',
  'MORNING',
  'AFTERNOON',
  'EVENING',
  'THE NEXT DAY'
]);

/** `dialogue.origin` enum. Anything else must be dropped or kept in `display`. */
export const DIALOGUE_ORIGINS = Object.freeze([
  'V.O',
  'V.O.',
  'O.S',
  'O.S.',
  'O.C',
  'O.C.',
  'FILTER'
]);

/**
 * Scene-level production tag fields. Every one is an array of slugs; there is no
 * room for offsets, quantities or confidence, which is why BreakCraft keeps the
 * authoritative breakdown in its own sidecar and treats these as a projection.
 */
export const SCENE_TAG_FIELDS = Object.freeze([
  'animals',
  'extra',
  'locations',
  'moods',
  'props',
  'sfx',
  'sounds',
  'tags',
  'vfx',
  'wardrobe'
]);

/** Slug constraints from `$defs/slug`. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** `meta` is a string->string map; values are capped at 2048 characters. */
export const META_VALUE_MAX = 2048;
export const META_KEY_PATTERN = /^[A-Za-z0-9_.:-]{1,64}$/;

/** Default language used when a source format carries no language information. */
export const DEFAULT_LANG = 'en';
export const DEFAULT_CHARSET = 'utf-8';
export const DEFAULT_DIR = 'ltr';
