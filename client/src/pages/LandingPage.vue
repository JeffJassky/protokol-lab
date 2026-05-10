<script setup>
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';
import { startCheckout } from '../api/stripe.js';
import { PLANS, PLAN_IDS } from '../../../shared/plans.js';
import { useRouteSeo } from '../composables/useSeo.js';
import { useTryDemo } from '../composables/useTryDemo.js';
import { track } from '../composables/useTracker.js';
import MarketingLayout from '../components/MarketingLayout.vue';

useRouteSeo();

const router = useRouter();
const auth = useAuthStore();
const checkoutErr = ref('');
const billingInterval = ref('yearly');

// Cold-traffic primary CTA. Mints an anonymous sandbox + drops the visitor
// on /dashboard. Authed visitors fall through to /dashboard (no demo).
// Demo is pre-register only — see docs/blog/customer-journey.md.
const { tryDemo: doTryDemo, demoStarting } = useTryDemo();
async function tryDemo(surface = 'hero') {
  try {
    await doTryDemo({ surface });
  } catch (err) {
    checkoutErr.value = err.message || 'Could not start demo';
  }
}

const premiumPlan = PLANS[PLAN_IDS.PREMIUM];
const unlimitedPlan = PLANS[PLAN_IDS.UNLIMITED];

function monthlyDisplay(plan) {
  const v = billingInterval.value === 'yearly'
    ? plan.pricing.yearlyEffectiveMonthlyUsd
    : plan.pricing.monthlyUsd;
  return v.toFixed(2);
}
function yearSavingsUsd(plan) {
  return Math.round(plan.pricing.monthlyUsd * 12 - plan.pricing.yearlyUsd);
}
function priceNote(plan) {
  const save = yearSavingsUsd(plan);
  const yr = plan.pricing.yearlyUsd;
  return billingInterval.value === 'yearly'
    ? `Billed as $${yr}/year — save $${save}`
    : `$${yr}/year — save $${save} on annual`;
}
const annualSavePct = computed(() => {
  const p = premiumPlan.pricing;
  if (!p.monthlyUsd || !p.yearlyUsd) return 0;
  return Math.round((1 - p.yearlyUsd / (p.monthlyUsd * 12)) * 100);
});

// Route a visitor through whichever signup path matches their intent.
//   goRegister()                         → free account flow
//   goRegister('premium', 'monthly')     → trial flow for a specific plan
// Logged-in visitors skip register entirely and go straight to Stripe; the
// paid intent is otherwise lost to the router's guest-redirect guard on
// /register.
async function goRegister(planId, interval, surface = 'unknown') {
  checkoutErr.value = '';
  if (!planId) {
    track('cta_click', { cta: 'signup', surface });
    router.push('/register');
    return;
  }
  track('pricing_plan_select', {
    plan: planId,
    interval: interval || 'monthly',
    surface,
  });
  if (auth.user) {
    try {
      await startCheckout(planId, interval || 'monthly');
    } catch (err) {
      checkoutErr.value = err.message || 'Could not open checkout';
    }
    return;
  }
  router.push({
    path: '/register',
    query: { plan: planId, interval: interval || 'monthly' },
  });
}

const goLogin = () => {
  track('cta_click', { cta: 'login', surface: 'hero' });
  router.push('/login');
};

// Sub-Q Bateman PK: ka ~ 6h absorption, ke from half-life in days.
// Matches the `subq` profile in SettingsPage — rises over a few hours,
// then decays at the compound's elimination rate.
function subqDose(t, mg, halfLifeDays) {
  if (t < 0) return 0;
  const ka = Math.LN2 / 0.25;
  const ke = Math.LN2 / halfLifeDays;
  if (Math.abs(ka - ke) < 1e-6) return mg * ke * t * Math.exp(-ke * t);
  return mg * (ka / (ka - ke)) * (Math.exp(-ke * t) - Math.exp(-ka * t));
}

