import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import federation from '@originjs/vite-plugin-federation';

// https://vite.dev/config/
//
// Case Management is a Module Federation REMOTE. The Host App loads
//   <this origin>/assets/remoteEntry.js
// and consumes the modules listed in `exposes`. The same build also works standalone
// (index.html + src/main.jsx) so local development does not need a Host.
export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    // Module Federation is only applied during build.
    // In dev mode the plugin makes Vite's dependency optimizer hang on
    // "[optimizer] bundling dependencies...", so `npm run dev` runs plain Vite (standalone).
    ...(command === 'build'
      ? [
          federation({
            name: 'caseManagement',
            filename: 'remoteEntry.js',
            // The Remote is SELF-CONTAINED: it renders into its own React root with its own
            // React and Router, so it neither shares nor depends on the Host's React/router
            // versions (and cannot crash the Host with a duplicate-React or nested-router error).
            // The only thing crossing the boundary is this function and plain props.
            exposes: {
              './mount': './src/remote/mount.jsx',
            },
            shared: {},
          }),
        ]
      : []),
  ],

  // Pre-bundle major dependencies to ensure fast dev server cold starts without stalls
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react-router-dom',
      'axios',
      'lucide-react',
    ],
  },

  // Development proxy — avoids CORS when calling the .NET backend
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:5110',
        changeOrigin: true,
        secure: false,
      },
    },
  },

  // Preview (npm run preview) — also serves remoteEntry.js to a Host with permissive CORS,
  // because the Host loads this origin's scripts from a different origin.
  preview: {
    port: 3001,
    cors: true,
  },

  // Build settings
  build: {
    target: 'esnext', // Required by Module Federation
    minify: false, // Required by @originjs/vite-plugin-federation for shared modules
    cssCodeSplit: false, // One stylesheet so the Host loads everything via the entry
  },
}));
