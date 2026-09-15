import React, { useState } from 'react';
import { Button, Modal } from '../../design-system/components';
import { EXPORT_GROUPS, runExport } from '../../export/index.js';
import './dialogs.css';

export function ExportDialog({ isOpen, onClose, onNotify, project }) {
  const [busy, setBusy] = useState(null);

  const handleExport = (targetId) => {
    setBusy(targetId);
    // Deferred a frame so the button's busy state paints before the export
    // work — synchronous for most formats, awaited for the PDF renderers —
    // blocks the main thread on a large script.
    requestAnimationFrame(() => {
      (async () => {
        try {
          const { fileName } = await runExport(targetId, project);
          onNotify(`Exported ${fileName}.`, 'primary');
        } catch (error) {
          console.error(error);
          onNotify(`Export failed: ${error.message}`, 'error');
        } finally {
          setBusy(null);
        }
      })();
    });
  };

  return (
    <Modal isOpen={isOpen} title="Export" onClose={onClose} size="lg" data-tour="export-dialog-modal">
      <div className="export-dialog">
        {EXPORT_GROUPS.map((group) => (
          <section className="export-dialog__group" key={group.id}>
            <h3>{group.label}</h3>
            <ul>
              {group.targets.map((target) => (
                <li key={target.id}>
                  <div className="export-dialog__info">
                    <span className="export-dialog__label">
                      {target.label}
                      <code>{target.extension}</code>
                    </span>
                    <span className="export-dialog__description">{target.description}</span>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy !== null}
                    onClick={() => handleExport(target.id)}
                  >
                    {busy === target.id ? 'Working…' : 'Export'}
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <p className="export-dialog__note">
          Everything is generated in this tab and saved straight to your downloads. Nothing is
          uploaded. The breakdown sidecar is the lossless record — keep it if you want to carry on
          tagging later.
        </p>
      </div>
    </Modal>
  );
}
