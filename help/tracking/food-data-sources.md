---
title: Where food data comes from
description: USDA FoodData Central, Open Food Facts, and your custom items — how the app chooses.
category: tracking
last_reviewed: 2026-05-10
---

# Where food data comes from

The app pulls food data from three sources, in this priority order. Knowing where a result came from helps when something looks off.

## The three sources

### 1. Your library (highest priority)

- **Recents** — what you've logged before.
- **Favorites** — manually starred.
- **Custom foods** — anything you've created.
- **Saved meals** — your combos.

Library results always rank above database results. If you've logged "chicken breast" before, your saved version comes up first.

### 2. USDA FoodData Central

USDA's official food database. The app prefers it for most queries because:

- **Branded data** has FDA-mandated label values — reliable serving sizes, accurate macros.
- **Foundation, SR Legacy, FNDDS** datasets have lab-analyzed micronutrient panels — far more complete than crowdsourced data.
- **Coverage** is excellent for US-market products and generic foods (chicken, rice, etc.).

When USDA returns ≥8 results (or ≥4 with serving data), the app uses it as the primary source.

### 3. Open Food Facts (fallback)

Open Food Facts (OFF) is an open, crowdsourced food database. The app uses it when:

- USDA's coverage is thin (international products, niche brands).
- The user is barcode scanning and USDA doesn't have the barcode.
- The query is otherwise ambiguous.

OFF is broader but less reliable than USDA. Some entries have missing serving sizes, missing micronutrients, or incorrect data. The app sinks results without serving sizes to the bottom of the list to filter the worst noise.

## How priority works in search

When you search:

1. The app queries your library first.
2. It queries USDA in parallel.
3. If USDA returns enough results (≥8, or ≥4 with serving sizes), USDA fills out the rest.
4. If USDA is sparse, OFF tops up the results.

Results are tagged in the UI:

- `RECENT` / `FAV` / `CUSTOM` — from your library.
- `USDA` — from USDA.
- (no tag) — from OFF.

You can prefer one source over another by favoriting or using your library aggressively.

## Barcode scanning

Different priority for barcodes:

1. **USDA Branded** first — looks up the barcode in USDA's branded foods database.
2. **OFF** if USDA misses — OFF has the broadest barcode coverage globally.
3. **Custom food prompt** if both miss.

USDA Branded has FDA-required label data, so when it has the barcode, the data is trustworthy. OFF is crowdsourced and quality varies — for poorly-covered products, you may want to verify against the package.

## What about MyFitnessPal's database?

The app does not use MyFitnessPal's data. MFP's database is closed and proprietary; there's no public API for it. USDA + OFF cover the same ground for most foods (and better for branded items).

## Per-user dedup

When a barcode result is added to your log:

- The first time, the app creates a `FoodItem` row in your account.
- Future logs of the same barcode reuse your row (so editing the macros doesn't affect anyone else).
- If the same barcode is logged by another user, they get their own row.

This means each user can edit, override, or improve foods without affecting others.

## Micronutrients

The food log captures up to ~30 nutrients beyond macros. Coverage by source:

- **USDA Foundation / SR / FNDDS** — full panels (vitamins A, C, D, E, K, B-vitamins, minerals, fiber, sugar, sodium, etc.).
- **USDA Branded** — partial panels (label-required: calories, protein, fat, carbs, sodium, fiber, sugar; sometimes more).
- **OFF** — varies widely. Many foods have just macros; some have full panels.
- **Custom foods** — whatever you enter.

If you care about micronutrients, prefer USDA when given the choice.

## Why some foods show "Serving unknown"

Both USDA Branded and OFF sometimes have incomplete data. The app marks foods without a confirmed serving size and sinks them to the bottom of search results. A food with "Serving unknown" should probably be skipped — log a similar one with a known serving instead, or create a [custom food](/tracking/custom-foods) with a serving you know.

## Common questions

**"Why does the same food appear multiple times in search?"**
Different sources (USDA + OFF), different brand entries, slight name variations. Pick the one with cleanest data and favorite it — it'll outrank the duplicates next time.

**"USDA's macros for [X] don't match the package."**
Possible causes: USDA's data is from a different brand or formulation; the package's label values are themselves rounded; USDA's data is older than current packaging. If the difference matters, override per-entry or create a custom food matching the package.

**"Can I add bulk foods from a recipe site?"**
No direct integration. Manually transcribe is the path. For users with recipe-heavy logs, custom foods + saved meals work better than trying to import.

**"Is the food data ever updated?"**
USDA and OFF update independently. New USDA releases land periodically; OFF is continuously crowdsourced. The app pulls fresh results on each search; cached items in your library don't auto-update (so your log history stays stable).

## Related

- [Log a meal](/tracking/log-a-meal) — the front door for all food logging.
- [Custom foods](/tracking/custom-foods) — when database results don't suffice.
- [Saved meals](/tracking/saved-meals) — for combos you eat repeatedly.
