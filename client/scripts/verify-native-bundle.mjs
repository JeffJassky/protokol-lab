#!/usr/bin/env node
// Belt-and-suspenders check that `npm run build:native` produces a stripped
// bundle. The router excludes marketing + admin routes when VITE_APP_ONLY=1
// (`client/src/router/index.js`), but a future regression — a static import
// from an app-shipped module that pulls a marketing chunk back in — would
// land marketing JS in the App Store binary and risk an Apple 4.2
// rejection. This script fails the build if any forbidden chunk slips into
// `client/dist-native/assets/`.
//
// Run automatically by `npm run build:native`. Run manually:
//   node client/scripts/verify-native-bundle.mjs

import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assetsDir = path.resolve(__dirname, '..', 'dist-native', 'assets');

// Vite chunks file names from the source module name. Our marketing /
// admin pages produce chunks like `LandingPage-abcd1234.js`,
// `AdminLayout-….js`, `BlogIndexPage-….js`. Anything that matches one of
// these patterns is a forbidden inclusion.
const FORBIDDEN_PATTERNS = [
  /^LandingPage[-.]/,
  /^FeaturesPage[-.]/,
  /^PricingPage[-.]/,
  /^AiPage[-.]/,
  /^FaqPage[-.]/,
  /^AboutPage[-.]/,
  /^BlogIndexPage[-.]/,
  /^TirzepatideHalfLifePage[-.]/,
  /^WeeklyCalorieBudgetPage[-.]/,
  /^Glp1NauseaTimelinePage[-.]/,
  /^OzempicVsWegovyPage[-.]/,
  /^ManagingSideEffectsPage[-.]/,
  /^AdhdNutritionTrackerPage[-.]/,
  /^CompareIndexPage[-.]/,
  /^ComparisonPage[-.]/,
  /^Admin[A-Z][^-.]*Page[-.]/,
  /^AdminLayout[-.]/,
];

let entries;
try {
  entries = readdirSync(assetsDir);
} catch (err) {
  console.error(`[verify-native-bundle] Could not read ${assetsDir}: ${err.message}`);
  process.exit(2);
}

const violations = entries.filter((name) =>
  FORBIDDEN_PATTERNS.some((pattern) => pattern.test(name)),
);

if (violations.length > 0) {
  console.error('[verify-native-bundle] FAIL — forbidden chunks in dist-native:');
  for (const v of violations) console.error(`  - ${v}`);
  console.error(
    '\nThese chunks belong to marketing or admin routes and must not ship in the\n' +
    'native bundle. A static import probably leaked them in. Fix the import or\n' +
    'gate it on `import.meta.env.VITE_APP_ONLY`.',
  );
  process.exit(1);
}

console.log(`[verify-native-bundle] OK — ${entries.length} files in dist-native/assets, no forbidden chunks.`);