// ---- Hero composite chart ------------------------------------------------
// 8-week tirzepatide dose-escalation panel.
//
// Two different sample resolutions:
//   weight : 1 measurement/day (57 points) — realistic weigh-in cadence,
//            rendered as individual dots. A least-squares regression line
//            through these daily dots shows the underlying trend.
//   PK     : 6 samples/day (337 points) — the sub-Q Bateman curve is
//            continuous, so high resolution keeps it smooth.
//
// Dates anchor to "today" at the right edge so the 8-week window rolls
// forward with the page — tooltip timestamps stay current.
const hero = computed(() => {
  const W = 620, H = 420;
  // Extra bottom padding leaves room for the dose pill row under the axis.
  const pad = { t: 24, r: 52, b: 60, l: 52 };
  const W0 = W - pad.l - pad.r, H0 = H - pad.t - pad.b;

  const weeks = 6;
  const days = weeks * 7;
  const dayCount = days + 1; // inclusive: 0..42
  const samplesPerDay = 6;
  const pkN = days * samplesPerDay + 1;

  const mgSteps = [2.5, 2.5, 5, 5, 7.5, 7.5];
  const doses = mgSteps.map((mg, wk) => ({ day: wk * 7, mg }));
  const halfLife = 5;

  // PK — continuous, high-res.
  const pk = new Array(pkN);
  for (let i = 0; i < pkN; i++) {
    const t = i / samplesPerDay;
    let a = 0;
    for (const d of doses) a += subqDose(t - d.day, d.mg, halfLife);
    pk[i] = a;
  }

  // Weight — one measurement per day, layered noise that reads as real
  // weigh-ins instead of a sine wave.
  //
  //   trend    : linear −14 lb over the window
  //   lowFreq  : seeded random walk, lightly smoothed → multi-day swings
  //              (the ±2 lb drift every real tracker sees on GLP-1s)
  //   highFreq : seeded per-day jitter → day-to-day hydration/scale noise
  //
  // Seeded PRNG (mulberry32) so the "random" values stay stable between
  // SSR prerender and client mount — a fresh Math.random() call set would
  // hydrate with different dot positions and cause layout flicker.
  function mulberry32(seed) {
    return function () {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rand = mulberry32(0x9e3779b9);
  const rawDrift = new Array(dayCount);
  rawDrift[0] = 0;
  for (let d = 1; d < dayCount; d++) {
    // Small step per day; occasional larger step to punctuate.
    rawDrift[d] = rawDrift[d - 1] + (rand() - 0.5) * 0.7;
  }
  // Light low-pass filter (5-day boxcar) so the drift is slow/smooth.
  const lowFreq = new Array(dayCount);
  for (let d = 0; d < dayCount; d++) {
    let s = 0, c = 0;
    for (let k = -2; k <= 2; k++) {
      const j = d + k;
      if (j >= 0 && j < dayCount) { s += rawDrift[j]; c++; }
    }
    lowFreq[d] = s / c;
  }
  const weightDaily = new Array(dayCount);
  for (let d = 0; d < dayCount; d++) {
    const tr = d / days;
    const trend = 226 - tr * 10;
    const highFreq = (rand() - 0.5) * 0.9; // ±0.45 lb daily scale noise
    weightDaily[d] = trend + lowFreq[d] + highFreq;
  }

  // Least-squares linear regression on daily weights.
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let d = 0; d < dayCount; d++) {
    sumX += d; sumY += weightDaily[d];
    sumXY += d * weightDaily[d]; sumX2 += d * d;
  }
  const slope = (dayCount * sumXY - sumX * sumY) / (dayCount * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / dayCount;
  const regStart = intercept;
  const regEnd = intercept + slope * (dayCount - 1);

  // Coordinate transforms.
  // X maps by day for weight marks, by pk sample index for the curve.
  const xByDay = (d) => pad.l + (d / days) * W0;
  const xByPkIdx = (i) => pad.l + (i / (pkN - 1)) * W0;
  const allWeights = [...weightDaily, regStart, regEnd];
  const wMin = Math.min(...allWeights) - 1;
  const wMax = Math.max(...allWeights) + 1;
  const wy = (v) => pad.t + (1 - (v - wMin) / (wMax - wMin)) * H0;
  const pkMax = Math.max(...pk) * 1.1;
  const py = (v) => pad.t + (1 - v / pkMax) * H0;

  const weightDots = weightDaily.map((v, d) => ({ x: xByDay(d), y: wy(v) }));
  const weightPath = weightDots
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ');
  const regPath = `M${xByDay(0).toFixed(1)},${wy(regStart).toFixed(1)} L${xByDay(days).toFixed(1)},${wy(regEnd).toFixed(1)}`;
  const pkPath = pk.map((v, i) => `${i === 0 ? 'M' : 'L'}${xByPkIdx(i).toFixed(1)},${py(v).toFixed(1)}`).join(' ');
  const pkArea = `${pkPath} L${xByPkIdx(pkN - 1).toFixed(1)},${pad.t + H0} L${xByPkIdx(0).toFixed(1)},${pad.t + H0} Z`;

  const grid = Array.from({ length: 5 }, (_, i) => pad.t + (i / 4) * H0);

  const now = Date.now();
  const startMs = now - days * 86400000;

  // Per-week date ticks under the axis — one label at the start of every
  // week, plus today at the right edge. Anchors per-edge so the end-caps
  // don't clip off the chart border.
  const weekLabels = [];
  for (let w = 0; w <= weeks; w++) {
    const dateMs = startMs + w * 7 * 86400000;
    const d = new Date(dateMs);
    const isToday = w === weeks;
    const label = isToday
      ? 'TODAY'
      : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    weekLabels.push({
      x: xByDay(w * 7),
      label,
      anchor: w === 0 ? 'start' : isToday ? 'end' : 'middle',
      isToday,
    });
  }

  return {
    W, H, pad, wMin, wMax, pkMax,
    weightDots, weightPath, regPath, pkPath, pkArea, grid,
    padB: pad.t + H0,
    right: W - pad.r,
    W0, H0, days, dayCount,
    pillY: pad.t + H0 + 14,
    doses: doses.map((d) => ({ ...d, x: xByDay(d.day) })),
    weekLabels,
    // Retained for hover handler — mouse x snaps to nearest day.
    weightDaily, pk, samplesPerDay, startMs,
    xByDay, wy, py,
  };
});

// ---- Hero hover state ---------------------------------------------------
// Vertical cursor + tooltip that shows date, weight, active level at
// whatever sample index the mouse is over.
const heroSvgEl = ref(null);
const heroHover = ref(null); // { idx, svgX, svgY } in viewBox coords, or null

function onHeroMove(e) {
  const svg = heroSvgEl.value;
  if (!svg) return;
  const rect = svg.getBoundingClientRect();
  const h = hero.value;
  const xViewBox = ((e.clientX - rect.left) / rect.width) * h.W;
  if (xViewBox < h.pad.l || xViewBox > h.right) { heroHover.value = null; return; }
  // Snap to nearest day. Weight data is daily, so aligning the tooltip to a
  // day boundary makes the readout match what the user actually measured.
  const t = (xViewBox - h.pad.l) / h.W0;
  const day = Math.max(0, Math.min(h.days, Math.round(t * h.days)));
  heroHover.value = { day };
}
function onHeroLeave() { heroHover.value = null; }

const heroTip = computed(() => {
  const h = hero.value;
  const hov = heroHover.value;
  if (!hov) return null;
  const d = hov.day;
  const dateMs = h.startMs + d * 86400000;
  const dt = new Date(dateMs);
  const dateLabel = dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', weekday: 'short' });
  const pkIdx = d * h.samplesPerDay;
  return {
    day: d,
    x: h.xByDay(d),
    weightY: h.wy(h.weightDaily[d]),
    pkY: h.py(h.pk[pkIdx]),
    date: dateLabel,
    weight: h.weightDaily[d].toFixed(1),
    pk: h.pk[pkIdx].toFixed(2),
  };
});

// ---- Rolling 7-day strip ------------------------------------------------
// Mirrors WeeklyBudgetStrip: vertical bars split at the daily target line —
// a normal fill segment up to target, a red overage segment above it,
// plus per-macro weekly progress with "remaining today" annotations.
const rolling = computed(() => {
  const days = [
    { d: 'Wed', cal: 2040, tgt: 2100 },
    { d: 'Thu', cal: 1340, tgt: 2100 },
    { d: 'Fri', cal: 1180, tgt: 2100 },
    { d: 'Sat', cal: 2460, tgt: 2100 },
    { d: 'Sun', cal: 2390, tgt: 2100 },
    { d: 'Mon', cal: 2100, tgt: 2100 },
    { d: 'Tue', cal: 1840, tgt: 2100, today: true },
  ];
  const weekTgt = 2100 * 7;
  const weekCons = days.reduce((a, b) => a + b.cal, 0);
  const left = weekTgt - weekCons;
  const scaleMax = Math.max(...days.map((d) => d.cal), 2100) * 1.1;
  const macros = [
    { key: 'cal', label: 'Calories', color: 'var(--color-cal)',     pct: 90, note: '260 kcal left today' },
    { key: 'p',   label: 'Protein',  color: 'var(--color-protein)', pct: 68, note: '58g left today' },
    { key: 'f',   label: 'Fat',      color: 'var(--color-fat)',     pct: 81, note: '12g left today' },
    { key: 'c',   label: 'Carbs',    color: 'var(--color-carbs)',   pct: 74, note: '38g left today' },
  ];
  return {
    days: days.map((d) => ({
      ...d,
      normalPct: Math.round((Math.min(d.cal, d.tgt) / scaleMax) * 100),
      overPct: Math.round((Math.max(0, d.cal - d.tgt) / scaleMax) * 100),
      targetPct: Math.round((d.tgt / scaleMax) * 100),
      over: d.cal > d.tgt,
    })),
    weekTgt: weekTgt.toLocaleString(),
    weekCons: weekCons.toLocaleString(),
    leftAbs: Math.abs(left).toLocaleString(),
    macros,
  };
});

// ---- Feature grid static data -------------------------------------------
const foodItems = [
  { name: 'Greek yogurt, 2% fat',        meta: '100g · 59 kcal · 9.9g P', tag: 'RECENT' },
  { name: 'Chicken breast, grilled',     meta: '100g · 165 kcal · 31g P', tag: 'FAV' },
  { name: 'Whey isolate — Vanilla',      meta: '30g · 120 kcal · 25g P',  tag: 'CUSTOM' },
  { name: 'Rx Bar — Chocolate sea salt', meta: '1 bar · 210 kcal · 12g P', tag: null },
];

const targetRows = [
  { label: 'Calories', val: 2100, unit: 'kcal', pct: 70, kind: 'cal' },
  { label: 'Protein',  val: 180,  unit: 'g',    pct: 90, kind: 'pro' },
  { label: 'Fat',      val: 65,   unit: 'g',    pct: 40, kind: 'fat' },
  { label: 'Carbs',    val: 210,  unit: 'g',    pct: 60, kind: 'carb' },
];

const mealPresets = [
  { emoji: '🍳', name: 'Standard breakfast',     kcal: 420, items: '3 items' },
  { emoji: '🥗', name: 'Post-lift chicken bowl', kcal: 680, items: '5 items' },
  { emoji: '🥤', name: 'Protein shake',          kcal: 240, items: '2 items' },
];

const months = ['Dec', 'Jan', 'Feb', 'Mar', 'Apr'];

const stats = [
  { l: 'Current', v: '207.4', u: 'lbs' },
  { l: 'Change',  v: '-18.6', u: 'lbs', good: true },
  { l: 'Avg/wk',  v: '-1.3',  u: 'lbs' },
  { l: 'To goal', v: '22.4',  u: 'lbs' },
];

const symptoms = [
  { name: 'Nausea', severity: 2 },
  { name: 'Fatigue', severity: 3 },
  { name: 'Injection site', severity: 1 },
];
function dotColor(n) {
  if (n === 0) return 'var(--primary)';
  if (n <= 3) return 'var(--color-fat)';
  if (n <= 6) return '#f97316';
  return 'var(--color-carbs)';
}

// ---- Agentic AI tool trail (Feature 03) ---------------------------------
const aiTrail = [
  { icon: '•', text: 'Reading request',                            kind: 'status' },
  { icon: '⚙', text: 'Checking your food library',                 kind: 'call'   },
  { icon: '✓', text: 'Not in library yet',                         kind: 'result' },
  { icon: '⚙', text: 'Searching the web for nutrition info',       kind: 'call'   },
  { icon: '✓', text: 'Found · 560 cal · 40g P · 31g F · 42g C',    kind: 'result' },
  { icon: '⚙', text: 'Saving as a custom food',                    kind: 'call'   },
  { icon: '✓', text: 'Added to your library',                      kind: 'result' },
  { icon: '⚙', text: 'Writing the entry to today',                 kind: 'call'   },
  { icon: '✓', text: 'Logged to lunch',                            kind: 'result' },
];
</script>

<template>
  <MarketingLayout>
    <div class="landing-root">
      <!-- HERO -->
      <section class="hero wrap">
        <div>
          <div class="eyebrow eyebrow-green">
            <span class="dot-live"></span> Tirzepatide · Semaglutide · Mounjaro
            · Zepbound · Ozempic · Wegovy
          </div>
          <h1>
            The tracker<br />
            <span class="accent"
              >built for <span class="nowrap">GLP-1s.</span></span
            ><span class="cursor"></span>
          </h1>
          <p class="hero-lead">
            Log macros, doses, weight, symptoms, and photos in one app. Built
            for Tirzepatide, Semaglutide, and compounded versions of both — with
            half-life curves, weekly rolling budgets, and an AI that reads your
            whole history.
          </p>
          <div class="hero-ctas">
            <button
              class="btn-primary"
              :disabled="demoStarting"
              @click="tryDemo('hero')"
            >
              {{ demoStarting ? 'Loading…' : "Try the demo →" }}
            </button>
            <button class="btn-secondary" @click="goRegister(null, null, 'hero')">Sign up</button>
            <button class="btn-tertiary" @click="goLogin">Sign in</button>
          </div>
          <div class="hero-meta">
            <div class="hero-meta-row">
              <span class="dot-live"></span> Installs like an app
            </div>
            <div class="hero-meta-row">
              Free to start · Premium from ${{ premiumPlan.pricing.yearlyEffectiveMonthlyUsd























              }}/mo
            </div>
            <div class="hero-meta-row">No ads · your data stays yours</div>
          </div>
        </div>
        <div class="hero-chart">
          <div class="hero-chart-head">
            <div class="hero-chart-legend">
              <span class="legend-chip"
                ><span class="swatch-dot"></span>Daily weigh-in</span
              >
              <span class="legend-chip"
                ><span class="swatch-line-dashed"></span>Trend</span
              >
              <span class="legend-chip"
                ><span class="swatch-amber"></span>Tirzepatide active</span
              >
            </div>
          </div>
          <div class="hero-chart-body">
            <svg
              ref="heroSvgEl"
              :viewBox="`0 0 ${hero.W} ${hero.H}`"
              class="block-svg hero-svg"
              role="img"
              aria-label="Weight trend over 8 weeks overlaid with tirzepatide active blood level curve and weekly dose escalation markers. Hover to inspect values."
              @mousemove="onHeroMove"
              @mouseleave="onHeroLeave"
            >
              <title>
                Weight and tirzepatide pharmacokinetic curve · 8-week dashboard
              </title>
              <line
                v-for="(y, i) in hero.grid"
                :key="i"
                :x1="hero.pad.l"
                :x2="hero.right"
                :y1="y"
                :y2="y"
                stroke="var(--border)"
                stroke-width="1"
                stroke-dasharray="1 3"
              />
              <path :d="hero.pkArea" fill="rgba(230,184,85,0.18)" />
              <!-- Tirzepatide active level: solid amber -->
              <path
                :d="hero.pkPath"
                fill="none"
                stroke="var(--color-fat)"
                stroke-width="1.75"
                opacity="0.95"
              />
              <!-- Linear regression through the daily weigh-ins: dashed,
                   drawn beneath the dots so the dots sit on top. -->
              <path
                :d="hero.regPath"
                fill="none"
                stroke="var(--primary)"
                stroke-width="1.5"
                stroke-dasharray="5 4"
                opacity="0.6"
              />
              <!-- Daily weigh-ins: connecting line + dot per day. Line
                   draws first so the dots sit on top of the joins. -->
              <path
                :d="hero.weightPath"
                fill="none"
                stroke="var(--primary)"
                stroke-width="1.75"
                stroke-linejoin="round"
                opacity="0.9"
              />
              <circle
                v-for="(p, i) in hero.weightDots"
                :key="i"
                :cx="p.x"
                :cy="p.y"
                r="2.75"
                fill="var(--primary)"
              />
              <!-- Dose markers: subtle dashed guide + amber tick on axis +
                   pill with mg label sitting below the axis (out of the way
                   of the curves). Mirrors the OG preview. -->
              <g v-for="(d, i) in hero.doses" :key="i">
                <line
                  :x1="d.x"
                  :x2="d.x"
                  :y1="hero.pad.t"
                  :y2="hero.padB"
                  stroke="var(--color-fat)"
                  stroke-width="0.6"
                  stroke-dasharray="2 3"
                  opacity="0.3"
                />
                <line
                  :x1="d.x"
                  :x2="d.x"
                  :y1="hero.padB"
                  :y2="hero.padB + 5"
                  stroke="var(--color-fat)"
                  stroke-width="1.5"
                />
                <rect
                  :x="d.x - 16"
                  :y="hero.pillY"
                  width="32"
                  height="14"
                  rx="2"
                  fill="var(--surface)"
                  stroke="var(--color-fat)"
                  stroke-width="0.75"
                />
                <text
                  :x="d.x"
                  :y="hero.pillY + 10"
                  text-anchor="middle"
                  class="svg-dose-pill"
                >
                  {{ d.mg }}mg
                </text>
              </g>
              <text
                :x="hero.pad.l - 8"
                :y="hero.pad.t + 4"
                text-anchor="end"
                class="svg-axis-green"
              >
                {{ hero.wMax.toFixed(0) }}
              </text>
              <text
                :x="hero.pad.l - 8"
                :y="hero.padB + 4"
                text-anchor="end"
                class="svg-axis-green"
              >
                {{ hero.wMin.toFixed(0) }}
              </text>
              <text
                :x="hero.pad.l - 8"
                :y="hero.pad.t - 8"
                text-anchor="end"
                class="svg-axis-tag"
              >
                WEIGHT · lbs
              </text>
              <text
                :x="hero.right + 8"
                :y="hero.pad.t + 4"
                text-anchor="start"
                class="svg-axis-amber"
              >
                {{ hero.pkMax.toFixed(1) }}
              </text>
              <text
                :x="hero.right + 8"
                :y="hero.padB + 4"
                text-anchor="start"
                class="svg-axis-amber"
              >
                0
              </text>
              <text
                :x="hero.right + 8"
                :y="hero.pad.t - 8"
                text-anchor="start"
                class="svg-axis-tag"
              >
                ACTIVE · mg
              </text>
              <!-- Weekly date ticks: one label per week, anchored so the
                   first/last labels align with the chart edges. -->
              <text
                v-for="(w, i) in hero.weekLabels"
                :key="'w' + i"
                :x="w.x"
                :y="hero.H - 6"
                :text-anchor="w.anchor"
                class="svg-axis-dim"
                :class="{ 'svg-axis-today': w.isToday }"
              >
                {{ w.label }}
              </text>
              <!-- Hover cursor: vertical line + focus dots on each curve at
                   the mouse x. Only rendered while heroTip exists. -->
              <g v-if="heroTip" class="hero-cursor" pointer-events="none">
                <line
                  :x1="heroTip.x"
                  :x2="heroTip.x"
                  :y1="hero.pad.t"
                  :y2="hero.padB"
                  stroke="var(--text)"
                  stroke-width="1"
                  stroke-dasharray="2 3"
                  opacity="0.5"
                />
                <circle
                  :cx="heroTip.x"
                  :cy="heroTip.weightY"
                  r="4"
                  fill="var(--primary)"
                  stroke="var(--bg)"
                  stroke-width="2"
                />
                <circle
                  :cx="heroTip.x"
                  :cy="heroTip.pkY"
                  r="4"
                  fill="var(--color-fat)"
                  stroke="var(--bg)"
                  stroke-width="2"
                />
              </g>
            </svg>
            <!-- Floating tooltip; positioned in viewBox-relative % so it
                 tracks the SVG's aspect-ratio resize without JS layout. -->
            <div
              v-if="heroTip"
              class="hero-tip"
              :style="{
                left: (heroTip.x / hero.W * 100) + '%',
                top:  (Math.min(heroTip.weightY, heroTip.pkY) / hero.H * 100) + '%',
              }"
            >
              <div class="hero-tip-date">{{ heroTip.date }}</div>
              <div class="hero-tip-row">
                <span class="hero-tip-swatch primary"></span>
                <span class="hero-tip-label">Weight</span>
                <span class="hero-tip-val">{{ heroTip.weight }} lb</span>
              </div>
              <div class="hero-tip-row">
                <span class="hero-tip-swatch amber"></span>
                <span class="hero-tip-label">Active</span>
                <span class="hero-tip-val">{{ heroTip.pk }} mg</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- FEATURE 01 · Dose tracking (text-only; the hero already
           illustrates the PK curve, so this section carries the narrative). -->
      <section id="features">
        <div class="wrap">
          <div class="section-head">
            <div class="eyebrow">01 · Dose tracking</div>
            <h2>
              See how much is<br /><span class="accent"
                >still in your system.</span
              >
            </h2>
            <p class="lead">
              Every dose has a half-life. Protokol Lab plots the active amount
              in real time so you know exactly how much medication is working
              right now — and why your appetite comes and goes the way it does.
              One-tap presets for Tirzepatide (Mounjaro, Zepbound), Semaglutide
              (Ozempic, Wegovy, Rybelsus), Liraglutide, and Dulaglutide.
              Compounded versions of those peptides, or anything else you need
              to track, add as a custom compound in two fields: a name and a
              half-life. The curve draws itself.
            </p>
            <ul class="feat-bullets section-bullets">
              <li>
                <span
                  ><b>Common compounds built in</b> · the popular ones,
                  pre-loaded</span
                >
              </li>
              <li>
                <span><b>Anything custom</b> · add your own in seconds</span>
              </li>
              <li>
                <span
                  ><b>Stacked doses, handled</b> · overlap is modeled
                  correctly</span
                >
              </li>
              <li>
                <span
                  ><b>Know when you're due</b> · no separate reminder app
                  needed</span
                >
              </li>
            </ul>
          </div>
        </div>
      </section>

      <!-- FEATURE 02 -->
      <section>
        <div class="wrap">
          <div class="section-head">
            <div class="eyebrow">02 · Weekly calories</div>
            <h2>
              Off day? It's fine.<br /><span class="accent"
                >Look at your week.</span
              >
            </h2>
          </div>
          <div class="feat-row reverse">
            <div class="feat-text">
              <p class="feat-body">
                <b>An off day isn't a broken streak.</b> GLP-1s flatten your
                hunger for a couple days, then it comes back — and a 24-hour
                calorie counter treats that like failure. Your target here is a
                7-day total: eat light when you can't eat, catch up when you
                can.
              </p>
              <ul class="feat-bullets">
                <li>
                  <span
                    ><b>Unused calories carry forward</b> · they don't disappear
                    at midnight</span
                  >
                </li>
                <li>
                  <span
                    ><b>Built for uneven weeks</b> · suppression days are
                    expected, not penalized</span
                  >
                </li>
                <li>
                  <span
                    ><b>Today, in context of the week</b> · every macro tells
                    you exactly how much is left for today to stay on pace</span
                  >
                </li>
              </ul>
            </div>
            <div class="feat-visual">
              <div class="hero-terminal">
                <div class="term-titlebar">
                  <div class="term-dots">
                    <span class="term-dot"></span><span class="term-dot"></span
                    ><span class="term-dot"></span>
                  </div>
                  <span class="term-title">budget · rolling 7d</span>
                </div>
                <div class="term-body" style="height: 400px;">
                  <div class="mini-pad alt">
                    <div class="rolling-header">
                      <div>
                        <div class="mini-eyebrow">7-day budget</div>
                        <div class="rolling-val">
                          {{ rolling.weekCons





































                          }}<span class="rolling-tgt">
                            / {{ rolling.weekTgt }}</span
                          >
                        </div>
                      </div>
                      <div class="right">
                        <div class="mini-eyebrow">left</div>
                        <div class="rolling-left">
                          {{ rolling.leftAbs





































                          }}<span class="rolling-unit"> kcal</span>
                        </div>
                      </div>
                    </div>
                    <div class="rolling-bars">
                      <div
                        v-for="day in rolling.days"
                        :key="day.d"
                        class="rolling-col"
                      >
                        <div
                          class="rolling-label"
                          :class="{ today: day.today }"
                        >
                          {{ day.d }}
                        </div>
                        <div
                          class="rolling-track"
                          :class="{ today: day.today }"
                        >
                          <div
                            class="rolling-fill"
                            :class="{ today: day.today }"
                            :style="{ height: day.normalPct + '%' }"
                          ></div>
                          <div
                            v-if="day.overPct > 0"
                            class="rolling-over"
                            :style="{ bottom: day.targetPct + '%', height: day.overPct + '%' }"
                          ></div>
                          <div
                            class="rolling-target"
                            :style="{ bottom: day.targetPct + '%' }"
                          ></div>
                        </div>
                        <div
                          class="rolling-value"
                          :class="{ today: day.today, over: day.over }"
                        >
                          {{ day.cal.toLocaleString() }}
                        </div>
                      </div>
                    </div>
                    <div class="rolling-macros">
                      <div
                        v-for="m in rolling.macros"
                        :key="m.key"
                        class="rolling-macro"
                      >
                        <div class="rolling-macro-head">
                          <span class="rolling-macro-label">{{ m.label }}</span>
                          <span class="rolling-macro-note">{{ m.note }}</span>
                        </div>
                        <div class="rolling-macro-bar">
                          <div
                            class="rolling-macro-fill"
                            :style="{ width: m.pct + '%', background: m.color }"
                          ></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- FEATURE 03 · AGENTIC AI -->
      <section id="ai">
        <div class="wrap">
          <div class="section-head">
            <div class="eyebrow">03 · Agentic AI</div>
            <h2>
              An assistant that<br /><span class="accent">does the work.</span>
            </h2>
            <p class="lead">
              Not a chatbot. Snap a photo of your plate or just tell it what you
              ate — the AI identifies the food, checks your library, searches
              common nutrition databases, falls back to a web search, and writes
              the entry into your day. It also knows every dose and symptom
              you've logged, so its advice is grounded in your data, not generic
              GLP-1 talking points.
            </p>
          </div>
          <div class="feat-row">
            <div class="feat-text">
              <h3 class="feat-head">
                Show it. Tell it.<br /><span class="accent">It logs it.</span>
              </h3>
              <p class="feat-body">
                Most trackers give you a chat window and call it AI. This one
                actually does things. Snap a meal photo or describe what you ate
                — it identifies the items, looks them up across your library and
                common nutrition databases, falls back to a web search if it has
                to, and writes the entries into today's log. Then it tells you
                what you've got left to hit your targets.
              </p>
              <ul class="feat-bullets">
                <li>
                  <span>
                    <b>Show it your plate</b> · photo → identification → macros
                    → log entry, end to end
                  </span>
                </li>
                <li>
                  <span>
                    <b>Looks everywhere</b> · your library first, then common
                    nutrition databases, then web search as fallback
                  </span>
                </li>
                <li>
                  <span>
                    <b>Knows your context</b> · every food, dose, weigh-in,
                    symptom, and note is available — every answer is grounded in
                    your data
                  </span>
                </li>
                <li>
                  <span>
                    <b>Hits your numbers</b> · "340 kcal and 80g protein to go"
                    — and a list of foods from your library that get you there
                  </span>
                </li>
                <li>
                  <span>
                    <b>Reads symptoms with doses</b> · why the nausea is hitting
                    on day 2, why your hunger comes back day 4
                  </span>
                </li>
              </ul>
            </div>
            <div class="feat-visual">
              <div class="hero-terminal">
                <div class="term-body" style="padding: 0;">
                  <div class="aichat">
                    <div class="aichat-msg user">
                      <div class="aichat-tag">You</div>
                      <div>I just ate a Sweetgreen Kale Caesar at lunch.</div>
                    </div>
                    <div class="aichat-msg ai">
                      <div class="aichat-tag">AI Coach</div>
                      <ol class="trail">
                        <li
                          v-for="(t, i) in aiTrail"
                          :key="i"
                          class="trail-item"
                          :class="t.kind"
                        >
                          <span class="trail-icon">{{ t.icon }}</span>
                          <span class="trail-text">{{ t.text }}</span>
                        </li>
                      </ol>
                      <div class="ai-final">
                        Logged. You're at <b>1,240 cal</b>, 340 to go for the
                        day. Protein's at 92g — you'll want another shake before
                        bed to hit 180.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- FEATURE GRID -->
      <section>
        <div class="wrap">
          <div class="section-head">
            <div class="eyebrow">Core · Free forever</div>
            <h2>
              Everything else you'd want.<br /><span class="accent"
                >Faster than you're used to.</span
              >
            </h2>
            <p class="lead">
              If you're coming from MyFitnessPal, you won't miss a thing.
              Barcode scanning, custom foods, saved meals, targets — it's all
              here, and it's all quick.
            </p>
          </div>
          <div class="fg">
            <!-- 01 Food library -->
            <div class="fg-cell">
              <div class="fg-label">
                <span class="num">01</span>FOOD LIBRARY
              </div>
              <div class="fg-title">Scan, search, done.</div>
              <div class="fg-body">
                Scan a barcode and it's logged. Build your own foods with exact
                macros. Your recents and favorites are right where you expect
                them.
              </div>
              <div class="mini-ui">
                <div class="mini-pad alt">
                  <div class="food-search">
                    <span class="food-search-icon">⌕</span>
                    <span class="food-search-text"
                      >greek yog<span class="caret">|</span></span
                    >
                    <span class="food-scan">⧠ scan</span>
                  </div>
                  <div v-for="(it, i) in foodItems" :key="i" class="food-row">
                    <div class="food-info">
                      <div class="food-name">{{ it.name }}</div>
                      <div class="food-meta">{{ it.meta }}</div>
                    </div>
                    <div v-if="it.tag" class="food-tag">{{ it.tag }}</div>
                    <div class="food-add">+</div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 02 Meals -->
            <div class="fg-cell">
              <div class="fg-label"><span class="num">02</span>MEALS</div>
              <div class="fg-title">Repeat your good days.</div>
              <div class="fg-body">
                Save a combo of foods as a meal you can re-log with one tap.
                "Usual breakfast" stops taking two minutes.
              </div>
              <div class="mini-ui">
                <div class="mini-pad alt">
                  <div v-for="(m, i) in mealPresets" :key="i" class="meal-row">
                    <span class="meal-emoji">{{ m.emoji }}</span>
                    <div class="meal-info">
                      <div class="meal-name">{{ m.name }}</div>
                      <div class="meal-items">{{ m.items }}</div>
                    </div>
                    <div class="meal-kcal">
                      {{ m.kcal }} <span class="dim">kcal</span>
                    </div>
                    <div class="food-add">+</div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 03 Targets -->
            <div class="fg-cell">
              <div class="fg-label"><span class="num">03</span>TARGETS</div>
              <div class="fg-title">Pick your own numbers.</div>
              <div class="fg-body">
                Set calories, protein, fat, and carbs the way you want. Change
                them whenever your goals shift — they drive the week view,
                nutrition score, and AI assistant.
              </div>
              <div class="mini-ui">
                <div class="mini-pad alt targets-pad">
                  <div
                    v-for="r in targetRows"
                    :key="r.label"
                    class="target-row"
                  >
                    <div class="target-head">
                      <span class="target-label">{{ r.label }}</span>
                      <span class="target-val">{{ r.val }} {{ r.unit }}</span>
                    </div>
                    <div class="target-track">
                      <div
                        class="target-fill"
                        :class="`kind-${r.kind}`"
                        :style="{ width: r.pct + '%' }"
                      ></div>
                    </div>
                  </div>
                  <div class="target-auto">
                    ⚙ Powers today's plan · week view · score
                  </div>
                </div>
              </div>
            </div>

            <!-- 04 Symptoms -->
            <div class="fg-cell">
              <div class="fg-label">
                <span class="num">04</span>HOW YOU FEEL
              </div>
              <div class="fg-title">Log it in three seconds.</div>
              <div class="fg-body">
                Nausea, fatigue, injection site, anything. Rate it 0 to 10 and
                you're done. Later, see how it all lines up with your doses.
              </div>
              <div class="mini-ui">
                <div class="mini-pad alt symptoms-pad">
                  <div v-for="s in symptoms" :key="s.name" class="symptom-row">
                    <span class="symptom-name">{{ s.name }}</span>
                    <div class="symptom-dots">
                      <div
                        v-for="n in 11"
                        :key="n"
                        class="sym-dot"
                        :class="{ active: (n - 1) === 0 ? s.severity === 0 : s.severity >= (n - 1) }"
                        :style="((n - 1) === 0 ? s.severity === 0 : s.severity >= (n - 1)) ? { background: dotColor(n - 1), borderColor: dotColor(n - 1) } : {}"
                      >
                        {{ n - 1 }}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 05 Weight/waist -->
            <div class="fg-cell">
              <div class="fg-label">
                <span class="num">05</span>WEIGHT + WAIST
              </div>
              <div class="fg-title">The trend, not the noise.</div>
              <div class="fg-body">
                Daily weigh-ins smoothed into a trend line, so one bad morning
                doesn't throw you off. Weekly average and where you're headed,
                always visible.
              </div>
              <div class="mini-ui">
                <div class="mini-pad alt stats-grid">
                  <div v-for="s in stats" :key="s.l" class="stat-cell">
                    <div class="stat-label">{{ s.l }}</div>
                    <div class="stat-val" :class="{ good: s.good }">
                      {{ s.v }}<span class="stat-unit"> {{ s.u }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 06 Photos -->
            <div class="fg-cell">
              <div class="fg-label">
                <span class="num">06</span>PROGRESS PHOTOS
              </div>
              <div class="fg-title">The scale lies. Photos don't.</div>
              <div class="fg-body">
                Monthly shots attached to your account. Swipe between any two
                months to see what actually changed.
              </div>
              <div class="mini-ui">
                <div class="mini-pad alt">
                  <div class="photos-strip">
                    <div v-for="m in months" :key="m" class="photo-tile">
                      <span class="photo-label">{{ m }}</span>
                    </div>
                  </div>
                  <div class="photos-meta">
                    5 months · -18.6 lbs ·
                    <span class="accent">▸ compare side-by-side</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- MORE FEATURES CALLOUT -->
      <section class="more-features">
        <div class="wrap">
          <div class="section-head center">
            <div class="eyebrow center">Core · Free forever</div>
            <h2>
              That's the sales pitch.<br /><span class="accent"
                >See the full tour.</span
              >
            </h2>
            <p class="lead">
              Food library, saved meals, macro targets, BMR projections, goal
              countdown, progress photos, push reminders, custom symptoms, day
              notes, data export. Every feature illustrated with a real screen
              from the app.
            </p>
            <div class="more-cta">
              <a href="/features" class="btn-secondary"
                >Browse all features →</a
              >
            </div>
          </div>
        </div>
      </section>

      <!-- PRICING -->
      <section class="pricing" id="pricing">
        <div class="wrap">
          <div class="section-head center">
            <div class="eyebrow center">Pricing</div>
            <h2>Simple. Honest. Cheap.</h2>
            <p class="pricing-sub">
              Try any paid plan free for 14 days. Cancel anytime before the
              trial ends — no charge.
            </p>
          </div>
          <div
            class="price-toggle"
            role="tablist"
            aria-label="Billing interval"
          >
            <button
              type="button"
              class="price-toggle-btn"
              :class="{ active: billingInterval === 'monthly' }"
              role="tab"
              :aria-selected="billingInterval === 'monthly'"
              @click="billingInterval = 'monthly'"
            >
              Monthly
            </button>
            <button
              type="button"
              class="price-toggle-btn"
              :class="{ active: billingInterval === 'yearly' }"
              role="tab"
              :aria-selected="billingInterval === 'yearly'"
              @click="billingInterval = 'yearly'"
            >
              Yearly
              <span class="price-save-tag">save {{ annualSavePct }}%</span>
            </button>
          </div>
          <div class="price-cards three">
            <div class="price-card">
              <div class="price-kind">Free</div>
              <div class="price-amount">
                $0<span class="per"> / forever</span>
              </div>
              <div class="price-desc">
                Enough to actually run your week. No credit card, no trial
                timer.
              </div>
              <ul class="price-feats">
                <li>Food log, meals, barcode scan</li>
                <li>Weight and waist tracking</li>
                <li>Symptoms and notes</li>
                <li>Dose tracking with half-life curves</li>
                <li>Rolling 7-day calorie budget</li>
                <li>Progress photos with side-by-side compare</li>
              </ul>
              <button class="btn-secondary wide" @click="goRegister(null, null, 'pricing_free')">
                Get started
              </button>
            </div>
            <div class="price-card featured">
              <div class="price-kind accent">Premium</div>
              <div class="price-amount">
                ${{ monthlyDisplay(premiumPlan)























                }}<span class="per"> / month</span>
              </div>
              <div class="price-desc">
                Everything in Free, plus the tools that turn your data into
                answers.
              </div>
              <ul class="price-feats">
                <li>AI chat that reads your data</li>
                <li>Correlation charts, any two measurements</li>
                <li>Deeper dose charts and stats</li>
                <li>Unlimited custom compounds</li>
                <li>Cloud sync across devices</li>
                <li>Export all your data, anytime</li>
              </ul>
              <button
                class="btn-primary wide"
                @click="goRegister(premiumPlan.id, billingInterval, 'pricing_premium')"
              >
                Start {{ premiumPlan.pricing.trialDays }}-day free trial →
              </button>
              <div class="price-trial-note">{{ priceNote(premiumPlan) }}</div>
            </div>
            <div class="price-card">
              <div class="price-kind">Unlimited</div>
              <div class="price-amount">
                ${{ monthlyDisplay(unlimitedPlan)























                }}<span class="per"> / month</span>
              </div>
              <div class="price-desc">
                Everything in Premium, with the AI coach uncapped. For heavy
                users who live in the chat.
              </div>
              <ul class="price-feats">
                <li>Unlimited AI messages per day</li>
                <li>Longer conversation context</li>
                <li>Food image recognition, uncapped</li>
                <li>Priority support</li>
              </ul>
              <button
                class="btn-secondary wide"
                @click="goRegister(unlimitedPlan.id, billingInterval, 'pricing_unlimited')"
              >
                Start {{ unlimitedPlan.pricing.trialDays }}-day free trial →
              </button>
              <div class="price-trial-note">{{ priceNote(unlimitedPlan) }}</div>
            </div>
          </div>
        </div>
      </section>

      <!-- FINAL CTA -->
      <section id="cta" class="final-cta">
        <div class="wrap">
          <h2>
            Stop guessing.<br /><span class="accent">Start tracking.</span>
          </h2>
          <p>
            Food, doses, weight, how you feel — one app, one place. See what's
            actually working for you.
          </p>
          <div class="end-ctas">
            <button
              class="btn-primary big"
              :disabled="demoStarting"
              @click="tryDemo('landing_end')"
            >
              {{ demoStarting ? 'Loading…' : 'Try the demo →' }}
            </button>
            <button class="btn-secondary big" @click="goRegister(null, null, 'landing_end')">
              Sign up free
            </button>
          </div>
        </div>
      </section>
    </div>
  </MarketingLayout>
</template>

<style scoped>
/* ---- Root --------------------------------------------------------- */
.landing-root {
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-mono);
  font-size: 14px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  min-height: 100vh;
  position: relative;
  overflow-x: clip;
}

/* Scanline + vignette — scoped to landing only */
.scanlines {
  position: fixed; inset: 0; pointer-events: none; z-index: 100;
  background:
    repeating-linear-gradient(
      to bottom,
      rgba(91, 245, 145, 0.018) 0,
      rgba(91, 245, 145, 0.018) 1px,
      transparent 1px,
      transparent 3px
    ),
    radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.35) 100%);
}

