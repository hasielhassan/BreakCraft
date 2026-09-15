/**
 * Export orchestration.
 *
 * Each target declares what it produces; the UI renders the list and calls
 * `runExport`. Adding a format means adding one entry here — the export dialog
 * needs no changes.
 */

import { downloadFile } from '../utils/file-io.js';
import { readText } from '../core/screenjson/query.js';
import { serializeFdx, serializeFountain } from '../core/serializers/script.js';
import { serializeScreenJson } from '../core/serializers/screenjson.js';
import { buildTables } from './tables.js';
import { slugFileName, tableToCsv, tablesToCsvFiles } from './csv.js';
import { createWorkbook } from './xlsx.js';
import { createZip } from './zip.js';
import { buildScriptPdf } from './pdf/script.js';
import { buildSheetsPdf } from './pdf/sheets.js';
import { buildOsf } from './osf.js';

export const EXPORT_GROUPS = Object.freeze([
  {
    id: 'script',
    label: 'Script',
    targets: [
      {
        id: 'screenjson-clean',
        label: 'ScreenJSON (clean)',
        extension: '.json',
        description: 'The screenplay only. Portable to any ScreenJSON tool.'
      },
      {
        id: 'screenjson-tagged',
        label: 'ScreenJSON (with breakdown)',
        extension: '.json',
        description: 'Scene tag arrays populated and every tag written as a coloured note highlight.'
      },
      {
        id: 'fountain',
        label: 'Fountain',
        extension: '.fountain',
        description: 'Plain-text screenplay. Opens in Highland, WriterDuet, Slugline.'
      },
      {
        id: 'fdx',
        label: 'Final Draft',
        extension: '.fdx',
        description: 'Round-trips to Final Draft, Movie Magic and Storyboard Pro.'
      },
      {
        id: 'script-pdf',
        label: 'Script (PDF)',
        extension: '.pdf',
        description: 'Cover page plus the full script, paginated exactly as the viewer measures it.'
      }
    ]
  },
  {
    id: 'breakdown',
    label: 'Breakdown',
    targets: [
      {
        id: 'xlsx',
        label: 'Excel workbook',
        extension: '.xlsx',
        description: 'Every report as a colour-coded sheet: scenes, elements, DOOD, sets, per-department.'
      },
      {
        id: 'csv-bundle',
        label: 'CSV bundle',
        extension: '.zip',
        description: 'One CSV per report, zipped. For import into other production software.'
      },
      {
        id: 'csv-scenes',
        label: 'CSV — scenes only',
        extension: '.csv',
        description: 'The scene grid as a single flat file.'
      },
      {
        id: 'sheets',
        label: 'Breakdown sheets (PDF)',
        extension: '.pdf',
        description: 'One sheet per scene: slugline, synopsis, cast and every tagged category, cover included.'
      },
      {
        id: 'sidecar',
        label: 'Breakdown sidecar',
        extension: '.breakdown.json',
        description: 'The full tag data, lossless. Re-import this to continue working.'
      }
    ]
  },
  {
    id: 'planning',
    label: 'Planning',
    targets: [
      {
        id: 'osf',
        label: 'Open Schedule Format (experimental)',
        extension: '.osf.json',
        description: 'Assets, sequences and shots for PlanCraft. Review durations before scheduling.'
      }
    ]
  }
]);

export const ALL_TARGETS = EXPORT_GROUPS.flatMap((group) => group.targets);

export function getTarget(id) {
  return ALL_TARGETS.find((t) => t.id === id) || null;
}

/**
 * Produce and download one export.
 *
 * @param {string} targetId
 * @param {{script: object, breakdown: object, pagination: object}} project
 * @returns {Promise<{fileName: string}>}
 */
export async function runExport(targetId, { script, breakdown, pagination }) {
  const target = getTarget(targetId);
  if (!target) throw new Error(`Unknown export target: ${targetId}`);

  const title = readText(script.title, script.lang) || 'untitled';
  const base = slugFileName(title);
  const fileName = `${base}${target.extension}`;

  switch (targetId) {
    case 'screenjson-clean':
      downloadFile(JSON.stringify(script, null, 2), fileName, 'application/json');
      break;

    case 'screenjson-tagged':
      downloadFile(
        JSON.stringify(serializeScreenJson(script, breakdown), null, 2),
        `${base}.tagged.json`,
        'application/json'
      );
      return { fileName: `${base}.tagged.json` };

    case 'fountain':
      downloadFile(serializeFountain(script), fileName, 'text/plain');
      break;

    case 'fdx':
      downloadFile(serializeFdx(script), fileName, 'application/xml');
      break;

    case 'script-pdf': {
      const bytes = await buildScriptPdf(script, pagination);
      downloadBlob(new Blob([bytes], { type: 'application/pdf' }), fileName);
      break;
    }

    case 'xlsx': {
      const tables = buildTables(script, pagination, breakdown);
      downloadBlob(createWorkbook(tables), fileName);
      break;
    }

    case 'csv-bundle': {
      const tables = buildTables(script, pagination, breakdown);
      const files = tablesToCsvFiles(tables, `${base}/`);
      downloadBlob(createZip(files), `${base}-breakdown-csv.zip`);
      return { fileName: `${base}-breakdown-csv.zip` };
    }

    case 'csv-scenes': {
      const tables = buildTables(script, pagination, breakdown);
      const scenes = tables.find((t) => t.id === 'scenes');
      downloadFile(tableToCsv(scenes), `${base}-scenes.csv`, 'text/csv');
      return { fileName: `${base}-scenes.csv` };
    }

    case 'sheets': {
      const bytes = await buildSheetsPdf(script, pagination, breakdown);
      const sheetsFileName = `${base}-breakdown-sheets.pdf`;
      downloadBlob(new Blob([bytes], { type: 'application/pdf' }), sheetsFileName);
      return { fileName: sheetsFileName };
    }

    case 'sidecar':
      downloadFile(JSON.stringify(breakdown, null, 2), `${base}.breakdown.json`, 'application/json');
      return { fileName: `${base}.breakdown.json` };

    case 'osf':
      downloadFile(
        JSON.stringify(buildOsf(script, pagination, breakdown), null, 2),
        `${base}.osf.json`,
        'application/json'
      );
      return { fileName: `${base}.osf.json` };

    default:
      throw new Error(`Export target ${targetId} is declared but not implemented.`);
  }

  return { fileName };
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
