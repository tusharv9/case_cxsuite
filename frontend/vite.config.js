import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import federation from '@originjs/vite-plugin-federation';

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    // Module Federation is only applied during build.
    // In dev mode (with no remotes configured), running the plugin causes Vite's
    // dependency optimizer to hang on [optimizer] bundling dependencies...
    ...(command === 'build'
      ? [
          federation({
            name: 'csm-host',
            remotes: {}, // No remote MFEs yet — extend here when MFEs are added
            shared: {
              react: { singleton: true, requiredVersion: '^19.2.0' },
              'react-dom': { singleton: true, requiredVersion: '^19.2.0' },
              'react-router-dom': { singleton: true, requiredVersion: '^7.0.0' },
            },
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

  // Preview (npm run preview) proxy
  preview: {
    port: 3000,
  },

  // Build settings
  build: {
    target: 'esnext', // Required by Module Federation 2.0
    minify: false, // Required for MF shared modules
  },
}));
