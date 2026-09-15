/**
 * Core test suite.
 *
 * Run with `npm test` (node --test). The suite covers the deterministic core —
 * parsing, pagination, the breakdown model and the exporters — because that is
 * where a regression would be silent. The React layer is not covered here; the
 * behaviour worth testing in the UI is selection mapping, which is exercised
 * indirectly through `buildSegments`.
 *
 * The FDX parser needs a DOM, so those tests skip cleanly when no DOMParser is
 * present rather than failing the run.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { parseFountain } from '../src/core/parsers/fountain.js';
import { parseSlugline, looksLikeSceneHeading } from '../src/core/parsers/slugline.js';
import { detectFormat } from '../src/core/parsers/index.js';
import { validateDocument } from '../src/core/screenjson/validate.js';
import { charactersById, speakingCast, scenes } from '../src/core/screenjson/query.js';
import { paginate, wrapText, linesToEighths, formatEighths, formatDuration } from '../src/core/paginate/paginate.js';
import { LEADING_BLANKS, LINES_PER_PAGE, WIDTHS } from '../src/core/paginate/constants.js';
import {
  createBreakdown,
  addTagInstance,
  addCustomCategory,
  createInstance,
  removeCustomCategory,
  tagKey,
  addCustomMode,
  findOccurrences,
  hideAutoElement,
  mergeAutoElement,
  mergeTags,
  removeCustomMode,
  updateCategoryOverride,
  updateModeOverride,
  updateSettings,
  withDefaults
} from '../src/core/breakdown/model.js';
import {
  applyToCategoryLibrary,
  diffCategoryLibrary,
  isBuiltinCategory,
  resolveCategories,
  resolveCategory
} from '../src/core/breakdown/categories.js';
import { modeIncludesCategory, resolveMode, visibleCategoriesForMode } from '../src/core/breakdown/modes.js';
import { dayOutOfDays, sceneRows, setReport, summaryStats } from '../src/core/breakdown/reports.js';
import {
  categoryLabelForMode,
  categoryLabelForModeId,
  columnVisibleForMode,
  isBuiltinMode,
  labelCategoriesForMode,
  resolveModes
} from '../src/core/breakdown/modes.js';
import { serializeFountain, serializeFdx } from '../src/core/serializers/script.js';
import { serializeScreenJson } from '../src/core/serializers/screenjson.js';
import { buildTables } from '../src/export/tables.js';
import { tableToCsv } from '../src/export/csv.js';
import { buildScriptPdf } from '../src/export/pdf/script.js';
import { buildSheetsPdf } from '../src/export/pdf/sheets.js';
import { sanitizePdfText } from '../src/export/pdf/helpers.js';
import { PDFDocument } from 'pdf-lib';
import { buildSegments } from '../src/utils/selection.js';
import { slugify, diceCoefficient, unitToCodePoint } from '../src/utils/text.js';

const here = dirname(fileURLToPath(import.meta.url));
const sample = readFileSync(join(here, '..', 'public', 'samples', 'little-red-riding-hood.fountain'), 'utf8');

function load() {
  const { document } = parseFountain(sample);
  return document;
}

// --- Slugline ------------------------------------------------------------

test('slugline: splits context, setting and time', () => {
  const heading = parseSlugline('INT. LIGHTHOUSE - LAMP ROOM - NIGHT');
  assert.equal(heading.context, 'INT');
  assert.equal(heading.setting, 'LIGHTHOUSE - LAMP ROOM');
  assert.equal(heading.time, 'NIGHT');
});

test('slugline: recognises the INT/EXT family before the bare prefixes', () => {
  assert.equal(parseSlugline('INT./EXT. CAR - DAY').context, 'INT/EXT');
  assert.equal(parseSlugline('I/E. PORCH - DUSK').context, 'I/E');
  assert.equal(parseSlugline('EXT. DOCKS - DAY').context, 'EXT');
});

test('slugline: lifts known modifiers out of the setting', () => {
  const heading = parseSlugline('INT. KITCHEN - FLASHBACK - NIGHT');
  assert.equal(heading.setting, 'KITCHEN');
  assert.deepEqual(heading.mods, ['FLASHBACK']);
  assert.equal(heading.time, 'NIGHT');
});

test('slugline: keeps a setting whole when the last segment is not a time', () => {
  const heading = parseSlugline('INT. HOUSE - MAREN\'S ROOM');
  assert.equal(heading.setting, "HOUSE - MAREN'S ROOM");
  assert.equal(heading.time, 'DAY');
});

test('slugline: reads scene numbers in both Fountain and margin form', () => {
  assert.equal(parseSlugline('INT. KITCHEN - DAY #12A#').numberLabel, '12A');
  assert.equal(parseSlugline('14  INT. KITCHEN - DAY  14').no, 14);
});

test('slugline: heading detection rejects ordinary action lines', () => {
  assert.ok(looksLikeSceneHeading('EXT. HARBOUR - DAY'));
  assert.ok(!looksLikeSceneHeading('Interior designers argue.'));
});

// --- Fountain parser -----------------------------------------------------

test('fountain: reads the title page', () => {
  const doc = load();
  assert.equal(doc.title.en, 'Little Red Riding-Hood');
  assert.equal(doc.authors[0].given, 'BreakCraft');
  assert.equal(doc.authors[0].family, 'Samples');
});

test('fountain: produces a schema-valid document', () => {
  const report = validateDocument(load());
  assert.deepEqual(report.errors, []);
  assert.equal(report.valid, true);
});

test('fountain: finds every scene', () => {
  assert.equal(scenes(load()).length, 13);
});

test('fountain: merges character extensions into one character', () => {
  const doc = load();
  const names = doc.characters.map((c) => c.name);
  // RED and RED (O.S.) are the same person.
  assert.equal(names.filter((n) => n === 'RED').length, 1);
  const red = doc.characters.find((c) => c.name === 'RED');
  assert.ok(red.aliases.includes('RED (O.S.)'));
});

test('fountain: maps a cue extension onto the dialogue origin enum', () => {
  const doc = load();
  const dialogue = scenes(doc)
    .flatMap((s) => s.body)
    .filter((e) => e.type === 'dialogue');
  assert.ok(dialogue.some((d) => d.origin === 'O.S.'));
  assert.ok(dialogue.every((d) => !d.origin || ['V.O.', 'O.S.', 'O.C.', 'FILTER'].includes(d.origin)));
});

test('fountain: registers speaking cast on the scene', () => {
  const doc = load();
  const first = scenes(doc)[0];
  const byId = charactersById(doc);
  const names = speakingCast(first).map((id) => byId.get(id).name);
  assert.ok(names.includes('RED'));
  assert.ok(names.includes('MOTHER'));
});

test('fountain: strips emphasis so tag offsets stay aligned', () => {
  const { document } = parseFountain('INT. ROOM - DAY\n\nA *bold* claim and _stress_.\n');
  const action = scenes(document)[0].body[0];
  assert.equal(action.text.en, 'A bold claim and stress.');
});

test('fountain: a script with no heading still yields one valid scene', () => {
  const { document, notices } = parseFountain('Just some action, no heading at all.\n');
  assert.equal(scenes(document).length, 1);
  assert.equal(validateDocument(document).valid, true);
  assert.ok(notices.some((n) => n.includes('No scene headings')));
});

// --- Format detection ----------------------------------------------------

test('detect: sniffs content rather than trusting the extension', () => {
  assert.equal(detectFormat('<?xml version="1.0"?><FinalDraft/>', 'draft.txt'), 'fdx');
  assert.equal(detectFormat('{"version":"1.0.0"}', 'script.fountain'), 'screenjson');
  assert.equal(detectFormat('INT. ROOM - DAY', 'anything'), 'fountain');
});

// --- Pagination ----------------------------------------------------------

test('wrap: breaks at the measure and never overflows it', () => {
  const lines = wrapText('the quick brown fox jumps over the lazy dog', 10);
  assert.ok(lines.every((line) => line.length <= 10));
  assert.equal(lines.join(' '), 'the quick brown fox jumps over the lazy dog');
});

test('wrap: hard-splits a word longer than the measure', () => {
  const lines = wrapText('supercalifragilistic', 8);
  assert.ok(lines.every((line) => line.length <= 8));
  assert.equal(lines.join(''), 'supercalifragilistic');
});

test('paginate: every scene gets at least one eighth', () => {
  const doc = load();
  const result = paginate(doc, charactersById(doc));
  for (const scene of scenes(doc)) {
    const stats = result.sceneStats.get(scene.id);
    assert.ok(stats.eighths >= 1, 'no scene may measure zero');
  }
});

test('paginate: page numbers are contiguous and start at one', () => {
  const doc = load();
  const result = paginate(doc, charactersById(doc));
  assert.equal(result.pages[0].number, 1);
  result.pages.forEach((page, index) => assert.equal(page.number, index + 1));
  assert.equal(result.totalPages, result.pages.length);
});

test('eighths: convert and format the way a breakdown sheet reads', () => {
  assert.equal(linesToEighths(0), 1);
  assert.equal(linesToEighths(55), 8);
  assert.equal(formatEighths(3), '3/8');
  assert.equal(formatEighths(8), '1');
  assert.equal(formatEighths(12), '1 4/8');
});

// --- Pagination: dialogue block integrity ---------------------------------
//
// Minimal hand-built documents, not real ScreenJSON (see AGENTS.md §4 on why
// production code never does this) — these exist to drive `paginate()` to an
// exact line count, which a parsed sample script can't guarantee.

function fillerAction(id, wordCount) {
  // A 61-char "word" is exactly one action line's width, so N of them,
  // space-separated, wrap to exactly N lines — precise page-filling filler.
  return { id, authors: ['a1'], type: 'action', text: { en: Array(wordCount).fill('x'.repeat(61)).join(' ') } };
}

function speechScene(id, body) {
  return { id, authors: ['a1'], heading: { context: 'INT', setting: 'ROOM', time: 'DAY' }, body };
}

function speechDoc(scenes) {
  return { lang: 'en', document: { scenes } };
}

const oneCharacter = (id, name) => new Map([[id, { id, name }]]);

test("paginate: a cue is never left orphaned at the bottom of a page", () => {
  // Fill to two lines from the page bottom, then add a cue + dialogue that
  // cannot fit in what little space remains.
  const filler = fillerAction('a1', LINES_PER_PAGE - 2);
  const cue = { id: 'c1', authors: ['a1'], type: 'character', character: 'char1' };
  const dialogue = {
    id: 'd1',
    authors: ['a1'],
    type: 'dialogue',
    character: 'char1',
    text: { en: 'Not here.' }
  };
  const doc = speechDoc([speechScene('s1', [filler, cue, dialogue])]);

  const result = paginate(doc, oneCharacter('char1', 'JIM'));
  const cueBlock = result.blocks.find((b) => b.elementId === 'c1');
  const dialogueBlock = result.blocks.find((b) => b.elementId === 'd1');

  assert.equal(cueBlock.startPage, 2, 'the cue moves to the next page rather than sitting alone at the bottom');
  assert.equal(dialogueBlock.startPage, 2, 'its dialogue moves with it');
  assert.ok(!result.blocks.some((b) => b.synthetic), "moving the whole speech needs no (MORE)/(CONT'D)");
});

test("paginate: a speech too long for one page splits at an element boundary with (MORE) / (CONT'D)", () => {
  const cue = { id: 'c2', authors: ['a1'], type: 'character', character: 'char1' };
  // One 35-char "word" per dialogue line; more of them than fit on any page.
  const dialogueText = Array(LINES_PER_PAGE + 10)
    .fill('y'.repeat(35))
    .join(' ');
  const dialogue = { id: 'd2', authors: ['a1'], type: 'dialogue', character: 'char1', text: { en: dialogueText } };
  const doc = speechDoc([speechScene('s2', [cue, dialogue])]);

  const result = paginate(doc, oneCharacter('char1', 'JIM'));
  const more = result.blocks.find((b) => b.synthetic && b.text === '(MORE)');
  const cont = result.blocks.find((b) => b.synthetic && b.text === "JIM (CONT'D)");

  assert.ok(more, 'expected a (MORE) marker closing the first page');
  assert.ok(cont, "expected a JIM (CONT'D) marker opening the next");
  assert.equal(more.startPage + 1, cont.startPage, "(MORE) and (CONT'D) sit on consecutive pages");

  // Neither marker is a real element, so neither should be taggable or
  // countable toward the scene's eighths.
  assert.equal(more.elementId, null);
  assert.equal(cont.elementId, null);

  const stats = result.sceneStats.get('s2');
  // sceneStats.lines has always included the scene heading itself (this
  // scene is first in the document, so its 2 leading blanks are suppressed
  // at the very top of page 1, leaving just its own single line) — that part
  // is unchanged by this fix. What this test cares about is that adding the
  // (MORE)/(CONT'D) markers on top of that contributes nothing further.
  const expectedLines =
    1 /* heading: "INT. ROOM - DAY" */ +
    LEADING_BLANKS.character +
    wrapText('JIM', WIDTHS.character).length +
    LEADING_BLANKS.dialogue +
    wrapText(dialogueText, WIDTHS.dialogue).length;
  assert.equal(stats.lines, expectedLines, "(MORE)/(CONT'D) must not inflate the scene's eighths");
});

