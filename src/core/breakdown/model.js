/**
 * The breakdown sidecar: BreakCraft's own document, kept beside the ScreenJSON
 * script rather than inside it.
 *
 * Why a sidecar rather than writing into the script
 * -------------------------------------------------
 * ScreenJSON sets `additionalProperties: false` at every level including the
 * root, so there is nowhere to put a richer breakdown. Its scene tag arrays are
 * flat slug lists with no offsets, quantities, departments or status. Those are
 * exactly the fields a producer needs, so the sidecar is authoritative and the
 * scene arrays are a lossy projection produced on export.
 *
 * All functions here are pure: they take a breakdown and return a new one. That
 * keeps React state updates predictable and makes the undo stack a matter of
 * keeping previous references rather than deep-cloning.
 */

import { uuid } from '../../utils/uuid.js';
import { hashText, normalizeKey, singularize, slugify } from '../../utils/text.js';
import { elementText, formatSlugline, iterateElements } from '../screenjson/query.js';
import { DEFAULT_CATEGORY, isBuiltinCategory, resolveCategory } from './categories.js';
import { isBuiltinMode } from './modes.js';

export const BREAKDOWN_VERSION = '0.2.0';

/** Tag lifecycle. `suggested` exists for the future automatic extractor. */
export const TAG_STATUS = Object.freeze({
  SUGGESTED: 'suggested',
  CONFIRMED: 'confirmed',
  REJECTED: 'rejected'
});

export const DEFAULT_SETTINGS = Object.freeze({
  minutesPerPage: 1,
  mode: 'all',
  showAllCategories: false
});

/** Create an empty breakdown bound to a script document. */
export function createBreakdown(scriptDoc) {
  return {
    version: BREAKDOWN_VERSION,
    id: uuid(),
    scriptId: scriptDoc?.id || null,
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    tags: [],
    scenes: {}, // sceneId -> { notes, shootDay, unit }
    categories: { custom: [], overrides: {} },
    settings: { ...DEFAULT_SETTINGS },
    autoElements: { cast: { aliases: {}, hidden: [] }, sets: { aliases: {}, hidden: [] } },
    modes: { custom: [], overrides: {} }
  };
}

/**
 * Fills in fields introduced after a breakdown was first saved, so an older
 * sidecar (or one round-tripped through a tool that doesn't know about them
 * yet) keeps loading instead of throwing on a missing `categories`/`settings`.
 * Never removes or reinterprets a field the caller already set.
 */
export function withDefaults(breakdown) {
  return {
    ...breakdown,
    categories: {
      custom: breakdown.categories?.custom || [],
      overrides: breakdown.categories?.overrides || {}
    },
    settings: { ...DEFAULT_SETTINGS, ...(breakdown.settings || {}) },
    autoElements: {
      cast: {
        aliases: breakdown.autoElements?.cast?.aliases || {},
        hidden: breakdown.autoElements?.cast?.hidden || []
      },
      sets: {
        aliases: breakdown.autoElements?.sets?.aliases || {},
        hidden: breakdown.autoElements?.sets?.hidden || []
      }
    },
    modes: {
      custom: breakdown.modes?.custom || [],
      overrides: breakdown.modes?.overrides || {}
    }
  };
}

function touch(breakdown, changes) {
  return { ...breakdown, ...changes, updated: new Date().toISOString() };
}

/**
 * Canonical join key for a tag.
 *
 * "the old oak DESK" and "an Old Oak Desk" resolve to the same key so the two do
 * not appear as separate line items in the element library. Leading articles are
 * stripped and the final word is singularised; anything more aggressive starts
 * merging things a producer meant to keep apart.
 */
export function tagKey(label) {
  const cleaned = normalizeKey(label).replace(/^(the|a|an|his|her|their|its|some)\s+/i, '');
  const words = cleaned.split(' ').filter(Boolean);
  if (!words.length) return null;
  words[words.length - 1] = singularize(words[words.length - 1]);
  return slugify(words.join(' ')) || slugify(cleaned);
}

/** Find an existing tag by category and key. */
export function findTag(breakdown, category, key) {
  return breakdown.tags.find((t) => t.category === category && t.key === key) || null;
}

export function getTag(breakdown, tagId) {
  return breakdown.tags.find((t) => t.id === tagId) || null;
}

/**
 * Build an instance record from a text selection.
 *
 * The anchor fields (`sceneKey`, `elementKey`, `text`) are what allow tags to be
 * re-attached when a new draft of the same script is imported: ids change, but
 * normalised scene headings and element text usually do not.
 */
export function createInstance({ scene, element, start, end, text, source = 'user' }) {
  return {
    id: uuid(),
    sceneId: scene.id,
    elementId: element.id,
    start,
    end,
    text,
    source,
    sceneKey: hashText(formatSlugline(scene.heading)),
    elementKey: hashText(text)
  };
}

