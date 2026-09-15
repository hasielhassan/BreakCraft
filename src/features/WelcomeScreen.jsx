import React, { useState } from 'react';
import { Button } from '../design-system/components';
import { SUPPORTED_FORMATS } from '../core/parsers/index.js';
import { SAMPLES } from './samples.js';
import { getAssetUrl } from '../utils/asset-path.js';
import './WelcomeScreen.css';

export function WelcomeScreen({ onImport, onLoadSample, onRestore, onDrop, onAbout, onStartTour, recent }) {
  const [isDragging, setIsDragging] = useState(false);

  return (
    <div
      className={`welcome ${isDragging ? 'welcome--dragging' : ''}`}
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(event) => {
        setIsDragging(false);
        onDrop(event);
      }}
    >
      <div className="welcome__inner">
        <header className="welcome__header">
          <img
            src={getAssetUrl('/favicon.svg')}
            alt="BreakCraft"
            className="welcome__logo"
          />
          <h1>BreakCraft</h1>
          <p>
            Drop a screenplay in, tag what production needs, and take the breakdown out as a
            spreadsheet, breakdown sheets or a schedule. Everything runs in this browser tab — no
            upload, no account, no server.
          </p>
        </header>

        <div className="welcome__dropzone" onClick={onImport} role="button" tabIndex={0}>
          <span className="welcome__dropzone-icon">＋</span>
          <span className="welcome__dropzone-title">Drop a script here, or click to choose one</span>
          <span className="welcome__dropzone-formats">
            {SUPPORTED_FORMATS.map((format) => format.label).join(' · ')}
          </span>
        </div>

        <div className="welcome__actions">
          <Button variant="primary" icon="📂" onClick={onImport}>
            Open a script
          </Button>
          {onRestore && (
            <Button variant="secondary" icon="↩" onClick={onRestore}>
              Restore last session
            </Button>
          )}
          {onStartTour && (
            <Button variant="secondary" icon="🚀" onClick={onStartTour} data-tour="take-tour">
              Take Feature Tour
            </Button>
          )}
          <Button variant="ghost" icon="ℹ️" onClick={onAbout}>
            About
          </Button>
        </div>

        <section className="welcome__section">
          <h2>Sample scripts</h2>
          <p className="welcome__hint">
            Five original adaptations of public-domain stories, each as a blank script to tag
            yourself or already tagged to see the breakdown in action.
          </p>
          <div className="welcome__cards">
            {SAMPLES.map((sample) => (
              <div className="welcome__card" key={sample.file}>
                <span className="welcome__card-title">{sample.name}</span>
                <span className="welcome__card-note">{sample.note}</span>
                <div className="welcome__card-actions">
                  <Button size="sm" variant="secondary" onClick={() => onLoadSample(sample.file)}>
                    Blank
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onLoadSample(sample.tagged)}>
                    Tagged
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {recent.length > 0 && (
          <section className="welcome__section">
            <h2>Recently opened</h2>
            <ul className="welcome__recent">
              {recent.map((entry) => (
                <li key={`${entry.fileName}-${entry.openedAt}`}>
                  <span className="welcome__recent-name">{entry.title}</span>
                  <span className="welcome__recent-meta">
                    {entry.fileName} · {entry.format} · {entry.scenes} scenes
                  </span>
                </li>
              ))}
            </ul>
            <p className="welcome__hint">
              Only the file details are remembered, never the script itself. Open the file again to
              continue, or restore the last session above.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
