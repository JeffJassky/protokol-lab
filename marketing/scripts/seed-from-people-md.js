// Parse marketing/people.md and bulk-insert each entry as a Contact in
// the suite's Mongo collection (`marketing_contacts`).
//
// Run from /marketing:
//   node --env-file=../server/.env scripts/seed-from-people-md.js
//
// Idempotent: contacts are upserted by normalized name. Re-running merges
// new presences without duplicating records.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { createDbConnection, waitForConnection } from '../src/shared/db/connection.js';
import { buildContactModel } from '../src/contacts/models/Contact.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PEOPLE_MD = path.resolve(__dirname, '../people.md');
const PREFIX = 'marketing_';

if (!process.env.MONGODB_URI) {
  console.error('MONGODB_URI not set. Run with: node --env-file=../server/.env scripts/seed-from-people-md.js');
  process.exit(1);
}

// ──────────────────────────────────────────────────────────────────────
// Audience parsing — handles "10k-30k", "Est. 30k–80k", "~79.9K",
// "100k+", "10,000-100,000", "Active Contributor". Returns a normalized
// numeric estimate (upper bound when range) plus the verbatim string.
// ──────────────────────────────────────────────────────────────────────

function parseAudience(raw) {
  if (!raw) return { audienceSize: null, audienceSizeRaw: null, audienceConfidence: null };
  const text = String(raw).trim();
  if (/Active Contributor/i.test(text)) {
    return { audienceSize: null, audienceSizeRaw: text, audienceConfidence: 'low' };
  }
  // Range: "10k-30k", "30,000-80,000", "10k–30k" (en dash)
  const range = text.match(/(\d[\d,.]*)[kKmM]?\s*[-–—]\s*(\d[\d,.]*)\s*([kKmM])?/);
  if (range) {
    const upper = toNumber(range[2], range[3] || endingMagnitude(range[1] + (range[3] || '')));
    return { audienceSize: upper, audienceSizeRaw: text, audienceConfidence: 'medium' };
  }
  // Tilde estimate: "~79.9K", "~36.9K"
  const tilde = text.match(/~?\s*(\d[\d,.]*)\s*([kKmM])/);
  if (tilde) {
    return { audienceSize: toNumber(tilde[1], tilde[2]), audienceSizeRaw: text, audienceConfidence: 'high' };
  }
  // Plus: "100k+", "200k+"
  const plus = text.match(/(\d[\d,.]*)\s*([kKmM])\+/);
  if (plus) {
    return { audienceSize: toNumber(plus[1], plus[2]), audienceSizeRaw: text, audienceConfidence: 'low' };
  }
  // Plain number: "109K"
  const plain = text.match(/(\d[\d,.]*)\s*([kKmM])/);
  if (plain) {
    return { audienceSize: toNumber(plain[1], plain[2]), audienceSizeRaw: text, audienceConfidence: 'medium' };
  }
  return { audienceSize: null, audienceSizeRaw: text, audienceConfidence: 'low' };
}

function toNumber(numStr, magnitude) {
  const n = parseFloat(String(numStr).replace(/,/g, ''));
  if (!Number.isFinite(n)) return null;
  const m = String(magnitude || '').toLowerCase();
  if (m === 'k') return Math.round(n * 1000);
  if (m === 'm') return Math.round(n * 1_000_000);
  return Math.round(n);
}

function endingMagnitude(s) {
  const m = String(s).match(/([kKmM])\s*$/);
  return m ? m[1].toLowerCase() : '';
}

// ──────────────────────────────────────────────────────────────────────
// URL extraction
// ──────────────────────────────────────────────────────────────────────

function extractUrl(text) {
  if (!text) return null;
  const m = text.match(/https?:\/\/[^\s)\]]+/);
  if (m) return m[0].replace(/[.,;]+$/, '');
  // Bare domain (e.g. "onthepen.com")
  const bare = text.match(/\b([a-z0-9-]+\.(?:com|co|io|net|org|app|substack\.com|dev|me))\b/i);
  if (bare) return `https://${bare[1]}`;
  return null;
}

