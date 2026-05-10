---
title: Compounds settings reference
description: Every field on the Compounds page, what it controls, and where to find it.
category: reference
last_reviewed: 2026-05-10
---

# Compounds settings reference

The Compounds page (**Profile → Compounds**) lets you enable canonical compounds, add custom compounds, and configure reminders for each. This is the field-by-field reference.

## Two kinds of compounds

The page lists two kinds of rows:

### Canonical (built-in)

The catalog peptides:

- Tirzepatide
- Semaglutide
- Oral Semaglutide (Rybelsus)
- Liraglutide
- Dulaglutide
- Retatrutide

These are universal. Their **half-life**, **kinetics shape**, and **dose unit** are fixed by the catalog. You can't edit those fields. You can:

- **Enable / disable** the compound (controls whether it appears in your dose log selector and on your charts).
- **Set a reminder time** (per-compound).
- **Pick a color** for the dashboard chart.

Canonical compounds **do not count** toward your custom-compound plan limit.

### Custom

Compounds you've added yourself. Editable fields:

- **Name**
- **Half-life** (days)
- **Dose interval** (days)
- **Kinetics shape** (bolus / sub-Q / depot)
- **Dose unit** (mg / mcg / iu / ml)
- **Color**
- **Reminder time** (per-compound)
- **Enabled** state

Custom compounds **count toward** the per-tier limit (Free: 0, Premium: 3, Unlimited: ∞).

## Field reference

### Name (custom only)

Whatever you'll call this compound. 1+ characters, trimmed. Must be unique within your account (case-sensitive).

### Half-life (custom only)

In days. Decimal accepted (e.g., `0.17` for ~4 hours, `7` for weekly). Must be > 0.

The half-life drives the elimination side of the active-amount curve. See [How half-life curves work](/understanding/half-life).

### Dose interval (custom only)

In days. Decimal accepted (e.g., `0.5` for twice-daily, `1` for daily, `7` for weekly).

The interval drives:

- The **reminder system** — reminders fire on dose days inferred from `last dose + interval`.
- **No effect on the curve** — actual doses (from your dose log) drive the curve regardless of the scheduled interval.

### Kinetics shape (custom only)

One of:

- **Bolus** — instant peak, exponential decay.
- **Sub-Q** (default) — Bateman absorption, ~6h absorption half-life.
- **Depot** — Bateman absorption, ~24h absorption half-life.

See [Kinetics shapes](/tracking/kinetics-shapes) for the difference and which to pick.

### Dose unit (custom only)

One of `mg`, `mcg`, `iu`, `ml`. Choose the unit you'll log doses in.

The unit doesn't affect the math (PK is unit-agnostic). It does affect display and dose-entry semantics — make sure all your entries for one compound use the same unit.

### Color

Hex string or named CSS color. Used for the compound's curve on the dashboard chart. If unset, the chart auto-assigns a color from the palette.

### Order

Internal — determines display order. Drag rows on the Compounds page to reorder.

### Enabled (canonical and custom)

Toggle. Enabled compounds appear in:

- The dose log selector (Quick Log → Dosage).
- The dashboard's PK chart series.
- The simulation engine (canonical only — custom compounds aren't in the sim regardless).
- Pattern insights (correlations against dosage:* series).

Disabling hides the compound everywhere but doesn't delete history. Re-enable to restore.

### Reminder enabled

Toggle. When on, the app pushes a daily reminder at the chosen time, but only on **dose days** (computed from last dose + interval).

### Reminder time

`HH:MM` 24-hour format. Stored exactly as entered. Fires at this wall-clock time in the user's timezone (set on the Profile page).

The scheduler runs every minute; reminders fire within ~30 seconds of the configured time.

If you've already logged today's dose by reminder time, the reminder is suppressed (smart-skip).

### Brand names (custom only, optional)

A list of alternate names. Free-form text. Used only for display ("Generic Z (also: Brand Y)") and AI reasoning. Doesn't affect math.

### Custom compound count vs cap

Above the custom-compound list, the page shows `[count]/[cap] used`. If you're at cap, the **+ Add compound** button switches to an upgrade prompt.

## How saving works

Most fields auto-save on change with a brief "Saving…" state. Half-life, interval, and kinetics shape changes recompute the dashboard's PK curve on the next chart load.

For canonical compounds, only `enabled`, `color`, `order`, `reminderEnabled`, and `reminderTime` are stored per-user (in `UserSettings.compoundPreferences`). The catalog values are universal.

## What you can't do

- **Delete a canonical compound** — disable instead.
- **Edit a canonical compound's half-life or kinetics** — those are catalog-fixed.
- **Add a canonical compound that's not in the catalog** — use a custom for that.
- **Share a custom compound's settings to another account** — accounts are isolated.

## Related

- [Custom compounds](/tracking/custom-compounds) — when and how to add.
- [Kinetics shapes](/tracking/kinetics-shapes) — bolus / sub-Q / depot.
- [Log a dose](/tracking/log-a-dose) — using compounds after configuring.
