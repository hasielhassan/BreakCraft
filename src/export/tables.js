/**
 * Report tables.
 *
 * Every exporter — CSV, XLSX, printable sheets — renders from these same
 * definitions, so a column added here appears in all three and the formats can
 * never drift apart. Each table is `{ id, name, columns, widths, rows }` with
 * plain string/number cells.
 */

import { resolveCategories } from '../core/breakdown/categories.js';
import { activeMode, categoryLabelForModeId, columnVisibleForMode, visibleCategoriesForMode } from '../core/breakdown/modes.js';
import { dayOutOfDays, elementRows, sceneRows, setReport, summaryStats } from '../core/breakdown/reports.js';
import { formatDuration } from '../core/paginate/paginate.js';
import { readText } from '../core/screenjson/query.js';
import { toArgb } from './xlsx.js';

/**
 * Build every report table for a project.
 *
 * The current breakdown mode narrows which categories get a column/tab here,
 * exactly as it narrows the Breakdown grid — bypassed by "Show all
 * categories" — and also relabels a category to the mode's alias, and hides
 * whichever of the Scenes table's non-category columns (Cast, Synopsis,
 * Duration, Shoot Day, Unit, Notes) the mode turned off. Because CSV, XLSX
 * and the Reports view all render from this same function, that one filter
 * keeps every export in step automatically.
 *
 * @returns {Array<{id:string,name:string,columns:string[],widths:number[],rows:Array,rowColors?:object}>}
 */
export function buildTables(scriptDoc, pagination, breakdown) {
  const categories = visibleCategoriesForMode(breakdown, resolveCategories(breakdown));
  const mode = activeMode(breakdown);
  const castLabel = categoryLabelForModeId(breakdown, 'cast');
  const scenes = sceneRows(scriptDoc, pagination, breakdown);
  const elements = elementRows(scriptDoc, breakdown);
  const dood = dayOutOfDays(scriptDoc, pagination, breakdown);
  const sets = setReport(scriptDoc, pagination, breakdown);
  const stats = summaryStats(scriptDoc, pagination, breakdown);

  return [
    summaryTable(scriptDoc, stats, categories),
    scenesTable(scenes, categories, mode, castLabel),
    elementsTable(elements, categories),
    doodTable(dood, castLabel),
    setsTable(sets),
    ...categoryTables(elements, categories)
  ];
}

function summaryTable(scriptDoc, stats, categories) {
  const rows = [
    ['Title', readText(scriptDoc.title, scriptDoc.lang)],
    ['Scenes', stats.scenes],
    ['Pages', stats.pages],
    ['Speaking characters', stats.characters],
    ['Distinct sets', stats.sets],
    ['Tagged elements', stats.tags],
    ['Tag occurrences', stats.instances],
    ['Estimated runtime', formatDuration(stats.estimatedRuntimeSeconds)],
    ['Generated', new Date().toLocaleString()]
  ];

  for (const category of categories) {
    const count = stats.perCategory[category.id];
    if (count) rows.push([category.label, count]);
  }

  return { id: 'summary', name: 'Summary', columns: ['Metric', 'Value'], widths: [28, 46], rows };
}

function scenesTable(scenes, categories, mode, castLabel) {
  const categoryColumns = categories.filter((c) => c.id !== 'cast');

  const showDuration = columnVisibleForMode(mode, 'duration');
  const showCast = columnVisibleForMode(mode, 'cast');
  const showSynopsis = columnVisibleForMode(mode, 'synopsis');
  const showShootDay = columnVisibleForMode(mode, 'shootDay');
  const showUnit = columnVisibleForMode(mode, 'unit');
  const showNotes = columnVisibleForMode(mode, 'notes');

  const columns = [
    'Scene',
    'I/E',
    'Set',
    'Time',
    'Page',
    'Eighths',
    ...(showDuration ? ['Duration'] : []),
    ...(showCast ? [castLabel] : []),
    ...(showSynopsis ? ['Synopsis'] : []),
    ...categoryColumns.map((c) => (c.icon ? `${c.icon} ${c.label}` : c.label)),
    ...(showShootDay ? ['Shoot Day'] : []),
    ...(showUnit ? ['Unit'] : []),
    ...(showNotes ? ['Notes'] : [])
  ];

  const widths = [
    8, 8, 30, 12, 8, 10,
    ...(showDuration ? [10] : []),
    ...(showCast ? [30] : []),
    ...(showSynopsis ? [46] : []),
    ...categoryColumns.map(() => 26),
    ...(showShootDay ? [12] : []),
    ...(showUnit ? [12] : []),
    ...(showNotes ? [30] : [])
  ];

  const rows = scenes.map((scene) => [
    scene.number,
    scene.context,
    scene.setting,
    scene.time,
    scene.page,
    scene.eighthsLabel,
    ...(showDuration ? [formatDuration(scene.estimatedDurationSeconds)] : []),
    ...(showCast ? [scene.cast.join(', ')] : []),
    ...(showSynopsis ? [scene.synopsis] : []),
    ...categoryColumns.map((c) => (scene.byCategory[c.id] || []).join(', ')),
    ...(showShootDay ? [scene.shootDay] : []),
    ...(showUnit ? [scene.unit] : []),
    ...(showNotes ? [scene.notes] : [])
  ]);

  return { id: 'scenes', name: 'Scenes', columns, widths, rows };
}

