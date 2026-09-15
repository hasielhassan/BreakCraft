import { createContext } from 'react';

/**
 * The project context lives in its own module so `useProject.jsx` exports only
 * a component, which is what React Fast Refresh needs to swap it cleanly during
 * development.
 */
export const ProjectContext = createContext(null);
