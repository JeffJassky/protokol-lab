import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const svgPath = resolve(root, 'public/favicon.svg');
const outDir = resolve(root, 'public/icons');

const svg = readFileSync(svgPath);

const BG = '#4f46e5';

async function renderSquare(size, { bg = null, padPct = 0 } = {}) {
  const inner = Math.round(size * (1 - padPct * 2));
  const offset = Math.round((size - inner) / 2);
  const rendered = await sharp(svg, { density: 384 })
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const base = bg
    ? sharp({ create: { width: size, height: size, channels: 4, background: bg } })
    : sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } });

  return base
    .composite([{ input: rendered, left: offset, top: offset }])
    .png()
    .toBuffer();
}

const targets = [
  { name: 'icon-192.png', size: 192, bg: null, padPct: 0 },
  { name: 'icon-512.png', size: 512, bg: null, padPct: 0 },
  { name: 'icon-maskable-192.png', size: 192, bg: BG, padPct: 0.12 },
  { name: 'icon-maskable-512.png', size: 512, bg: BG, padPct: 0.12 },
  { name: 'apple-touch-icon.png', size: 180, bg: BG, padPct: 0.08 },
];

for (const t of targets) {
  const buf = await renderSquare(t.size, { bg: t.bg, padPct: t.padPct });
  writeFileSync(resolve(outDir, t.name), buf);
  console.log('wrote', t.name, t.size);
}
