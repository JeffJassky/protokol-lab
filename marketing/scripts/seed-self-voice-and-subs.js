// Configures Jeff's `relationship:'self'` Contact (presences + voiceProfile)
// and seeds 5 MonitoredSubreddits pointing at that voice.
//
// Voice content derived from:
//   plans/blog/founder-background.md
//   plans/blog/building-adhd-friendly-nutrition-tracker.md
//
// Run from /marketing:
//   node --env-file=../server/.env scripts/seed-self-voice-and-subs.js
//
// Idempotent. Safe to re-run — upserts by name (Contact) and subreddit slug.

import mongoose from 'mongoose';
import { createDbConnection, waitForConnection } from '../src/shared/db/connection.js';
import { buildContactModel } from '../src/contacts/models/Contact.js';
import { buildMonitoredSubredditModel } from '../src/modules/redditEngagement/models/MonitoredSubreddit.js';

const PREFIX = 'marketing_';
const SELF_NAME = 'Jeff Jassky';
const REDDIT_HANDLE = 'jeffjassky';

if (!process.env.MONGODB_URI) {
  console.error('MONGODB_URI not set. Run with: node --env-file=../server/.env scripts/seed-self-voice-and-subs.js');
  process.exit(1);
}

const VOICE_DESCRIPTION = `
I'm Jeff — 39, software developer for 20+ years (self-taught, started in big media, built a lot of stuff in the music industry and e-commerce, now mostly biohacking + my own tools). ADHD-inattentive, didn't get diagnosed until ~37. The kind of person who can lock into code for 18 hours and forget to eat, then go six weeks without remembering to take a daily supplement.

Weight history is lifelong. Peaked around 315, dropped 115 by diet + biking ~100mi/week + treadmill workouts where I'd DJ my own music to hold the BPM. Got down to 200, then stress + a rough relationship + emotional eating put 70 back on. Did the gray-market Ozempic thing in ~2023 (nurse practitioner in another state, $400 visits, foam cooler shipped to Florida — the whole sketch). Currently on retatrutide. Signed up for Triumph clinical trials.

Hard-won lessons I actually have an opinion on:
- Atomic habits don't work for ADHD. The "1% a day" model assumes executive function I don't have. What works for me is the opposite — change everything at once. New morning routine, new supplement stack, new commute, new lunch, new wind-down, all on the same Monday. The size of the change is what holds the attention. Smaller is harder.
- 17-day juice fast: lost weight fast, also burned through lean mass and tanked my BMR. The thing nobody warns you about with aggressive fasting is the post-fast metabolic floor.
- Emotional eating isn't hunger. It's nervous-system regulation. No peptide stops it. You either build other regulation tools (walking 8mi/day worked for me) or the food keeps winning.
- Circadian rhythm: you can't shift it more than ~30 min/day. I had a 24.5h cycle for years and just kept rolling around the clock. Once I knew the math, the fix was obvious.
- MyFitnessPal: used it 5+ times, hated it every time. It's a notebook that asks for $20/mo. It doesn't teach you anything about your body. I built my own tool because I wanted insight, not a log.

Technical lane:
- Pharmacokinetics — I learned it by building an open-source physiology simulator. Timeline of interventions (peptides, supplements, sauna, cold plunge, workouts), each modeled with absorption + clearance + half-life, charted against endogenous signals (cortisol, dopamine, vasopressin, muscle synthesis, etc). That project is what got me into the peptide world properly. I can talk peak/trough/steady-state math, stacking interactions, and where people misread half-life when planning protocols.
- Stats, data viz, big-data reporting — 20 years of e-commerce / marketing analytics. I'm comfortable with messy real-world data.
- ADHD-friendly tool design — opinionated about it.

Tone: direct, blunt, occasional profanity, self-deprecating, concrete numbers (n=1 is still data), skeptical of generic advice. I'm a builder, not a clinician — I don't prescribe, I share what I tried and what the math says.
`.trim();

const EXPERTISE_TAGS = [
  'pharmacokinetics-modeling',
  'half-life-stacking-math',
  'glp1-personal-use',
  'retatrutide',
  'adhd-friendly-habit-design',
  'circadian-rhythm-shifting',
  'data-visualization',
  'quantified-self-tooling',
  'fasting-and-lean-mass-tradeoffs',
  'emotional-eating-as-nervous-system-regulation',
  'biking-walking-cardio',
  'software-development-20yr',
  'triumph-clinical-trial-participant',
];

const DO_NOT_MENTION = [
  'specific dosing recommendations as advice (share what I do, not what others should do)',
  'gray-market peptide vendors or sources',
  'specific compounding pharmacies by name',
  'specific clinics or practitioners as recommendations',
  'my own product, app, or company unless explicitly asked',
  'medical claims I cannot back with personal experience or cited research',
  'diagnoses or differential-diagnosis suggestions for other people',
];

const SIGNATURE_SNIPPET = ''; // intentionally blank for the first 4-6 weeks of community presence

