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
I'm Jeff — 39, software developer for 20+ years (self-taught, big media → music industry → e-commerce analytics → now building my own tools). ADHD-inattentive, didn't get diagnosed until ~37. The kind of person who can lock into code for 18 hours and forget to eat, then go six weeks without remembering to take a daily supplement.

GLP-1 history: did the gray-market Ozempic run starting 2023 (nurse practitioner in another state, $400 visits, foam cooler shipped to Florida — the whole sketch), stayed on it long-term. Currently on retatrutide, ~6 weeks in. Signed up for Triumph trials. So I'm not new to GLP-1s as a patient — I just don't pretend to be a pharmacologist or a clinician. Dosing math, stacking protocols, peptide chemistry — that's not my lane. Lived experience as a long-term patient is.

Weight history is lifelong. Peaked around 315, dropped 115 by diet + biking ~100mi/week + treadmill workouts where I'd DJ my own music to hold the BPM. Got down to 200, then stress + a rough relationship + emotional eating put 70 back on. That backslide is most of why I'm here.

Where I actually have strong opinions (and what my work is built around):
- **Macros, calories, protein ratios.** Years of tracking, multiple weight-loss runs, lots of MyFitnessPal hate. Have actual takes on protein-to-lean-mass targets (especially while losing fast on a GLP-1, where muscle preservation is the whole game), calorie deficit sustainability, and why most macro tracking fails the moment appetite drops to zero. Protein-per-kg-LBM math is way more useful than g/day flat targets, especially as body composition shifts.
- **Calorie tracking that actually teaches you something.** Most apps log; they don't surface patterns. The interesting question isn't "did I hit my calories" — it's "what did I eat on the days I felt good vs. the days I crashed." That's a data problem, not a logging problem.
- **The GLP-1 nutrition gap.** When the drug suppresses hunger to near-zero, the standard "listen to your body" advice falls apart. You have to eat by the clock, hit protein floors deliberately, and watch for micronutrient gaps. This is where I think the existing tracker market completely fails GLP-1 patients.

Hard-won lessons I actually have a real opinion on (from doing them, not reading about them):
- Atomic habits don't work for ADHD. The "1% a day" model assumes executive function I don't have. What works for me is the opposite — change everything at once. New morning routine, new supplement stack, new commute, new lunch, new wind-down, all on the same Monday. The size of the change is what holds the attention. Smaller is harder.
- 17-day juice fast: lost weight fast, also burned through lean mass and tanked my BMR. The thing nobody warns you about with aggressive fasting is the post-fast metabolic floor.
- Emotional eating isn't hunger. It's nervous-system regulation. No drug stops it. You either build other regulation tools (walking 8mi/day worked for me) or the food keeps winning.
- Circadian rhythm: you can't shift it more than ~30 min/day. I had a 24.5h cycle for years and just kept rolling around the clock. Once I knew that, the fix was obvious.
- MyFitnessPal-style apps: used it 5+ times, hated it every time. It's a notebook that asks for $20/mo. Doesn't teach you anything about your body. I'm building my own because I want insight, not a log.

What I'm actually working on / curious about:
- Tracking tools that fit how an ADHD brain actually operates — desktop-first, fast bulk-edit, correlation-focused not streak-focused, "skipped" ≠ "failed".
- Personal health data viz. 20 years of e-commerce/marketing analytics translates surprisingly well to messy n=1 biology data.
- Got curious about how peptides actually work in the body and built a small open-source physiology simulator to teach myself — timeline of interventions charted against endogenous signals. That project was me LEARNING the material, not me being qualified to teach it. I now know enough to ask better questions, not enough to answer other people's dosing/protocol questions.

