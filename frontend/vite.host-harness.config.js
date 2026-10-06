import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import federation from '@originjs/vite-plugin-federation';

// Dev-only stand-in for the Host App. Build it, serve it, and it loads the Remote's
// remoteEntry.js from http://localhost:3001 (see `npm run remote:serve`).
// See package.json scripts: `host-harness:build` / `host-harness:serve`.
export default defineConfig({
  root: 'dev-host',
  plugins: [
    react(),
    federation({
      name: 'devHost',
      remotes: {
        caseManagement: 'http://localhost:3001/assets/remoteEntry.js',
      },
      shared: {},
    }),
  ],
  build: { target: 'esnext', minify: false, outDir: 'dist', emptyOutDir: true },
  preview: { port: 3002 },
});
