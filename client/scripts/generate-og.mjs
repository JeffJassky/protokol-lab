#!/usr/bin/env node
/**
 * Generate Open Graph preview images (1200×630 PNG) for every marketing
 * route registered in src/marketing-meta.js.
 *
 * Loads scripts/og-template.html in headless Chromium, injects the route's
 * `og` metadata via URL query params, screenshots at 2× DPR, writes to
 * public/og/<variant>.png. Adding a route = one entry in marketing-meta.js
 * (new image appears on next `npm run og` / `npm run build`).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';
import { ogVariants } from '../src/marketing-meta.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE = path.resolve(__dirname, 'og-template.html');
const OUT_DIR = path.resolve(__dirname, '..', 'public', 'og');

function templateUrl(v) {
  const params = new URLSearchParams({
    eyebrow: v.eyebrow || '',
    // Lines joined with "|" — og-template.html splits on it to render
    // multi-line headlines without needing <br/> in the registry.
    title: (v.titleLines || ['Protokol Lab']).join('|'),
    subtitle: v.subtitle || '',
    accent: v.accent || '',
    chartVariant: v.chartVariant || 'pk',
  });
  return `file://${TEMPLATE}?${params.toString()}`;
}

async function main() {
  const variants = ogVariants();
  if (!variants.length) {
    console.error('[og] no variants registered in marketing-meta.js');
    process.exit(1);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 2 });

  try {
    for (const v of variants) {
      const url = templateUrl(v);
      await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
      // Wait for webfonts so the screenshot captures the final layout.
      await page.evaluate(() => document.fonts && document.fonts.ready);
      await new Promise((r) => setTimeout(r, 150));

      const out = path.join(OUT_DIR, `${v.variant}.png`);
      await page.screenshot({
        path: out,
        type: 'png',
        clip: { x: 0, y: 0, width: 1200, height: 630 },
      });
      console.log(`  ✓ ${path.relative(path.resolve(__dirname, '..'), out)}`);
    }
    console.log(`[og] ${variants.length} images written to ${path.relative(path.resolve(__dirname, '..'), OUT_DIR)}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('[og] failed:', err);
  process.exit(1);
});