Tone: direct, blunt, occasional profanity, self-deprecating, concrete numbers (n=1 is still data), skeptical of generic advice. I share what I tried, what worked, and where I got lost — not what other people should do. Long-term GLP-1 patient + builder. Not a pharmacologist, not a clinician, not a dietitian. If a question needs that kind of authority, I say so instead of guessing.
`.trim();

// Tags reframed: long-term patient + builder, NOT pharmacologist/clinician.
// Dropped PK/dosing authority signals that were causing triage to surface
// dosing/stacking/protocol posts. Added macros/protein/calorie lane — that's
// where Jeff has real lived opinions AND it overlaps directly with what the
// app does.
const EXPERTISE_TAGS = [
  // Nutrition / tracking lane (primary — overlaps with the app)
  'macro-tracking-opinions',
  'protein-per-lbm-targeting',
  'calorie-deficit-sustainability',
  'protein-floor-on-glp1',
  'muscle-preservation-during-fast-loss',
  'micronutrient-gaps-on-glp1',
  'eating-by-the-clock-not-by-hunger',
  // Tool-builder identity (primary lane)
  'adhd-friendly-tracker-design',
  'tracker-app-builder',
  'data-visualization',
  'quantified-self-tooling',
  'myfitnesspal-frustration',
  'desktop-first-tracking',
  'correlation-over-streaks',
  'software-development-20yr',
  // Lived-experience GLP-1 patient (long-term, not authority)
  'long-term-glp1-patient',
  'gray-market-ozempic-multi-year-experience',
  'retatrutide-current',
  'triumph-trial-participant',
  'glp1-patient-not-pharmacologist',
  // Lived-experience habits/behavior (real opinions)
  'adhd-friendly-habit-design',
  'change-everything-at-once-not-atomic-habits',
  'emotional-eating-as-nervous-system-regulation',
  'walking-as-regulation-tool',
  'biking-walking-cardio',
  'circadian-rhythm-shifting',
  'aggressive-fasting-aftermath-bmr-collapse',
  '115lb-loss-then-70lb-rebound',
  // Curiosity / side-project posture (not credential)
  'learning-pharmacokinetics-by-building',
  'physiology-simulator-side-project',
];

const DO_NOT_MENTION = [
  // Hard limits on PK/dosing authority — Jeff is 6 weeks in, not a clinician.
  'any dosing schedule recommendation, even framed as personal experience',
  'pharmacokinetic math (peak/trough/steady-state, half-life calculations) as advice for someone else',
  'stacking advice — Jeff is only on retatrutide, has zero opinion on combos',
  'claims about peptides Jeff has not personally taken (BPC-157, TB-500, etc)',
  'reconstitution / bac water / injection technique guidance — defer to clinician or experienced users',
  'any framing that positions Jeff as an authority on GLP-1s, peptides, or pharmacology',
  // Existing limits, kept.
  'gray-market peptide vendors or sources',
  'specific compounding pharmacies by name',
  'specific clinics or practitioners as recommendations',
  'my own product, app, or company unless explicitly asked',
  'medical claims I cannot back with personal experience or cited research',
  'diagnoses or differential-diagnosis suggestions for other people',
];

const SIGNATURE_SNIPPET = ''; // intentionally blank for the first 4-6 weeks of community presence

// Slim ~150-token triage card. Used by Haiku triage instead of the full
// voiceDescription + 30 expertise tags + 12 doNotMention. Triage just needs
// "who is this voice + what fits + what doesn't" to score fit.
const TRIAGE_CARD = `
Long-term GLP-1 patient (multi-year Ozempic, currently retatrutide) + ADHD-friendly tracker-app builder. NOT a pharmacologist, clinician, or dietitian.

GOOD FITS: macro/protein/calorie tracking on GLP-1, muscle preservation while losing fast, micronutrient gaps, eating-by-the-clock when appetite drops, ADHD habit/tracker design, MyFitnessPal frustrations, data-viz/correlation over streaks, lived-patient experience, emotional eating as nervous-system regulation.

