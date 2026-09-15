import React from 'react';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Builds the guided-tour step list.
 *
 * `props` is kept as a single object rather than destructured up front so
 * that `props.hasProject` / `props.firstSceneId` — backed by getters in
 * `OnboardingTour` that read a live ref — are read fresh each time a step's
 * `before` hook actually runs, not frozen to whatever they were when the
 * tour started (a script can finish loading asynchronously between steps).
 */
export const getTourSteps = (props) => {
  const { onLoadSample, setActiveView, setActiveModal, setSelection, setIsSidebarCollapsed } = props;

  const ensureProjectLoaded = async () => {
    if (!props.hasProject && onLoadSample) {
      await onLoadSample('three-little-pigs.breakcraft.json');
      await wait(300);
    }
  };

  return [
    {
      target: 'body',
      placement: 'center',
      title: '👋 Welcome to BreakCraft',
      content: (
        <div>
          <p style={{ marginBottom: '10px' }}>
            <strong>BreakCraft</strong> turns a screenplay into a production breakdown — parsed
            scenes and cast, tagged props and departments, exported as a spreadsheet, breakdown
            sheets, or a schedule.
          </p>
          <p className="text-xs text-muted">Let's take a quick tour of the app.</p>
        </div>
      )
    },
    {
      target: '[data-tour="menu-bar"]',
      placement: 'bottom-start',
      title: '📁 Main Menu Bar',
      content: (
        <div>
          <p style={{ marginBottom: '10px' }}>Use the main menu bar to manage your project:</p>
          <ul style={{ paddingLeft: '18px', margin: 0, fontSize: '14px', lineHeight: '1.6' }}>
            <li><strong>New / Open</strong>: Start over, import a script, or load a sample.</li>
            <li><strong>Export</strong>: Render to PDF, Excel, CSV, or a schedule.</li>
            <li><strong>Categories</strong>: Manage the tagging category registry.</li>
            <li><strong>Modes</strong>: Configure Live Action, Animation, or your own modes.</li>
            <li><strong>Help &amp; About</strong>: Shortcuts, features, and version info.</li>
          </ul>
        </div>
      ),
      before: async () => {
        if (setActiveModal) setActiveModal(null);
      }
    },
    {
      target: '[data-tour="toolbar"]',
      placement: 'bottom-start',
      title: '⚡ View Tabs & Toolbar',
      content: (
        <div>
          <p style={{ marginBottom: '10px' }}>Switch between the four ways of looking at a script:</p>
          <ul style={{ paddingLeft: '18px', margin: 0, fontSize: '14px', lineHeight: '1.6' }}>
            <li><strong>Script / Breakdown / Elements / Reports</strong>: The four main views.</li>
            <li><strong>Mode selector</strong>: Live Action, Animation, or a mode you create yourself narrows and renames the default categories shown — the ⚙ next to it opens the mode manager.</li>
            <li><strong>↶ / ↷ History</strong>: Undo and redo every tag (<code>Ctrl+Z</code>).</li>
            <li><strong>🖍️ Highlights</strong>: Toggle tag highlighting in the script.</li>
          </ul>
        </div>
      ),
      before: ensureProjectLoaded
    },
    {
      target: '[data-tour="script-view"]',
      placement: 'right',
      title: '📄 The Script',
      content: (
        <div>
          <p style={{ marginBottom: '10px' }}>
            The script renders exactly as paginated — what you see is what page counts and eighths
            are measured from.
          </p>
          <ul style={{ paddingLeft: '18px', margin: 0, fontSize: '14px', lineHeight: '1.6' }}>
            <li>Select any words in an action line or dialogue to tag them.</li>
            <li>Click an existing highlight to open it in the Inspector.</li>
          </ul>
        </div>
      ),
      before: async () => {
        await ensureProjectLoaded();
        if (setActiveView) setActiveView('script');
        await wait(200);
      }
    },
    {
      target: '[data-tour="inspector-panel"]',
      placement: 'left',
      title: '🎛️ Inspector',
      content: (
        <div>
          <p style={{ marginBottom: '10px' }}>
            The right panel shows details for whatever is selected — a scene or a tag:
          </p>
          <ul style={{ paddingLeft: '18px', margin: 0, fontSize: '14px', lineHeight: '1.6' }}>
            <li>A scene's page, length, estimated duration, cast, set, and every tag in it.</li>
            <li>A tag's category, department, quantity, notes, and any merged-in aliases.</li>
          </ul>
        </div>
      ),
      before: async () => {
        await ensureProjectLoaded();
        if (setActiveView) setActiveView('script');
        if (setIsSidebarCollapsed) setIsSidebarCollapsed(false);
        if (props.firstSceneId && setSelection) setSelection({ sceneId: props.firstSceneId });
        await wait(200);
      }
    },
    {
      target: '[data-tour="breakdown-view"]',
      placement: 'right',
      title: '▦ Breakdown Grid',
      content: (
        <div>
          <p style={{ marginBottom: '10px' }}>
            One row per scene, one column per category — the traditional breakdown sheet, on
            screen:
          </p>
          <ul style={{ paddingLeft: '18px', margin: 0, fontSize: '14px', lineHeight: '1.6' }}>
            <li>Filter by set, scene, cast, or synopsis, or show tagged scenes only.</li>
            <li>Set, Cast, and every category render as colored chips.</li>
          </ul>
        </div>
      ),
      before: async () => {
        await ensureProjectLoaded();
        if (setActiveView) setActiveView('breakdown');
        await wait(200);
      }
    },
    {
      target: '[data-tour="elements-view"]',
      placement: 'right',
      title: '🏷️ Elements Library',
      content: (
        <div>
          <p style={{ marginBottom: '10px' }}>
            Every tagged element, grouped by category, plus what's derived automatically:
          </p>
          <ul style={{ paddingLeft: '18px', margin: 0, fontSize: '14px', lineHeight: '1.6' }}>
            <li><strong>Cast</strong> and <strong>Sets</strong> are auto-derived — no tagging needed, though they can still be merged or removed.</li>
            <li>Merge two elements — even across categories — to fix a duplicate or a typo.</li>
          </ul>
        </div>
      ),
      before: async () => {
        await ensureProjectLoaded();
        if (setActiveView) setActiveView('elements');
        await wait(200);
      }
    },
    {
      target: '[data-tour="reports-view"]',
      placement: 'right',
      title: '📊 Reports',
      content: (
        <div>
          <p style={{ marginBottom: '10px' }}>
            Summary, Scenes, Elements, Day Out of Days, Sets, and one tab per populated
            department — the exact tables every export renders from, so what you see here is
            what you get in Excel or CSV.
          </p>
        </div>
      ),
      before: async () => {
        await ensureProjectLoaded();
        if (setActiveView) setActiveView('reports');
        await wait(200);
      }
    },
    {
      target: '[data-tour="categories-trigger"]',
      placement: 'bottom',
      title: '🎨 Categories Menu',
      content: (
        <div>
          <p style={{ marginBottom: '10px' }}>
            Clicking <strong>Categories</strong> opens the category manager.
          </p>
          <p className="text-xs text-muted">Let's take a look inside on the next step.</p>
        </div>
      ),
      before: async () => {
        if (setActiveModal) setActiveModal(null);
      }
    },
    {
      target: '[data-tour="category-manager-dialog"]',
      placement: 'right',
      title: '⚙️ Category Manager',
      content: (
        <div>
          <p style={{ marginBottom: '10px' }}>Recolor, re-icon, add, or remove categories:</p>
          <ul style={{ paddingLeft: '18px', margin: 0, fontSize: '14px', lineHeight: '1.6' }}>
            <li>The 15 built-ins can be recolored and re-iconed, but never deleted.</li>
            <li>Custom categories are fully editable, and removable once nothing is tagged under them.</li>
          </ul>
        </div>
      ),
      before: async () => {
        if (setActiveModal) setActiveModal('categories');
        await wait(150);
      }
    },
    {
      target: '[data-tour="modes-trigger"]',
      placement: 'bottom',
      title: '🎬 Modes Menu',
      content: (
        <div>
          <p style={{ marginBottom: '10px' }}>
            Clicking <strong>Modes</strong> opens the mode manager.
          </p>
          <p className="text-xs text-muted">Let's take a look inside on the next step.</p>
        </div>
      ),
      before: async () => {
        if (setActiveModal) setActiveModal(null);
      }
    },
    {
      target: '[data-tour="mode-manager-dialog"]',
      placement: 'right',
      title: '⚙️ Mode Manager',
      content: (
        <div>
          <p style={{ marginBottom: '10px' }}>Live Action, Animation, or a mode you create yourself:</p>
          <ul style={{ paddingLeft: '18px', margin: 0, fontSize: '14px', lineHeight: '1.6' }}>
            <li>Pick which categories show by default, and rename any of them — "Cast" can read as "Characters".</li>
            <li>Choose which report columns (Cast, Shoot Day, Unit, Notes…) appear for that mode.</li>
          </ul>
        </div>
      ),
      before: async () => {
        if (setActiveModal) setActiveModal('modes');
        await wait(150);
      }
    },
    {
      target: '[data-tour="export-trigger"]',
      placement: 'bottom',
      title: '📤 Export Menu',
      content: (
        <div>
          <p style={{ marginBottom: '10px' }}>
            Clicking <strong>Export...</strong> opens every export format BreakCraft produces.
          </p>
          <p className="text-xs text-muted">Let's look at the options on the next step.</p>
        </div>
      ),
      before: async () => {
        if (setActiveModal) setActiveModal(null);
      }
    },
    {
      target: '[data-tour="export-dialog-modal"]',
      placement: 'right',
      title: '🖼️ Export Formats',
      content: (
        <div>
          <p style={{ marginBottom: '10px' }}>
            Export the script or the breakdown, straight from this tab:
          </p>
          <ul style={{ paddingLeft: '18px', margin: 0, fontSize: '14px', lineHeight: '1.6' }}>
            <li><strong>Script (PDF)</strong> and <strong>Breakdown sheets (PDF)</strong> — paginated exactly as measured.</li>
            <li><strong>Excel / CSV</strong> reports, and an <strong>Open Schedule Format</strong> handoff for PlanCraft.</li>
          </ul>
        </div>
      ),
      before: async () => {
        if (setActiveModal) setActiveModal('export');
        await wait(150);
      }
    },
    {
      target: '[data-tour="status-bar"]',
      placement: 'top',
      title: '🚀 Ready to Break Down a Script',
      content: (
        <div>
          <p style={{ marginBottom: '10px' }}>You're all set to start tagging.</p>
          <p className="text-xs text-muted">
            You can restart this tour anytime from the <strong>Help</strong> menu.
          </p>
        </div>
      ),
      before: async () => {
        if (setActiveModal) setActiveModal(null);
      }
    }
  ];
};

export default getTourSteps;
