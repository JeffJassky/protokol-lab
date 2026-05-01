# Insights

How the dashboard's "Insights" surface ranks patterns across the user's
own data — what gets considered, what gets filtered out, and why some
relationships surface while others (deliberately) don't.

The system is intentionally opinionated. Pearson correlation is symmetric
and ignores causality, but in this domain (food → weight, dose → symptom,
etc.) some directions are physically nonsensical. The rules below encode
those priors so that what surfaces is *actionable* rather than just
statistically present.

---

## TL;DR

- **Where the math lives**: `server/src/analysis/` — `primitives.js` (pure
  math), `series.js` (DB → daily-keyed maps), `index.js` (composition).
- **What the engine returns**: a ranked list of `findings`, each carrying
  a title, a one-line claim, a 0-1 confidence, and an evidence object the
  UI uses to draw its own inline chart and an "explain in chat" prompt.
- **Pair scan covers every i<j pair** of the user's available series
  (no longer scoped to "vs weight").
- **Filters before ranking**: structural tautologies, within-domain
  pairs (except weight × waist), and lag directions that imply
  backwards causality (a symptom "leading" a compound dose, etc.).
- **Calorie control**: macro × non-nutrition pairs use partial
  correlation controlling for calories, so we don't reward "more food
  → more of every macro" trivial co-movement.
- **UI**: `InsightsCard.vue` lists findings; `InsightsChart.vue`
  renders an isolated 1-2 series chart per finding when expanded,
  with paired days emphasized as bold dots so the evidence behind the
  `r` value is visible.

---

## Architecture

```
┌────────────────────────┐    ┌──────────────────────────┐
│ DashboardPage.vue      │    │ ChatDrawer / agent       │
│  └─ InsightsCard.vue   │    │  (tools: correlate_*,    │
│      └─ InsightsChart  │    │   rank_correlations,     │
└──────────┬─────────────┘    │   series_change_points…) │
           │ /api/analysis/   └──────────┬───────────────┘
           ▼                             │ direct JS call
┌──────────────────────────────────────────────────────────┐
│ server/src/routes/analysis.js (thin HTTP wrappers)       │
└──────────┬───────────────────────────────────────────────┘
           ▼
┌──────────────────────────────────────────────────────────┐
│ server/src/analysis/index.js                             │
│  insights()  rankAllPairs()  correlate()  rankCorrelations│
│  partialCorrelate()  changePoints()  compare()  project()│
│  └─ buildCorrelationFinding / ChangePoint / Projection   │
└──────────┬─────────────────────┬─────────────────────────┘
           ▼                     ▼
   ┌──────────────────┐    ┌─────────────────────────┐
   │ analysis/series  │    │ analysis/primitives     │
   │ daily-keyed maps │    │ pearson, spearman,      │
   │ from FoodLog,    │    │ partial, regression,    │
   │ WeightLog,       │    │ change-point detect,    │
   │ DoseLog (PK),    │    │ projection, conf score  │
   │ SymptomLog…      │    └─────────────────────────┘
   └──────────────────┘
```

Two consumers share the analysis module:

1. **Dashboard's Insights surface** — calls the engine via the HTTP
   wrappers in `routes/analysis.js`.
2. **Chat agent** — calls the engine directly as JS (no HTTP hop). See
   `server/src/services/agent.js` — tools like `rank_correlations`,
   `partial_correlate`, `series_change_points`, `compare_windows`,
   `project_series`, and `get_series_daily` are thin shims.

The same `insights()` function powers both the dashboard surface and the
"RECENT INSIGHTS" block embedded in the agent's system prompt — so even
free-tier (tools-disabled) chats can reference the precomputed patterns
without a tool-call round-trip.

---

## Series and domains

The series IDs the engine knows are listed in
`series.js → listAvailableSeriesIds`:

| Domain     | IDs                                                       |
|------------|-----------------------------------------------------------|
| body       | `weight`, `waist`                                         |
| nutrition  | `calories`, `protein`, `fat`, `carbs`, `score`            |
| compound   | `dosage:<compoundId>` (per enabled compound)              |
| symptom    | `symptom:<symptomId>` (per tracked symptom)               |

