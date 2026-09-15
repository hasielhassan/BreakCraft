/**
 * ScreenJSON export.
 *
 * Two flavours:
 *
 *  - `clean`  — the script exactly as imported, with no breakdown data. Use this
 *               to hand a screenplay to any other ScreenJSON tool.
 *  - `tagged` — the same script with the breakdown projected into it: scene tag
 *               arrays populated, and each tag instance written as an element
 *               `note` with a `highlight` range and a colour, so a compliant
 *               viewer shows the marked-up script.
 *
 * The projection is lossy by construction — scene arrays cannot carry
 * quantities, departments, status or per-instance offsets — so the sidecar
 * remains the authoritative record. `document.meta` records the link between
 * the two files.
 */

import { slugify } from '../../utils/text.js';
import { SCENE_TAG_FIELDS } from '../screenjson/constants.js';
import { resolveCategories, resolveCategory, toScreenJsonSlug } from '../breakdown/categories.js';
import { TAG_STATUS } from '../breakdown/model.js';
import { uuid } from '../../utils/uuid.js';

/**
 * @param {object} scriptDoc
 * @param {object} breakdown
 * @param {{includeTags?: boolean, includeNotes?: boolean}} options
 */
export function serializeScreenJson(scriptDoc, breakdown, { includeTags = true, includeNotes = true } = {}) {
  const doc = structuredClone(scriptDoc);

  if (!includeTags && !includeNotes) return doc;

  const tags = breakdown.tags.filter((t) => t.status !== TAG_STATUS.REJECTED);

  // sceneId -> field -> Set(slug)
  const sceneSlugs = new Map();
  // elementId -> note[]
  const elementNotes = new Map();
  const taggable = new Set();

  for (const tag of tags) {
    const meta = resolveCategory(breakdown, tag.category);
    if (!meta) continue;

    const base = slugify(tag.label) || tag.key;
    const slug = toScreenJsonSlug(breakdown, tag.category, base);

    for (const instance of tag.instances) {
      if (includeTags && slug && meta.screenjson !== 'cast') {
        const fields = sceneSlugs.get(instance.sceneId) || new Map();
        const set = fields.get(meta.screenjson) || new Set();
        set.add(slug);
        fields.set(meta.screenjson, set);
        sceneSlugs.set(instance.sceneId, fields);
        taggable.add(slug);
      }

      if (includeNotes) {
        const list = elementNotes.get(instance.elementId) || [];
        list.push({
          id: uuid(),
          created: breakdown.updated || new Date().toISOString(),
          text: { [doc.lang || 'en']: `${meta.label}: ${tag.label}` },
          highlight: [[instance.start, instance.end]],
          color: tag.category.length >= 3 ? tag.category : `tag-${tag.category}`,
          meta: {
            'breakcraft.tag': tag.id,
            'breakcraft.category': tag.category
          }
        });
        elementNotes.set(instance.elementId, list);
      }
    }
  }

  for (const scene of doc.document.scenes) {
    const fields = sceneSlugs.get(scene.id);
    if (fields) {
      for (const [field, set] of fields.entries()) {
        if (!SCENE_TAG_FIELDS.includes(field)) continue;
        const existing = new Set(scene[field] || []);
        for (const slug of set) existing.add(slug);
        scene[field] = Array.from(existing).sort();
      }
    }

    const overrides = breakdown.scenes[scene.id];
    if (overrides && (overrides.notes || overrides.shootDay || overrides.unit)) {
      scene.meta = { ...(scene.meta || {}) };
      if (overrides.notes) scene.meta['breakcraft.notes'] = String(overrides.notes).slice(0, 2048);
      if (overrides.shootDay) scene.meta['breakcraft.shootDay'] = String(overrides.shootDay).slice(0, 64);
      if (overrides.unit) scene.meta['breakcraft.unit'] = String(overrides.unit).slice(0, 64);
    }

    for (const element of scene.body || []) {
      const notes = elementNotes.get(element.id);
      if (notes?.length) element.notes = [...(element.notes || []), ...notes];
    }
  }

  if (includeTags && taggable.size) {
    doc.taggable = Array.from(new Set([...(doc.taggable || []), ...taggable])).sort();
  }

  // Register the category palette so a viewer can colour the highlights the same
  // way BreakCraft does.
  if (includeNotes) {
    const existing = new Map((doc.colors || []).map((c) => [c.id, c]));
    for (const category of resolveCategories(breakdown)) {
      const id = category.id.length >= 3 ? category.id : `tag-${category.id}`;
      if (existing.has(id)) continue;
      existing.set(id, {
        id,
        title: { [doc.lang || 'en']: category.label },
        rgb: hexToRgb(category.color),
        hex: category.color
      });
    }
    doc.colors = Array.from(existing.values());
  }

  doc.document.meta = {
    ...(doc.document.meta || {}),
    'breakcraft.breakdown': breakdown.id,
    'breakcraft.version': breakdown.version,
    'breakcraft.exported': new Date().toISOString()
  };

  return doc;
}

function hexToRgb(hex) {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16)
  ];
}
