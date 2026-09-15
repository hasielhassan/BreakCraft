/**
 * Shared low-level helpers for the two PDF renderers (`script.js`, `sheets.js`).
 *
 * Both use pdf-lib's standard fonts (Courier / Helvetica) rather than an
 * embedded font, which keeps the export dependency-light but means every
 * drawn string is encoded as WinAnsi — a Latin-1-ish subset, not full
 * Unicode. A title, dialogue line or tag label pasted from a word processor
 * can easily carry smart quotes, em dashes or other characters outside that
 * subset, and pdf-lib throws at draw time rather than degrading gracefully.
 * `sanitizePdfText` maps the common offenders to plain-ASCII equivalents and
 * drops anything else that still doesn't fit, so a stray character never
 * crashes an export.
 */

import { rgb } from 'pdf-lib';

const REPLACEMENTS = {
  '‘': "'",
  '’': "'",
  '‚': ',',
  '‛': "'",
  '“': '"',
  '”': '"',
  '„': '"',
  '–': '-',
  '—': '-',
  '…': '...',
  ' ': ' '
};

export function sanitizePdfText(value) {
  const source = String(value ?? '');
  let out = '';
  for (const char of source) {
    const code = char.codePointAt(0);
    if (REPLACEMENTS[char] !== undefined) {
      out += REPLACEMENTS[char];
    } else if (code < 0x80 || (code >= 0xa0 && code <= 0xff)) {
      out += char;
    } else {
      out += '?';
    }
  }
  return out;
}

/** Draws sanitized text at `x, y` — the one path every renderer should draw through. */
export function drawText(page, value, { x, y, size, font, color = rgb(0, 0, 0) }) {
  page.drawText(sanitizePdfText(value), { x, y, size, font, color });
}

/** Draws sanitized text horizontally centered on `centerX`. */
export function drawCenteredText(page, value, { centerX, y, size, font, color = rgb(0, 0, 0) }) {
  const text = sanitizePdfText(value);
  const width = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: centerX - width / 2, y, size, font, color });
}

/** Draws sanitized text right-aligned so it ends at `right`. */
export function drawRightAlignedText(page, value, { right, y, size, font, color = rgb(0, 0, 0) }) {
  const text = sanitizePdfText(value);
  const width = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: right - width, y, size, font, color });
}

/** "#rrggbb" (or the 3-digit shorthand) to a pdf-lib `rgb()` color, 0-1 per channel. */
export function hexToRgbColor(hex) {
  const value = String(hex || '').replace('#', '');
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value.padEnd(6, '0');
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  return rgb(r || 0, g || 0, b || 0);
}

/**
 * Greedy word wrap against a proportional font's real glyph widths, the
 * equivalent of `core/paginate/paginate.js`'s `wrapText` for fonts where a
 * character isn't a fixed measure. Used for prose (synopsis, notes, cast
 * lists) on the breakdown sheets, which are set in Helvetica, not Courier.
 */
export function wrapProportional(font, text, size, maxWidth) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];

  const lines = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (!current || font.widthOfTextAtSize(sanitizePdfText(candidate), size) <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}
