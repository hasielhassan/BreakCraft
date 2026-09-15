/**
 * Breakdown category registry.
 *
 * BreakCraft carries the full industry category set. ScreenJSON only defines ten
 * scene tag arrays, so several categories share a target field on export; the
 * `slugPrefix` disambiguates them so an exported document can be re-imported
 * without collapsing vehicles into props.
 *
 * Colours follow the conventional breakdown-sheet palette (cast red, props
 * purple, wardrobe green, SFX blue, and so on) so a producer who has marked up
 * paper scripts reads the highlights without a legend.
 */

export const CATEGORIES = Object.freeze([
  {
    id: 'cast',
    label: 'Cast',
    short: 'Cast',
    icon: '🎭',
    color: '#e5484d',
    department: 'Production',
    screenjson: 'cast',
    slugPrefix: null,
    description: 'Speaking roles. Auto-derived from character cues; tag here only for non-speaking named roles.'
  },
  {
    id: 'background',
    label: 'Background / Extras',
    short: 'BG',
    icon: '👥',
    color: '#e2b53e',
    department: 'Production',
    screenjson: 'extra',
    slugPrefix: null
  },
  {
    id: 'stunts',
    label: 'Stunts',
    short: 'Stunt',
    icon: '🤸',
    color: '#f0762a',
    department: 'Stunts',
    screenjson: 'sfx',
    slugPrefix: 'stunt'
  },
  {
    id: 'props',
    label: 'Props',
    short: 'Prop',
    icon: '🔑',
    color: '#a457d6',
    department: 'Art',
    screenjson: 'props',
    slugPrefix: null
  },
  {
    id: 'setdressing',
    label: 'Set Dressing',
    short: 'Dress',
    icon: '🪑',
    color: '#3fa96b',
    department: 'Art',
    screenjson: 'props',
    slugPrefix: 'dress'
  },
  {
    id: 'vehicles',
    label: 'Vehicles',
    short: 'Vehicle',
    icon: '🚗',
    color: '#e668a7',
    department: 'Transport',
    screenjson: 'props',
    slugPrefix: 'vehicle'
  },
  {
    id: 'wardrobe',
    label: 'Wardrobe',
    short: 'Wardrobe',
    icon: '👕',
    color: '#4fb477',
    department: 'Costume',
    screenjson: 'wardrobe',
    slugPrefix: null
  },
  {
    id: 'makeup',
    label: 'Makeup / Hair',
    short: 'MU/Hair',
    icon: '💄',
    color: '#d4a15e',
    department: 'Makeup',
    screenjson: 'wardrobe',
    slugPrefix: 'makeup'
  },
  {
    id: 'sfx',
    label: 'Special Effects',
    short: 'SFX',
    icon: '💥',
    color: '#4a8fe0',
    department: 'SFX',
    screenjson: 'sfx',
    slugPrefix: null
  },
  {
    id: 'vfx',
    label: 'Visual Effects',
    short: 'VFX',
    icon: '✨',
    color: '#5ec8d8',
    department: 'VFX',
    screenjson: 'vfx',
    slugPrefix: null
  },
  {
    id: 'sound',
    label: 'Sound / Music',
    short: 'Sound',
    icon: '🎵',
    color: '#9a7b52',
    department: 'Sound',
    screenjson: 'sounds',
    slugPrefix: null
  },
  {
    id: 'animals',
    label: 'Animals',
    short: 'Animal',
    icon: '🐾',
    color: '#c58a4a',
    department: 'Animals',
    screenjson: 'animals',
    slugPrefix: null
  },
  {
    id: 'equipment',
    label: 'Special Equipment',
    short: 'Equip',
    icon: '🎥',
    color: '#6f7ae0',
    department: 'Camera / Grip',
    screenjson: 'tags',
    slugPrefix: 'equip'
  },
  {
    id: 'location',
    label: 'Location Notes',
    short: 'Location',
    icon: '📍',
    color: '#39a0a8',
    department: 'Locations',
    screenjson: 'locations',
    slugPrefix: null
  },
  {
    id: 'notes',
    label: 'Production Notes',
    short: 'Note',
    icon: '📝',
    color: '#8d95a5',
    department: 'Production',
    screenjson: 'tags',
    slugPrefix: 'note'
  }
]);

/** Every ScreenJSON scene tag field a category can map to (see `SCENE_TAG_FIELDS`). */
export const SCREENJSON_TARGETS = Object.freeze([
  'props',
  'wardrobe',
  'sfx',
  'vfx',
  'sounds',
  'animals',
  'extra',
  'locations',
  'moods',
  'tags'
]);

const BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));
const BUILTIN_IDS = new Set(CATEGORIES.map((c) => c.id));

/** True for any of the 15 shipped category ids — these can be recolored/re-iconed but never deleted. */
export function isBuiltinCategory(id) {
  return BUILTIN_IDS.has(id);
}