// --- Breakdown model -----------------------------------------------------

function tagged() {
  const doc = load();
  let breakdown = createBreakdown(doc);
  const scene = scenes(doc)[0];
  const element = scene.body.find((e) => e.type === 'action');
  const text = element.text.en;
  const start = [...text.slice(0, text.indexOf('table'))].length;

  breakdown = addTagInstance(breakdown, {
    category: 'props',
    label: 'Worn Table',
    instance: createInstance({
      scene,
      element,
      start,
      end: start + 'table'.length,
      text: 'table'
    })
  });

  return { doc, breakdown, scene, element };
}

test('tagKey: normalises articles, case and plurals onto one key', () => {
  assert.equal(tagKey('the Oak Desks'), tagKey('oak desk'));
  assert.equal(tagKey('A Revolver'), 'revolver');
});

// --- Categories: custom, overrides, hybrid library --------------------

test('resolveCategories: built-ins pass through unchanged with no breakdown', () => {
  const categories = resolveCategories(undefined);
  assert.ok(categories.some((c) => c.id === 'props'));
  assert.ok(categories.every((c) => typeof c.icon === 'string'));
});

test('addCustomCategory: appends a new category and refuses id collisions', () => {
  let breakdown = createBreakdown(load());
  breakdown = addCustomCategory(breakdown, { label: 'Greenery', color: '#2f7a3f', icon: '🌿' });

  const resolved = resolveCategories(breakdown);
  assert.ok(resolved.some((c) => c.id === 'greenery' && c.label === 'Greenery'));
  assert.ok(!isBuiltinCategory('greenery'));

  const collidingWithBuiltin = addCustomCategory(breakdown, { label: 'Props' });
  assert.equal(collidingWithBuiltin, breakdown, 'cannot shadow a built-in id');

  const collidingWithCustom = addCustomCategory(breakdown, { label: 'Greenery' });
  assert.equal(collidingWithCustom, breakdown, 'cannot duplicate an existing custom id');
});

