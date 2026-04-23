<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();
const goRegister = () => router.push('/register');
const goLogin = () => router.push('/login');
const goHome = () => router.push('/');

// ---- Trend regression mini ---------------------------------------------
const trend = computed(() => {
  const W = 520, H = 180;
  const pad = { t: 12, r: 14, b: 22, l: 34 };
  const W0 = W - pad.l - pad.r, H0 = H - pad.t - pad.b;
  const N = 56;
  const raw = Array.from({ length: N }, (_, i) => 222 - i * 0.22 + Math.sin(i * 0.9) * 1.4 + (i % 7 === 0 ? 1.6 : 0));
  const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const xs = raw.map((_, i) => i);
  const xMean = mean(xs), yMean = mean(raw);
  const slope = xs.reduce((a, x, i) => a + (x - xMean) * (raw[i] - yMean), 0) /
                xs.reduce((a, x) => a + (x - xMean) ** 2, 0);
  const intercept = yMean - slope * xMean;
  const fit = xs.map((x) => slope * x + intercept);
  const yMin = Math.min(...raw) - 0.5, yMax = Math.max(...raw) + 0.5;
  const ix = (i) => pad.l + (i / (N - 1)) * W0;
  const iy = (v) => pad.t + (1 - (v - yMin) / (yMax - yMin)) * H0;
  const dots = raw.map((v, i) => ({ x: ix(i), y: iy(v) }));
  const line = fit.map((v, i) => `${i === 0 ? 'M' : 'L'}${ix(i).toFixed(1)},${iy(v).toFixed(1)}`).join(' ');
  return { W, H, pad, dots, line, right: W - pad.r, padB: pad.t + H0, slope: (slope * 7).toFixed(2) };
});

// ---- Stacked doses PK ---------------------------------------------------
const stackedPK = computed(() => {
  const W = 520, H = 190;
  const pad = { t: 14, r: 14, b: 22, l: 36 };
  const W0 = W - pad.l - pad.r, H0 = H - pad.t - pad.b;
  const days = 56;
  const dosesA = [0, 7, 14, 21, 28, 35, 42, 49];
  const dosesB = [3, 17, 31, 45];
  const mgA = 2.5, mgB = 1.5;
  const kA = Math.log(2) / 6;
  const kB = Math.log(2) / 4;
  const pkA = Array.from({ length: days }, (_, i) => {
    let a = 0; for (const d of dosesA) if (d <= i) a += mgA * Math.exp(-kA * (i - d));
    return a;
  });
  const pkB = Array.from({ length: days }, (_, i) => {
    let a = 0; for (const d of dosesB) if (d <= i) a += mgB * Math.exp(-kB * (i - d));
    return a;
  });
  const ix = (i) => pad.l + (i / (days - 1)) * W0;
  const yMax = Math.max(...pkA, ...pkB) * 1.15;
  const py = (v) => pad.t + (1 - v / yMax) * H0;
  const pA = pkA.map((v, i) => `${i === 0 ? 'M' : 'L'}${ix(i).toFixed(1)},${py(v).toFixed(1)}`).join(' ');
  const pB = pkB.map((v, i) => `${i === 0 ? 'M' : 'L'}${ix(i).toFixed(1)},${py(v).toFixed(1)}`).join(' ');
  const aArea = `${pA} L${ix(days - 1).toFixed(1)},${pad.t + H0} L${ix(0).toFixed(1)},${pad.t + H0} Z`;
  return { W, H, pad, pA, pB, aArea, right: W - pad.r, padB: pad.t + H0, yMax: yMax.toFixed(1) };
});

