/**
 * Breakdown modes.
 *
 * A mode is a default *view* over the category registry for a given
 * production type — which categories the tagging popover, breakdown grid and
 * reports show by default, what a category is called while that mode is
 * active, and which of the handful of non-category report columns (Cast,
 * Shoot Day, Unit, …) show up. It never removes or hides tagged data: a
 * category with tags on it stays visible in the Elements library and in
 * every report/export regardless of mode, and the "Show all categories"
 * override (`breakdown.settings.showAllCategories`) bypasses the *visibility*
 * half of this filter anywhere it would otherwise apply — aliasing still
 * applies either way, since renaming isn't hiding.
 *
 * Custom, project-defined categories are never in a mode's fixed id list —
 * they always pass the filter, since a user who added one for this project
 * clearly wants to see it regardless of which mode is selected.
 *
 * Storage mirrors the category registry (`categories.js`): the three shipped
 * modes are built-ins that can be renamed, re-iconed and reconfigured but
 * never deleted, recorded as a per-id `overrides` diff so the shipped
 * defaults themselves are never mutated; a project can also define fully
 * custom modes of its own. `resolveModes()` is the only function UI and
 * export code should use to get "the current modes".
 */

import { isBuiltinCategory, resolveCategory } from './categories.js';

/** Non-category columns a mode can also show or hide in the Scenes report/CSV/XLSX. */
export const EXTRA_COLUMNS = Object.freeze([
  { id: 'cast', label: 'Cast' },
  { id: 'synopsis', label: 'Synopsis' },
  { id: 'duration', label: 'Duration' },
  { id: 'shootDay', label: 'Shoot Day' },
  { id: 'unit', label: 'Unit' },
  { id: 'notes', label: 'Notes' }
]);

const BUILTIN_MODES = Object.freeze([
  {
    id: 'all',
    label: 'All Categories',
    icon: '🗂️',
    categoryIds: null,
    labels: {},
    columns: {}
  },
  {
    id: 'live-action',
    label: 'Live Action',
    icon: '🎬',
    categoryIds: [
      'cast', 'background', 'stunts', 'props', 'setdressing', 'vehicles',
      'wardrobe', 'makeup', 'sfx', 'vfx', 'sound', 'animals', 'equipment',
      'location', 'notes'
    ],
    labels: {},
    columns: {}
  },
  {
    id: 'animation',
    label: 'Animation',
    icon: '🎨',
    // No physical stunts, practical makeup/hair, practical SFX rigs, live
    // animal wrangling or camera/grip equipment on an animated production —
    // those departments simply don't exist, so they're left off this mode's
    // default view. "Cast" reads as "Characters" here, and the Shoot
    // Day/Unit columns (live-action scheduling concepts) are hidden from its
    // reports.
    categoryIds: [
      'cast', 'background', 'props', 'setdressing', 'vehicles', 'wardrobe',
      'vfx', 'sound', 'location', 'notes'
    ],
    labels: { cast: 'Characters' },
    columns: { shootDay: false, unit: false }
  }
]);

const BUILTIN_BY_ID = new Map(BUILTIN_MODES.map((mode) => [mode.id, mode]));

/** True for any of the 3 shipped mode ids — these can be reconfigured but never deleted. */
export function isBuiltinMode(id) {
  return BUILTIN_BY_ID.has(id);
}

/**
 * Resolve the effective mode list for a project: built-ins with the
 * project's per-id overrides applied, plus its custom modes appended.
 */
export function resolveModes(breakdown) {
  const overrides = breakdown?.modes?.overrides || {};
  const custom = breakdown?.modes?.custom || [];

  const builtins = BUILTIN_MODES.map((mode) => {
    const override = overrides[mode.id];
    return override ? { ...mode, ...override } : mode;
  });

  return [...builtins, ...custom];
}

export function resolveMode(breakdown, modeId) {
  const modes = resolveModes(breakdown);
  return modes.find((mode) => mode.id === modeId) || modes[0];
}

/** The mode currently active for `breakdown` (defaults to "All Categories"). */
export function activeMode(breakdown) {
  return resolveMode(breakdown, breakdown?.settings?.mode || 'all');
}

/** True if `categoryId` should appear in `mode`'s default picker/grid view. */
export function modeIncludesCategory(mode, categoryId) {
  if (!mode?.categoryIds) return true;
  if (!isBuiltinCategory(categoryId)) return true;
  return mode.categoryIds.includes(categoryId);
}

/** `category`'s display label under `mode` — its alias if the mode set one, otherwise its own label. */
export function categoryLabelForMode(mode, category) {
  return mode?.labels?.[category.id] || category.label;
}

/** Mode-aware label lookup by category id, for the many places that only have an id (e.g. the fixed 'cast' column). */
export function categoryLabelForModeId(breakdown, id) {
  const category = resolveCategory(breakdown, id) || { id, label: id };
  return categoryLabelForMode(activeMode(breakdown), category);
}

/** True if `columnId` (one of `EXTRA_COLUMNS`) should appear in `mode`'s reports. Visible unless explicitly turned off. */
export function columnVisibleForMode(mode, columnId) {
  return mode?.columns?.[columnId] !== false;
}

function relabel(mode, category) {
  const alias = mode?.labels?.[category.id];
  return alias ? { ...category, label: alias, short: alias } : category;
}

/**
 * Filters a resolved category list down to what `breakdown`'s current mode
 * shows by default — unless the "show all" override is on, in which case
 * every category passes through unfiltered — and relabels every category
 * that survives with the mode's alias, if it set one. Callers that must
 * never hide tagged data (Elements library, reports, exports) should not use
 * this for filtering and should keep rendering the full `resolveCategories()`
 * list instead, passed through `labelCategoriesForMode` if they still want
 * mode-aware names.
 */
export function visibleCategoriesForMode(breakdown, categories) {
  const settings = breakdown?.settings || {};
  const mode = activeMode(breakdown);

  if (settings.showAllCategories || !settings.mode || settings.mode === 'all') {
    return categories.map((category) => relabel(mode, category));
  }
  return categories
    .filter((category) => modeIncludesCategory(mode, category.id))
    .map((category) => relabel(mode, category));
}

/**
 * Relabels every category for `breakdown`'s current mode without filtering —
 * for views (Elements, Inspector) that must always show every category
 * regardless of mode, but should still use the mode's vocabulary.
 */
export function labelCategoriesForMode(breakdown, categories) {
  const mode = activeMode(breakdown);
  return categories.map((category) => relabel(mode, category));
}
