/**
 * Deterministic screenplay pagination.
 *
 * Everything here is arithmetic over character counts — there is no measurement
 * of rendered DOM, no font metrics, no async layout. That is what makes page
 * counts and eighths reproducible across machines and identical between the
 * viewer, the breakdown grid and the exports.
 *
 * A character cue and the parenthetical/dialogue that follow it are laid out
 * as one "speech unit" (`groupSpeechUnits`) so a cue is never orphaned at the
 * bottom of a page: if the unit does not fit where the cursor currently is,
 * it moves to the top of the next page as a whole. Only when a unit is too
 * long to fit on *any single page* does it actually split, at an element
 * boundary, with a synthetic `(MORE)` closing the page and the cue repeated
 * as `NAME (CONT'D)` opening the next.
 *
 * Splitting only ever happens between elements, never inside one element's
 * wrapped text. That is a deliberate limitation, not an oversight: a tag's
 * `[start, end]` span is a codepoint offset into one element's full text (see
 * `.agents/AGENTS.md` §3), and rendering half of that text in one DOM block
 * and half in another would require rebasing every offset that falls in the
 * second half — a real risk to tagging correctness for a cosmetic pagination
 * detail. The practical cost is narrow: a single dialogue element longer than
 * one full page (over ~1900 characters with no paragraph break) still
 * overflows onto the next page without a `(MORE)`, exactly as before this
 * change. Real scripts essentially never do this; long speeches are written
 * as multiple dialogue elements, each of which gets the full treatment.
 *
 * Whatever the paginator does to fit content onto pages — moving a unit
 * whole, or inserting synthetic continuation lines — never changes a scene's
 * eighths. Eighths are counted from real content lines only (`emit`'s
 * `synthetic` blocks are excluded, and forced page breaks add no lines at
 * all), so they stay identical to what the same script produced before this
 * file understood page boundaries.
 */

import { ELEMENT_TYPES } from '../screenjson/constants.js';
import { cueDisplay, elementText, scenes as sceneList } from '../screenjson/query.js';
import { EIGHTHS_PER_PAGE, LEADING_BLANKS, LINES_PER_PAGE, WIDTHS } from './constants.js';

/**
 * Greedy word wrap at a fixed character width.
 *
 * Words longer than the measure (a URL, a long hyphenless compound) are hard
 * split rather than allowed to overflow, matching what a typewriter-metric
 * renderer actually does.
 */
export function wrapText(text, width) {
  const source = String(text || '').trim();
  if (!source) return [];

  const lines = [];
  for (const paragraph of source.split('\n')) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push('');
      continue;
    }

    let current = '';
    for (const word of words) {
      if (word.length > width) {
        if (current) {
          lines.push(current);
          current = '';
        }
        let rest = word;
        while (rest.length > width) {
          lines.push(rest.slice(0, width));
          rest = rest.slice(width);
        }
        current = rest;
        continue;
      }

      if (!current) {
        current = word;
      } else if (current.length + 1 + word.length <= width) {
        current += ` ${word}`;
      } else {
        lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
  }

  return lines;
}

/** The rendering style key for an element, used for width and indent lookup. */
function styleFor(element) {
  switch (element.type) {
    case ELEMENT_TYPES.CHARACTER:
      return 'character';
    case ELEMENT_TYPES.DIALOGUE:
      return 'dialogue';
    case ELEMENT_TYPES.PARENTHETICAL:
      return 'parenthetical';
    case ELEMENT_TYPES.TRANSITION:
      return 'transition';
    case ELEMENT_TYPES.SHOT:
      return 'shot';
    case ELEMENT_TYPES.GENERAL:
      return 'general';
    default:
      return 'action';
  }
}

/**
 * Groups a scene body into layout units: a `character` cue plus every
 * `parenthetical`/`dialogue` element that follows it, up to the next cue or
 * any other element type. Everything else is its own single-element group.
 *
 * This is exactly the grouping a screenwriter already sees on the page — one
 * speech — so it is what pagination should keep together.
 */