/**
 * Add a tag instance, creating or reusing the parent tag.
 *
 * Reuse is by `{category, key}`: tagging "revolver" in scene 3 and again in
 * scene 40 produces one element with two instances, which is what a breakdown
 * sheet and a props list both need.
 */
export function addTagInstance(breakdown, { category, label, instance, department, qty }) {
  const key = tagKey(label);
  if (!key) return breakdown;

  const existing = findTag(breakdown, category, key);

  if (existing) {
    // Ignore an exact duplicate range; re-tagging the same words is a no-op
    // rather than a second line on the report.
    const duplicate = existing.instances.some(
      (i) =>
        i.elementId === instance.elementId &&
        i.start === instance.start &&
        i.end === instance.end
    );
    if (duplicate) return breakdown;

    return touch(breakdown, {
      tags: breakdown.tags.map((t) =>
        t.id === existing.id ? { ...t, instances: [...t.instances, instance] } : t
      )
    });
  }

  const meta = resolveCategory(breakdown, category);
  const tag = {
    id: uuid(),
    category,
    key,
    label: label.trim(),
    aliases: [],
    status: TAG_STATUS.CONFIRMED,
    qty: qty ?? 1,
    department: department || meta?.department || '',
    notes: '',
    instances: [instance]
  };

  return touch(breakdown, { tags: [...breakdown.tags, tag] });
}

export function updateTag(breakdown, tagId, changes) {
  const next = breakdown.tags.map((tag) => {
    if (tag.id !== tagId) return tag;
    const merged = { ...tag, ...changes };
    // Renaming re-derives the join key so the library stays consistent.
    if (changes.label !== undefined) merged.key = tagKey(changes.label) || tag.key;
    return merged;
  });
  return touch(breakdown, { tags: next });
}

export function removeTag(breakdown, tagId) {
  return touch(breakdown, { tags: breakdown.tags.filter((t) => t.id !== tagId) });
}

/** Remove one occurrence; the tag itself disappears when its last one goes. */
export function removeInstance(breakdown, tagId, instanceId) {
  const tags = [];
  for (const tag of breakdown.tags) {
    if (tag.id !== tagId) {
      tags.push(tag);
      continue;
    }
    const instances = tag.instances.filter((i) => i.id !== instanceId);
    if (instances.length) tags.push({ ...tag, instances });
  }
  return touch(breakdown, { tags });
}

/**
 * Merge `sourceId` into `targetId`.
 *
 * Used when the same element was tagged under two spellings ("Jim's revolver"
 * and "revolver"), or under two different categories by mistake. Instances
 * are concatenated onto the target, the source's label and aliases survive as
 * aliases on the target (so "Jim's revolver" is still recognisable later),
 * and the source disappears. Categories need not match — merging across
 * categories moves the source's instances to the target's category, which is
 * the whole point when a producer tagged something under the wrong one.
 */
export function mergeTags(breakdown, sourceId, targetId) {
  if (sourceId === targetId) return breakdown;
  const source = getTag(breakdown, sourceId);
  const target = getTag(breakdown, targetId);
  if (!source || !target) return breakdown;

  const aliases = Array.from(
    new Set([...(target.aliases || []), source.label, ...(source.aliases || [])])
  ).filter((alias) => alias && alias !== target.label);

  const tags = breakdown.tags
    .filter((t) => t.id !== sourceId)
    .map((t) =>
      t.id === targetId
        ? { ...t, instances: [...t.instances, ...source.instances], aliases }
        : t
    );

  return touch(breakdown, { tags });
}

/**
 * Cast and Sets in the Element Library aren't tags — they're computed
 * straight from the script (character cues, scene headings) — so merging or
 * removing one can't touch `tags`. `autoElements` is a small overlay of the
 * same shape kept alongside it: an alias map (source key -> target key, for
 * consolidating two spellings or two characters that turned out to be one)
 * and a hidden-key list (for excluding a row from the report without
 * touching the script that produced it). `kind` is `'cast'` (keyed by
 * character id) or `'sets'` (keyed by the raw setting string).
 */
export function mergeAutoElement(breakdown, kind, sourceKey, targetKey) {
  if (sourceKey === targetKey) return breakdown;
  const bucket = breakdown.autoElements[kind];
  return touch(breakdown, {
    autoElements: {
      ...breakdown.autoElements,
      [kind]: { ...bucket, aliases: { ...bucket.aliases, [sourceKey]: targetKey } }
    }
  });
}

export function hideAutoElement(breakdown, kind, key) {
  const bucket = breakdown.autoElements[kind];
  if (bucket.hidden.includes(key)) return breakdown;
  return touch(breakdown, {
    autoElements: {
      ...breakdown.autoElements,
      [kind]: { ...bucket, hidden: [...bucket.hidden, key] }
    }
  });
}

