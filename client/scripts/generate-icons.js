#!/usr/bin/env node
/**
 * Build favicon.svg + PWA / Apple touch PNGs from the outlined PK glyph
 * (src/brand/pk-glyph.js). Black PK on brand-green background.
 *
 *   - public/favicon.svg              — vector source for browser tabs
 *   - public/icons/icon-192.png       — PWA icon (any purpose)
 *   - public/icons/icon-512.png       — PWA icon (any purpose)
 *   - public/icons/icon-maskable-*    — PWA maskable (12% safe-area)
 *   - public/icons/apple-touch-icon   — iOS home screen (8% safe-area)
 *
 * Re-run after editing pk-glyph.js or the brand colors below.
 *   node scripts/generate-icons.js
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import sharp from 'sharp';
import { PK_PATH, PK_VIEWBOX } from '../src/brand/pk-glyph.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// Brand: black PK on the same green used in OG / nav (see styles/themes.css).
const FG = '#0b0f0c';
const BG = '#5bf591';

/**
 * Build an SVG string sized to a square canvas, with the PK glyph
 * centered and scaled to leave `padPct` safe-area on every side.
 *
 * The source path lives in a 100×100 viewBox where the glyph itself
 * spans roughly y=18..62 and x=20..82 (cap height ≈ 44, full width
 * ≈ 62). We treat that 62×44 bbox as the visual mark, fit it into the
 * inner safe area, and center it on the canvas.
 */
function buildSvg({ size, bg, fg = FG, padPct }) {
  const safe = size * (1 - padPct * 2);
  // Glyph bbox inside the 100-unit source viewBox.
  const gx = 19.76;
  const gy = 18.2;
  const gw = 82.7 - 19.76;
  const gh = 62 - 18.2;
  const scale = Math.min(safe / gw, safe / gh);
  const drawW = gw * scale;
  const drawH = gh * scale;
  const offsetX = (size - drawW) / 2 - gx * scale;
  const offsetY = (size - drawH) / 2 - gy * scale;
  const bgRect = bg
    ? `<rect width="${size}" height="${size}" fill="${bg}"/>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${bgRect}<g transform="translate(${offsetX.toFixed(3)} ${offsetY.toFixed(3)}) scale(${scale.toFixed(5)})"><path d="${PK_PATH}" fill="${fg}"/></g></svg>`;
}

async function renderPng({ size, padPct, bg = BG, fg = FG }) {
  const svg = buildSvg({ size, bg, fg, padPct });
  // density: 384 oversamples the SVG so curves stay crisp; .resize pins the
  // final PNG to the requested pixel dimensions (sharp otherwise scales by
  // density vs. the SVG's nominal 72dpi, which blew up 1024 → 5461 px).
  return sharp(Buffer.from(svg), { density: 384 })
    .resize(size, size)
    .png()
    .toBuffer();
}

const outDir = resolve(ROOT, 'public/icons');
mkdirSync(outDir, { recursive: true });

// 1. favicon.svg — same look as the icons, vector for browser tabs.
//    Use the source 100-unit viewBox directly so the file stays compact.
const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${PK_VIEWBOX}" width="64" height="64"><rect width="100" height="100" fill="${BG}"/><path d="${PK_PATH}" fill="${FG}"/></svg>`;
writeFileSync(resolve(ROOT, 'public/favicon.svg'), faviconSvg);
console.log('wrote public/favicon.svg');

// 2. PNG icons. `padPct` is the safe-area padding on every side.
const targets = [
  { name: 'icon-192.png', size: 192, padPct: 0.08 },
  { name: 'icon-512.png', size: 512, padPct: 0.08 },
  { name: 'icon-maskable-192.png', size: 192, padPct: 0.18 },
  { name: 'icon-maskable-512.png', size: 512, padPct: 0.18 },
  { name: 'apple-touch-icon.png', size: 180, padPct: 0.1 },
];

for (const t of targets) {
  const buf = await renderPng({ size: t.size, padPct: t.padPct });
  writeFileSync(resolve(outDir, t.name), buf);
  console.log('wrote', t.name, t.size);
}

// 3. iOS native assets — written into the Capacitor iOS project so Xcode
//    builds use the brand mark instead of the default Capacitor logo.
//    AppIcon: green bg + black PK (matches PWA), full-bleed, no transparency
//    (Apple rejects transparent app icons). Splash: dark bg matching
//    capacitor.config.ts SplashScreen.backgroundColor with green PK glyph.
const iosAppIconDir = resolve(ROOT, 'ios/App/App/Assets.xcassets/AppIcon.appiconset');
const iosSplashDir = resolve(ROOT, 'ios/App/App/Assets.xcassets/Splash.imageset');

// Apple rejects iOS AppIcon PNGs that contain an alpha channel even when the
// image is fully opaque. Flatten to drop the alpha cleanly.
const appIconSvg = buildSvg({ size: 1024, bg: BG, fg: FG, padPct: 0.16 });
const appIconBuf = await sharp(Buffer.from(appIconSvg), { density: 384 })
  .resize(1024, 1024)
  .flatten({ background: BG })
  .png()
  .toBuffer();
writeFileSync(resolve(iosAppIconDir, 'AppIcon-512@2x.png'), appIconBuf);
console.log('wrote ios AppIcon-512@2x.png 1024');

// Splash: PK glyph small on the dark splash bg. Capacitor's Splash.imageset
// declares the same filename at 1x/2x/3x — we write identical bytes to all
// three so the launch image looks consistent across device classes.
const splashBuf = await renderPng({ size: 2732, padPct: 0.38, bg: '#0b0f0c', fg: BG });
for (const f of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
  writeFileSync(resolve(iosSplashDir, f), splashBuf);
  console.log('wrote ios', f, 2732);
}
