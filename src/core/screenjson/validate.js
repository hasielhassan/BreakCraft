/**
 * ScreenJSON validation.
 *
 * Two passes, matching the guidance in the schema's own README:
 *
 *  1. Structural — required fields, enums, patterns and cardinalities for the
 *     subset of the schema BreakCraft actually produces and consumes.
 *  2. Relational — the things JSON Schema cannot express: character foreign
 *     keys, element/scene back-references, duplicate ids.
 *
 * This is deliberately *not* a general JSON Schema validator, and it stays
 * that way on purpose: this file ships in the browser bundle, and README
 * promises zero runtime dependencies beyond React. A real JSON Schema
 * validator (Ajv) against the vendored schema at `vendor/screenjson-schema/`
 * does exist, but only as a dev-time conformance check in
 * `tests/conformance.test.js` — it confirms every document this validator
 * accepts is genuinely schema-valid, without shipping Ajv to users. See that
 * file and `tests/helpers/ajv-conformance.js` for details, including a real
 * `allOf`/`additionalProperties` composition bug in the vendored schema that
 * the conformance harness works around.
 */

import { isUuid } from '../../utils/uuid.js';
import {
  DIALOGUE_ORIGINS,
  ELEMENT_TYPES,
  META_KEY_PATTERN,
  META_VALUE_MAX,
  SCENE_TAG_FIELDS,
  SLUGLINE_CONTEXTS,
  SLUG_PATTERN,
  TEXT_ELEMENT_TYPES
} from './constants.js';

const LANG_PATTERN = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;
const CHARSET_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{1,31}$/;

class Report {
  constructor() {
    this.errors = [];
    this.warnings = [];
  }

  error(path, message) {
    this.errors.push({ path, message });
  }

  warn(path, message) {
    this.warnings.push({ path, message });
  }

  get valid() {
    return this.errors.length === 0;
  }
}

function checkTextMap(report, path, value, { required = true } = {}) {
  if (value === undefined) {
    if (required) report.error(path, 'missing required text map');
    return;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    report.error(path, 'text must be an object keyed by language tag');
    return;
  }
  const keys = Object.keys(value);
  if (required && keys.length === 0) {
    report.error(path, 'text map is empty');
  }
  for (const key of keys) {
    if (!LANG_PATTERN.test(key)) {
      report.error(`${path}.${key}`, 'not a valid BCP 47 language tag');
    }
    if (typeof value[key] !== 'string') {
      report.error(`${path}.${key}`, 'text value must be a string');
    }
  }
}

function checkMeta(report, path, meta) {
  if (meta === undefined) return;
  if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) {
    report.error(path, 'meta must be a string map');
    return;
  }
  for (const [key, value] of Object.entries(meta)) {
    if (!META_KEY_PATTERN.test(key)) {
      report.error(`${path}.${key}`, 'meta key does not match the allowed pattern');
    }
    if (typeof value !== 'string') {
      report.error(`${path}.${key}`, 'meta values must be strings');
    } else if (value.length > META_VALUE_MAX) {
      report.error(`${path}.${key}`, `meta value exceeds ${META_VALUE_MAX} characters`);
    }
  }
}

function checkSlugArray(report, path, values) {
  if (values === undefined) return;
  if (!Array.isArray(values)) {
    report.error(path, 'expected an array of slugs');
    return;
  }
  const seen = new Set();
  values.forEach((slug, i) => {
    if (typeof slug !== 'string' || !SLUG_PATTERN.test(slug) || slug.length < 3 || slug.length > 50) {
      report.error(`${path}[${i}]`, `"${slug}" is not a valid slug`);
    }
    if (seen.has(slug)) report.error(`${path}[${i}]`, `duplicate slug "${slug}"`);
    seen.add(slug);
  });
}

function checkHeading(report, path, heading) {
  if (!heading || typeof heading !== 'object') {
    report.error(path, 'scene is missing its heading');
    return;
  }
  if (!SLUGLINE_CONTEXTS.includes(heading.context)) {
    report.error(`${path}.context`, `"${heading.context}" is not a valid slugline context`);
  }
  if (typeof heading.setting !== 'string' || !heading.setting.length || heading.setting.length > 200) {
    report.error(`${path}.setting`, 'setting must be a string of 1-200 characters');
  }
  if (typeof heading.time !== 'string' || heading.time.length < 2 || heading.time.length > 40) {
    report.error(`${path}.time`, 'time must be a string of 2-40 characters');
  }
  if (heading.no !== undefined && (!Number.isInteger(heading.no) || heading.no < 1)) {
    report.error(`${path}.no`, 'scene number must be a positive integer');
  }
  checkMeta(report, `${path}.meta`, heading.meta);
}

