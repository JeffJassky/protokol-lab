#!/usr/bin/env node
/**
 * Sync static blog HTML nav with the canonical MARKETING_NAV list.
 *
 * Runs after vite build + prerender. Rewrites <header class="nav">…</header>
 * in each dist/blog/*.html so crawlers see the same link set as Vue pages.
 *
 * Source of truth: src/marketing-nav.js (also imported by MarketingLayout.vue).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { MARKETING_NAV } from '../src/marketing-nav.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_BLOG = path.resolve(__dirname, '..', 'dist', 'blog');

const HEADER_RE = /[ \t]*<header class="nav">[\s\S]*?<\/header>/;

function buildNavHtml() {
  const links = MARKETING_NAV
    .map((l) => `        <a href="${l.href}">${l.label}</a>`)
    .join('\n');
  return [
    '  <header class="nav">',
    '    <div class="inner">',
    '      <a href="/" class="logo"><span class="logo-dot"></span> Protokol Lab</a>',
    '      <nav aria-label="Primary">',
    links,
    '      </nav>',
    '    </div>',
    '  </header>',
  ].join('\n');
}

function injectInto(file) {
  const name = path.basename(file);
  const src = fs.readFileSync(file, 'utf8');
  if (!HEADER_RE.test(src)) {
    console.warn(`  ⚠ no <header class="nav"> in ${name} — skipped`);
    return 'skipped';
  }
  const out = src.replace(HEADER_RE, buildNavHtml());
  if (out === src) {
    console.log(`  · ${name} (already in sync)`);
    return 'unchanged';
  }
  fs.writeFileSync(file, out, 'utf8');
  console.log(`  ✓ ${name}`);
  return 'updated';
}

function main() {
  if (!fs.existsSync(DIST_BLOG)) {
    console.error(`[inject-blog-nav] ${DIST_BLOG} not found — run vite build first`);
    process.exit(1);
  }
  // Skip index.html — it's the prerendered Vue /blog route using MarketingLayout,
  // which renders its own nav from MARKETING_NAV already.
  const files = fs.readdirSync(DIST_BLOG)
    .filter((f) => f.endsWith('.html') && f !== 'index.html');
  if (!files.length) {
    console.log('[inject-blog-nav] no static blog articles');
    return;
  }
  console.log(`[inject-blog-nav] syncing ${files.length} static articles`);
  let updated = 0, unchanged = 0, skipped = 0;
  for (const f of files) {
    const result = injectInto(path.join(DIST_BLOG, f));
    if (result === 'updated') updated++;
    else if (result === 'unchanged') unchanged++;
    else skipped++;
  }
  console.log(`[inject-blog-nav] ${updated} updated, ${unchanged} already in sync, ${skipped} skipped`);
}

main();
