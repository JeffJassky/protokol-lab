#!/usr/bin/env node
/**
 * Prerender SPA marketing routes to static HTML at build time.
 *
 * Runs AFTER `vite build`:
 *   1. Spin up a tiny static server against client/dist/
 *   2. Drive headless Chromium to each SPA marketing URL (from marketing-meta)
 *   3. Wait for Vue + @unhead/vue to populate <title>/<meta>/JSON-LD
 *   4. Snapshot the rendered DOM and write it back to dist/<route>/index.html
 *   5. Express on the main app falls through to these static files before
 *      serving the SPA shell — so crawlers (Googlebot, ClaudeBot, GPTBot,
 *      PerplexityBot) get full HTML without executing JS.
 *
 * Routes come from src/marketing-meta.js (spaRoutes()). Static blog HTML is
 * already rendered ahead-of-time in public/blog/, so prerender skips those.
 *
 * Auth note: stubbed /api/auth/me returns 401 so the guest path renders.
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';
import { spaRoutes } from '../src/marketing-meta.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, '..', 'dist');
// Prerendered output lives OUTSIDE dist/ so it survives rebuilds and can be
// committed to git. Production deploys (DigitalOcean, etc.) cannot run
// Puppeteer due to missing Chromium system libs, so we bake these HTMLs
// into the repo at build time locally and the server reads them at runtime.
const PRERENDERED = path.resolve(__dirname, '..', 'prerendered');
const PORT = 4321 + Math.floor(Math.random() * 100);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico':  'image/x-icon',
  '.txt':  'text/plain; charset=utf-8',
  '.xml':  'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

function serveFile(res, filepath) {
  const ext = path.extname(filepath).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  const stream = fs.createReadStream(filepath);
  res.writeHead(200, { 'Content-Type': type });
  stream.pipe(res);
}

function start() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://localhost:${PORT}`);
      const pathname = url.pathname;

      if (pathname === '/api/auth/me') {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end('{}');
        return;
      }
      if (pathname.startsWith('/api/')) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end('{}');
        return;
      }

      const rel = pathname === '/' ? 'index.html' : pathname.slice(1);
      const full = path.join(DIST, rel);
      if (fs.existsSync(full) && fs.statSync(full).isFile()) {
        return serveFile(res, full);
      }
      // SPA fallback — the unhydrated shell.
      return serveFile(res, path.join(DIST, 'index.html'));
    });
    server.listen(PORT, () => resolve(server));
  });
}

async function snapshot(page, route) {
  const url = `http://localhost:${PORT}${route}`;
  console.log(`  → ${url}`);
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
  // Give the head manager a moment past idle — @unhead/vue may flush
  // mutations after networkidle0 fires.
  await new Promise((r) => setTimeout(r, 250));
  const html = await page.evaluate(() => '<!doctype html>\n' + document.documentElement.outerHTML);
  return html;
}

function writeRoute(route, html) {
  // "/" → prerendered/index.html
  // "/pricing" → prerendered/pricing/index.html
  const slug = route === '/' ? '' : route.replace(/^\//, '');
  const outDir = slug ? path.join(PRERENDERED, slug) : PRERENDERED;
  const outFile = path.join(outDir, 'index.html');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, html, 'utf8');
  console.log(`  ✓ wrote ${path.relative(path.resolve(__dirname, '..'), outFile)}`);
}

async function main() {
  if (!fs.existsSync(DIST)) {
    console.error(`dist/ not found at ${DIST} — run vite build first.`);
    process.exit(1);
  }

  const routes = spaRoutes();
  if (!routes.length) {
    console.error('[prerender] no SPA routes registered in marketing-meta.js');
    process.exit(1);
  }

  fs.mkdirSync(PRERENDERED, { recursive: true });

  const server = await start();
  console.log(`[prerender] static server on :${PORT}`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  try {
    for (const route of routes) {
      const html = await snapshot(page, route);
      writeRoute(route, html);
    }
    console.log(`[prerender] ${routes.length} routes written to ${path.relative(path.resolve(__dirname, '..'), PRERENDERED)}/`);
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error('[prerender] failed:', err);
  process.exit(1);
});
