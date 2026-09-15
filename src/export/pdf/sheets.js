/**
 * Direct PDF export of the printable breakdown sheets: a cover page plus one
 * page per scene — slugline, synopsis, cast and a category grid — the same
 * data `core/breakdown/reports.js`'s `sceneRows()` already assembles for the
 * on-screen Breakdown grid and every other export.
 *
 * Set in Helvetica (also a pdf-lib standard font, so no embedding) rather
 * than Courier, matching the sans-serif the previous HTML sheet used — this
 * is a tabular production document, not the screenplay itself.
 *
 * Each scene's tagged categories can vary a lot in how much they hold, so
 * layout flows top-down from measured content height rather than a fixed
 * grid: a scene with little tagged still gets a compact sheet, one with a
 * lot doesn't clip. A sheet whose content is unusually long for one page
 * still overflows past the bottom margin rather than spilling onto a second
 * page — the same single-page-per-scene assumption the old print stylesheet
 * made (its `.sheet` was a fixed-height box for the same reason).
 */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { resolveCategories, resolveCategory } from '../../core/breakdown/categories.js';
import { categoryLabelForModeId, visibleCategoriesForMode } from '../../core/breakdown/modes.js';
import { sceneRows } from '../../core/breakdown/reports.js';
import { formatDuration } from '../../core/paginate/paginate.js';
import { readText } from '../../core/screenjson/query.js';
import { drawCenteredText, drawRightAlignedText, drawText, hexToRgbColor, wrapProportional } from './helpers.js';

const PT_PER_INCH = 72;
const PAGE_WIDTH = 8.5 * PT_PER_INCH;
const PAGE_HEIGHT = 11 * PT_PER_INCH;
const MARGIN = 0.5 * PT_PER_INCH;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const BLACK = rgb(0.07, 0.07, 0.07);
const GRAY = rgb(0.4, 0.4, 0.4);
const LIGHT_GRAY = rgb(0.82, 0.82, 0.82);

/** @returns {Promise<Uint8Array>} */
export async function buildSheetsPdf(scriptDoc, pagination, breakdown) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);

  const title = readText(scriptDoc.title, scriptDoc.lang) || 'Untitled';
  const rows = sceneRows(scriptDoc, pagination, breakdown);
  const allCategories = resolveCategories(breakdown).filter((category) => category.id !== 'cast');
  const categories = visibleCategoriesForMode(breakdown, allCategories);
  const castColor = resolveCategory(breakdown, 'cast')?.color || '#e5484d';
  const castLabel = categoryLabelForModeId(breakdown, 'cast').toUpperCase();

  drawCoverPage(pdf, font, boldFont, title, rows.length, pagination.totalPages);
  for (const scene of rows) {
    drawScenePage(pdf, font, boldFont, title, scene, categories, castColor, castLabel);
  }

  return pdf.save();
}

function drawCoverPage(pdf, font, boldFont, title, sceneCount, totalPages) {
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const centerX = PAGE_WIDTH / 2;

  drawCenteredText(page, title.toUpperCase(), { centerX, y: PAGE_HEIGHT / 2 + 40, size: 26, font: boldFont, color: BLACK });
  drawCenteredText(page, 'PRODUCTION BREAKDOWN SHEETS', {
    centerX,
    y: PAGE_HEIGHT / 2 + 8,
    size: 13,
    font,
    color: GRAY
  });
  drawCenteredText(page, `${sceneCount} scenes  ·  ${totalPages} pages  ·  generated ${new Date().toLocaleString()}`, {
    centerX,
    y: PAGE_HEIGHT / 2 - 18,
    size: 9,
    font,
    color: GRAY
  });
  drawCenteredText(page, 'Prepared with BreakCraft', { centerX, y: PAGE_HEIGHT / 2 - 32, size: 9, font, color: GRAY });
}

function drawScenePage(pdf, font, boldFont, title, scene, categories, castColor, castLabel) {
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  drawText(page, title, { x: MARGIN, y: y - 10, size: 12, font: boldFont, color: BLACK });
  drawRightAlignedText(page, `Scene ${scene.number}`, { right: PAGE_WIDTH - MARGIN, y: y - 10, size: 12, font: boldFont, color: BLACK });
  y -= 18;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 1.25, color: BLACK });
  y -= 16;

  y = drawSlugTable(page, font, boldFont, y, [
    [['INT/EXT', scene.context], ['SET', scene.setting], ['D/N', scene.time]],
    [['PAGE', String(scene.page)], ['LENGTH', scene.eighthsLabel], ['DURATION', formatDuration(scene.estimatedDurationSeconds)]],
    [['SHOOT DAY', scene.shootDay || '—'], ['UNIT', scene.unit || '—'], null]
  ]);
  y -= 12;

  y = drawTextSection(page, font, boldFont, y, 'SYNOPSIS', scene.synopsis || '—');
  y -= 8;

  y = drawChipSection(page, font, boldFont, y, castLabel, scene.cast, castColor);
  y -= 12;

  y = drawCategoryGrid(page, font, boldFont, y, categories, scene.byCategory);
  y -= 12;

  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 0.5, color: LIGHT_GRAY });
  y -= 16;
  drawTextSection(page, font, boldFont, y, 'NOTES', scene.notes || '');
}

