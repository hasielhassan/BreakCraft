import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Panel, Toast } from '../design-system/components';
import { useProject } from '../hooks/useProject.js';
import { Toolbar } from './Toolbar.jsx';
import { WelcomeScreen } from './WelcomeScreen.jsx';
import { SAMPLES } from './samples.js';
import { ScriptView } from './ScriptView.jsx';
import { BreakdownView } from './BreakdownView.jsx';
import { ElementLibrary } from './ElementLibrary.jsx';
import { ReportsView } from './ReportsView.jsx';
import { InspectorPanel } from './InspectorPanel.jsx';
import {
  AboutDialog,
  CategoryConflictDialog,
  CategoryManagerDialog,
  ConfirmDialog,
  ExportDialog,
  HelpDialog,
  ImportReportDialog,
  ModeManagerDialog
} from './dialogs';
import { OnboardingTour } from './tour/OnboardingTour.jsx';
import { importScript, IMPORT_ACCEPT } from '../core/parsers/index.js';
import { attachBreakdown, deserializeProject, projectTitle } from '../core/project.js';
import { activeTagCount, updateSettings } from '../core/breakdown/model.js';
import { applyToCategoryLibrary, diffCategoryLibrary } from '../core/breakdown/categories.js';
import { resolveModes } from '../core/breakdown/modes.js';
import { storage } from '../core/storage.js';
import { uploadFile } from '../utils/file-io.js';
import { getAssetUrl } from '../utils/asset-path.js';
import './AppShell.css';

const MIN_PANEL_WIDTH = 280;
const MAX_PANEL_WIDTH = 560;