function extractRedditHandle(text) {
  // "u/foo" or "Reddit: u/foo"
  const m = text.match(/u\/([A-Za-z0-9_-]+)/);
  return m ? m[1].toLowerCase() : null;
}

function extractYoutubeHandle(text) {
  const m = text.match(/youtube\.com\/(@[A-Za-z0-9_-]+|c\/[^\s/]+|channel\/[A-Za-z0-9_-]+)/i);
  return m ? m[1] : null;
}

// ──────────────────────────────────────────────────────────────────────
// Conflict / sponsorship flag extraction
// ──────────────────────────────────────────────────────────────────────

function extractConflicts(text) {
  const conflicts = [];
  // Lines with ⚠️ marker
  const warns = text.matchAll(/⚠️[^.]*?(?:_([^_]+)_|\.([^.]+))/g);
  for (const w of warns) conflicts.push((w[1] || w[2] || '').trim());
  // "Sponsor:" or "Conflict:" lines
  const sponsor = text.match(/Sponsor[s]?:\s*([^.]*?)(?:\.|$)/i);
  if (sponsor) {
    const txt = sponsor[1].trim();
    if (!/non-pharma/i.test(txt)) conflicts.push(`Sponsor: ${txt}`);
  }
  return conflicts.filter(Boolean);
}

// ──────────────────────────────────────────────────────────────────────
// Section parsers
// ──────────────────────────────────────────────────────────────────────

const NORMALIZE_NAME_RE = /\s+/g;
function normalizeName(name) {
  return String(name)
    .replace(/\s+(—|-)\s+.*$/, '') // drop "— Show Name" suffix
    .replace(/\s*\(.*?\)\s*/g, ' ')
    .replace(NORMALIZE_NAME_RE, ' ')
    .trim();
}

// Bullet list rows: "1. **Name [— Show]** | thing | thing | focus..."
function parseBulletEntries(section, defaultPlatform, defaultRole) {
  const lines = section.split('\n');
  const entries = [];
  for (const line of lines) {
    const m = line.match(/^\s*\d+\.\s+\*\*([^*]+)\*\*\s*\|\s*(.*)$/);
    if (!m) continue;
    const fullName = m[1].trim();
    const rest = m[2];
    const cells = rest.split('|').map((c) => c.trim());
    // Cells often: [link/show, audience, focus] OR [audience, focus]
    let url = null;
    let audienceText = null;
    let focus = null;
    if (cells.length >= 3) {
      url = extractUrl(cells[0]);
      audienceText = cells[1];
      focus = cells.slice(2).join(' | ');
    } else if (cells.length === 2) {
      audienceText = cells[0];
      focus = cells[1];
    } else {
      focus = cells[0];
    }
    if (!url) url = extractUrl(line);

    const name = normalizeName(fullName);
    const handle = guessHandle(defaultPlatform, fullName, url);
    const audience = parseAudience(audienceText);
    const conflicts = extractConflicts(line);

    entries.push({
      name,
      sourceLine: line.trim(),
      presence: {
        platform: defaultPlatform,
        handle,
        url,
        role: defaultRole,
        ...audience,
      },
      niche: focus || null,
      conflicts,
    });
  }
  return entries;
}