/** Follows a merge chain to its final target; cycle-safe. */
export function resolveAutoAlias(breakdown, kind, key) {
  const aliases = breakdown?.autoElements?.[kind]?.aliases || {};
  const seen = new Set();
  let current = key;
  while (aliases[current] !== undefined && !seen.has(current)) {
    seen.add(current);
    current = aliases[current];
  }
  return current;
}

/**
 * Adds a project-scoped custom category.
 *
 * `id` is derived from `label` if not given explicitly. Returns the same
 * breakdown unchanged if the id is empty, collides with one of the 15
 * built-ins, or an existing custom category — the caller (the Category
 * Manager dialog) is expected to validate uniqueness up front and only call
 * this once it has a clean id, exactly like `TagPopover` already does for
 * `tagKey` before calling `addTagInstance`.
 */
export function addCustomCategory(breakdown, definition) {
  const id = slugify(definition.id || definition.label);
  if (!id || isBuiltinCategory(id)) return breakdown;
  if (breakdown.categories.custom.some((c) => c.id === id)) return breakdown;

  const category = {
    id,
    label: definition.label.trim(),
    short: definition.short?.trim() || definition.label.trim(),
    icon: definition.icon || '',
    color: definition.color || '#8d95a5',
    department: definition.department?.trim() || '',
    screenjson: definition.screenjson || 'tags',
    slugPrefix: definition.slugPrefix || id
  };

  return touch(breakdown, {
    categories: { ...breakdown.categories, custom: [...breakdown.categories.custom, category] }
  });
}

/**
 * Updates a category's presentation. Built-in categories only accept
 * `color`/`icon` (stored as a per-id override, never mutating the shipped
 * defaults) — their ScreenJSON mapping is fixed and never user-editable.
 * Custom categories accept any field except `id`.
 */
export function updateCategoryOverride(breakdown, id, changes) {
  if (isBuiltinCategory(id)) {
    const allowed = {};
    if (changes.color !== undefined) allowed.color = changes.color;
    if (changes.icon !== undefined) allowed.icon = changes.icon;
    if (!Object.keys(allowed).length) return breakdown;

    return touch(breakdown, {
      categories: {
        ...breakdown.categories,
        overrides: {
          ...breakdown.categories.overrides,
          [id]: { ...breakdown.categories.overrides[id], ...allowed }
        }
      }
    });
  }

  let changed = false;
  const custom = breakdown.categories.custom.map((c) => {
    if (c.id !== id) return c;
    changed = true;
    return { ...c, ...changes, id: c.id };
  });
  if (!changed) return breakdown;

  return touch(breakdown, { categories: { ...breakdown.categories, custom } });
}

/**
 * Removes a custom category definition. Refuses (returns the same breakdown)
 * for a built-in id, an unknown id, or one still used by at least one tag —
 * a category never disappears out from under tagged data. The caller should
 * check `breakdown.tags.some(t => t.category === id)` up front to explain
 * why the delete button is disabled, rather than relying on this silent
 * no-op.
 */
export function removeCustomCategory(breakdown, id) {
  if (isBuiltinCategory(id)) return breakdown;
  if (breakdown.tags.some((t) => t.category === id)) return breakdown;

  const custom = breakdown.categories.custom.filter((c) => c.id !== id);
  if (custom.length === breakdown.categories.custom.length) return breakdown;

  return touch(breakdown, { categories: { ...breakdown.categories, custom } });
}

/**
 * Adds a project-scoped custom mode. `id` is derived from `label` if not
 * given explicitly. Returns the same breakdown unchanged if the id is empty
 * or collides with one of the 3 built-ins or an existing custom mode — same
 * validate-before-calling convention as `addCustomCategory`. `categoryIds:
 * null` (the default) means "show every category", the same convention the
 * built-in "All Categories" mode uses — a brand new mode starts from
 * everything visible and gets narrowed from there.
 */
export function addCustomMode(breakdown, definition) {
  const id = slugify(definition.id || definition.label);
  if (!id || isBuiltinMode(id)) return breakdown;
  if (breakdown.modes.custom.some((m) => m.id === id)) return breakdown;

  const mode = {
    id,
    label: definition.label.trim(),
    icon: definition.icon || '',
    categoryIds: definition.categoryIds ?? null,
    labels: definition.labels || {},
    columns: definition.columns || {}
  };

  return touch(breakdown, { modes: { ...breakdown.modes, custom: [...breakdown.modes.custom, mode] } });
}

/**
 * Updates a mode's configuration. Built-in modes accept `label`, `icon`,
 * `categoryIds`, `labels` and `columns` — unlike built-in categories (whose
 * ScreenJSON mapping is fixed), a mode is pure presentation, so there is
 * nothing about a shipped mode that needs to stay immutable — recorded as a
 * per-id override, never mutating the shipped default. Custom modes accept
 * any field except `id`.
 */
