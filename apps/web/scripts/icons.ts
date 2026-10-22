// Tooling script (Node, not shipped): draws the PWA icons from `icons/glyph.svg` into `public/`
// with Playwright's Chromium (no image library needed). Run again after changing the glyph or
// the colors: node apps/web/scripts/icons.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const root = join(import.meta.dirname, '..');
const glyph = readFileSync(join(root, 'icons/glyph.svg'), 'utf8').replace(/<!--.*?-->\s*/s, '');

// Theme `--primary` and `--primary-foreground` (src/index.css), as sRGB.
const BACKGROUND = '#afbea5';
const FOREGROUND = '#000000';

/**
 * An icon of `size` px: `radius` rounds the background (0: square, full bleed for "maskable"),
 * `scale` is the glyph size relative to the icon (maskable icons keep it inside the safe zone).
 */
function svg(options: { radius: number; scale: number; background?: string; color: string }) {
  const offset = (24 - 24 / options.scale) / 2;
  const box = 24 / options.scale;
  const background = options.background
    ? `<rect x="${offset}" y="${offset}" width="${box}" height="${box}" rx="${(box * options.radius) / 100}" fill="${options.background}" />`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${offset} ${offset} ${box} ${box}">${background}<g stroke="${options.color}">${glyph}</g></svg>`;
}

const ICONS = [
  { file: 'pwa-192x192.png', size: 192, radius: 22, scale: 0.62, background: BACKGROUND },
  { file: 'pwa-512x512.png', size: 512, radius: 22, scale: 0.62, background: BACKGROUND },
  { file: 'maskable-512x512.png', size: 512, radius: 0, scale: 0.5, background: BACKGROUND },
  {
    file: 'apple-touch-icon-180x180.png',
    size: 180,
    radius: 0,
    scale: 0.58,
    background: BACKGROUND,
  },
  // Android status bar badge: only the alpha channel is used.
  { file: 'badge-96x96.png', size: 96, radius: 0, scale: 0.8, color: '#ffffff' },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const icon of ICONS) {
  await page.setViewportSize({ width: icon.size, height: icon.size });
  const markup = svg({ ...icon, color: icon.color ?? FOREGROUND });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${markup.replace('<svg ', `<svg width="${icon.size}" height="${icon.size}" `)}</body></html>`,
  );
  writeFileSync(join(root, 'public', icon.file), await page.screenshot({ omitBackground: true }));
}
await browser.close();

writeFileSync(
  join(root, 'public/favicon.svg'),
  svg({ radius: 22, scale: 0.62, background: BACKGROUND, color: FOREGROUND }) + '\n',
);
console.log('Icons written to apps/web/public/');
