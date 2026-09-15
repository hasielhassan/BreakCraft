/**
 * Project state.
 *
 * A single reducer owns the project. Breakdown mutations are pure functions
 * (`core/breakdown/model.js`), so undo is simply a stack of previous breakdown
 * references — no deep cloning, no snapshots of the script, which never changes
 * while a draft is open.
 *
 * Pagination is derived with `useMemo` from the script alone. It is the most
 * expensive computation in the app and it does not depend on the breakdown, so
 * tagging never triggers a re-layout.
 */

import React, { useMemo, useReducer, useCallback } from 'react';
import { paginate } from '../core/paginate/paginate.js';
import { charactersById } from '../core/screenjson/query.js';
import { createProject } from '../core/project.js';

import { ProjectContext } from './project-context.js';

const HISTORY_LIMIT = 100;

const initialState = {
  project: null,
  past: [],
  future: [],
  selection: { sceneId: null, tagId: null }
};

function reducer(state, action) {
  switch (action.type) {
    case 'open':
      return {
        ...initialState,
        project: action.project,
        selection: {
          sceneId: action.project.script.document.scenes[0]?.id || null,
          tagId: null
        }
      };

    case 'close':
      return { ...initialState };

    /** Replace the breakdown, pushing the previous one onto the undo stack. */
    case 'breakdown': {
      if (!state.project || action.breakdown === state.project.breakdown) return state;
      return {
        ...state,
        project: { ...state.project, breakdown: action.breakdown },
        past: [...state.past, state.project.breakdown].slice(-HISTORY_LIMIT),
        future: []
      };
    }

    /**
     * Apply a pure transform. Running the mutation inside the reducer rather
     * than at the call site guarantees it sees the newest breakdown, which
     * matters when two edits are dispatched from the same event handler.
     */
    case 'apply': {
      if (!state.project) return state;
      const next = action.mutate(state.project.breakdown);
      if (!next || next === state.project.breakdown) return state;
      return {
        ...state,
        project: { ...state.project, breakdown: next },
        past: [...state.past, state.project.breakdown].slice(-HISTORY_LIMIT),
        future: []
      };
    }

    case 'undo': {
      if (!state.past.length) return state;
      const previous = state.past[state.past.length - 1];
      return {
        ...state,
        project: { ...state.project, breakdown: previous },
        past: state.past.slice(0, -1),
        future: [state.project.breakdown, ...state.future].slice(0, HISTORY_LIMIT)
      };
    }

    case 'redo': {
      if (!state.future.length) return state;
      const [next, ...rest] = state.future;
      return {
        ...state,
        project: { ...state.project, breakdown: next },
        past: [...state.past, state.project.breakdown].slice(-HISTORY_LIMIT),
        future: rest
      };
    }

    case 'select':
      return { ...state, selection: { ...state.selection, ...action.selection } };

    default:
      return state;
  }
}

/** Provides the project state to the tree. Consume it with `useProject`. */
export function ProjectProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const open = useCallback((scriptDoc, source) => {
    dispatch({ type: 'open', project: createProject(scriptDoc, source) });
  }, []);

  const openProject = useCallback((project) => {
    dispatch({ type: 'open', project });
  }, []);

  const close = useCallback(() => dispatch({ type: 'close' }), []);

  /**
   * Apply a pure breakdown transform.
   *
   * `mutate` receives the current breakdown and returns the next one; returning
   * the same reference is treated as a no-op and does not pollute the undo
   * stack.
   */
  const applyBreakdown = useCallback((mutate) => {
    dispatch({ type: 'apply', mutate });
  }, []);

  const setSelection = useCallback((selection) => dispatch({ type: 'select', selection }), []);
  const undo = useCallback(() => dispatch({ type: 'undo' }), []);
  const redo = useCallback(() => dispatch({ type: 'redo' }), []);

  const script = state.project?.script || null;

  // Characters and pagination depend only on the script, so tagging never
  // triggers a re-layout of the whole document.
  const characters = useMemo(() => (script ? charactersById(script) : new Map()), [script]);

  const pagination = useMemo(
    () => (script ? paginate(script, characters) : null),
    [script, characters]
  );

  const value = useMemo(
    () => ({
      project: state.project,
      script,
      breakdown: state.project?.breakdown || null,
      pagination,
      characters,
      selection: state.selection,
      canUndo: state.past.length > 0,
      canRedo: state.future.length > 0,
      open,
      openProject,
      close,
      setBreakdown: (breakdown) => dispatch({ type: 'breakdown', breakdown }),
      applyBreakdown,
      setSelection,
      undo,
      redo
    }),
    [
      state,
      script,
      pagination,
      characters,
      open,
      openProject,
      close,
      applyBreakdown,
      setSelection,
      undo,
      redo
    ]
  );

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}