function elementsTable(elements, categories) {
  const byId = new Map(categories.map((c) => [c.id, c]));
  // `categories` is already mode-filtered, so an element whose category isn't
  // in it is one the current mode hides by default — drop the row rather than
  // rendering it with a raw slug for a label and no color.
  const visible = elements.filter((element) => byId.has(element.category));

  const rowColors = {};
  visible.forEach((element, index) => {
    rowColors[index] = toArgb(tint(byId.get(element.category).color));
  });

  return {
    id: 'elements',
    name: 'Elements',
    columns: ['Category', 'Element', 'Department', 'Qty', 'Scenes', 'Occurrences', 'Scene Numbers', 'Notes'],
    widths: [18, 34, 18, 8, 10, 12, 40, 30],
    rows: visible.map((element) => [
      byId.get(element.category).label,
      element.label,
      element.department,
      element.qty,
      element.sceneCount,
      element.occurrences,
      element.scenes.map((s) => s.number).join(', '),
      element.notes
    ]),
    rowColors
  };
}

function doodTable(dood, castLabel) {
  return {
    id: 'dood',
    name: 'Day Out of Days',
    columns: [castLabel, 'Scenes', 'First', 'Last', 'Eighths', 'Scene Numbers'],
    widths: [28, 10, 10, 10, 12, 60],
    rows: dood.map((row) => [
      row.name,
      row.sceneCount,
      row.firstScene,
      row.lastScene,
      row.eighthsLabel,
      row.scenes.join(', ')
    ])
  };
}

function setsTable(sets) {
  return {
    id: 'sets',
    name: 'Sets',
    columns: ['Set', 'Scenes', 'Eighths', 'Day', 'Night', 'Interior', 'Exterior', 'Scene Numbers'],
    widths: [32, 10, 12, 8, 8, 10, 10, 50],
    rows: sets.map((set) => [
      set.setting,
      set.sceneCount,
      set.eighthsLabel,
      set.day,
      set.night,
      set.interior,
      set.exterior,
      set.scenes.join(', ')
    ])
  };
}

/**
 * One sheet per populated category — the per-department views a costume
 * supervisor or props master wants handed to them directly.
 */
function categoryTables(elements, categories) {
  const tables = [];

  for (const category of categories) {
    const rows = elements.filter((e) => e.category === category.id);
    if (!rows.length) continue;

    tables.push({
      id: `category-${category.id}`,
      name: category.label,
      columns: ['Element', 'Qty', 'Scenes', 'Scene Numbers', 'Notes'],
      widths: [34, 8, 10, 50, 34],
      rows: rows.map((element) => [
        element.label,
        element.qty,
        element.sceneCount,
        element.scenes.map((s) => s.number).join(', '),
        element.notes
      ])
    });
  }

  return tables;
}

/**
 * Lighten a category colour for use as a spreadsheet row fill: the saturated
 * screen colours are unreadable behind black cell text on paper.
 */
function tint(hex, amount = 0.72) {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
  const mix = (channel) => {
    const base = parseInt(full.slice(channel * 2, channel * 2 + 2), 16);
    return Math.round(base + (255 - base) * amount)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${mix(0)}${mix(1)}${mix(2)}`;
}