Each `fetchSeriesDaily(uid, seriesId, from, to)` call returns a
`{ values: Map<isoDate, number>, unit, label, kind }` shape. Two series
are then aligned via `alignDaily(a, b, { lag })` to produce parallel
arrays for the math primitives.

Notes per series:

- **Compounds (`dosage:*`)** are *modeled*, not measured: pharmacokinetic
  active level at noon UTC each day, computed from the user's `DoseLog`
  using the compound's half-life and absorption shape (subq / depot /
  bolus).
- **Score** is derived from `calories/protein/fat/carbs` against the
  user's targets (mirror of the client formula, kept inline to avoid a
  client dep). It is by definition co-correlated with its inputs — see
  the structural-tautology filter below.
- **Symptoms** keep the *max* severity per day (worst part of the day is
  what users actually remember).

---

## The pair-scan pipeline (correlations)

`rankAllPairs(uid, { seriesIds, from, to, maxLag })` is the engine's
broad correlation scanner. It runs every unique `i<j` pair of supplied
series IDs through this gauntlet:

1. **Structural-tautology filter** — skip outright. Today this means any
   pair involving `score` and one of its component macros
   (`calories`, `protein`, `fat`, `carbs`). Score is computed *from*
   those, so a strong `r` is mathematical self-correlation.

2. **Within-domain filter** — skip pairs whose two IDs share a domain,
   with one exception (see below). Rationale: within-domain pairs are
   usually noise, not insight.
   - `nutrition × nutrition`: macros are co-recorded from one food log.
     "Calories ↔ fat" is a definitional consequence of recording either.
   - `symptom × symptom`: symptoms cluster because they reflect a single
     underlying state (GLP-1 GI cluster: nausea, gas/bloating, sulfur
     burps, constipation). Reporting "gas ↔ nausea" tells the user
     nothing they don't already feel.
   - `compound × compound`: rare in practice (most users on 1-2
     compounds). When present, usually a stack the user prescribed
     themselves — co-movement is by their design.
   - **Exception**: `body × body` — only `weight × waist`. Both can
     change independently (recomp), so the relationship is genuinely
     informative.

3. **Lag direction priors** — restrict the lag-search range based on
   what causal direction is physically plausible. Detail in the next
   section.

4. **Calorie partial-correlation** — for `macro × non-nutrition` pairs
   (e.g., `fat × waist`, `protein × nausea`, `carbs × dosage:reta`),
   the lag search runs `partialCorrelation(a, b, [calories])` instead
   of `pearson(a, b)`. The question becomes "does this macro add
   explanatory power *beyond* total calories?" rather than "did the
   user happen to eat more food on these days?".
   - Falls back to plain pearson if the partial overlap can't clear
     `MIN_N_PARTIAL` (30 days) — partial correlation needs more
     degrees of freedom than pairwise.

5. **Lag search** — inside the constrained range, find the lag
   maximizing `|r|`. Implemented as `bestLagByDate` (or
   `bestLagByDatePartial` when controlling for calories) — re-aligns
   by *calendar date* at each candidate lag, not array position, so a
   "7-day shift" really means 7 calendar days even when the user has
   gaps in their logging.

6. **Sample-size + relevance floor** — `n >= MIN_N_PAIRWISE (14)` *after*
   the lag shift, and `|r| >= MIN_R_RELEVANT (0.25)`. The post-lag
   check matters: a 19-day overlap with lag=14 leaves only 5 paired
   days, which can produce a spurious `r=0.98`.

7. **Confidence scoring** — `correlationConfidence(r, n)` ≈
   `|r| · sigmoid((n-14)/14)`. Combines magnitude with sample size so
   weak correlations on tiny samples score low even when `|r|` looks
   impressive. Used to rank rows.

The output is sorted by confidence and consumed by `insights()`, which
turns the top 6 into correlation findings.

---

