/**
 * Single source of truth for every public marketing URL.
 *
 * Powers:
 *   - <title>, <meta description>, OG/Twitter tags, canonical  (via useSeo)
 *   - JSON-LD schema blocks                                    (via useSeo)
 *   - OG preview images                                        (scripts/generate-og.mjs)
 *   - Prerender route list                                     (scripts/prerender.mjs)
 *   - sitemap.xml                                              (scripts/generate-sitemap.mjs)
 *
 * Adding a marketing page:
 *   1. Create the Vue component (or static HTML for blog posts)
 *   2. Add one entry below with { title, description, og, sitemap, schema }
 *   3. Register the Vue route in router/index.js if it's a SPA page
 *   4. `npm run build` — every downstream asset regenerates automatically
 *
 * Fields:
 *   title       : <title>; kept <= ~60 chars for SERP display
 *   description : <meta name="description">; kept <= ~160 chars
 *   og          : OG image copy — rendered by generate-og.mjs
 *     variant     : filename slug → /og/<variant>.png
 *     eyebrow     : small label above the headline
 *     titleLines  : array of lines; last line gets the cursor (disabled in stills)
 *     accent      : substring of titleLines that renders in primary green
 *     subtitle    : ~2-line paragraph under the headline
 *     chartVariant: which visualization to paint
 *                    'pk'       - 8-week tirzepatide PK + weight (default, used for /)
 *                    'pricing'  - 3-tier pricing card
 *                    'ai'       - agentic tool-trail
 *                    'compounds'- compound library list
 *                    'faq'      - Q&A stack
 *                    'budget'   - weekly rolling budget strip
 *                    (extendable — add a new branch in og-template.html)
 *   sitemap     : sitemap.xml fields (priority 0.0-1.0, changefreq)
 *   schema      : array of JSON-LD blocks (plain objects). Emitted per-page
 *                 by useSeo(); the site-wide Organization/WebSite schema
 *                 lives in index.html.
 *   static      : boolean, true = static HTML file (e.g. blog posts).
 *                 Prerender skips these; OG + sitemap still process them.
 */

import { COMPARISONS } from './comparisons.js';

export const ORIGIN = 'https://protokollab.com';

// ----- Shared helpers for building schema ---------------------------------
const crumb = (path, name) => ({
  '@type': 'ListItem',
  position: path === '/' ? 1 : 2,
  name,
  item: `${ORIGIN}${path}`,
});
const breadcrumb = (path, name) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: `${ORIGIN}/` },
    ...(path === '/' ? [] : [crumb(path, name)]),
  ],
});

// ----- FAQs (reused for both /faq visible content and landing schema) -----
const CORE_FAQS = [
  { q: 'Does Protokol Lab work with Mounjaro, Zepbound, Ozempic, and Wegovy?',
    a: 'Yes. Mounjaro and Zepbound are both tirzepatide. Ozempic and Wegovy are both semaglutide. Pick the compound from the built-in library and Protokol Lab handles the half-life modeling automatically.' },
  { q: 'Can I track compounded GLP-1s?',
    a: 'Yes. Use the built-in tirzepatide or semaglutide preset for compounded versions, or add a custom compound with any name and half-life.' },
  { q: 'Can I track custom or compounded compounds?',
    a: 'Yes. For FDA-approved GLP-1s, Protokol Lab ships pre-loaded pharmacokinetic defaults. For anything else — compounded versions, or compounds prescribed under a clinical trial — users can add a custom compound by entering a name and a half-life. Protokol Lab does not publish PK defaults for unapproved compounds; users supply their own values and assume responsibility for accuracy.' },
  { q: 'How accurate is the half-life curve?',
    a: 'Protokol Lab uses the Bateman equation — the standard two-compartment pharmacokinetic model for extravascular absorption. Defaults match published PK: tirzepatide ~5 days (Urva et al., 2021), semaglutide ~7 days (Lau et al., 2015). Half-life can be overridden per compound.' },
  { q: 'Is my health data private?',
    a: 'Your data stays yours. Protokol Lab does not sell, share, or monetize health data. Cloud sync is opt-in. Full JSON/CSV export is always free.' },
  { q: 'Does Protokol Lab work offline?',
    a: 'Yes. Protokol Lab is a Progressive Web App. Food, dose, weight, and symptom logging work fully offline and sync when you reconnect.' },
];
const faqSchema = (items) => ({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: items.map((f) => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  })),
});

