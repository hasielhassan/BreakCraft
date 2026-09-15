/**
 * Derived reports.
 *
 * Everything in this module is computed, never stored: given a script, a
 * pagination result and a breakdown, the same reports come out every time. That
 * is the deterministic half of the product — scene lists, cast matrices, Day Out
 * of Days and set reports need no extraction and no judgement, only traversal.
 */

import { formatEighths } from '../paginate/paginate.js';
import { EIGHTHS_PER_PAGE } from '../paginate/constants.js';
import { ELEMENT_TYPES } from '../screenjson/constants.js';
import {
  charactersById,
  elementText,
  formatSlugline,
  sceneNumber,
  scenes as sceneList,
  speakingCast
} from '../screenjson/query.js';
import { resolveCategories } from './categories.js';
import { resolveAutoAlias, tagsByScene, TAG_STATUS } from './model.js';

/**
 * One row per scene: the spine of the breakdown grid and of every export.
 */
export function sceneRows(scriptDoc, pagination, breakdown) {
  const lang = scriptDoc?.lang || 'en';
  const byId = charactersById(scriptDoc);
  const sceneTags = tagsByScene(breakdown);
  const minutesPerPage = breakdown.settings?.minutesPerPage ?? 1;

  return sceneList(scriptDoc).map((scene, index) => {
    const stats = pagination.sceneStats.get(scene.id) || { lines: 0, eighths: 1, startPage: 1 };
    const cast = speakingCast(scene).map((id) => byId.get(id)?.name || 'UNKNOWN');
    const tags = sceneTags.get(scene.id) || [];
    const estimatedDurationSeconds = Math.round(
      (stats.eighths / EIGHTHS_PER_PAGE) * minutesPerPage * 60
    );

    const byCategory = {};
    for (const category of resolveCategories(breakdown)) {
      byCategory[category.id] = tags
        .filter((t) => t.category === category.id)
        .map((t) => t.label)
        .sort((a, b) => a.localeCompare(b));
    }

    const overrides = breakdown.scenes[scene.id] || {};

    return {
      id: scene.id,
      index,
      number: sceneNumber(scene, index),
      context: scene.heading.context,
      setting: scene.heading.setting,
      time: scene.heading.time,
      mods: scene.heading.mods || [],
      slugline: formatSlugline(scene.heading),
      page: stats.startPage,
      eighths: stats.eighths,
      eighthsLabel: formatEighths(stats.eighths),
      estimatedDurationSeconds,
      lines: stats.lines,
      cast,
      castCount: cast.length,
      dialogueCount: countDialogue(scene),
      synopsis: firstActionLine(scene, lang),
      tagCount: tags.length,
      byCategory,
      notes: overrides.notes || '',
      shootDay: overrides.shootDay || '',
      unit: overrides.unit || ''
    };
  });
}

/**
 * One row per tagged element, with the scenes it appears in — the "element
 * library" a department head actually works from.
 */
export function elementRows(scriptDoc, breakdown) {
  const scenesByIdMap = new Map(sceneList(scriptDoc).map((s, i) => [s.id, { scene: s, index: i }]));

  return breakdown.tags
    .filter((tag) => tag.status !== TAG_STATUS.REJECTED)
    .map((tag) => {
      const sceneNumbers = [];
      const seen = new Set();

      for (const instance of tag.instances) {
        const entry = scenesByIdMap.get(instance.sceneId);
        if (!entry || seen.has(instance.sceneId)) continue;
        seen.add(instance.sceneId);
        sceneNumbers.push({
          id: instance.sceneId,
          index: entry.index,
          number: sceneNumber(entry.scene, entry.index)
        });
      }

      sceneNumbers.sort((a, b) => a.index - b.index);

      return {
        id: tag.id,
        category: tag.category,
        label: tag.label,
        key: tag.key,
        aliases: tag.aliases || [],
        status: tag.status,
        qty: tag.qty,
        department: tag.department,
        notes: tag.notes,
        occurrences: tag.instances.length,
        sceneCount: sceneNumbers.length,
        scenes: sceneNumbers
      };
    })
    .sort(
      (a, b) =>
        a.category.localeCompare(b.category) || a.label.localeCompare(b.label)
    );
}

/**
 * Day Out of Days: the cast x scene matrix, with each character's first and last
 * scene and total scene count.
 *
 * Fully deterministic from character cues — no tagging required, which is why
 * this report is useful the moment a script is imported. `breakdown` is only
 * consulted for the `autoElements.cast` overlay (merges/hides applied from the
 * Element Library) — two characters merged there are combined into one row
 * here, deduping any scene they both appear in, and a hidden one is dropped.
 */
