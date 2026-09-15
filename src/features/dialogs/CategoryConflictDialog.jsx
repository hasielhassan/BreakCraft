import React from 'react';
import { Badge, Button, Modal } from '../../design-system/components';
import './dialogs.css';

/**
 * Shown when a project's embedded category snapshot (`breakdown.categories`)
 * defines a custom category or built-in recolor that the user's personal
 * category library either lacks or has recorded differently.
 *
 * The project itself never needs this dialog to render correctly — its
 * categories are already embedded and work regardless of what's chosen here.
 * This is purely about whether to also persist them into the reusable
 * library for future projects ("namespaces": use this project's definitions
 * just for this session, or adopt them into the shared library).
 */
export function CategoryConflictDialog({ isOpen, pending, onUseForProjectOnly, onUpdateLibrary }) {
  if (!pending?.length) return null;

  return (
    <Modal
      isOpen={isOpen}
      title="Custom categories in this project"
      onClose={onUseForProjectOnly}
      size="md"
      actions={
        <>
          <Button variant="secondary" onClick={onUseForProjectOnly}>
            Use just for this project
          </Button>
          <Button variant="primary" onClick={onUpdateLibrary}>
            Add to my category library
          </Button>
        </>
      }
    >
      <div className="category-conflict">
        <p>
          This project defines {pending.length} custom {pending.length === 1 ? 'category' : 'categories'}{' '}
          or color/icon change{pending.length === 1 ? '' : 's'} not in your personal library on this
          browser. It already works correctly either way — this only decides whether to also remember
          it for your next projects.
        </p>
        <ul className="category-conflict__list">
          {pending.map((entry) => (
            <li key={`${entry.kind}-${entry.id}`} className="category-conflict__item">
              <span
                className="category-conflict__swatch"
                style={{ backgroundColor: entry.incoming.color || 'var(--ds-text-muted)' }}
              >
                {entry.incoming.icon || ''}
              </span>
              <span className="category-conflict__label">
                {entry.kind === 'custom' ? entry.incoming.label : entry.id}
              </span>
              <Badge variant={entry.existing ? 'accent' : 'secondary'}>
                {entry.existing ? 'differs from your library' : 'new to your library'}
              </Badge>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
