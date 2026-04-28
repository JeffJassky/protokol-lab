// AI-driven importer for marketing/people.md.
//
// Hands the entire markdown doc to Claude (via the Agent SDK / your
// Claude Code login) with a structured-output prompt. Claude returns a
// JSON array of Contact records; we insert them directly into the
// suite's `marketing_contacts` collection.
//
// Run from /marketing:
//   node --env-file=../server/.env scripts/seed-from-people-md-ai.js
//
// Idempotent-ish: deletes any prior `source.type === 'people_md_import'`
// records before inserting. Hand-created or otherwise-sourced contacts
// are untouched.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { createDbConnection, waitForConnection } from '../src/shared/db/connection.js';
import { buildContactModel } from '../src/contacts/models/Contact.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PEOPLE_MD = path.resolve(__dirname, '../people.md');
const PREFIX = 'marketing_';

if (!process.env.MONGODB_URI) {
  console.error('MONGODB_URI not set. Run with: node --env-file=../server/.env scripts/seed-from-people-md-ai.js');
  process.exit(1);
}

const SYSTEM_PROMPT = `You are extracting structured Contact records from a marketing research document. The document mixes formats — bullet lists, tables, prose — and contains some subjective notes ("estimated audience", "may exceed your cap", "⚠️ conflict") that should NOT be silently dropped.

Output STRICTLY valid JSON: an array of Contact objects. No prose outside the array. No markdown code fences.

Each Contact has this shape:

{
  "name": "string",                       // Real human name. If a row lists co-hosts ("X & Y"), emit ONE Contact per person.
  "displayHandle": "string|null",         // e.g. "@onthepen" if the doc shows one
  "relationship": "target",
  "classification": "creator" | "journalist" | "influencer" | "company" | "partner" | "prospect" | "other",
  "primaryRole": "podcaster" | "substack-writer" | "youtuber" | "blogger" | "redditor" | "instagrammer" | "tiktoker" | "x-poster" | "journalist" | "contributing-writer" | "newsletter-author" | "clinician" | "researcher" | "founder" | "other",
  "roles": ["..."],                       // multi — every role that applies
  "bio": "string|null",                   // one-sentence summary (your own writing OK)
  "niche": "string",                      // long-form differentiator. Strip markdown emphasis chars (* _) but keep the substance.
  "tags": ["..."],                        // 3-6 short topical tags, lowercase, hyphenated. Examples: "glp1", "peptides", "rd", "female-focused", "biohacking"
  "presences": [
    {
      "platform": "podcast" | "substack" | "youtube" | "x" | "instagram" | "tiktok" | "reddit" | "blog" | "website" | "linkedin" | "apple-podcasts" | "spotify" | "rss" | "other",
      "handle": "string|null",            // bare handle without @ or u/ — lowercase
      "url": "string|null",               // absolute URL when available
      "role": "host" | "writer" | "author" | "commenter" | "owner" | null,
      "audienceSize": <integer>|null,     // best-estimate single number (use upper bound for ranges, exact when given)
      "audienceSizeRaw": "string|null",   // verbatim source phrase ("10k-30k", "~79.9K", "Est. 30k–80k", etc.)
      "audienceConfidence": "low" | "medium" | "high",
      "isPrimary": <boolean>              // exactly one presence per Contact should be true
    }
  ],
  "conflicts": ["..."],                   // sponsorship/commercial conflicts. Include ALL ⚠️-flagged notes verbatim (minus the warning emoji). Include "Sponsor: X" lines even when noted as non-pharma — the user wants visibility on commercial relationships.
  "source": { "type": "people_md_import" }
}

CRITICAL RULES:
- One person per Contact. Co-hosts get separate Contacts (same show appears as a presence on each).
- A person who shows up across multiple sections (e.g. Dave Knapp listed under both PODCAST HOSTS and SUBSTACK WRITERS) is ONE Contact with multiple presences.
- Strip markdown emphasis (* _ **) from niche/bio text but preserve the meaning.
- Don't invent data. If audience is missing, set audienceSize to null.
- For Reddit "Active Contributor" entries, set audienceSize to null and audienceConfidence to "low". Set platform: "reddit", handle: the username.
- Drop the "Unnamed Host" entries — we can't reach a person without a name.
- Tags should reflect topical focus (e.g. "glp1", "peptides", "biohacking", "quantified-self") not platform.

Return the JSON array. Nothing else.`;

async function callAgent(userPrompt) {
  let text = '';
  let costUsd = 0;
  for await (const message of query({
    prompt: userPrompt,
    options: {
      systemPrompt: SYSTEM_PROMPT,
      // No tools needed — pure reasoning over the input doc.
      allowedTools: [],
      permissionMode: 'bypassPermissions',
      model: 'sonnet',
      maxTurns: 1,
    },
  })) {
    if (message.type === 'assistant') {
      for (const b of message.message?.content || []) {
        if (b.type === 'text') text += b.text;
      }
    } else if (message.type === 'result') {
      costUsd = message.total_cost_usd ?? 0;
    }
  }
  return { text, costUsd };
}

function extractJsonArray(text) {
  // Try fenced first, then bare array
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    try { return JSON.parse(fenced[1]); } catch {}
  }
  const arr = text.match(/\[[\s\S]*\]/);
  if (arr) {
    try { return JSON.parse(arr[0]); } catch {}
  }
  throw new Error('could not extract JSON array from model output');
}

async function main() {
  const md = fs.readFileSync(PEOPLE_MD, 'utf8');
  console.log(`Read people.md (${md.length} chars). Calling Claude…`);

  const { text, costUsd } = await callAgent(
    `Here is marketing/people.md. Extract every individual person into the JSON array per the system prompt. Do not skip rows unless they are explicitly unnamed.\n\n---\n\n${md}`
  );
  console.log(`Model returned ${text.length} chars. Cost: $${costUsd.toFixed(4)}`);

  let contacts;
  try {
    contacts = extractJsonArray(text);
  } catch (err) {
    console.error('Failed to parse model output. First 500 chars:\n', text.slice(0, 500));
    throw err;
  }
  if (!Array.isArray(contacts)) throw new Error('model did not return an array');
  console.log(`Parsed ${contacts.length} Contact records from model output.`);

  // Stamp source + ensure required fields
  const now = new Date();
  for (const c of contacts) {
    c.source = { type: 'people_md_import', importedAt: now, note: 'AI extraction via people.md' };
    if (!c.tags) c.tags = [];
    if (!c.relationship) c.relationship = 'target';
    if (!c.status) c.status = 'new';
  }

  const conn = createDbConnection({ mongoUri: process.env.MONGODB_URI, logger: console });
  await waitForConnection(conn);
  const Contact = buildContactModel(conn, PREFIX);
  await Contact.init();

  const wiped = await Contact.deleteMany({ 'source.type': 'people_md_import' });
  console.log(`Wiped ${wiped.deletedCount} prior people_md_import records.`);

  const created = await Contact.insertMany(contacts, { ordered: false });
  console.log(`\nInserted ${created.length} contacts.`);

  await conn.close();
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('seed failed:', err?.message || err);
  if (err?.stack) console.error(err.stack);
  process.exit(1);
});
