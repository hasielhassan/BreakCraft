import React, { useMemo } from 'react';
import { Badge, Button, Divider, IconButton, Select, TextInput } from '../design-system/components';
import { useProject } from '../hooks/useProject.js';
import { resolveCategories, resolveCategory } from '../core/breakdown/categories.js';
import { categoryLabelForModeId, labelCategoriesForMode } from '../core/breakdown/modes.js';
import {
  getTag,
  removeInstance,
  removeTag,
  setSceneField,
  tagsByScene,
  updateTag
} from '../core/breakdown/model.js';
import { formatSlugline, sceneNumber, scenes as sceneListOf } from '../core/screenjson/query.js';
import { formatDuration, formatEighths } from '../core/paginate/paginate.js';
import { EIGHTHS_PER_PAGE } from '../core/paginate/constants.js';
import './InspectorPanel.css';

/**
 * Contextual inspector.
 *
 * Shows the selected tag when there is one, otherwise the selected scene. Tag
 * selection wins because it is the more specific act: clicking a highlight in
 * the script should open that element, not the scene containing it.
 */
export function InspectorPanel({ onNotify, onOpenScene }) {
  const { script, breakdown, pagination, selection, setSelection, applyBreakdown } = useProject();

  if (!script) {
    return (
      <div className="inspector">
        <div className="inspector__empty">Import a script to see its breakdown here.</div>
      </div>
    );
  }

  const tag = selection.tagId ? getTag(breakdown, selection.tagId) : null;

  if (tag) {
    return (
      <TagInspector
        tag={tag}
        script={script}
        breakdown={breakdown}
        onBack={() => setSelection({ tagId: null })}
        onNotify={onNotify}
        onOpenScene={onOpenScene}
        setSelection={setSelection}
        applyBreakdown={applyBreakdown}
      />
    );
  }

  return (
    <SceneInspector
      script={script}
      breakdown={breakdown}
      pagination={pagination}
      sceneId={selection.sceneId}
      setSelection={setSelection}
      applyBreakdown={applyBreakdown}
    />
  );
}

function SceneInspector({ script, breakdown, pagination, sceneId, setSelection, applyBreakdown }) {
  const scenes = sceneListOf(script);
  const index = scenes.findIndex((scene) => scene.id === sceneId);
  const scene = index >= 0 ? scenes[index] : null;

  const sceneTags = useMemo(() => tagsByScene(breakdown), [breakdown]);

  if (!scene) {
    return (
      <div className="inspector">
        <div className="inspector__empty">Select a scene to see its breakdown.</div>
      </div>
    );
  }

  const stats = pagination.sceneStats.get(scene.id) || { eighths: 1, startPage: 1, lines: 0 };
  const tags = sceneTags.get(scene.id) || [];
  const overrides = breakdown.scenes[scene.id] || {};
  const castNames = (scene.cast || [])
    .map((id) => script.characters.find((character) => character.id === id)?.name)
    .filter(Boolean);

  const byCategory = labelCategoriesForMode(breakdown, resolveCategories(breakdown))
    .map((category) => ({
      category,
      items: tags.filter((tag) => tag.category === category.id)
    }))
    .filter((group) => group.items.length);

  const castLabel = categoryLabelForModeId(breakdown, 'cast');

  return (
    <div className="inspector">
      <header className="inspector__header">
        <div>
          <div className="inspector__eyebrow">Scene {sceneNumber(scene, index)}</div>
          <h2 className="inspector__title">{formatSlugline(scene.heading)}</h2>
        </div>
      </header>

      <div className="inspector__scroll">
        <div className="inspector__stats">
          <Stat label="Page" value={stats.startPage} />
          <Stat label="Length" value={formatEighths(stats.eighths)} />
          <Stat
            label="Est. duration"
            value={formatDuration(
              (stats.eighths / EIGHTHS_PER_PAGE) * (breakdown.settings?.minutesPerPage ?? 1) * 60
            )}
          />
          <Stat label={castLabel} value={castNames.length} />
          <Stat label="Tags" value={tags.length} />
        </div>

        <Section title={castLabel}>
          {castNames.length ? (
            <div className="inspector__chips">
              {castNames.map((name) => (
                <span
                  className="inspector__chip"
                  key={name}
                  style={{ '--chip-color': resolveCategory(breakdown, 'cast')?.color }}
                >
                  {name}
                </span>
              ))}
            </div>
          ) : (
            <p className="inspector__muted">No speaking cast in this scene.</p>
          )}
        </Section>

        <Section title="Set">
          <div className="inspector__chips">
            <span
              className="inspector__chip"
              style={{ '--chip-color': resolveCategory(breakdown, 'location')?.color }}
            >
              {scene.heading.setting}
            </span>
          </div>
        </Section>

        {byCategory.map(({ category, items }) => (
          <Section title={category.label} key={category.id} color={category.color}>
            <div className="inspector__chips">
              {items.map((tag) => (
                <button
                  type="button"
                  className="inspector__chip inspector__chip--button"
                  key={tag.id}
                  style={{ '--chip-color': category.color }}
                  onClick={() => setSelection({ tagId: tag.id })}
                >
                  {tag.label}
                </button>
              ))}
            </div>
          </Section>
        ))}

        <Divider />

        <Section title="Production">
          <TextInput
            label="Shoot day"
            value={overrides.shootDay || ''}
            onChange={(event) =>
              applyBreakdown((current) =>
                setSceneField(current, scene.id, 'shootDay', event.target.value)
              )
            }
          />
          <TextInput
            label="Unit"
            value={overrides.unit || ''}
            onChange={(event) =>
              applyBreakdown((current) => setSceneField(current, scene.id, 'unit', event.target.value))
            }
          />
          <label className="inspector__label">Notes</label>
          <textarea
            className="inspector__textarea"
            value={overrides.notes || ''}
            placeholder="Anything the department needs to know about this scene…"
            onChange={(event) =>
              applyBreakdown((current) =>
                setSceneField(current, scene.id, 'notes', event.target.value)
              )
            }
          />
        </Section>

        <div className="inspector__nav">
          <Button
            size="sm"
            variant="secondary"
            disabled={index <= 0}
            onClick={() => setSelection({ sceneId: scenes[index - 1].id })}
          >
            ← Previous
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={index >= scenes.length - 1}
            onClick={() => setSelection({ sceneId: scenes[index + 1].id })}
          >
            Next →
          </Button>
        </div>
      </div>
    </div>
  );
}