export function AppShell() {
  const {
    project,
    script,
    breakdown,
    pagination,
    open,
    openProject,
    close,
    setBreakdown,
    applyBreakdown,
    setSelection,
    undo,
    redo,
    canUndo,
    canRedo
  } = useProject();

  const [preferences, setPreferences] = useState(() => storage.getPreferences());
  const [activeView, setActiveView] = useState(preferences.activeView || 'script');
  const [panelWidth, setPanelWidth] = useState(preferences.panelWidth);
  const [isResizing, setIsResizing] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [toast, setToast] = useState(null);
  const [activeModal, setActiveModal] = useState(null);
  const [importReport, setImportReport] = useState(null);
  const [restorable, setRestorable] = useState(() => storage.hasAutoSave());
  const [isOpenMenuOpen, setIsOpenMenuOpen] = useState(false);
  const [isSamplesSubmenuOpen, setIsSamplesSubmenuOpen] = useState(false);
  const [categoryConflicts, setCategoryConflicts] = useState(null);
  const [confirmData, setConfirmData] = useState(null);
  const [isTourRunning, setIsTourRunning] = useState(() => !storage.getPreferences().hasCompletedTour);
  const openMenuRef = useRef(null);

  const shellRef = useRef(null);

  // Close the "Open" menu on an outside click or Escape, same as its dropdown
  // items expect.
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (openMenuRef.current && !openMenuRef.current.contains(event.target)) {
        setIsOpenMenuOpen(false);
        setIsSamplesSubmenuOpen(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsOpenMenuOpen(false);
        setIsSamplesSubmenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const notify = useCallback((message, type = 'secondary') => {
    setToast({ message, type });
  }, []);

  // --- Persistence -------------------------------------------------------
  useEffect(() => {
    if (project) storage.autoSave(project);
  }, [project]);

  useEffect(() => {
    const onFailure = (event) =>
      notify(`Autosave failed: ${event.detail.message}. Export your work.`, 'error');
    window.addEventListener('breakcraft:autosave-failed', onFailure);
    return () => window.removeEventListener('breakcraft:autosave-failed', onFailure);
  }, [notify]);

  const updatePreference = useCallback((changes) => {
    setPreferences(storage.setPreferences(changes));
  }, []);

  /**
   * View changes persist from the handler rather than from an effect on
   * `activeView`; writing state inside an effect that watches that same state
   * causes a second render pass for no benefit.
   */
  const changeView = useCallback(
    (view) => {
      setActiveView(view);
      updatePreference({ activeView: view });
    },
    [updatePreference]
  );

  // --- Panel resizing ----------------------------------------------------
  useEffect(() => {
    if (!isResizing) return undefined;

    const onMove = (event) => {
      const bounds = shellRef.current?.getBoundingClientRect();
      if (!bounds) return;
      const next = Math.min(
        MAX_PANEL_WIDTH,
        Math.max(MIN_PANEL_WIDTH, bounds.right - event.clientX)
      );
      setPanelWidth(next);
    };
    const onUp = () => {
      setIsResizing(false);
      updatePreference({ panelWidth });
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isResizing, panelWidth, updatePreference]);

  // --- Keyboard shortcuts ------------------------------------------------
  useEffect(() => {
    const onKeyDown = (event) => {
      const target = event.target;
      const typing =
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (typing) return;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'e' && project) {
        event.preventDefault();
        setActiveModal('export');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo, project]);

  // --- Import ------------------------------------------------------------

  /**
   * A project's embedded category snapshot always renders correctly on its
   * own; this only decides whether to also persist anything new/different in
   * it into the reusable personal library (see `diffCategoryLibrary`'s own
   * docs for why the project never depends on this check's outcome).
   */
  const checkCategoryLibrary = useCallback((restoredBreakdown) => {
    const pending = diffCategoryLibrary(storage.getCategoryLibrary(), restoredBreakdown.categories);
    if (pending.length) setCategoryConflicts(pending);
  }, []);

  const loadSource = useCallback(
    (content, fileName) => {
      // A BreakCraft project file carries its own breakdown, so it bypasses the
      // script importer entirely.
      if (/\.breakcraft\.json$/i.test(fileName) || isProjectFile(content)) {
        const restored = deserializeProject(content);
        openProject(restored);
        changeView('script');
        notify(`Reopened “${projectTitle(restored)}”.`, 'primary');
        checkCategoryLibrary(restored.breakdown);
        return;
      }

      const result = importScript(content, fileName);
      open(result.document, { fileName, format: result.format });
      changeView('script');

      storage.addRecent({
        title: projectTitle({ script: result.document }),
        fileName,
        format: result.format,
        scenes: result.document.document.scenes.length
      });

      if (result.notices.length || !result.validation.valid) {
        setImportReport({ ...result, fileName });
      } else {
        notify(
          `Imported ${result.document.document.scenes.length} scenes from ${fileName}.`,
          'primary'
        );
      }
    },
    [open, openProject, notify, changeView, checkCategoryLibrary]
  );

  const handleImport = useCallback(async () => {
    try {
      const file = await uploadFile(`${IMPORT_ACCEPT},.breakcraft.json`);
      if (!file) return;
      loadSource(file.content, file.name);
    } catch (error) {
      notify(error.message, 'error');
    }
  }, [loadSource, notify]);

  const handleLoadSample = useCallback(
    async (fileName) => {
      try {
        const response = await fetch(getAssetUrl(`/samples/${fileName}`));
        if (!response.ok) throw new Error(`Sample “${fileName}” could not be loaded.`);
        loadSource(await response.text(), fileName);
      } catch (error) {
        notify(error.message, 'error');
      }
    },
    [loadSource, notify]
  );

  const handleAttachSidecar = useCallback(async () => {
    if (!project) return;
    try {
      const file = await uploadFile('.json');
      if (!file) return;
      const { project: next, warnings } = attachBreakdown(project, JSON.parse(file.content));
      setBreakdown(next.breakdown);
      notify(
        warnings.length ? warnings.join(' ') : `Loaded ${next.breakdown.tags.length} tagged elements.`,
        warnings.length ? 'accent' : 'primary'
      );
    } catch (error) {
      notify(error.message, 'error');
    }
  }, [project, setBreakdown, notify]);

  const handleDrop = useCallback(
    (event) => {
      event.preventDefault();
      const file = event.dataTransfer?.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          loadSource(String(reader.result), file.name);
        } catch (error) {
          notify(error.message, 'error');
        }
      };
      reader.readAsText(file);
    },
    [loadSource, notify]
  );

  const handleRestore = useCallback(() => {
    const restored = storage.loadAutoSave();
    if (!restored) {
      notify('The saved project could not be read.', 'error');
      setRestorable(false);
      return;
    }
    openProject(restored);
    changeView('script');
    notify(`Restored “${projectTitle(restored)}”.`, 'primary');
  }, [openProject, notify, changeView]);

  const handleClose = useCallback(() => {
    close();
    storage.clearAutoSave();
    setRestorable(false);
  }, [close]);

  const requestClose = useCallback(() => {
    setConfirmData({
      title: 'Start New',
      message: 'Discard the current script and its breakdown? Anything not exported will be lost.',
      onConfirm: handleClose
    });
  }, [handleClose]);

  const changeMode = useCallback(
    (modeId) => applyBreakdown((current) => updateSettings(current, { mode: modeId })),
    [applyBreakdown]
  );

  const toggleShowAllCategories = useCallback(
    () =>
      applyBreakdown((current) =>
        updateSettings(current, { showAllCategories: !current.settings.showAllCategories })
      ),
    [applyBreakdown]
  );

  const dismissCategoryConflicts = useCallback(() => setCategoryConflicts(null), []);

  const updateCategoryLibrary = useCallback(() => {
    const library = storage.getCategoryLibrary();
    storage.setCategoryLibrary(applyToCategoryLibrary(library, categoryConflicts));
    notify('Added to your category library.', 'primary');
    setCategoryConflicts(null);
  }, [categoryConflicts, notify]);

  const views = useMemo(
    () => ({
      script: <ScriptView onNotify={notify} showHighlights={preferences.showHighlights} />,
      breakdown: <BreakdownView onOpenScene={() => changeView('script')} />,
      elements: <ElementLibrary onOpenScene={() => changeView('script')} onNotify={notify} />,
      reports: <ReportsView />
    }),
    [notify, preferences.showHighlights, changeView]
  );

  const title = project ? projectTitle(project) : '';
  const sceneCount = project ? project.script.document.scenes.length : 0;
  const tagCount = project ? activeTagCount(breakdown) : 0;

  return (
    <div className="app-shell" ref={shellRef} onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
      <header className="ds-menu-bar flex items-center justify-between shrink-0" data-tour="menu-bar">
        <div className="flex items-center gap-4">
          <div className="ds-app-logo flex items-center gap-2">
            <img
              src={getAssetUrl('/favicon.svg')}
              alt=""
              className="ds-logo-icon"
              style={{ width: '20px', height: '20px', objectFit: 'contain' }}
            />
            <span className="ds-logo-text font-bold">BreakCraft</span>
          </div>
          <nav className="ds-menu-nav flex items-center">
            <button className="ds-menu-trigger" onClick={requestClose} disabled={!project}>
              New
            </button>
            <div className="ds-menu-container" ref={openMenuRef}>
              <button
                className={`ds-menu-trigger ${isOpenMenuOpen ? 'ds-menu-trigger--active' : ''}`}
                onClick={() => setIsOpenMenuOpen((prev) => !prev)}
              >
                Open ▾
              </button>
              {isOpenMenuOpen && (
                <div className="ds-menu-dropdown">
                  <button
                    className="ds-menu-dropdown-item"
                    onClick={() => {
                      setIsOpenMenuOpen(false);
                      handleImport();
                    }}
                  >
                    <span>📂 From file...</span>
                  </button>
                  <div className="ds-menu-dropdown-divider" />
                  <div
                    className="ds-submenu-container"
                    onMouseEnter={() => setIsSamplesSubmenuOpen(true)}
                    onMouseLeave={() => setIsSamplesSubmenuOpen(false)}
                  >
                    <button
                      className={`ds-menu-dropdown-item ${isSamplesSubmenuOpen ? 'ds-menu-dropdown-item--active' : ''}`}
                      onClick={() => setIsSamplesSubmenuOpen((prev) => !prev)}
                    >
                      <span>Sample scripts</span>
                      <span>▸</span>
                    </button>
                    {isSamplesSubmenuOpen && (
                      <div className="ds-submenu-dropdown">
                        {SAMPLES.map((sample) => (
                          <button
                            key={sample.file}
                            className="ds-menu-dropdown-item"
                            onClick={() => {
                              setIsOpenMenuOpen(false);
                              setIsSamplesSubmenuOpen(false);
                              handleLoadSample(sample.file);
                            }}
                            title={sample.note}
                          >
                            <span>{sample.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {project && (
                    <>
                      <div className="ds-menu-dropdown-divider" />
                      <button
                        className="ds-menu-dropdown-item"
                        onClick={() => {
                          setIsOpenMenuOpen(false);
                          handleAttachSidecar();
                        }}
                      >
                        <span>🔗 Attach sidecar...</span>
                      </button>
                    </>
                  )}
                  {restorable && (
                    <>
                      <div className="ds-menu-dropdown-divider" />
                      <button
                        className="ds-menu-dropdown-item"
                        onClick={() => {
                          setIsOpenMenuOpen(false);
                          handleRestore();
                        }}
                      >
                        <span>↩ Restore last session</span>
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
            <button
              className="ds-menu-trigger"
              onClick={() => setActiveModal('export')}
              disabled={!project}
              data-tour="export-trigger"
            >
              Export...
            </button>
            <button
              className="ds-menu-trigger"
              onClick={() => setActiveModal('categories')}
              disabled={!project}
              data-tour="categories-trigger"
            >
              Categories
            </button>
            <button
              className="ds-menu-trigger"
              onClick={() => setActiveModal('modes')}
              disabled={!project}
              data-tour="modes-trigger"
            >
              Modes
            </button>
            <button className="ds-menu-trigger" onClick={() => setActiveModal('help')}>
              Help
            </button>
            <button className="ds-menu-trigger" onClick={() => setActiveModal('about')}>
              About
            </button>
          </nav>
        </div>
        {project && (
          <div className="ds-menu-bar-right text-xs text-muted" title={title}>
            {title}
          </div>
        )}
      </header>

      <Toolbar
        activeView={activeView}
        onChangeView={changeView}
        onToggleHighlights={() => updatePreference({ showHighlights: !preferences.showHighlights })}
        highlightsVisible={preferences.showHighlights}
        onUndo={undo}
        onRedo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
        mode={breakdown?.settings?.mode || 'all'}
        modes={breakdown ? resolveModes(breakdown) : []}
        showAllCategories={Boolean(breakdown?.settings?.showAllCategories)}
        onChangeMode={changeMode}
        onToggleShowAll={toggleShowAllCategories}
        onManageModes={() => setActiveModal('modes')}
        disabled={!project}
      />

      <div className="app-shell__body">
        <main className="app-shell__main">
          {project ? (
            views[activeView]
          ) : (
            <WelcomeScreen
              onImport={handleImport}
              onLoadSample={handleLoadSample}
              onRestore={restorable ? handleRestore : null}
              onDrop={handleDrop}
              onAbout={() => setActiveModal('about')}
              onStartTour={() => setIsTourRunning(true)}
              recent={storage.getRecent()}
            />
          )}
        </main>

        {!isSidebarCollapsed && (
          <div
            className={`app-shell__resizer ${isResizing ? 'app-shell__resizer--active' : ''}`}
            onMouseDown={() => setIsResizing(true)}
            role="separator"
            aria-orientation="vertical"
          />
        )}

        {!isSidebarCollapsed && (
          <aside className="app-shell__panel" style={{ width: panelWidth }} data-tour="inspector-panel">
            <Panel
              title="Inspector"
              collapsible={false}
              className="h-full border-none rounded-none"
              headerActions={
                <button
                  type="button"
                  className="ds-sidebar-collapse-btn"
                  onClick={() => setIsSidebarCollapsed(true)}
                  title="Collapse Sidebar"
                >
                  ▸
                </button>
              }
            >
              <InspectorPanel onNotify={notify} onOpenScene={() => changeView('script')} />
            </Panel>
          </aside>
        )}

        {isSidebarCollapsed && (
          <button
            type="button"
            className="ds-sidebar-expand-btn"
            onClick={() => setIsSidebarCollapsed(false)}
            title="Expand Sidebar"
          >
            ◂
          </button>
        )}
      </div>

      <footer
        className="ds-status-bar flex items-center justify-between shrink-0 text-xs text-secondary"
        data-tour="status-bar"
      >
        <div>{project ? 'Ready' : 'No script open'}</div>
        <div className="flex items-center gap-4">
          <div>Scenes: {sceneCount}</div>
          <div>Pages: {pagination?.totalPages ?? 0}</div>
          <div>Tags: {tagCount}</div>
        </div>
      </footer>

      <ExportDialog
        isOpen={activeModal === 'export'}
        onClose={() => setActiveModal(null)}
        onNotify={notify}
        project={{ script, breakdown, pagination }}
      />
      <AboutDialog isOpen={activeModal === 'about'} onClose={() => setActiveModal(null)} />
      <HelpDialog
        isOpen={activeModal === 'help'}
        onClose={() => setActiveModal(null)}
        onStartTour={() => setIsTourRunning(true)}
      />
      <ImportReportDialog
        isOpen={Boolean(importReport)}
        report={importReport}
        onClose={() => setImportReport(null)}
      />
      <CategoryManagerDialog
        isOpen={activeModal === 'categories'}
        onClose={() => setActiveModal(null)}
        onNotify={notify}
      />
      <ModeManagerDialog
        isOpen={activeModal === 'modes'}
        onClose={() => setActiveModal(null)}
        onNotify={notify}
      />
      <CategoryConflictDialog
        isOpen={Boolean(categoryConflicts)}
        pending={categoryConflicts}
        onUseForProjectOnly={dismissCategoryConflicts}
        onUpdateLibrary={updateCategoryLibrary}
      />
      <ConfirmDialog
        isOpen={confirmData !== null}
        title={confirmData?.title}
        message={confirmData?.message}
        onClose={() => setConfirmData(null)}
        onConfirm={() => {
          if (confirmData?.onConfirm) confirmData.onConfirm();
          setConfirmData(null);
        }}
      />

      <OnboardingTour
        run={isTourRunning}
        onCloseTour={() => setIsTourRunning(false)}
        hasProject={Boolean(project)}
        firstSceneId={script?.document?.scenes?.[0]?.id || null}
        onLoadSample={handleLoadSample}
        setActiveView={changeView}
        setActiveModal={setActiveModal}
        setSelection={setSelection}
        setIsSidebarCollapsed={setIsSidebarCollapsed}
      />

      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
    </div>
  );
}

/** Cheap discriminator for a saved project versus a raw ScreenJSON file. */
function isProjectFile(content) {
  const head = content.slice(0, 400);
  return head.includes('"generator": "BreakCraft"') && head.includes('"breakdown"');
}