test('updateCategoryOverride: built-ins only accept color/icon, customs accept any field', () => {
  let breakdown = createBreakdown(load());
  breakdown = updateCategoryOverride(breakdown, 'props', { color: '#123456', label: 'Should be ignored' });
  const props = resolveCategory(breakdown, 'props');
  assert.equal(props.color, '#123456');
  assert.equal(props.label, 'Props', 'a built-in label can never be overridden');

  breakdown = addCustomCategory(breakdown, { label: 'Greenery' });
  breakdown = updateCategoryOverride(breakdown, 'greenery', { label: 'Set Greens', department: 'Greens' });
  const greenery = resolveCategory(breakdown, 'greenery');
  assert.equal(greenery.label, 'Set Greens');
  assert.equal(greenery.department, 'Greens');
});

test('removeCustomCategory: refuses built-ins and categories still in use', () => {
  const document = load();
  let breakdown = createBreakdown(document);
  assert.equal(removeCustomCategory(breakdown, 'props'), breakdown, 'built-ins can never be removed');

  breakdown = addCustomCategory(breakdown, { label: 'Greenery' });

  const untaggedRemoved = removeCustomCategory(breakdown, 'greenery');
  assert.ok(!resolveCategories(untaggedRemoved).some((c) => c.id === 'greenery'));

  const scene = scenes(document)[0];
  const element = scene.body.find((e) => e.type === 'action');
  const text = element.text.en;
  const at = [...text.slice(0, text.indexOf('kitchen'))].length;
  const tagged = addTagInstance(breakdown, {
    category: 'greenery',
    label: 'Ivy',
    instance: createInstance({ scene, element, start: at, end: at + 'kitchen'.length, text: 'kitchen' })
  });

  assert.equal(
    removeCustomCategory(tagged, 'greenery'),
    tagged,
    'a category with tagged elements refuses to be removed'
  );
});

test('diffCategoryLibrary: flags new and conflicting entries, ignores identical ones', () => {
  const library = { custom: [{ id: 'greenery', label: 'Greenery', color: '#2f7a3f' }], overrides: {} };
  const snapshot = {
    custom: [
      { id: 'greenery', label: 'Greenery', color: '#ff0000' }, // conflict: different color
      { id: 'weapons', label: 'Weapons', color: '#333333' } // new
    ],
    overrides: { props: { color: '#123456' } } // new override
  };

  const pending = diffCategoryLibrary(library, snapshot);
  assert.equal(pending.length, 3);
  assert.ok(pending.some((p) => p.kind === 'custom' && p.id === 'greenery' && p.existing));
  assert.ok(pending.some((p) => p.kind === 'custom' && p.id === 'weapons' && !p.existing));
  assert.ok(pending.some((p) => p.kind === 'override' && p.id === 'props'));

  const identical = diffCategoryLibrary(library, { custom: library.custom, overrides: {} });
  assert.equal(identical.length, 0, 'an already-matching snapshot needs no reconciliation');
});

test('applyToCategoryLibrary: writes every pending entry into the library', () => {
  const library = { custom: [], overrides: {} };
  const pending = [
    { kind: 'custom', id: 'greenery', incoming: { id: 'greenery', label: 'Greenery' } },
    { kind: 'override', id: 'props', incoming: { color: '#123456' } }
  ];
  const next = applyToCategoryLibrary(library, pending);
  assert.equal(next.custom.length, 1);
  assert.equal(next.overrides.props.color, '#123456');
});

test('withDefaults: fills in categories/settings missing from an older sidecar', () => {
  const bare = { version: '0.1.0', id: 'x', scriptId: null, created: '', updated: '', tags: [], scenes: {} };
  const filled = withDefaults(bare);
  assert.deepEqual(filled.categories, { custom: [], overrides: {} });
  assert.equal(filled.settings.minutesPerPage, 1);
});

