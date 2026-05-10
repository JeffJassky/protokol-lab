#!/usr/bin/env node
// Generate /llms.txt and /llms-full.txt for the VitePress dist.
//
// llms.txt is the proposed convention from answer.ai (Sept 2024) — a
// curated, machine-readable index of the site for LLM agents. The
// twin /llms-full.txt is the same site flattened into a single file so
// an LLM can ingest everything in one fetch.
//
// We hand-curate the section ordering so the output is deterministic and
// reads like a human-written index, then walk the rest of the markdown
// tree to fill in. Frontmatter `title` + `description` provide the
// per-link summary; falls back to the first H1 / first paragraph.
//
// Run: node scripts/generate-llms.mjs (after `vitepress build .`).

import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, '.vitepress', 'dist');
const HOSTNAME = 'https://help.protokollab.com';

// Sections in the order they should appear in llms.txt. Each section has a
// header and an optional ordering hint; pages not listed in `order` get
// appended in directory-listing order.
const SECTIONS = [
  {
    dir: 'getting-started',
    header: 'Getting started',
    order: ['index.md', 'first-week.md', 'install.md', 'migrate-myfitnesspal.md'],
  },
  {
    dir: 'tracking',
    header: 'Tracking',
    order: [
      'index.md',
      'log-a-meal.md', 'saved-meals.md', 'custom-foods.md', 'food-data-sources.md',
      'log-a-dose.md', 'custom-compounds.md', 'kinetics-shapes.md',
      'log-a-weigh-in.md', 'custom-measurements.md', 'log-a-symptom.md', 'photos.md',
      'water.md', 'fasting.md', 'exercise.md', 'cycle.md', 'journal.md',
      'bloodwork.md', 'genetics.md', 'conditions.md',
    ],
  },
  {
    dir: 'understanding',
    header: 'Understanding your data',
    order: [
      'index.md',
      'half-life.md', 'stacked-doses.md', 'endogenous-simulation.md',
      'rolling-7-day.md', 'honest-streaks.md', 'nutrition-score.md',
      'trend-and-eta.md', 'pattern-insights.md',
    ],
  },
  {
    dir: 'ai',
    header: 'AI assistant',
    order: ['index.md', 'capabilities.md', 'tool-calls.md', 'privacy.md', 'limits.md'],
  },
  {
    dir: 'account',
    header: 'Account',
    order: ['index.md', 'sign-in.md', 'plans.md', 'export.md', 'delete.md', 'security.md'],
  },
  {
    dir: 'reference',
    header: 'Reference',
    order: ['index.md', 'glossary.md', 'compounds-settings.md', 'tracking-settings.md'],
  },
];

// Parse YAML-ish frontmatter. We only need title + description, so we
// don't pull a YAML library — the frontmatter is small + machine-written.
function parseFrontmatter(src) {
  if (!src.startsWith('---\n')) return { meta: {}, body: src };
  const end = src.indexOf('\n---', 4);
  if (end < 0) return { meta: {}, body: src };
  const block = src.slice(4, end);
  const body = src.slice(end + 4).replace(/^\n/, '');
  const meta = {};
  for (const line of block.split('\n')) {
    const m = line.match(/^(\w+):\s*(.*)$/);
    if (!m) continue;
    let [, k, v] = m;
    v = v.trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    if (v.startsWith("'") && v.endsWith("'")) v = v.slice(1, -1);
    meta[k] = v;
  }
  return { meta, body };
}

// Convert a markdown file path to its public URL — VitePress strips .md
// extensions when cleanUrls: true. /index.md drops the basename entirely.
function pathToUrl(rel) {
  const noExt = rel.replace(/\.md$/, '');
  if (noExt.endsWith('/index')) {
    return '/' + noExt.slice(0, -'/index'.length) + '/';
  }
  return '/' + noExt;
}

