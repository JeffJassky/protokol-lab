// Seed the welcome-drip flow + its 7 templates into Mailery.
//
// The workbench (marketing/emails/index.html) is the design-time source.
// This script evaluates the workbench's <script> block in a sandboxed vm
// context, pulls the program array, filters to the welcome-drip flow,
// then upserts:
//   - 7 mailer_templates rows (slugs: welcome-drip-1 … welcome-drip-7)
//   - 1 mailer_flows row (slug: welcome-drip), trigger: Onboarded
//
// Idempotent — re-running overwrites the existing rows in place. Safe to
// run after every workbench edit until we migrate to mailery as canonical.
//
// Usage:
//   node src/scripts/mailery-seed-welcome-drip.js [--disabled]
//
// --disabled  Seed the flow with enabled=false so it can be reviewed in
//             /admin/mailer without firing real sends. Default: enabled.

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { startMailery, stopMailery, getMailer, isMaileryDisabled } from '../services/mailery.js';
import { childLogger, errContext } from '../lib/logger.js';

const log = childLogger('mailery-seed');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKBENCH_PATH = path.resolve(__dirname, '../../../marketing/emails/index.html');

const FROM_NAME = 'Jeff Jassky';
const MARKETING_FROM = 'jeff@news.protokollab.com';

// Workbench email id → cumulative days since flow entry. Anchors the
// wait-step computation. Keep in lockstep with marketing/emails/index.html
// welcome-drip.emails[i].label values.
const DAY_OFFSET_BY_ID = { 1: 0, 2: 2, 3: 5, 4: 7, 5: 11, 6: 14, 7: 21 };

const args = new Set(process.argv.slice(2));
const enabled = !args.has('--disabled');

function extractProgram(html) {
  const start = html.indexOf('<script>');
  const end = html.indexOf('</script>', start);
  if (start < 0 || end < 0) throw new Error('workbench: <script> block not found');
  const js = html.slice(start + '<script>'.length, end);

  // Stub the browser globals the workbench's render layer touches. We only
  // care about the data structure (program[]); the DOM bindings are no-ops.
  const noopEl = {
    textContent: 0,
    innerHTML: '',
    onclick: null,
    addEventListener: () => {},
    querySelectorAll: () => [],
    querySelector: () => null,
  };
  const sandbox = {
    document: { getElementById: () => noopEl },
    window: { scrollTo: () => {} },
    navigator: { clipboard: { writeText: () => Promise.resolve() } },
    console,
  };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(`${js};globalThis.__program = program;`, ctx);
  return ctx.__program;
}

function rationaleSummary(rationaleHtml) {
  if (!rationaleHtml) return '';
  return rationaleHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240);
}

async function main() {
  if (!process.env.MONGODB_URI) {
    log.error('MONGODB_URI not set');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI);
  log.info('mongo connected');
  await startMailery();
  if (isMaileryDisabled()) {
    log.error('mailery disabled — aborting seed');
    process.exit(1);
  }
  const mailer = getMailer();
  const { templates, flows } = mailer.collections;

  const html = fs.readFileSync(WORKBENCH_PATH, 'utf8');
  const program = extractProgram(html);
  const flow = program.find((f) => f.slug === 'welcome-drip');
  if (!flow) throw new Error('welcome-drip not found in workbench program');
  if (flow.emails.length !== 7) {
    throw new Error(`welcome-drip expected 7 emails, found ${flow.emails.length}`);
  }
  log.info({ flowSlug: flow.slug, emails: flow.emails.length, enabled }, 'seeding welcome drip');

  // -------------------- templates --------------------
  for (const email of flow.emails) {
    const slug = `welcome-drip-${email.id}`;
    const now = new Date();
    const update = {
      $set: {
        slug,
        name: email.subject,
        description: rationaleSummary(email.rationale),
        kind: 'marketing',
        fromName: FROM_NAME,
        fromEmail: MARKETING_FROM,
        replyTo: MARKETING_FROM,
        providerOverride: null,
        subject: email.subject,
        preheader: email.preheader,
        body: {
          mjml: '',
          editorJson: null,
          html: email.html,
          plainText: email.plainText,
          compiledAt: now,
        },
        variablesSchema: {},
        draft: null,
        tags: ['welcome-drip', `welcome-drip-step-${email.id}`],
        trackOpens: true,
        trackClicks: true,
        publishedAt: now,
        publishedBy: 'seed-script',
        updatedAt: now,
      },
      $setOnInsert: {
        createdAt: now,
        stats: {
          sent: 0, delivered: 0, opened: 0, clicked: 0,
          bounced: 0, complained: 0, unsubscribed: 0, lastSentAt: null,
        },
      },
    };
    await templates.updateOne({ slug }, update, { upsert: true });
    log.info({ slug, subject: email.subject }, 'template upserted');
  }

  // -------------------- flow --------------------
  const steps = [];
  flow.emails.forEach((email, i) => {
    if (i === 0) {
      steps.push({ type: 'wait', value: 30, unit: 'minutes' });
    } else {
      const prev = flow.emails[i - 1];
      const currOffset = DAY_OFFSET_BY_ID[email.id];
      const prevOffset = DAY_OFFSET_BY_ID[prev.id];
      if (currOffset == null || prevOffset == null) {
        throw new Error(`unknown email id ${email.id} or ${prev.id} — update DAY_OFFSET_BY_ID`);
      }
      const days = currOffset - prevOffset;
      steps.push({ type: 'wait', value: days, unit: 'days' });
    }
    steps.push({ type: 'send', templateSlug: `welcome-drip-${email.id}` });
  });

  const now = new Date();
  const flowUpdate = {
    $set: {
      slug: flow.slug,
      name: flow.name,
      description: flow.description,
      trigger: { type: 'event', eventName: 'Onboarded', once: true },
      enabled,
      steps,
      version: 1,
      draft: null,
      goal: 'activation',
      audience: flow.audience,
      expectedVolumePerWeek: null,
      lastTriggerScanAt: null,
      publishedAt: now,
      publishedBy: 'seed-script',
      updatedAt: now,
    },
    $setOnInsert: {
      createdAt: now,
      stats: { activeRuns: 0, completedRuns: 0, sendsTotal: 0, sendsLast7Days: 0 },
    },
  };
  await flows.updateOne({ slug: flow.slug }, flowUpdate, { upsert: true });
  log.info({ slug: flow.slug, steps: steps.length, enabled }, 'flow upserted');

  log.info({ flow: flow.slug, templates: flow.emails.length }, 'seed complete');
  await stopMailery();
  await mongoose.disconnect();
}

main().catch((err) => {
  log.fatal(errContext(err), 'seed failed');
  process.exit(1);
});
