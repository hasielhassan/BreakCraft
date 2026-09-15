import React, { useMemo, useState } from 'react';
import { Button } from '../design-system/components';
import { useProject } from '../hooks/useProject.js';
import { buildTables } from '../export/tables.js';
import { updateSettings } from '../core/breakdown/model.js';
import './ReportsView.css';

/**
 * Reports are rendered from `buildTables` — the same definitions the CSV, XLSX
 * and print exporters use. What is on screen is exactly what will be exported,
 * which removes a whole class of "the spreadsheet says something different"
 * bugs.
 */
export function ReportsView() {
  const { script, breakdown, pagination, applyBreakdown } = useProject();
  const tables = useMemo(
    () => buildTables(script, pagination, breakdown),
    [script, pagination, breakdown]
  );

  const [activeId, setActiveId] = useState(tables[0]?.id || 'summary');
  const active = tables.find((table) => table.id === activeId) || tables[0];

  const handleMinutesPerPageChange = (event) => {
    const value = Number(event.target.value);
    if (!Number.isFinite(value) || value <= 0) return;
    applyBreakdown((current) => updateSettings(current, { minutesPerPage: value }));
  };

  return (
    <div className="reports-view" data-tour="reports-view">
      <div className="bc-view-header">
        <nav className="reports-view__tabs">
          {tables.map((table) => (
            <Button
              key={table.id}
              size="sm"
              variant="ghost"
              className={table.id === active.id ? 'ds-button--active' : ''}
              onClick={() => setActiveId(table.id)}
            >
              {table.name}
            </Button>
          ))}
        </nav>

        {active.id === 'summary' && (
          <label className="reports-view__minutes-per-page">
            Minutes per page
            <input
              type="number"
              min="0.1"
              step="0.1"
              value={breakdown.settings?.minutesPerPage ?? 1}
              onChange={handleMinutesPerPageChange}
            />
          </label>
        )}
      </div>

      <div className="bc-table-wrap">
        <table className="bc-table">
          <thead>
            <tr>
              {active.columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {active.rows.map((row, index) => (
              <tr key={index}>
                {row.map((cell, cellIndex) => (
                  <td
                    key={cellIndex}
                    className={typeof cell === 'number' ? 'num' : cellIndex === 0 ? 'strong' : ''}
                  >
                    {cell === null || cell === undefined || cell === '' ? '·' : String(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        {!active.rows.length && <div className="bc-empty">This report has no rows yet.</div>}
      </div>
    </div>
  );
}