// ----- Main registry ------------------------------------------------------
export const MARKETING_META = {
  '/': {
    title: 'Protokol Lab — GLP-1 Tracker for Tirzepatide, Semaglutide & Compounded Peptides',
    description:
      'The tracker built for GLP-1s. Half-life dose curves, weekly rolling calorie budgets, agentic AI, symptoms, weight, photos. For Tirzepatide, Semaglutide, Ozempic, Wegovy, Mounjaro, Zepbound, and compounded peptides. Free to start.',
    og: {
      variant: 'landing',
      eyebrow: 'Tirzepatide · Semaglutide · Mounjaro · Zepbound · Ozempic · Wegovy',
      titleLines: ['The tracker', 'built for GLP-1s.'],
      accent: 'built for GLP-1s.',
      subtitle: 'Dose half-life curves, weekly rolling budgets, agentic AI. For Tirzepatide, Semaglutide, and compounded peptides.',
      chartVariant: 'pk',
    },
    sitemap: { priority: 1.0, changefreq: 'weekly' },
    schema: [
      {
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: 'Protokol Lab',
        applicationCategory: 'HealthApplication',
        operatingSystem: 'Web, iOS, Android (PWA)',
        description:
          'GLP-1 tracker with dose half-life curves, rolling weekly calorie budget, and agentic AI assistant.',
        offers: [
          { '@type': 'Offer', name: 'Free', price: '0', priceCurrency: 'USD' },
          { '@type': 'Offer', name: 'Premium (monthly)', price: '9.99', priceCurrency: 'USD' },
          { '@type': 'Offer', name: 'Premium (yearly)', price: '79', priceCurrency: 'USD' },
          { '@type': 'Offer', name: 'Unlimited (monthly)', price: '19.99', priceCurrency: 'USD' },
          { '@type': 'Offer', name: 'Unlimited (yearly)', price: '149', priceCurrency: 'USD' },
        ],
      },
      faqSchema(CORE_FAQS),
    ],
  },

  '/features': {
    title: 'Features — GLP-1 Tracker | Protokol Lab',
    description:
      'Full feature reference for Protokol Lab: dose half-life modeling, rolling 7-day calorie budget, agentic AI, food library with barcode scan, saved meals, macro targets, weight trend, symptom 0–10, BMR projection, goal ETA, progress photos, offline sync, data export.',
    og: {
      variant: 'features',
      eyebrow: 'Every feature · illustrated',
      titleLines: ['Every Protokol Lab feature', 'for GLP-1 tracking.'],
      accent: 'for GLP-1 tracking.',
      subtitle: 'Food log, dose curves, weekly budget, symptoms, weight trend, agentic AI, data export. Every screen, illustrated.',
      chartVariant: 'pk',
    },
    sitemap: { priority: 0.9, changefreq: 'weekly' },
    schema: [breadcrumb('/features', 'Features')],
  },

  '/pricing': {
    title: 'Pricing — Free, Premium from $6.58/mo, Unlimited | Protokol Lab',
    description:
      'Protokol Lab pricing: Free forever, Premium at $9.99/mo or $79/year ($6.58/mo, save ~35%), Unlimited at $19.99/mo or $149/year. 14-day free trial on paid plans. AI chat, correlation charts, cloud sync, data export.',
    og: {
      variant: 'pricing',
      eyebrow: 'Pricing · Free · Premium · Unlimited',
      titleLines: ['Simple.', 'Honest. Cheap.'],
      accent: 'Honest. Cheap.',
      subtitle: 'Free forever for the core tracker. Premium from $6.58/mo. AI, correlation charts, unlimited compounds, cloud sync. 14-day free trial.',
      chartVariant: 'pricing',
    },
    sitemap: { priority: 0.9, changefreq: 'monthly' },
    schema: [
      {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: 'Protokol Lab Premium',
        description: 'GLP-1 tracker premium: AI chat, correlation charts, rolling weekly targets, unlimited custom compounds, cloud sync, data export.',
        brand: { '@type': 'Brand', name: 'Protokol Lab' },
        offers: [
          { '@type': 'Offer', name: 'Premium Monthly', price: '9.99', priceCurrency: 'USD', availability: 'https://schema.org/InStock', url: `${ORIGIN}/pricing` },
          { '@type': 'Offer', name: 'Premium Yearly', price: '79', priceCurrency: 'USD', availability: 'https://schema.org/InStock', url: `${ORIGIN}/pricing` },
        ],
      },
      {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: 'Protokol Lab Unlimited',
        description: 'Everything in Premium plus uncapped AI chat, longer conversation context, uncapped food image recognition, priority support.',
        brand: { '@type': 'Brand', name: 'Protokol Lab' },
        offers: [
          { '@type': 'Offer', name: 'Unlimited Monthly', price: '19.99', priceCurrency: 'USD', availability: 'https://schema.org/InStock' },
          { '@type': 'Offer', name: 'Unlimited Yearly', price: '149', priceCurrency: 'USD', availability: 'https://schema.org/InStock' },
        ],
      },
      breadcrumb('/pricing', 'Pricing'),
    ],
  },

  '/ai': {
    title: 'AI Coach — Agentic Assistant for GLP-1 Tracking | Protokol Lab',
    description:
      "Protokol Lab's AI is not a chatbot. It has tools — reads your full log, searches the web, creates custom foods, and writes entries directly into your day. Multi-thread history. Built for Tirzepatide, Semaglutide, Ozempic, Wegovy, Mounjaro, Zepbound.",
    og: {
      variant: 'ai',
      eyebrow: 'Agentic AI · tools, not chat',
      titleLines: ['An AI that', 'does the work.'],
      accent: 'does the work.',
      subtitle: 'Reads your log. Searches the web. Creates custom foods. Writes entries into today. Watch the tool trail.',
      chartVariant: 'ai',
    },
    sitemap: { priority: 0.8, changefreq: 'monthly' },
    schema: [breadcrumb('/ai', 'AI')],
  },

  '/compounds': {
    title: 'GLP-1 Compound Library — Half-Lives, PK, and Dose Schedules | Protokol Lab',
    description:
      'Pharmacokinetics reference for every FDA-approved GLP-1 receptor agonist: Tirzepatide (Mounjaro, Zepbound), Semaglutide (Ozempic, Wegovy, Rybelsus), Liraglutide (Saxenda, Victoza), and Dulaglutide (Trulicity). Half-lives, absorption profiles, dose intervals, and cited PK sources.',
    og: {
      variant: 'compounds',
      eyebrow: 'Compound library · PK defaults',
      titleLines: ['Every GLP-1,', 'modeled correctly.'],
      accent: 'modeled correctly.',
      subtitle: 'Tirzepatide, Semaglutide, liraglutide, dulaglutide — PK defaults for every FDA-approved GLP-1.',
      chartVariant: 'compounds',
    },
    sitemap: { priority: 0.8, changefreq: 'monthly' },
    schema: [
      {
        '@context': 'https://schema.org',
        '@type': 'MedicalWebPage',
        name: 'GLP-1 Compound Library',
        about: [
          { '@type': 'Drug', name: 'Tirzepatide', alternateName: ['Mounjaro', 'Zepbound'] },
          { '@type': 'Drug', name: 'Semaglutide', alternateName: ['Ozempic', 'Wegovy', 'Rybelsus'] },
          { '@type': 'Drug', name: 'Liraglutide', alternateName: ['Saxenda', 'Victoza'] },
          { '@type': 'Drug', name: 'Dulaglutide', alternateName: ['Trulicity'] },
        ],
        citation: [
          { '@type': 'CreativeWork', name: 'Urva S, et al. Clinical Pharmacokinetics (2021)' },
          { '@type': 'CreativeWork', name: 'Lau J, et al. Journal of Medicinal Chemistry (2015)' },
        ],
      },
      breadcrumb('/compounds', 'Compounds'),
    ],
  },

  '/faq': {
    title: 'GLP-1 Tracker FAQ — Mounjaro, Zepbound, Ozempic, Wegovy, Compounded Peptides | Protokol Lab',
    description:
      'Common questions about tracking GLP-1s with Protokol Lab: supported compounds (tirzepatide, semaglutide, liraglutide, dulaglutide, compounded versions), half-life accuracy, weekly vs daily calorie budgets, AI coach capabilities, privacy, offline mode, pricing, and refunds.',
    og: {
      variant: 'faq',
      eyebrow: 'FAQ · answered',
      titleLines: ['Questions,', 'answered.'],
      accent: 'answered.',
      subtitle: 'Mounjaro, Zepbound, Ozempic, Wegovy, compounded semaglutide and tirzepatide, half-life accuracy, privacy, offline mode, pricing.',
      chartVariant: 'faq',
    },
    sitemap: { priority: 0.8, changefreq: 'monthly' },
    schema: [
      // FaqPage builds its full schema from the page's FAQs via useFaqSchema (see FaqPage.vue)
      breadcrumb('/faq', 'FAQ'),
    ],
  },

  '/about': {
    title: 'About — Why We Built Protokol Lab | Protokol Lab',
    description:
      "Protokol Lab is a GLP-1 tracker built by GLP-1 users. We built it because generic calorie counters don't understand dose half-lives, weekly appetite patterns, or the physiology of tirzepatide and semaglutide.",
    og: {
      variant: 'about',
      eyebrow: 'About',
      titleLines: ['Built by GLP-1 users', 'for GLP-1 users.'],
      accent: 'for GLP-1 users.',
      subtitle: "Generic calorie counters don't understand dose half-lives or weekly appetite patterns. Protokol Lab does.",
      chartVariant: 'pk',
    },
    sitemap: { priority: 0.6, changefreq: 'monthly' },
    schema: [
      {
        '@context': 'https://schema.org',
        '@type': 'AboutPage',
        name: 'About Protokol Lab',
        about: { '@id': `${ORIGIN}/#organization` },
      },
      breadcrumb('/about', 'About'),
    ],
  },

  '/terms': {
    title: 'Terms of Service | Protokol Lab',
    description: 'Protokol Lab Terms of Service: what the product is, subscription billing, cancellation, refunds, acceptable use, disclaimers, liability, and contact.',
    og: {
      variant: 'legal',
      eyebrow: 'Legal · Terms of Service',
      titleLines: ['Terms of', 'Service.'],
      accent: 'Service.',
      subtitle: 'Subscription billing, acceptable use, disclaimers, liability, governing law, and contact.',
      chartVariant: 'pk',
    },
    sitemap: { priority: 0.4, changefreq: 'yearly' },
    schema: [breadcrumb('/terms', 'Terms')],
  },

  '/privacy': {
    title: 'Privacy Policy | Protokol Lab',
    description: 'Protokol Lab Privacy Policy: what data we collect, who processes it, retention, your rights (GDPR, CCPA, FIPA), and contact. We do not sell or share your health data with advertisers.',
    og: {
      variant: 'legal',
      eyebrow: 'Legal · Privacy Policy',
      titleLines: ['Privacy', 'Policy.'],
      accent: 'Policy.',
      subtitle: "What we collect, who processes it, your rights, and our commitments. We don't sell your health data.",
      chartVariant: 'pk',
    },
    sitemap: { priority: 0.4, changefreq: 'yearly' },
    schema: [breadcrumb('/privacy', 'Privacy')],
  },

  '/medical-advisory': {
    title: 'Medical Advisory & Clinical References | Protokol Lab',
    description:
      'Disclaimer, clinical references, and peer-reviewed pharmacokinetic sources used by Protokol Lab. Protokol Lab is not a medical device and does not provide medical advice.',
    og: {
      variant: 'medical-advisory',
      eyebrow: 'Medical advisory · citations',
      titleLines: ['Disclaimer. References.', 'Sources.'],
      accent: 'Sources.',
      subtitle: 'Peer-reviewed PK defaults (Urva 2021, Lau 2015, Jastreboff 2023). Bateman-equation modeling. Not a medical device.',
      chartVariant: 'pk',
    },
    sitemap: { priority: 0.6, changefreq: 'monthly' },
    schema: [
      {
        '@context': 'https://schema.org',
        '@type': 'MedicalWebPage',
        name: 'Medical Advisory — Protokol Lab',
        citation: [
          { '@type': 'CreativeWork', name: 'Urva S, et al. Clinical Pharmacokinetics (2021)' },
          { '@type': 'CreativeWork', name: 'Lau J, et al. Journal of Medicinal Chemistry (2015)' },
        ],
      },
      breadcrumb('/medical-advisory', 'Medical Advisory'),
    ],
  },

  '/compare': {
    title: 'GLP-1 Tracker Comparisons — Shotsy, MyFitnessPal, Glapp, MacroFactor | Protokol Lab',
    description:
      'Honest head-to-heads: Protokol Lab vs Shotsy, MeAgain, Glapp.io, DoseDiary, MyFitnessPal, MacroFactor. Feature matrices, pricing, and when to pick each.',
    og: {
      variant: 'compare',
      eyebrow: 'Comparisons · alternatives',
      titleLines: ['Protokol Lab vs', 'every other tracker.'],
      accent: 'every other tracker.',
      subtitle: 'Honest feature matrices and pricing against Shotsy, MyFitnessPal, Glapp.io, MacroFactor, DoseDiary, and MeAgain.',
      chartVariant: 'pk',
    },
    sitemap: { priority: 0.8, changefreq: 'monthly' },
    schema: [breadcrumb('/compare', 'Compare')],
  },

  '/blog': {
    title: 'GLP-1 Blog — Tirzepatide, Semaglutide, Compounded Peptides | Protokol Lab',
    description:
      'Educational articles on GLP-1 physiology: tirzepatide half-life, weekly calorie strategies, nausea timing, Ozempic vs Wegovy vs compounded semaglutide, and dose escalation planning.',
    og: {
      variant: 'blog',
      eyebrow: 'Blog · GLP-1 reference',
      titleLines: ['Reading for', 'GLP-1 users.'],
      accent: 'GLP-1 users.',
      subtitle: 'Pharmacokinetics, dose strategies, calorie planning, the physiology behind the tracker.',
      chartVariant: 'pk',
    },
    sitemap: { priority: 0.8, changefreq: 'weekly' },
    schema: [breadcrumb('/blog', 'Blog')],
  },

  // ----- Static blog posts (bypass SPA, served as /public/blog/*.html) -----
  // Flagged `static: true` so prerender skips them; OG + sitemap still run.
  '/blog/tirzepatide-half-life-explained.html': {
    static: true,
    title: 'Tirzepatide Half-Life Explained: Why Week 4 Feels Different | Protokol Lab',
    description: "A 5-day half-life sounds simple until you're on your fourth weekly injection and your active blood level is ~2.5× your dose.",
    og: {
      variant: 'blog-tirzepatide',
      eyebrow: 'Blog · Tirzepatide',
      titleLines: ['Why week 4', 'feels different.'],
      accent: 'feels different.',
      subtitle: "A 5-day half-life sounds simple until your fourth injection lands and your active level is ~2.5× your dose. The PK behind the ramp.",
      chartVariant: 'pk',
    },
    sitemap: { priority: 0.7, changefreq: 'monthly' },
  },
  '/blog/weekly-calorie-budget-for-glp1.html': {
    static: true,
    title: 'The Weekly Calorie Budget for GLP-1 Users | Protokol Lab',
    description: 'Why daily calorie targets fail on Ozempic, Wegovy, Mounjaro, and Zepbound — and how a 7-day rolling window fixes the problem.',
    og: {
      variant: 'blog-weekly-budget',
      eyebrow: 'Blog · Calorie strategy',
      titleLines: ['The weekly', 'calorie budget.'],
      accent: 'weekly',
      subtitle: 'Daily calorie targets fail on Ozempic, Wegovy, Mounjaro, Zepbound. A 7-day rolling window fixes the problem without asking you to overeat.',
      chartVariant: 'budget',
    },
    sitemap: { priority: 0.7, changefreq: 'monthly' },
  },
  '/blog/glp1-nausea-timeline.html': {
    static: true,
    title: 'GLP-1 Nausea Timeline: When It Peaks, When It Fades | Protokol Lab',
    description: 'Nausea patterns on tirzepatide and semaglutide are predictable. Knowing when the peak lands is the difference between white-knuckling and planning.',
    og: {
      variant: 'blog-nausea',
      eyebrow: 'Blog · Symptoms',
      titleLines: ['GLP-1 nausea', 'timeline.'],
      accent: 'nausea',
      subtitle: 'Nausea on tirzepatide and semaglutide is predictable. Knowing when the peak lands is the difference between white-knuckling and planning.',
      chartVariant: 'pk',
    },
    sitemap: { priority: 0.7, changefreq: 'monthly' },
  },
  '/blog/ozempic-vs-wegovy-vs-compounded-semaglutide.html': {
    static: true,
    title: 'Ozempic vs Wegovy vs Compounded Semaglutide: Dose Equivalencies | Protokol Lab',
    description: 'Same peptide, three deliveries. The practical differences between Ozempic, Wegovy, and compounded semaglutide — and why the tracker treats them identically.',
    og: {
      variant: 'blog-ozempic-wegovy',
      eyebrow: 'Blog · Semaglutide',
      titleLines: ['Ozempic vs Wegovy', 'vs compounded.'],
      accent: 'Wegovy',
      subtitle: 'Same peptide, three deliveries. The practical differences — and why the tracker treats them identically.',
      chartVariant: 'pk',
    },
    sitemap: { priority: 0.7, changefreq: 'monthly' },
  },
  '/blog/managing-glp1-side-effects.html': {
    static: true,
    title: 'Managing GLP-1 Side Effects: A Practical Overview | Protokol Lab',
    description: 'Educational overview of nausea, reflux, sulfur burps, constipation, diarrhea, and fatigue on Ozempic, Wegovy, Mounjaro, Zepbound — what causes each, what users commonly try, and when to call a prescriber.',
    og: {
      variant: 'blog-side-effects',
      eyebrow: 'Blog · Side effects',
      titleLines: ['Managing GLP-1', 'side effects.'],
      accent: 'side effects.',
      subtitle: 'Nausea, reflux, sulfur burps, constipation, diarrhea, fatigue. What causes each and what users commonly try. Educational overview, not medical advice.',
      chartVariant: 'pk',
    },
    sitemap: { priority: 0.8, changefreq: 'monthly' },
  },
};

