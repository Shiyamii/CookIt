import { copyFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const demoStub = (name: string) =>
  fileURLToPath(new URL(`./src/demo/stubs/${name}`, import.meta.url));

/**
 * Demo build: the server's controllers and services run in the page. Two of their modules only
 * make sense in Node and are replaced: the environment settings, read when the module loads, and
 * the socket address.
 */
function demoStubs(): Plugin {
  return {
    name: 'cookit-demo-stubs',
    enforce: 'pre',
    // GitHub Pages answers unknown paths with 404.html: the app itself, which routes them.
    writeBundle(options) {
      if (options.dir) copyFileSync(`${options.dir}/index.html`, `${options.dir}/404.html`);
    },
    resolveId(source, importer) {
      if (source === '@hono/node-server/conninfo') return demoStub('conninfo.ts');
      if (!importer || !source.startsWith('.')) return null;
      const target = resolve(dirname(importer), source).replace(/\\/g, '/');
      return target.endsWith('/apps/server/src/env') ? demoStub('env.ts') : null;
    },
  };
}

export default defineConfig(({ mode }) => ({
  // The demo is served from a sub-path (GitHub Pages: /<repository>/).
  base: mode === 'demo' ? (process.env.DEMO_BASE ?? '/') : '/',
  define: mode === 'demo' ? { 'import.meta.env.VITE_DEMO': JSON.stringify('1') } : {},
  plugins: [
    ...(mode === 'demo' ? [demoStubs()] : []),
    react(),
    tailwindcss(),
    // Installable app and offline use (plan §5.5): our own service worker (src/sw/sw.ts, also
    // the Web Push handler), the build's files precached, registered by the app itself. Not in
    // the demo (no server behind it).
    ...(mode === 'demo'
      ? []
      : [
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
              description:
                'Self-hosted recipe book: recipes, servings, step-by-step cooking with timers',
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
        ]),
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
}));