.wrap { max-width: 1240px; margin: 0 auto; padding: 0 32px; }

/* ---- Nav ---------------------------------------------------------- */
.nav {
  position: sticky; top: 0; z-index: 20;
  background: color-mix(in srgb, var(--bg) 85%, transparent);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--border);
}
.nav-inner { display: flex; align-items: center; gap: 28px; padding: 14px 0; }
.logo {
  display: inline-flex; align-items: center; gap: 10px;
  font-weight: 700; letter-spacing: 0.02em; font-size: 15px;
  color: var(--text);
}
.logo-mark { display: inline-flex; color: var(--text); }
.nav-links { display: flex; gap: 22px; margin-left: auto; }
.nav-link {
  font-size: 12px; color: var(--text-tertiary);
  text-transform: uppercase; letter-spacing: 0.12em;
  transition: color .15s;
}
.nav-link:hover { color: var(--text); }
.nav-cta {
  font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase;
  padding: 8px 16px; border: 1px solid var(--primary);
  color: var(--primary); font-weight: 600;
  background: transparent; cursor: pointer;
  transition: background .15s, color .15s;
  font-family: inherit;
}
.nav-cta:hover { background: var(--primary); color: var(--bg); }

/* ---- Eyebrow ------------------------------------------------------ */
.eyebrow {
  font-size: 11px; color: var(--text-tertiary);
  text-transform: uppercase; letter-spacing: 0.18em;
  display: inline-flex; align-items: center; gap: 10px;
  margin-bottom: 20px;
}
.eyebrow::before {
  content: ''; width: 24px; height: 1px; background: var(--text-tertiary);
}
.eyebrow.center { justify-content: center; }
.eyebrow-green { color: var(--primary); }
.eyebrow-green::before { background: var(--primary); }