function TagInspector({ tag, script, breakdown, onBack, onNotify, onOpenScene, setSelection, applyBreakdown }) {
  const categories = labelCategoriesForMode(breakdown, resolveCategories(breakdown));
  const category = categories.find((c) => c.id === tag.category) || resolveCategory(breakdown, tag.category);
  const scenes = sceneListOf(script);

  const occurrences = tag.instances.map((instance) => {
    const index = scenes.findIndex((scene) => scene.id === instance.sceneId);
    return {
      ...instance,
      sceneIndex: index,
      number: index >= 0 ? sceneNumber(scenes[index], index) : '?'
    };
  });

  return (
    <div className="inspector">
      <header className="inspector__header">
        <div>
          <div className="inspector__eyebrow" style={{ color: category?.color }}>
            {category?.icon ? `${category.icon} ` : ''}
            {category?.label || tag.category}
          </div>
          <h2 className="inspector__title">{tag.label}</h2>
        </div>
        <IconButton icon="✕" size="sm" onClick={onBack} title="Back to scene" />
      </header>

      <div className="inspector__scroll">
        <TextInput
          label="Name"
          value={tag.label}
          onChange={(event) =>
            applyBreakdown((current) => updateTag(current, tag.id, { label: event.target.value }))
          }
        />

        <Select
          label="Category"
          value={tag.category}
          onChange={(event) =>
            applyBreakdown((current) => updateTag(current, tag.id, { category: event.target.value }))
          }
          options={categories.map((item) => ({
            value: item.id,
            label: item.icon ? `${item.icon} ${item.label}` : item.label
          }))}
        />

        {tag.aliases?.length > 0 && (
          <div className="inspector__aliases">
            <span className="inspector__label">Also known as</span>
            <div className="inspector__chips">
              {tag.aliases.map((alias) => (
                <span className="inspector__chip" key={alias} style={{ '--chip-color': category?.color }}>
                  {alias}
                </span>
              ))}
            </div>
          </div>
        )}

        <TextInput
          label="Department"
          value={tag.department}
          onChange={(event) =>
            applyBreakdown((current) => updateTag(current, tag.id, { department: event.target.value }))
          }
        />

        <TextInput
          label="Quantity"
          type="number"
          min="1"
          value={String(tag.qty)}
          onChange={(event) =>
            applyBreakdown((current) =>
              updateTag(current, tag.id, { qty: Math.max(1, Number(event.target.value) || 1) })
            )
          }
        />

        <label className="inspector__label">Notes</label>
        <textarea
          className="inspector__textarea"
          value={tag.notes}
          placeholder="Sourcing, condition, doubles required…"
          onChange={(event) =>
            applyBreakdown((current) => updateTag(current, tag.id, { notes: event.target.value }))
          }
        />

        <Divider />

        <Section title={`Occurrences (${occurrences.length})`}>
          <ul className="inspector__occurrences">
            {occurrences.map((occurrence) => (
              <li key={occurrence.id}>
                <button
                  type="button"
                  className="inspector__occurrence"
                  onClick={() => {
                    setSelection({ sceneId: occurrence.sceneId, tagId: tag.id });
                    onOpenScene();
                  }}
                >
                  <Badge variant="secondary">Sc {occurrence.number}</Badge>
                  <span className="inspector__occurrence-text">“{occurrence.text}”</span>
                </button>
                <IconButton
                  icon="✕"
                  size="sm"
                  title="Remove this occurrence"
                  onClick={() =>
                    applyBreakdown((current) => removeInstance(current, tag.id, occurrence.id))
                  }
                />
              </li>
            ))}
          </ul>
        </Section>

        <Button
          variant="danger"
          size="sm"
          onClick={() => {
            applyBreakdown((current) => removeTag(current, tag.id));
            onNotify(`Removed “${tag.label}”.`, 'accent');
            onBack();
          }}
        >
          Delete element
        </Button>
      </div>
    </div>
  );
}

function Section({ title, color, children }) {
  return (
    <section className="inspector__section">
      <h3 style={color ? { borderLeftColor: color } : undefined}>{title}</h3>
      {children}
    </section>
  );
}

function Stat({ label, value }) {
  return (
    <div className="inspector__stat">
      <span className="inspector__stat-value">{value}</span>
      <span className="inspector__stat-label">{label}</span>
    </div>
  );
}
