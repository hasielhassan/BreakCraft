import React from 'react';
import { Badge, Button, Modal } from '../../design-system/components';
import './dialogs.css';

/**
 * Import is never silently lossy.
 *
 * Anything the parser had to guess, drop or repair is reported here, along with
 * schema problems in the resulting document. The script is loaded either way —
 * a producer with an imperfect file still needs to work — but they are told what
 * happened.
 */
export function ImportReportDialog({ isOpen, report, onClose }) {
  if (!report) return null;

  const errors = report.validation?.errors || [];
  const warnings = report.validation?.warnings || [];
  const shown = errors.slice(0, 25);

  return (
    <Modal
      isOpen={isOpen}
      title="Import report"
      onClose={onClose}
      size="lg"
      actions={
        <Button variant="primary" onClick={onClose}>
          Continue
        </Button>
      }
    >
      <div className="import-report">
        <div className="import-report__summary">
          <Badge variant="secondary">{report.fileName}</Badge>
          <Badge variant="accent">{report.format}</Badge>
          <Badge variant={errors.length ? 'error' : 'primary'}>
            {errors.length ? `${errors.length} schema error(s)` : 'Schema valid'}
          </Badge>
        </div>

        {report.notices.length > 0 && (
          <section>
            <h3>Notices</h3>
            <ul className="import-report__list">
              {report.notices.map((notice, index) => (
                <li key={index}>{notice}</li>
              ))}
            </ul>
          </section>
        )}

        {shown.length > 0 && (
          <section>
            <h3>Schema errors</h3>
            <p className="import-report__hint">
              The script has been loaded anyway. These will also appear if you re-export it as
              ScreenJSON.
            </p>
            <ul className="import-report__list import-report__list--mono">
              {shown.map((error, index) => (
                <li key={index}>
                  <code>{error.path}</code> {error.message}
                </li>
              ))}
            </ul>
            {errors.length > shown.length && (
              <p className="import-report__hint">…and {errors.length - shown.length} more.</p>
            )}
          </section>
        )}

        {warnings.length > 0 && (
          <section>
            <h3>Warnings</h3>
            <ul className="import-report__list import-report__list--mono">
              {warnings.slice(0, 10).map((warning, index) => (
                <li key={index}>
                  <code>{warning.path}</code> {warning.message}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Modal>
  );
}
