/**
 * Text helpers shared by the parsers, the tagging model and the exporters.
 *
 * Offset convention
 * -----------------
 * ScreenJSON `note.highlight` ranges are documented as *Unicode codepoint*
 * indices, but the DOM Selection API reports *UTF-16 code unit* indices. Any
 * script containing emoji or astral characters would silently drift between the
 * two. All tag instances are stored in codepoint space; conversion happens at
 * the DOM boundary only (see `codePointToUnit` / `unitToCodePoint`).
 */

const SLUG_MAX = 50;
const SLUG_MIN = 3;

/**
 * Convert arbitrary text into a ScreenJSON `slug`:
 * `^[a-z0-9]+(?:-[a-z0-9]+)*$`, 3-50 characters.
 *
 * Returns `null` when nothing usable survives, so callers can decide whether to
 * skip the value rather than emitting an invalid document.
 */
export function slugify(input) {
  if (typeof input !== 'string') return null;

  const slug = input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining accents
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, '');

  if (slug.length < SLUG_MIN) return null;
  return slug;
}

/** Collapse whitespace and case for comparison keys. */
export function normalizeKey(input) {
  return String(input || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Uppercase display form used for character cues and sluglines. */
export function toDisplayCase(input) {
  return String(input || '').replace(/\s+/g, ' ').trim().toUpperCase();
}

/**
 * Naive English singulariser, good enough to join "GLASSES" / "GLASS" style
 * duplicates in the element library. Deliberately conservative: when in doubt it
 * returns the input unchanged rather than mangling a proper noun.
 */
export function singularize(word) {
  const w = String(word || '');
  if (w.length < 4) return w;
  if (/(ss|us|is)$/i.test(w)) return w;
  if (/ies$/i.test(w)) return w.slice(0, -3) + 'y';
  if (/(ch|sh|x|z|s)es$/i.test(w)) return w.slice(0, -2);
  if (/s$/i.test(w)) return w.slice(0, -1);
  return w;
}

/** Number of Unicode codepoints in a string. */
export function codePointLength(str) {
  let count = 0;
  for (const _ of str) count += 1;
  return count;
}

/** Convert a UTF-16 code unit index into a codepoint index. */
export function unitToCodePoint(str, unitIndex) {
  let units = 0;
  let points = 0;
  for (const ch of str) {
    if (units >= unitIndex) return points;
    units += ch.length;
    points += 1;
  }
  return points;
}

/** Convert a codepoint index into a UTF-16 code unit index. */
export function codePointToUnit(str, pointIndex) {
  let units = 0;
  let points = 0;
  for (const ch of str) {
    if (points >= pointIndex) return units;
    units += ch.length;
    points += 1;
  }
  return units;
}

/** Slice a string using codepoint offsets. */
export function sliceByCodePoints(str, start, end) {
  return str.slice(codePointToUnit(str, start), codePointToUnit(str, end));
}

/**
 * Sørensen-Dice coefficient over character bigrams, used to match scenes and
 * elements between drafts when exact keys miss.
 */
export function diceCoefficient(a, b) {
  const left = normalizeKey(a);
  const right = normalizeKey(b);
  if (!left.length || !right.length) return 0;
  if (left === right) return 1;
  if (left.length < 2 || right.length < 2) return 0;

  const bigrams = new Map();
  for (let i = 0; i < left.length - 1; i += 1) {
    const gram = left.slice(i, i + 2);
    bigrams.set(gram, (bigrams.get(gram) || 0) + 1);
  }

  let hits = 0;
  for (let i = 0; i < right.length - 1; i += 1) {
    const gram = right.slice(i, i + 2);
    const count = bigrams.get(gram) || 0;
    if (count > 0) {
      bigrams.set(gram, count - 1);
      hits += 1;
    }
  }

  return (2 * hits) / (left.length + right.length - 2);
}

/**
 * Stable non-cryptographic hash (FNV-1a, 32-bit) rendered as hex. Used for
 * scene/element anchor keys, where collision resistance matters far less than
 * determinism across sessions and machines.
 */
export function hashText(input) {
  let hash = 0x811c9dc5;
  const str = normalizeKey(input);
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** Escape a string for safe inclusion in XML/HTML text or attribute values. */
export function escapeXml(input) {
  return String(input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