/** A 3-column label/value grid, one row per array in `rows`; a `null` cell is left blank. */
function drawSlugTable(page, font, boldFont, topY, rows) {
  const rowHeight = 26;
  const colWidth = CONTENT_WIDTH / 3;
  let y = topY;

  for (const row of rows) {
    row.forEach((cell, index) => {
      if (!cell) return;
      const [label, value] = cell;
      const cellX = MARGIN + index * colWidth;
      page.drawRectangle({
        x: cellX,
        y: y - rowHeight,
        width: colWidth - 4,
        height: rowHeight,
        borderColor: LIGHT_GRAY,
        borderWidth: 0.75
      });
      drawText(page, label, { x: cellX + 5, y: y - 8, size: 6.5, font: boldFont, color: GRAY });
      drawText(page, value, { x: cellX + 5, y: y - 20, size: 9.5, font, color: BLACK });
    });
    y -= rowHeight;
  }

  return y;
}

/** A bold uppercase label followed by a wrapped paragraph. */
function drawTextSection(page, font, boldFont, topY, label, text) {
  let y = topY;
  drawText(page, label, { x: MARGIN, y, size: 8, font: boldFont, color: GRAY });
  y -= 13;

  const lines = wrapProportional(font, text, 9.5, CONTENT_WIDTH);
  for (const line of lines.length ? lines : ['—']) {
    drawText(page, line, { x: MARGIN, y, size: 9.5, font, color: BLACK });
    y -= 12;
  }
  return y;
}

/** Like `drawTextSection`, with a colored accent bar and a comma-joined item list. */
function drawChipSection(page, font, boldFont, topY, label, items, colorHex) {
  let y = topY;
  page.drawRectangle({ x: MARGIN, y: y - 9, width: 3, height: 10, color: hexToRgbColor(colorHex) });
  drawText(page, label, { x: MARGIN + 9, y, size: 8, font: boldFont, color: GRAY });
  y -= 13;

  const text = items.length ? items.join(', ') : '—';
  const lines = wrapProportional(font, text, 9.5, CONTENT_WIDTH);
  for (const line of lines) {
    drawText(page, line, { x: MARGIN, y, size: 9.5, font, color: BLACK });
    y -= 12;
  }
  return y;
}

/**
 * The per-department grid: three columns, one cell per category, a colored
 * left bar standing in for the on-screen swatch (icons are emoji, which the
 * standard, non-embedded fonts used here cannot encode — see
 * `helpers.js`'s `sanitizePdfText` — so the color is the category's visual
 * identity on paper).
 */
function drawCategoryGrid(page, font, boldFont, topY, categories, byCategory) {
  const columns = 3;
  const gap = 10;
  const colWidth = (CONTENT_WIDTH - gap * (columns - 1)) / columns;
  let y = topY;

  for (let i = 0; i < categories.length; i += columns) {
    const rowCategories = categories.slice(i, i + columns);
    const cellLines = rowCategories.map((category) => {
      const items = byCategory[category.id] || [];
      return items.length ? items : ['—'];
    });
    const rowLineCount = Math.max(...cellLines.map((lines) => lines.length));
    const rowHeight = 16 + rowLineCount * 11 + 6;

    rowCategories.forEach((category, col) => {
      const cellX = MARGIN + col * (colWidth + gap);
      page.drawRectangle({ x: cellX, y: y - rowHeight, width: 2, height: rowHeight, color: hexToRgbColor(category.color) });
      drawText(page, category.label.toUpperCase(), { x: cellX + 8, y: y - 10, size: 7, font: boldFont, color: GRAY });

      let itemY = y - 23;
      for (const line of cellLines[col]) {
        drawText(page, line, { x: cellX + 8, y: itemY, size: 8.5, font, color: BLACK });
        itemY -= 11;
      }
    });

    y -= rowHeight;
  }

  return y;
}