/* ---- Hero --------------------------------------------------------- */
.hero {
  padding-top: 72px; padding-bottom: 96px;
  display: grid; grid-template-columns: 1fr 1.18fr; gap: 64px;
  align-items: center;
  border-bottom: 1px solid var(--border);
}
/* Hero chart — no chrome, floats. Legend + LIVE sit above the SVG.
 * Matches scripts/og-template.html so the OG preview mirrors the live page. */
.hero-chart {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
}
.hero-chart-head {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-tertiary);
}
.hero-chart-legend { display: flex; gap: 18px; align-items: center; justify-content: center; flex-wrap: wrap; }
.legend-chip { display: inline-flex; gap: 8px; align-items: center; }
.swatch-line { width: 20px; height: 2px; background: var(--primary); }
.swatch-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--primary); }
.swatch-line-dashed {
  width: 20px; height: 2px;
  background: repeating-linear-gradient(90deg, var(--primary) 0 5px, transparent 5px 9px);
  opacity: 0.7;
}
.swatch-amber { width: 20px; height: 2px; background: var(--color-fat); }
.hero-chart-live {
  color: var(--primary);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
}
.hero-chart-body { width: 100%; position: relative; }
.hero-svg { cursor: crosshair; }

/* Floating tooltip — positioned as % of the SVG container so it rides the
 * chart's aspect-ratio resize. pointer-events disabled so it doesn't
 * interrupt mousemove tracking on the SVG. */