// ──────────────────────────────────────────────────────────────────────
// Subreddits to monitor. Keywords + filters tuned per Jeff's lane.
// `active:true` so the scheduler picks them up on the next worker tick.
// Reddit access uses public-JSON mode by default (no API credentials needed).
// ──────────────────────────────────────────────────────────────────────

const SUBREDDITS = [
  {
    subreddit: 'Peptides',
    scanIntervalMinutes: 60,
    scanRules: {
      keywords: [
        'half-life', 'half life', 'pharmacokinetics', 'peak', 'trough', 'steady state',
        'stack', 'stacking', 'protocol', 'dose timing', 'titration',
        'BPC-157', 'BPC157', 'TB-500', 'TB500', 'retatrutide', 'tirzepatide',
        'reconstitution', 'reconstitute', 'bac water',
        'COA', 'certificate of analysis', 'purity',
        'muscle loss', 'lean mass', 'BMR',
      ],
      excludeKeywords: ['source?', 'where to buy', 'vendor rec', 'best vendor', 'sourcing'],
      maxPostAgeHours: 48,
      minPostScore: 2,
      fitnessFilters: { mustBeQuestion: false, avoidNicheMismatch: true },
    },
    budget: { perRunCapUsd: 0.30, monthlyCapUsd: 12 },
  },
  // r/tirzepatide is banned/private as of 2026 — likely casualty of FDA
  // compounding crackdown. Use r/tirzepatidecompound + r/Mounjaro
  // (Lilly's brand name for tirz) to cover the same audience.
  {
    subreddit: 'tirzepatidecompound',
    scanIntervalMinutes: 60,
    scanRules: {
      keywords: [
        'half-life', 'half life', 'dose', 'titration', 'plateau', 'stall',
        'side effect', 'nausea', 'fatigue',
        'muscle loss', 'lean mass', 'protein', 'BMR',
        'fasting', 'rebound', 'maintenance',
        'tracking', 'logging', 'app', 'data',
        'reconstitution', 'reconstitute', 'bac water',
      ],
      excludeKeywords: ['source?', 'where to buy', 'vendor rec', 'best vendor', 'sourcing'],
      maxPostAgeHours: 48,
      minPostScore: 3,
      fitnessFilters: { mustBeQuestion: true, avoidNicheMismatch: true },
    },
    budget: { perRunCapUsd: 0.25, monthlyCapUsd: 10 },
  },
  {
    subreddit: 'Mounjaro',
    scanIntervalMinutes: 60,
    scanRules: {
      keywords: [
        'half-life', 'half life', 'dose', 'titration', 'plateau', 'stall',
        'side effect', 'nausea', 'fatigue',
        'muscle loss', 'lean mass', 'protein', 'BMR',
        'fasting', 'rebound', 'maintenance',
        'tracking', 'logging', 'app', 'data',
      ],
      excludeKeywords: ['insurance denial', 'coupon', 'GoodRx'],
      maxPostAgeHours: 48,
      minPostScore: 3,
      fitnessFilters: { mustBeQuestion: true, avoidNicheMismatch: true },
    },
    budget: { perRunCapUsd: 0.25, monthlyCapUsd: 10 },
  },
  {
    subreddit: 'Semaglutide',
    scanIntervalMinutes: 60,
    scanRules: {
      keywords: [
        'half-life', 'half life', 'dose', 'titration', 'plateau', 'stall',
        'side effect', 'nausea',
        'muscle loss', 'lean mass', 'protein',
        'fasting', 'rebound', 'coming off',
        'tracking', 'logging',
      ],
      excludeKeywords: ['insurance denial', 'coupon'],
      maxPostAgeHours: 48,
      minPostScore: 3,
      fitnessFilters: { mustBeQuestion: true, avoidNicheMismatch: true },
    },
    budget: { perRunCapUsd: 0.25, monthlyCapUsd: 10 },
  },
  {
    subreddit: 'Zepbound',
    scanIntervalMinutes: 60,
    scanRules: {
      keywords: [
        'half-life', 'dose', 'titration', 'plateau', 'stall',
        'muscle loss', 'lean mass', 'protein', 'BMR',
        'tracking', 'logging', 'app',
        'rebound', 'maintenance', 'coming off',
      ],
      excludeKeywords: ['insurance denial', 'coupon', 'cheapest'],
      maxPostAgeHours: 48,
      minPostScore: 3,
      fitnessFilters: { mustBeQuestion: true, avoidNicheMismatch: true },
    },
    budget: { perRunCapUsd: 0.25, monthlyCapUsd: 10 },
  },
  {
    subreddit: 'QuantifiedSelf',
    scanIntervalMinutes: 90,
    scanRules: {
      keywords: [
        'tracking', 'logging', 'app', 'tool', 'dashboard',
        'HRV', 'sleep', 'circadian', 'wearable',
        'GLP-1', 'tirzepatide', 'retatrutide', 'peptide',
        'pharmacokinetics', 'half-life',
        'ADHD', 'executive function',
        'data viz', 'visualization', 'correlation',
      ],
      excludeKeywords: [],
      maxPostAgeHours: 72,
      minPostScore: 3,
      fitnessFilters: { mustBeQuestion: false, avoidNicheMismatch: true },
    },
    budget: { perRunCapUsd: 0.30, monthlyCapUsd: 12 },
  },
];