// Markdown table rows. Columns vary by table; we read the header to map
// columns by name (case-insensitive).
function parseTableEntries(section, defaultPlatform, defaultRole) {
  const lines = section.split('\n').filter((l) => l.includes('|'));
  if (lines.length < 3) return [];
  // First pipe-line is header, second is divider, rest are rows
  const header = splitRow(lines[0]).map((h) => h.toLowerCase());
  const nameIdx = header.findIndex((h) => /name/.test(h));
  const platformIdx = header.findIndex((h) => /platform|show|publication|channel|community/.test(h));
  const linkIdx = header.findIndex((h) => /link|source|url/.test(h));
  const audienceIdx = header.findIndex((h) => /audience|subscriber|size/.test(h));
  const focusIdx = header.findIndex((h) => /focus|core focus|differentiator/.test(h));
  if (nameIdx < 0) return [];

  const entries = [];
  for (let i = 2; i < lines.length; i++) {
    const cells = splitRow(lines[i]);
    if (cells.length < 2) continue;
    const fullName = cells[nameIdx];
    if (!fullName || /^[-—]+$/.test(fullName)) continue;
    const platformText = platformIdx >= 0 ? cells[platformIdx] : '';
    const linkText = linkIdx >= 0 ? cells[linkIdx] : '';
    const audienceText = audienceIdx >= 0 ? cells[audienceIdx] : null;
    const focusText = focusIdx >= 0 ? cells[focusIdx] : null;

    const url = extractUrl(linkText) || extractUrl(platformText);
    const handle = guessHandle(defaultPlatform, fullName, url) || extractRedditHandle(linkText);

    const name = normalizeName(fullName);
    const audience = parseAudience(audienceText);
    const conflicts = extractConflicts(lines[i]);

    entries.push({
      name,
      sourceLine: lines[i].trim(),
      presence: {
        platform: defaultPlatform,
        handle,
        url,
        role: defaultRole,
        ...audience,
      },
      niche: focusText,
      conflicts,
    });
  }
  return entries;
}

function splitRow(line) {
  return line
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split('|')
    .map((c) => c.trim());
}

function guessHandle(platform, fullName, url) {
  if (!url && !fullName) return null;
  if (platform === 'reddit') {
    const m = (url || '').match(/reddit\.com\/r\/([A-Za-z0-9_-]+)/);
    if (m) return m[1].toLowerCase();
    return extractRedditHandle(fullName);
  }
  if (platform === 'youtube' && url) {
    const m = url.match(/youtube\.com\/(@[A-Za-z0-9_-]+|c\/[^/]+|channel\/[A-Za-z0-9_-]+)/i);
    if (m) return m[1].toLowerCase();
  }
  if (platform === 'substack' && url) {
    const m = url.match(/^https?:\/\/([a-z0-9-]+)\.substack\.com/i);
    if (m) return m[1].toLowerCase();
  }
  if (platform === 'podcast' && url) {
    try {
      return new URL(url).host.replace(/^www\./, '').toLowerCase();
    } catch {}
  }
  return null;
}

// ──────────────────────────────────────────────────────────────────────
// Section dispatch — split people.md by ## headers, route each to the
// appropriate parser.
// ──────────────────────────────────────────────────────────────────────

