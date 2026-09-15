/**
 * Slugline parsing, shared by every importer.
 *
 * A slugline is the one piece of a screenplay with a genuine grammar, so this is
 * fully deterministic. The only judgement call is where the setting ends and the
 * time-of-day begins, which is resolved by matching the last ` - ` separated
 * segment against known time values before falling back to positional splitting.
 */

import { SLUGLINE_TIMES } from '../screenjson/constants.js';

/** Prefixes that mark a line as a scene heading, longest first so INT/EXT wins. */
const CONTEXT_PATTERNS = [
  { re: /^INT\.?\s*\/\s*EXT\.?[\s.]/i, context: 'INT/EXT' },
  { re: /^EXT\.?\s*\/\s*INT\.?[\s.]/i, context: 'EXT/INT' },
  { re: /^I\s*\/\s*E[\s.]/i, context: 'I/E' },
  { re: /^INT\.?[\s.]/i, context: 'INT' },
  { re: /^EXT\.?[\s.]/i, context: 'EXT' },
  { re: /^EST\.?[\s.]/i, context: 'EXT' }, // establishing shots are exteriors
  { re: /^POV[\s.]/i, context: 'POV' }
];

/**
 * Modifiers that appear inside a slugline but describe the scene rather than
 * the location. They are lifted into `mods` so grouping by set is not polluted
 * by "(FLASHBACK)" variants of the same location.
 *
 * Deliberately excluded: CONTINUOUS, SAME and MOMENTS LATER. They look like
 * modifiers but they are times of day, and treating them as mods would silently
 * reset every such scene to DAY.
 */
const KNOWN_MODS = [
  'FLASHBACK',
  'FLASH FORWARD',
  'FLASHFORWARD',
  'INTERCUT',
  'ESTABLISHING',
  'DREAM',
  'DREAM SEQUENCE',
  'MONTAGE',
  'SERIES OF SHOTS',
  'BACK TO SCENE'
];

const TIME_HINTS = [
  ...SLUGLINE_TIMES,
  'LATE NIGHT',
  'SUNRISE',
  'SUNSET',
  'MIDNIGHT',
  'NOON',
  'PRE-DAWN',
  'MAGIC HOUR',
  'SAME TIME',
  'SAME',
  'LATER THAT DAY',
  'LATER THAT NIGHT',
  'DAYS LATER',
  'YEARS LATER',
  'PRESENT DAY',
  'NIGHT - CONTINUOUS'
];

/** True when a line reads as a scene heading. */
export function looksLikeSceneHeading(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed) return false;
  return CONTEXT_PATTERNS.some(({ re }) => re.test(trimmed));
}

/**
 * Parse a raw slugline into `{ context, setting, time, mods, no, numberLabel }`.
 *
 * Handles trailing/leading production scene numbers (`12` or `#12A#`), the
 * `INT./EXT.` family, and ` - `/` -- ` separated time and modifier segments.
 */
export function parseSlugline(rawLine) {
  let line = String(rawLine || '').trim();
  const result = { context: 'INT', setting: '', time: 'DAY', mods: [], no: null, numberLabel: null };

  // Fountain-style scene numbers: INT. KITCHEN - DAY #12A#
  const hashNumber = line.match(/#([A-Za-z0-9.-]+)#\s*$/);
  if (hashNumber) {
    result.numberLabel = hashNumber[1];
    line = line.slice(0, hashNumber.index).trim();
  }

  // Shooting-script scene numbers printed in both margins: "12  INT. KITCHEN  12"
  const marginNumber = line.match(/^([A-Za-z]?\d+[A-Za-z]?)\s+(.*?)\s+\1$/);
  if (marginNumber) {
    result.numberLabel = result.numberLabel || marginNumber[1];
    line = marginNumber[2].trim();
  } else {
    const leadingNumber = line.match(/^([A-Za-z]?\d+[A-Za-z]?)[\s.)]+(?=(?:INT|EXT|EST|I\s*\/\s*E|POV))/i);
    if (leadingNumber) {
      result.numberLabel = result.numberLabel || leadingNumber[1];
      line = line.slice(leadingNumber[0].length).trim();
    }
  }

  if (result.numberLabel && /^\d+$/.test(result.numberLabel)) {
    result.no = parseInt(result.numberLabel, 10);
  }

  // Context prefix.
  for (const { re, context } of CONTEXT_PATTERNS) {
    const match = line.match(re);
    if (match) {
      result.context = context;
      line = line.slice(match[0].length).trim();
      break;
    }
  }

  // Split on ` - `, ` -- ` or an em dash surrounded by spaces.
  const segments = line
    .split(/\s+[-–—]{1,2}\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (!segments.length) {
    result.setting = 'UNSPECIFIED';
    return result;
  }

  // Pull recognised modifiers out of any segment, and parenthesised modifiers
  // out of the setting itself.
  const remaining = [];
  for (const segment of segments) {
    const bare = segment.replace(/^\(|\)$/g, '').trim().toUpperCase();
    if (KNOWN_MODS.includes(bare)) {
      result.mods.push(bare);
    } else {
      remaining.push(segment);
    }
  }

  if (!remaining.length) {
    result.setting = 'UNSPECIFIED';
    if (result.mods.length) result.time = result.mods[result.mods.length - 1];
    return result;
  }

  // The last segment is the time if it looks like one; otherwise everything is
  // the setting and the time defaults to DAY. Guessing the other way around
  // would silently corrupt location grouping, which is worse than a wrong DAY.
  const last = remaining[remaining.length - 1].toUpperCase();
  if (remaining.length > 1 && isTimeLike(last)) {
    result.time = last;
    result.setting = remaining.slice(0, -1).join(' - ');
  } else {
    result.setting = remaining.join(' - ');
  }

  // Trailing parenthetical on the setting, e.g. "KITCHEN (1975)".
  const parenthetical = result.setting.match(/^(.*?)\s*\(([^()]+)\)\s*$/);
  if (parenthetical) {
    const bare = parenthetical[2].trim().toUpperCase();
    if (KNOWN_MODS.includes(bare)) {
      result.setting = parenthetical[1].trim();
      result.mods.push(bare);
    }
  }

  result.setting = (result.setting || 'UNSPECIFIED').toUpperCase();
  result.mods = [...new Set(result.mods)];
  return result;
}

function isTimeLike(segment) {
  const value = segment.trim().toUpperCase();
  if (TIME_HINTS.includes(value)) return true;
  // "CONTINUOUS", "LATER", "MOMENTS LATER" and friends, plus anything short and
  // wordless like "DAY 2".
  if (/^(DAY|NIGHT|MORNING|EVENING|AFTERNOON|DAWN|DUSK)\b/.test(value)) return true;
  if (/^(LATER|CONTINUOUS|SAME|MOMENTS)\b/.test(value)) return true;
  return false;
}