/**
 * Resolve the effective category list for a project: built-ins with the
 * project's per-id overrides (color/icon) applied, plus its custom
 * categories appended.
 *
 * This is the *only* function UI and export code should use to get "the
 * current categories" — never import `CATEGORIES` directly once a
 * `breakdown` is in scope, or a project's custom categories and recolors
 * silently disappear.
 */
export function resolveCategories(breakdown) {
  const overrides = breakdown?.categories?.overrides || {};
  const custom = breakdown?.categories?.custom || [];

  const builtins = CATEGORIES.map((category) => {
    const override = overrides[category.id];
    return override ? { ...category, ...override } : category;
  });

  return [...builtins, ...custom];
}

/** Breakdown-aware lookup — use this instead of `getCategory` wherever a breakdown is in scope. */
export function resolveCategory(breakdown, id) {
  return resolveCategories(breakdown).find((c) => c.id === id) || null;
}

export function resolveCategoryColor(breakdown, id) {
  return resolveCategory(breakdown, id)?.color || 'var(--ds-text-muted)';
}

export function resolveCategoryLabel(breakdown, id) {
  return resolveCategory(breakdown, id)?.label || id;
}

export function resolveCategoryIcon(breakdown, id) {
  return resolveCategory(breakdown, id)?.icon || '';
}

export function getCategory(id) {
  return BY_ID.get(id) || null;
}

export function categoryColor(id) {
  return BY_ID.get(id)?.color || 'var(--ds-text-muted)';
}

export function categoryLabel(id) {
  return BY_ID.get(id)?.label || id;
}

/** Default category offered when a user starts a tag from a text selection. */
export const DEFAULT_CATEGORY = 'props';

/**
 * Build the slug written into a ScreenJSON scene tag array.
 *
 * Prefixed categories keep their identity through a round trip: `vehicle-taxi`
 * re-imports as a vehicle, not as an anonymous prop. Breakdown-aware so a
 * project's custom categories round-trip too, not just the 15 built-ins.
 */
export function toScreenJsonSlug(breakdown, category, baseSlug) {
  const meta = resolveCategory(breakdown, category);
  if (!meta || !baseSlug) return null;
  return meta.slugPrefix ? `${meta.slugPrefix}-${baseSlug}` : baseSlug;
}

/**
 * Reverse of `toScreenJsonSlug`: recover `{category, slug}` from a scene tag.
 *
 * `field` is the ScreenJSON scene field the slug came from, which narrows the
 * candidates before the prefix is consulted.
 */
export function fromScreenJsonSlug(breakdown, field, slug) {
  const candidates = resolveCategories(breakdown).filter((c) => c.screenjson === field);

  for (const candidate of candidates) {
    if (candidate.slugPrefix && slug.startsWith(`${candidate.slugPrefix}-`)) {
      return { category: candidate.id, slug: slug.slice(candidate.slugPrefix.length + 1) };
    }
  }

  const plain = candidates.find((c) => !c.slugPrefix);
  return plain ? { category: plain.id, slug } : null;
}

function shallowEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

/**
 * Compares a project's embedded category snapshot (`breakdown.categories`)
 * against the user's personal library (`storage.getCategoryLibrary()`) and
 * reports every custom category or built-in override the project defines
 * that the library either lacks or has recorded differently.
 *
 * The project's own categories always render correctly regardless of this
 * result — they're already embedded in `breakdown.categories` — this is
 * purely to decide whether AppShell should offer to also persist them into
 * the reusable library. An empty result means nothing to ask about.
 */
export function diffCategoryLibrary(library, snapshot) {
  const pending = [];

  for (const category of snapshot?.custom || []) {
    const existing = (library?.custom || []).find((c) => c.id === category.id);
    if (!existing || !shallowEqual(existing, category)) {
      pending.push({ kind: 'custom', id: category.id, incoming: category, existing: existing || null });
    }
  }

  for (const [id, override] of Object.entries(snapshot?.overrides || {})) {
    const existing = library?.overrides?.[id];
    if (!existing || !shallowEqual(existing, override)) {
      pending.push({ kind: 'override', id, incoming: override, existing: existing || null });
    }
  }

  return pending;
}

/** Applies every pending entry from `diffCategoryLibrary` onto a library, for the "update my library" choice. */
export function applyToCategoryLibrary(library, pending) {
  const next = {
    custom: [...(library?.custom || [])],
    overrides: { ...(library?.overrides || {}) }
  };

  for (const entry of pending) {
    if (entry.kind === 'custom') {
      const index = next.custom.findIndex((c) => c.id === entry.id);
      if (index === -1) next.custom.push(entry.incoming);
      else next.custom[index] = entry.incoming;
    } else {
      next.overrides[entry.id] = entry.incoming;
    }
  }

  return next;
}