test('updateSettings: merges changes into breakdown.settings without touching the rest', () => {
  let breakdown = createBreakdown(load());
  breakdown = updateSettings(breakdown, { mode: 'animation' });
  assert.equal(breakdown.settings.mode, 'animation');
  assert.equal(breakdown.settings.minutesPerPage, 1, 'unrelated settings are untouched');

  breakdown = updateSettings(breakdown, { showAllCategories: true });
  assert.equal(breakdown.settings.showAllCategories, true);
  assert.equal(breakdown.settings.mode, 'animation', 'a later update does not clobber an earlier one');
});

// --- Breakdown modes -------------------------------------------------------

test('modeIncludesCategory: live-action carries the full built-in set, animation drops physical departments', () => {
  const breakdown = createBreakdown(load());
  const liveAction = resolveMode(breakdown, 'live-action');
  const animation = resolveMode(breakdown, 'animation');
  assert.ok(modeIncludesCategory(liveAction, 'stunts'));
  assert.ok(modeIncludesCategory(liveAction, 'makeup'));
  assert.ok(!modeIncludesCategory(animation, 'stunts'));
  assert.ok(!modeIncludesCategory(animation, 'makeup'));
  assert.ok(modeIncludesCategory(animation, 'vfx'), 'both modes keep categories with no live-action assumption');
});

test('modeIncludesCategory: an unknown mode id falls back to "all"', () => {
  const breakdown = createBreakdown(load());
  const fallback = resolveMode(breakdown, 'not-a-real-mode');
  assert.ok(modeIncludesCategory(fallback, 'stunts'));
});

test('modeIncludesCategory: a custom category always passes, regardless of mode', () => {
  const breakdown = createBreakdown(load());
  const animation = resolveMode(breakdown, 'animation');
  assert.ok(modeIncludesCategory(animation, 'greenery'));
});

test('visibleCategoriesForMode: "all" mode and the show-all override both bypass filtering', () => {
  const categories = resolveCategories(undefined);
  let breakdown = createBreakdown(load());

  assert.deepEqual(
    visibleCategoriesForMode(breakdown, categories).map((c) => c.id),
    categories.map((c) => c.id),
    'default mode is "all"'
  );

  breakdown = updateSettings(breakdown, { mode: 'animation' });
  const filtered = visibleCategoriesForMode(breakdown, categories);
  assert.ok(!filtered.some((c) => c.id === 'stunts'));
  assert.ok(filtered.some((c) => c.id === 'props'));

  breakdown = updateSettings(breakdown, { showAllCategories: true });
  const shownAll = visibleCategoriesForMode(breakdown, categories);
  assert.deepEqual(
    shownAll.map((c) => c.id),
    categories.map((c) => c.id),
    'the override shows every category id, even with animation mode still active'
  );
  assert.equal(
    shownAll.find((c) => c.id === 'cast').label,
    'Characters',
    "the override bypasses filtering, not the mode's own aliasing — renaming isn't hiding"
  );
});

test('visibleCategoriesForMode: a custom category survives an animation-mode filter', () => {
  let breakdown = createBreakdown(load());
  breakdown = addCustomCategory(breakdown, { label: 'Greenery' });
  breakdown = updateSettings(breakdown, { mode: 'animation' });
  const visible = visibleCategoriesForMode(breakdown, resolveCategories(breakdown));
  assert.ok(visible.some((c) => c.id === 'greenery'));
});

test('shipped Animation mode hides Special Equipment and aliases Cast to Characters, hiding Shoot Day/Unit', () => {
  let breakdown = createBreakdown(load());
  const animation = resolveModes(breakdown).find((m) => m.id === 'animation');
  assert.ok(!animation.categoryIds.includes('equipment'));

  breakdown = updateSettings(breakdown, { mode: 'animation' });
  assert.equal(categoryLabelForModeId(breakdown, 'cast'), 'Characters');
  assert.equal(columnVisibleForMode(animation, 'shootDay'), false);
  assert.equal(columnVisibleForMode(animation, 'unit'), false);
  assert.equal(columnVisibleForMode(animation, 'notes'), true, 'columns are visible unless explicitly turned off');
});

test('updateModeOverride: reconfiguring a built-in mode never mutates the shipped default', () => {
  let breakdown = createBreakdown(load());
  breakdown = updateModeOverride(breakdown, 'live-action', {
    label: 'Feature Live Action',
    categoryIds: ['cast', 'props'],
    labels: { props: 'Physical Props' }
  });

  const mode = resolveModes(breakdown).find((m) => m.id === 'live-action');
  assert.equal(mode.label, 'Feature Live Action');
  assert.ok(!mode.categoryIds.includes('stunts'));
  assert.equal(categoryLabelForMode(mode, { id: 'props', label: 'Props' }), 'Physical Props');

  const freshBreakdown = createBreakdown(load());
  const freshMode = resolveModes(freshBreakdown).find((m) => m.id === 'live-action');
  assert.equal(freshMode.label, 'Live Action', "another project's mode is untouched");
  assert.ok(freshMode.categoryIds.includes('stunts'));
});

test('addCustomMode/removeCustomMode: a custom mode round-trips, and deleting the active one falls back to "all"', () => {
  let breakdown = createBreakdown(load());
  breakdown = addCustomMode(breakdown, { label: 'Documentary', icon: '🎥', categoryIds: ['cast', 'location'] });

  const modes = resolveModes(breakdown);
  const custom = modes.find((m) => m.id === 'documentary');
  assert.ok(custom);
  assert.equal(custom.label, 'Documentary');
  assert.ok(!isBuiltinMode('documentary'));

  breakdown = updateSettings(breakdown, { mode: 'documentary' });
  breakdown = removeCustomMode(breakdown, 'documentary');
  assert.ok(!resolveModes(breakdown).some((m) => m.id === 'documentary'));
  assert.equal(breakdown.settings.mode, 'all', 'the project falls back rather than pointing at a deleted mode');
});

test('addCustomMode: refuses an id colliding with a built-in or existing custom mode', () => {
  let breakdown = createBreakdown(load());
  const beforeCount = resolveModes(breakdown).length;

  const collidesBuiltin = addCustomMode(breakdown, { label: 'Animation' });
  assert.equal(resolveModes(collidesBuiltin).length, beforeCount, 'cannot shadow a built-in mode id');

  breakdown = addCustomMode(breakdown, { label: 'Docu' });
  const dupe = addCustomMode(breakdown, { label: 'Docu' });
  assert.equal(resolveModes(dupe).length, resolveModes(breakdown).length, 'cannot duplicate a custom mode id');
});

