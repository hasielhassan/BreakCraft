/**
 * Read-side accessors for ScreenJSON documents.
 *
 * The UI, the breakdown engine and the exporters all need the same handful of
 * traversals. Keeping them here means the shape of the format is understood in
 * exactly one place, which matters because `text` is a language map rather than
 * a string and `character` cues carry no text of their own.
 */

import { ELEMENT_TYPES, TEXT_ELEMENT_TYPES } from './constants.js';

/** The document's primary language, with a safe fallback. */
export function docLang(doc) {
  return doc?.lang || 'en';
}

/**
 * Read a `text` map in the preferred language.
 *
 * Falls back to any available language rather than returning empty: a French
 * script opened with `lang: 'en'` should still render its dialogue.
 */
export function readText(textMap, lang) {
  if (!textMap || typeof textMap !== 'object') return '';
  if (lang && typeof textMap[lang] === 'string') return textMap[lang];
  const first = Object.values(textMap).find((v) => typeof v === 'string');
  return first || '';
}

/** Plain text of an element, or '' for cues (which have no text field). */
export function elementText(element, lang) {
  if (!element || !TEXT_ELEMENT_TYPES.includes(element.type)) return '';
  return readText(element.text, lang);
}

/** True when this element can hold breakdown tags (i.e. it has taggable text). */
export function isTaggable(element) {
  return Boolean(element) && TEXT_ELEMENT_TYPES.includes(element.type);
}

/** The rendered display string for a character cue. */
export function cueDisplay(element, charactersById) {
  if (!element || element.type !== ELEMENT_TYPES.CHARACTER) return '';
  if (element.display) return element.display;
  return charactersById.get(element.character)?.name || 'UNKNOWN';
}

export function scenes(doc) {
  return doc?.document?.scenes || [];
}

export function characters(doc) {
  return doc?.characters || [];
}

/** Map of character id -> character object. */
export function charactersById(doc) {
  return new Map(characters(doc).map((c) => [c.id, c]));
}

/** Map of scene id -> scene object. */
export function scenesById(doc) {
  return new Map(scenes(doc).map((s) => [s.id, s]));
}

/** Map of element id -> `{ element, scene, sceneIndex, elementIndex }`. */
export function elementIndex(doc) {
  const index = new Map();
  scenes(doc).forEach((scene, sceneIndex) => {
    (scene.body || []).forEach((element, elementIndexInScene) => {
      index.set(element.id, { element, scene, sceneIndex, elementIndex: elementIndexInScene });
    });
  });
  return index;
}

/** Iterate every element in document order. */
export function* iterateElements(doc) {
  for (const scene of scenes(doc)) {
    for (const element of scene.body || []) {
      yield { scene, element };
    }
  }
}

/** Render a slugline back to its conventional single-line form. */
export function formatSlugline(heading) {
  if (!heading) return '';
  const parts = [`${heading.context}.`, heading.setting];
  const mods = heading.mods?.length ? ` - ${heading.mods.join(' - ')}` : '';
  return `${parts.join(' ')}${mods} - ${heading.time}`;
}

/**
 * The production scene number as displayed: the integer `no` when present,
 * otherwise the alphanumeric label preserved in meta, otherwise the 1-based
 * ordinal position.
 */
export function sceneNumber(scene, ordinal) {
  const label = scene?.heading?.meta?.['scene.number'];
  if (label) return label;
  if (Number.isInteger(scene?.heading?.no)) return String(scene.heading.no);
  return String(ordinal + 1);
}

/** Flatten the whole script to plain text (used for search and diffing). */
export function sceneText(scene, lang) {
  return (scene.body || [])
    .map((element) => elementText(element, lang))
    .filter(Boolean)
    .join('\n');
}

/** Speaking characters in a scene, in first-appearance order. */
export function speakingCast(scene) {
  const seen = [];
  for (const element of scene.body || []) {
    if (element.type === ELEMENT_TYPES.CHARACTER && !seen.includes(element.character)) {
      seen.push(element.character);
    }
  }
  return seen;
}
