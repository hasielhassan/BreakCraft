import { readFileSync } from 'fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * GitHub Pages serves the app from a subpath (`/BreakCraft/`), so `base` must be
 * set or every asset URL 404s. Override with `BREAKCRAFT_BASE=/` when deploying
 * to a domain root.
 */
const base = process.env.BREAKCRAFT_BASE || '/BreakCraft/';
const appVersion = JSON.parse(readFileSync('./package.json', 'utf-8')).version;

export default defineConfig({
  base,
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion)
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2022'
  },
  server: {
    port: Number(process.env.PORT) || 5173,
    open: true
  }
});
