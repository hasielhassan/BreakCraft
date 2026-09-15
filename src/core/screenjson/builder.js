/**
 * Construction helpers for ScreenJSON documents.
 *
 * Every importer produces its output through this builder rather than assembling
 * object literals inline. The schema sets `additionalProperties: false` on every
 * object and marks a surprising number of fields required (`element.authors` has
 * `minItems: 1`, for instance), so centralising construction is the only
 * practical way to keep imports valid as parsers are added.
 */

import { uuid } from '../../utils/uuid.js';
import { slugify, toDisplayCase, normalizeKey } from '../../utils/text.js';
import {
  DEFAULT_CHARSET,
  DEFAULT_DIR,
  DEFAULT_LANG,
  DIALOGUE_ORIGINS,
  ELEMENT_TYPES,
  GENERATOR,
  SCREENJSON_VERSION,
  SLUGLINE_CONTEXTS
} from './constants.js';

const UNKNOWN_AUTHOR = { given: 'Unknown', family: 'Author' };

/**
 * A ScreenJSONBuilder accumulates scenes and characters, then emits a complete
 * document. Parsers drive it linearly: `startScene`, then `push*` per element.
 */
export class ScreenJSONBuilder {
  constructor({ lang = DEFAULT_LANG, title = 'Untitled', authors = [] } = {}) {
    this.lang = lang;
    this.title = title;
    this.authors = [];
    this.characters = [];
    this.scenes = [];
    this.currentScene = null;
    this.coverExtra = null;

    // Elements written before the first scene heading. "FADE IN:" ahead of the
    // opening slugline is completely standard, and inventing a placeholder scene
    // for it would add a phantom row to every breakdown. They are held here and
    // folded into the first real scene instead.
    this.preamble = [];

    // A cheap lookup so repeated cues resolve to one character object.
    this.characterIndex = new Map();

    const seedAuthors = authors.length ? authors : [UNKNOWN_AUTHOR];
    seedAuthors.forEach((a) => this.addAuthor(a));
  }

  /** The id used for `authors` on scenes and elements. */
  get primaryAuthorId() {
    return this.authors[0].id;
  }

  addAuthor({ given, family }) {
    const author = {
      id: uuid(),
      given: (given || 'Unknown').slice(0, 50),
      family: (family || 'Author').slice(0, 50)
    };
    this.authors.push(author);
    return author;
  }

  /** Build a `text` map for the document's primary language. */
  text(value) {
    return { [this.lang]: String(value ?? '') };
  }

  /**
   * Resolve a character cue to a stable character object, merging aliases.
   *
   * `JOHN`, `JOHN (V.O.)` and `JOHN (CONT'D)` are the same person; the extension
   * is stripped for identity but preserved on the cue's `display` field so the
   * script renders exactly as written.
   */
  resolveCharacter(rawCue) {
    const { name, extension } = splitCue(rawCue);
    const key = normalizeKey(name);

    let character = this.characterIndex.get(key);
    if (!character) {
      character = {
        id: uuid(),
        name: toDisplayCase(name).slice(0, 80),
        aliases: [],
        traits: []
      };
      const slug = slugify(name);
      if (slug) character.slug = slug;
      this.characters.push(character);
      this.characterIndex.set(key, character);
    }

    if (extension && !character.aliases.includes(rawCue)) {
      const alias = toDisplayCase(rawCue).slice(0, 80);
      if (alias !== character.name && !character.aliases.includes(alias)) {
        character.aliases.push(alias);
      }
    }

    return { character, extension };
  }

  startScene(heading) {
    const scene = {
      id: uuid(),
      authors: [this.primaryAuthorId],
      heading: normalizeHeading(heading),
      body: [],
      cast: []
    };

    // Adopt anything written before the first heading.
    if (!this.scenes.length && this.preamble.length) {
      for (const element of this.preamble) {
        element.scene = scene.id;
        scene.body.push(element);
        if (element.type === 'character' && !scene.cast.includes(element.character)) {
          scene.cast.push(element.character);
        }
      }
      this.preamble = [];
    }

    this.scenes.push(scene);
    this.currentScene = scene;
    return scene;
  }

  /** Where the next element goes: the current scene's body, or the preamble. */
  target() {
    return this.currentScene ? this.currentScene.body : this.preamble;
  }

  /** Base fields shared by every element in a scene body. */
  baseElement(type) {
    return {
      id: uuid(),
      scene: this.currentScene ? this.currentScene.id : null,
      authors: [this.primaryAuthorId],
      type
    };
  }

  pushText(type, value) {
    const trimmed = String(value ?? '').trim();
    if (!trimmed) return null;
    const element = { ...this.baseElement(type), text: this.text(trimmed) };
    this.target().push(element);
    return element;
  }

  pushAction(value) {
    return this.pushText(ELEMENT_TYPES.ACTION, value);
  }

  pushParenthetical(value) {
    return this.pushText(ELEMENT_TYPES.PARENTHETICAL, value);
  }

  pushTransition(value) {
    return this.pushText(ELEMENT_TYPES.TRANSITION, value);
  }

  pushShot(value) {
    return this.pushText(ELEMENT_TYPES.SHOT, value);
  }

  pushGeneral(value) {
    return this.pushText(ELEMENT_TYPES.GENERAL, value);
  }