## Pairing rules (lag direction priors)

The math is symmetric: `pearson(A, B) === pearson(B, A)`. Lag is not —
"A leads B by 5 days" is a specific claim. We use domain-pair rules to
restrict the lag search to causally plausible halves of the axis.

Convention used everywhere: in `bestLagByDate(A, B, …)`, **`lag > 0`
means A leads B**. So restricting to `minLag = 0` allows only A-leads-B
solutions; restricting to `maxLag = 0` allows only B-leads-A.

`lagRangeForPair(aId, bId, maxLag)` returns the allowed range:

| Pair (A × B)            | Allowed lags                | Why                                                  |
|-------------------------|-----------------------------|------------------------------------------------------|
| compound × non-compound | `[0, +maxLag]` (A leads)    | Compound dose schedule is exogenous — symptoms/body don't change a user's protocol day-to-day. |
| non-compound × compound | `[-maxLag, 0]` (B leads)    | Same rule, mirrored.                                 |
| nutrition × body        | `[0, +maxLag]` (A leads)    | Food drives weight; weight today doesn't drive food choice within 14 days.    |
| body × nutrition        | `[-maxLag, 0]` (B leads)    | Same rule, mirrored.                                 |
| nutrition × symptom     | `[-maxLag, +maxLag]`        | Bidirectional: food can cause symptoms (reflux), and symptoms can suppress eating (nausea). |
| body × symptom          | `[-maxLag, +maxLag]`        | Bidirectional: vomiting → weight loss, weight → joint pain. |
| compound × compound, etc. | (filtered out earlier)    | Within-domain skip.                                  |

This is what removes findings like "Gas/bloating rises ~8d before
Retatrutide rises" — the same underlying co-trend may instead surface
as "Retatrutide rises ~Nd before Gas/bloating rises" (if any lag in the
allowed half clears the floors), with the framing the user can
actually act on.

When the rules need to evolve (e.g., a real causal story for
body → nutrition emerges, or a new domain is added), the change is a
single edit to `lagRangeForPair`.

---

## Finding kinds

Each finding the engine emits has a stable `id`, a `kind`, a `title`,
a `claim`, a `confidence` in `[0, 1]`, and an `evidence` blob the UI
uses to draw the inline chart and the "Explain" chat prompt.

### `correlation`

The bulk of what surfaces. Built by `buildCorrelationFinding(row, …)`.

Phrasing is intentionally **symmetric** — correlation doesn't imply
causation, and in this domain effects can run either way. We just
describe co-movement, and when there's a non-zero lag we put the
leader first.

- `lag === 0`, positive: `"{A} and {B} rise and fall together"`
- `lag === 0`, negative: `"{A} rises as {B} falls"`
- lag, A leads B (`lag > 0`), positive: `"{A} rises ~{|lag|}d before {B} rises"`
- lag, A leads B, negative: `"{A} rises ~{|lag|}d before {B} falls"`
- lag, B leads A: leader/lagger flipped accordingly.

Claim line: `r=0.32 over 34 matching days` (or
`r=0.32 (controlling for calories) over 34 matching days` when calorie
partial correlation was used).

`evidence` carries `{ series: [aId, bId], range: { from, to }, lag, n,
controls }` so the inline chart can fetch the same daily series the
analysis used.

### `change-point`

`changePoints(uid, { series })` runs a sliding-window two-window
linear-fit comparison; positions where the slope shift exceeds
`minMagnitude` (default 0.5 standard deviations of the local noise)
are returned. The strongest point per series becomes a finding.

- Title: `"{Series} trend accelerated|slowed on {date}"`
- Claim: `"Slope shifted from {before} to {after} {unit}/day"`
- Evidence: `{ series: [id], range, changeDate, n }`. The inline chart
  draws a dashed vertical line at `changeDate`.

The 6-month look-back is hardcoded (regardless of the user's chart
range) — change-point questions are meaningless if scoped to one side
of a shift.

### `projection`