function checkElement(report, path, element, ctx) {
  if (!element || typeof element !== 'object') {
    report.error(path, 'element is not an object');
    return;
  }

  if (!isUuid(element.id)) report.error(`${path}.id`, 'missing or malformed element id');
  if (ctx.seenIds.has(element.id)) report.error(`${path}.id`, `duplicate id ${element.id}`);
  ctx.seenIds.add(element.id);

  if (!Array.isArray(element.authors) || element.authors.length < 1) {
    report.error(`${path}.authors`, 'every element requires at least one author id');
  } else {
    element.authors.forEach((id, i) => {
      if (!ctx.authorIds.has(id)) {
        report.error(`${path}.authors[${i}]`, `author ${id} is not declared at the document root`);
      }
    });
  }

  if (element.scene !== undefined && element.scene !== ctx.sceneId) {
    report.error(`${path}.scene`, 'element back-reference does not match its containing scene');
  }

  const validTypes = Object.values(ELEMENT_TYPES);
  if (!validTypes.includes(element.type)) {
    report.error(`${path}.type`, `"${element.type}" is not a known element type`);
    return;
  }

  if (TEXT_ELEMENT_TYPES.includes(element.type)) {
    checkTextMap(report, `${path}.text`, element.text);
  }

  if (element.type === ELEMENT_TYPES.CHARACTER || element.type === ELEMENT_TYPES.DIALOGUE) {
    if (!isUuid(element.character)) {
      report.error(`${path}.character`, 'missing character reference');
    } else if (!ctx.characterIds.has(element.character)) {
      report.error(`${path}.character`, `character ${element.character} is not declared at the root`);
    }
  }

  if (element.type === ELEMENT_TYPES.DIALOGUE && element.origin !== undefined) {
    if (!DIALOGUE_ORIGINS.includes(element.origin)) {
      report.error(`${path}.origin`, `"${element.origin}" is not in the dialogue origin enum`);
    }
  }

  if (Array.isArray(element.notes)) {
    element.notes.forEach((note, i) => {
      const notePath = `${path}.notes[${i}]`;
      if (!isUuid(note.id)) report.error(`${notePath}.id`, 'note requires a uuid');
      if (typeof note.created !== 'string') report.error(`${notePath}.created`, 'note requires a created timestamp');
      checkTextMap(report, `${notePath}.text`, note.text);
      if (note.color !== undefined && !SLUG_PATTERN.test(note.color)) {
        report.error(`${notePath}.color`, 'note colour must be a slug');
      }
      if (note.highlight !== undefined) {
        if (!Array.isArray(note.highlight)) {
          report.error(`${notePath}.highlight`, 'highlight must be an array of ranges');
        } else {
          note.highlight.forEach((range, r) => {
            if (!Array.isArray(range) || range.length !== 2 || !range.every(Number.isInteger)) {
              report.error(`${notePath}.highlight[${r}]`, 'range must be [start, end] integers');
            }
          });
        }
      }
      checkMeta(report, `${notePath}.meta`, note.meta);
    });
  }

  checkMeta(report, `${path}.meta`, element.meta);
}

/**
 * Validate a document.
 *
 * @returns {{valid: boolean, errors: Array, warnings: Array}}
 */