BAD FITS (skip): dosing schedules, half-life math, stacking protocols, peptide chemistry, reconstitution/bac water, injection technique, anything requiring clinical or pharmacology authority, vendor sourcing.
`.trim();

// ──────────────────────────────────────────────────────────────────────
// Subreddits to monitor. Keywords + filters tuned per Jeff's lane.
// `active:true` so the scheduler picks them up on the next worker tick.
// Reddit access uses public-JSON mode by default (no API credentials needed).
// ──────────────────────────────────────────────────────────────────────

// Shared keyword set tuned to Jeff's actual lane (macro/protein/calorie/
// tracking/MFP/ADHD/lived-experience). Used as the base for all GLP-1
// patient subs. Individual subs can extend.
const GLP1_PATIENT_KEYWORDS = [
  // Macro / calorie / protein lane (primary)
  'macros', 'macro', 'protein', 'calorie', 'calories', 'cico',
  'tracking', 'logging', 'app', 'myfitnesspal', 'mfp',
  'micronutrient', 'deficiency', 'electrolyte',
  // Muscle / body comp
  'lean mass', 'muscle loss', 'muscle preservation', 'BMR', 'TDEE', 'body fat', 'recomp',
  // Lived patient experience
  'plateau', 'stall', 'deficit', 'maintenance', 'rebound', 'coming off',
  'side effect', 'nausea', 'fatigue', 'food noise',
  'forgot to eat', 'not hungry', 'no appetite',
  // ADHD / behavior / regulation
  'adhd', 'binge', 'emotional eating', 'walking', 'habit',
];

const SUBREDDITS = [
  {
    subreddit: 'Peptides',
    scanIntervalMinutes: 1440,
    scanRules: {
      keywords: [
        // r/Peptides skews more technical, so this list is the GLP-1 patient
        // base PLUS lived peptide-experience terms — but NOT half-life/PK
        // math (Jeff doesn't speak with authority there).
        ...GLP1_PATIENT_KEYWORDS,
        'retatrutide', 'tirzepatide', 'GLP-1', 'GLP1',
        'triumph trial', 'trial',
      ],
      excludeKeywords: ['source?', 'where to buy', 'vendor rec', 'best vendor', 'sourcing'],
      maxPostAgeHours: 48,
      minPostScore: 2,
      fitnessFilters: { mustBeQuestion: false },
      prefilter: { minKeywordMatches: 1, maxComments: 50, minScore: 2 },
    },
    budget: { perRunCapUsd: 0.30, monthlyCapUsd: 12 },
  },
  // r/tirzepatide is banned/private as of 2026 — likely casualty of FDA
  // compounding crackdown. Use r/tirzepatidecompound + r/Mounjaro
  // (Lilly's brand name for tirz) to cover the same audience.
  {
    subreddit: 'tirzepatidecompound',
    scanIntervalMinutes: 1440,
    scanRules: {
      keywords: [...GLP1_PATIENT_KEYWORDS, 'tirzepatide', 'compound', 'GLP-1'],
      excludeKeywords: ['source?', 'where to buy', 'vendor rec', 'best vendor', 'sourcing'],
      maxPostAgeHours: 48,
      minPostScore: 3,
      // Patient stories without "?" are exactly Jeff's lane. mustBeQuestion=true
      // was killing 14/16 viable posts — see diagnostic from 2026-04-30.
      fitnessFilters: { mustBeQuestion: false },
      prefilter: { minKeywordMatches: 1, maxComments: 50, minScore: 3 },
    },
    budget: { perRunCapUsd: 0.25, monthlyCapUsd: 10 },
  },
  {
    subreddit: 'Mounjaro',
    scanIntervalMinutes: 1440,
    scanRules: {
      keywords: [...GLP1_PATIENT_KEYWORDS, 'mounjaro', 'tirzepatide', 'GLP-1'],
      excludeKeywords: ['insurance denial', 'coupon', 'GoodRx', 'PA denied', 'prior auth'],
      maxPostAgeHours: 48,
      minPostScore: 3,
      fitnessFilters: { mustBeQuestion: false },
      prefilter: { minKeywordMatches: 1, maxComments: 50, minScore: 3 },
    },
    budget: { perRunCapUsd: 0.25, monthlyCapUsd: 10 },
  },
  {
    subreddit: 'Semaglutide',
    scanIntervalMinutes: 1440,
    scanRules: {
      keywords: [...GLP1_PATIENT_KEYWORDS, 'semaglutide', 'ozempic', 'wegovy', 'GLP-1'],
      excludeKeywords: ['insurance denial', 'coupon', 'GoodRx'],
      maxPostAgeHours: 48,
      minPostScore: 3,
      fitnessFilters: { mustBeQuestion: false },
      prefilter: { minKeywordMatches: 1, maxComments: 50, minScore: 3 },
    },
    budget: { perRunCapUsd: 0.25, monthlyCapUsd: 10 },
  },
  {
    subreddit: 'Zepbound',
    scanIntervalMinutes: 1440,
    scanRules: {
      keywords: [...GLP1_PATIENT_KEYWORDS, 'zepbound', 'tirzepatide', 'GLP-1'],
      excludeKeywords: ['insurance denial', 'coupon', 'cheapest', 'PA denied', 'prior auth'],
      maxPostAgeHours: 48,
      minPostScore: 3,
      fitnessFilters: { mustBeQuestion: false },
      prefilter: { minKeywordMatches: 1, maxComments: 50, minScore: 3 },
    },
    budget: { perRunCapUsd: 0.25, monthlyCapUsd: 10 },
  },
  {
    subreddit: 'QuantifiedSelf',
    scanIntervalMinutes: 1440,
    scanRules: {
      keywords: [
        'tracking', 'logging', 'app', 'tool', 'dashboard',
        'HRV', 'sleep', 'circadian', 'wearable',
        'GLP-1', 'tirzepatide', 'retatrutide',
        'macro', 'protein', 'calorie', 'myfitnesspal', 'mfp',
        'ADHD', 'executive function',
        'data viz', 'visualization', 'correlation',
      ],
      excludeKeywords: [],
      maxPostAgeHours: 72,
      minPostScore: 3,
      fitnessFilters: { mustBeQuestion: false },
      prefilter: { minKeywordMatches: 1, maxComments: 50, minScore: 3 },
    },
    budget: { perRunCapUsd: 0.30, monthlyCapUsd: 12 },
  },

  // ──────────────────────────────────────────────────────────────────────
  // Generic weight-loss community subs. Macro/calorie/protein discussions
  // are exactly Jeff's lane. r/loseit is huge → tight prefilter to avoid
  // burning budget on saturated threads.
  // ──────────────────────────────────────────────────────────────────────
  {
    subreddit: 'loseit',
    scanIntervalMinutes: 1440,
    scanRules: {
      keywords: [
        'macros', 'macro', 'protein', 'calorie', 'calories', 'cico',
        'tracking', 'logging', 'app', 'myfitnesspal', 'mfp',
        'plateau', 'stall', 'deficit', 'maintenance',
        'lean mass', 'muscle loss', 'BMR', 'body fat',
        'glp', 'glp-1', 'ozempic', 'wegovy', 'mounjaro', 'zepbound', 'tirzepatide', 'retatrutide',
        'adhd', 'binge', 'emotional eating',
      ],
      excludeKeywords: ['NSV', 'SV', 'goal weight reached', 'celebration'],
      maxPostAgeHours: 24,
      minPostScore: 5,
      fitnessFilters: { mustBeQuestion: false },
      prefilter: { minKeywordMatches: 2, maxComments: 40, minScore: 5 },
    },
    budget: { perRunCapUsd: 0.20, monthlyCapUsd: 10 },
  },
  {
    subreddit: 'progresspics',
    scanIntervalMinutes: 1440,
    scanRules: {
      // Mostly photo posts — thin text. Engage only when there's a real
      // question in the title/body. Most posts will fail the prefilter.
      keywords: [
        'macros', 'protein', 'calorie', 'tracking',
        'glp', 'tirzepatide', 'retatrutide', 'mounjaro', 'zepbound',
        'plateau', 'stall', 'lean mass', 'muscle',
        'how did you', 'what did you', 'advice',
      ],
      excludeKeywords: [],
      maxPostAgeHours: 48,
      minPostScore: 50,
      // Photo subs: keep mustBeQuestion on so we don't try to comment on
      // pure before/after photos.
      fitnessFilters: { mustBeQuestion: true },
      prefilter: { minKeywordMatches: 2, maxComments: 30, minScore: 50 },
    },
    budget: { perRunCapUsd: 0.10, monthlyCapUsd: 5 },
  },
  {
    subreddit: 'WeightLossAdvice',
    scanIntervalMinutes: 1440,
    scanRules: {
      keywords: [
        'macros', 'protein', 'calorie', 'cico',
        'tracking', 'logging', 'app', 'myfitnesspal',
        'plateau', 'stall', 'deficit',
        'lean mass', 'muscle loss', 'BMR',
        'glp', 'ozempic', 'wegovy', 'mounjaro', 'zepbound', 'tirzepatide', 'retatrutide',
        'adhd', 'binge', 'emotional eating',
      ],
      excludeKeywords: [],
      maxPostAgeHours: 48,
      minPostScore: 3,
      fitnessFilters: { mustBeQuestion: false },
      prefilter: { minKeywordMatches: 2, maxComments: 40, minScore: 3 },
    },
    budget: { perRunCapUsd: 0.20, monthlyCapUsd: 10 },
  },

  // ──────────────────────────────────────────────────────────────────────
  // Fasting / IF — overlaps with Jeff's juice-fast lesson + GLP-1 appetite-
  // suppression eating-by-the-clock framing.
  // ──────────────────────────────────────────────────────────────────────
  {
    subreddit: 'intermittentfasting',
    scanIntervalMinutes: 1440,
    scanRules: {
      keywords: [
        '16:8', 'omad', 'eating window', 'breaking fast', 'refeed',
        'protein', 'macros', 'calorie',
        'lean mass', 'muscle loss', 'BMR',
        'plateau', 'stall', 'deficit',
        'tracking', 'app', 'myfitnesspal',
        'adhd', 'binge', 'emotional eating',
        'glp', 'tirzepatide', 'retatrutide',
      ],
      excludeKeywords: [],
      maxPostAgeHours: 48,
      minPostScore: 5,
      fitnessFilters: { mustBeQuestion: false },
      prefilter: { minKeywordMatches: 2, maxComments: 50, minScore: 5 },
    },
    budget: { perRunCapUsd: 0.20, monthlyCapUsd: 8 },
  },
  {
    subreddit: 'fasting',
    scanIntervalMinutes: 1440,
    scanRules: {
      keywords: [
        'extended fast', 'water fast', 'juice fast', 'prolonged',
        'refeed', 'breaking fast',
        'lean mass', 'muscle loss', 'BMR', 'metabolism',
        'protein', 'electrolytes',
        'tracking', 'app',
        'adhd',
      ],
      excludeKeywords: [],
      maxPostAgeHours: 72,
      minPostScore: 3,
      fitnessFilters: { mustBeQuestion: false },
      prefilter: { minKeywordMatches: 2, maxComments: 40, minScore: 3 },
    },
    budget: { perRunCapUsd: 0.15, monthlyCapUsd: 6 },
  },
  {
    subreddit: 'OMAD',
    scanIntervalMinutes: 1440,
    scanRules: {
      keywords: [
        'protein', 'macros', 'calorie',
        'lean mass', 'muscle loss', 'BMR',
        'plateau', 'stall',
        'tracking', 'app', 'myfitnesspal',
        'adhd', 'binge',
        'glp', 'tirzepatide', 'retatrutide',
      ],
      excludeKeywords: [],
      maxPostAgeHours: 72,
      minPostScore: 3,
      fitnessFilters: { mustBeQuestion: false },
      prefilter: { minKeywordMatches: 2, maxComments: 30, minScore: 3 },
    },
    budget: { perRunCapUsd: 0.12, monthlyCapUsd: 5 },
  },

  // ──────────────────────────────────────────────────────────────────────
  // Keto. Macros + electrolytes + tracking is Jeff's lane. Less so the
  // metabolic-religion side — let prefilter handle that.
  // ──────────────────────────────────────────────────────────────────────
  {
    subreddit: 'keto',
    scanIntervalMinutes: 1440,
    scanRules: {
      keywords: [
        'macros', 'protein', 'fat', 'calorie',
        'tracking', 'logging', 'app', 'myfitnesspal',
        'plateau', 'stall', 'deficit',
        'lean mass', 'muscle loss', 'BMR',
        'electrolytes',
        'glp', 'tirzepatide', 'retatrutide', 'mounjaro', 'zepbound',
        'adhd',
      ],
      excludeKeywords: ['recipe', 'meal idea'],
      maxPostAgeHours: 48,
      minPostScore: 5,
      fitnessFilters: { mustBeQuestion: false },
      prefilter: { minKeywordMatches: 2, maxComments: 40, minScore: 5 },
    },
    budget: { perRunCapUsd: 0.15, monthlyCapUsd: 6 },
  },
  {
    subreddit: 'ketoscience',
    scanIntervalMinutes: 1440,
    scanRules: {
      keywords: [
        'macros', 'protein', 'calorie',
        'lean mass', 'muscle loss', 'BMR', 'rmr',
        'study', 'research', 'data',
        'tracking', 'app',
        'glp', 'tirzepatide', 'retatrutide',
      ],
      excludeKeywords: [],
      maxPostAgeHours: 96,
      minPostScore: 3,
      fitnessFilters: { mustBeQuestion: false },
      prefilter: { minKeywordMatches: 2, maxComments: 30, minScore: 3 },
    },
    budget: { perRunCapUsd: 0.10, monthlyCapUsd: 5 },
  },

  // ──────────────────────────────────────────────────────────────────────
  // Strict CICO + low-calorie subs. Calorie-tracking-as-religion crowd —
  // Jeff has years of MyFitnessPal hate + opinions on macro tracking.
  // ──────────────────────────────────────────────────────────────────────
  {
    subreddit: 'CICO',
    scanIntervalMinutes: 1440,
    scanRules: {
      keywords: [
        'macros', 'protein', 'calorie', 'deficit',
        'tracking', 'logging', 'app', 'myfitnesspal', 'mfp',
        'plateau', 'stall', 'maintenance',
        'lean mass', 'muscle loss', 'BMR', 'TDEE',
        'glp', 'tirzepatide', 'retatrutide',
        'adhd',
      ],
      excludeKeywords: [],
      maxPostAgeHours: 48,
      minPostScore: 3,
      fitnessFilters: { mustBeQuestion: false },
      prefilter: { minKeywordMatches: 2, maxComments: 30, minScore: 3 },
    },
    budget: { perRunCapUsd: 0.15, monthlyCapUsd: 8 },
  },
  {
    subreddit: '1200isplenty',
    scanIntervalMinutes: 1440,
    scanRules: {
      keywords: [
        'protein', 'macros', 'micronutrient', 'deficiency',
        'tracking', 'app', 'myfitnesspal',
        'lean mass', 'muscle loss', 'BMR',
        'glp', 'tirzepatide', 'retatrutide',
      ],
      excludeKeywords: ['recipe', 'meal'],
      maxPostAgeHours: 72,
      minPostScore: 5,
      fitnessFilters: { mustBeQuestion: false },
      prefilter: { minKeywordMatches: 2, maxComments: 30, minScore: 5 },
    },
    budget: { perRunCapUsd: 0.10, monthlyCapUsd: 5 },
  },
  {
    subreddit: '1500isplenty',
    scanIntervalMinutes: 1440,
    scanRules: {
      keywords: [
        'protein', 'macros', 'micronutrient',
        'tracking', 'app', 'myfitnesspal',
        'lean mass', 'muscle loss',
        'glp', 'tirzepatide', 'retatrutide',
      ],
      excludeKeywords: ['recipe', 'meal'],
      maxPostAgeHours: 72,
      minPostScore: 5,
      fitnessFilters: { mustBeQuestion: false },
      prefilter: { minKeywordMatches: 2, maxComments: 30, minScore: 5 },
    },
    budget: { perRunCapUsd: 0.10, monthlyCapUsd: 5 },
  },
  {
    subreddit: 'volumeeating',
    scanIntervalMinutes: 1440,
    scanRules: {
      keywords: [
        'protein', 'macros', 'satiety', 'fullness',
        'tracking', 'app',
        'glp', 'appetite',
      ],
      excludeKeywords: ['recipe', 'meal idea'],
      maxPostAgeHours: 96,
      minPostScore: 5,
      fitnessFilters: { mustBeQuestion: false },
      prefilter: { minKeywordMatches: 2, maxComments: 30, minScore: 5 },
    },
    budget: { perRunCapUsd: 0.08, monthlyCapUsd: 4 },
  },

  // ──────────────────────────────────────────────────────────────────────
  // Body recomp / cutting / lean mass — protein-per-LBM lane.
  // ──────────────────────────────────────────────────────────────────────
  {
    subreddit: 'leangains',
    scanIntervalMinutes: 1440,
    scanRules: {
      keywords: [
        'protein', 'macros', 'cut', 'cutting', 'recomp',
        'lean mass', 'muscle preservation', 'BMR', 'TDEE',
        'tracking', 'app',
        'glp', 'tirzepatide', 'retatrutide',
      ],
      excludeKeywords: [],
      maxPostAgeHours: 72,
      minPostScore: 3,
      fitnessFilters: { mustBeQuestion: false },
      prefilter: { minKeywordMatches: 2, maxComments: 30, minScore: 3 },
    },
    budget: { perRunCapUsd: 0.12, monthlyCapUsd: 6 },
  },
  {
    subreddit: 'PetiteFitness',
    scanIntervalMinutes: 1440,
    scanRules: {
      keywords: [
        'protein', 'macros', 'calorie',
        'lean mass', 'muscle loss', 'BMR', 'TDEE',
        'tracking', 'app', 'myfitnesspal',
        'plateau', 'stall',
        'glp', 'tirzepatide', 'retatrutide',
      ],
      excludeKeywords: [],
      maxPostAgeHours: 72,
      minPostScore: 3,
      fitnessFilters: { mustBeQuestion: false },
      prefilter: { minKeywordMatches: 2, maxComments: 30, minScore: 3 },
    },
    budget: { perRunCapUsd: 0.10, monthlyCapUsd: 5 },
  },
  {
    subreddit: 'Brogress',
    scanIntervalMinutes: 1440,
    scanRules: {
      // Mostly progress photos. Triage will only fire on text-y posts that
      // pass the strict prefilter.
      keywords: [
        'protein', 'macros', 'cut', 'cutting', 'recomp',
        'lean mass', 'BMR',
        'glp', 'tirzepatide',
        'how did you', 'advice',
      ],
      excludeKeywords: [],
      maxPostAgeHours: 96,
      minPostScore: 20,
      // Photo sub: require ? in title to avoid commenting on pure photos.
      fitnessFilters: { mustBeQuestion: true },
      prefilter: { minKeywordMatches: 2, maxComments: 30, minScore: 20 },
    },
    budget: { perRunCapUsd: 0.08, monthlyCapUsd: 4 },
  },
  {
    subreddit: 'loseitnarwhals',
    scanIntervalMinutes: 1440,
    scanRules: {
      keywords: [
        'protein', 'macros', 'calorie',
        'tracking', 'app', 'myfitnesspal',
        'plateau', 'stall', 'deficit',
        'lean mass', 'muscle loss', 'BMR',
        'glp', 'ozempic', 'wegovy', 'mounjaro', 'zepbound', 'tirzepatide', 'retatrutide',
        'adhd', 'binge', 'emotional eating',
      ],
      excludeKeywords: [],
      maxPostAgeHours: 72,
      minPostScore: 3,
      fitnessFilters: { mustBeQuestion: false },
      prefilter: { minKeywordMatches: 2, maxComments: 40, minScore: 3 },
    },
    budget: { perRunCapUsd: 0.15, monthlyCapUsd: 6 },
  },

  // ──────────────────────────────────────────────────────────────────────
  // Cutting / age-specific fitness.
  // ──────────────────────────────────────────────────────────────────────
  {
    subreddit: 'naturalbodybuilding',
    scanIntervalMinutes: 1440,
    scanRules: {
      keywords: [
        'cut', 'cutting', 'cut phase', 'recomp',
        'protein', 'macros',
        'lean mass', 'muscle preservation', 'BMR', 'TDEE',
        'tracking', 'app',
        'glp', 'tirzepatide', 'retatrutide',
      ],
      excludeKeywords: [],
      maxPostAgeHours: 96,
      minPostScore: 5,
      fitnessFilters: { mustBeQuestion: false },
      prefilter: { minKeywordMatches: 2, maxComments: 30, minScore: 5 },
    },
    budget: { perRunCapUsd: 0.10, monthlyCapUsd: 5 },
  },
  {
    subreddit: 'FitnessOver50',
    scanIntervalMinutes: 1440,
    scanRules: {
      keywords: [
        'protein', 'macros', 'calorie',
        'lean mass', 'muscle loss', 'BMR', 'sarcopenia',
        'tracking', 'app',
        'plateau', 'stall',
        'glp', 'tirzepatide', 'retatrutide', 'mounjaro', 'zepbound',
      ],
      excludeKeywords: [],
      maxPostAgeHours: 96,
      minPostScore: 3,
      fitnessFilters: { mustBeQuestion: false },
      prefilter: { minKeywordMatches: 2, maxComments: 30, minScore: 3 },
    },
    budget: { perRunCapUsd: 0.10, monthlyCapUsd: 5 },
  },
  {
    subreddit: 'Fitness30Plus',
    scanIntervalMinutes: 1440,
    scanRules: {
      keywords: [
        'protein', 'macros', 'calorie',
        'lean mass', 'muscle loss', 'BMR', 'TDEE',
        'tracking', 'app',
        'plateau', 'stall', 'recomp',
        'glp', 'tirzepatide', 'retatrutide',
        'adhd',
      ],
      excludeKeywords: [],
      maxPostAgeHours: 96,
      minPostScore: 3,
      fitnessFilters: { mustBeQuestion: false },
      prefilter: { minKeywordMatches: 2, maxComments: 30, minScore: 3 },
    },
    budget: { perRunCapUsd: 0.10, monthlyCapUsd: 5 },
  },
  {
    subreddit: 'AdvancedFitness',
    scanIntervalMinutes: 1440,
    scanRules: {
      keywords: [
        'protein', 'macros', 'cut', 'cutting', 'recomp',
        'lean mass', 'muscle preservation', 'BMR', 'TDEE',
        'tracking', 'app', 'data',
        'glp', 'tirzepatide', 'retatrutide',
      ],
      excludeKeywords: [],
      maxPostAgeHours: 96,
      minPostScore: 5,
      fitnessFilters: { mustBeQuestion: false },
      prefilter: { minKeywordMatches: 2, maxComments: 30, minScore: 5 },
    },
    budget: { perRunCapUsd: 0.10, monthlyCapUsd: 5 },
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

  // Overwrite (not `||`) — re-runs need to actually replace stale values
  // when we tune the voice. Triage was over-indexing on the old PK-heavy
  // framing.
  self.bio = 'Software developer (20+ yrs). ADHD-inattentive (dx ~37). Builder of his own ADHD-friendly tracking tools because off-the-shelf apps don\'t fit. Long-term GLP-1 patient — multi-year Ozempic run, currently on retatrutide, Triumph trial participant. Strong opinions on macros, protein-per-LBM targeting, and calorie tracking that actually surfaces patterns instead of just logging. Built a small physiology simulator as a side project to learn pharmacokinetics — patient + builder, not pharmacologist or clinician.';
  self.niche = 'macro/calorie/protein tracking for GLP-1 patients, ADHD-friendly tracker design, personal health data viz, long-term GLP-1 lived experience';
  self.tags = [
    'founder',
    'developer',
    'tool-builder',
    'adhd',
    'data-viz',
    'quantified-self',
    'glp1-patient-long-term',
    'retatrutide-current',
    'macros-protein-calories',
    'not-a-clinician',
    'not-a-pharmacologist',
    'tracker-app-design',
  ];

  self.voiceProfile = {
    active: true,
    voiceDescription: VOICE_DESCRIPTION,
    triageCard: TRIAGE_CARD,
    expertiseTags: EXPERTISE_TAGS,
    doNotMention: DO_NOT_MENTION,
    signatureSnippet: SIGNATURE_SNIPPET,
    redditPresenceId: redditPresence?._id,
    notes: 'Voice revised 2026-04-30: bucket-based classification (DIRECT_ASK / INDIRECT_PROBLEM / TOPIC_ADJACENT / SKIP) replaces fit + selfPromoPolicy. App mention/recommendation is now bucket-driven per draft step. Jeff is a long-term GLP-1 patient (multi-year Ozempic + current retatrutide) and tool-builder — NOT a pharmacologist, clinician, or dietitian. Triage should classify based on whether the post is about a problem the app solves (macro/calorie tracking on GLP-1, ADHD-and-eating, MFP frustrations) vs niche-adjacent (dosing/PK/sourcing) vs off-topic.',
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
