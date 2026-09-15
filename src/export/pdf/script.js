/**
 * Direct PDF export of the script itself.
 *
 * A cover page (title + author, standard screenplay convention) followed by
 * one PDF page per `pagination.pages[]` entry. `core/paginate/paginate.js`
 * already computed exactly where every line falls — 12pt Courier at 10
 * characters per inch / 6 lines per inch — so this module does no wrapping
 * or measuring of its own; it only converts that already-wrapped
 * `block.lines[]` geometry into PDF x/y coordinates. Page count and line
 * breaks are therefore identical to the on-screen `ScriptView` and to the
 * eighths the breakdown grid reports.
 *
 * Uses pdf-lib's built-in "Courier" standard font — present in every PDF
 * reader, so no font embedding is needed and the exact monospace metrics the
 * paginator assumes come for free.
 */

import { PDFDocument, StandardFonts } from 'pdf-lib';
import { INDENTS, PAGE_INCHES } from '../../core/paginate/constants.js';
import { readText } from '../../core/screenjson/query.js';
import { drawCenteredText, drawRightAlignedText, drawText } from './helpers.js';

const PT_PER_INCH = 72;
const FONT_SIZE = 12;
const CHAR_WIDTH = PT_PER_INCH / 10; // 10 characters per inch
const LINE_HEIGHT = PT_PER_INCH / 6; // 6 lines per inch

const PAGE_WIDTH = PAGE_INCHES.width * PT_PER_INCH;
const PAGE_HEIGHT = PAGE_INCHES.height * PT_PER_INCH;
const MARGIN_TOP = PAGE_INCHES.marginTop * PT_PER_INCH;
const MARGIN_LEFT = PAGE_INCHES.marginLeft * PT_PER_INCH;
const MARGIN_RIGHT = PAGE_INCHES.marginRight * PT_PER_INCH;

/** @returns {Promise<Uint8Array>} */
export async function buildScriptPdf(scriptDoc, pagination) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Courier);

  drawCoverPage(pdf, font, scriptDoc);
  for (const page of pagination.pages) {
    drawScriptPage(pdf, font, page);
  }

  return pdf.save();
}

function formatAuthor(author) {
  return [author.given, author.family].filter((part) => part && part !== '-').join(' ');
}

function drawCoverPage(pdf, font, scriptDoc) {
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const centerX = PAGE_WIDTH / 2;

  const title = (readText(scriptDoc.title, scriptDoc.lang) || 'Untitled').toUpperCase();
  const authors = (scriptDoc.authors || []).map(formatAuthor).filter(Boolean);

  drawCenteredText(page, title, { centerX, y: PAGE_HEIGHT / 2 + 24, size: 14, font });
  drawCenteredText(page, 'by', { centerX, y: PAGE_HEIGHT / 2 - 6, size: FONT_SIZE, font });
  drawCenteredText(page, authors.length ? authors.join(', ') : 'Unknown', {
    centerX,
    y: PAGE_HEIGHT / 2 - 24,
    size: FONT_SIZE,
    font
  });
}

function drawScriptPage(pdf, font, page) {
  const pdfPage = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

  // Screenplay convention: page 1 carries no visible number.
  if (page.number > 1) {
    drawRightAlignedText(pdfPage, `${page.number}.`, {
      right: PAGE_WIDTH - MARGIN_RIGHT,
      y: PAGE_HEIGHT - MARGIN_TOP + LINE_HEIGHT * 0.6,
      size: FONT_SIZE,
      font
    });
  }

  const textTop = PAGE_HEIGHT - MARGIN_TOP - FONT_SIZE;
  let lineIndex = 0;

  for (const block of page.blocks) {
    lineIndex += block.leading || 0;
    const indentChars = INDENTS[block.style] ?? 0;
    const x = MARGIN_LEFT + indentChars * CHAR_WIDTH;

    for (const line of block.lines) {
      drawText(pdfPage, line, { x, y: textTop - lineIndex * LINE_HEIGHT, size: FONT_SIZE, font });
      lineIndex += 1;
    }
  }
}
