import React, { useMemo, useState } from 'react';
import { Badge, Button, IconButton } from '../design-system/components';
import { useProject } from '../hooks/useProject.js';
import { dayOutOfDays, elementRows, setReport } from '../core/breakdown/reports.js';
import { resolveCategories } from '../core/breakdown/categories.js';
import { categoryLabelForModeId, labelCategoriesForMode } from '../core/breakdown/modes.js';
import { hideAutoElement, mergeAutoElement, mergeTags, removeTag } from '../core/breakdown/model.js';
import './ElementLibrary.css';

/**
 * The element library: every tagged element, grouped by category, plus the
 * two things the app already knows without being told — speaking cast and
 * sets — shown read-only alongside them so "everything in this script" lives
 * in one place instead of three disconnected views.
 *
 * This is also where duplicate spellings (or a wrong category) get merged
 * back together.
 */
export function ElementLibrary({ onOpenScene, onNotify }) {
  const { script, breakdown, pagination, selection, setSelection, applyBreakdown } = useProject();
  const [mergeSource, setMergeSource] = useState(null);
  const [mergeTarget, setMergeTarget] = useState(null);
  const [filter, setFilter] = useState('');

  const categories = useMemo(
    () => labelCategoriesForMode(breakdown, resolveCategories(breakdown)),
    [breakdown]
  );
  const castLabel = categoryLabelForModeId(breakdown, 'cast');
  const rows = useMemo(() => elementRows(script, breakdown), [script, breakdown]);
  const cast = useMemo(() => dayOutOfDays(script, pagination, breakdown), [script, pagination, breakdown]);
  const sets = useMemo(() => setReport(script, pagination, breakdown), [script, pagination, breakdown]);

  const needle = filter.trim().toLowerCase();
  const matches = (text) => !needle || text.toLowerCase().includes(needle);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const row of rows) {
      if (!matches(row.label)) continue;
      const list = map.get(row.category) || [];
      list.push(row);
      map.set(row.category, list);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, filter]);

  const visibleCast = cast.filter((row) => matches(row.name));
  const visibleSets = sets.filter((row) => matches(row.setting));

  const cancelMerge = () => {
    setMergeSource(null);
    setMergeTarget(null);
  };

  const handleTagRowClick = (row) => {
    if (!mergeSource) {
      setSelection({ tagId: row.id });
      return;
    }
    if (mergeSource.kind !== 'tag') return;
    if (mergeSource.id === row.id) {
      cancelMerge();
      return;
    }
    if (mergeSource.category === row.category) {
      commitMerge(row);
      return;
    }
    // Different category: confirm before moving the element, since this
    // changes which department/report it shows up under from now on.
    setMergeTarget(row);
  };

  const commitMerge = (target) => {
    applyBreakdown((current) => mergeTags(current, mergeSource.id, target.id));
    onNotify(`Merged “${mergeSource.label}” into “${target.label}”.`, 'primary');
    cancelMerge();
  };

  const handleDelete = (row) => {
    applyBreakdown((current) => removeTag(current, row.id));
    onNotify(`Removed “${row.label}” and its ${row.occurrences} occurrence(s).`, 'accent');
  };

  // Cast and Sets aren't tags — they're computed from the script — so merging
  // or deleting one is an overlay (`autoElements`) rather than a tag mutation,
  // but the interaction mirrors the tag flow above: pick a source via the ⇄
  // icon, then click another row of the same kind to merge into it.
  const handleAutoRowClick = (kind, key, label) => {
    if (!mergeSource || mergeSource.kind !== kind) return;
    if (mergeSource.id === key) {
      cancelMerge();
      return;
    }
    applyBreakdown((current) => mergeAutoElement(current, kind, mergeSource.id, key));
    onNotify(`Merged “${mergeSource.label}” into “${label}”.`, 'primary');
    cancelMerge();
  };

  const handleHideAuto = (kind, key, label) => {
    applyBreakdown((current) => hideAutoElement(current, kind, key));
    onNotify(`Removed “${label}” from the ${kind === 'cast' ? 'Cast' : 'Sets'} list.`, 'accent');
  };

  const targetCategoryLabel = mergeTarget
    ? categories.find((c) => c.id === mergeTarget.category)?.label || mergeTarget.category
    : '';

  const mergeNounByKind = { tag: 'element', cast: 'character', sets: 'set' };

  if (!rows.length && !cast.length && !sets.length) {
    return (
      <div className="element-library" data-tour="elements-view">
        <div className="bc-empty">
          Nothing to show yet. Open the Script view and select any words in an action line or
          dialogue to create your first element.
        </div>
      </div>
    );
  }

  return (
    <div className="element-library" data-tour="elements-view">
      <div className="bc-view-header">
        <input
          className="element-library__search"
          placeholder="Filter elements, cast or sets…"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
        {mergeSource ? (
          <div className="element-library__merge-bar">
            <span>
              Merging <strong>{mergeSource.label}</strong> — pick the {mergeNounByKind[mergeSource.kind]}{' '}
              to keep.
            </span>
            <Button size="sm" variant="ghost" onClick={cancelMerge}>
              Cancel
            </Button>
          </div>
        ) : (
          <Badge variant="secondary">{rows.length} tagged elements</Badge>
        )}
      </div>

      {mergeTarget && (
        <div className="element-library__merge-confirm">
          <span>
            Merge <strong>{mergeSource.label}</strong> into <strong>{mergeTarget.label}</strong>?
            It will move from its current category into <strong>{targetCategoryLabel}</strong>.
          </span>
          <div className="element-library__merge-confirm-actions">
            <Button size="sm" variant="ghost" onClick={() => setMergeTarget(null)}>
              Pick a different element
            </Button>
            <Button size="sm" variant="primary" onClick={() => commitMerge(mergeTarget)}>
              Merge
            </Button>
          </div>
        </div>
      )}

      <div className="element-library__scroll">
        {visibleCast.length > 0 && (
          <section className="element-library__group">
            <h3 style={{ borderLeftColor: categories.find((c) => c.id === 'cast')?.color }}>
              {categories.find((c) => c.id === 'cast')?.icon} {castLabel}
              <span className="element-library__count">{visibleCast.length}</span>
              <Badge variant="secondary" className="element-library__auto-badge">
                Auto-derived
              </Badge>
            </h3>
            <table className={`bc-table ${mergeSource?.kind === 'cast' ? 'is-merging' : ''}`}>
              <colgroup>
                <col className="element-library__col-primary" />
                <col className="element-library__col-num" />
                <col className="element-library__col-num" />
                <col />
                <col className="element-library__actions-col" />
              </colgroup>
              <thead>
                <tr>
                  <th>{castLabel}</th>
                  <th className="num">Scenes</th>
                  <th className="num">Pages</th>
                  <th>First / Last</th>
                  <th className="element-library__actions-col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleCast.map((row) => (
                  <tr
                    key={row.id}
                    className={mergeSource?.kind === 'cast' && mergeSource.id === row.id ? 'is-merge-source' : ''}
                    onClick={() => handleAutoRowClick('cast', row.id, row.name)}
                  >
                    <td className="strong">
                      {row.name}
                      {row.aliases?.length > 0 && (
                        <span className="element-library__aliases">aka {row.aliases.join(', ')}</span>
                      )}
                    </td>
                    <td className="num">{row.sceneCount}</td>
                    <td className="num">{row.eighthsLabel}</td>
                    <td>
                      {row.firstScene} – {row.lastScene}
                    </td>
                    <td className="element-library__actions-col">
                      <IconButton
                        icon="⇄"
                        size="sm"
                        title="Merge this character into another"
                        onClick={(event) => {
                          event.stopPropagation();
                          setMergeSource({ kind: 'cast', id: row.id, label: row.name });
                        }}
                      />
                      <IconButton
                        icon="🗑"
                        size="sm"
                        title={`Remove this character from the ${castLabel} list`}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleHideAuto('cast', row.id, row.name);
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {visibleSets.length > 0 && (
          <section className="element-library__group">
            <h3 style={{ borderLeftColor: categories.find((c) => c.id === 'location')?.color }}>
              📍 Sets
              <span className="element-library__count">{visibleSets.length}</span>
              <Badge variant="secondary" className="element-library__auto-badge">
                Auto-derived
              </Badge>
            </h3>
            <table className={`bc-table ${mergeSource?.kind === 'sets' ? 'is-merging' : ''}`}>
              <colgroup>
                <col className="element-library__col-primary" />
                <col className="element-library__col-num" />
                <col className="element-library__col-num" />
                <col />
                <col className="element-library__actions-col" />
              </colgroup>
              <thead>
                <tr>
                  <th>Set</th>
                  <th className="num">Scenes</th>
                  <th className="num">Pages</th>
                  <th>Day / Night</th>
                  <th className="element-library__actions-col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleSets.map((row) => (
                  <tr
                    key={row.setting}
                    className={
                      mergeSource?.kind === 'sets' && mergeSource.id === row.setting ? 'is-merge-source' : ''
                    }
                    onClick={() => handleAutoRowClick('sets', row.setting, row.setting)}
                  >
                    <td className="strong">
                      {row.setting}
                      {row.aliases?.length > 0 && (
                        <span className="element-library__aliases">aka {row.aliases.join(', ')}</span>
                      )}
                    </td>
                    <td className="num">{row.sceneCount}</td>
                    <td className="num">{row.eighthsLabel}</td>
                    <td>
                      {row.day} / {row.night}
                    </td>
                    <td className="element-library__actions-col">
                      <IconButton
                        icon="⇄"
                        size="sm"
                        title="Merge this set into another"
                        onClick={(event) => {
                          event.stopPropagation();
                          setMergeSource({ kind: 'sets', id: row.setting, label: row.setting });
                        }}
                      />
                      <IconButton
                        icon="🗑"
                        size="sm"
                        title="Remove this set from the Sets list"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleHideAuto('sets', row.setting, row.setting);
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {categories.map((category) => {
          const items = grouped.get(category.id);
          if (!items?.length) return null;

          return (
            <section className="element-library__group" key={category.id}>
              <h3 style={{ borderLeftColor: category.color }}>
                {category.icon ? `${category.icon} ` : ''}
                {category.label}
                <span className="element-library__count">{items.length}</span>
                <span className="element-library__dept">{category.department}</span>
              </h3>

              <table className={`bc-table ${mergeSource?.kind === 'tag' ? 'is-merging' : ''}`}>
                <colgroup>
                  <col className="element-library__col-primary" />
                  <col className="element-library__col-num" />
                  <col className="element-library__col-num" />
                  <col />
                  <col className="element-library__actions-col" />
                </colgroup>
                <thead>
                  <tr>
                    <th>Element</th>
                    <th className="num">Scenes</th>
                    <th className="num">Qty</th>
                    <th>Scene numbers</th>
                    <th className="element-library__actions-col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => (
                    <tr
                      key={row.id}
                      className={[
                        selection.tagId === row.id ? 'is-selected' : '',
                        mergeSource?.kind === 'tag' && mergeSource.id === row.id ? 'is-merge-source' : ''
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => handleTagRowClick(row)}
                    >
                      <td className="strong">
                        {row.label}
                        {row.aliases?.length > 0 && (
                          <span className="element-library__aliases">
                            aka {row.aliases.join(', ')}
                          </span>
                        )}
                      </td>
                      <td className="num">{row.sceneCount}</td>
                      <td className="num">{row.qty}</td>
                      <td>
                        {row.scenes.map((scene) => (
                          <button
                            type="button"
                            className="element-library__scene-link"
                            key={scene.id}
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelection({ sceneId: scene.id, tagId: row.id });
                              onOpenScene();
                            }}
                          >
                            {scene.number}
                          </button>
                        ))}
                      </td>
                      <td className="element-library__actions-col">
                        <IconButton
                          icon="⇄"
                          size="sm"
                          title="Merge this element into another"
                          onClick={(event) => {
                            event.stopPropagation();
                            setMergeSource({ kind: 'tag', id: row.id, label: row.label, category: row.category });
                          }}
                        />
                        <IconButton
                          icon="🗑"
                          size="sm"
                          title="Delete this element"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleDelete(row);
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          );
        })}

        {!grouped.size && !visibleCast.length && !visibleSets.length && (
          <div className="bc-empty">No elements match “{filter}”.</div>
        )}
      </div>
    </div>
  );
}