export function updateModeOverride(breakdown, id, changes) {
  if (isBuiltinMode(id)) {
    return touch(breakdown, {
      modes: {
        ...breakdown.modes,
        overrides: { ...breakdown.modes.overrides, [id]: { ...breakdown.modes.overrides[id], ...changes } }
      }
    });
  }

  let changed = false;
  const custom = breakdown.modes.custom.map((m) => {
    if (m.id !== id) return m;
    changed = true;
    return { ...m, ...changes, id: m.id };
  });
  if (!changed) return breakdown;

  return touch(breakdown, { modes: { ...breakdown.modes, custom } });
}

/**
 * Removes a custom mode definition. Refuses for a built-in or unknown id. A
 * mode being deleted can't stay selected, so the project falls back to "All
 * Categories" if it was active.
 */
export function removeCustomMode(breakdown, id) {
  if (isBuiltinMode(id)) return breakdown;

  const custom = breakdown.modes.custom.filter((m) => m.id !== id);
  if (custom.length === breakdown.modes.custom.length) return breakdown;

  const settings = breakdown.settings.mode === id ? { ...breakdown.settings, mode: 'all' } : breakdown.settings;

  return touch(breakdown, { modes: { ...breakdown.modes, custom }, settings });
}

/**
 * Updates project-scoped settings (mode, showAllCategories, minutesPerPage, …).
 * A single generic setter rather than one function per field, since every
 * caller already has the exact `{field: value}` it wants to write.
 */
export function updateSettings(breakdown, changes) {
  return touch(breakdown, { settings: { ...breakdown.settings, ...changes } });
}

/** Per-scene production notes kept alongside the tags. */
export function setSceneField(breakdown, sceneId, field, value) {
  const current = breakdown.scenes[sceneId] || {};
  return touch(breakdown, {
    scenes: { ...breakdown.scenes, [sceneId]: { ...current, [field]: value } }
  });
}

/** Index of elementId -> instances, for rendering highlights. */
export function instancesByElement(breakdown) {
  const index = new Map();
  for (const tag of breakdown.tags) {
    if (tag.status === TAG_STATUS.REJECTED) continue;
    for (const instance of tag.instances) {
      const list = index.get(instance.elementId) || [];
      list.push({ ...instance, tagId: tag.id, category: tag.category, label: tag.label });
      index.set(instance.elementId, list);
    }
  }
  for (const list of index.values()) list.sort((a, b) => a.start - b.start || a.end - b.end);
  return index;
}

/** Index of sceneId -> tags present in that scene. */
export function tagsByScene(breakdown) {
  const index = new Map();
  for (const tag of breakdown.tags) {
    if (tag.status === TAG_STATUS.REJECTED) continue;
    for (const instance of tag.instances) {
      const list = index.get(instance.sceneId) || [];
      if (!list.some((t) => t.id === tag.id)) list.push(tag);
      index.set(instance.sceneId, list);
    }
  }
  return index;
}

/**
 * Find every other occurrence of a phrase in the script.
 *
 * This is the manual equivalent of the compounding correction loop described in
 * the research plan: confirm a term once, apply it everywhere. Matching is
 * whole-word and case-insensitive but otherwise literal — no stemming, no
 * synonyms — so the result is auditable and never surprises the user.
 *
 * @returns {Array<{scene: object, element: object, start: number, end: number, text: string}>}
 */
export function findOccurrences(scriptDoc, phrase, { excludeElementIds = new Set() } = {}) {
  const needle = String(phrase || '').trim();
  if (needle.length < 2) return [];

  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(needle)}(?![\\p{L}\\p{N}])`, 'giu');
  const lang = scriptDoc?.lang || 'en';
  const hits = [];

  for (const { scene, element } of iterateElements(scriptDoc)) {
    const text = elementText(element, lang);
    if (!text) continue;

    pattern.lastIndex = 0;
    let match = pattern.exec(text);
    while (match) {
      // Offsets are stored in codepoint space; for the Latin text these
      // patterns match, unit and codepoint indices coincide, but the conversion
      // is applied anyway so astral characters earlier in the line cannot shift
      // the highlight.
      const start = [...text.slice(0, match.index)].length;
      const end = start + [...match[0]].length;

      if (!excludeElementIds.has(element.id)) {
        hits.push({ scene, element, start, end, text: match[0] });
      }
      match = pattern.exec(text);
    }
  }

  return hits;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Total tag count excluding rejected ones, for status displays. */
export function activeTagCount(breakdown) {
  return breakdown.tags.filter((t) => t.status !== TAG_STATUS.REJECTED).length;
}

export { DEFAULT_CATEGORY };
