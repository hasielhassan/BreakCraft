import React from 'react';
import { Badge, Button, Modal } from '../../design-system/components';
import { getAssetUrl } from '../../utils/asset-path.js';
import './dialogs.css';

export function AboutDialog({ isOpen, onClose }) {
  return (
    <Modal
      isOpen={isOpen}
      title="About BreakCraft"
      onClose={onClose}
      size="md"
      actions={
        <Button variant="primary" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="about-dialog flex flex-col items-center text-center gap-4">
        <img
          src={getAssetUrl('/favicon.svg')}
          alt="BreakCraft logo"
          style={{
            width: '96px',
            height: '96px',
            objectFit: 'contain',
            filter: 'drop-shadow(0 4px 14px rgba(171, 128, 7, 0.4))'
          }}
        />

        <div className="flex flex-col items-center gap-1">
          <h3 className="text-xl font-bold text-primary m-0">BreakCraft</h3>
          <Badge variant="accent">
            v{typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.1.0'}
          </Badge>
        </div>

        <p className="text-sm text-secondary" style={{ maxWidth: '440px', lineHeight: 1.5 }}>
          BreakCraft turns a screenplay into a production breakdown: import a Fountain, Final
          Draft or ScreenJSON script, tag what each department needs, and export a spreadsheet,
          breakdown sheets, a tagged script, or a schedule. Everything runs locally in this
          browser tab — nothing is uploaded, and there is no account.
        </p>

        <div className="about-dialog__meta text-xs text-muted">
          <div>Author: <strong className="text-primary">Hasiel Alvarez</strong></div>
          <div>
            Repo:{' '}
            <a href="https://github.com/hasielhassan/BreakCraft" target="_blank" rel="noreferrer">
              github.com/hasielhassan/BreakCraft
            </a>
          </div>
          <div>License: GNU General Public License v3.0</div>
          <div>Copyright © 2026 Hasiel Alvarez</div>
        </div>

        <div className="about-dialog__card">
          <p className="text-xs text-muted" style={{ margin: 0, lineHeight: 1.5 }}>
            🤖 <strong>AI &amp; Craftsmanship Disclaimer:</strong>
            <br />
            Developed with the interactive assistance of <strong>Claude</strong>, fueled by lots
            of coffee ☕ and screenwriting research. The five sample scripts are original
            adaptations of public-domain stories — Aesop, Hans Christian Andersen, and the Flora
            Annie Steel fairy tale collection (1918) — drafted with Claude as a writing
            assistant and reviewed before inclusion.
          </p>
        </div>

        <a href="https://buymeacoffee.com/hasielhassan" target="_blank" rel="noreferrer" className="about-dialog__coffee">
          <span>☕</span> Buy me a coffee
        </a>
      </div>
    </Modal>
  );
}
