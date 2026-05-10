---
title: Log a meal
description: Four ways to add food entries — search, barcode, photo, or text.
category: tracking
last_reviewed: 2026-05-10
---

# Log a meal

There are four ways to add food. Pick whichever is fastest for the meal you're logging.

## The fastest path

If you've eaten this food before, the **Recents** and **Favorites** lists at the top of the food search page have it. One tap → adjust serving count → save. Most people end up logging 80% of their meals this way.

## Method 1: Search

1. Tap **Quick Log → Food** (or the **+** in any meal section on the Log page).
2. Pick a meal: Breakfast, Lunch, Dinner, or Snack.
3. Type into the search box.
4. Pick the result that matches.
5. Adjust the serving count (defaults to 1).
6. Tap **Add**.

Search results combine three sources, in this order:

- **Your custom foods and previously logged items** (highest priority).
- **USDA FoodData Central** — the most reliable serving sizes and full micronutrient panels.
- **Open Food Facts** — broader international and long-tail coverage.

Results with known serving sizes are surfaced above results without. Items in your **Favorites** or **Recents** outrank everything.

## Method 2: Barcode scan

1. Tap **Quick Log → Food**.
2. Tap the barcode icon.
3. Point at the package barcode.

The scanner tries USDA Branded data first (which has reliable label-derived nutrients), then falls back to Open Food Facts. If both miss, you'll be prompted to add a [custom food](/tracking/custom-foods).

::: tip Native vs web
On the iOS app, the system scanner handles the camera. On the web, the scanner uses ZXing — works on most modern browsers but may need a couple of seconds to load the first time.
:::

## Method 3: Photo of your plate

::: warning Premium feature
Photo recognition is part of the AI assistant. Free tier doesn't include it.
:::

1. Open the **Chat** drawer (the chat bubble in the bottom-right).
2. Tap the camera icon.
3. Snap or upload a photo of your plate.
4. The AI identifies items, looks them up in the food databases, and adds them to today's log. Each item is logged separately.

You'll see a tool-call trail like:

```
Reading request
Identifying foods in image
Searching food library
Searching nutrition databases
Logging entries
```

If anything looks off, tap the entry to edit. The AI assistant can also fix entries — say "remove the rice from lunch" or "double the chicken portion."

## Method 4: Type or speak what you ate

::: warning Premium feature
Natural-language meal logging uses the AI assistant.
:::

In the chat drawer, type or dictate:

> "I had a bowl of chicken curry with rice and a glass of orange juice for lunch."

The AI parses the items, picks plausible portion sizes, and logs them. Confirm or edit afterward.

## Adjusting after the fact

Tap any food entry to edit:

- **Serving count** — most common edit.
- **Meal** — move from breakfast to lunch, etc.
- **Macros** — overrides for that single entry only. Custom adjustments here don't change the underlying food item.

Tap and hold (or use the row menu) to:

- **Delete** an entry.
- **Copy or move** to another day. Multi-select works the same way.
- **Mark not consumed** — see "Planning ahead" below.

## Planning ahead

Each food entry has a **Consumed** checkbox. By default it's checked when you log. To plan a future day:

1. Pick a future date in the date picker.
2. Log foods with **Consumed** unchecked.
3. As you eat each item the next day, tick the box.

Only checked entries count toward the day's calorie and macro totals and the rolling 7-day budget. Unchecked entries are visible but inert.

## Backdating

Tap the date picker on the Log page, pick any past date, and log normally. Backdated days flip from "untracked" to "tracked" automatically — see [Tracked vs untracked days](/understanding/honest-streaks).

## What happens to the data

When you save a food entry:

- The entry is stored against your account, the meal type (breakfast/lunch/dinner/snack), and the date.
- The food item is cached in your library so it shows up in **Recents** next time.
- The day's calorie and macro totals recompute.
- The rolling 7-day budget updates.
- The endogenous biomarker simulation invalidates the affected day so the next dashboard load reflects the change.

## Common questions

**"Why does the same food show different macros on different days?"**
You probably edited the entry's macros directly on one day (entry-level override) without changing the underlying food item. Open the food item from your library to make a permanent change.

**"How precise should I be?"**
Within ~10% is fine for most purposes. The trend you care about is dominated by larger movements (a missed meal, a high-fat day) more than by precise gram counts.

**"What's the difference between Recents, Favorites, and My foods?"**
- **Recents** = automatic, last things you logged.
- **Favorites** = manually starred.
- **My foods / Custom foods** = items you created yourself.

## Next

- [Saved meals](/tracking/saved-meals) — group items you eat together.
- [Custom foods](/tracking/custom-foods) — for items not in the databases.
- [Food data sources](/tracking/food-data-sources) — USDA vs Open Food Facts.