`project(uid, { series, target })` projects the recent linear trend
forward and reports the day the series is projected to cross the target.
Today only `weight` has a target field (`UserSettings.goalWeightLbs`),
so projections are weight-only. When other targets land (waist goal,
calorie streak), broaden in `insights()`.

- Title: `"On track to reach {target} {unit} on {date}"`
- Claim: `"Current rate {slope} {unit}/day over the last {n} days"`
- Evidence covers the last `n` days that fed the regression.

---

## Sample-size and threshold floors

| Constant            | Value | Where used                                                |
|---------------------|-------|-----------------------------------------------------------|
| `MIN_N_PAIRWISE`    | 14    | `correlate`, `rankCorrelations`, `rankAllPairs`           |
| `MIN_N_PARTIAL`     | 30    | `partialCorrelate`, `bestLagByDatePartial`                |
| `MIN_R_RELEVANT`    | 0.25  | `rankCorrelations`, `rankAllPairs`                        |
| Change-point min   | 0.5σ  | `primitives.changePoints({ minMagnitude })`               |
| Find cap            | 8     | `insights()` returns at most 8 findings                   |

These are heuristic, not derived from a hypothesis test. They were tuned
to suppress the most obvious noise without nuking legitimate findings.
If the surface starts under- or over-reporting for a real user, tune
here first.

The `correlationConfidence` function in `primitives.js` blends `|r|` and
`n`:

```
confidence ≈ |r| · sigmoid((n − 14) / 14)
```

At `n=14` the sample factor is `0.5`. At `n=42` (~3×) it's `~0.95`. At
`n=7` it's `~0.27`. The intent is that a `r=0.9` over 7 days does not
out-rank a `r=0.4` over 60.

---

## UI layer

### `InsightsCard.vue`

Lists the engine's `findings` array. Per-finding it renders:

- Kind badge (`Correlation` / `Trend shift` / `Projection`)
- Confidence bar + percentage
- Title + claim
- Two actions: `Show chart` (toggles inline chart) and `Explain` (opens
  chat drawer with `f.explainPrompt` already teed up via the
  `chatStarter` store)

Only one finding's chart is expanded at a time (`expandedId` ref) — keeps
the surface tidy and avoids spawning a chart per finding (each pulls
1-2 series fetches).

The `:active-series` prop is accepted for back-compat but the engine no
longer uses it as a filter — `insights()` scans the full series catalog.

### `InsightsChart.vue`

Self-contained per-finding chart:

- Fetches its own data via `getSeriesDaily(seriesId, from, to)` per
  series in `evidence.series` (max 2).
- Fixed **A/B colors** (CSS vars `--insights-series-a`, `-b`, default
  blue + amber) instead of the dashboard's per-series palette. Two
  warm-toned series would otherwise read as the same line.
- Dual y-axis when there are two series with different units.
- For correlation findings: computes the **paired-day set** per series.
  A's day `d` is "paired" iff B has a value at day `d + lag` (and
  vice versa). Paired days render as bold filled dots; unpaired days
  render as line-only (radius 0). So the user can see exactly which
  points contributed to the `r`, instead of guessing from the bulk
  line.
- For change-point findings: a custom plugin draws a dashed vertical
  line at `evidence.changeDate` with a label.

The inline-chart approach replaces an earlier "jump up to the dashboard
chart and activate the relevant series" affordance — that mutated the
user's chart selection and forced them to look elsewhere. In-place
keeps the evidence next to the claim.

---

## HTTP surface

`server/src/routes/analysis.js` mounts these endpoints under
`/api/analysis` (all require auth):

| Endpoint                  | Engine fn          | Notes                              |
|---------------------------|--------------------|------------------------------------|
| `GET /insights`           | `insights`         | Top-level dashboard surface.       |
| `GET /correlate`          | `correlate`        | One pair, optional lag (or `auto`).|
| `GET /correlations`       | `rankCorrelations` | Rank candidates against one target.|
| `GET /partial-correlate`  | `partialCorrelate` | Pair with explicit controls list.  |
| `GET /change-points`      | `changePoints`     | Single series, 6-month look-back.  |
| `GET /compare`            | `compare`          | Two windows, before/after.         |
| `GET /project`            | `project`          | Forward projection, optional target. |
| `GET /series`             | `getSeries`        | Raw daily values for one series.   |

