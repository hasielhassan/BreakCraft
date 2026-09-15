/**
 * Local persistence.
 *
 * Everything stays on the machine. Scripts are confidential material and the
 * app makes a point of never sending them anywhere — that is a feature, not an
 * implementation detail, so there is no network path here at all.
 *
 * localStorage is used rather than IndexedDB for the prototype because the data
 * is a single JSON document per project and the synchronous API keeps the
 * reducer simple. The 5 MB quota is the known ceiling: a 120-page script with a
 * few hundred tags lands around 1-2 MB, so it holds for one project but not for
 * a library of them. IndexedDB migration is a tracked roadmap item.
 */

import { serializeProject, deserializeProject } from './project.js';

const AUTOSAVE_KEY = 'breakcraft:autosave';
const RECENT_KEY = 'breakcraft:recent';
const PREFS_KEY = 'breakcraft:preferences';
const CATEGORY_LIBRARY_KEY = 'breakcraft:categories';

const DEFAULT_PREFERENCES = {
  panelWidth: 460,
  activeView: 'script',
  showHighlights: true,
  scriptZoom: 1,
  hasCompletedTour: false
};

const DEFAULT_CATEGORY_LIBRARY = {
  custom: [], // CategoryDef[], same shape as breakdown.categories.custom
  overrides: {} // builtInId -> { color?, icon? }
};

let autoSaveTimer = null;

export const storage = {
  /** Debounced autosave of the whole project. */
  autoSave(project) {
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => {
      try {
        localStorage.setItem(AUTOSAVE_KEY, serializeProject(project));
      } catch (error) {
        // A quota failure must be visible, not silent: the user believes their
        // tagging is being kept.
        console.error('BreakCraft could not autosave this project:', error);
        window.dispatchEvent(
          new CustomEvent('breakcraft:autosave-failed', { detail: { message: error.message } })
        );
      }
    }, 800);
  },

  hasAutoSave() {
    return Boolean(localStorage.getItem(AUTOSAVE_KEY));
  },

  loadAutoSave() {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    try {
      return deserializeProject(raw);
    } catch (error) {
      console.error('Stored project could not be read; discarding it.', error);
      localStorage.removeItem(AUTOSAVE_KEY);
      return null;
    }
  },

  clearAutoSave() {
    localStorage.removeItem(AUTOSAVE_KEY);
  },

  getRecent() {
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  /**
   * Record a recently opened script.
   *
   * Only metadata is kept, never the script text: the recent list is a
   * convenience, and duplicating whole screenplays into a second storage key
   * would exhaust the quota after two or three projects.
   */
  addRecent({ title, fileName, format, scenes }) {
    try {
      const list = this.getRecent().filter((entry) => entry.fileName !== fileName);
      list.unshift({ title, fileName, format, scenes, openedAt: Date.now() });
      localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 6)));
    } catch (error) {
      console.error('Could not update the recent list:', error);
    }
  },

  getPreferences() {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      return { ...DEFAULT_PREFERENCES, ...(raw ? JSON.parse(raw) : {}) };
    } catch {
      return { ...DEFAULT_PREFERENCES };
    }
  },

  setPreferences(changes) {
    const next = { ...this.getPreferences(), ...changes };
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    } catch (error) {
      console.error('Could not save preferences:', error);
    }
    return next;
  },

  /**
   * The user's personal category library — custom categories and built-in
   * recolors/re-icons that persist across every project opened on this
   * machine, independent of any one project's own embedded snapshot (see
   * `breakdown.categories` in `core/breakdown/model.js`). Reconciling the two
   * on project load is `AppShell`'s job, not this module's.
   */
  getCategoryLibrary() {
    try {
      const raw = localStorage.getItem(CATEGORY_LIBRARY_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return {
        custom: Array.isArray(parsed.custom) ? parsed.custom : [],
        overrides: parsed.overrides && typeof parsed.overrides === 'object' ? parsed.overrides : {}
      };
    } catch {
      return { ...DEFAULT_CATEGORY_LIBRARY };
    }
  },

  setCategoryLibrary(library) {
    try {
      localStorage.setItem(CATEGORY_LIBRARY_KEY, JSON.stringify(library));
    } catch (error) {
      console.error('Could not save the category library:', error);
    }
    return library;
  }
};
