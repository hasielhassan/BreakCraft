/**
 * Fountain -> ScreenJSON importer.
 *
 * Implements the parts of the Fountain spec that carry production meaning:
 * title page, scene headings (including forced `.`), character cues (including
 * forced `@` and dual dialogue `^`), parentheticals, dialogue, transitions
 * (including forced `>`), forced action `!`, centred text, and scene numbers.
 *
 * Deliberately dropped, because they have no ScreenJSON representation and no
 * bearing on a breakdown: sections (`#`), synopses (`=`), notes (`[[ ]]`) and
 * the boneyard. Emphasis markup (`*bold*`) is stripped to plain text — the tag
 * offsets stored by the breakdown are offsets into plain text, so keeping
 * markup would shift every highlight.
 */

import { ScreenJSONBuilder, originFromExtension, splitCue } from '../screenjson/builder.js';
import { looksLikeSceneHeading, parseSlugline } from './slugline.js';

const TITLE_KEY_RE = /^([A-Za-z][A-Za-z0-9 _-]*):\s*(.*)$/;
const FORCED_SCENE_RE = /^\.(?!\.)/;
const FORCED_CHARACTER_RE = /^@/;
const FORCED_ACTION_RE = /^!/;
const FORCED_TRANSITION_RE = /^>/;
const CENTERED_RE = /^>\s*(.*?)\s*<$/;
const PAGE_BREAK_RE = /^={3,}$/;
const SECTION_RE = /^#{1,6}\s/;
const SYNOPSIS_RE = /^=(?!=)/;

/**
 * A cue is an all-caps line that is followed by dialogue. Numbers, `(V.O.)` and
 * an optional trailing `^` for dual dialogue are permitted; anything containing
 * lowercase letters outside a parenthetical is not a cue.
 */