.hero-tip {
  position: absolute;
  transform: translate(-50%, calc(-100% - 12px));
  padding: 10px 12px;
  background: var(--surface);
  border: 1px solid var(--border-strong);
  box-shadow: 0 4px 20px rgba(0,0,0,0.4);
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.4;
  white-space: nowrap;
  pointer-events: none;
  z-index: 2;
}
.hero-tip-date {
  font-size: 10px;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 6px;
}
.hero-tip-row { display: flex; align-items: center; gap: 8px; }
.hero-tip-swatch { width: 10px; height: 10px; border-radius: 50%; }
.hero-tip-swatch.primary { background: var(--primary); }
.hero-tip-swatch.amber   { background: var(--color-fat); }
.hero-tip-label { color: var(--text-secondary); min-width: 50px; }
.hero-tip-val { color: var(--text); font-weight: 600; }
.hero h1 {
  font-family: var(--font-display);
  font-size: 64px; line-height: 1;
  margin: 0 0 28px;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.accent { color: var(--primary); }
.cursor {
  display: inline-block; width: 0.55em; height: 1em;
  background: var(--primary); vertical-align: -0.12em;
  animation: blink 1.1s steps(2) infinite;
  margin-left: 4px;
}
@keyframes blink { 50% { opacity: 0; } }
.hero-lead {
  font-size: 15px; color: var(--text-secondary);
  max-width: 460px; line-height: 1.6;
  margin-bottom: 32px;
}
.hero-ctas { display: flex; gap: 12px; align-items: center; }
.btn-primary {
  padding: 14px 22px; background: var(--primary); color: var(--bg);
  font-weight: 700; font-size: 13px;
  letter-spacing: 0.08em; text-transform: uppercase;
  border: none; cursor: pointer; font-family: inherit;
  transition: background .15s, transform .15s;
}
.btn-primary:hover {
  background: var(--primary-hover); transform: translate(-1px, -1px);
  box-shadow: 3px 3px 0 var(--primary-dim);
}
.btn-primary.wide { width: 100%; }
.btn-primary.big { font-size: 14px; padding: 16px 28px; }
.btn-secondary.big { font-size: 14px; padding: 16px 28px; }
.end-ctas { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
.btn-secondary {
  padding: 14px 22px; background: transparent; color: var(--text);
  border: 1px solid var(--border-strong); font-weight: 600; font-size: 13px;
  letter-spacing: 0.08em; text-transform: uppercase;
  cursor: pointer; font-family: inherit;
  transition: border-color .15s, color .15s;
}
.btn-secondary:hover { border-color: var(--primary); color: var(--primary); }
.btn-secondary.wide { width: 100%; }
.btn-tertiary {
  padding: 14px 12px; background: transparent; color: var(--text-secondary);
  border: none; font-weight: 600; font-size: 13px;
  letter-spacing: 0.08em; text-transform: uppercase;
  cursor: pointer; font-family: inherit;
  transition: color .15s;
}
.btn-tertiary:hover { color: var(--text); }
.hero-meta {
  margin-top: 36px;
  font-size: 11px; color: var(--text-tertiary);
  letter-spacing: 0.08em;
  display: flex; gap: 24px; flex-wrap: wrap;
}
.hero-meta-row { display: flex; align-items: center; gap: 8px; }
.dot-live {
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--primary); box-shadow: 0 0 8px var(--primary);
  animation: pulse 2s infinite;
}
@keyframes pulse { 50% { opacity: 0.4; } }

/* ---- Terminal shell ---------------------------------------------- */
.hero-terminal {
  background: var(--surface);
  border: 1px solid var(--border);
  overflow: hidden;
  box-shadow: var(--shadow-l);
  position: relative;
}
.term-titlebar {
  display: flex; align-items: center; padding: 10px 14px;
  background: var(--surface-alt); border-bottom: 1px solid var(--border);
  font-size: 10px; color: var(--text-tertiary);
  text-transform: uppercase; letter-spacing: 0.12em;
}
.term-dots { display: flex; gap: 6px; margin-right: 14px; }
.term-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--border-strong); }
.term-title { flex: 1; font-weight: 600; }
.term-badge {
  color: var(--primary); display: inline-flex; align-items: center; gap: 6px;
}
.term-body { background: var(--surface); overflow: hidden; }

