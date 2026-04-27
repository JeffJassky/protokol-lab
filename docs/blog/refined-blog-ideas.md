# Refined Blog Ideas

Filtered subset of `blog-ideas.md`. Constraints applied:

1. No gray-market / off-label peptide content (BPC-157, TB-500, KLOW, MOTS-c, Retatrutide self-administration, microdosing, vial-splitting math). Brand stays clinical/cautious — same posture as the existing 5 posts.
2. No rehash of topics already shipped in `client/src/pages/blog/`.
3. Categories 3 (Tool-and-Method) and 4 (Contrarian/Corrective) only — Categories 1 and 2 from the source doc are deferred.

## Already covered — skip

| Source topic | Already shipped as |
| --- | --- |
| #17 Weekly Macro + GLP-1 half-life | `WeeklyCalorieBudgetPage.vue` |
| #28 Rigid daily macros on 5-day half-life | `WeeklyCalorieBudgetPage.vue` |
| #24 24-hour calorie reset is a myth | `WeeklyCalorieBudgetPage.vue` |
| #23 Constipation/GI slowdown metric-driven | `ManagingSideEffectsPage.vue` (constipation section) |
| #21 0–10 symptom logs vs administration times | `Glp1NauseaTimelinePage.vue` |

## Brand-incompatible — skip

| Source topic | Reason |
| --- | --- |
| #27 Most peptide protocols are mathematically flawed | Uses BPC/MOTS-c as examples — gray-market |
| #30 Stop ignoring the trough | Multi-peptide stacking framing |

## Keep — 8 net-new posts

### ADHD trio (open new audience)

**1. Building an ADHD-Friendly Nutrition Tracker** *(source #16, Tool/Method)*
Thesis: legacy macro trackers fail neurodivergent users because barcode scanning + database disambiguation taxes working memory. Decision fatigue → tracking abandonment → diet failure. Frictionless logging is an accessibility feature, not a luxury.
App tie-in: photo + voice logging.

**2. Frictionless AI Logging: Photo and Voice for Neurodivergent Dieters** *(source #20, Tool/Method)*
Thesis: computer vision + NLP collapse time-to-log from ~3 minutes to ~3 seconds. Explain what the model actually estimates from a plate photo (volume, density, macros) and where it fails. Honest about limits.
App tie-in: AI logging UX, demoed.

**3. Why Traditional Calorie Counting Apps Fail the Neurodivergent Brain** *(source #29, Contrarian)*
Thesis (contrarian companion to #1 + #2): "biggest food database wins" is the wrong design goal. 50 entries for "banana" is hostile, not helpful. Argues legacy apps are inaccessible by construction.
App tie-in: same as above, framed against MyFitnessPal-class incumbents.

### Weight-tracking pair

**4. Why Exponential Weighted Moving Averages Beat Daily Scale Data** *(source #19, Tool/Method)*
Thesis: daily scale noise (glycogen, sodium, bowels, cortisol) drowns the actual fat-loss signal. Walk through the EWMA math, show smoothed vs raw on the same dataset.
App tie-in: weight trend regression feature.

**5. Daily Weigh-Ins Cause Panic: The Case for Trend Regression** *(source #25, Contrarian)*
Thesis (contrarian companion to #4): "weigh daily for accountability" is harmful for users with eating-disorder history or scale anxiety. Same data as #4, opinion-piece framing.
App tie-in: same — paired post strategy lets one piece sell the math, the other sell the philosophy.

### Standalone reinforcements

**6. Visualizing Dose Stacking** *(source #18, Tool/Method — reframe)*
Thesis: how to read a stacked-dose chart for weekly GLP-1s. Why the "active level now" number matters more than dose-just-injected. Walk through what skipping a dose does to the curve.
**Reframe required:** drop BPC-157 / Retatrutide / MOTS-c examples from the source doc. Sema + tirz only.
App tie-in: existing `DoseStackingChart.vue` + the same chart on the dashboard. Pairs with the existing tirzepatide half-life post.

**7. Context-Aware AI Coaching: Avoiding Hyperfocus and Orthorexia** *(source #22, Tool/Method)*
Thesis: rigid "you missed your protein goal!" notifications drive neurodivergent users into restrict/binge cycles. Coaching has to know whether the user is in a medication trough, on injection day, or post-rebound — and adjust.
App tie-in: AI coach behavior, escalation logic.

**8. GLP-1s Don't Always "Cure" ADHD: The Fatigue and Anhedonia Underreport** *(source #26, Contrarian — sensitive)*
Thesis: the viral "quiet brain" narrative skips the minority experiencing worsened executive function — delayed stimulant absorption from gastric slowing, dopamine dampening, profound fatigue at peak serum.
**Tone requirement:** match the disclaimers in `ManagingSideEffectsPage.vue`. Educational, not prescriptive. Validates an experience without recommending changes to medication regimens. Save for last — earlier ADHD posts (#1–#3) establish voice and credibility first.
App tie-in: symptom correlation engine to surface patterns for prescriber conversations.

## Suggested publishing order

1. ADHD trio (#1 → #2 → #3) — coherent arc, opens new audience
2. Weight-tracking pair (#4 → #5) — same data, two framings, publish 1–2 weeks apart
3. #6 Dose-stacking visualization — reinforces existing tirz post
4. #7 Context-aware AI coaching — ties ADHD audience back to app feature
5. #8 GLP-1 + ADHD fatigue — most editorially sensitive, benefits from earlier voice-setting

## Cross-linking opportunities

- ADHD trio links into existing `WeeklyCalorieBudgetPage.vue` (calories-don't-roll-but-protein-does is ADHD-relevant).
- #4 + #5 link into existing posts via the "tracking helps here" sections both already use.
- #6 links from / to existing `TirzepatideHalfLifePage.vue` (which already uses `DoseStackingChart`).
- #8 links into existing `ManagingSideEffectsPage.vue` "Fatigue" section.

## Open questions before drafting

- Brand consistency: source doc writes "ProtokolLab" (no space, capital L); existing site uses "Protokol Lab". Confirm before any new post mentions the product.
- ADHD voice: posts #1, #3, #8 read better with first-person framing ("as someone with ADHD…"). Decide whether the founder is publicly attached to that framing on `protokollab.com`, or if the posts stay third-person.
- Disclaimer policy for #8: pre-write a stricter disclaimer block (stricter than the existing side-effects post) given the medication + neurodivergence intersection.
