import { useContext } from 'react';
import { ProjectContext } from './project-context.js';

/** Access the current project, its derived pagination, and the mutators. */
export function useProject() {
  const context = useContext(ProjectContext);
  if (!context) throw new Error('useProject must be used inside a ProjectProvider');
  return context;
}
