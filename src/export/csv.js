/**
 * CSV export.
 *
 * RFC 4180 quoting, plus a UTF-8 BOM: without it Excel on Windows renders
 * accented character names as mojibake, which is the single most common
 * complaint about CSV exports from web tools.
 */

const BOM = '\ufeff';

/** Serialise one table to a CSV string. */
export function tableToCsv(table, { bom = true } = {}) {
  const lines = [table.columns.map(csvCell).join(',')];
  for (const row of table.rows) {
    lines.push(row.map(csvCell).join(','));
  }
  return (bom ? BOM : '') + lines.join('\r\n') + '\r\n';
}

/** Serialise every table to `{ name, content }` pairs for a zip bundle. */
export function tablesToCsvFiles(tables, prefix = '') {
  return tables.map((table) => ({
    name: `${prefix}${slugFileName(table.name)}.csv`,
    data: tableToCsv(table)
  }));
}

function csvCell(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function slugFileName(name) {
  return String(name || 'report')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'report';
}