const CUE_RE = /^[A-Z0-9][A-Z0-9 .'’#&_-]*(?:\s*\([^)]*\))?\s*\^?$/;

const TRANSITION_RE = /^[A-Z0-9 '’.-]+TO:$/;
const STANDALONE_TRANSITIONS = new Set([
  'FADE IN:',
  'FADE OUT.',
  'FADE OUT:',
  'FADE TO BLACK.',
  'CUT TO BLACK.',
  'THE END',
  'SMASH CUT:',
  'MATCH CUT:'
]);

const SHOT_RE = /^(ANGLE ON|CLOSE ON|CLOSE UP|EXTREME CLOSE UP|WIDE ON|WIDE SHOT|PUSH IN|PULL BACK|INSERT|TRACKING SHOT|AERIAL SHOT|POV SHOT|REVERSE ANGLE)\b/i;

/**
 * @param {string} source raw .fountain text
 * @returns {{document: object, notices: string[]}}
 */
export function parseFountain(source) {
  const notices = [];
  const text = stripBoneyard(String(source || '')).replace(/\r\n?/g, '\n');
  const { titlePage, bodyStart } = parseTitlePage(text);

  const builder = new ScreenJSONBuilder({
    title: titlePage.title || 'Untitled',
    authors: parseAuthors(titlePage.author || titlePage.authors || titlePage.credit)
  });

  if (titlePage.extra) builder.setCoverExtra(titlePage.extra);

  const lines = text.slice(bodyStart).split('\n');

  // Dialogue state: which character the next dialogue block belongs to.
  let pendingCharacter = null;
  let pendingOrigin = null;
  let pendingDual = false;
  let sceneCount = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const line = raw.trim();

    if (!line) {
      pendingCharacter = null;
      pendingOrigin = null;
      pendingDual = false;
      continue;
    }

    if (PAGE_BREAK_RE.test(line) || SECTION_RE.test(line) || SYNOPSIS_RE.test(line)) {
      continue;
    }

    const stripped = stripInlineMarkup(stripNotes(line));
    if (!stripped) continue;

    // --- Scene heading -----------------------------------------------------
    if (FORCED_SCENE_RE.test(stripped) || looksLikeSceneHeading(stripped)) {
      const headingSource = FORCED_SCENE_RE.test(stripped) ? stripped.slice(1) : stripped;
      const heading = parseSlugline(headingSource);
      builder.startScene(heading);
      sceneCount += 1;
      pendingCharacter = null;
      continue;
    }

    // --- Forced action -----------------------------------------------------
    if (FORCED_ACTION_RE.test(stripped)) {
      builder.pushAction(stripped.slice(1));
      pendingCharacter = null;
      continue;
    }

    // --- Centred text ------------------------------------------------------
    const centered = stripped.match(CENTERED_RE);
    if (centered) {
      builder.pushGeneral(centered[1]);
      pendingCharacter = null;
      continue;
    }

    // --- Transitions -------------------------------------------------------
    if (FORCED_TRANSITION_RE.test(stripped)) {
      builder.pushTransition(stripped.slice(1).trim());
      pendingCharacter = null;
      continue;
    }
    if (isTransition(stripped)) {
      builder.pushTransition(stripped);
      pendingCharacter = null;
      continue;
    }

    // --- Parenthetical (only inside a dialogue block) -----------------------
    if (pendingCharacter && /^\(.*\)$/.test(stripped)) {
      builder.pushParenthetical(stripped);
      continue;
    }

    // --- Dialogue continuation ---------------------------------------------
    if (pendingCharacter) {
      builder.pushDialogue(stripped, {
        characterId: pendingCharacter,
        origin: pendingOrigin,
        dual: pendingDual
      });
      continue;
    }

    // --- Character cue -----------------------------------------------------
    const forcedCue = FORCED_CHARACTER_RE.test(stripped);
    const cueCandidate = forcedCue ? stripped.slice(1).trim() : stripped;
    const nextLine = (lines[i + 1] || '').trim();

    if ((forcedCue || isCue(cueCandidate)) && nextLine) {
      let cueText = cueCandidate;
      let dual = false;
      if (cueText.endsWith('^')) {
        dual = true;
        cueText = cueText.slice(0, -1).trim();
      }

      const { character } = builder.pushCue(cueText);
      const { extension } = splitCue(cueText);
      pendingCharacter = character.id;
      pendingOrigin = originFromExtension(extension);
      pendingDual = dual;
      continue;
    }

    // --- Shot --------------------------------------------------------------
    if (SHOT_RE.test(stripped) && stripped === stripped.toUpperCase()) {
      builder.pushShot(stripped);
      continue;
    }

    // --- Action (default) --------------------------------------------------
    builder.pushAction(stripped);
  }

  if (!sceneCount) {
    notices.push(
      'No scene headings were found. The whole script was placed in a single placeholder scene.'
    );
  }

  return { document: builder.build(), notices };
}

/** Remove `/* ... *&#47;` boneyard blocks. */
function stripBoneyard(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Remove `[[inline notes]]`. */
function stripNotes(line) {
  return line.replace(/\[\[[\s\S]*?\]\]/g, '').trim();
}

/**
 * Strip Fountain emphasis markers.
 *
 * Tag offsets are recorded against the plain text stored in ScreenJSON, so the
 * markers must not survive into the document or every highlight in an
 * emphasised paragraph would be misaligned.
 */
function stripInlineMarkup(line) {
  return line
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .trim();
}

function isTransition(line) {
  if (STANDALONE_TRANSITIONS.has(line.toUpperCase())) return true;
  if (line !== line.toUpperCase()) return false;
  return TRANSITION_RE.test(line);
}

function isCue(line) {
  if (line.length > 80) return false;
  if (!CUE_RE.test(line)) return false;
  // A line of pure punctuation or digits is not a name.
  if (!/[A-Z]/.test(line)) return false;
  // Sluglines and transitions are caught earlier, but guard anyway.
  if (looksLikeSceneHeading(line)) return false;
  return true;
}

/**
 * Parse the Fountain title page: `Key: value` pairs, optionally continued on
 * indented following lines, terminated by the first blank line.
 */
function parseTitlePage(text) {
  const result = { fields: {}, title: '', author: '', credit: '', extra: '' };
  const lines = text.split('\n');

  // A title page only exists if the very first non-empty line is a key.
  let firstContent = 0;
  while (firstContent < lines.length && !lines[firstContent].trim()) firstContent += 1;
  if (firstContent >= lines.length || !TITLE_KEY_RE.test(lines[firstContent].trim())) {
    return { titlePage: result, bodyStart: 0 };
  }

  let i = firstContent;
  let currentKey = null;
  const fields = {};

  for (; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim()) break;

    const match = line.trim().match(TITLE_KEY_RE);
    if (match) {
      currentKey = match[1].trim().toLowerCase();
      fields[currentKey] = match[2].trim();
    } else if (currentKey) {
      fields[currentKey] = `${fields[currentKey]} ${line.trim()}`.trim();
    }
  }

  const bodyStart = lines.slice(0, i + 1).join('\n').length;

  const known = new Set(['title', 'credit', 'author', 'authors', 'source', 'draft date', 'contact', 'notes', 'copyright']);
  const extra = Object.entries(fields)
    .filter(([key]) => !known.has(key))
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');

  return {
    titlePage: {
      fields,
      title: fields.title || '',
      author: fields.author || fields.authors || '',
      credit: fields.credit || '',
      extra
    },
    bodyStart
  };
}

/**
 * Split an author string into `{given, family}` records.
 *
 * The schema requires both a given and a family name, so single-word credits
 * ("Anonymous") get a placeholder family name rather than failing validation.
 */
export function parseAuthors(value) {
  const source = String(value || '').trim();
  if (!source) return [];

  return source
    .split(/\s*(?:,|&|\band\b)\s*/i)
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => {
      const parts = name.split(/\s+/);
      if (parts.length === 1) return { given: parts[0], family: '-' };
      return { given: parts.slice(0, -1).join(' '), family: parts[parts.length - 1] };
    });
}