/* SVG helpers */
.block-svg { width: 100%; height: auto; display: block; }
.svg-dose-label { font-size: 9px; font-weight: 700; fill: var(--bg); font-family: var(--font-mono); }
.svg-dose-pill  { font-size: 9px; font-weight: 700; fill: var(--color-fat); font-family: var(--font-mono); }
.svg-axis-green { font-size: 10px; fill: var(--primary); font-family: var(--font-mono); }
.svg-axis-amber { font-size: 10px; fill: var(--color-fat); font-family: var(--font-mono); }
.svg-axis-dim   { font-size: 9px;  fill: var(--text-tertiary); font-family: var(--font-mono); }
.svg-axis-today { fill: var(--primary); font-weight: 600; }
.svg-axis-tag   { font-size: 9px;  fill: var(--text-tertiary); font-family: var(--font-mono); text-transform: uppercase; letter-spacing: 0.08em; }

/* ---- Sections ----------------------------------------------------- */
section { padding-top: 96px; padding-bottom: 96px; border-bottom: 1px solid var(--border); }
section.hero { padding-top: 72px; padding-bottom: 96px; }
.section-head { margin-bottom: 56px; max-width: 780px; }
.section-head.center { text-align: center; margin: 0 auto 56px; }
.section-head h2 {
  font-family: var(--font-display);
  font-size: 42px; line-height: 1.05;
  margin: 0 0 16px; font-weight: 700;
  letter-spacing: -0.015em;
}
.section-head .lead {
  font-size: 14px; color: var(--text-secondary);
  line-height: 1.7; max-width: 640px;
}
.section-head.center .lead { margin-left: auto; margin-right: auto; }