// ----- Per-competitor /compare/<slug> entries ----------------------------
// Generated from comparisons.js so adding a competitor = one place (the
// comparisons registry). Each path is its own prerender/sitemap target with
// a route-specific title + FAQPage schema.
for (const cmp of Object.values(COMPARISONS)) {
  MARKETING_META[`/compare/${cmp.slug}`] = {
    title: `Protokol Lab vs ${cmp.name} — GLP-1 Tracker Comparison`,
    description: `Honest comparison of Protokol Lab vs ${cmp.name} for GLP-1 tracking. Feature matrix, pricing, and when to pick each. ${cmp.tagline}`,
    og: {
      variant: 'compare',
      eyebrow: `vs ${cmp.name}`,
      titleLines: ['Protokol Lab', `vs ${cmp.name}.`],
      accent: `vs ${cmp.name}.`,
      subtitle: `Feature matrix, pricing, and when to pick each. ${cmp.tagline}`,
      chartVariant: 'pk',
    },
    sitemap: { priority: 0.7, changefreq: 'monthly' },
    schema: [
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: (cmp.faqs || []).map((f) => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      },
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home',    item: `${ORIGIN}/` },
          { '@type': 'ListItem', position: 2, name: 'Compare', item: `${ORIGIN}/compare` },
          { '@type': 'ListItem', position: 3, name: cmp.name,  item: `${ORIGIN}/compare/${cmp.slug}` },
        ],
      },
    ],
  };
}

