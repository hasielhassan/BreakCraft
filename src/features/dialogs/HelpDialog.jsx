import React from 'react';
import { Modal, Button, Kbd } from '../../design-system/components';
import './HelpDialog.css';

export function HelpDialog({ isOpen, onClose, onStartTour }) {
  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      title="BreakCraft Help"
      onClose={onClose}
      size="lg"
      actions={
        <div className="flex items-center gap-2">
          {onStartTour && (
            <Button
              variant="secondary"
              onClick={() => {
                onClose();
                onStartTour();
              }}
              data-tour="take-tour"
            >
              🚀 Take Guided Tour
            </Button>
          )}
          <Button variant="primary" onClick={onClose}>
            Got it
          </Button>
        </div>
      }
    >
      <div className="ds-help-layout">
        <div>
          <h4 className="ds-help-section-title">Quick Start</h4>
          <ol className="ds-help-steps">
            <li>Open or drop in a script — Fountain, Final Draft, or ScreenJSON — or load one of the five sample scripts from the welcome screen.</li>
            <li>Select any words in an action line or dialogue, pick a category, and save it as a tagged element.</li>
            <li>Switch to <strong>Breakdown</strong>, <strong>Elements</strong>, or <strong>Reports</strong> to see the tagged data as a scene grid, a per-department library, or exportable tables.</li>
            <li>Export the script or breakdown sheets as PDF, or the reports as Excel, CSV, or a schedule, from the <strong>Export</strong> menu.</li>
          </ol>
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid var(--ds-border-color)', margin: 0 }} />

        <div>
          <h4 className="ds-help-section-title">Key Features</h4>
          <div className="ds-features-grid">
            <div className="ds-feature-card">
              <span className="ds-feature-icon">🏷️</span>
              <div className="ds-feature-content">
                <span className="ds-feature-title">Tag Anything</span>
                <span className="ds-feature-desc">Select text in an action line or dialogue and it's tracked across every scene it appears in.</span>
              </div>
            </div>

            <div className="ds-feature-card">
              <span className="ds-feature-icon">🎨</span>
              <div className="ds-feature-content">
                <span className="ds-feature-title">Custom Categories</span>
                <span className="ds-feature-desc">Add your own departments with an emoji icon and color, or recolor the 15 built-ins, from the Categories menu.</span>
              </div>
            </div>

            <div className="ds-feature-card">
              <span className="ds-feature-icon">🎬</span>
              <div className="ds-feature-content">
                <span className="ds-feature-title">Breakdown Modes</span>
                <span className="ds-feature-desc">Live Action, Animation, or your own custom mode — each controls which categories show by default, renames them (e.g. Cast → Characters), and picks which report columns appear. Tagged data is never hidden, from the Modes menu.</span>
              </div>
            </div>

            <div className="ds-feature-card">
              <span className="ds-feature-icon">🔗</span>
              <div className="ds-feature-content">
                <span className="ds-feature-title">Merge &amp; Alias</span>
                <span className="ds-feature-desc">Combine two tags — even across categories — or two Cast/Sets entries; the old name is kept as a searchable alias.</span>
              </div>
            </div>

            <div className="ds-feature-card">
              <span className="ds-feature-icon">⏱️</span>
              <div className="ds-feature-content">
                <span className="ds-feature-title">Estimated Duration</span>
                <span className="ds-feature-desc">Set a minutes-per-page average and every scene, plus the whole script, gets an estimated runtime.</span>
              </div>
            </div>

            <div className="ds-feature-card">
              <span className="ds-feature-icon">📤</span>
              <div className="ds-feature-content">
                <span className="ds-feature-title">Direct Exports</span>
                <span className="ds-feature-desc">Script and breakdown sheets export straight to PDF; reports export to Excel, CSV, or Open Schedule Format for PlanCraft.</span>
              </div>
            </div>
          </div>
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid var(--ds-border-color)', margin: 0 }} />

        <div>
          <h4 className="ds-help-section-title">Keyboard Shortcuts</h4>
          <div className="ds-shortcuts-list">
            <div className="ds-shortcut-row">
              <span className="ds-shortcut-name">Undo / Redo</span>
              <div className="ds-shortcut-keys-container">
                <Kbd>Ctrl</Kbd> + <Kbd>Z</Kbd> / <Kbd>Ctrl</Kbd> + <Kbd>Shift</Kbd> + <Kbd>Z</Kbd>
              </div>
            </div>

            <div className="ds-shortcut-row">
              <span className="ds-shortcut-name">Open Export dialog</span>
              <div className="ds-shortcut-keys-container">
                <Kbd>Ctrl</Kbd> + <Kbd>E</Kbd>
              </div>
            </div>

            <div className="ds-shortcut-row">
              <span className="ds-shortcut-name">Close a dialog or cancel tagging</span>
              <div className="ds-shortcut-keys-container">
                <Kbd>Esc</Kbd>
              </div>
            </div>
          </div>
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid var(--ds-border-color)', margin: 0 }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 'var(--ds-font-size-xs)', color: 'var(--ds-text-secondary)', gap: '12px', flexWrap: 'wrap' }}>
          <span>Want to know more about the format BreakCraft is built on?</span>
          <a
            href="https://screenjson.com"
            target="_blank"
            rel="noreferrer"
            style={{ color: 'var(--ds-color-accent)', textDecoration: 'none', fontWeight: '600' }}
          >
            ScreenJSON spec ↗
          </a>
        </div>
      </div>
    </Modal>
  );
}
