/**
 * A project is a script plus its breakdown.
 *
 * The two are kept as separate documents on purpose (see
 * `core/breakdown/model.js`): the script is treated as immutable per draft, the
 * breakdown as the mutable working layer. That separation is what will make
 * re-importing a new draft tractable later — the breakdown is re-anchored onto a
 * new script rather than merged into it.
 */

import { createBreakdown, withDefaults } from './breakdown/model.js';
import { readText } from './screenjson/query.js';

export const PROJECT_VERSION = '0.1.0';

export function createProject(scriptDoc, { fileName = '', format = 'screenjson' } = {}) {
  return {
    version: PROJECT_VERSION,
    script: scriptDoc,
    breakdown: createBreakdown(scriptDoc),
    source: { fileName, format, importedAt: new Date().toISOString() }
  };
}

export function projectTitle(project) {
  if (!project?.script) return 'Untitled';
  return readText(project.script.title, project.script.lang) || 'Untitled';
}

/**
 * Attach a previously exported sidecar to the current script.
 *
 * The script id is checked and a mismatch is reported rather than blocked: a
 * producer who re-exported the script from another tool will have a new document
 * id but the same content, and refusing the sidecar in that case would be more
 * annoying than useful. Genuinely stale sidecars surface as orphaned tags in the
 * element library instead.
 */
export function attachBreakdown(project, breakdown) {
  const warnings = [];

  if (!breakdown || breakdown.version === undefined || !Array.isArray(breakdown.tags)) {
    throw new Error('This file is not a BreakCraft breakdown sidecar.');
  }
  breakdown = withDefaults(breakdown);

  if (breakdown.scriptId && breakdown.scriptId !== project.script.id) {
    warnings.push(
      'This sidecar was created against a different script document. Tags that no longer match an element will be listed as orphaned.'
    );
  }

  const elementIds = new Set();
  for (const scene of project.script.document.scenes) {
    for (const element of scene.body || []) elementIds.add(element.id);
  }

  let orphaned = 0;
  const tags = breakdown.tags.map((tag) => {
    const instances = tag.instances.filter((instance) => {
      const ok = elementIds.has(instance.elementId);
      if (!ok) orphaned += 1;
      return ok;
    });
    return { ...tag, instances };
  });

  const kept = tags.filter((tag) => tag.instances.length);

  if (orphaned) {
    warnings.push(`${orphaned} tag occurrence(s) did not match any element in this script and were dropped.`);
  }

  return {
    project: { ...project, breakdown: { ...breakdown, tags: kept, scriptId: project.script.id } },
    warnings
  };
}

/** Serialise a project to a single `.breakcraft.json` file. */
export function serializeProject(project) {
  return JSON.stringify(
    {
      version: PROJECT_VERSION,
      generator: 'BreakCraft',
      saved: new Date().toISOString(),
      source: project.source,
      script: project.script,
      breakdown: project.breakdown
    },
    null,
    2
  );
}

/** Read a `.breakcraft.json` file back. */
export function deserializeProject(json) {
  const parsed = typeof json === 'string' ? JSON.parse(json) : json;
  if (!parsed?.script || !parsed?.breakdown) {
    throw new Error('This file is not a BreakCraft project.');
  }
  return {
    version: parsed.version || PROJECT_VERSION,
    script: parsed.script,
    breakdown: withDefaults(parsed.breakdown),
    source: parsed.source || { fileName: '', format: 'breakcraft' }
  };
}