/* Feature rows */
.feat-row {
  display: grid; grid-template-columns: 1fr 1.15fr;
  gap: 64px; align-items: center;
}
.feat-row.reverse { grid-template-columns: 1.15fr 1fr; }
.feat-row.reverse .feat-text { order: 2; }
.feat-row.reverse .feat-visual { order: 1; }
.feat-head {
  font-size: 28px; line-height: 1.15; margin: 0 0 16px;
  font-weight: 700; letter-spacing: -0.01em;
}
.feat-body {
  font-size: 14px; color: var(--text-secondary); line-height: 1.7;
  margin-bottom: 24px;
}
.feat-bullets {
  list-style: none; padding: 0; margin: 0;
  display: flex; flex-direction: column; gap: 12px;
}
.feat-bullets li {
  display: flex; gap: 12px; font-size: 13px; color: var(--text-secondary);
}
.feat-bullets li::before {
  content: '›'; color: var(--primary); font-weight: 700; flex-shrink: 0;
}
.feat-bullets li b { color: var(--text); font-weight: 600; }
/* When the bullet list lives directly under a .lead (no side visual), give
 * it more room + 2-col layout on wider screens. */
.section-bullets { margin-top: 24px; gap: 14px; max-width: 780px; }
@media (min-width: 720px) {
  .section-bullets { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 40px; }
}

/* ---- Mini pad (shared block for all mini-UIs) --------------------- */
.mini-pad { padding: 14px; }
.mini-pad.alt { background: var(--surface-alt); }
.mini-pad.targets-pad { display: flex; flex-direction: column; gap: 11px; }
.mini-pad.symptoms-pad { display: flex; flex-direction: column; gap: 8px; }
.mini-eyebrow {
  font-size: 9px; color: var(--text-tertiary);
  text-transform: uppercase; letter-spacing: 0.12em;
}

/* Compound library rows */
.compound-row {
  display: flex; align-items: center; gap: 10px; padding: 8px 10px;
  background: transparent; border-left: 2px solid transparent;
  font-size: 11.5px;
}
.compound-row.active {
  background: color-mix(in srgb, var(--primary) 6%, transparent);
  border-left-color: var(--primary);
}
.compound-row .compound-name { flex: 1; color: var(--text); font-weight: 400; }
.compound-row.active .compound-name { font-weight: 600; }
.compound-row.custom .compound-name { color: var(--text-tertiary); }
.compound-t { font-family: var(--font-mono); font-size: 10.5px; color: var(--color-fat); }

/* PK mini header */
.pk-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 10px; }
.pk-name { font-size: 13px; font-weight: 600; }
.pk-t { color: var(--text-tertiary); font-weight: 400; font-size: 11px; }
.pk-active { font-size: 16px; font-weight: 700; color: var(--color-fat); font-family: var(--font-mono); text-align: right; }
.pk-unit { font-size: 10px; color: var(--text-tertiary); font-weight: 400; }

/* Rolling 7d */
.rolling-header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 14px; }
.rolling-val { font-size: 20px; font-weight: 700; font-family: var(--font-mono); }
.rolling-tgt { color: var(--text-tertiary); font-weight: 400; font-size: 13px; }
.rolling-left { font-size: 16px; font-weight: 700; color: var(--primary); font-family: var(--font-mono); text-align: right; }
.rolling-unit { font-size: 10px; color: var(--text-tertiary); font-weight: 400; }
.rolling-bars { display: flex; align-items: flex-end; gap: 5px; height: 90px; }
.rolling-col { flex: 1; display: flex; flex-direction: column; align-items: stretch; gap: 4px; }
.rolling-track {
  position: relative; height: 70px;
  background: var(--bg);
  overflow: hidden;
}
.rolling-track.today { outline: 1.5px solid var(--primary); outline-offset: -1.5px; }
.rolling-fill {
  position: absolute; left: 0; right: 0; bottom: 0;
  background: var(--color-cal); opacity: 1;
}
.rolling-fill.today { background: var(--primary); opacity: 1; }
.rolling-over {
  position: absolute; left: 0; right: 0;
  background: var(--danger);
}
.rolling-target {
  position: absolute; left: 0; right: 0; height: 1px;
  background: var(--text); opacity: 0.45;
}
.rolling-label {
  font-size: 9px; font-family: var(--font-mono); color: var(--text-tertiary); text-align: center;
  text-transform: uppercase; letter-spacing: 0.1em;
}
.rolling-label.today { color: var(--primary); font-weight: 700; }
.rolling-value {
  font-size: 10px; font-family: var(--font-mono); color: var(--text);
  text-align: center; font-variant-numeric: tabular-nums; font-weight: 700;
}
.rolling-value.today { color: var(--primary); }
.rolling-value.over { color: var(--danger); }
.rolling-note {
  margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--border);
  font-size: 11px; color: var(--text-secondary); line-height: 1.5;
}
.rolling-note .arrow { color: var(--primary); }
.rolling-note .dim { color: var(--text-tertiary); }

.rolling-macros {
  margin-top: 12px; display: flex; flex-direction: column; gap: 8px;
}
.rolling-macro-head {
  display: flex; justify-content: space-between; align-items: baseline;
  font-size: 10px; margin-bottom: 3px;
}
.rolling-macro-label {
  color: var(--text); font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.1em; font-size: 9px;
}
.rolling-macro-note {
  color: var(--text-tertiary); font-family: var(--font-mono); font-size: 10px;
}
.rolling-macro-bar {
  height: 3px; background: var(--surface-raised);
}
.rolling-macro-fill { height: 100%; }

/* ---- Agentic AI mini (Feature 03) --------------------------------- */
.aichat { padding: 14px; background: var(--surface-alt); font-size: 12px; line-height: 1.55; }
.aichat-msg {
  padding: 10px 12px; margin-bottom: 10px;
  border-left: 2px solid var(--text-tertiary);
  background: var(--surface-raised);
}
.aichat-msg.ai {
  border-left-color: var(--primary);
  background: color-mix(in srgb, var(--primary) 4%, transparent);
}
.aichat-tag {
  font-size: 9px; text-transform: uppercase; letter-spacing: 0.12em;
  color: var(--text-tertiary); margin-bottom: 6px;
}
.aichat-msg.ai .aichat-tag { color: var(--primary); }
.aichat-msg.user > div:last-child { color: var(--text); }

.trail {
  list-style: none; margin: 0 0 10px; padding: 0;
  border: 1px solid var(--border); background: var(--surface-alt);
}
.trail-item {
  display: flex; gap: 8px; align-items: baseline;
  padding: 5px 10px; font-size: 11px;
  color: var(--text-secondary); font-family: var(--font-mono);
  border-bottom: 1px dashed var(--border);
}
.trail-item:last-child { border-bottom: none; }
.trail-item .trail-icon { width: 12px; color: var(--text-tertiary); flex-shrink: 0; text-align: center; }
.trail-item.call .trail-icon,
.trail-item.result .trail-icon { color: var(--primary); }
.trail-item.call .trail-text { color: var(--text); }
.ai-final { color: var(--text); font-size: 12.5px; line-height: 1.5; }
.ai-final b { color: var(--primary); }

/* ---- Feature grid ------------------------------------------------- */
.fg {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 0;
  border: 1px solid var(--border);
}
.fg-cell {
  padding: 28px; border-right: 1px solid var(--bg);
  border-bottom: 1px solid var(--bg);
  background: var(--surface);
  display: flex; flex-direction: column; gap: 14px;
  min-height: 260px;
}
.fg-cell:nth-child(3n) { border-right: none; }
.fg-cell:nth-last-child(-n+3) { border-bottom: none; }
.fg-label {
  font-size: 10px; color: var(--text-tertiary);
  text-transform: uppercase; letter-spacing: 0.14em;
}
.fg-label .num { color: var(--primary); margin-right: 8px; }
.fg-title { font-size: 17px; font-weight: 700; letter-spacing: -0.005em; line-height: 1.25; }
.fg-body { font-size: 12px; color: var(--text-secondary); line-height: 1.55; }
.fg-cell .mini-ui { margin-top: auto; }