function groupSpeechUnits(body) {
  const groups = [];
  let current = null;

  for (const element of body) {
    if (element.type === ELEMENT_TYPES.CHARACTER) {
      if (current) groups.push(current);
      current = [element];
    } else if (
      current &&
      (element.type === ELEMENT_TYPES.PARENTHETICAL || element.type === ELEMENT_TYPES.DIALOGUE)
    ) {
      current.push(element);
    } else {
      if (current) {
        groups.push(current);
        current = null;
      }
      groups.push([element]);
    }
  }
  if (current) groups.push(current);

  return groups;
}

/**
 * Lay out a whole document.
 *
 * Returns a flat list of blocks (one per element plus one per scene heading),
 * each carrying its wrapped lines, its page, and its line span. The viewer
 * renders from this directly, so what is on screen is what was measured.
 *
 * @returns {{
 *   blocks: Array,
 *   pages: Array<{number: number, blocks: Array}>,
 *   sceneStats: Map<string, {lines: number, eighths: number, startPage: number, endPage: number}>,
 *   totalPages: number
 * }}
 */
export function paginate(doc, charactersById) {
  const lang = doc?.lang || 'en';
  const blocks = [];
  const sceneStats = new Map();

  let contentLineCursor = 0; // absolute count of *real* content lines — drives eighths only
  let pageLine = 0; // visual line index within the current page
  let page = 1;

  const advancePage = (count) => {
    for (let i = 0; i < count; i += 1) {
      pageLine += 1;
      if (pageLine >= LINES_PER_PAGE) {
        pageLine = 0;
        page += 1;
      }
    }
  };

  /** Forces the next block to start at the top of a fresh page. Adds no content lines. */
  const padToNextPage = () => {
    if (pageLine > 0) advancePage(LINES_PER_PAGE - pageLine);
  };

  const emit = (block, lines) => {
    const leading = LEADING_BLANKS[block.style] ?? 1;
    // Blank lines are not carried at the top of a page.
    const appliedLeading = pageLine > 0 ? leading : 0;
    if (appliedLeading) advancePage(appliedLeading);

    const startPage = page;
    const startLine = contentLineCursor;
    advancePage(lines.length);

    if (!block.synthetic) {
      contentLineCursor += appliedLeading + lines.length;
    }

    blocks.push({
      ...block,
      lines,
      leading: appliedLeading,
      startPage,
      endPage: lines.length ? page : startPage,
      startLine,
      lineCount: lines.length
    });
  };

  /** Measures an element without emitting it, so placement can be decided first. */
  const measure = (element) => {
    const style = styleFor(element);
    const text =
      element.type === ELEMENT_TYPES.CHARACTER
        ? cueDisplay(element, charactersById)
        : elementText(element, lang);
    return { element, style, text, lines: wrapText(text, WIDTHS[style]) };
  };

  /** Where a list of measured elements would end up if laid out from `startPageLine`. */
  const simulateEnd = (measured, startPageLine) => {
    let cursor = startPageLine;
    for (const m of measured) {
      const leading = cursor > 0 ? (LEADING_BLANKS[m.style] ?? 1) : 0;
      cursor += leading + m.lines.length;
    }
    return cursor;
  };

  const emitElement = (m, sceneId, sceneIndex) =>
    emit(
      {
        kind: 'element',
        style: m.style,
        sceneId,
        sceneIndex,
        elementId: m.element.id,
        elementType: m.element.type,
        text: m.text
      },
      m.lines
    );

  const emitContinuationMarker = (style, text, sceneId, sceneIndex) =>
    emit(
      { kind: 'element', style, sceneId, sceneIndex, elementId: null, elementType: null, text, synthetic: true },
      wrapText(text, WIDTHS[style])
    );

  for (const [index, scene] of sceneList(doc).entries()) {
    const sceneStartLine = contentLineCursor;
    const sceneStartPage = page;

    const headingText = formatHeadingForLayout(scene.heading);
    emit(
      { kind: 'heading', style: 'heading', sceneId: scene.id, sceneIndex: index, elementId: null },
      wrapText(headingText, WIDTHS.heading)
    );

    for (const group of groupSpeechUnits(scene.body || [])) {
      const measured = group.map(measure);

      // A lone non-dialogue element (action, transition, shot, general) has
      // nothing to keep it company — lay it out exactly as before.
      if (measured.length === 1 && group[0].type !== ELEMENT_TYPES.CHARACTER) {
        emitElement(measured[0], scene.id, index);
        continue;
      }

      if (simulateEnd(measured, pageLine) <= LINES_PER_PAGE) {
        // Fits right where the cursor already is.
        measured.forEach((m) => emitElement(m, scene.id, index));
        continue;
      }

      if (simulateEnd(measured, 0) <= LINES_PER_PAGE) {
        // Doesn't fit here, but fits whole on a fresh page — move it rather
        // than orphan the cue or split dialogue that didn't need splitting.
        padToNextPage();
        measured.forEach((m) => emitElement(m, scene.id, index));
        continue;
      }

      // Too long for any single page: split at an element boundary with a
      // (MORE) / (CONT'D) pair, never inside one element's text.
      const cueText = measured[0].text;
      measured.forEach((m, i) => {
        const leading = pageLine > 0 ? (LEADING_BLANKS[m.style] ?? 1) : 0;
        const fitsRemaining = pageLine + leading + m.lines.length <= LINES_PER_PAGE;
        if (!fitsRemaining) {
          if (i === 0) {
            // Nothing has been said yet on this page — just start the speech fresh.
            padToNextPage();
          } else {
            emitContinuationMarker('dialogue', '(MORE)', scene.id, index);
            padToNextPage();
            emitContinuationMarker('character', `${cueText} (CONT'D)`, scene.id, index);
          }
        }
        emitElement(m, scene.id, index);
      });
    }

    const lines = contentLineCursor - sceneStartLine;
    sceneStats.set(scene.id, {
      lines,
      eighths: linesToEighths(lines),
      startPage: sceneStartPage,
      endPage: page
    });
  }

  const pages = [];
  for (const block of blocks) {
    let bucket = pages[block.startPage - 1];
    if (!bucket) {
      bucket = { number: block.startPage, blocks: [] };
      pages[block.startPage - 1] = bucket;
    }
    bucket.blocks.push(block);
  }

  for (let i = 0; i < pages.length; i += 1) {
    if (!pages[i]) pages[i] = { number: i + 1, blocks: [] };
  }

  return { blocks, pages, sceneStats, totalPages: Math.max(1, pages.length) };
}

/**
 * Convert a line count to eighths of a page.
 *
 * Rounded to the nearest eighth with a floor of 1/8, which is the industry
 * convention: no scene is ever measured as zero.
 */
export function linesToEighths(lines) {
  if (!lines) return 1;
  const raw = Math.round((lines / LINES_PER_PAGE) * EIGHTHS_PER_PAGE);
  return Math.max(1, raw);
}

/** Format eighths as "2 4/8", the form used on breakdown sheets and strips. */
export function formatEighths(eighths) {
  const whole = Math.floor(eighths / EIGHTHS_PER_PAGE);
  const rest = eighths % EIGHTHS_PER_PAGE;
  if (!whole) return `${rest}/8`;
  if (!rest) return `${whole}`;
  return `${whole} ${rest}/8`;
}

/** Format a duration in seconds as "mm:ss", the form a shoot schedule reads. */
export function formatDuration(seconds) {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

function formatHeadingForLayout(heading) {
  if (!heading) return '';
  const mods = heading.mods?.length ? ` - ${heading.mods.join(' - ')}` : '';
  return `${heading.context}. ${heading.setting}${mods} - ${heading.time}`;
}