// Pull a one-line summary from frontmatter description, or fall back to
// the first non-empty paragraph after the H1.
function summarize({ meta, body }) {
  if (meta.description) return meta.description;
  const lines = body.split('\n');
  // Skip past the first H1 if present.
  let i = 0;
  while (i < lines.length && !/^#\s/.test(lines[i])) i += 1;
  i += 1;
  while (i < lines.length && lines[i].trim() === '') i += 1;
  if (i < lines.length) {
    const para = lines[i].trim();
    // Strip leading markdown link syntax / emphasis chars for cleaner summary.
    return para.replace(/^[*_-]+|[*_-]+$/g, '').slice(0, 240);
  }
  return '';
}

async function readPage(absPath) {
  const src = await readFile(absPath, 'utf8');
  const { meta, body } = parseFrontmatter(src);
  return { meta, body };
}

async function listMd(dir) {
  let entries;
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const out = [];
  for (const name of entries) {
    if (!name.endsWith('.md')) continue;
    out.push(name);
  }
  return out;
}

function orderFiles(files, order) {
  const orderSet = new Set(order);
  const inOrder = order.filter((f) => files.includes(f));
  const extras = files.filter((f) => !orderSet.has(f)).sort();
  return [...inOrder, ...extras];
}

async function main() {
  const indexLines = [
    '# Protokol Lab Help',
    '',
    '> Self-directed help and documentation for Protokol Lab — a tracker for ' +
      'GLP-1s, peptides, food, exercise, and biomarkers, with a built-in ' +
      'physiological simulation and AI assistant. This file follows the ' +
      'llms.txt convention so AI agents can answer questions about the app ' +
      'with citations to the actual docs.',
    '',
    `Site: ${HOSTNAME}/`,
    `Sitemap: ${HOSTNAME}/sitemap.xml`,
    '',
  ];

  const fullLines = [
    `# Protokol Lab Help — full content`,
    '',
    `Source: ${HOSTNAME}/`,
    `Generated: ${new Date().toISOString()}`,
    '',
    'This file concatenates every help-doc page into a single markdown ' +
      'document for LLM context-loading. Page boundaries are marked with ' +
      '`---` separators and `Source:` URLs.',
    '',
  ];

  for (const section of SECTIONS) {
    const dir = join(ROOT, section.dir);
    const files = orderFiles(await listMd(dir), section.order);
    if (files.length === 0) continue;

    indexLines.push(`## ${section.header}`, '');
    for (const file of files) {
      const abs = join(dir, file);
      const { meta, body } = await readPage(abs);
      const url = HOSTNAME + pathToUrl(`${section.dir}/${file}`);
      const title = meta.title || section.header;
      const desc = summarize({ meta, body });
      indexLines.push(`- [${title}](${url})${desc ? `: ${desc}` : ''}`);

      // llms-full.txt: append the full page body, with frontmatter stripped.
      fullLines.push('', '---', '', `Source: ${url}`, '', body.trim(), '');
    }
    indexLines.push('');
  }

  // Root index — append last so the curated section list is readable first.
  try {
    const rootIdx = await readPage(join(ROOT, 'index.md'));
    indexLines.push('## Site root', '');
    indexLines.push(`- [Home](${HOSTNAME}/): ${summarize(rootIdx) || 'Help and docs landing page.'}`);
    indexLines.push('');
  } catch {
    /* index.md missing — skip */
  }

  await writeFile(join(DIST, 'llms.txt'), indexLines.join('\n'), 'utf8');
  await writeFile(join(DIST, 'llms-full.txt'), fullLines.join('\n'), 'utf8');

  // Brief stat output so the build log shows the result.
  const idxStat = await stat(join(DIST, 'llms.txt'));
  const fullStat = await stat(join(DIST, 'llms-full.txt'));
  console.log(
    `llms.txt        ${idxStat.size.toString().padStart(8)} B`,
  );
  console.log(
    `llms-full.txt   ${fullStat.size.toString().padStart(8)} B`,
  );
}

main().catch((err) => {
  console.error('generate-llms failed:', err);
  process.exit(1);
});