// ──────────────────────────────────────────────────────────────────────

async function main() {
  const conn = createDbConnection({ mongoUri: process.env.MONGODB_URI, logger: console });
  await waitForConnection(conn);

  const Contact = buildContactModel(conn, PREFIX);
  const MonitoredSubreddit = buildMonitoredSubredditModel(conn, PREFIX);

  // 1. Update self Contact
  const self = await Contact.findOne({ name: SELF_NAME, relationship: 'self' });
  if (!self) {
    console.error(`[seed] no Contact found with name="${SELF_NAME}" relationship="self". Create one first.`);
    process.exit(1);
  }

  // Add or replace presences for reddit + website. Keep any other existing presences.
  const desiredPresences = [
    {
      platform: 'reddit',
      handle: REDDIT_HANDLE,
      url: `https://www.reddit.com/user/${REDDIT_HANDLE}/`,
      role: 'commenter',
      isPrimary: true,
      notes: 'primary engagement account for redditEngagement module',
    },
    {
      platform: 'website',
      handle: 'protokollab',
      url: 'https://protokollab.com',
      role: 'owner',
      isPrimary: false,
    },
  ];

  const existingByPlatformHandle = new Map(
    (self.presences || []).map((p) => [`${p.platform}:${(p.handle || '').toLowerCase()}`, p])
  );
  for (const p of desiredPresences) {
    const key = `${p.platform}:${p.handle.toLowerCase()}`;
    if (!existingByPlatformHandle.has(key)) {
      self.presences.push(p);
    } else {
      Object.assign(existingByPlatformHandle.get(key), p);
    }
  }

  // Find the reddit presence so we can wire voiceProfile.redditPresenceId
  const redditPresence = self.presences.find(
    (p) => p.platform === 'reddit' && p.handle === REDDIT_HANDLE
  );

  self.bio = self.bio
    || 'Software developer (20+ yrs). ADHD-inattentive (dx ~37). Built an open-source physiology simulator that models pharmacokinetics + endogenous signals. Currently on retatrutide, Triumph clinical trial participant. Builds his own tools.';
  self.niche = self.niche || 'biohacking, GLP-1/peptides, pharmacokinetics, ADHD-friendly tooling';
  self.tags = Array.from(new Set([
    ...(self.tags || []),
    'founder', 'developer', 'biohacker', 'glp1-user', 'retatrutide', 'adhd', 'pk-modeling',
  ]));

  self.voiceProfile = {
    active: true,
    voiceDescription: VOICE_DESCRIPTION,
    expertiseTags: EXPERTISE_TAGS,
    doNotMention: DO_NOT_MENTION,
    selfPromoPolicy: 'never',
    signatureSnippet: SIGNATURE_SNIPPET,
    redditPresenceId: redditPresence?._id,
    notes: 'Per consultant feedback: build community presence first, no self-promo for 4-6 weeks. Re-evaluate policy in mid-2026-06.',
  };

  if (!self.source || !self.source.type) {
    self.source = { type: 'self_setup', note: 'voice configured via seed-self-voice-and-subs.js', importedAt: new Date() };
  }

  await self.save();
  console.log(`[seed] updated self Contact ${self._id} (${self.name})`);
  console.log(`[seed]   presences: ${self.presences.map((p) => `${p.platform}:${p.handle}`).join(', ')}`);
  console.log(`[seed]   voiceProfile.active: ${self.voiceProfile.active}`);
  console.log(`[seed]   voiceProfile.redditPresenceId: ${self.voiceProfile.redditPresenceId}`);

  // 2. Upsert MonitoredSubreddits
  for (const sub of SUBREDDITS) {
    const existing = await MonitoredSubreddit.findOne({ subreddit: sub.subreddit });
    if (existing) {
      existing.voiceContactId = self._id;
      existing.scanRules = sub.scanRules;
      existing.scanIntervalMinutes = sub.scanIntervalMinutes;
      existing.budget = sub.budget;
      existing.active = true;
      await existing.save();
      console.log(`[seed] updated MonitoredSubreddit r/${sub.subreddit} (${existing._id})`);
    } else {
      const created = await MonitoredSubreddit.create({
        subreddit: sub.subreddit,
        active: true,
        voiceContactId: self._id,
        scanRules: sub.scanRules,
        scanIntervalMinutes: sub.scanIntervalMinutes,
        budget: sub.budget,
      });
      console.log(`[seed] created MonitoredSubreddit r/${sub.subreddit} (${created._id})`);
    }
  }

  await conn.close();
  console.log('[seed] done');
}

main().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
