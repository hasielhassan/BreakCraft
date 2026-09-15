/**
 * A small XLSX writer.
 *
 * Scope is deliberately narrow: multiple sheets, a styled header row, per-cell
 * background fills (used for the breakdown category colours), string and number
 * cells, frozen header panes and column widths. That covers every export in the
 * app without taking on a spreadsheet library.
 *
 * The file is a ZIP of five XML parts, written with `createZip`. Everything is
 * inline strings rather than a shared string table — marginally larger files,
 * considerably simpler code, and irrelevant at breakdown scale.
 */

import { escapeXml } from '../utils/text.js';
import { createZip } from './zip.js';

const HEADER_FILL = 'FF2A2F36';
const HEADER_FONT = 'FFFFFFFF';

/**
 * @typedef {object} SheetSpec
 * @property {string} name              sheet tab name (31 chars max, no []:*?/\)
 * @property {string[]} columns         header labels
 * @property {Array<Array>} rows        cell values; strings and numbers
 * @property {number[]} [widths]        column widths in characters
 * @property {Object<number,string>} [rowColors]  row index -> ARGB fill
 */

/**
 * Build an .xlsx workbook.
 *
 * @param {SheetSpec[]} sheets
 * @returns {Blob}
 */
export function createWorkbook(sheets) {
  const safeSheets = sheets.map((sheet, i) => ({
    ...sheet,
    name: sanitizeSheetName(sheet.name, i)
  }));

  // Collect the distinct fill colours used across all sheets so each gets one
  // style id in the shared stylesheet.
  const fills = new Map();
  for (const sheet of safeSheets) {
    for (const color of Object.values(sheet.rowColors || {})) {
      if (!fills.has(color)) fills.set(color, fills.size);
    }
  }

  const files = [
    { name: '[Content_Types].xml', data: contentTypes(safeSheets.length) },
    { name: '_rels/.rels', data: rootRels() },
    { name: 'xl/workbook.xml', data: workbookXml(safeSheets) },
    { name: 'xl/_rels/workbook.xml.rels', data: workbookRels(safeSheets.length) },
    { name: 'xl/styles.xml', data: stylesXml(Array.from(fills.keys())) }
  ];

  safeSheets.forEach((sheet, i) => {
    files.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(sheet, fills) });
  });

  return createZip(files);
}

/** Excel rejects these characters in tab names, and caps the length at 31. */
function sanitizeSheetName(name, index) {
  const cleaned = String(name || `Sheet${index + 1}`).replace(/[[\]:*?/\\]/g, ' ').trim();
  return (cleaned || `Sheet${index + 1}`).slice(0, 31);
}

function contentTypes(sheetCount) {
  const sheets = Array.from(
    { length: sheetCount },
    (_, i) =>
      `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
  ).join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${sheets}
</Types>`;
}

function rootRels() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
}

function workbookXml(sheets) {
  const entries = sheets
    .map(
      (sheet, i) =>
        `<sheet name="${escapeXml(sheet.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`
    )
    .join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${entries}</sheets>
</workbook>`;
}

function workbookRels(sheetCount) {
  const sheetRels = Array.from(
    { length: sheetCount },
    (_, i) =>
      `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
  ).join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheetRels}
<Relationship Id="rId${sheetCount + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
}

/**
 * Stylesheet layout (cellXfs indices, referenced by `s=` on cells):
 *   0  default
 *   1  header (bold, white on dark, wrapped)
 *   2  body (top aligned, wrapped)
 *   3+ body with fill n
 */
function stylesXml(fillColors) {
  const fills = [
    '<fill><patternFill patternType="none"/></fill>',
    '<fill><patternFill patternType="gray125"/></fill>',
    `<fill><patternFill patternType="solid"><fgColor rgb="${HEADER_FILL}"/><bgColor indexed="64"/></patternFill></fill>`,
    ...fillColors.map(
      (color) =>
        `<fill><patternFill patternType="solid"><fgColor rgb="${color}"/><bgColor indexed="64"/></patternFill></fill>`
    )
  ];

  const cellXfs = [
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>',
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>',
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>',
    ...fillColors.map(
      (_, i) =>
        `<xf numFmtId="0" fontId="0" fillId="${3 + i}" borderId="0" xfId="0" applyFill="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>`
    )
  ];

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2">
<font><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="${HEADER_FONT}"/><name val="Calibri"/></font>
</fonts>
<fills count="${fills.length}">${fills.join('')}</fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="${cellXfs.length}">${cellXfs.join('')}</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

function sheetXml(sheet, fills) {
  const columns = sheet.columns || [];
  const widths = sheet.widths || [];

  const cols = columns.length
    ? `<cols>${columns
        .map(
          (_, i) =>
            `<col min="${i + 1}" max="${i + 1}" width="${widths[i] || 18}" customWidth="1"/>`
        )
        .join('')}</cols>`
    : '';

  const rows = [];

  rows.push(
    `<row r="1" ht="22" customHeight="1">${columns
      .map((label, i) => cellXml(i, 1, label, 1))
      .join('')}</row>`
  );

  (sheet.rows || []).forEach((row, rowIndex) => {
    const excelRow = rowIndex + 2;
    const color = sheet.rowColors?.[rowIndex];
    const styleId = color !== undefined ? 3 + fills.get(color) : 2;
    const cells = row.map((value, colIndex) => cellXml(colIndex, excelRow, value, styleId)).join('');
    rows.push(`<row r="${excelRow}">${cells}</row>`);
  });

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
${cols}
<sheetData>${rows.join('')}</sheetData>
</worksheet>`;
}

function cellXml(colIndex, rowNumber, value, styleId) {
  const ref = `${columnName(colIndex)}${rowNumber}`;

  if (value === null || value === undefined || value === '') {
    return `<c r="${ref}" s="${styleId}"/>`;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<c r="${ref}" s="${styleId}"><v>${value}</v></c>`;
  }

  // Inline strings avoid a shared string table entirely.
  return `<c r="${ref}" s="${styleId}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(
    String(value)
  )}</t></is></c>`;
}

/** 0 -> A, 25 -> Z, 26 -> AA. */
export function columnName(index) {
  let n = index;
  let name = '';
  do {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return name;
}

/** Convert a `#rrggbb` CSS colour into the `AARRGGBB` form Excel expects. */
export function toArgb(hex, alpha = 'FF') {
  const value = String(hex || '').replace('#', '');
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
  return (alpha + full).toUpperCase();
}
