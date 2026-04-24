/**
 * Data registry for /compare/* pages.
 *
 * Each entry = one competitor. ComparisonPage.vue renders from this,
 * marketing-meta.js references each entry for SEO + OG + sitemap.
 *
 * Field guide:
 *   slug          : URL segment (/compare/<slug>)
 *   name          : competitor brand name (used in titles, headings, copy)
 *   tagline       : one-line competitor positioning
 *   website       : homepage for reference link (no affiliation implied)
 *   category      : 'native' | 'pwa' | 'traditional' — used to group on index
 *   strengths     : 2-4 bullets — what the competitor does *well*. Leading
 *                   with honesty is a credibility signal; attack copy
 *                   hurts trust + rankings.
 *   gaps          : 2-4 bullets — what they miss for the GLP-1 use case.
 *                   Factual, specific, no hyperbole.
 *   useThemIf     : one-paragraph "prefer them when..."
 *   usePlIf       : one-paragraph "prefer Protokol Lab when..."
 *   matrix        : feature-by-feature row. Each: { feature, them, us, note }
 *                   - them/us: '✓' | '✗' | 'partial' | 'string'
 *   faqs          : Q/A array (populates FAQPage JSON-LD + visible list)
 */

export const COMPARISONS = {
  shotsy: {
    slug: 'shotsy',
    name: 'Shotsy',
    tagline: 'iOS-native GLP-1 tracker with visualization-forward injection logging.',
    website: 'https://shotsy.app',
    category: 'native',
    strengths: [
      'Best-in-class dose visualization among native GLP-1 apps — overlays weight trend against injection history with estimated active level.',
      'Polished iOS-native experience with deep platform integration (HealthKit, Apple Watch, system notifications).',
      'Side-effect correlation charts help surface the relationship between peak serum levels and symptom timing.',
      'Strong injection scheduling and reminder UX.',
    ],
    gaps: [
      'Nutrition tracking is secondary. Calorie logging exists but is not the focus; macro tracking is basic.',
      'No rolling 7-day calorie budget — still operates on daily resets, which fight the GLP-1 appetite cycle.',
      'Symptom severity is coarse (typically binary or categorical) rather than a 0–10 scale.',
      'iOS only — Android and web users are shut out.',
    ],
    useThemIf:
      "You're on iPhone, live inside HealthKit, and primarily want dose visualization. Food logging is a nice-to-have, not your core workflow.",
    usePlIf:
      'You want the same dose-visualization quality <strong>plus</strong> a full macro tracker that actually understands GLP-1 appetite cycling. Or you need Android / web access. Or you want an AI that reads dose + food + symptom data together.',
    matrix: [
      { feature: 'Dose tracking with half-life curves',     them: '✓',       us: '✓' },
      { feature: 'Rolling 7-day calorie budget',            them: '✗',       us: '✓' },
      { feature: 'Food barcode scanning',                   them: 'partial', us: '✓', note: 'Shotsy: basic; PL: full library + barcode + custom foods' },
      { feature: 'Symptom severity 0–10 scale',             them: '✗',       us: '✓' },
      { feature: 'Multi-compound stacks (e.g. tirz + caglrilintide)', them: '✗', us: '✓' },
      { feature: 'Agentic AI (reads log, logs food for you)',them: '✗',      us: '✓' },
      { feature: 'Android / Web access',                    them: '✗',       us: '✓' },
      { feature: 'Apple HealthKit integration',             them: '✓',       us: 'partial', note: 'PL is PWA — HealthKit sync requires a Shortcut bridge' },
      { feature: 'Data export (JSON/CSV)',                  them: 'partial', us: '✓' },
      { feature: 'Pricing',                                 them: 'Freemium', us: 'Free + $6.58/mo' },
    ],
    faqs: [
      {
        q: 'Is Protokol Lab a replacement for Shotsy?',
        a: 'For most users, yes — with tradeoffs. Protokol Lab matches Shotsy on dose charting and goes further on macro tracking, weekly rolling budgets, symptom granularity, and AI. The main thing you give up is the deep iOS HealthKit integration Shotsy gets from being a native app.',
      },
      {
        q: 'Does Protokol Lab run on iPhone like Shotsy?',
        a: 'Yes. Protokol Lab installs to the iOS home screen as a Progressive Web App, works fully offline, and sends Web Push notifications for dose reminders. It is not distributed through the App Store.',
      },
      {
        q: 'Can I import my Shotsy history?',
        a: 'Shotsy does not currently offer a public data export API, so manual re-entry of doses and weigh-ins is required when migrating. Protokol Lab supports full JSON/CSV export so you can leave at any time without losing history.',
      },
      {
        q: "Why doesn't Shotsy have a rolling 7-day calorie budget?",
        a: "Shotsy's primary design goal is dose and injection tracking; the macro logging surface is secondary. Protokol Lab was built around the GLP-1 appetite cycle from day one, which is why the 7-day rolling budget is a core feature rather than an add-on.",
      },
    ],
  },

  'myfitnesspal': {
    slug: 'myfitnesspal',
    name: 'MyFitnessPal',
    tagline: 'The legacy calorie counter — massive food database, generic use case.',
    website: 'https://myfitnesspal.com',
    category: 'traditional',
    strengths: [
      'Enormous crowdsourced food database — almost any food you can think of has at least one entry.',
      'Barcode scanning and recent/favorite food workflows are mature and fast.',
      'Recipe builder and saved meals cover common cooking patterns.',
      'Integrations with most smart scales, fitness trackers, and fitness apps.',
    ],
    gaps: [
      'Zero awareness of GLP-1 pharmacology. No dose tracking, no half-life curves, no symptom overlay.',
      'Daily calorie resets fight the GLP-1 appetite cycle — low-appetite days read as "under goal" failures.',
      'Food database has significant duplicate and inaccurate entries from the crowdsourced model.',
      'Aggressive freemium friction: features move behind paywall, ad load increased, macro editing gated.',
    ],
    useThemIf:
      "You're not on a GLP-1, you want the largest possible food database, and you're okay with daily calorie resets and a generic weight-loss frame.",
    usePlIf:
      "You're on Tirzepatide, Semaglutide, Ozempic, Wegovy, Mounjaro, Zepbound, or a compounded peptide and you want a tracker that treats your week as a week — not seven separate days where four of them look like you failed. Plus dose tracking, symptom tracking, and an AI that reads it all together.",
    matrix: [
      { feature: 'Dose tracking with half-life curves',     them: '✗', us: '✓' },
      { feature: 'Rolling 7-day calorie budget',            them: '✗', us: '✓' },
      { feature: 'Food barcode scanning',                   them: '✓', us: '✓' },
      { feature: 'Food database size',                      them: 'Very large', us: 'Large', note: 'MFP has a multi-year lead on crowdsourced breadth' },
      { feature: 'Symptom severity 0–10 scale',             them: '✗', us: '✓' },
      { feature: 'Custom compounds (retatrutide, etc.)',    them: '✗', us: '✓' },
      { feature: 'Agentic AI assistant',                    them: '✗', us: '✓' },
      { feature: 'Ads in free tier',                        them: '✓', us: '✗' },
      { feature: 'Data export (full history, free)',        them: 'partial', us: '✓' },
      { feature: 'Pricing',                                 them: 'Free + ~$19.99/mo', us: 'Free + $6.58/mo' },
    ],
    faqs: [
      {
        q: 'Can I just use MyFitnessPal and ignore the GLP-1 stuff?',
        a: "You can, and many people do at first. The problem shows up around week 2: you have three 900-calorie days from peak suppression and two 2,400-calorie rebound days, and MyFitnessPal flags four of seven days as failures even though your weekly total is perfect. That pattern is why people switch.",
      },
      {
        q: 'Is Protokol Lab cheaper than MyFitnessPal Premium?',
        a: 'Yes. MyFitnessPal Premium runs around $19.99/month. Protokol Lab Premium is $9.99/month monthly, or $79/year ($6.58/mo effective) — roughly a third of MFP Premium, with GLP-1-specific features MFP does not offer.',
      },
      {
        q: 'Does Protokol Lab have a food database as big as MyFitnessPal?',
        a: "No — MyFitnessPal's database has a multi-year lead on breadth. Protokol Lab's food library is large and growing, with barcode scanning, custom foods, and an AI that can pull nutrition for unusual items via web search. For 95% of everyday meals you'll find what you need.",
      },
      {
        q: 'Can I import my MyFitnessPal history?',
        a: 'MyFitnessPal offers a data export that Protokol Lab can parse into your food log and weight history. Dose history has to be re-entered since MFP does not track it.',
      },
      {
        q: 'Does Protokol Lab have ads?',
        a: 'No. The free tier is ad-free. Revenue comes from Premium subscriptions, not ad sales.',
      },
    ],
  },

  'glapp-io': {
    slug: 'glapp-io',
    name: 'Glapp.io',
    tagline: 'Free PWA that maps GLP-1 experience to Rise / Peak / Fade phases — deliberately no calorie counting.',
    website: 'https://glapp.io',
    category: 'pwa',
    strengths: [
      'Genuinely free, no paywall, no ads. Works offline as a PWA.',
      'Phase-based model (Rise / Peak / Fade) is an elegant abstraction for users who want to understand their week without math.',
      'Peer-baseline comparisons against clinical trial data provide useful reality checks.',
      'Strong anti-diet stance appeals to users burned out by traditional calorie tracking.',
    ],
    gaps: [
      'No calorie or macro tracking at all — by design. Users who want quantified nutritional data have to use a second app.',
      'No rolling 7-day calorie budget (because no calorie tracking exists).',
      'Symptom tracking is qualitative rather than 0–10 scaled.',
      'No AI assistant; no food logging; no correlation charts tying nutrition to dose.',
    ],
    useThemIf:
      "You're actively avoiding calorie counting on principle, you want a symptom + phase tracker only, and you prefer a deliberately minimal tool over a full tracker.",
    usePlIf:
      'You want quantified calorie and macro tracking alongside your dose curve — but tracked in a way that respects the GLP-1 appetite cycle (rolling weekly budget) rather than punishing it (daily resets). You get the phase-awareness Glapp gives you, plus the numbers.',
    matrix: [
      { feature: 'Dose tracking with half-life curves',     them: '✓',    us: '✓' },
      { feature: 'Calorie / macro tracking',                them: '✗',    us: '✓', note: 'Glapp explicitly does not count calories' },
      { feature: 'Rolling 7-day calorie budget',            them: '✗',    us: '✓' },
      { feature: 'Food barcode scanning',                   them: '✗',    us: '✓' },
      { feature: 'Phase model (Rise/Peak/Fade)',            them: '✓',    us: 'partial', note: 'PL shows the continuous PK curve; phases can be inferred from it' },
      { feature: 'Clinical-trial peer baselines',           them: '✓',    us: '✗' },
      { feature: 'Symptom severity 0–10 scale',             them: '✗',    us: '✓' },
      { feature: 'Agentic AI assistant',                    them: '✗',    us: '✓' },
      { feature: 'Pricing',                                 them: 'Free', us: 'Free + $6.58/mo' },
    ],
    faqs: [
      {
        q: 'Is Protokol Lab anti-intuitive-eating like Glapp?',
        a: "Protokol Lab is pro-intuitive-eating on GLP-1. The rolling 7-day budget exists specifically so users can eat less on suppression days and catch up on rebound days without guilt. The math validates intuitive eating instead of fighting it — which is the same goal Glapp pursues, just with numbers attached.",
      },
      {
        q: 'Can I use Protokol Lab without ever seeing calorie numbers?',
        a: 'Partially. You can hide the macro panel, but calorie tracking is a core feature. If you want a calorie-free experience, Glapp is the better fit.',
      },
      {
        q: 'Is Glapp still free?',
        a: 'As of writing, yes. Glapp has held a no-paywall position since launch and is a great free option for symptom + phase tracking.',
      },
    ],
  },

  'dosediary': {
    slug: 'dosediary',
    name: 'DoseDiary',
    tagline: 'Free PWA from a solo developer — lightweight Shotsy alternative with dose charting.',
    website: 'https://dosediary.app',
    category: 'pwa',
    strengths: [
      'Completely free. No paywall on dose charting, weight tracking, or schedule management.',
      'Lightweight and fast — designed for quick logging without friction.',
      'Active community presence on Reddit; the developer is responsive to feedback.',
      'Works as a PWA across iOS, Android, and desktop.',
    ],
    gaps: [
      'Nutrition and macro tracking is minimal — it focuses on dose and weight, not food.',
      'No rolling 7-day calorie budget.',
      'Symptom tracking is basic; no 0–10 severity scale or correlation charts.',
      'No AI assistant.',
    ],
    useThemIf:
      "You want free, no-friction dose + weight tracking and you don't need sophisticated macro tracking, AI, or correlation analytics.",
    usePlIf:
      'You want dose tracking <strong>plus</strong> full macro logging with a weekly rolling budget, plus 0–10 symptom severity, plus an AI that reads all of it together. DoseDiary is great at a slice of the problem; Protokol Lab is the whole picture.',
    matrix: [
      { feature: 'Dose tracking with half-life curves',     them: '✓',    us: '✓' },
      { feature: 'Weight tracking + trend',                 them: '✓',    us: '✓' },
      { feature: 'Calorie / macro tracking',                them: '✗',    us: '✓' },
      { feature: 'Rolling 7-day calorie budget',            them: '✗',    us: '✓' },
      { feature: 'Food barcode scanning',                   them: '✗',    us: '✓' },
      { feature: 'Symptom severity 0–10 scale',             them: '✗',    us: '✓' },
      { feature: 'Multi-compound stacks',                   them: 'partial', us: '✓' },
      { feature: 'Agentic AI assistant',                    them: '✗',    us: '✓' },
      { feature: 'Pricing',                                 them: 'Free', us: 'Free + $6.58/mo' },
    ],
    faqs: [
      {
        q: 'Can Protokol Lab do what DoseDiary does for free?',
        a: 'Yes. The free tier of Protokol Lab covers dose tracking with half-life curves, weight trend, symptom logging, and up to 3 custom compounds — the overlap with DoseDiary is essentially complete for the free feature set.',
      },
      {
        q: 'Is Protokol Lab open source like DoseDiary?',
        a: 'No. Protokol Lab is a commercial product with a free tier. DoseDiary is developer-maintained but not open source either; the free-forever model is its distinctive commitment.',
      },
    ],
  },

  'macrofactor': {
    slug: 'macrofactor',
    name: 'MacroFactor',
    tagline: 'Serious macro tracker with adaptive TDEE — best-in-class for pure nutrition tracking.',
    website: 'https://macrofactorapp.com',
    category: 'traditional',
    strengths: [
      'Deterministic adaptive algorithm adjusts macro targets weekly based on actual weight trend and intake — genuinely best-in-class for non-GLP-1 macro tracking.',
      'Fastest food logging workflow in the category. Roughly half the taps of MyFitnessPal for equivalent entry.',
      'No ads, premium-only pricing model — product-first, not ad-first.',
      'Excellent analytics: expenditure, adherence, rate of loss trending.',
    ],
    gaps: [
      'Zero GLP-1 awareness. No dose tracking, no half-life curve, no way to represent that your appetite depends on where you are in your weekly injection cycle.',
      'Daily resets. MacroFactor calibrates weekly but still expects you to hit daily macros — which the GLP-1 cycle makes impossible without a rolling budget.',
      'No symptom tracking whatsoever.',
      'Premium-only pricing means no free entry path — roughly $72/year.',
    ],
    useThemIf:
      "You're not on a GLP-1 (or you're long past titration and eating consistently across the week), you want the most sophisticated adaptive macro algorithm on the market, and daily targets work fine for your pattern.",
    usePlIf:
      "You need macro tracking that treats your week as a week. MacroFactor's weekly recalibration is smart but still hands you a daily number — a number that will be wrong for you three days out of seven on a GLP-1. Protokol Lab's rolling budget solves this explicitly.",
    matrix: [
      { feature: 'Dose tracking with half-life curves',     them: '✗',              us: '✓' },
      { feature: 'Rolling 7-day calorie budget',            them: '✗',              us: '✓', note: 'MF recalibrates weekly but still hands out daily targets' },
      { feature: 'Adaptive macro algorithm',                them: '✓',              us: 'partial', note: 'MF is best-in-class here; PL recalculates weekly from trend' },
      { feature: 'Food barcode scanning',                   them: '✓',              us: '✓' },
      { feature: 'Logging speed',                           them: 'Very fast',      us: 'Fast' },
      { feature: 'Symptom tracking',                        them: '✗',              us: '✓' },
      { feature: 'Agentic AI assistant',                    them: '✗',              us: '✓' },
      { feature: 'Ads',                                     them: '✗',              us: '✗' },
      { feature: 'Free tier',                               them: '✗',              us: '✓' },
      { feature: 'Pricing',                                 them: '~$72/yr only',   us: 'Free + $79/yr' },
    ],
    faqs: [
      {
        q: "If I love MacroFactor's algorithm, should I still switch?",
        a: "If you're on a GLP-1, probably yes — at least for the tracking side. MacroFactor's adaptive algorithm is excellent but was designed for users with consistent day-to-day appetite. On a weekly injection cycle, the assumption breaks. Protokol Lab's weekly rolling budget is built around that pattern.",
      },
      {
        q: 'Can I use both?',
        a: "Some users do, but it's friction. Logging every meal in two apps gets old fast. If your priority is GLP-1 integration, consolidate on Protokol Lab.",
      },
      {
        q: 'Does Protokol Lab have MacroFactor-style expenditure tracking?',
        a: 'Partial. Protokol Lab computes BMR and adjusts weekly targets based on trend weight, but MacroFactor is more sophisticated on pure expenditure math. Most GLP-1 users find the simpler approach is enough because medication, not exercise, is the dominant variable.',
      },
    ],
  },

  'meagain': {
    slug: 'meagain',
    name: 'MeAgain',
    tagline: 'All-in-one GLP-1 platform that unifies food logging and shot routine.',
    website: 'https://meagain.app',
    category: 'native',
    strengths: [
      'Large established user base (286,000+ subscribers) and active development cycle.',
      'Design philosophy of putting food logging inside the shot routine rather than beside it — increases daily engagement.',
      'Clinical aesthetic appeals to users who want a professional-feeling tool.',
      'Feature breadth is wide: dose, food, weight, hydration, reminders in one place.',
    ],
    gaps: [
      'Uses daily calorie resets — no rolling 7-day budget to match the appetite cycle.',
      'Macro analytics are basic; not aimed at users who care about gram-precision protein targets or lean-mass retention.',
      'Symptom tracking lacks the 0–10 severity scale.',
      'No agentic AI — logging is still manual.',
    ],
    useThemIf:
      'You want a mainstream, clinical-feeling all-in-one GLP-1 app with a big user base, and you prefer the daily-reset model.',
    usePlIf:
      'You want the same breadth (dose + food + weight + symptoms in one place) but with a rolling weekly budget instead of daily resets, granular 0–10 symptom severity, and an AI that can log food for you.',
    matrix: [
      { feature: 'Dose tracking with half-life curves',     them: '✓',    us: '✓' },
      { feature: 'Rolling 7-day calorie budget',            them: '✗',    us: '✓' },
      { feature: 'Food barcode scanning',                   them: '✓',    us: '✓' },
      { feature: 'Symptom severity 0–10 scale',             them: '✗',    us: '✓' },
      { feature: 'Agentic AI (logs food for you)',          them: '✗',    us: '✓' },
      { feature: 'Multi-compound stacks',                   them: 'partial', us: '✓' },
      { feature: 'PWA / Android / Web access',              them: '✗',    us: '✓' },
      { feature: 'Pricing',                                 them: 'Subscription', us: 'Free + $6.58/mo' },
    ],
    faqs: [
      {
        q: 'Is Protokol Lab more expensive than MeAgain?',
        a: "No — Protokol Lab has a real free tier covering dose, weight, symptoms, and basic food logging. MeAgain is subscription-only for meaningful use. Protokol Lab Premium is $9.99/mo or $79/yr; direct pricing comparison depends on MeAgain's current plans.",
      },
      {
        q: 'Why does putting food inside the shot routine matter?',
        a: "It's a retention tactic — users already open the app to log injections, so food logging piggybacks on that habit. Protokol Lab's approach is similar but adds the weekly rolling budget, so the food log doesn't just track intake — it adapts intake across the week.",
      },
    ],
  },
};

export function listComparisons() {
  return Object.values(COMPARISONS);
}

export function getComparison(slug) {
  return COMPARISONS[slug] || null;
}

/** All comparison paths registered for SEO/sitemap. */
export function comparisonPaths() {
  return Object.values(COMPARISONS).map((c) => `/compare/${c.slug}`);
}