  /** Push a character cue and register the character in the scene's cast. */
  pushCue(rawCue) {
    const { character, extension } = this.resolveCharacter(rawCue);

    const element = { ...this.baseElement(ELEMENT_TYPES.CHARACTER), character: character.id };
    const display = toDisplayCase(rawCue);
    if (display !== character.name) element.display = display.slice(0, 120);

    this.target().push(element);
    if (this.currentScene && !this.currentScene.cast.includes(character.id)) {
      this.currentScene.cast.push(character.id);
    }

    return { element, character, extension };
  }

  /** Push dialogue attributed to the most recent cue. */
  pushDialogue(value, { characterId, origin, dual = false } = {}) {
    const trimmed = String(value ?? '').trim();
    if (!trimmed || !characterId) return null;

    const element = {
      ...this.baseElement(ELEMENT_TYPES.DIALOGUE),
      character: characterId,
      text: this.text(trimmed)
    };
    if (origin && DIALOGUE_ORIGINS.includes(origin)) element.origin = origin;
    if (dual) element.dual = true;

    this.target().push(element);
    return element;
  }

  /** Store unrecognised title-page text so nothing from the source is lost. */
  setCoverExtra(value) {
    const trimmed = String(value ?? '').trim();
    if (trimmed) this.coverExtra = trimmed.slice(0, 10000);
  }

  /**
   * Emit the finished document.
   *
   * Scenes with an empty body are kept: the schema explicitly allows them
   * ("Empty is allowed for outlining and drafting") and dropping them would
   * renumber everything downstream.
   */
  build() {
    // A script with no headings at all still needs one scene to be valid.
    if (!this.scenes.length) {
      this.startScene({ context: 'INT', setting: 'UNSPECIFIED', time: 'DAY' });
    }

    const doc = {
      id: uuid(),
      version: SCREENJSON_VERSION,
      generator: { ...GENERATOR },
      title: { [this.lang]: this.title || 'Untitled' },
      lang: this.lang,
      charset: DEFAULT_CHARSET,
      dir: DEFAULT_DIR,
      authors: this.authors,
      characters: this.characters,
      document: {
        cover: {
          title: { [this.lang]: this.title || 'Untitled' },
          authors: this.authors.map((a) => a.id)
        },
        scenes: this.scenes
      }
    };

    if (this.coverExtra) doc.document.cover.extra = this.text(this.coverExtra);

    return doc;
  }
}

/**
 * Split `JOHN (V.O.)` into `{ name: 'JOHN', extension: 'V.O.' }`.
 *
 * Only a trailing parenthetical is treated as an extension. A name that is
 * itself parenthesised, or that contains an interior parenthetical, is left
 * alone rather than guessed at.
 */
export function splitCue(rawCue) {
  const source = String(rawCue || '').trim();
  const match = source.match(/^(.*?)\s*\(([^()]*)\)\s*$/);
  if (!match || !match[1]) return { name: source, extension: null };
  return { name: match[1].trim(), extension: match[2].trim().toUpperCase() };
}

/**
 * Map a cue extension onto the `dialogue.origin` enum.
 *
 * The enum is closed, so `(INTO PHONE)` and similar directions map to `null` and
 * survive only on the cue's `display` string.
 */
export function originFromExtension(extension) {
  if (!extension) return null;
  const normalized = extension.replace(/\s+/g, '').toUpperCase();
  const table = {
    VO: 'V.O.',
    'V.O': 'V.O.',
    'V.O.': 'V.O.',
    OS: 'O.S.',
    'O.S': 'O.S.',
    'O.S.': 'O.S.',
    OC: 'O.C.',
    'O.C': 'O.C.',
    'O.C.': 'O.C.',
    FILTER: 'FILTER'
  };
  return table[normalized] || null;
}

/** Coerce a parsed heading into a schema-valid `slugline`. */
export function normalizeHeading(heading = {}) {
  const context = SLUGLINE_CONTEXTS.includes(heading.context) ? heading.context : 'INT';
  const setting = String(heading.setting || 'UNSPECIFIED').trim().slice(0, 200) || 'UNSPECIFIED';

  // `time` requires 2-40 chars matching an uppercase pattern when not one of the
  // enumerated values, so anything shorter or stranger falls back to DAY.
  let time = String(heading.time || 'DAY').trim().toUpperCase().slice(0, 40);
  if (!/^[A-Z0-9][A-Z0-9 .’'/-]{1,39}$/.test(time)) time = 'DAY';

  const slugline = { context, setting: setting.toUpperCase(), time };

  if (Number.isInteger(heading.no) && heading.no >= 1) slugline.no = heading.no;
  if (Array.isArray(heading.mods) && heading.mods.length) {
    slugline.mods = [...new Set(heading.mods.map((m) => String(m).slice(0, 40)))];
  }

  // `slugline.no` is an integer, but production scene numbers are frequently
  // alphanumeric after a revision ("12A", "A101"). Those are preserved verbatim
  // in meta so re-export and reporting can show the real number.
  if (heading.numberLabel && !/^\d+$/.test(String(heading.numberLabel))) {
    slugline.meta = { 'scene.number': String(heading.numberLabel).slice(0, 40) };
  }

  return slugline;
}