test('labelCategoriesForMode: relabels every category without filtering any out', () => {
  let breakdown = createBreakdown(load());
  breakdown = updateSettings(breakdown, { mode: 'animation' });
  const all = resolveCategories(breakdown);
  const labeled = labelCategoriesForMode(breakdown, all);

  assert.equal(labeled.length, all.length, 'nothing is filtered out, unlike visibleCategoriesForMode');
  assert.ok(labeled.some((c) => c.id === 'stunts'), "stunts stays present even though animation mode hides it in pickers/grids");
  assert.equal(labeled.find((c) => c.id === 'cast').label, 'Characters');
});

test('tables: Animation mode hides Shoot Day/Unit columns and renames Cast to Characters in the Scenes report', () => {
  const document = load();
  let breakdown = createBreakdown(document);
  breakdown = updateSettings(breakdown, { mode: 'animation' });
  const pagination = paginate(document, charactersById(document));

  const scenesTable = buildTables(document, pagination, breakdown).find((t) => t.id === 'scenes');
  assert.ok(scenesTable.columns.includes('Characters'));
  assert.ok(!scenesTable.columns.includes('Cast'));
  assert.ok(!scenesTable.columns.includes('Shoot Day'));
  assert.ok(!scenesTable.columns.includes('Unit'));
  assert.ok(scenesTable.columns.includes('Notes'), 'columns stay visible unless the mode turns them off');

  const doodTable = buildTables(document, pagination, breakdown).find((t) => t.id === 'dood');
  assert.equal(doodTable.columns[0], 'Characters');
});

// --- Estimated duration ------------------------------------------------

test('formatDuration: seconds render as mm:ss', () => {
  assert.equal(formatDuration(0), '0:00');
  assert.equal(formatDuration(65), '1:05');
  assert.equal(formatDuration(600), '10:00');
});

test('sceneRows: estimated duration scales with eighths and minutesPerPage', () => {
  const { doc, breakdown } = tagged();
  const pagination = paginate(doc, charactersById(doc));
  const rows = sceneRows(doc, pagination, breakdown);
  const row = rows[0];
  const expectedSeconds = Math.round((row.eighths / 8) * 1 * 60);
  assert.equal(row.estimatedDurationSeconds, expectedSeconds);

  const doubled = updateSettings(breakdown, { minutesPerPage: 2 });
  const doubledRow = sceneRows(doc, pagination, doubled)[0];
  assert.equal(doubledRow.estimatedDurationSeconds, expectedSeconds * 2);
});

test('summaryStats: total estimated runtime sums every scene', () => {
  const { doc, breakdown } = tagged();
  const pagination = paginate(doc, charactersById(doc));
  const rows = sceneRows(doc, pagination, breakdown);
  const stats = summaryStats(doc, pagination, breakdown);
  const expected = rows.reduce((sum, row) => sum + row.estimatedDurationSeconds, 0);
  assert.equal(stats.estimatedRuntimeSeconds, expected);
});

test('breakdown: a second identical range is not tagged twice', () => {
  const { breakdown, scene, element } = tagged();
  const text = element.text.en;
  const at = [...text.slice(0, text.indexOf('kitchen'))].length;
  const instance = createInstance({ scene, element, start: at, end: at + 'kitchen'.length, text: 'kitchen' });
  const once = addTagInstance(breakdown, { category: 'props', label: 'Worn Table', instance });
  const twice = addTagInstance(once, { category: 'props', label: 'Worn Table', instance: { ...instance } });
  const tag = twice.tags.find((t) => t.key === 'worn-table');
  assert.equal(tag.instances.length, 2, 'a different range is added');

  const again = addTagInstance(twice, {
    category: 'props',
    label: 'Worn Table',
    instance: { ...instance }
  });
  assert.equal(again, twice, 'an exact duplicate range is a no-op');
});

test('breakdown: instances of the same term collapse into one element', () => {
  const { breakdown } = tagged();
  assert.equal(breakdown.tags.length, 1);
  assert.equal(breakdown.tags[0].category, 'props');
});

test('breakdown: merge moves instances and drops the source', () => {
  const { doc, breakdown, scene, element } = tagged();
  const text = element.text.en;
  const at = [...text.slice(0, text.indexOf('kitchen'))].length;
  const second = addTagInstance(breakdown, {
    category: 'props',
    label: 'Old Table',
    instance: createInstance({ scene, element, start: at, end: at + 'kitchen'.length, text: 'kitchen' })
  });
  const [a, b] = second.tags;
  const merged = mergeTags(second, a.id, b.id);
  assert.equal(merged.tags.length, 1);
  assert.equal(merged.tags[0].instances.length, 2);
  void doc;
});

test('mergeTags: keeps the merged-away label as a searchable alias', () => {
  const { breakdown, scene, element } = tagged();
  const text = element.text.en;
  const at = [...text.slice(0, text.indexOf('kitchen'))].length;
  const second = addTagInstance(breakdown, {
    category: 'props',
    label: 'Kitchen Table',
    instance: createInstance({ scene, element, start: at, end: at + 'kitchen'.length, text: 'kitchen' })
  });
  const [worn, kitchen] = second.tags;
  const merged = mergeTags(second, kitchen.id, worn.id);
  assert.equal(merged.tags.length, 1);
  assert.deepEqual(merged.tags[0].aliases, ['Kitchen Table']);
});

test('mergeTags: allows merging across categories, moving the source into the target', () => {
  const { breakdown, scene, element } = tagged();
  const text = element.text.en;
  const at = [...text.slice(0, text.indexOf('kitchen'))].length;
  const differentCategory = addTagInstance(breakdown, {
    category: 'setdressing',
    label: 'Kitchen Nook',
    instance: createInstance({ scene, element, start: at, end: at + 'kitchen'.length, text: 'kitchen' })
  });
  const props = differentCategory.tags.find((t) => t.category === 'props');
  const setdressing = differentCategory.tags.find((t) => t.category === 'setdressing');

  const merged = mergeTags(differentCategory, setdressing.id, props.id);
  assert.equal(merged.tags.length, 1);
  assert.equal(merged.tags[0].category, 'props', 'the source moves into the target category');
  assert.equal(merged.tags[0].instances.length, 2);
});

