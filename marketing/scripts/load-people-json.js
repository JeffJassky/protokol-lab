// Wipe prior people.md imports + load seed-data/people.json into
// marketing_contacts. Idempotent: re-running replaces only the
// people_md_import records — anything you've created manually stays.
//
// Run from /marketing:
//   node --env-file=../server/.env scripts/load-people-json.js

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { createDbConnection, waitForConnection } from '../src/shared/db/connection.js';
import { buildContactModel } from '../src/contacts/models/Contact.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JSON_PATH = path.resolve(__dirname, '../seed-data/people.json');
const PREFIX = 'marketing_';

if (!process.env.MONGODB_URI) {
  console.error('MONGODB_URI not set. Run with: node --env-file=../server/.env scripts/load-people-json.js');
  process.exit(1);
}

async function main() {
  const raw = fs.readFileSync(JSON_PATH, 'utf8');
  const contacts = JSON.parse(raw);
  if (!Array.isArray(contacts)) throw new Error('seed file is not an array');
  const now = new Date();
  for (const c of contacts) {
    c.source = { ...(c.source || {}), type: 'people_md_import', importedAt: now };
    if (!c.relationship) c.relationship = 'target';
    if (!c.status) c.status = 'new';
  }
  console.log(`Loaded ${contacts.length} contacts from seed-data/people.json`);

  const conn = createDbConnection({ mongoUri: process.env.MONGODB_URI, logger: console });
  await waitForConnection(conn);
  const Contact = buildContactModel(conn, PREFIX);
  await Contact.init();

  const wiped = await Contact.deleteMany({ 'source.type': 'people_md_import' });
  console.log(`Wiped ${wiped.deletedCount} prior people_md_import records.`);

  const created = await Contact.insertMany(contacts, { ordered: false });
  console.log(`Inserted ${created.length} contacts.`);

  await conn.close();
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('load failed:', err?.message || err);
  if (err?.stack) console.error(err.stack);
  process.exit(1);
});
