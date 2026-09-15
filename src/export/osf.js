/**
 * Open Schedule Format export — the PlanCraft handoff.
 *
 * PlanCraft generates an OSF snapshot from *assumptions*: asset counts come from
 * sliders and assets are linked to shots at random. A breakdown replaces both
 * with measurement — the real characters, props and sets, and the real
 * scene-to-element relationships — while keeping the same activity shape so the
 * file drops straight into PlanCraft's Gantt viewer.
 *
 * Mapping
 * -------
 *   Character                     -> `char` asset
 *   Props / vehicles / animals    -> `prop` asset
 *   Set (grouped scenes)          -> `env` asset and a Sequence
 *   Scene                         -> Shot, duration derived from eighths
 *   Scene's tagged elements       -> Shot -> Asset dependencies
 *
 * Marked experimental: the activity/task templates below are a reasonable
 * default, not a validated production schedule. Durations especially should be
 * reviewed before anyone plans against them.
 */

import { formatEighths } from '../core/paginate/paginate.js';
import { sceneRows } from '../core/breakdown/reports.js';
import { readText, scenes as sceneList } from '../core/screenjson/query.js';
import { resolveCategory } from '../core/breakdown/categories.js';
import { tagsByScene, TAG_STATUS } from '../core/breakdown/model.js';
import { slugify } from '../utils/text.js';

/** Categories that become schedulable assets, and their OSF asset type. */
const ASSET_TYPES = {
  props: 'prop',
  setdressing: 'prop',
  vehicles: 'prop',
  wardrobe: 'prop',
  animals: 'prop',
  sfx: 'prop',
  vfx: 'prop',
  equipment: 'prop'
};

/** Default per-asset tasks, mirroring PlanCraft's editable task templates. */
const DEFAULT_ASSET_TASKS = {
  char: [
    { name: 'Casting', duration: 3 },
    { name: 'Fitting', duration: 1 },
    { name: 'Prep', duration: 2 }
  ],
  prop: [
    { name: 'Source', duration: 2 },
    { name: 'Build / Dress', duration: 3 }
  ],
  env: [
    { name: 'Scout', duration: 2 },
    { name: 'Secure', duration: 3 },
    { name: 'Prep', duration: 2 }
  ]
};

/**
 * @param {object} scriptDoc
 * @param {object} pagination
 * @param {object} breakdown
 * @param {{eighthsPerDay?: number}} options
 * @returns {object} an OSF snapshot
 */
export function buildOsf(scriptDoc, pagination, breakdown, { eighthsPerDay = 40 } = {}) {
  const title = readText(scriptDoc.title, scriptDoc.lang) || 'Untitled';
  const rows = sceneRows(scriptDoc, pagination, breakdown);
  const sceneTags = tagsByScene(breakdown);

  const resourceClasses = [];
  const resourceIds = new Map();

  const resourceFor = (taskName) => {
    if (resourceIds.has(taskName)) return resourceIds.get(taskName);
    const id = `resource_${resourceClasses.length + 1}`;
    resourceClasses.push({ id, name: taskName });
    resourceIds.set(taskName, id);
    return id;
  };

  const assetActivities = [];
  const assetIdByKey = new Map();

  const addAsset = (key, name, type) => {
    if (assetIdByKey.has(key)) return assetIdByKey.get(key);
    const id = `asset_${type}_${assetIdByKey.size + 1}`;
    assetIdByKey.set(key, id);

    assetActivities.push({
      id,
      name,
      category: 'Asset',
      summary: true,
      activities: DEFAULT_ASSET_TASKS[type].map((task, i) => ({
        id: `${id}_task_${i + 1}`,
        name: `${name} - ${task.name}`,
        category: 'AssetTask',
        duration: { units: 'days', value: task.duration },
        resources: [{ resource: resourceFor(`${type}:${task.name}`) }],
        dependencies: i === 0 ? [] : [{ task: `${id}_task_${i}` }]
      }))
    });

    return id;
  };

  // --- Assets ------------------------------------------------------------
  for (const character of scriptDoc.characters || []) {
    addAsset(`char:${character.id}`, character.name, 'char');
  }

  const setNames = new Set(sceneList(scriptDoc).map((s) => s.heading.setting));
  for (const setting of setNames) {
    addAsset(`env:${slugify(setting) || setting}`, setting, 'env');
  }

  for (const tag of breakdown.tags) {
    if (tag.status === TAG_STATUS.REJECTED) continue;
    const type = ASSET_TYPES[tag.category];
    if (!type) continue;
    addAsset(`prop:${tag.category}:${tag.key}`, `${resolveCategory(breakdown, tag.category)?.short || ''} ${tag.label}`.trim(), type);
  }

  // --- Sequences (one per set) and shots (one per scene) -----------------
  const sequences = new Map();

  rows.forEach((row) => {
    const scene = sceneList(scriptDoc)[row.index];
    const setKey = slugify(row.setting) || row.setting;

    let sequence = sequences.get(setKey);
    if (!sequence) {
      sequence = {
        id: `sequence_${sequences.size + 1}`,
        name: row.setting,
        category: 'Sequence',
        summary: true,
        activities: []
      };
      sequences.set(setKey, sequence);
    }

    const shotId = `shot_${row.index + 1}`;
    const dependencies = [];

    const envAssetId = assetIdByKey.get(`env:${setKey}`);
    if (envAssetId) dependencies.push({ task: lastTaskOf(assetActivities, envAssetId) });

    for (const characterId of scene.cast || []) {
      const assetId = assetIdByKey.get(`char:${characterId}`);
      if (assetId) dependencies.push({ task: lastTaskOf(assetActivities, assetId) });
    }

    for (const tag of sceneTags.get(scene.id) || []) {
      const assetId = assetIdByKey.get(`prop:${tag.category}:${tag.key}`);
      if (assetId) dependencies.push({ task: lastTaskOf(assetActivities, assetId) });
    }

    sequence.activities.push({
      id: shotId,
      name: `Sc ${row.number} - ${row.setting} (${row.eighthsLabel})`,
      category: 'Shot',
      duration: { units: 'days', value: Math.max(0.125, round3(row.eighths / eighthsPerDay)) },
      resources: [{ resource: resourceFor('shoot:Principal Photography') }],
      dependencies: dedupe(dependencies)
    });
  });

  return {
    snapshot: {
      resourceClasses,
      projects: [
        {
          id: 'project_1',
          name: title,
          description: `Generated by BreakCraft from a ${rows.length}-scene breakdown.`,
          activities: [
            { id: 'assets', name: 'Assets', category: 'AssetsContainer', summary: true, activities: assetActivities },
            {
              id: 'shooting',
              name: 'Shooting',
              category: 'ShootingContainer',
              summary: true,
              activities: Array.from(sequences.values())
            }
          ]
        }
      ]
    },
    meta: {
      generator: 'BreakCraft',
      generated: new Date().toISOString(),
      scenes: rows.length,
      totalEighths: rows.reduce((sum, r) => sum + r.eighths, 0),
      totalEighthsLabel: formatEighths(rows.reduce((sum, r) => sum + r.eighths, 0)),
      experimental: true
    }
  };
}

function lastTaskOf(assetActivities, assetId) {
  const asset = assetActivities.find((a) => a.id === assetId);
  const tasks = asset?.activities || [];
  return tasks.length ? tasks[tasks.length - 1].id : assetId;
}

function dedupe(dependencies) {
  const seen = new Set();
  return dependencies.filter((d) => {
    if (!d.task || seen.has(d.task)) return false;
    seen.add(d.task);
    return true;
  });
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}
