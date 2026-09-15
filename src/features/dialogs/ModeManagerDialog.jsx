import React, { useState } from 'react';
import { Badge, Button, Divider, TextInput, Modal } from '../../design-system/components';
import { useProject } from '../../hooks/useProject.js';
import { isBuiltinCategory, resolveCategories } from '../../core/breakdown/categories.js';
import {
  EXTRA_COLUMNS,
  columnVisibleForMode,
  isBuiltinMode,
  modeIncludesCategory,
  resolveModes
} from '../../core/breakdown/modes.js';
import { addCustomMode, removeCustomMode, updateModeOverride } from '../../core/breakdown/model.js';
import { slugify } from '../../utils/text.js';
import './dialogs.css';

const NEW_MODE_DEFAULTS = { label: '', icon: '' };

/**
 * Configure, rename and create breakdown modes.
 *
 * A mode never hides tagged data — unchecking a category here only narrows
 * its *default* view in the tagging popover, breakdown grid and reports
 * (bypassed anywhere by "Show all categories"). Built-in modes (All
 * Categories, Live Action, Animation) can be fully reconfigured — renamed,
 * re-iconed, narrowed, aliased — but never deleted; a project's own modes
 * are fully editable and removable.
 */
export function ModeManagerDialog({ isOpen, onClose, onNotify }) {
  const { breakdown, applyBreakdown } = useProject();
  const [expandedId, setExpandedId] = useState(null);
  const [draft, setDraft] = useState(null);

  if (!isOpen || !breakdown) return null;

  const modes = resolveModes(breakdown);
  const categories = resolveCategories(breakdown);
  const allCategoryIds = categories.map((c) => c.id);

  const startNewMode = () => setDraft({ ...NEW_MODE_DEFAULTS });

  const commitNewMode = () => {
    const label = draft.label.trim();
    if (!label) {
      onNotify('Give the mode a name first.', 'error');
      return;
    }
    const id = slugify(label);
    if (!id) {
      onNotify('That name is too short to use as a mode id.', 'error');
      return;
    }
    if (isBuiltinMode(id) || modes.some((m) => m.id === id)) {
      onNotify(`A mode named “${label}” already exists.`, 'error');
      return;
    }

    applyBreakdown((current) => addCustomMode(current, { ...draft, label }));
    onNotify(`Added mode “${label}”.`, 'primary');
    setDraft(null);
    setExpandedId(id);
  };

  const handleDelete = (mode) => {
    applyBreakdown((current) => removeCustomMode(current, mode.id));
    onNotify(`Removed “${mode.label}”.`, 'secondary');
    if (expandedId === mode.id) setExpandedId(null);
  };

  const toggleCategory = (mode, categoryId) => {
    const current = mode.categoryIds === null ? allCategoryIds : mode.categoryIds;
    const next = current.includes(categoryId)
      ? current.filter((id) => id !== categoryId)
      : [...current, categoryId];
    applyBreakdown((b) => updateModeOverride(b, mode.id, { categoryIds: next }));
  };

  const showAllCategories = (mode) => {
    applyBreakdown((b) => updateModeOverride(b, mode.id, { categoryIds: null }));
  };

  const handleAliasChange = (mode, categoryId, value) => {
    const labels = { ...mode.labels };
    if (value.trim()) labels[categoryId] = value;
    else delete labels[categoryId];
    applyBreakdown((b) => updateModeOverride(b, mode.id, { labels }));
  };

  const toggleColumn = (mode, columnId) => {
    const visible = columnVisibleForMode(mode, columnId);
    applyBreakdown((b) =>
      updateModeOverride(b, mode.id, { columns: { ...mode.columns, [columnId]: !visible } })
    );
  };

  const handleModeLabelChange = (mode, value) => {
    applyBreakdown((b) => updateModeOverride(b, mode.id, { label: value }));
  };

  const handleModeIconChange = (mode, value) => {
    const trimmed = Array.from(value.trim()).slice(0, 2).join('');
    applyBreakdown((b) => updateModeOverride(b, mode.id, { icon: trimmed }));
  };

  return (
    <Modal
      isOpen={isOpen}
      title="Modes"
      onClose={onClose}
      size="lg"
      data-tour="mode-manager-dialog"
      actions={
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="mode-manager">
        <p className="mode-manager__hint">
          A mode sets the categories shown by default, what to call them, and which report
          columns appear — it never hides tagged data, which always stays visible in the Elements
          library and in every report regardless of mode.
        </p>

        <ul className="mode-manager__list">
          {modes.map((mode) => {
            const isExpanded = expandedId === mode.id;
            const isAll = mode.categoryIds === null;

            return (
              <li key={mode.id} className="mode-manager__mode">
                <div className="mode-manager__mode-row">
                  <button
                    type="button"
                    className="mode-manager__expand"
                    onClick={() => setExpandedId(isExpanded ? null : mode.id)}
                  >
                    {isExpanded ? '▾' : '▸'}
                  </button>
                  <input
                    className="mode-manager__icon"
                    value={mode.icon || ''}
                    onChange={(event) => handleModeIconChange(mode, event.target.value)}
                    placeholder="—"
                    title="Icon (one emoji)"
                    maxLength={4}
                  />
                  <input
                    className="mode-manager__label"
                    value={mode.label}
                    onChange={(event) => handleModeLabelChange(mode, event.target.value)}
                  />
                  {isBuiltinMode(mode.id) ? (
                    <Badge variant="secondary">Built-in</Badge>
                  ) : (
                    <>
                      <Badge variant="accent">Custom</Badge>
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(mode)}>
                        Delete
                      </Button>
                    </>
                  )}
                </div>

                {isExpanded && (
                  <div className="mode-manager__detail">
                    <div className="mode-manager__detail-header">
                      <span className="mode-manager__detail-title">Categories</span>
                      {!isAll && (
                        <Button size="sm" variant="ghost" onClick={() => showAllCategories(mode)}>
                          Show all
                        </Button>
                      )}
                    </div>

                    <ul className="mode-manager__categories">
                      {categories.map((category) => {
                        const visible = modeIncludesCategory(mode, category.id);
                        const alwaysVisible = !isBuiltinCategory(category.id);
                        return (
                          <li key={category.id} className="mode-manager__category-row">
                            <input
                              type="checkbox"
                              checked={visible}
                              disabled={alwaysVisible}
                              title={
                                alwaysVisible
                                  ? 'Custom categories always show, regardless of mode'
                                  : 'Show this category by default in this mode'
                              }
                              onChange={() => toggleCategory(mode, category.id)}
                            />
                            <span
                              className="mode-manager__category-swatch"
                              style={{ backgroundColor: category.color }}
                            />
                            <span className="mode-manager__category-label">
                              {category.icon ? `${category.icon} ` : ''}
                              {category.label}
                            </span>
                            <input
                              className="mode-manager__alias"
                              value={mode.labels?.[category.id] || ''}
                              placeholder={`Alias (${category.label})`}
                              onChange={(event) => handleAliasChange(mode, category.id, event.target.value)}
                            />
                          </li>
                        );
                      })}
                    </ul>

                    <div className="mode-manager__detail-header">
                      <span className="mode-manager__detail-title">Report columns</span>
                    </div>
                    <ul className="mode-manager__columns">
                      {EXTRA_COLUMNS.map((column) => (
                        <li key={column.id} className="mode-manager__column-row">
                          <input
                            type="checkbox"
                            checked={columnVisibleForMode(mode, column.id)}
                            onChange={() => toggleColumn(mode, column.id)}
                          />
                          <span>{column.id === 'cast' ? (mode.labels?.cast || column.label) : column.label}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        <Divider />

        {draft ? (
          <div className="mode-manager__new">
            <TextInput
              label="Name"
              value={draft.label}
              onChange={(event) => setDraft({ ...draft, label: event.target.value })}
              autoFocus
            />
            <TextInput
              label="Icon"
              value={draft.icon}
              onChange={(event) =>
                setDraft({ ...draft, icon: Array.from(event.target.value.trim()).slice(0, 2).join('') })
              }
              placeholder="🎯"
            />
            <p className="mode-manager__hint">
              A new mode starts with every category visible — narrow it down once it's created.
            </p>
            <div className="mode-manager__new-actions">
              <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>
                Cancel
              </Button>
              <Button size="sm" variant="primary" onClick={commitNewMode}>
                Add mode
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="secondary" icon="+" onClick={startNewMode}>
            Add custom mode
          </Button>
        )}
      </div>
    </Modal>
  );
}