// --- Auto-derived elements: Cast/Sets merge and hide overlay --------------

test('mergeAutoElement: merging two characters combines their appearances, deduping shared scenes', () => {
  const doc = load();
  const pagination = paginate(doc, charactersById(doc));
  const allScenes = scenes(doc);
  const red = doc.characters.find((c) => c.name === 'RED');
  const mother = doc.characters.find((c) => c.name === 'MOTHER');
  const unionCount = allScenes.filter(
    (s) => speakingCast(s).includes(red.id) || speakingCast(s).includes(mother.id)
  ).length;

  let breakdown = createBreakdown(doc);
  breakdown = mergeAutoElement(breakdown, 'cast', red.id, mother.id);
  const dood = dayOutOfDays(doc, pagination, breakdown);

  assert.ok(!dood.some((row) => row.id === red.id), 'the merged-away character no longer has its own row');
  const target = dood.find((row) => row.id === mother.id);
  assert.ok(target);
  assert.equal(target.sceneCount, unionCount, 'a scene where both spoke is not counted twice');
  assert.deepEqual(target.aliases, ['RED']);
});

test('hideAutoElement: a hidden character is dropped from Day Out of Days, others unaffected', () => {
  const doc = load();
  const pagination = paginate(doc, charactersById(doc));
  const red = doc.characters.find((c) => c.name === 'RED');
  const mother = doc.characters.find((c) => c.name === 'MOTHER');

  let breakdown = createBreakdown(doc);
  breakdown = hideAutoElement(breakdown, 'cast', red.id);
  const dood = dayOutOfDays(doc, pagination, breakdown);

  assert.ok(!dood.some((row) => row.id === red.id));
  assert.ok(dood.some((row) => row.id === mother.id));
});

test('mergeAutoElement: merging two sets combines their scene counts under the target, aliasing the source', () => {
  const doc = load();
  const pagination = paginate(doc, charactersById(doc));
  const before = setReport(doc, pagination);
  assert.ok(before.length >= 2, 'the sample needs at least two distinct sets for this test');
  const [a, b] = before;

  let breakdown = createBreakdown(doc);
  breakdown = mergeAutoElement(breakdown, 'sets', a.setting, b.setting);
  const after = setReport(doc, pagination, breakdown);

  assert.ok(!after.some((s) => s.setting === a.setting), 'the merged-away set no longer has its own row');
  const target = after.find((s) => s.setting === b.setting);
  assert.ok(target);
  assert.equal(target.sceneCount, a.sceneCount + b.sceneCount);
  assert.ok(target.aliases.includes(a.setting));
});

test('hideAutoElement: a hidden set is dropped from the set report, others unaffected', () => {
  const doc = load();
  const pagination = paginate(doc, charactersById(doc));
  const before = setReport(doc, pagination);
  const [a, b] = before;

  let breakdown = createBreakdown(doc);
  breakdown = hideAutoElement(breakdown, 'sets', a.setting);
  const after = setReport(doc, pagination, breakdown);

  assert.ok(!after.some((s) => s.setting === a.setting));
  assert.ok(after.some((s) => s.setting === b.setting));
});

test('findOccurrences: matches whole words only, case-insensitively', () => {
  const doc = load();
  const hits = findOccurrences(doc, 'basket');
  assert.ok(hits.length >= 2, 'the basket is mentioned more than once');
  assert.ok(hits.every((hit) => /basket/i.test(hit.text)));

  assert.equal(findOccurrences(doc, 'aske').length, 0, 'substring matches are rejected');
});

test('findOccurrences: reports codepoint offsets that slice back correctly', () => {
  const doc = load();
  const [hit] = findOccurrences(doc, 'GRANDMOTHER');
  const chars = [...hit.element.text.en];
  assert.equal(chars.slice(hit.start, hit.end).join(''), hit.text);
});

// --- Selection segments --------------------------------------------------

test('segments: untagged text is a single segment', () => {
  const segments = buildSegments('a quiet room', []);
  assert.equal(segments.length, 1);
  assert.equal(segments[0].tags.length, 0);
});

test('segments: overlapping tags split at every boundary', () => {
  const segments = buildSegments('brass pocket watch', [
    { start: 0, end: 12, tagId: 'a', category: 'props', label: 'brass pocket' },
    { start: 6, end: 18, tagId: 'b', category: 'setdressing', label: 'pocket watch' }
  ]);
  assert.equal(segments.length, 3);
  assert.equal(segments[1].tags.length, 2, 'the overlap carries both tags');
  assert.equal(segments.map((s) => s.text).join(''), 'brass pocket watch');
});

// --- Serializers ---------------------------------------------------------

test('fountain round trip: scene count and headings survive', () => {
  const doc = load();
  const text = serializeFountain(doc);
  const { document: reparsed } = parseFountain(text);
  assert.equal(scenes(reparsed).length, scenes(doc).length);
  assert.equal(scenes(reparsed)[0].heading.setting, scenes(doc)[0].heading.setting);
  assert.equal(validateDocument(reparsed).valid, true);
});

test('fountain round trip: dialogue text is preserved', () => {
  const doc = load();
  const { document: reparsed } = parseFountain(serializeFountain(doc));
  const lines = (d) =>
    scenes(d)
      .flatMap((s) => s.body)
      .filter((e) => e.type === 'dialogue')
      .map((e) => e.text.en);
  assert.deepEqual(lines(reparsed), lines(doc));
});

test('fdx: output is well-formed and escapes markup', () => {
  const doc = load();
  const xml = serializeFdx(doc);
  assert.match(xml, /^<\?xml/);
  assert.match(xml, /<FinalDraft[^>]*>/);
  assert.match(xml, /<Paragraph Type="Scene Heading"/);
  assert.ok(!/<Text>[^<]*[<>][^<]*<\/Text>/.test(xml), 'no raw angle brackets inside Text');
});

test('screenjson export: tags project into scene arrays and stay valid', () => {
  const { doc, breakdown, scene } = tagged();
  const exported = serializeScreenJson(doc, breakdown);
  const target = exported.document.scenes.find((s) => s.id === scene.id);

  assert.ok(target.props.includes('worn-table'));
  assert.ok(exported.taggable.includes('worn-table'));
  assert.equal(validateDocument(exported).valid, true, JSON.stringify(validateDocument(exported).errors.slice(0, 3)));
});

