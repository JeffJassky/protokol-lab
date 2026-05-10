---
title: Glossary
description: Definitions for terms used across the app and these docs.
category: reference
last_reviewed: 2026-05-10
---

# Glossary

Terms used in the app and in these docs. If a definition is wrong or missing, [open a support ticket](https://protokollab.com/support).

## A

**Active amount** — the modeled mass of a compound currently in your system, computed from your dose log and the compound's half-life and kinetics shape. The dashboard's per-compound curves plot this. See [How half-life curves work](/understanding/half-life).

**Affirmative confirmation mode** — opt-in tracking mode where past days require an explicit "Mark complete" tap to count toward rolling budgets. Default is passive. See [Tracked vs untracked days](/understanding/honest-streaks).

**Agent / AI assistant** — the chat-driven assistant that can read your data, search the web, and add or edit entries on your behalf. See [AI assistant](/ai/).

**AUC (Area Under the Curve)** — total exposure to a compound over time, computed by integrating the active-amount curve. Pharmacokinetics term; not displayed prominently in the UI.

## B

**Bateman function** — the math used to model a sub-Q or oral compound: rises (absorption) then falls (elimination). The default for self-injected peptides. See [How half-life curves work](/understanding/half-life).

**Baseline mode** — energy mode where exercise calories are tracked but don't change your daily target. Default. See [Exercise energy modes](/tracking/exercise).

**Bloodwork** — labs you've entered (HbA1c, lipids, hormones, etc.) and their reference ranges. See [Bloodwork](/tracking/bloodwork).

**BMR (Basal Metabolic Rate)** — calories your body uses at complete rest. Computed by the Mifflin-St Jeor equation from your height, weight, age, and biological sex.

**Bolus** — kinetics shape with instant peak (IV-like). One of three options for custom compounds. See [Kinetics shapes](/tracking/kinetics-shapes).

## C

**Compound** — any peptide, drug, or substance you dose on a schedule. The app distinguishes **canonical** compounds (built-in catalog: Tirzepatide, Semaglutide, etc.) from **custom** compounds (anything you add yourself).

**Confirmation mode** — see Affirmative / Passive.

**Correlation** — statistical measure of how two series move together. Reported as Pearson's r in the range -1 to +1. See [Pattern insights](/understanding/pattern-insights).

**Custom compound** — a compound you add yourself, with your own half-life, interval, and kinetics shape. See [Custom compounds](/tracking/custom-compounds).

## D

**DayStatus** — a per-day flag (tracked or untracked) that controls whether a day enters rolling-window math. See [Tracked vs untracked days](/understanding/honest-streaks).

**Day note** — free-text entry for a date. Pinned on the weight chart. See [Day notes](/tracking/journal).

**Depot** — kinetics shape with slow absorption from a tissue depot (e.g., long-acting weeklies, oil-based formulations). One of three options for custom compounds.

**Disposition** — the tracked/untracked classification for a day. See [Tracked vs untracked days](/understanding/honest-streaks).

**Dose log** — the record of a single administered dose of a compound. See [Log a dose](/tracking/log-a-dose).

## E

**Earn mode** — energy mode where exercise calories add to your daily target. For users who set TDEE to sedentary on purpose. See [Exercise energy modes](/tracking/exercise).

**Endogenous biomarker simulation** — physiological model that predicts how your hormones and biomarkers move based on your logged food, doses, exercise, and other inputs. See [Endogenous simulation](/understanding/endogenous-simulation).

**Energy mode** — controls whether logged exercise raises your daily calorie target. Three modes: baseline (default), earn, and the deprecated hidden. See [Exercise energy modes](/tracking/exercise).

**ETA** — estimated time to your goal weight, projected from your trend line. See [Trend & ETA](/understanding/trend-and-eta).

## F

**Fasting event** — a single fast (planned or actual). Recurring schedules generate events automatically; one-off fasts are added manually. See [Fasting](/tracking/fasting).

**FoodData Central** — USDA's food and nutrient database. The primary source for food data in the app. See [Food data sources](/tracking/food-data-sources).

## G

**GIPR** — gastric inhibitory polypeptide receptor. One of the targets of Tirzepatide and Retatrutide. Mentioned in simulation outputs and AI explanations.

**GLP-1 / GLP-1R** — glucagon-like peptide 1 / GLP-1 receptor. The main mechanism of Semaglutide, Tirzepatide, Liraglutide, etc.

**Glycogen** — short-term carb storage in muscle and liver. A 1–2 lb daily weight bounce often comes from glycogen + water shifts.

## H

**Half-life** — time for the active amount of a compound to drop by half. Compound-specific. See [How half-life curves work](/understanding/half-life).

**Hidden mode** — deprecated energy mode that hid exercise burn entirely. New code paths treat it as baseline.

**Honest streak** — informal name for the [tracked vs untracked days](/understanding/honest-streaks) system. Skip a day, the math doesn't pretend you ate zero.

## I

**Insight / Finding** — an automatically-detected pattern in your data, surfaced on the dashboard. See [Pattern insights](/understanding/pattern-insights).

**Interval (compound)** — how often you dose. A weekly Tirzepatide is `intervalDays: 7`.

## K

**Kinetics shape** — bolus, sub-Q, or depot. Determines the shape of the active-amount curve. See [Kinetics shapes](/tracking/kinetics-shapes).

## L

**Lag** — for correlations, how many days to shift one series before computing r. Used to detect "X precedes Y" patterns. See [Pattern insights](/understanding/pattern-insights).

**Luteal phase** — second half of the menstrual cycle (post-ovulation). Often associated with appetite changes and water retention. See [Cycle](/tracking/cycle).

## M

**Macros** — protein, fat, carbohydrates, plus calories. The four numbers most macro-tracking apps focus on.

**MET (Metabolic Equivalent)** — the energy cost of an activity relative to rest. Used to estimate exercise calories burned. `kcal = MET × kg × hours × intensity`. See [Exercise](/tracking/exercise).

**Micronutrients** — vitamins and minerals beyond the four macros. The food log tracks ~30 of them. See [Food data sources](/tracking/food-data-sources).

## N

**Nutrition score** — a 0–100 composite that scores a day against your macro targets, with asymmetric penalties (under-protein is bad, extra protein isn't; over-fat is penalized, under-fat isn't). See [Nutrition score](/understanding/nutrition-score).

## O

**ODE (Ordinary Differential Equation)** — the mathematical form used by the endogenous biomarker simulation. Describes how a quantity changes over time as a function of its current state and inputs.

**Open Food Facts (OFF)** — open-source crowdsourced food database. Used as fallback to USDA. See [Food data sources](/tracking/food-data-sources).

## P

**Partial correlation** — correlation between two series after controlling for a third. Used in pattern insights to ask "does this macro predict X *beyond* total calories?" See [Pattern insights](/understanding/pattern-insights).

**Passive confirmation mode** — default tracking mode where past days auto-track if they have food logs.

**Pattern insight** — an auto-detected correlation, change-point, or projection in your data. See [Pattern insights](/understanding/pattern-insights).

**Pearson correlation** — the standard linear correlation coefficient (r), range -1 to +1.

**Peptide** — a short chain of amino acids. Most GLP-1 drugs are peptides. The `PEPTIDE_CATALOG` in the app's core models contains canonical entries for major GLP-1s.

**PK (Pharmacokinetics)** — the study of how a drug moves through the body (absorption, distribution, metabolism, elimination). The app's dose curves are PK curves.

**PWA (Progressive Web App)** — a web app that installs to your home screen and runs like a native app. See [Install the app](/getting-started/install).

## R

**Recents** — automatically-maintained list of foods you've recently logged. Top of the food search page.

**Regression line** — the best-fit straight line through a set of points. Used for the weight trend line and ETA projection.

**Reminder** — a per-compound push notification at a chosen time of day, only on dose days. See [Log a dose](/tracking/log-a-dose).

**Rolling 7-day budget** — calorie target computed across the last 7 counted days, not per-day. See [Rolling 7-day budget](/understanding/rolling-7-day).

## S

**SignalChart** — the unified chart component used on Dashboard and Log. Supports multi-series, time range zoom, and the crosshair plugin.

**Simulation / Sim** — see Endogenous biomarker simulation.

**Spearman correlation** — rank-based correlation. Catches monotonic non-linear relationships that Pearson misses.

**Stacked doses** — multiple doses of the same or different compounds whose curves overlap in time. Modeled correctly via PK addition. See [How stacked doses combine](/understanding/stacked-doses).

**Sub-Q (subcutaneous)** — under-the-skin injection. The default kinetics shape for self-injected peptides.

**Symptom** — a tracked side effect or feeling, rated 0–10. See [Log a symptom](/tracking/log-a-symptom).

## T

**TDEE (Total Daily Energy Expenditure)** — total calories your body uses in a day (BMR + activity). The denominator of "calorie deficit" math. Computed from your activity-level setting.

**Tracked-pending** — today's disposition while it's still in progress. Counts toward budget math; converts to "tracked" or "untracked" at midnight depending on log content and confirmation mode.

**Trend line** — smoothed regression line through your weight (or any other) data. Filters daily noise. See [Trend & ETA](/understanding/trend-and-eta).

## U

**Untracked day** — a day excluded from rolling-window math. Either auto-flagged (zero logs in passive mode) or explicit (you marked it). See [Tracked vs untracked days](/understanding/honest-streaks).

**USDA** — see FoodData Central.

## W

**Waist** — circumference measurement at the navel level. Tracked alongside weight; useful for detecting recomp.

**Weekly budget** — see Rolling 7-day budget.

**Weigh-in** — a single weight entry. See [Log a weigh-in](/tracking/log-a-weigh-in).
