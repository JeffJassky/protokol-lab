#!/usr/bin/env node
/**
 * Generate sitemap.xml from src/marketing-meta.js.
 *
 * Runs at build time and writes public/sitemap.xml (Vite copies it to
 * dist/sitemap.xml). Adding a route to the registry automatically adds a
 * <url> entry.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { sitemapEntries } from '../src/marketing-meta.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '..', 'public', 'sitemap.xml');

function xmlEscape(s) {
  return s.replace(/[<>&'"]/g, (c) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;',
  })[c]);
}

function main() {
  const entries = sitemapEntries();
  const urls = entries
    .map((e) => `  <url>
    <loc>${xmlEscape(e.loc)}</loc>
    <changefreq>${e.changefreq}</changefreq>
    <priority>${e.priority}</priority>
  </url>`)
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

  fs.writeFileSync(OUT, xml, 'utf8');
  console.log(`[sitemap] ${entries.length} URLs written to ${path.relative(path.resolve(__dirname, '..'), OUT)}`);
}

main();
