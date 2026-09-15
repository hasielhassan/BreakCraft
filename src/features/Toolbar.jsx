import React from 'react';
import { Button, IconButton, Divider, Select } from '../design-system/components';
import './Toolbar.css';

const VIEWS = [
  { id: 'script', label: 'Script', icon: '📄' },
  { id: 'breakdown', label: 'Breakdown', icon: '▦' },
  { id: 'elements', label: 'Elements', icon: '🏷️' },
  { id: 'reports', label: 'Reports', icon: '📊' }
];

export function Toolbar({
  activeView,
  onChangeView,
  onToggleHighlights,
  highlightsVisible,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  mode = 'all',
  modes = [],
  showAllCategories = false,
  onChangeMode,
  onToggleShowAll,
  onManageModes,
  disabled = false
}) {
  const modeOptions = modes.map((m) => ({ value: m.id, label: `${m.icon ? `${m.icon} ` : ''}${m.label}` }));
  return (
    <div className="ds-toolbar flex items-center justify-between px-4 shrink-0" data-tour="toolbar">
      <nav className="flex items-center gap-1">
        {VIEWS.map((view) => (
          <Button
            key={view.id}
            size="sm"
            variant="ghost"
            icon={view.icon}
            className={activeView === view.id ? 'ds-button--active' : ''}
            onClick={() => onChangeView(view.id)}
            disabled={disabled}
          >
            {view.label}
          </Button>
        ))}
      </nav>

      <div className="flex items-center gap-2">
        <Select
          inline
          value={mode}
          onChange={(event) => onChangeMode(event.target.value)}
          options={modeOptions}
          disabled={disabled}
          className="toolbar-mode-select"
          title="Breakdown mode — sets the default visible categories"
        />
        <IconButton
          icon="⚙"
          size="sm"
          onClick={onManageModes}
          disabled={disabled}
          title="Configure modes — categories, aliases and report columns"
        />
        {mode !== 'all' && (
          <Button
            size="sm"
            variant="ghost"
            className={showAllCategories ? 'ds-button--active' : ''}
            onClick={onToggleShowAll}
            disabled={disabled}
            title={
              showAllCategories
                ? 'Showing every category regardless of mode'
                : 'Only showing categories for this mode — tagged data is never hidden'
            }
          >
            Show all
          </Button>
        )}

        <Divider vertical />

        <IconButton
          icon="↶"
          size="sm"
          onClick={onUndo}
          disabled={disabled || !canUndo}
          title="Undo (Ctrl+Z)"
        />
        <IconButton
          icon="↷"
          size="sm"
          onClick={onRedo}
          disabled={disabled || !canRedo}
          title="Redo (Ctrl+Shift+Z)"
        />

        <Divider vertical />

        <IconButton
          icon={highlightsVisible ? '🖍️' : '🚫'}
          size="sm"
          onClick={onToggleHighlights}
          disabled={disabled}
          className={highlightsVisible ? 'ds-button--active' : ''}
          title={highlightsVisible ? 'Hide tag highlights' : 'Show tag highlights'}
        />
      </div>
    </div>
  );
}