// ----- Helper accessors ---------------------------------------------------

/** Every marketing path, static + SPA. Used by sitemap. */
export function allPaths() {
  return Object.keys(MARKETING_META);
}

/** Only SPA routes (for prerender to drive via puppeteer). */
export function spaRoutes() {
  return Object.entries(MARKETING_META)
    .filter(([, meta]) => !meta.static)
    .map(([path]) => path);
}

/** All OG image configs, deduped by variant (scripts/generate-og.mjs). */
export function ogVariants() {
  const seen = new Set();
  const out = [];
  for (const [path, meta] of Object.entries(MARKETING_META)) {
    if (!meta.og) continue;
    const v = meta.og.variant;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push({ path, ...meta.og });
  }
  return out;
}

/** Sitemap entries with absolute URLs (scripts/generate-sitemap.mjs). */
export function sitemapEntries() {
  return Object.entries(MARKETING_META).map(([path, meta]) => ({
    loc: `${ORIGIN}${path}`,
    priority: meta.sitemap?.priority ?? 0.5,
    changefreq: meta.sitemap?.changefreq ?? 'monthly',
  }));
}

/**
 * Derive the useSeo() argument shape for a given path.
 * Returns null if the path isn't registered.
 */
export function seoConfigFor(path) {
  const meta = MARKETING_META[path];
  if (!meta) return null;
  return {
    path,
    title: meta.title,
    description: meta.description,
    ogImage: meta.og ? `/og/${meta.og.variant}.png` : undefined,
    schema: meta.schema || [],
  };
}
