import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Installable app and offline use (plan §5.5): our own service worker (src/sw/sw.ts, also
    // the Web Push handler), the build's files precached, registered by the app itself.
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src/sw',
      filename: 'sw.ts',
      injectRegister: false,
      registerType: 'autoUpdate',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,woff2,svg,png}'],
      },
      manifest: {
        name: 'CookIt',
        short_name: 'CookIt',
        description: 'Recipes, scaling and cooking mode with timers',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        // Theme `--background` and `--primary` (src/index.css), as sRGB.
        background_color: '#fdfdfd',
        theme_color: '#afbea5',
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
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
