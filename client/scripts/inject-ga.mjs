#!/usr/bin/env node
/**
 * One-shot patcher: inject GA gtag snippet into every prerendered HTML file.
 * Idempotent — skips files that already contain the measurement ID.
 * The SPA source (client/index.html) is the canonical place for new builds;
 * this script only patches the already-baked prerendered/ HTMLs in the repo.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', 'prerendered');
const GA_ID = 'G-45RY2J3PX4';

const SNIPPET = `
    <!-- Google tag (gtag.js) -->
    <script async src="https://www.googletagmanager.com/gtag/js?id=${GA_ID}"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', '${GA_ID}');
    </script>
  `;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

const files = walk(ROOT);
let patched = 0, skipped = 0;
for (const file of files) {
  const html = fs.readFileSync(file, 'utf8');
  if (html.includes(GA_ID)) { skipped++; continue; }
  if (!html.includes('</head>')) {
    console.warn(`  ! no </head> in ${path.relative(ROOT, file)} — skipping`);
    skipped++;
    continue;
  }
  const next = html.replace('</head>', `${SNIPPET}</head>`);
  fs.writeFileSync(file, next, 'utf8');
  patched++;
  console.log(`  ✓ ${path.relative(ROOT, file)}`);
}
console.log(`\npatched ${patched}, skipped ${skipped}, total ${files.length}`);
