import React from 'react';
import { ProjectProvider } from './hooks/useProject.jsx';
import { AppShell } from './features/AppShell.jsx';
import { ErrorBoundary } from './features/ErrorBoundary.jsx';

export default function App() {
  return (
    <ErrorBoundary>
      <ProjectProvider>
        <AppShell />
      </ProjectProvider>
    </ErrorBoundary>
  );
}