test('screenjson export: prefixed categories round-trip distinctly', () => {
  const { doc, breakdown, scene, element } = tagged();
  const text = element.text.en;
  const at = [...text.slice(0, text.indexOf('kitchen'))].length;
  const withVehicle = addTagInstance(breakdown, {
    category: 'vehicles',
    label: 'Delivery Cart',
    instance: createInstance({ scene, element, start: at, end: at + 'kitchen'.length, text: 'kitchen' })
  });
  const exported = serializeScreenJson(doc, withVehicle);
  const target = exported.document.scenes.find((s) => s.id === scene.id);
  assert.ok(target.props.includes('vehicle-delivery-cart'));
  assert.ok(target.props.includes('worn-table'));
});

test('screenjson export: highlights are written as element notes', () => {
  const { doc, breakdown, element } = tagged();
  const exported = serializeScreenJson(doc, breakdown);
  const target = exported.document.scenes
    .flatMap((s) => s.body)
    .find((e) => e.id === element.id);
  assert.equal(target.notes.length, 1);
  assert.equal(target.notes[0].highlight.length, 1);
  assert.equal(target.notes[0].meta['breakcraft.category'], 'props');
});

test('screenjson export: clean mode leaves the script untouched', () => {
  const { doc, breakdown } = tagged();
  const exported = serializeScreenJson(doc, breakdown, { includeTags: false, includeNotes: false });
  assert.deepEqual(exported, doc);
});

// --- Reports and tables --------------------------------------------------

test('tables: every table has a matching column count on every row', () => {
  const { doc, breakdown } = tagged();
  const pagination = paginate(doc, charactersById(doc));
  for (const table of buildTables(doc, pagination, breakdown)) {
    for (const row of table.rows) {
      assert.equal(row.length, table.columns.length, `${table.name} row width`);
    }
  }
});

test('tables: the scene table has one row per scene', () => {
  const { doc, breakdown } = tagged();
  const pagination = paginate(doc, charactersById(doc));
  const table = buildTables(doc, pagination, breakdown).find((t) => t.id === 'scenes');
  assert.equal(table.rows.length, scenes(doc).length);
});

test('tables: scene rows carry a formatted Duration column, summary carries a total', () => {
  const { doc, breakdown } = tagged();
  const pagination = paginate(doc, charactersById(doc));
  const tables = buildTables(doc, pagination, breakdown);

  const scenesTable = tables.find((t) => t.id === 'scenes');
  const durationIndex = scenesTable.columns.indexOf('Duration');
  assert.ok(durationIndex >= 0);
  assert.match(scenesTable.rows[0][durationIndex], /^\d+:\d{2}$/);

  const summary = tables.find((t) => t.id === 'summary');
  const runtimeRow = summary.rows.find((row) => row[0] === 'Estimated runtime');
  assert.ok(runtimeRow);
  assert.match(runtimeRow[1], /^\d+:\d{2}$/);
});

test('tables: the breakdown mode narrows category columns/tabs/rows the same way it narrows the Breakdown grid', () => {
  const document = load();
  const scene = scenes(document)[0];
  const element = scene.body.find((e) => e.type === 'action');
  const text = element.text.en;
  const at = [...text.slice(0, text.indexOf('kitchen'))].length;

  let breakdown = createBreakdown(document);
  breakdown = addTagInstance(breakdown, {
    category: 'stunts',
    label: 'Rooftop fall',
    instance: createInstance({ scene, element, start: at, end: at + 'kitchen'.length, text: 'kitchen' })
  });

  const pagination = paginate(document, charactersById(document));

  const allTables = buildTables(document, pagination, breakdown);
  assert.ok(allTables.some((t) => t.name === 'Stunts'), 'default "all" mode keeps every populated category');
  assert.ok(allTables.find((t) => t.id === 'elements').rows.some((r) => r[1] === 'Rooftop fall'));

  const animationBreakdown = updateSettings(breakdown, { mode: 'animation' });
  const animationTables = buildTables(document, pagination, animationBreakdown);
  assert.ok(!animationTables.some((t) => t.name === 'Stunts'), 'animation mode has no Stunts tab');
  assert.ok(
    !animationTables.find((t) => t.id === 'elements').rows.some((r) => r[1] === 'Rooftop fall'),
    'a category the mode hides is dropped from the Elements report too'
  );

  const shownAgain = updateSettings(animationBreakdown, { showAllCategories: true });
  const overriddenTables = buildTables(document, pagination, shownAgain);
  assert.ok(overriddenTables.some((t) => t.name === 'Stunts'), '"Show all categories" bypasses the mode filter here too');
});

test('csv: quotes fields containing separators and doubles inner quotes', () => {
  const csv = tableToCsv({
    columns: ['A', 'B'],
    rows: [['plain', 'has, comma'], ['says "hi"', 'line\nbreak']]
  });
  assert.ok(csv.includes('"has, comma"'));
  assert.ok(csv.includes('"says ""hi"""'));
  assert.ok(csv.startsWith('\ufeff'), 'BOM keeps Excel from mangling accents');
});

// --- Text utilities ------------------------------------------------------

test('slugify: enforces the ScreenJSON slug pattern', () => {
  assert.equal(slugify('Maren’s Pocket Watch!'), 'marens-pocket-watch');
  assert.equal(slugify('Café Noir'), 'cafe-noir');
  assert.equal(slugify('a'), null, 'too short to be a valid slug');
});

test('dice: identical strings score one, unrelated ones score low', () => {
  assert.equal(diceCoefficient('kitchen', 'kitchen'), 1);
  assert.ok(diceCoefficient('INT. KITCHEN', 'INT. KITCHENETTE') > 0.6);
  assert.ok(diceCoefficient('kitchen', 'lighthouse') < 0.3);
});

test('offsets: unit-to-codepoint conversion survives astral characters', () => {
  const text = '🎬 slate';
  // The emoji is two UTF-16 units but one codepoint.
  assert.equal(unitToCodePoint(text, 3), 2);
});

// --- FDX parser (DOM-dependent) -----------------------------------------

