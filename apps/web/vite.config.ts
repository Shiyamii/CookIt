import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    rolldownOptions: {
      output: {
        advancedChunks: {
          groups: [
            {
              // Zod, its configuration and the shared code stay in one chunk, in import order:
              // `zod-config` (jitless) must run before any schema is created, or Zod's `eval`
              // probe breaks the CSP. Split across chunks, the shared schemas ran first.
              name: 'core',
              test: /[\\/](zod|zod-config\.ts|packages[\\/]shared)([\\/]|$)/,
            },
          ],
        },
      },
    },
  },
  server: {
    // In dev, the API runs separately on port 3000; same origin in production.
    proxy: {
      '/api': 'http://localhost:3000',
      '/healthz': 'http://localhost:3000',
    },
  },
});