export function dayOutOfDays(scriptDoc, pagination, breakdown) {
  const allScenes = sceneList(scriptDoc);
  const byId = charactersById(scriptDoc);
  const hidden = new Set(breakdown?.autoElements?.cast?.hidden || []);

  const groups = new Map();
  for (const character of scriptDoc.characters || []) {
    const canonicalId = resolveAutoAlias(breakdown, 'cast', character.id);
    if (hidden.has(canonicalId)) continue;

    let group = groups.get(canonicalId);
    if (!group) {
      group = { id: canonicalId, appearances: new Map(), eighths: 0, mergedNames: [] };
      groups.set(canonicalId, group);
    }
    if (character.id !== canonicalId) group.mergedNames.push(character.name);

    allScenes.forEach((scene, index) => {
      if (!speakingCast(scene).includes(character.id) || group.appearances.has(index)) return;
      group.appearances.set(index, sceneNumber(scene, index));
      group.eighths += pagination.sceneStats.get(scene.id)?.eighths || 0;
    });
  }

  const rows = [];
  for (const group of groups.values()) {
    if (!group.appearances.size) continue;
    const indexes = Array.from(group.appearances.keys()).sort((a, b) => a - b);

    rows.push({
      id: group.id,
      name: byId.get(group.id)?.name || group.mergedNames[0] || '',
      aliases: group.mergedNames,
      sceneCount: indexes.length,
      firstScene: group.appearances.get(indexes[0]),
      lastScene: group.appearances.get(indexes[indexes.length - 1]),
      eighths: group.eighths,
      eighthsLabel: formatEighths(group.eighths),
      scenes: indexes.map((i) => group.appearances.get(i))
    });
  }

  return rows.sort((a, b) => b.sceneCount - a.sceneCount || a.name.localeCompare(b.name));
}

/**
 * Set report: scenes grouped by location, with day/night splits.
 *
 * Grouped by `setting` alone, deliberately ignoring `context` and `time`, so
 * "INT. KITCHEN - DAY" and "INT. KITCHEN - NIGHT" count as one location to be
 * scouted and dressed once. `breakdown` is only consulted for the
 * `autoElements.sets` overlay (merges/hides applied from the Element
 * Library) — two settings merged there (e.g. two spellings of the same
 * location) are combined into one row, and a hidden one is dropped.
 */
export function setReport(scriptDoc, pagination, breakdown) {
  const hidden = new Set(breakdown?.autoElements?.sets?.hidden || []);
  const groups = new Map();

  sceneList(scriptDoc).forEach((scene, index) => {
    const rawKey = scene.heading.setting;
    const key = resolveAutoAlias(breakdown, 'sets', rawKey);
    if (hidden.has(key)) return;
    const stats = pagination.sceneStats.get(scene.id) || { eighths: 1 };

    let group = groups.get(key);
    if (!group) {
      group = {
        setting: key,
        aliases: [],
        sceneCount: 0,
        eighths: 0,
        day: 0,
        night: 0,
        interior: 0,
        exterior: 0,
        scenes: []
      };
      groups.set(key, group);
    }
    if (rawKey !== key && !group.aliases.includes(rawKey)) group.aliases.push(rawKey);

    group.sceneCount += 1;
    group.eighths += stats.eighths;
    group.scenes.push(sceneNumber(scene, index));

    if (/NIGHT|DUSK|EVENING/.test(scene.heading.time)) group.night += 1;
    else group.day += 1;

    if (scene.heading.context.includes('INT')) group.interior += 1;
    if (scene.heading.context.includes('EXT')) group.exterior += 1;
  });

  return Array.from(groups.values())
    .map((group) => ({ ...group, eighthsLabel: formatEighths(group.eighths) }))
    .sort((a, b) => b.sceneCount - a.sceneCount || a.setting.localeCompare(b.setting));
}

/** Headline numbers for the status bar and the export cover sheet. */
export function summaryStats(scriptDoc, pagination, breakdown) {
  const allScenes = sceneList(scriptDoc);
  const tags = breakdown.tags.filter((t) => t.status !== TAG_STATUS.REJECTED);
  const minutesPerPage = breakdown.settings?.minutesPerPage ?? 1;

  const perCategory = {};
  for (const category of resolveCategories(breakdown)) {
    perCategory[category.id] = tags.filter((t) => t.category === category.id).length;
  }

  // Summed from each scene's own rounded duration — not from the raw eighths
  // total — so this figure always matches the sum a user sees in the
  // Breakdown grid, rather than drifting from it by a rounding step.
  const estimatedRuntimeSeconds = allScenes.reduce((sum, scene) => {
    const eighths = pagination.sceneStats.get(scene.id)?.eighths || 0;
    return sum + Math.round((eighths / EIGHTHS_PER_PAGE) * minutesPerPage * 60);
  }, 0);

  return {
    scenes: allScenes.length,
    pages: pagination.totalPages,
    characters: (scriptDoc.characters || []).length,
    sets: new Set(allScenes.map((s) => s.heading.setting)).size,
    tags: tags.length,
    instances: tags.reduce((sum, t) => sum + t.instances.length, 0),
    estimatedRuntimeSeconds,
    perCategory
  };
}

function countDialogue(scene) {
  return (scene.body || []).filter((e) => e.type === ELEMENT_TYPES.DIALOGUE).length;
}

/** First action line, used as a one-glance scene synopsis in the grid. */
function firstActionLine(scene, lang) {
  const action = (scene.body || []).find((e) => e.type === ELEMENT_TYPES.ACTION);
  if (!action) return '';
  const text = elementText(action, lang);
  return text.length > 120 ? `${text.slice(0, 117)}…` : text;
}
