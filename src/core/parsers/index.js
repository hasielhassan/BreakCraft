/**
 * Import entry point: sniff the format, dispatch to a parser, validate.
 *
 * Detection reads content rather than trusting the extension, because scripts
 * routinely arrive as `script.txt` (Fountain), `draft.xml` (FDX) or with no
 * extension at all after a round trip through email.
 */

import { parseFountain } from './fountain.js';
import { parseFdx } from './fdx.js';
import { validateDocument } from '../screenjson/validate.js';

export const SUPPORTED_FORMATS = Object.freeze([
  { id: 'fountain', label: 'Fountain', extensions: ['.fountain', '.spmd', '.txt'] },
  { id: 'fdx', label: 'Final Draft', extensions: ['.fdx', '.xml'] },
  { id: 'screenjson', label: 'ScreenJSON', extensions: ['.json', '.screenjson'] }
]);

/** `accept` attribute for the file picker. */
export const IMPORT_ACCEPT = SUPPORTED_FORMATS.flatMap((f) => f.extensions).join(',');

/**
 * Identify the format of a source string.
 *
 * @returns {'fountain'|'fdx'|'screenjson'|'unknown'}
 */
export function detectFormat(source, fileName = '') {
  const head = String(source || '').slice(0, 4096).trim();
  const lower = fileName.toLowerCase();

  if (head.startsWith('{')) return 'screenjson';
  if (/^<\?xml/.test(head) || /<FinalDraft\b/.test(head)) return 'fdx';
  if (lower.endsWith('.fdx')) return 'fdx';
  if (lower.endsWith('.json') || lower.endsWith('.screenjson')) return 'screenjson';
  if (lower.endsWith('.fountain') || lower.endsWith('.spmd')) return 'fountain';
  if (!head) return 'unknown';
  return 'fountain';
}

/**
 * Import a script from raw text.
 *
 * @param {string} source file contents
 * @param {string} fileName original file name, used as a detection hint
 * @returns {{document: object, format: string, notices: string[], validation: object}}
 */
export function importScript(source, fileName = '') {
  const format = detectFormat(source, fileName);
  let result;

  switch (format) {
    case 'fdx':
      result = parseFdx(source);
      break;
    case 'screenjson':
      result = importScreenJson(source);
      break;
    case 'fountain':
      result = parseFountain(source);
      break;
    default:
      throw new Error(
        'Could not identify this file. Supported formats are Fountain, Final Draft (.fdx) and ScreenJSON.'
      );
  }

  const validation = validateDocument(result.document);
  const notices = [...result.notices];

  if (!validation.valid) {
    notices.push(
      `The imported document has ${validation.errors.length} schema issue(s). ` +
        'It has been loaded anyway; see the import report for details.'
    );
  }

  return { document: result.document, format, notices, validation };
}

/**
 * Load an existing ScreenJSON file.
 *
 * A file produced by another tool is trusted structurally but still validated,
 * so a malformed third-party export surfaces as a readable message rather than
 * as a crash three screens later in the breakdown grid.
 */
function importScreenJson(source) {
  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    throw new Error(`This file is not valid JSON: ${error.message}`);
  }

  if (!parsed || typeof parsed !== 'object' || !parsed.document) {
    throw new Error('This JSON file is valid, but it is not a ScreenJSON screenplay.');
  }

  const notices = [];
  if (parsed.encrypt) {
    notices.push(
      'This document declares encryption. BreakCraft cannot decrypt ScreenJSON documents; ' +
        'encrypted element text will be unreadable.'
    );
  }

  return { document: parsed, notices };
}