/* Food search mini */
.food-search {
  display: flex; align-items: center; gap: 8px; padding: 6px 8px;
  border: 1px solid var(--border); background: var(--surface); margin-bottom: 10px;
}
.food-search-icon { color: var(--text-tertiary); font-size: 11px; }
.food-search-text { font-size: 11px; color: var(--text); flex: 1; }
.food-search-text .caret { background: var(--primary); color: var(--bg); padding: 0 1px; }
.food-scan { font-size: 10px; color: var(--text-tertiary); padding: 2px 6px; border: 1px solid var(--border); }
.food-row {
  display: flex; align-items: center; gap: 10px;
  padding: 7px 2px; border-bottom: 1px solid var(--border);
}
.food-row:last-child { border-bottom: none; }
.food-info { flex: 1; min-width: 0; }
.food-name {
  font-size: 11.5px; color: var(--text); font-weight: 500;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.food-meta { font-size: 10px; color: var(--text-tertiary); font-family: var(--font-mono); }
.food-tag {
  font-size: 8.5px; color: var(--text-tertiary);
  padding: 2px 6px; border: 1px solid var(--border);
  text-transform: uppercase; letter-spacing: 0.1em;
}
.food-add { font-size: 14px; color: var(--primary); font-weight: 700; }

/* Meals mini */
.meal-row { display: flex; align-items: center; gap: 10px; padding: 9px 2px; border-bottom: 1px solid var(--border); }
.meal-row:last-child { border-bottom: none; }
.meal-emoji { font-size: 18px; }
.meal-info { flex: 1; }
.meal-name { font-size: 11.5px; font-weight: 500; }
.meal-items { font-size: 10px; color: var(--text-tertiary); font-family: var(--font-mono); }
.meal-kcal { font-family: var(--font-mono); font-size: 12px; color: var(--color-cal); font-weight: 600; }
.meal-kcal .dim { font-size: 9px; color: var(--text-tertiary); }

/* Targets mini */
.target-head { display: flex; justify-content: space-between; font-size: 10.5px; margin-bottom: 4px; }
.target-label { color: var(--text); font-weight: 600; }
.target-val { font-family: var(--font-mono); color: var(--text-tertiary); }
.target-track { height: 4px; background: var(--surface-raised); }
.target-fill { height: 100%; background: var(--color-cal); }
.target-fill.kind-pro  { background: var(--color-protein); }
.target-fill.kind-fat  { background: var(--color-fat); }
.target-fill.kind-carb { background: var(--color-carbs); }
.target-auto {
  margin-top: 4px; font-size: 10px; color: var(--text-tertiary); font-family: var(--font-mono);
  padding: 6px 8px; border: 1px dashed var(--border-strong);
}

/* Symptoms mini */
.symptom-row { display: flex; align-items: center; gap: 8px; }
.symptom-name { font-size: 11px; width: 86px; }
.symptom-dots { display: flex; gap: 2px; flex: 1; }
.sym-dot {
  flex: 1; height: 14px;
  background: var(--surface-raised);
  border: 1px solid var(--border);
  font-size: 7px; font-family: var(--font-mono);
  color: var(--text-tertiary);
  display: flex; align-items: center; justify-content: center;
  font-weight: 600;
}
.sym-dot.active { color: var(--bg); }

/* Stats mini */
.stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.stat-cell { padding: 8px; border: 1px solid var(--border); background: var(--surface); }
.stat-label { font-size: 8.5px; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.12em; }
.stat-val { font-size: 16px; font-weight: 700; font-family: var(--font-mono); color: var(--text); }
.stat-val.good { color: var(--primary); }
.stat-unit { font-size: 9px; color: var(--text-tertiary); font-weight: 400; }

/* Photos mini */
.photos-strip { display: flex; gap: 6px; margin-bottom: 10px; }
.photo-tile {
  flex: 1; aspect-ratio: 3/4; background: var(--surface-raised);
  border: 1px solid var(--border); display: flex; align-items: flex-end; padding: 4px;
  position: relative;
  background-image: repeating-linear-gradient(135deg, transparent 0 6px, rgba(91,245,145,0.04) 6px 7px);
}
.photo-label {
  font-size: 9px; color: var(--text-tertiary); font-family: var(--font-mono);
  text-transform: uppercase; letter-spacing: 0.08em;
}
.photos-meta { font-size: 10px; color: var(--text-tertiary); font-family: var(--font-mono); }

/* ---- More features callout --------------------------------------- */
.more-features { padding: 96px 0; border-bottom: 1px solid var(--border); }
.more-cta { margin-top: 28px; }
.more-cta .btn-secondary {
  display: inline-block; padding: 14px 22px;
  background: transparent; color: var(--text);
  border: 1px solid var(--border-strong); font-weight: 600; font-size: 13px;
  letter-spacing: 0.08em; text-transform: uppercase;
  cursor: pointer; font-family: inherit; text-decoration: none;
  transition: border-color .15s, color .15s;
}
.more-cta .btn-secondary:hover { border-color: var(--primary); color: var(--primary); }

/* ---- Pricing ------------------------------------------------------ */
.pricing { padding: 96px 0; }
.pricing-sub {
  color: var(--text-secondary);
  font-size: 14px;
  max-width: 520px;
  margin: 12px auto 0;
  line-height: 1.5;
}
.price-toggle {
  display: flex;
  width: fit-content;
  margin: 28px auto 32px;
  padding: 4px;
  border: 1px solid var(--border);
  background: var(--surface);
  gap: 4px;
}
.price-toggle-btn {
  padding: 10px 18px;
  background: transparent;
  border: none;
  color: var(--text-tertiary);
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  transition: color .15s, background .15s;
}
.price-toggle-btn:hover { color: var(--text); }
.price-toggle-btn.active {
  background: var(--primary);
  color: var(--bg);
}
.price-save-tag {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.1em;
  padding: 2px 6px;
  background: color-mix(in srgb, var(--primary) 20%, transparent);
  color: var(--primary);
  border: 1px solid color-mix(in srgb, var(--primary) 40%, transparent);
}
.price-toggle-btn.active .price-save-tag {
  background: color-mix(in srgb, var(--bg) 25%, transparent);
  color: var(--bg);
  border-color: color-mix(in srgb, var(--bg) 40%, transparent);
}
.price-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; max-width: 860px; margin: 0 auto; }
.price-cards.three { grid-template-columns: 1fr 1fr 1fr; max-width: 1080px; }
.price-card { background: var(--surface); border: 1px solid var(--border); padding: 36px; }
.price-trial-note {
  margin-top: 10px;
  text-align: center;
  font-size: 11px;
  color: var(--text-tertiary);
  letter-spacing: 0.06em;
}
.price-card.featured { border-color: var(--primary); position: relative; }
.price-card.featured::before {
  content: 'RECOMMENDED';
  position: absolute; top: -10px; left: 24px;
  background: var(--primary); color: var(--bg);
  font-size: 9px; font-weight: 700;
  padding: 4px 10px; letter-spacing: 0.14em;
}
.price-kind {
  font-size: 11px; color: var(--text-tertiary);
  text-transform: uppercase; letter-spacing: 0.14em;
  margin-bottom: 8px;
}
.price-kind.accent { color: var(--primary); }
.price-amount { font-size: 42px; font-weight: 700; letter-spacing: -0.02em; margin-bottom: 4px; }
.price-amount .per { font-size: 14px; color: var(--text-tertiary); font-weight: 500; }
.price-desc { color: var(--text-secondary); font-size: 13px; margin-bottom: 24px; line-height: 1.5; }
.price-feats { list-style: none; padding: 0; margin: 0 0 28px; }
.price-feats li {
  padding: 8px 0; font-size: 13px; color: var(--text);
  display: flex; gap: 10px; align-items: flex-start;
}
.price-feats li::before { content: '✓'; color: var(--primary); font-weight: 700; }

/* ---- Final CTA ---------------------------------------------------- */
.final-cta {
  padding: 120px 0 140px;
  text-align: center;
  background: radial-gradient(ellipse at center, rgba(91,245,145,0.05) 0%, transparent 60%);
}
.final-cta h2 { font-size: 56px; line-height: 1; margin: 0 0 20px; font-weight: 700; letter-spacing: -0.02em; }
.final-cta p { font-size: 14px; color: var(--text-secondary); max-width: 520px; margin: 0 auto 36px; }

/* ---- Footer ------------------------------------------------------- */
footer {
  padding: 56px 0 40px;
  font-size: 11px; color: var(--text-tertiary); letter-spacing: 0.06em;
}
.footer-grid { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 48px; margin-bottom: 48px; }
.footer-logo { margin-bottom: 12px; }
.footer-blurb { font-size: 11px; color: var(--text-tertiary); line-height: 1.6; max-width: 320px; }
.footer-col h4 {
  font-size: 10px; text-transform: uppercase; letter-spacing: 0.14em;
  color: var(--text); margin: 0 0 14px; font-weight: 700;
}
.footer-col ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
.footer-col a { color: var(--text-tertiary); transition: color .15s; font-size: 12px; }
.footer-col a:hover { color: var(--primary); }
.footer-disclaimer {
  border-top: 1px solid var(--border); padding-top: 24px;
  color: var(--text-disabled); font-size: 10px;
  line-height: 1.6; letter-spacing: 0.04em;
}

/* ---- Responsive --------------------------------------------------- */
@media (max-width: 980px) {
  .hero { grid-template-columns: 1fr; padding-top: 56px; padding-bottom: 56px; }
  .hero h1 { font-size: 44px; }
  .feat-row, .feat-row.reverse { grid-template-columns: 1fr; gap: 36px; }
  .feat-row.reverse .feat-text { order: 1; }
  .feat-row.reverse .feat-visual { order: 2; }
  .fg, .price-cards, .price-cards.three { grid-template-columns: 1fr; }
  .fg-cell { border-right: none !important; border-bottom: 1px solid var(--border) !important; }
  .footer-grid { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 560px) {
  .wrap { padding: 0 20px; }
  .hero { padding-top: 40px; padding-bottom: 64px; gap: 40px; }
  .hero h1 { font-size: 36px; letter-spacing: -0.01em; }
  .hero-lead { font-size: 14px; }
  .eyebrow { font-size: 10px; letter-spacing: 0.14em; }
  .hero-ctas { flex-wrap: wrap; gap: 10px; }
  .hero-ctas .btn-primary, .hero-ctas .btn-secondary { flex: 1 1 auto; }
}
.nowrap { white-space: nowrap; }
</style>
