import React, { useState } from 'react';
import { Badge, Button, Divider, Modal, Select, TextInput } from '../../design-system/components';
import { useProject } from '../../hooks/useProject.js';
import {
  isBuiltinCategory,
  resolveCategories,
  SCREENJSON_TARGETS
} from '../../core/breakdown/categories.js';
import { addCustomCategory, removeCustomCategory, updateCategoryOverride } from '../../core/breakdown/model.js';
import { slugify } from '../../utils/text.js';
import './dialogs.css';

const NEW_CATEGORY_DEFAULTS = {
  label: '',
  icon: '',
  color: '#8d95a5',
  department: '',
  screenjson: 'tags'
};

/**
 * Add, recolor, re-icon and remove breakdown categories.
 *
 * Built-in categories (the 15 shipped ones) can be recolored and re-iconed
 * but never deleted or remapped to a different ScreenJSON field — that
 * mapping is part of the app's export contract. Custom categories are fully
 * editable and removable, but only while nothing is tagged under them
 * (`removeCustomCategory` refuses otherwise; this dialog explains why rather
 * than letting the button silently do nothing).
 */
export function CategoryManagerDialog({ isOpen, onClose, onNotify }) {
  const { breakdown, applyBreakdown } = useProject();
  const [draft, setDraft] = useState(null);

  if (!isOpen || !breakdown) return null;

  const categories = resolveCategories(breakdown);
  const usedIds = new Set(breakdown.tags.map((t) => t.category));

  const startNewCategory = () => setDraft({ ...NEW_CATEGORY_DEFAULTS });

  const commitNewCategory = () => {
    const label = draft.label.trim();
    if (!label) {
      onNotify('Give the category a name first.', 'error');
      return;
    }
    const id = slugify(label);
    if (!id) {
      onNotify('That name is too short to use as a category id.', 'error');
      return;
    }
    if (isBuiltinCategory(id) || categories.some((c) => c.id === id)) {
      onNotify(`A category named “${label}” already exists.`, 'error');
      return;
    }

    applyBreakdown((current) => addCustomCategory(current, { ...draft, label }));
    onNotify(`Added category “${label}”.`, 'primary');
    setDraft(null);
  };

  const handleColorChange = (id, color) => {
    applyBreakdown((current) => updateCategoryOverride(current, id, { color }));
  };

  const handleIconChange = (id, icon) => {
    // Keep only the first grapheme so a pasted sentence can't stretch the swatch.
    const trimmed = Array.from(icon.trim()).slice(0, 2).join('');
    applyBreakdown((current) => updateCategoryOverride(current, id, { icon: trimmed }));
  };

  const handleDelete = (category) => {
    if (usedIds.has(category.id)) {
      onNotify(
        `“${category.label}” is still used by tagged elements — merge or delete those first.`,
        'error'
      );
      return;
    }
    applyBreakdown((current) => removeCustomCategory(current, category.id));
    onNotify(`Removed “${category.label}”.`, 'secondary');
  };

  return (
    <Modal
      isOpen={isOpen}
      title="Categories"
      onClose={onClose}
      size="lg"
      data-tour="category-manager-dialog"
      actions={
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="category-manager">
        <ul className="category-manager__list">
          {categories.map((category) => (
            <li key={category.id} className="category-manager__row">
              <input
                type="color"
                className="category-manager__color"
                value={category.color}
                onChange={(event) => handleColorChange(category.id, event.target.value)}
                title="Color"
              />
              <input
                className="category-manager__icon"
                value={category.icon || ''}
                onChange={(event) => handleIconChange(category.id, event.target.value)}
                placeholder="—"
                title="Icon (one emoji)"
                maxLength={4}
              />
              <span className="category-manager__label">{category.label}</span>
              {isBuiltinCategory(category.id) ? (
                <Badge variant="secondary">Built-in</Badge>
              ) : (
                <>
                  <Badge variant="accent">Custom</Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDelete(category)}
                    title={
                      usedIds.has(category.id)
                        ? 'Still used by tagged elements'
                        : 'Delete this category'
                    }
                  >
                    Delete
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>

        <Divider />

        {draft ? (
          <div className="category-manager__new">
            <TextInput
              label="Name"
              value={draft.label}
              onChange={(event) => setDraft({ ...draft, label: event.target.value })}
              autoFocus
            />
            <div className="category-manager__new-row">
              <TextInput
                label="Icon"
                value={draft.icon}
                onChange={(event) => setDraft({ ...draft, icon: Array.from(event.target.value.trim()).slice(0, 2).join('') })}
                placeholder="🏷️"
              />
              <div className="category-manager__color-field">
                <label className="ds-input-label">Color</label>
                <input
                  type="color"
                  value={draft.color}
                  onChange={(event) => setDraft({ ...draft, color: event.target.value })}
                />
              </div>
            </div>
            <TextInput
              label="Department"
              value={draft.department}
              onChange={(event) => setDraft({ ...draft, department: event.target.value })}
              placeholder="e.g. Greens, Security, Music"
            />
            <Select
              label="Exports into ScreenJSON field"
              value={draft.screenjson}
              onChange={(event) => setDraft({ ...draft, screenjson: event.target.value })}
              options={SCREENJSON_TARGETS.map((field) => ({ value: field, label: field }))}
            />
            <p className="category-manager__hint">
              ScreenJSON only has 10 scene tag fields; a custom category shares one with the
              built-ins that already use it, kept distinct on export by a slug prefix.
            </p>
            <div className="category-manager__new-actions">
              <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>
                Cancel
              </Button>
              <Button size="sm" variant="primary" onClick={commitNewCategory}>
                Add category
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="secondary" icon="+" onClick={startNewCategory}>
            Add custom category
          </Button>
        )}
      </div>
    </Modal>
  );
}
