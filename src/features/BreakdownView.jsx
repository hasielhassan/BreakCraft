import React, { useMemo, useState } from 'react';
import { Badge, Button } from '../design-system/components';
import { useProject } from '../hooks/useProject.js';
import { sceneRows } from '../core/breakdown/reports.js';
import { resolveCategories, resolveCategoryColor } from '../core/breakdown/categories.js';
import { categoryLabelForModeId, visibleCategoriesForMode } from '../core/breakdown/modes.js';
import { formatDuration } from '../core/paginate/paginate.js';
import './BreakdownView.css';

export function BreakdownView({ onOpenScene }) {
  const { script, breakdown, pagination, selection, setSelection } = useProject();
  const [filter, setFilter] = useState('');
  const [onlyTagged, setOnlyTagged] = useState(false);

  // Cast has its own column already; everything else — built-in and custom —
  // gets one column each, so a project's own categories are never invisible
  // in the grid just because they weren't in the shipped 15. The current
  // mode further narrows this default set (bypassed by "Show all
  // categories"); it never hides a category's tagged data, which stays
  // visible in the Elements library and every report regardless of mode.
  const columnCategories = useMemo(() => {
    const all = resolveCategories(breakdown).filter((category) => category.id !== 'cast');
    return visibleCategoriesForMode(breakdown, all);
  }, [breakdown]);

  // Set and Cast aren't tag categories — Set is parsed straight from the
  // slugline and Cast from character cues, both 100% deterministic, unlike
  // every other column here which is a user-tagged category. They're colored
  // using the "Location Notes" and "Cast" category colors respectively so the
  // grid reads consistently, but that's a visual borrowing only: tagging
  // something under Location Notes (an address, a permit note, …) is a
  // separate, independent action from what a scene's Set column shows.
  const locationColor = resolveCategoryColor(breakdown, 'location');
  const castColor = resolveCategoryColor(breakdown, 'cast');
  const castLabel = categoryLabelForModeId(breakdown, 'cast');

  const rows = useMemo(
    () => sceneRows(script, pagination, breakdown),
    [script, pagination, breakdown]
  );

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return rows.filter((row) => {
      if (onlyTagged && !row.tagCount) return false;
      if (!needle) return true;
      return (
        row.setting.toLowerCase().includes(needle) ||
        row.number.toLowerCase().includes(needle) ||
        row.cast.join(' ').toLowerCase().includes(needle) ||
        row.synopsis.toLowerCase().includes(needle)
      );
    });
  }, [rows, filter, onlyTagged]);

  const totalEighths = rows.reduce((sum, row) => sum + row.eighths, 0);
  const totalDurationSeconds = rows.reduce((sum, row) => sum + row.estimatedDurationSeconds, 0);

  return (
    <div className="breakdown-view" data-tour="breakdown-view">
      <div className="bc-view-header">
        <div className="breakdown-view__filters">
          <input
            className="breakdown-view__search"
            placeholder="Filter by set, scene, cast or synopsis…"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
          <Button
            size="sm"
            variant="secondary"
            className={onlyTagged ? 'ds-button--active' : ''}
            onClick={() => setOnlyTagged((value) => !value)}
          >
            Tagged only
          </Button>
        </div>
        <div className="breakdown-view__stats">
          <Badge variant="secondary">{visible.length} of {rows.length} scenes</Badge>
          <Badge variant="accent">{(totalEighths / 8).toFixed(1)} pages total</Badge>
          <Badge variant="accent">~{formatDuration(totalDurationSeconds)} est. runtime</Badge>
        </div>
      </div>

      <div className="bc-table-wrap">
        <table className="bc-table breakdown-view__table">
          <thead>
            <tr>
              <th className="col-num">#</th>
              <th className="col-ie">I/E</th>
              <th className="col-set">
                <span className="breakdown-view__swatch" style={{ backgroundColor: locationColor }} />
                Set
              </th>
              <th className="col-time">Time</th>
              <th className="col-num">Pg</th>
              <th className="col-num">Pages</th>
              <th className="col-num">Duration</th>
              <th className="col-cast">
                <span className="breakdown-view__swatch" style={{ backgroundColor: castColor }} />
                {castLabel}
              </th>
              {columnCategories.map((category) => (
                <th key={category.id} className="col-cat">
                  <span
                    className="breakdown-view__swatch"
                    style={{ backgroundColor: category.color }}
                  />
                  {category.icon ? `${category.icon} ` : ''}
                  {category.short}
                </th>
              ))}
              <th className="col-synopsis">Synopsis</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr
                key={row.id}
                className={selection.sceneId === row.id ? 'is-selected' : ''}
                onClick={() => setSelection({ sceneId: row.id, tagId: null })}
                onDoubleClick={() => {
                  setSelection({ sceneId: row.id, tagId: null });
                  onOpenScene();
                }}
              >
                <td className="num strong">{row.number}</td>
                <td>{row.context}</td>
                <td className="col-set">
                  <span className="breakdown-view__chips" style={{ '--chip-color': locationColor }}>
                    <span className="breakdown-view__chip">{row.setting}</span>
                  </span>
                </td>
                <td>{row.time}</td>
                <td className="num">{row.page}</td>
                <td className="num">{row.eighthsLabel}</td>
                <td className="num">{formatDuration(row.estimatedDurationSeconds)}</td>
                <td className="col-cast">
                  {row.cast.length ? (
                    <span className="breakdown-view__chips" style={{ '--chip-color': castColor }}>
                      {row.cast.map((name) => (
                        <span className="breakdown-view__chip" key={name}>
                          {name}
                        </span>
                      ))}
                    </span>
                  ) : (
                    <span className="breakdown-view__dash">·</span>
                  )}
                </td>
                {columnCategories.map((category) => {
                  const items = row.byCategory[category.id] || [];
                  return (
                    <td key={category.id} className="col-cat">
                      {items.length ? (
                        <span
                          className="breakdown-view__chips"
                          style={{ '--chip-color': category.color }}
                        >
                          {items.map((item) => (
                            <span className="breakdown-view__chip" key={item}>
                              {item}
                            </span>
                          ))}
                        </span>
                      ) : (
                        <span className="breakdown-view__dash">·</span>
                      )}
                    </td>
                  );
                })}
                <td className="col-synopsis">{row.synopsis}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {!visible.length && <div className="bc-empty">No scenes match this filter.</div>}
      </div>
    </div>
  );
}
