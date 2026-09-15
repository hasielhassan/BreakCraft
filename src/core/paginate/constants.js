/**
 * US Letter screenplay page geometry.
 *
 * Screenplay pagination is deterministic because the format is monospaced: 12pt
 * Courier is exactly 10 characters per inch and 6 lines per inch. Every measure
 * below is therefore a character or line count, not a pixel value, and the same
 * numbers drive both the on-screen page rendering and the eighths calculation so
 * the viewer and the breakdown grid can never disagree.
 *
 * Reference: standard US theatrical format — 1.5" left margin, 1" right,
 * 1" top and bottom, 55 body lines per page.
 */

export const LINES_PER_PAGE = 55;
export const EIGHTHS_PER_PAGE = 8;

/** Character widths (10 cpi), by element type. */
export const WIDTHS = Object.freeze({
  action: 61,
  general: 61,
  dialogue: 35,
  parenthetical: 25,
  character: 38,
  transition: 20,
  shot: 61,
  heading: 61
});

/** Left indents in characters from the text block origin, for rendering. */
export const INDENTS = Object.freeze({
  action: 0,
  general: 0,
  heading: 0,
  dialogue: 10,
  parenthetical: 13,
  character: 22,
  shot: 0,
  transition: 45
});

/** Blank lines inserted *before* an element of each type. */
export const LEADING_BLANKS = Object.freeze({
  heading: 2,
  action: 1,
  general: 1,
  character: 1,
  dialogue: 0,
  parenthetical: 0,
  transition: 1,
  shot: 1
});

/** Page dimensions used by the CSS page renderer, in inches. */
export const PAGE_INCHES = Object.freeze({
  width: 8.5,
  height: 11,
  marginTop: 1,
  marginBottom: 1,
  marginLeft: 1.5,
  marginRight: 1
});