The agent has matching tool declarations in `services/agent.js` —
`correlate_series`, `rank_correlations`, `partial_correlate`,
`series_change_points`, `compare_windows`, `project_series`,
`get_series_daily` — that call the same engine functions directly
(no HTTP).

---

## Math primitives

In `primitives.js`. Pure functions; no DB; no domain knowledge.

| Function                    | What it does                                                       |
|-----------------------------|--------------------------------------------------------------------|
| `pearson(xs, ys)`           | Linear correlation, clamped to `[-1, 1]`. Returns `null` for zero variance / mismatched length / `n<2`. |
| `spearman(xs, ys)`          | Pearson over rank-transformed inputs. Catches monotonic non-linear signal. |
| `linearRegression(xs, ys)`  | OLS. Returns `{ slope, intercept, residuals, r2, n }`.             |
| `partialCorrelation(a, b, controlCols)` | Multi-control partial correlation via residualization (multiple regression solved by Gaussian elimination with partial pivoting). |
| `laggedPearson(a, b, lag)`  | Pearson on position-shifted slices. Used by `bestLag` (legacy).    |
| `bestLag(a, b, maxLag)`     | Position-shift search. **Not** date-aware. Use `bestLagByDate` for gappy series. |
| `changePoints(xs, ys, opts)`| Sliding-window slope-shift detector with greedy peak-pick.         |
| `projectLinear(xs, ys, opts)` | Forward extrapolation toward an optional target value.           |
| `correlationConfidence(r, n)` | Confidence score in `[0, 1]`, monotonic in both `\|r\|` and `n`.  |

Tested in `server/test/analysis.primitives.test.js`. Adding new
math? Test it there.

---

## Where to evolve this next

Things that would meaningfully sharpen the surface, in rough priority:

1. **Symptom-cluster collapse.** When N symptoms all correlate strongly
   with each other, treat them as one cluster and only surface the
   strongest *external* finding per cluster. The within-domain skip
   already prevents symptom-symptom pairs, but a single underlying
   state can still produce 4 separate "X ↔ symptom" findings. Group
   them.

2. **Detrend before correlating.** Two monotonically rising series
   (compound dose ramping up, weight gradually changing) will
   correlate at almost any lag — the lag-search picks the best `|r|`
   but the result is dominated by trend, not relationship. Subtracting
   a rolling mean or first-differencing would isolate the
   higher-frequency signal where causation actually shows up.

3. **Multiple-comparison penalty.** With ~15 series we run ~100 pair
   correlations × 29 lags. At `r=0.25` and `n=14`, several false
   positives are expected purely by chance. A Bonferroni-ish penalty
   on `correlationConfidence` (or a permutation null) would tighten
   the floor honestly.

4. **More partial-correlation controls.** Calories is the obvious
   confounder for nutrition × X. Other useful controls: total dose
   (sum of all active compounds) for symptom × dose questions, day-of-week
   for anything cyclic.

5. **Anomaly surfacing.** Single days that deviate sharply from a
   user's distribution (a 2000-cal binge, a weight spike) are often
   what they actually want to discuss. Currently invisible to the
   correlation-and-trend lens.

6. **Routine pattern detection.** Day-of-week, time-of-month
   periodicities. The dashboard chart shows these visually but the
   engine doesn't extract them as findings.

7. **Broader projections.** Today only weight has a goal field. Surface
   waist, calorie-streak, score targets when they land in
   `UserSettings`.

When implementing any of these, the contract is: emit a finding shape
that `InsightsCard` already understands (`{ id, kind, title, claim,
confidence, importance, evidence, explainPrompt }`). The UI doesn't
need to change for new kinds — `kindBadge()` falls through to a
generic label. New visual treatments (custom annotations on the inline
chart) live in `InsightsChart.vue`.