const SECTION_DISPATCH = [
  // Bullet-list sections at the top of people.md
  { match: /^### PODCAST HOSTS/i, parser: 'bullet', platform: 'podcast', role: 'host' },
  { match: /^### SUBSTACK WRITERS/i, parser: 'bullet', platform: 'substack', role: 'writer' },
  { match: /^### YOUTUBERS/i, parser: 'bullet', platform: 'youtube', role: 'host' },
  // Markdown tables further down
  { match: /Mid-Tier Podcast/i, parser: 'table', platform: 'podcast', role: 'host' },
  { match: /Substack Operators/i, parser: 'table', platform: 'substack', role: 'writer' },
  { match: /Visual Bio-Experimenters/i, parser: 'table', platform: 'youtube', role: 'host' },
  { match: /Decentralized Clinical Trialists|Reddit Ecosystem/i, parser: 'table', platform: 'reddit', role: 'commenter' },
];

function splitSections(md) {
  // Split on lines starting with ## or ### that are followed by content
  const blocks = md.split(/\n(?=##\s|###\s)/);
  return blocks
    .map((block) => {
      const headerLine = block.split('\n')[0];
      return { header: headerLine, body: block };
    })
    .filter((b) => b.header.startsWith('##') || b.header.startsWith('###'));
}

function classificationFromPlatform(platform) {
  if (platform === 'reddit') return 'creator';
  return 'creator';
}

function rolesFromPlatform(platform) {
  if (platform === 'podcast') return ['podcaster'];
  if (platform === 'substack') return ['substack-writer', 'newsletter-author'];
  if (platform === 'youtube') return ['youtuber'];
  if (platform === 'reddit') return ['redditor'];
  return [];
}

function primaryRoleFromPlatform(platform) {
  return rolesFromPlatform(platform)[0] || null;
}

// ──────────────────────────────────────────────────────────────────────
// Aggregate + dedupe
// ──────────────────────────────────────────────────────────────────────

function aggregate(rawEntries) {
  const byKey = new Map();
  for (const e of rawEntries) {
    const key = e.name.toLowerCase();
    if (!byKey.has(key)) {
      byKey.set(key, {
        name: e.name,
        relationship: 'target',
        classification: classificationFromPlatform(e.presence.platform),
        primaryRole: primaryRoleFromPlatform(e.presence.platform),
        roles: [...rolesFromPlatform(e.presence.platform)],
        niche: e.niche,
        tags: ['glp1', 'peptides', 'biohacking'],
        presences: [],
        conflicts: [],
        source: { type: 'people_md_import', importedAt: new Date(), note: 'seeded from marketing/people.md' },
        status: 'new',
      });
    }
    const c = byKey.get(key);
    // Merge presences (skip dupes by platform+url)
    if (
      !c.presences.some(
        (p) => p.platform === e.presence.platform && (p.url === e.presence.url || (p.handle && p.handle === e.presence.handle))
      )
    ) {
      c.presences.push({ ...e.presence, isPrimary: c.presences.length === 0 });
    }
    // Merge roles
    for (const r of rolesFromPlatform(e.presence.platform)) {
      if (!c.roles.includes(r)) c.roles.push(r);
    }
    // Merge conflicts
    for (const cf of e.conflicts || []) {
      if (cf && !c.conflicts.includes(cf)) c.conflicts.push(cf);
    }
    // Take niche from first entry that has one
    if (!c.niche && e.niche) c.niche = e.niche;
  }
  return Array.from(byKey.values());
}

// ──────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────

async function main() {
  const md = fs.readFileSync(PEOPLE_MD, 'utf8');
  const sections = splitSections(md);

  const raw = [];
  for (const sec of sections) {
    const dispatch = SECTION_DISPATCH.find((d) => d.match.test(sec.header));
    if (!dispatch) continue;
    const fn = dispatch.parser === 'table' ? parseTableEntries : parseBulletEntries;
    const parsed = fn(sec.body, dispatch.platform, dispatch.role);
    raw.push(...parsed);
    console.log(`  ${dispatch.parser.padEnd(6)} ${dispatch.platform.padEnd(8)} → ${parsed.length} entries from "${sec.header.slice(0, 60)}"`);
  }

  console.log(`\nParsed ${raw.length} raw rows from ${sections.length} sections`);

  const contacts = aggregate(raw);
  console.log(`Aggregated to ${contacts.length} unique contacts after dedupe by name\n`);

  // Connect + insert
  const conn = createDbConnection({ mongoUri: process.env.MONGODB_URI, logger: console });
  await waitForConnection(conn);
  const Contact = buildContactModel(conn, PREFIX);
  await Contact.init();

  let inserted = 0;
  let merged = 0;
  for (const c of contacts) {
    const existing = await Contact.findOne({ name: new RegExp(`^${escapeRegex(c.name)}$`, 'i') });
    if (!existing) {
      await Contact.create(c);
      inserted++;
    } else {
      // Merge new presences + roles + conflicts onto existing record
      let dirty = false;
      for (const p of c.presences) {
        if (
          !existing.presences.some(
            (ep) => ep.platform === p.platform && (ep.url === p.url || (ep.handle && ep.handle === p.handle))
          )
        ) {
          existing.presences.push(p);
          dirty = true;
        }
      }
      for (const r of c.roles) {
        if (!existing.roles?.includes(r)) {
          existing.roles = [...(existing.roles || []), r];
          dirty = true;
        }
      }
      for (const cf of c.conflicts) {
        if (!existing.conflicts?.includes(cf)) {
          existing.conflicts = [...(existing.conflicts || []), cf];
          dirty = true;
        }
      }
      if (dirty) {
        await existing.save();
        merged++;
      }
    }
  }

  console.log(`\nDone — ${inserted} new contacts inserted, ${merged} existing merged.`);
  await conn.close();
  await mongoose.disconnect();
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

main().catch((err) => {
  console.error('seed failed:', err);
  process.exit(1);
});