export function validateDocument(doc) {
  const report = new Report();

  if (!doc || typeof doc !== 'object') {
    report.error('$', 'document is not an object');
    return report;
  }

  if (!isUuid(doc.id)) report.error('$.id', 'document id must be a uuid');
  if (typeof doc.version !== 'string' || !SEMVER_PATTERN.test(doc.version)) {
    report.error('$.version', 'version must be semver (e.g. 1.0.0)');
  }
  checkTextMap(report, '$.title', doc.title);
  if (typeof doc.lang !== 'string' || !LANG_PATTERN.test(doc.lang)) {
    report.error('$.lang', 'lang must be a BCP 47 tag');
  }
  if (typeof doc.charset !== 'string' || !CHARSET_PATTERN.test(doc.charset)) {
    report.error('$.charset', 'charset must be an IANA label');
  }
  if (doc.dir !== 'ltr' && doc.dir !== 'rtl') {
    report.error('$.dir', 'dir must be "ltr" or "rtl"');
  }

  if (!Array.isArray(doc.authors) || doc.authors.length < 1) {
    report.error('$.authors', 'at least one author is required');
  }

  const authorIds = new Set();
  (doc.authors || []).forEach((author, i) => {
    const path = `$.authors[${i}]`;
    if (!isUuid(author?.id)) report.error(`${path}.id`, 'author id must be a uuid');
    if (!author?.given) report.error(`${path}.given`, 'author given name is required');
    if (!author?.family) report.error(`${path}.family`, 'author family name is required');
    if (authorIds.has(author?.id)) report.error(`${path}.id`, 'duplicate author id');
    authorIds.add(author?.id);
  });

  const characterIds = new Set();
  (doc.characters || []).forEach((character, i) => {
    const path = `$.characters[${i}]`;
    if (!isUuid(character?.id)) report.error(`${path}.id`, 'character id must be a uuid');
    if (typeof character?.name !== 'string' || !character.name.length) {
      report.error(`${path}.name`, 'character name is required');
    }
    if (character?.slug !== undefined && !SLUG_PATTERN.test(character.slug)) {
      report.error(`${path}.slug`, 'character slug is malformed');
    }
    if (characterIds.has(character?.id)) report.error(`${path}.id`, 'duplicate character id');
    characterIds.add(character?.id);
  });

  const container = doc.document;
  if (!container || typeof container !== 'object') {
    report.error('$.document', 'document container is missing');
    return report;
  }

  if (!container.cover) {
    report.error('$.document.cover', 'cover is required');
  } else {
    checkTextMap(report, '$.document.cover.title', container.cover.title);
    if (!Array.isArray(container.cover.authors) || container.cover.authors.length < 1) {
      report.error('$.document.cover.authors', 'cover requires at least one author id');
    }
  }

  const sceneList = container.scenes;
  if (!Array.isArray(sceneList) || sceneList.length < 1) {
    report.error('$.document.scenes', 'at least one scene is required');
    return report;
  }

  const seenIds = new Set();
  sceneList.forEach((scene, i) => {
    const path = `$.document.scenes[${i}]`;
    if (!isUuid(scene?.id)) report.error(`${path}.id`, 'scene id must be a uuid');
    if (seenIds.has(scene?.id)) report.error(`${path}.id`, 'duplicate scene id');
    seenIds.add(scene?.id);

    if (!Array.isArray(scene?.authors) || scene.authors.length < 1) {
      report.error(`${path}.authors`, 'scene requires at least one author id');
    }

    checkHeading(report, `${path}.heading`, scene?.heading);

    if (!Array.isArray(scene?.body)) {
      report.error(`${path}.body`, 'scene body must be an array');
    } else {
      scene.body.forEach((element, j) => {
        checkElement(report, `${path}.body[${j}]`, element, {
          seenIds,
          authorIds,
          characterIds,
          sceneId: scene.id
        });
      });
    }

    (scene?.cast || []).forEach((id, j) => {
      if (!characterIds.has(id)) {
        report.error(`${path}.cast[${j}]`, `cast references unknown character ${id}`);
      }
    });

    for (const field of SCENE_TAG_FIELDS) {
      checkSlugArray(report, `${path}.${field}`, scene?.[field]);
    }

    checkMeta(report, `${path}.meta`, scene?.meta);

    if (Array.isArray(scene?.body) && scene.body.length === 0) {
      report.warn(path, 'scene has an empty body');
    }
  });

  return report;
}

/** Convenience wrapper that throws on the first structural error. */
export function assertValidDocument(doc) {
  const report = validateDocument(doc);
  if (!report.valid) {
    const preview = report.errors
      .slice(0, 5)
      .map((e) => `${e.path}: ${e.message}`)
      .join('; ');
    throw new Error(
      `Invalid ScreenJSON document (${report.errors.length} error(s)): ${preview}`
    );
  }
  return doc;
}