test('fdx: parses paragraph types, scene numbers and cast', async () => {
  // Node has no DOMParser. linkedom provides a conformant one for tests only;
  // the browser build never sees it.
  if (typeof globalThis.DOMParser === 'undefined') {
    const { DOMParser } = await import('linkedom');
    globalThis.DOMParser = DOMParser;
  }

  const { parseFdx } = await import('../src/core/parsers/fdx.js');
  const fdx = readFileSync(join(here, '..', 'public', 'samples', 'three-bears.fdx'), 'utf8');
  const { document } = parseFdx(fdx);

  assert.equal(scenes(document).length, 12);
  assert.equal(document.title.en, 'THE STORY OF THE THREE BEARS');
  assert.equal(validateDocument(document).valid, true);

  // Scene numbers from the Number attribute.
  assert.equal(scenes(document)[0].heading.no, 1);
  assert.equal(scenes(document)[11].heading.no, 12);

  // CONTINUOUS is a time, not a modifier.
  assert.equal(scenes(document)[1].heading.time, 'CONTINUOUS');

  assert.deepEqual(
    document.characters.map((c) => c.name),
    ['PAPA BEAR', 'MAMA BEAR', 'BABY BEAR', 'GOLDILOCKS']
  );
});

test('fdx: flattens DualDialogue while flagging both sides', async () => {
  if (typeof globalThis.DOMParser === 'undefined') {
    const { DOMParser } = await import('linkedom');
    globalThis.DOMParser = DOMParser;
  }

  const { parseFdx } = await import('../src/core/parsers/fdx.js');
  const fdx = readFileSync(join(here, '..', 'public', 'samples', 'emperors-new-clothes.fdx'), 'utf8');
  const { document } = parseFdx(fdx);

  assert.equal(validateDocument(document).valid, true);

  const dialogue = scenes(document)
    .flatMap((s) => s.body)
    .filter((e) => e.type === 'dialogue');
  const dual = dialogue.filter((d) => d.dual);
  // Two <DualDialogue> pairs in the fixture, four dialogue lines total.
  assert.equal(dual.length, 4);
});

test('fdx: rejects a file that is not well-formed XML', async () => {
  if (typeof globalThis.DOMParser === 'undefined') {
    const { DOMParser } = await import('linkedom');
    globalThis.DOMParser = DOMParser;
  }
  const { parseFdx } = await import('../src/core/parsers/fdx.js');
  assert.throws(() => parseFdx('not xml at all'), /Content|XML/i);
});

// --- Workbook writer -----------------------------------------------------

test('xlsx: produces a real ZIP container with one part per sheet', async () => {
  const { createWorkbook, toArgb, columnName } = await import('../src/export/xlsx.js');

  assert.equal(columnName(0), 'A');
  assert.equal(columnName(26), 'AA');
  assert.equal(toArgb('#e5484d'), 'FFE5484D');

  const blob = createWorkbook([
    {
      name: 'Scenes',
      columns: ['Scene', 'Set'],
      rows: [['1', 'KITCHEN & "GARDEN" <A>'], ['2', 'CAFÉ']],
      rowColors: { 0: toArgb('#a457d6') }
    },
    { name: 'Bad/Name:*?[]', columns: ['A'], rows: [[1]] }
  ]);

  const bytes = new Uint8Array(await blob.arrayBuffer());
  assert.deepEqual(Array.from(bytes.slice(0, 4)), [0x50, 0x4b, 0x03, 0x04], 'ZIP magic');

  const text = Buffer.from(bytes).toString('latin1');
  assert.ok(text.includes('xl/worksheets/sheet1.xml'));
  assert.ok(text.includes('xl/worksheets/sheet2.xml'));
  assert.ok(text.includes('[Content_Types].xml'));
  // Sheet names are sanitised: Excel rejects / : * ? [ ].
  assert.ok(!/name="Bad\/Name/.test(text));
});

test('zip: CRC32 matches the reference value for a known input', async () => {
  const { crc32 } = await import('../src/export/zip.js');
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});

// --- Direct PDF export -----------------------------------------------------
//
// PDF layout can't be asserted pixel-by-pixel with node --test the way text
// formats can (see the plan's own verification note). These checks catch
// gross breakage — a well-formed file, the right page count, no crash on
// characters the standard fonts can't encode — and leave visual review to
// opening the file, same as every other manual pass in this suite's history.

test('pdf: script export is well-formed and paginates one PDF page per script page, plus a cover', async () => {
  const { doc } = tagged();
  const pagination = paginate(doc, charactersById(doc));
  const bytes = await buildScriptPdf(doc, pagination);

  assert.equal(Buffer.from(bytes.slice(0, 5)).toString('latin1'), '%PDF-');
  assert.ok(bytes.length > 500, 'a real document, not an empty shell');

  const loaded = await PDFDocument.load(bytes);
  assert.equal(loaded.getPageCount(), pagination.pages.length + 1);
});

test('pdf: breakdown sheets export is well-formed and paginates one PDF page per scene, plus a cover', async () => {
  const { doc, breakdown } = tagged();
  const pagination = paginate(doc, charactersById(doc));
  const bytes = await buildSheetsPdf(doc, pagination, breakdown);

  assert.equal(Buffer.from(bytes.slice(0, 5)).toString('latin1'), '%PDF-');

  const loaded = await PDFDocument.load(bytes);
  assert.equal(loaded.getPageCount(), scenes(doc).length + 1);
});

test('sanitizePdfText: maps smart punctuation to ASCII and drops what still does not fit WinAnsi', () => {
  assert.equal(sanitizePdfText('“Quoted” — an ellipsis…'), '"Quoted" - an ellipsis...');
  assert.equal(sanitizePdfText('emoji: 🎭'), 'emoji: ?');
  assert.equal(sanitizePdfText('café'), 'café', 'Latin-1 supplement passes through unchanged');
});

test('pdf: a title or tag label outside WinAnsi does not crash either PDF export', async () => {
  const document = load();
  document.title = { en: 'Ünïcode Title 🎬 — “Test”' };
  let breakdown = createBreakdown(document);

  const scene = scenes(document)[0];
  const element = scene.body.find((e) => e.type === 'action');
  const text = element.text.en;
  const at = [...text.slice(0, text.indexOf('kitchen'))].length;
  breakdown = addTagInstance(breakdown, {
    category: 'props',
    label: 'Emoji Prop 🔑',
    instance: createInstance({ scene, element, start: at, end: at + 'kitchen'.length, text: 'kitchen' })
  });

  const pagination = paginate(document, charactersById(document));
  await assert.doesNotReject(buildScriptPdf(document, pagination));
  await assert.doesNotReject(buildSheetsPdf(document, pagination, breakdown));
});