// ---- Score sparkline ----------------------------------------------------
const score = computed(() => {
  const W = 520, H = 100;
  const pad = { t: 10, r: 14, b: 18, l: 14 };
  const W0 = W - pad.l - pad.r, H0 = H - pad.t - pad.b;
  const N = 30;
  const values = Array.from({ length: N }, (_, i) => {
    const base = 62 + i * 0.7 + Math.sin(i * 0.8) * 9 + (i % 6 === 0 ? -4 : 0);
    return Math.max(20, Math.min(100, base));
  });
  const ix = (i) => pad.l + (i / (N - 1)) * W0;
  const py = (v) => pad.t + (1 - v / 100) * H0;
  const path = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${ix(i).toFixed(1)},${py(v).toFixed(1)}`).join(' ');
  const bars = values.map((v, i) => ({ x: ix(i) - 6, y: py(v), h: (H - pad.b) - py(v), over: v >= 80, low: v < 50 }));
  return { W, H, path, bars, current: Math.round(values[values.length - 1]), avg: Math.round(values.reduce((a, b) => a + b, 0) / N) };
});

// ---- Correlation (reused from landing) ----------------------------------
const correlation = computed(() => {
  const W = 520, H = 180;
  const pad = { t: 14, r: 14, b: 22, l: 30 };
  const W0 = W - pad.l - pad.r, H0 = H - pad.t - pad.b;
  const N = 40;
  const pk = Array.from({ length: N }, (_, i) => 0.5 + 0.5 * Math.exp(-(i % 7) / 4) + Math.sin(i * 0.3) * 0.08);
  const nausea = Array.from({ length: N }, (_, i) => Math.max(0, pk[i] - 0.35) * 8 + (i * 0.173 % 0.6));
  const ix = (i) => pad.l + (i / (N - 1)) * W0;
  const py = (v, max) => pad.t + (1 - v / max) * H0;
  const pkPath = pk.map((v, i) => `${i === 0 ? 'M' : 'L'}${ix(i).toFixed(1)},${py(v, 1.2).toFixed(1)}`).join(' ');
  const nPath = nausea.map((v, i) => `${i === 0 ? 'M' : 'L'}${ix(i).toFixed(1)},${py(v, 6).toFixed(1)}`).join(' ');
  const gridYs = [0.25, 0.5, 0.75].map(f => pad.t + f * H0);
  return { W, H, pad, pkPath, nPath, gridYs, right: W - pad.r };
});

// ---- Static data --------------------------------------------------------
const sortFoodRows = [
  { n: 'Chicken breast, grilled', cal: 165, pro: 31,  fat: 3.6, carb: 0   },
  { n: 'Whey isolate, vanilla',   cal: 120, pro: 25,  fat: 1,   carb: 2   },
  { n: 'Greek yogurt, 2%',        cal: 59,  pro: 9.9, fat: 1.7, carb: 3.6 },
  { n: 'Oats, dry',               cal: 389, pro: 17,  fat: 7,   carb: 66  },
  { n: 'Avocado',                 cal: 160, pro: 2,   fat: 15,  carb: 9   },
];

const savedMeals = [
  { name: 'Standard breakfast',     items: 'Yogurt · banana · whey',  kcal: 420 },
  { name: 'Post-lift chicken bowl', items: 'Rice · chicken · greens', kcal: 680 },
  { name: 'Afternoon shake',        items: 'Whey · oat milk',          kcal: 240 },
  { name: 'Evening protein',        items: 'Cottage cheese · berries', kcal: 210 },
];

const consumedRows = [
  { name: 'Greek yogurt, 2%',      kcal: 59,  done: true },
  { name: 'Protein shake',         kcal: 240, done: true },
  { name: 'Chicken bowl',          kcal: 680, done: true },
  { name: 'Apple',                 kcal: 95,  done: false, plan: '4:00p' },
  { name: 'Evening protein',       kcal: 210, done: false, plan: '8:00p' },
];

const dayNotes = [
  { d: 14, text: 'Low appetite all day — dose 3 yesterday' },
  { d: 18, text: 'Shake upset stomach, skip tomorrow' },
  { d: 22, text: 'Felt strong in gym, PR on squat' },
];

const compounds = [
  { name: 'Semaglutide', t: '7.0 d', active: false },
  { name: 'Tirzepatide', t: '5.0 d', active: false },
  { name: 'Retatrutide', t: '6.0 d', active: true  },
  { name: 'BPC-157',     t: '4 hrs', active: false },
];

const schedule = [
  { label: 'Retatrutide', freq: 'Weekly · Sun 8:00am',     color: 'var(--color-fat)' },
  { label: 'BPC-157',     freq: 'Daily · 7:30am · 7:30pm', color: 'var(--primary)' },
  { label: 'Weight',      freq: 'Daily · 7:00am',          color: 'var(--text)' },
];

const scheduleGrid = (() => {
  const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const rows = [
    // Retatrutide weekly Sun
    [0, 0, 0, 0, 0, 0, 1],
    // BPC-157 daily 2x
    [2, 2, 2, 2, 2, 2, 2],
    // Weight daily 1x
    [1, 1, 1, 1, 1, 1, 1],
  ];
  return { days, rows };
})();

const symptomsList = [
  { name: 'Nausea',         severity: 2 },
  { name: 'Fatigue',        severity: 3 },
  { name: 'Injection site', severity: 1 },
  { name: 'Constipation',   severity: 4, custom: true },
];

function dotColor(n) {
  if (n === 0) return 'var(--primary)';
  if (n <= 3) return 'var(--color-fat)';
  if (n <= 6) return '#f97316';
  return 'var(--color-carbs)';
}

const aiTrail = [
  { icon: '•',  text: 'Understanding request',                           kind: 'status' },
  { icon: '⚙',  text: 'search_food_items("sweetgreen kale caesar")',     kind: 'call'   },
  { icon: '✓',  text: 'No match in database',                             kind: 'result' },
  { icon: '⚙',  text: 'googleSearch("sweetgreen kale caesar nutrition")', kind: 'call'   },
  { icon: '✓',  text: 'Found: 560 cal · 40g P · 31g F · 42g C',          kind: 'result' },
  { icon: '⚙',  text: 'create_food_item(name: "Sweetgreen Kale Caesar")', kind: 'call'   },
  { icon: '✓',  text: 'Created custom food · saved to library',           kind: 'result' },
  { icon: '⚙',  text: 'log_food_entry(meal: "lunch", qty: 1)',            kind: 'call'   },
  { icon: '✓',  text: 'Logged to today · lunch',                          kind: 'result' },
];

const threads = [
  { name: 'Stalling this week',      when: 'today',  active: true  },
  { name: 'Nausea tolerance',        when: '2d ago', active: false },
  { name: 'Hitting protein on low-appetite days', when: '1w ago', active: false },
  { name: 'Dose escalation plan',    when: '2w ago', active: false },
];

const bmrNumbers = {
  bmr: 1780,
  tdee: 2380,
  avgIntake: 1950,
  deficitDay: 430,
  lbsWeek: 0.86,
};

const goal = {
  current: 207.4,
  target: 185,
  remaining: 22.4,
  avgLoss: 1.3,
  etaWeeks: 17,
  etaDate: 'Sep 12',
};

const months = ['Dec', 'Jan', 'Feb', 'Mar', 'Apr'];

const platformRows = [
  { k: 'Offline mode',        v: 'Enabled', ok: true  },
  { k: 'Pending sync',        v: '0 changes', ok: true  },
  { k: 'Last sync',           v: '2 min ago', ok: true },
  { k: 'Encrypted backup',    v: 'On',         ok: true  },
  { k: 'Data export',         v: 'JSON · CSV', ok: true  },
];
</script>

<template>
  <div class="features-root">
    <div class="scanlines" aria-hidden="true"></div>

    <!-- NAV -->
    <div class="nav">
      <div class="wrap nav-inner">
        <span class="logo" @click="goHome" role="button">
          <svg viewBox="0 0 64 64" width="22" height="22" class="logo-mark">
            <circle cx="32" cy="32" r="26" fill="none" stroke="currentColor" stroke-width="2.5" />
            <line x1="32" y1="2"  x2="32" y2="18" stroke="currentColor" stroke-width="2.5" />
            <line x1="32" y1="46" x2="32" y2="62" stroke="currentColor" stroke-width="2.5" />
            <line x1="2"  y1="32" x2="18" y2="32" stroke="currentColor" stroke-width="2.5" />
            <line x1="46" y1="32" x2="62" y2="32" stroke="currentColor" stroke-width="2.5" />
            <circle cx="32" cy="32" r="7" fill="var(--primary)" />
          </svg>
          Protokol Lab
        </span>
        <div class="nav-links">
          <a href="/" class="nav-link">Home</a>
          <a href="/#pricing" class="nav-link">Pricing</a>
        </div>
        <button class="nav-cta" @click="goLogin">Sign in</button>
      </div>
    </div>

    <!-- HEADER -->
    <section class="page-head">
      <div class="wrap">
        <div class="eyebrow">Reference · every feature</div>
        <h1>Every feature.<br /><span class="accent">Illustrated.</span></h1>
        <p class="lead">
          A full tour of what the app does. Every card below is a real screen
          from the app — not a mockup of a landing page, a mockup of the
          product.
        </p>
      </div>
    </section>

    <!-- ===== FOOD & MEALS ================================================ -->
    <section class="group">
      <div class="wrap">
        <div class="group-head">
          <div class="eyebrow">01 · Food &amp; meals</div>
          <h2>Logging, fast.</h2>
        </div>

        <div class="card-grid">
          <!-- Sortable food library -->
          <div class="card">
            <div class="card-head">
              <span class="card-title">Food library · sortable columns</span>
              <span class="card-tag">CORE</span>
            </div>
            <div class="card-body">
              Every food in your log is a row. Click any column to sort.
              Barcode scan, custom foods, recents, and favorites all live in
              the same list.
            </div>
            <div class="mini">
              <div class="food-tbl">
                <div class="food-tbl-head">
                  <span class="col-n">Name</span>
                  <span class="col-k sorted">kcal ▼</span>
                  <span class="col-n2">P</span>
                  <span class="col-n2">F</span>
                  <span class="col-n2">C</span>
                </div>
                <div v-for="r in sortFoodRows" :key="r.n" class="food-tbl-row">
                  <span class="col-n">{{ r.n }}</span>
                  <span class="col-k">{{ r.cal }}</span>
                  <span class="col-n2">{{ r.pro }}</span>
                  <span class="col-n2">{{ r.fat }}</span>
                  <span class="col-n2">{{ r.carb }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Saved meals -->
          <div class="card">
            <div class="card-head">
              <span class="card-title">Saved meals · one-tap relog</span>
              <span class="card-tag">CORE</span>
            </div>
            <div class="card-body">
              Save any combo of foods as a named meal. Relog it whole on any
              future day. The foods you actually eat stop taking two minutes.
            </div>
            <div class="mini">
              <div v-for="m in savedMeals" :key="m.name" class="meal-row">
                <div class="meal-info">
                  <div class="meal-name">{{ m.name }}</div>
                  <div class="meal-items">{{ m.items }}</div>
                </div>
                <div class="meal-kcal">{{ m.kcal }} <span class="dim">kcal</span></div>
                <div class="meal-add">+</div>
              </div>
            </div>
          </div>

          <!-- Copy / move across dates -->
          <div class="card">
            <div class="card-head">
              <span class="card-title">Copy or move across dates</span>
              <span class="card-tag">CORE</span>
            </div>
            <div class="card-body">
              Select entries, pick one or many dates, copy or move. Meal prep
              Sunday, log the same lunch Mon–Fri in a single gesture.
            </div>
            <div class="mini">
              <div class="copy-bar">
                <span class="copy-src">3 entries from <b>Apr 14</b></span>
                <span class="copy-act">→ copy to</span>
              </div>
              <div class="cal-mini">
                <div class="cal-head">
                  <span v-for="d in ['M','T','W','T','F','S','S']" :key="d">{{ d }}</span>
                </div>
                <div class="cal-rows">
                  <div class="cal-row">
                    <span v-for="d in [1,2,3,4,5,6,7]" :key="d" class="cal-cell">{{ d }}</span>
                  </div>
                  <div class="cal-row">
                    <span v-for="d in [8,9,10,11,12,13,14]" :key="d" class="cal-cell" :class="{ src: d === 14 }">{{ d }}</span>
                  </div>
                  <div class="cal-row">
                    <span v-for="d in [15,16,17,18,19,20,21]" :key="d" class="cal-cell" :class="{ sel: [15,16,17,19].includes(d) }">{{ d }}</span>
                  </div>
                  <div class="cal-row">
                    <span v-for="d in [22,23,24,25,26,27,28]" :key="d" class="cal-cell" :class="{ sel: [22,23].includes(d) }">{{ d }}</span>
                  </div>
                </div>
              </div>
              <div class="copy-ft">6 dates selected · apply</div>
            </div>
          </div>

          <!-- Consumed checkbox -->
          <div class="card">
            <div class="card-head">
              <span class="card-title">Plan ahead · tick off as eaten</span>
              <span class="card-tag">CORE</span>
            </div>
            <div class="card-body">
              Every entry has a consumed checkbox. Plan your day the night
              before, then check items off as you actually eat them. Budget
              math only counts what's ticked.
            </div>
            <div class="mini">
              <div v-for="r in consumedRows" :key="r.name" class="check-row">
                <span class="check-box" :class="{ done: r.done }">
                  <span v-if="r.done">✓</span>
                </span>
                <span class="check-name" :class="{ planned: !r.done }">{{ r.name }}</span>
                <span class="check-plan" v-if="!r.done">planned · {{ r.plan }}</span>
                <span class="check-kcal">{{ r.kcal }}</span>
              </div>
              <div class="check-ft">
                <span class="accent">940 kcal</span> counted &nbsp;·&nbsp;
                <span class="dim">305 planned</span>
              </div>
            </div>
          </div>

          <!-- Day notes -->
          <div class="card wide">
            <div class="card-head">
              <span class="card-title">Day notes · free text per day</span>
              <span class="card-tag">CORE</span>
            </div>
            <div class="card-body">
              Anything you want to remember about today, written in plain
              English. Auto-saves. The note shows as a pin on the weight
              chart and the log history, so you can reread it in context
              weeks later.
            </div>
            <div class="mini notes-mini">
              <div class="notes-col">
                <div class="mini-eyebrow">Apr 22 · today</div>
                <div class="notes-field">
                  <div class="notes-text">Low appetite all day — skipped lunch, dose peak tomorrow.</div>
                  <div class="notes-status"><span class="dot-live"></span>saved</div>
                </div>
                <div class="mini-eyebrow" style="margin-top:10px">Recent</div>
                <div class="notes-list">
                  <div v-for="n in dayNotes" :key="n.d" class="notes-item">
                    <span class="notes-pin">●</span>
                    <span class="notes-date">Apr {{ n.d }}</span>
                    <span class="notes-text-small">{{ n.text }}</span>
                  </div>
                </div>
              </div>
              <div class="notes-col">
                <div class="mini-eyebrow">Notes appear on the chart</div>
                <svg viewBox="0 0 320 140" class="block-svg">
                  <line x1="14" x2="306" y1="40"  y2="40"  stroke="var(--border)" stroke-dasharray="1 3" />
                  <line x1="14" x2="306" y1="80"  y2="80"  stroke="var(--border)" stroke-dasharray="1 3" />
                  <line x1="14" x2="306" y1="120" y2="120" stroke="var(--border)" stroke-dasharray="1 3" />
                  <path d="M 14 110 Q 60 95 100 88 T 180 72 T 260 58 T 306 48"
                        fill="none" stroke="var(--primary)" stroke-width="2" />
                  <g v-for="(n, i) in dayNotes" :key="n.d"
                     :transform="`translate(${60 + i * 70}, ${90 - i * 12})`">
                    <line x1="0" x2="0" y1="0" y2="20" stroke="var(--color-fat)" stroke-width="1" />
                    <circle cx="0" cy="0" r="4" fill="var(--color-fat)" stroke="var(--bg)" stroke-width="1.5" />
                  </g>
                  <text x="14" y="135" class="svg-axis-dim">Apr 10</text>
                  <text x="306" y="135" text-anchor="end" class="svg-axis-dim">Apr 22</text>
                </svg>
                <div class="notes-hint">Hover a pin to see the note inline.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ===== TARGETS & SCORE ============================================= -->
    <section class="group">
      <div class="wrap">
        <div class="group-head">
          <div class="eyebrow">02 · Targets &amp; score</div>
          <h2>The numbers you're chasing.</h2>
        </div>

        <div class="card-grid">
          <!-- Macros + auto-adjust -->
          <div class="card">
            <div class="card-head">
              <span class="card-title">Macro targets · auto-adjust</span>
              <span class="card-tag">CORE</span>
            </div>
            <div class="card-body">
              Lock in calorie, protein, fat, and carb numbers yourself — or
              let the app rebalance them each week based on what you
              actually ate and how you actually weighed.
            </div>
            <div class="mini">
              <div v-for="(r, i) in [
                { label: 'Calories', val: 2180, prev: 2100, unit: 'kcal', pct: 74, kind: 'cal',  delta: +80  },
                { label: 'Protein',  val: 190,  prev: 180,  unit: 'g',    pct: 92, kind: 'pro',  delta: +10  },
                { label: 'Fat',      val: 62,   prev: 65,   unit: 'g',    pct: 42, kind: 'fat',  delta: -3   },
                { label: 'Carbs',    val: 215,  prev: 210,  unit: 'g',    pct: 58, kind: 'carb', delta: +5   },
              ]" :key="i" class="target-row">
                <div class="target-head">
                  <span class="target-label">{{ r.label }}</span>
                  <span class="target-val">
                    {{ r.val }} {{ r.unit }}
                    <span class="target-delta" :class="{ up: r.delta > 0, down: r.delta < 0 }">
                      {{ r.delta > 0 ? '+' : '' }}{{ r.delta }}
                    </span>
                  </span>
                </div>
                <div class="target-track">
                  <div class="target-fill" :class="`kind-${r.kind}`" :style="{ width: r.pct + '%' }"></div>
                </div>
              </div>
              <div class="target-auto">
                Auto-adjusted from last week · based on -1.3 lbs trend
              </div>
            </div>
          </div>

          <!-- Nutrition score -->
          <div class="card">
            <div class="card-head">
              <span class="card-title">Nutrition score · 0–100</span>
              <span class="card-tag">CORE</span>
            </div>
            <div class="card-body">
              Each day gets a score from hitting your targets, protein
              density, and macro balance. It charts as a series — one number
              to tell you whether the week was good, bad, or average.
            </div>
            <div class="mini">
              <div class="score-row">
                <div class="score-num">{{ score.current }}<span class="score-unit">/100</span></div>
                <div class="score-meta">
                  <div class="mini-eyebrow">Today</div>
                  <div class="score-avg">30-day avg · {{ score.avg }}</div>
                </div>
              </div>
              <svg :viewBox="`0 0 ${score.W} ${score.H}`" class="block-svg">
                <rect v-for="(b, i) in score.bars" :key="i"
                      :x="b.x" :y="b.y" width="12" :height="b.h"
                      :fill="b.over ? 'var(--primary)' : b.low ? 'var(--color-carbs)' : 'var(--color-fat)'"
                      opacity="0.75" />
                <path :d="score.path" fill="none" stroke="var(--text)" stroke-width="1.25" opacity="0.45" />
              </svg>
              <div class="score-legend">
                <span><i class="sq green"></i> ≥ 80</span>
                <span><i class="sq amber"></i> 50–79</span>
                <span><i class="sq red"></i> &lt; 50</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ===== WEIGHT & PROGRESS =========================================== -->
    <section class="group">
      <div class="wrap">
        <div class="group-head">
          <div class="eyebrow">03 · Weight &amp; progress</div>
          <h2>The trend, not the noise.</h2>
        </div>

        <div class="card-grid">
          <!-- Regression trend -->
          <div class="card wide">
            <div class="card-head">
              <span class="card-title">Daily weigh-ins · regression trend line</span>
              <span class="card-tag">CORE</span>
            </div>
            <div class="card-body">
              Every weigh-in is a dot. The line is a least-squares fit —
              one bad morning doesn't move it, a real shift does. The slope
              is your actual weekly rate of loss.
            </div>
            <div class="mini">
              <div class="trend-header">
                <div>
                  <div class="mini-eyebrow">Slope · 56-day fit</div>
                  <div class="trend-slope">{{ trend.slope }} lbs/wk</div>
                </div>
                <div class="right">
                  <div class="mini-eyebrow">Latest</div>
                  <div class="trend-latest">207.4 <span class="dim">lbs</span></div>
                </div>
              </div>
              <svg :viewBox="`0 0 ${trend.W} ${trend.H}`" class="block-svg">
                <circle v-for="(d, i) in trend.dots" :key="i"
                        :cx="d.x" :cy="d.y" r="2.25"
                        fill="var(--text-tertiary)" opacity="0.7" />
                <path :d="trend.line" fill="none" stroke="var(--primary)" stroke-width="2" />
                <text :x="14" :y="trend.H - 8" class="svg-axis-dim">56d ago</text>
                <text :x="trend.right" :y="trend.H - 8" text-anchor="end" class="svg-axis-dim">today</text>
              </svg>
            </div>
          </div>

          <!-- BMR projection -->
          <div class="card">
            <div class="card-head">
              <span class="card-title">BMR projection · live deficit math</span>
              <span class="card-tag">CORE</span>
            </div>
            <div class="card-body">
              Your BMR comes from your weight, height, age, sex, and
              activity. Subtract your actual intake and you get the
              deficit — in calories per day and pounds per week.
            </div>
            <div class="mini bmr-mini">
              <div class="bmr-row">
                <span class="bmr-k">BMR</span>
                <span class="bmr-v">{{ bmrNumbers.bmr }}</span>
                <span class="bmr-u">kcal/d</span>
              </div>
              <div class="bmr-row">
                <span class="bmr-k">TDEE · moderate</span>
                <span class="bmr-v">{{ bmrNumbers.tdee }}</span>
                <span class="bmr-u">kcal/d</span>
              </div>
              <div class="bmr-row">
                <span class="bmr-k">Avg intake · 14d</span>
                <span class="bmr-v">{{ bmrNumbers.avgIntake }}</span>
                <span class="bmr-u">kcal/d</span>
              </div>
              <div class="bmr-divider"></div>
              <div class="bmr-row big">
                <span class="bmr-k">Deficit</span>
                <span class="bmr-v accent">−{{ bmrNumbers.deficitDay }}</span>
                <span class="bmr-u">kcal/d</span>
              </div>
              <div class="bmr-row big">
                <span class="bmr-k">Projected</span>
                <span class="bmr-v accent">−{{ bmrNumbers.lbsWeek }}</span>
                <span class="bmr-u">lbs/wk</span>
              </div>
            </div>
          </div>

          <!-- Goal countdown -->
          <div class="card">
            <div class="card-head">
              <span class="card-title">Goal weight · countdown</span>
              <span class="card-tag">CORE</span>
            </div>
            <div class="card-body">
              Set a target weight. The app tracks how far you've come,
              how far you have to go, and — based on your actual rate of
              loss — when you'll hit it.
            </div>
            <div class="mini">
              <div class="goal-big">
                <div class="goal-num">−{{ goal.remaining }}<span class="goal-unit"> lbs</span></div>
                <div class="goal-sub">to {{ goal.target }} lbs goal</div>
              </div>
              <div class="goal-bar">
                <div class="goal-fill" style="width: 45%"></div>
              </div>
              <div class="goal-scale">
                <span>Start 226</span>
                <span>Now 207.4</span>
                <span>Goal 185</span>
              </div>
              <div class="goal-eta">
                At current pace · <span class="accent">{{ goal.etaWeeks }} weeks</span>
                · ETA {{ goal.etaDate }}
              </div>
            </div>
          </div>

          <!-- Photos -->
          <div class="card">
            <div class="card-head">
              <span class="card-title">Progress photos · on-device</span>
              <span class="card-tag">CORE</span>
            </div>
            <div class="card-body">
              Monthly shots, kept local on your device. Swipe between any
              two months to see what actually changed when the scale is
              being boring.
            </div>
            <div class="mini">
              <div class="photos-strip">
                <div v-for="m in months" :key="m" class="photo-tile">
                  <span class="photo-label">{{ m }}</span>
                </div>
              </div>
              <div class="photos-compare">
                <span class="accent">▸ Compare Dec ↔ Apr</span>
                <span class="dim">−18.6 lbs · 5 months</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ===== COMPOUNDS =================================================== -->
    <section class="group">
      <div class="wrap">
        <div class="group-head">
          <div class="eyebrow">04 · Compounds</div>
          <h2>Half-life math, automated.</h2>
        </div>

        <div class="card-grid">
          <!-- Library + custom -->
          <div class="card">
            <div class="card-head">
              <span class="card-title">Library + custom compounds</span>
              <span class="card-tag">CORE</span>
            </div>
            <div class="card-body">
              Common GLP-1s preloaded. Adding your own is two fields —
              a name and a half-life. The curve draws itself.
            </div>
            <div class="mini">
              <div v-for="c in compounds" :key="c.name" class="compound-row" :class="{ active: c.active }">
                <span class="compound-name">{{ c.name }}</span>
                <span class="compound-t">t½ {{ c.t }}</span>
              </div>
              <div class="custom-form">
                <div class="mini-eyebrow">Add custom</div>
                <div class="form-line">
                  <span class="form-field"><span class="form-label">name</span><span class="form-val">Tesofensine</span></span>
                  <span class="form-field"><span class="form-label">t½</span><span class="form-val">9.0 d</span></span>
                  <span class="form-submit">+ add</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Stacked doses -->
          <div class="card">
            <div class="card-head">
              <span class="card-title">Stacked doses · modeled correctly</span>
              <span class="card-tag">CORE</span>
            </div>
            <div class="card-body">
              Run two compounds at once and the curves add up the way real
              pharmacokinetics do — not a toy bar chart. Each dose decays
              at its own half-life.
            </div>
            <div class="mini">
              <div class="stack-legend">
                <span class="s-fat">━ Retatrutide · t½ 6d</span>
                <span class="s-green">━ BPC-157 · t½ 4h</span>
              </div>
              <svg :viewBox="`0 0 ${stackedPK.W} ${stackedPK.H}`" class="block-svg">
                <path :d="stackedPK.aArea" fill="rgba(230,184,85,0.14)" />
                <path :d="stackedPK.pA" fill="none" stroke="var(--color-fat)" stroke-width="1.75" />
                <path :d="stackedPK.pB" fill="none" stroke="var(--primary)" stroke-width="1.5" stroke-dasharray="3 2" />
                <text :x="14" :y="stackedPK.H - 8" class="svg-axis-dim">-56d</text>
                <text :x="stackedPK.right" :y="stackedPK.H - 8" text-anchor="end" class="svg-axis-dim">now</text>
              </svg>
            </div>
          </div>

          <!-- Push scheduler -->
          <div class="card wide">
            <div class="card-head">
              <span class="card-title">Push scheduler · per-compound times &amp; weekdays</span>
              <span class="card-tag">CORE</span>
            </div>
            <div class="card-body">
              A real scheduler, not a daily nag. Pick which days, which
              times, which compound. Push notifications go through your
              phone's lock screen exactly when you asked.
            </div>
            <div class="mini sched-mini">
              <div class="sched-list">
                <div v-for="s in schedule" :key="s.label" class="sched-row">
                  <span class="sched-dot" :style="{ background: s.color }"></span>
                  <span class="sched-label">{{ s.label }}</span>
                  <span class="sched-freq">{{ s.freq }}</span>
                </div>
              </div>
              <div class="sched-grid">
                <div class="sched-grid-head">
                  <span></span>
                  <span v-for="(d, i) in scheduleGrid.days" :key="i">{{ d }}</span>
                </div>
                <div class="sched-grid-row" v-for="(row, i) in scheduleGrid.rows" :key="i">
                  <span class="sched-grid-label">{{ schedule[i].label }}</span>
                  <span v-for="(n, j) in row" :key="j" class="sched-cell" :class="{ on: n > 0 }">
                    <template v-if="n > 0">{{ n === 2 ? '●●' : '●' }}</template>
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- Smart reminder -->
          <div class="card">
            <div class="card-head">
              <span class="card-title">Smart reminder · skips what you already did</span>
              <span class="card-tag">CORE</span>
            </div>
            <div class="card-body">
              The daily reminder checks your log first. If you already
              weighed in or logged the dose, the push doesn't fire. No
              duplicate pings, no "did I do that already?" lookups.
            </div>
            <div class="mini">
              <div class="push-mock">
                <div class="push-top">
                  <span class="push-app">Protokol Lab</span>
                  <span class="push-time">7:30 AM</span>
                </div>
                <div class="push-body">
                  <b>BPC-157 due</b><br />
                  Tap to log. Expected dose: 250mcg.
                </div>
              </div>
              <div class="push-skip">
                <span class="skip-dot"></span>
                <span class="skip-body">
                  <b>Retatrutide reminder skipped.</b>
                  <span class="dim">Already logged at 6:42 AM.</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ===== SYMPTOMS ==================================================== -->
    <section class="group">
      <div class="wrap">
        <div class="group-head">
          <div class="eyebrow">05 · Symptoms</div>
          <h2>Three-second log. Patterns later.</h2>
        </div>

        <div class="card-grid">
          <!-- Symptom scale + custom -->
          <div class="card">
            <div class="card-head">
              <span class="card-title">0–10 severity · add your own</span>
              <span class="card-tag">CORE</span>
            </div>
            <div class="card-body">
              Built-in symptoms cover the common GLP-1 side effects.
              Custom symptoms are one field — anything you want to
              track lives in the same log.
            </div>
            <div class="mini symptoms-pad">
              <div v-for="s in symptomsList" :key="s.name" class="symptom-row">
                <span class="symptom-name">
                  {{ s.name }}
                  <span v-if="s.custom" class="custom-tag">CUSTOM</span>
                </span>
                <div class="symptom-dots">
                  <div v-for="n in 11" :key="n" class="sym-dot"
                       :class="{ active: (n - 1) === 0 ? s.severity === 0 : s.severity >= (n - 1) }"
                       :style="((n - 1) === 0 ? s.severity === 0 : s.severity >= (n - 1)) ? { background: dotColor(n - 1), borderColor: dotColor(n - 1) } : {}">
                    {{ n - 1 }}
                  </div>
                </div>
              </div>
              <div class="sym-add">+ add symptom</div>
            </div>
          </div>

          <!-- Correlation -->
          <div class="card">
            <div class="card-head">
              <span class="card-title">Correlation charts</span>
              <span class="card-tag premium">PREMIUM</span>
            </div>
            <div class="card-body">
              Put any two things on the same chart. Find out nausea peaks
              two days after your shot, or that you sleep worse on
              high-carb days. Patterns, not guesses.
            </div>
            <div class="mini">
              <div class="corr-legend">
                <span class="corr-amber">━ Dose in system</span>
                <span class="corr-red">━ Nausea</span>
                <span class="corr-dim">r = 0.74</span>
              </div>
              <svg :viewBox="`0 0 ${correlation.W} ${correlation.H}`" class="block-svg">
                <line v-for="(y, i) in correlation.gridYs" :key="i"
                      :x1="correlation.pad.l" :x2="correlation.right"
                      :y1="y" :y2="y"
                      stroke="var(--border)" stroke-dasharray="1 3" />
                <path :d="correlation.pkPath" fill="none" stroke="var(--color-fat)" stroke-width="1.5" />
                <path :d="correlation.nPath" fill="none" stroke="var(--color-carbs)" stroke-width="1.5" stroke-dasharray="3 2" />
              </svg>
              <div class="corr-footer">-40d <span class="right">today</span></div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ===== AI ========================================================== -->
    <section class="group">
      <div class="wrap">
        <div class="group-head">
          <div class="eyebrow">06 · AI</div>
          <h2>Agentic. Not a chatbot.</h2>
        </div>

        <div class="card-grid">
          <!-- Agentic tool trail -->
          <div class="card wide">
            <div class="card-head">
              <span class="card-title">Reads your data · uses tools · acts</span>
              <span class="card-tag premium">PREMIUM</span>
            </div>
            <div class="card-body">
              Ask it anything. It has tools for searching foods, creating
              custom items, logging entries, pulling any stretch of your
              own data, and searching the web. What it can't look up from
              your log, it finds online — then writes the log for you.
            </div>
            <div class="mini aichat">
              <div class="aichat-msg user">
                <div class="aichat-tag">You</div>
                <div>I just ate a Sweetgreen Kale Caesar at lunch.</div>
              </div>
              <div class="aichat-msg ai">
                <div class="aichat-tag">Protokol Lab</div>
                <ol class="trail">
                  <li v-for="(t, i) in aiTrail" :key="i" class="trail-item" :class="t.kind">
                    <span class="trail-icon">{{ t.icon }}</span>
                    <span class="trail-text">{{ t.text }}</span>
                  </li>
                </ol>
                <div class="ai-final">
                  Logged. You're at <b>1,240 cal</b>, 340 to go for the day.
                  Protein's at 92g — you'll want another shake before bed to
                  hit 180.
                </div>
              </div>
            </div>
          </div>

          <!-- Multi-thread -->
          <div class="card">
            <div class="card-head">
              <span class="card-title">Multi-thread · history · rename</span>
              <span class="card-tag premium">PREMIUM</span>
            </div>
            <div class="card-body">
              Every conversation is its own thread. Keep "Nausea
              tolerance" separate from "Dose escalation plan." Rename,
              delete, resume any thread at any time.
            </div>
            <div class="mini">
              <div class="thread-list">
                <div v-for="t in threads" :key="t.name" class="thread-row" :class="{ active: t.active }">
                  <span class="thread-name">{{ t.name }}</span>
                  <span class="thread-when">{{ t.when }}</span>
                </div>
                <div class="thread-row new">
                  <span class="thread-name">+ new thread</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ===== PLATFORM ==================================================== -->
    <section class="group">
      <div class="wrap">
        <div class="group-head">
          <div class="eyebrow">07 · Platform</div>
          <h2>Your data, your device, your call.</h2>
        </div>

        <div class="card-grid">
          <!-- Offline / sync / export -->
          <div class="card wide">
            <div class="card-head">
              <span class="card-title">Offline · cloud sync · export</span>
              <span class="card-tag">CORE</span>
            </div>
            <div class="card-body">
              Installs as a PWA, works fully offline, syncs encrypted
              when you're online. Your whole history exports as JSON or
              CSV whenever you want it — no paywall, no support ticket.
            </div>
            <div class="mini">
              <div class="status-grid">
                <div v-for="r in platformRows" :key="r.k" class="status-row">
                  <span class="status-dot" :class="{ ok: r.ok }"></span>
                  <span class="status-k">{{ r.k }}</span>
                  <span class="status-v">{{ r.v }}</span>
                </div>
              </div>
              <div class="export-bar">
                <span class="export-file">protokol-lab-export-2026-04-22.json</span>
                <span class="export-btn">↓ download</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ===== FINAL CTA =================================================== -->
    <section class="final-cta">
      <div class="wrap">
        <h2>That's the tour.<br /><span class="accent">Start tracking.</span></h2>
        <p>Free to start. Premium unlocks the AI and correlation charts for $2.99/mo.</p>
        <div class="cta-buttons">
          <button class="btn-primary big" @click="goRegister">Create account →</button>
          <button class="btn-secondary big" @click="goHome">Back to home</button>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* =================================================================
 * FeaturesPage — detailed feature reference.
 * Aesthetic matches LandingPage: terminal / reticle, mono, sharp corners.
 * ================================================================= */

.features-root {
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-mono);
  font-size: 14px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  min-height: 100vh;
  position: relative;
  overflow-x: hidden;
}
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
.accent { color: var(--primary); }
.dim { color: var(--text-tertiary); }

/* ---- Nav (same shape as landing) -------------------------------- */
.nav {
  position: sticky; top: 0; z-index: 20;
  background: color-mix(in srgb, var(--bg) 85%, transparent);
  backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--border);
}
.nav-inner { display: flex; align-items: center; gap: 28px; padding: 14px 0; }
.logo {
  display: inline-flex; align-items: center; gap: 10px;
  font-weight: 700; letter-spacing: 0.02em; font-size: 15px;
  color: var(--text); cursor: pointer;
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

/* ---- Page head -------------------------------------------------- */
.page-head { padding: 72px 0 48px; border-bottom: 1px solid var(--border); }
.page-head h1 {
  font-family: var(--font-display);
  font-size: 56px; line-height: 1.02;
  margin: 0 0 20px; font-weight: 700;
  letter-spacing: -0.02em;
}
.page-head .lead {
  font-size: 15px; color: var(--text-secondary);
  max-width: 640px; line-height: 1.6;
}
.eyebrow {
  font-size: 11px; color: var(--text-tertiary);
  text-transform: uppercase; letter-spacing: 0.18em;
  display: inline-flex; align-items: center; gap: 10px;
  margin-bottom: 20px;
}
.eyebrow::before {
  content: ''; width: 24px; height: 1px; background: var(--text-tertiary);
}

/* ---- Feature groups -------------------------------------------- */
.group { padding: 72px 0; border-bottom: 1px solid var(--border); }
.group-head { margin-bottom: 40px; max-width: 780px; }
.group-head h2 {
  font-family: var(--font-display);
  font-size: 34px; line-height: 1.1; margin: 0;
  font-weight: 700; letter-spacing: -0.015em;
}

.card-grid {
  display: grid; grid-template-columns: repeat(2, 1fr);
  gap: 24px;
}
.card {
  background: var(--surface); border: 1px solid var(--border);
  display: flex; flex-direction: column;
  overflow: hidden;
}
.card.wide { grid-column: span 2; }
.card-head {
  display: flex; align-items: center; gap: 12px;
  padding: 14px 18px; border-bottom: 1px solid var(--border);
  background: var(--surface-alt);
}
.card-title {
  flex: 1; font-size: 12px; font-weight: 600;
  letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--text);
}
.card-tag {
  font-size: 9px; font-weight: 700; letter-spacing: 0.14em;
  padding: 3px 8px;
  border: 1px solid var(--border);
  color: var(--text-tertiary);
}
.card-tag.premium { color: var(--primary); border-color: var(--primary); }
.card-body {
  padding: 16px 18px 0; font-size: 13px;
  color: var(--text-secondary); line-height: 1.6;
}
.card .mini { padding: 16px 18px 18px; margin-top: auto; }

/* shared mini block aesthetics */
.mini-eyebrow {
  font-size: 9px; color: var(--text-tertiary);
  text-transform: uppercase; letter-spacing: 0.12em;
  margin-bottom: 4px;
}
.block-svg { width: 100%; height: auto; display: block; }
.svg-axis-dim { font-size: 9px; fill: var(--text-tertiary); font-family: var(--font-mono); }

/* ---- Food table mini -------------------------------------------- */
.food-tbl {
  font-family: var(--font-mono); font-size: 11px;
  border: 1px solid var(--border); background: var(--surface-alt);
}
.food-tbl-head {
  display: grid; grid-template-columns: 1fr 60px 36px 36px 36px;
  padding: 8px 10px; background: var(--surface);
  border-bottom: 1px solid var(--border);
  font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em;
  color: var(--text-tertiary);
}
.food-tbl-head .sorted { color: var(--primary); }
.food-tbl-row {
  display: grid; grid-template-columns: 1fr 60px 36px 36px 36px;
  padding: 8px 10px; border-bottom: 1px solid var(--border);
}
.food-tbl-row:last-child { border-bottom: none; }
.food-tbl-row .col-n { color: var(--text); font-family: var(--font-body); }
.food-tbl-row .col-k { color: var(--color-cal); text-align: right; }
.food-tbl-row .col-n2 { color: var(--text-tertiary); text-align: right; }

/* ---- Meals mini ------------------------------------------------- */
.meal-row {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 2px; border-bottom: 1px solid var(--border);
}
.meal-row:last-child { border-bottom: none; }
.meal-info { flex: 1; }
.meal-name { font-size: 12px; font-weight: 500; color: var(--text); }
.meal-items { font-size: 10px; color: var(--text-tertiary); font-family: var(--font-mono); }
.meal-kcal { font-family: var(--font-mono); font-size: 12px; color: var(--color-cal); font-weight: 600; }
.meal-kcal .dim { font-size: 9px; }
.meal-add { font-size: 16px; color: var(--primary); font-weight: 700; width: 18px; text-align: center; }

/* ---- Copy / move calendar mini --------------------------------- */
.copy-bar {
  display: flex; align-items: baseline; justify-content: space-between;
  margin-bottom: 12px; font-size: 11px;
}
.copy-src b { color: var(--text); }
.copy-src { color: var(--text-tertiary); }
.copy-act { color: var(--primary); font-weight: 600; }
.cal-mini {
  border: 1px solid var(--border); background: var(--surface-alt);
  font-family: var(--font-mono);
}
.cal-head, .cal-row {
  display: grid; grid-template-columns: repeat(7, 1fr);
}
.cal-head {
  background: var(--surface);
  font-size: 9px; color: var(--text-tertiary); letter-spacing: 0.08em;
  border-bottom: 1px solid var(--border);
}
.cal-head span { padding: 5px 0; text-align: center; }
.cal-row { border-bottom: 1px solid var(--border); }
.cal-row:last-child { border-bottom: none; }
.cal-cell {
  padding: 8px 0; text-align: center; font-size: 11px;
  color: var(--text-secondary);
  border-right: 1px solid var(--border);
}
.cal-cell:last-child { border-right: none; }
.cal-cell.src {
  background: color-mix(in srgb, var(--color-fat) 20%, transparent);
  color: var(--color-fat); font-weight: 700;
}
.cal-cell.sel {
  background: color-mix(in srgb, var(--primary) 14%, transparent);
  color: var(--primary); font-weight: 700;
}
.copy-ft {
  margin-top: 10px; font-size: 11px; color: var(--text-secondary);
  display: flex; justify-content: flex-end; gap: 10px;
  font-family: var(--font-mono);
}

/* ---- Consumed checkbox mini ------------------------------------ */
.check-row {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 2px; border-bottom: 1px solid var(--border);
  font-size: 12px;
}
.check-row:last-child { border-bottom: none; }
.check-box {
  width: 14px; height: 14px; border: 1.5px solid var(--border-strong);
  display: flex; align-items: center; justify-content: center;
  font-size: 10px; color: var(--bg); line-height: 1;
}
.check-box.done { background: var(--primary); border-color: var(--primary); }
.check-name { flex: 1; color: var(--text); }
.check-name.planned { color: var(--text-tertiary); font-style: italic; }
.check-plan {
  font-size: 10px; color: var(--text-tertiary); font-family: var(--font-mono);
  letter-spacing: 0.08em;
}
.check-kcal {
  font-family: var(--font-mono); font-size: 12px;
  color: var(--color-cal); font-weight: 600;
}
.check-ft {
  margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--border);
  font-size: 11px; font-family: var(--font-mono);
}

/* ---- Day notes mini ------------------------------------------- */
.notes-mini { display: grid; grid-template-columns: 1fr 1.2fr; gap: 20px; }
.notes-field {
  border: 1px solid var(--border); background: var(--surface-alt);
  padding: 10px 12px; display: flex; align-items: flex-start; gap: 10px;
  margin-bottom: 4px;
}
.notes-text { flex: 1; font-size: 12px; color: var(--text); line-height: 1.5; }
.notes-status {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 10px; color: var(--primary); font-family: var(--font-mono);
}
.dot-live {
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--primary); box-shadow: 0 0 8px var(--primary);
  animation: pulse 2s infinite;
}
@keyframes pulse { 50% { opacity: 0.4; } }
.notes-list { display: flex; flex-direction: column; gap: 6px; }
.notes-item {
  display: flex; gap: 8px; font-size: 11px;
  padding: 6px 0; border-bottom: 1px dashed var(--border);
}
.notes-item:last-child { border-bottom: none; }
.notes-pin { color: var(--color-fat); }
.notes-date { color: var(--text-tertiary); font-family: var(--font-mono); width: 48px; }
.notes-text-small { color: var(--text-secondary); flex: 1; }
.notes-hint {
  margin-top: 8px; font-size: 10px; color: var(--text-tertiary);
  font-family: var(--font-mono);
}

/* ---- Target + auto mini ---------------------------------------- */
.target-row { margin-bottom: 10px; }
.target-head { display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 4px; }
.target-label { color: var(--text); font-weight: 600; }
.target-val { font-family: var(--font-mono); color: var(--text-tertiary); }
.target-delta {
  margin-left: 6px; font-size: 10px; padding: 1px 5px;
  background: var(--surface-alt); color: var(--text-tertiary);
}
.target-delta.up   { color: var(--primary); }
.target-delta.down { color: var(--color-carbs); }
.target-track { height: 4px; background: var(--surface-raised); }
.target-fill { height: 100%; background: var(--color-cal); }
.target-fill.kind-pro  { background: var(--color-protein); }
.target-fill.kind-fat  { background: var(--color-fat); }
.target-fill.kind-carb { background: var(--color-carbs); }
.target-auto {
  margin-top: 10px; font-size: 10px; color: var(--text-tertiary);
  font-family: var(--font-mono);
  padding: 6px 8px; border: 1px dashed var(--border-strong);
}

/* ---- Score mini ------------------------------------------------ */
.score-row { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 10px; }
.score-num { font-size: 36px; font-weight: 700; font-family: var(--font-mono); color: var(--primary); }
.score-unit { font-size: 14px; color: var(--text-tertiary); font-weight: 400; }
.score-meta { text-align: right; }
.score-avg { font-size: 13px; color: var(--text); font-family: var(--font-mono); }
.score-legend {
  margin-top: 8px; display: flex; gap: 14px;
  font-size: 10px; color: var(--text-tertiary); font-family: var(--font-mono);
}
.score-legend i {
  display: inline-block; width: 10px; height: 10px;
  margin-right: 5px; vertical-align: -1px;
}
.score-legend i.green { background: var(--primary); }
.score-legend i.amber { background: var(--color-fat); }
.score-legend i.red   { background: var(--color-carbs); }

/* ---- Trend mini ------------------------------------------------ */
.trend-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; }
.trend-header .right { text-align: right; }
.trend-slope { font-size: 20px; font-weight: 700; color: var(--primary); font-family: var(--font-mono); }
.trend-latest { font-size: 18px; font-family: var(--font-mono); font-weight: 700; }
.trend-latest .dim { font-size: 11px; color: var(--text-tertiary); font-weight: 400; }

/* ---- BMR mini -------------------------------------------------- */
.bmr-mini { display: flex; flex-direction: column; gap: 6px; font-family: var(--font-mono); font-size: 12px; }
.bmr-row { display: grid; grid-template-columns: 1fr auto 60px; align-items: baseline; gap: 10px; }
.bmr-row.big { font-size: 14px; }
.bmr-row.big .bmr-v { font-size: 20px; font-weight: 700; }
.bmr-k { color: var(--text-secondary); }
.bmr-v { text-align: right; color: var(--text); font-weight: 600; }
.bmr-u { color: var(--text-tertiary); font-size: 10px; text-align: left; }
.bmr-divider { height: 1px; background: var(--border); margin: 6px 0; }
.bmr-row.big .bmr-v.accent { color: var(--primary); }

/* ---- Goal mini ------------------------------------------------- */
.goal-big { margin-bottom: 14px; }
.goal-num { font-size: 34px; font-weight: 700; color: var(--primary); font-family: var(--font-mono); letter-spacing: -0.02em; }
.goal-unit { font-size: 14px; color: var(--text-tertiary); font-weight: 400; }
.goal-sub { font-size: 12px; color: var(--text-secondary); margin-top: 2px; }
.goal-bar { height: 4px; background: var(--surface-raised); }
.goal-fill { height: 100%; background: var(--primary); }
.goal-scale {
  display: flex; justify-content: space-between; margin-top: 6px;
  font-size: 9px; color: var(--text-tertiary); font-family: var(--font-mono);
  letter-spacing: 0.06em;
}
.goal-eta {
  margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--border);
  font-size: 11px; color: var(--text-secondary); font-family: var(--font-mono);
}

/* ---- Photos mini ---------------------------------------------- */
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
.photos-compare {
  display: flex; justify-content: space-between;
  font-size: 11px; font-family: var(--font-mono);
  color: var(--text-tertiary);
}

/* ---- Compound + custom form mini ------------------------------- */
.compound-row {
  display: flex; align-items: center; gap: 10px; padding: 8px 10px;
  background: transparent; border-left: 2px solid transparent;
  font-size: 12px; border-bottom: 1px dashed var(--border);
}
.compound-row:last-of-type { border-bottom: none; }
.compound-row.active {
  background: color-mix(in srgb, var(--primary) 6%, transparent);
  border-left-color: var(--primary);
}
.compound-name { flex: 1; color: var(--text); }
.compound-row.active .compound-name { font-weight: 600; }
.compound-t { font-family: var(--font-mono); font-size: 11px; color: var(--color-fat); }
.custom-form {
  margin-top: 12px; padding: 10px; border: 1px dashed var(--border-strong);
  background: var(--surface-alt);
}
.form-line { display: flex; gap: 12px; align-items: baseline; font-family: var(--font-mono); }
.form-field { display: flex; flex-direction: column; gap: 2px; flex: 1; }
.form-label { font-size: 9px; color: var(--text-tertiary); letter-spacing: 0.08em; text-transform: uppercase; }
.form-val {
  font-size: 12px; color: var(--text);
  border-bottom: 1px solid var(--border-strong); padding: 2px 0;
}
.form-submit {
  font-size: 11px; color: var(--primary); font-weight: 700;
  letter-spacing: 0.08em; text-transform: uppercase;
  padding: 6px 10px; border: 1px solid var(--primary);
  align-self: flex-end;
}

/* ---- Stacked PK legend ----------------------------------------- */
.stack-legend { display: flex; gap: 16px; font-size: 10px; margin-bottom: 6px; font-family: var(--font-mono); }
.s-fat { color: var(--color-fat); }
.s-green { color: var(--primary); }

/* ---- Push scheduler mini -------------------------------------- */
.sched-mini { display: grid; grid-template-columns: 1fr 1.1fr; gap: 20px; }
.sched-list { display: flex; flex-direction: column; gap: 8px; }
.sched-row {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 10px; background: var(--surface-alt); border: 1px solid var(--border);
  font-size: 12px;
}
.sched-dot { width: 10px; height: 10px; display: inline-block; flex-shrink: 0; }
.sched-label { flex: 1; color: var(--text); font-weight: 600; }
.sched-freq { font-size: 10px; color: var(--text-tertiary); font-family: var(--font-mono); }

.sched-grid {
  border: 1px solid var(--border); background: var(--surface-alt);
  font-family: var(--font-mono); font-size: 10px;
}
.sched-grid-head, .sched-grid-row {
  display: grid; grid-template-columns: 1fr repeat(7, 1fr);
}
.sched-grid-head {
  color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.1em;
  background: var(--surface); border-bottom: 1px solid var(--border);
  font-size: 9px;
}
.sched-grid-head span { padding: 6px 0; text-align: center; }
.sched-grid-head > span:first-child { padding-left: 8px; text-align: left; }
.sched-grid-row { border-bottom: 1px solid var(--border); }
.sched-grid-row:last-child { border-bottom: none; }
.sched-grid-label {
  padding: 8px; font-size: 10px; color: var(--text); font-weight: 600;
  border-right: 1px solid var(--border);
}
.sched-cell {
  padding: 6px 0; text-align: center; color: var(--text-tertiary);
  border-right: 1px solid var(--border);
}
.sched-cell:last-child { border-right: none; }
.sched-cell.on { color: var(--primary); background: color-mix(in srgb, var(--primary) 8%, transparent); }

/* ---- Smart reminder mockup ------------------------------------ */
.push-mock {
  border: 1px solid var(--border); background: var(--surface-alt);
  padding: 10px 12px; margin-bottom: 12px;
  box-shadow: var(--shadow-m);
}
.push-top {
  display: flex; justify-content: space-between; align-items: baseline;
  font-size: 10px; color: var(--text-tertiary); font-family: var(--font-mono);
  letter-spacing: 0.08em; text-transform: uppercase;
  margin-bottom: 6px;
}
.push-app { color: var(--primary); font-weight: 700; }
.push-body { font-size: 12px; line-height: 1.5; color: var(--text); }

.push-skip {
  display: flex; gap: 10px; align-items: flex-start;
  padding: 10px 12px; border: 1px dashed var(--border-strong);
}
.skip-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--text-tertiary); flex-shrink: 0; margin-top: 4px;
}
.skip-body { font-size: 11.5px; line-height: 1.5; }
.skip-body b { color: var(--text); }

/* ---- Symptoms pad --------------------------------------------- */
.symptoms-pad { display: flex; flex-direction: column; gap: 8px; }
.symptom-row { display: flex; align-items: center; gap: 10px; }
.symptom-name {
  font-size: 11px; width: 130px;
  display: flex; align-items: center; gap: 6px;
}
.custom-tag {
  font-size: 8px; letter-spacing: 0.1em;
  padding: 1px 4px; background: var(--surface-alt);
  color: var(--text-tertiary); font-weight: 700;
}
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
.sym-add {
  margin-top: 4px; font-size: 10px; color: var(--text-tertiary);
  font-family: var(--font-mono); letter-spacing: 0.06em;
  padding: 6px 8px; border: 1px dashed var(--border-strong);
  text-align: center;
}

/* ---- Correlation mini ----------------------------------------- */
.corr-legend { display: flex; gap: 16px; font-size: 10px; margin-bottom: 8px; font-family: var(--font-mono); }
.corr-amber { color: var(--color-fat); }
.corr-red { color: var(--color-carbs); }
.corr-dim { color: var(--text-tertiary); margin-left: auto; }
.corr-footer { font-size: 10px; color: var(--text-tertiary); margin-top: 4px; font-family: var(--font-mono); }
.corr-footer .right { float: right; }

/* ---- AI chat with trail --------------------------------------- */
.aichat { font-size: 12px; line-height: 1.55; padding: 0; }
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

.trail {
  list-style: none; margin: 0 0 8px; padding: 0;
  border: 1px solid var(--border); background: var(--surface-alt);
}
.trail-item {
  display: flex; gap: 8px; align-items: baseline;
  padding: 5px 10px; font-size: 11px;
  color: var(--text-secondary); font-family: var(--font-mono);
  border-bottom: 1px dashed var(--border);
}
.trail-item:last-child { border-bottom: none; }
.trail-item .trail-icon { width: 12px; color: var(--text-tertiary); flex-shrink: 0; }
.trail-item.call .trail-icon { color: var(--primary); }
.trail-item.call .trail-text { color: var(--text); }
.trail-item.result .trail-icon { color: var(--primary); }
.ai-final { color: var(--text); font-size: 12.5px; }
.ai-final b { color: var(--text); }

/* ---- Threads mini --------------------------------------------- */
.thread-list { display: flex; flex-direction: column; gap: 6px; }
.thread-row {
  display: flex; justify-content: space-between; align-items: baseline; gap: 10px;
  padding: 10px 12px; background: var(--surface-alt); border: 1px solid var(--border);
  font-size: 12px;
}
.thread-row.active {
  background: color-mix(in srgb, var(--primary) 8%, transparent);
  border-color: var(--primary);
}
.thread-name { color: var(--text); font-weight: 500; flex: 1; }
.thread-when { font-size: 10px; color: var(--text-tertiary); font-family: var(--font-mono); }
.thread-row.new { border-style: dashed; color: var(--text-tertiary); }
.thread-row.new .thread-name { color: var(--text-tertiary); }

/* ---- Platform status ----------------------------------------- */
.status-grid { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
.status-row {
  display: grid; grid-template-columns: 10px 1fr auto; gap: 12px;
  align-items: center; font-size: 12px;
  padding: 8px 10px; background: var(--surface-alt); border: 1px solid var(--border);
}
.status-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--text-tertiary);
}
.status-dot.ok { background: var(--primary); box-shadow: 0 0 6px var(--primary); }
.status-k { color: var(--text); }
.status-v { font-family: var(--font-mono); font-size: 11px; color: var(--text-tertiary); }

.export-bar {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 12px; border: 1px dashed var(--border-strong);
  font-family: var(--font-mono); font-size: 11px;
}
.export-file { color: var(--text); }
.export-btn { color: var(--primary); font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }

/* ---- Final CTA ------------------------------------------------ */
.final-cta {
  padding: 120px 0 140px;
  text-align: center;
  background: radial-gradient(ellipse at center, rgba(91,245,145,0.05) 0%, transparent 60%);
}
.final-cta h2 {
  font-family: var(--font-display);
  font-size: 48px; line-height: 1.05; margin: 0 0 20px;
  font-weight: 700; letter-spacing: -0.02em;
}
.final-cta p { font-size: 14px; color: var(--text-secondary); max-width: 520px; margin: 0 auto 32px; }
.cta-buttons { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
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
.btn-primary.big { font-size: 14px; padding: 16px 28px; }
.btn-secondary {
  padding: 14px 22px; background: transparent; color: var(--text);
  border: 1px solid var(--border-strong); font-weight: 600; font-size: 13px;
  letter-spacing: 0.08em; text-transform: uppercase;
  cursor: pointer; font-family: inherit;
  transition: border-color .15s, color .15s;
}
.btn-secondary:hover { border-color: var(--primary); color: var(--primary); }
.btn-secondary.big { font-size: 14px; padding: 16px 28px; }

/* ---- Responsive ---------------------------------------------- */
@media (max-width: 980px) {
  .card-grid { grid-template-columns: 1fr; }
  .card.wide { grid-column: span 1; }
  .notes-mini, .sched-mini { grid-template-columns: 1fr; }
  .page-head h1 { font-size: 40px; }
  .final-cta h2 { font-size: 36px; }
}
</style>
