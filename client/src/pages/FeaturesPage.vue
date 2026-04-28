<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import MarketingLayout from '../components/MarketingLayout.vue';
import { useRouteSeo } from '../composables/useSeo.js';
import { useTryDemo } from '../composables/useTryDemo.js';

useRouteSeo();

const router = useRouter();
const goRegister = () => router.push('/register');
const goLogin = () => router.push('/login');
const goHome = () => router.push('/');

const { tryDemo, demoStarting } = useTryDemo();

// ---- Multi-series dashboard chart mini ---------------------------------
// Matches DashboardPage.vue: selectable series (weight / calories / compound
// dose PK) on one chart, with a regression trend line for weight and amber
// dose pills at the top of the plot area.
const dashChart = computed(() => {
  const W = 540, H = 210;
  const pad = { t: 28, r: 38, b: 24, l: 36 };
  const W0 = W - pad.l - pad.r, H0 = H - pad.t - pad.b;
  const N = 84;
  const weight = Array.from({ length: N }, (_, i) => {
    const t = i / (N - 1);
    return 226 - t * 19 + Math.sin(i * 0.6) * 0.8 + Math.cos(i * 1.2) * 0.45;
  });
  const cal = Array.from({ length: N }, (_, i) => (
    2100 + Math.sin(i * 0.9) * 240 + Math.cos(i * 0.35) * 160 + (i % 7 === 0 ? 180 : 0)
  ));
  const mgSteps = [2, 2.5, 3, 3.5, 4, 4, 4, 4, 4, 4, 4, 4];
  const doses = [0, 7, 14, 21, 28, 35, 42, 49, 56, 63, 70, 77].map((day, i) => ({ day, mg: mgSteps[i] }));
  const halfLife = 5;
  const pk = Array.from({ length: N }, (_, i) => {
    let a = 0; for (const d of doses) a += subqDose(i - d.day, d.mg, halfLife);
    return a;
  });
  const xs = weight.map((_, i) => i);
  const xMean = xs.reduce((a, b) => a + b, 0) / N;
  const yMean = weight.reduce((a, b) => a + b, 0) / N;
  const slope = xs.reduce((a, x, i) => a + (x - xMean) * (weight[i] - yMean), 0) /
                xs.reduce((a, x) => a + (x - xMean) ** 2, 0);
  const intercept = yMean - slope * xMean;
  const trend = xs.map((x) => slope * x + intercept);
  const ix = (i) => pad.l + (i / (N - 1)) * W0;
  const wMin = Math.min(...weight) - 1, wMax = Math.max(...weight) + 1;
  const wy = (v) => pad.t + (1 - (v - wMin) / (wMax - wMin)) * H0;
  const cMin = Math.min(...cal) * 0.94, cMax = Math.max(...cal) * 1.06;
  const cy = (v) => pad.t + (1 - (v - cMin) / (cMax - cMin)) * H0;
  const pkMax = Math.max(...pk) * 1.15;
  const py = (v) => pad.t + (1 - v / pkMax) * H0;
  const weightPath = weight.map((v, i) => `${i === 0 ? 'M' : 'L'}${ix(i).toFixed(1)},${wy(v).toFixed(1)}`).join(' ');
  const calPath = cal.map((v, i) => `${i === 0 ? 'M' : 'L'}${ix(i).toFixed(1)},${cy(v).toFixed(1)}`).join(' ');
  const pkPath = pk.map((v, i) => `${i === 0 ? 'M' : 'L'}${ix(i).toFixed(1)},${py(v).toFixed(1)}`).join(' ');
  const pkArea = `${pkPath} L${ix(N - 1).toFixed(1)},${pad.t + H0} L${ix(0).toFixed(1)},${pad.t + H0} Z`;
  const trendPath = trend.map((v, i) => `${i === 0 ? 'M' : 'L'}${ix(i).toFixed(1)},${wy(v).toFixed(1)}`).join(' ');
  const gridYs = Array.from({ length: 4 }, (_, i) => pad.t + ((i + 1) / 5) * H0);
  return {
    W, H, pad, weightPath, calPath, pkPath, pkArea, trendPath, gridYs,
    padB: pad.t + H0, right: W - pad.r,
    doses: doses.map((d) => ({ ...d, x: ix(d.day) })),
    slope: (slope * 7).toFixed(2),
  };
});

// Sub-Q Bateman PK — matches the `subq` profile in SettingsPage. Rises over
// a few hours (ka ~ 6h absorption), then decays at the elimination rate.
function subqDose(t, mg, halfLifeDays) {
  if (t < 0) return 0;
  const ka = Math.LN2 / 0.25;
  const ke = Math.LN2 / halfLifeDays;
  if (Math.abs(ka - ke) < 1e-6) return mg * ke * t * Math.exp(-ke * t);
  return mg * (ka / (ka - ke)) * (Math.exp(-ke * t) - Math.exp(-ka * t));
}

// ---- Stacked doses PK ---------------------------------------------------
const stackedPK = computed(() => {
  const W = 520, H = 190;
  const pad = { t: 14, r: 14, b: 22, l: 36 };
  const W0 = W - pad.l - pad.r, H0 = H - pad.t - pad.b;
  const days = 56;
  const dosesA = [0, 7, 14, 21, 28, 35, 42, 49];
  const dosesB = [3, 10, 17, 24, 31, 38, 45, 52];
  const mgA = 2.5, mgB = 1.0;
  const halfA = 5, halfB = 7;
  const pkA = Array.from({ length: days }, (_, i) => {
    let a = 0; for (const d of dosesA) a += subqDose(i - d, mgA, halfA);
    return a;
  });
  const pkB = Array.from({ length: days }, (_, i) => {
    let a = 0; for (const d of dosesB) a += subqDose(i - d, mgB, halfB);
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

// ---- Kinetics shape profiles (for the shapes explainer card) -----------
// Matches SettingsPage.profileSparkline: single dose, per-shape absorption +
// elimination, normalized to each shape's own peak so the silhouettes read.
const kineticsProfiles = computed(() => {
  const shapes = [
    { value: 'bolus', label: 'Bolus', blurb: 'Instant peak, then exponential decay. IV-like or anything that hits peak almost immediately.' },
    { value: 'subq',  label: 'Sub-Q', blurb: 'Rises over a few hours, then decays. Default for self-injected peptides and GLP-1s.', isDefault: true },
    { value: 'depot', label: 'Depot', blurb: 'Slow release — lower peak, much longer tail. Long-acting weeklies and oil-based formulations.' },
  ];
  const W = 200, H = 56, PAD = 4;
  const N = 80, tMax = 6;
  const halfLife = 1;
  const ke = Math.LN2 / halfLife;
  const ABS = { subq: 0.25, depot: 1 };
  return shapes.map((s) => {
    const ka = s.value === 'bolus' ? null : Math.LN2 / ABS[s.value];
    const pts = [];
    for (let i = 0; i < N; i++) {
      const t = (i / (N - 1)) * tMax;
      let y;
      if (s.value === 'bolus') y = Math.exp(-ke * t);
      else if (Math.abs(ka - ke) < 1e-6) y = ke * t * Math.exp(-ke * t);
      else y = (ka / (ka - ke)) * (Math.exp(-ke * t) - Math.exp(-ka * t));
      pts.push({ t, y });
    }
    const maxY = Math.max(...pts.map((p) => p.y)) || 1;
    const path = pts.map((p, i) => {
      const x = PAD + (p.t / tMax) * (W - 2 * PAD);
      const y = H - PAD - (p.y / maxY) * (H - 2 * PAD);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(' ');
    const area = `${path} L${(W - PAD).toFixed(2)},${(H - PAD).toFixed(2)} L${PAD.toFixed(2)},${(H - PAD).toFixed(2)} Z`;
    return { ...s, path, area, W, H };
  });
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
  { name: 'Tirzepatide',  t: '5.0 d', shape: 'sub-q', every: '7d', active: true  },
  { name: 'Semaglutide',  t: '7.0 d', shape: 'depot', every: '7d', active: false },
];

// Matches SettingsPage: per-compound reminder is a boolean toggle + single
// reminderTime; next dose day is computed from last log + intervalDays. The
// app has no per-weekday picker — it fires on dose days only, at the chosen
// hour. A separate trackReminder sends a nightly "did you log anything?"
// nudge and skips if the day already has any entry.
const schedule = [
  {
    label: 'Tirzepatide',
    kind: 'dose',
    color: 'var(--color-fat)',
    interval: 'Every 7 days',
    time: '8:00 AM',
    next: 'Next · Wed, Apr 24',
    on: true,
  },
  {
    label: 'Semaglutide',
    kind: 'dose',
    color: 'var(--color-protein)',
    interval: 'Every 7 days',
    time: '9:00 AM',
    next: 'Next · Sun, Apr 28',
    on: true,
  },
  {
    label: 'Daily tracking',
    kind: 'track',
    color: 'var(--primary)',
    interval: 'Every evening',
    time: '8:00 PM',
    next: 'Only if nothing logged that day',
    on: true,
  },
];

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

const threads = [
  { name: 'Stalling this week',      when: 'today',  active: true  },
  { name: 'Nausea tolerance',        when: '2d ago', active: false },
  { name: 'Hitting protein on low-appetite days', when: '1w ago', active: false },
  { name: 'Dose escalation plan',    when: '2w ago', active: false },
];

const dashRanges = [
  { label: '30d', active: false },
  { label: '90d', active: true  },
  { label: '6m',  active: false },
  { label: '1y',  active: false },
  { label: 'All', active: false },
];

const dashChips = [
  { label: 'Weight',      color: 'var(--primary)' },
  { label: 'Calories',    color: 'var(--color-cal)' },
  { label: 'Tirzepatide', color: 'var(--color-fat)' },
];

const dashLogRows = [
  { date: 'Tue Apr 22', today: true,  wgt: 207.4, waist: 35.5, dose: null,   cal: 1840, pro: 168, fat: 58, carbs: 172, score: 82, sym: 'ok',  note: false },
  { date: 'Mon Apr 21', today: false, wgt: 207.6, waist: null, dose: null,   cal: 2100, pro: 182, fat: 64, carbs: 201, score: 87, sym: null,  note: false },
  { date: 'Sun Apr 20', today: false, wgt: 208.2, waist: null, dose: null,   cal: 2390, pro: 175, fat: 78, carbs: 226, score: 68, sym: null,  note: true  },
  { date: 'Sat Apr 19', today: false, wgt: 207.9, waist: null, dose: null,   cal: 2460, pro: 190, fat: 81, carbs: 248, score: 62, sym: 'warn', note: false },
  { date: 'Fri Apr 18', today: false, wgt: 208.8, waist: null, dose: '4mg',  cal: 1180, pro: 120, fat: 40, carbs: 105, score: 71, sym: 'warn', note: true  },
  { date: 'Thu Apr 17', today: false, wgt: 209.1, waist: null, dose: null,   cal: 1340, pro: 128, fat: 38, carbs: 128, score: 73, sym: 'ok',   note: false },
];

// Per-angle photo timeline (mirrors PhotoTimelineCard.vue grouping).
// `sel` marks the first-selected thumbnail once a user taps one — drives the
// "Pick a second photo to compare…" hint in the actual UI.
const dashPhotoAngles = [
  { label: 'Front', shots: [
    { m: 'Dec', sel: false },
    { m: 'Jan', sel: false },
    { m: 'Feb', sel: true  },
    { m: 'Mar', sel: false },
    { m: 'Apr', sel: false },
  ]},
  { label: 'Side',  shots: [
    { m: 'Dec', sel: false },
    { m: 'Jan', sel: false },
    { m: 'Feb', sel: false },
    { m: 'Mar', sel: false },
    { m: 'Apr', sel: false },
  ]},
  { label: 'Back',  shots: [
    { m: 'Dec', sel: false },
    { m: 'Feb', sel: false },
    { m: 'Mar', sel: false },
    { m: 'Apr', sel: false },
  ]},
];

const platformRows = [
  { k: 'Installable PWA',     v: 'iOS · Android · Desktop',  ok: true },
  { k: 'Push reminders',      v: 'Per-compound + daily',     ok: true },
  { k: 'Cloud-backed',        v: 'Any device you sign into', ok: true },
  { k: 'Data export',         v: 'JSON · CSV',               ok: true },
];
</script>

<template>
  <MarketingLayout>
    <div class="features-root">
      <!-- HEADER -->
      <section class="page-head">
        <div class="wrap">
          <div class="eyebrow">Reference · every feature</div>
          <h1>
            Every Protokol Lab feature<br /><span class="accent"
              >for GLP-1 tracking.</span
            >
          </h1>
          <p class="lead">
            A full tour of what the app does — dose half-life curves, weekly
            rolling calorie budgets, agentic AI, symptoms, weight, and photos
            for Tirzepatide, Semaglutide, Ozempic, Wegovy, Mounjaro, Zepbound,
            and compounded peptides. Every card below is a real screen from the
            app.
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
                  <div
                    v-for="r in sortFoodRows"
                    :key="r.n"
                    class="food-tbl-row"
                  >
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
                  <div class="meal-kcal">
                    {{ m.kcal }} <span class="dim">kcal</span>
                  </div>
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
                    <span
                      v-for="d in ['M','T','W','T','F','S','S']"
                      :key="d"
                      >{{ d }}</span
                    >
                  </div>
                  <div class="cal-rows">
                    <div class="cal-row">
                      <span
                        v-for="d in [1,2,3,4,5,6,7]"
                        :key="d"
                        class="cal-cell"
                        >{{ d }}</span
                      >
                    </div>
                    <div class="cal-row">
                      <span
                        v-for="d in [8,9,10,11,12,13,14]"
                        :key="d"
                        class="cal-cell"
                        :class="{ src: d === 14 }"
                        >{{ d }}</span
                      >
                    </div>
                    <div class="cal-row">
                      <span
                        v-for="d in [15,16,17,18,19,20,21]"
                        :key="d"
                        class="cal-cell"
                        :class="{ sel: [15,16,17,19].includes(d) }"
                        >{{ d }}</span
                      >
                    </div>
                    <div class="cal-row">
                      <span
                        v-for="d in [22,23,24,25,26,27,28]"
                        :key="d"
                        class="cal-cell"
                        :class="{ sel: [22,23].includes(d) }"
                        >{{ d }}</span
                      >
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
                  <span
                    class="check-name"
                    :class="{ planned: !r.done }"
                    >{{ r.name }}</span
                  >
                  <span class="check-plan" v-if="!r.done"
                    >planned · {{ r.plan }}</span
                  >
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
                English. Auto-saves. The note shows as a pin on the weight chart
                and the log history, so you can reread it in context weeks
                later.
              </div>
              <div class="mini notes-mini">
                <div class="notes-col">
                  <div class="mini-eyebrow">Apr 22 · today</div>
                  <div class="notes-field">
                    <div class="notes-text">
                      Low appetite all day — skipped lunch, dose peak tomorrow.
                    </div>
                    <div class="notes-status">
                      <span class="dot-live"></span>saved
                    </div>
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
                    <line
                      x1="14"
                      x2="306"
                      y1="40"
                      y2="40"
                      stroke="var(--border)"
                      stroke-dasharray="1 3"
                    />
                    <line
                      x1="14"
                      x2="306"
                      y1="80"
                      y2="80"
                      stroke="var(--border)"
                      stroke-dasharray="1 3"
                    />
                    <line
                      x1="14"
                      x2="306"
                      y1="120"
                      y2="120"
                      stroke="var(--border)"
                      stroke-dasharray="1 3"
                    />
                    <path
                      d="M 14 110 Q 60 95 100 88 T 180 72 T 260 58 T 306 48"
                      fill="none"
                      stroke="var(--primary)"
                      stroke-width="2"
                    />
                    <g
                      v-for="(n, i) in dayNotes"
                      :key="n.d"
                      :transform="`translate(${60 + i * 70}, ${90 - i * 12})`"
                    >
                      <line
                        x1="0"
                        x2="0"
                        y1="0"
                        y2="20"
                        stroke="var(--color-fat)"
                        stroke-width="1"
                      />
                      <circle
                        cx="0"
                        cy="0"
                        r="4"
                        fill="var(--color-fat)"
                        stroke="var(--bg)"
                        stroke-width="1.5"
                      />
                    </g>
                    <text x="14" y="135" class="svg-axis-dim">Apr 10</text>
                    <text
                      x="306"
                      y="135"
                      text-anchor="end"
                      class="svg-axis-dim"
                    >
                      Apr 22
                    </text>
                  </svg>
                  <div class="notes-hint">
                    Hover a pin to see the note inline.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ===== TARGETS & PROGRESS ========================================== -->
      <section class="group">
        <div class="wrap">
          <div class="group-head">
            <div class="eyebrow">02 · Targets &amp; progress</div>
            <h2>The numbers you're chasing.</h2>
          </div>

          <div class="card-grid">
            <!-- Week-aware macros -->
            <div class="card">
              <div class="card-head">
                <span class="card-title"
                  >Week-aware macros · today, in context</span
                >
                <span class="card-tag">CORE</span>
              </div>
              <div class="card-body">
                Set daily targets once. The app keeps rolling 7-day totals so a
                heavy Wednesday becomes a lighter Thursday. Every macro row
                tells you exactly how much is left for today — your targets
                don't rewrite themselves, but your plan for the day does.
              </div>
              <div class="mini">
                <div
                  v-for="(r, i) in [
                { label: 'Calories', weekVal: 9480, weekMax: 10500, unit: 'kcal', pct: 90, kind: 'cal',  leftToday: 1020, overToday: false },
                { label: 'Protein',  weekVal: 920,  weekMax: 1260,  unit: 'g',    pct: 73, kind: 'pro',  leftToday: 48,   overToday: false },
                { label: 'Fat',      weekVal: 385,  weekMax: 455,   unit: 'g',    pct: 85, kind: 'fat',  leftToday: 10,   overToday: false },
                { label: 'Carbs',    weekVal: 1560, weekMax: 1470,  unit: 'g',    pct: 100, kind: 'carb', leftToday: 90,   overToday: true  },
              ]"
                  :key="i"
                  class="target-row week-row"
                >
                  <div class="target-head">
                    <span class="target-label">
                      {{ r.label }} <span class="target-sub">(week)</span>
                    </span>
                    <span class="target-val">
                      {{ r.weekVal.toLocaleString()

                      }}<span class="dim">
                        / {{ r.weekMax.toLocaleString() }} {{ r.unit }}</span
                      >
                    </span>
                  </div>
                  <div class="target-track">
                    <div
                      class="target-fill"
                      :class="`kind-${r.kind}`"
                      :style="{ width: r.pct + '%' }"
                    ></div>
                  </div>
                  <div class="target-today" :class="{ over: r.overToday }">
                    <template v-if="r.overToday">
                      over by {{ r.leftToday }}{{ r.unit }} this week
                    </template>
                    <template v-else>
                      {{ r.leftToday.toLocaleString() }}{{ r.unit }} left today
                    </template>
                  </div>
                </div>
                <div class="target-auto tone-good">
                  ▸ On pace for your weekly target.
                </div>
              </div>
            </div>

            <!-- Dashboard stat grid -->
            <div class="card">
              <div class="card-head">
                <span class="card-title">Progress at a glance · 8 numbers</span>
                <span class="card-tag">CORE</span>
              </div>
              <div class="card-body">
                The whole story in one grid: current weight, total change, BMI,
                percent change, weekly average, regression trend, distance to
                goal, and ETA. No scrolling, no drilling in — just the numbers
                that move week over week.
              </div>
              <div class="mini">
                <div class="stat-grid">
                  <div
                    v-for="s in [
                  { label: 'Current',      val: '207.4',  unit: 'lbs' },
                  { label: 'Total Change', val: '-18.6',  unit: 'lbs',   tone: 'good' },
                  { label: 'BMI',          val: '28.4',   unit: '' },
                  { label: '% Change',     val: '-8.2',   unit: '%',     tone: 'good' },
                  { label: 'Weekly Avg',   val: '-1.3',   unit: 'lbs/wk', tone: 'good' },
                  { label: 'Trend',        val: '-1.30',  unit: 'lbs/wk', tone: 'good' },
                  { label: 'To Goal',      val: '22.4',   unit: 'lbs' },
                  { label: 'ETA',          val: '17',     unit: 'weeks',  tone: 'good' },
                ]"
                    :key="s.label"
                    class="stat-cell"
                  >
                    <div class="stat-cell-label">{{ s.label }}</div>
                    <div class="stat-cell-value" :class="s.tone">
                      {{ s.val

                      }}<span class="stat-cell-unit" v-if="s.unit">
                        {{ s.unit }}</span
                      >
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ===== DASHBOARD ANALYSIS ========================================== -->
      <section class="group">
        <div class="wrap">
          <div class="group-head">
            <div class="eyebrow">03 · Dashboard analysis</div>
            <h2>Every metric, on one chart.</h2>
          </div>

          <div class="card-grid">
            <!-- Multi-series chart -->
            <div class="card wide">
              <div class="card-head">
                <span class="card-title"
                  >Multi-series chart · pick anything, compare everything</span
                >
                <span class="card-tag">CORE</span>
              </div>
              <div class="card-body">
                Weight, waist, calories, protein, fat, carbs, nutrition score,
                every active compound, every symptom — put any of them on the
                same chart. Add or remove a series with one tap. Zoom from 30
                days to five years. The regression line for weight draws itself.
              </div>
              <div class="mini">
                <div class="dash-toolbar">
                  <div class="dash-range">
                    <button
                      v-for="r in dashRanges"
                      :key="r.label"
                      :class="{ active: r.active }"
                      type="button"
                    >
                      {{ r.label }}
                    </button>
                  </div>
                </div>
                <div class="dash-chips">
                  <span
                    v-for="chip in dashChips"
                    :key="chip.label"
                    class="dash-chip"
                  >
                    <span
                      class="dash-chip-dot"
                      :style="{ background: chip.color }"
                    ></span>
                    {{ chip.label }}
                    <span class="dash-chip-x">×</span>
                  </span>
                  <span class="dash-chip dash-chip-add">+ Add</span>
                </div>
                <div class="dash-chart-wrap">
                  <svg
                    :viewBox="`0 0 ${dashChart.W} ${dashChart.H}`"
                    class="block-svg"
                  >
                    <!-- grid -->
                    <line
                      v-for="(y, i) in dashChart.gridYs"
                      :key="'g' + i"
                      :x1="dashChart.pad.l"
                      :x2="dashChart.right"
                      :y1="y"
                      :y2="y"
                      stroke="var(--border)"
                      stroke-width="1"
                      stroke-dasharray="2 3"
                      opacity="0.6"
                    />
                    <!-- PK fill + line (amber, dashed) -->
                    <path
                      :d="dashChart.pkArea"
                      fill="var(--color-fat)"
                      opacity="0.1"
                    />
                    <path
                      :d="dashChart.pkPath"
                      fill="none"
                      stroke="var(--color-fat)"
                      stroke-width="1.5"
                      stroke-dasharray="4 3"
                    />
                    <!-- Calories (blue) -->
                    <path
                      :d="dashChart.calPath"
                      fill="none"
                      stroke="var(--color-cal)"
                      stroke-width="1.25"
                      opacity="0.75"
                    />
                    <!-- Weight trend regression (green dashed) -->
                    <path
                      :d="dashChart.trendPath"
                      fill="none"
                      stroke="var(--primary)"
                      stroke-width="1.25"
                      stroke-dasharray="6 4"
                      opacity="0.55"
                    />
                    <!-- Weight line (green solid, primary series) -->
                    <path
                      :d="dashChart.weightPath"
                      fill="none"
                      stroke="var(--primary)"
                      stroke-width="2"
                    />
                    <!-- Dose pills at top of chart area -->
                    <g v-for="(d, i) in dashChart.doses" :key="'d' + i">
                      <line
                        :x1="d.x"
                        :x2="d.x"
                        :y1="dashChart.pad.t + 10"
                        :y2="dashChart.padB"
                        stroke="var(--color-fat)"
                        stroke-width="1"
                        stroke-dasharray="2 3"
                        opacity="0.35"
                      />
                      <rect
                        :x="d.x - 11"
                        :y="dashChart.pad.t - 4"
                        width="22"
                        height="11"
                        fill="var(--color-fat)"
                      />
                      <text
                        :x="d.x"
                        :y="dashChart.pad.t + 4"
                        text-anchor="middle"
                        class="dose-pill-text"
                      >
                        {{ d.mg }}mg
                      </text>
                    </g>
                    <!-- Axis labels -->
                    <text
                      :x="dashChart.pad.l"
                      :y="dashChart.H - 8"
                      class="svg-axis-dim"
                    >
                      84d ago
                    </text>
                    <text
                      :x="dashChart.right"
                      :y="dashChart.H - 8"
                      text-anchor="end"
                      class="svg-axis-dim"
                    >
                      today
                    </text>
                    <text
                      :x="dashChart.pad.l - 6"
                      :y="dashChart.pad.t + 6"
                      text-anchor="end"
                      class="svg-axis-dim"
                    >
                      lbs
                    </text>
                    <text
                      :x="dashChart.right + 4"
                      :y="dashChart.pad.t + 6"
                      class="svg-axis-dim"
                    >
                      mg
                    </text>
                  </svg>
                </div>
                <div class="dash-legend">
                  <span
                    >Trend ·
                    <span class="accent"
                      >{{ dashChart.slope }} lbs/wk</span
                    ></span
                  >
                  <span class="dim">· regression across the full range</span>
                </div>
              </div>
            </div>

            <!-- Log history table -->
            <div class="card wide">
              <div class="card-head">
                <span class="card-title">Log history · one row per day</span>
                <span class="card-tag">CORE</span>
              </div>
              <div class="card-body">
                Every day in one table — weight, waist, dose, calories, macros,
                nutrition score — plus a dot for symptoms and a pencil for any
                day you left a note. Tap a row to jump back to that day's full
                log.
              </div>
              <div class="mini">
                <table class="log-tbl">
                  <thead>
                    <tr>
                      <th class="lt-date">Date</th>
                      <th class="lt-num">Wgt</th>
                      <th class="lt-num">Waist</th>
                      <th class="lt-num">Tirzep</th>
                      <th class="lt-num lt-cal">Kcal</th>
                      <th class="lt-num lt-pro">Pro</th>
                      <th class="lt-num lt-fat">Fat</th>
                      <th class="lt-num lt-carb">Carbs</th>
                      <th class="lt-num lt-score">Score</th>
                      <th class="lt-ctr">Sym</th>
                      <th class="lt-ctr">Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="row in dashLogRows"
                      :key="row.date"
                      :class="{ today: row.today }"
                    >
                      <td class="lt-date">{{ row.date }}</td>
                      <td class="lt-num">{{ row.wgt }}</td>
                      <td class="lt-num">
                        {{ row.waist != null ? row.waist + '&quot;' : '' }}
                      </td>
                      <td class="lt-num">
                        <span
                          v-if="row.dose"
                          class="lt-dose"
                          >{{ row.dose }}</span
                        >
                      </td>
                      <td class="lt-num lt-cal">
                        {{ row.cal.toLocaleString() }}
                      </td>
                      <td class="lt-num lt-pro">{{ row.pro }}g</td>
                      <td class="lt-num lt-fat">{{ row.fat }}g</td>
                      <td class="lt-num lt-carb">{{ row.carbs }}g</td>
                      <td
                        class="lt-num lt-score"
                        :class="row.score >= 85 ? 'score-good' : row.score >= 60 ? 'score-ok' : 'score-bad'"
                      >
                        {{ row.score }}
                      </td>
                      <td class="lt-ctr">
                        <span
                          v-if="row.sym"
                          class="lt-sym-dot"
                          :class="row.sym"
                        ></span>
                      </td>
                      <td class="lt-ctr">
                        <svg
                          v-if="row.note"
                          viewBox="0 0 24 24"
                          class="lt-note-icon"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        >
                          <path
                            d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"
                          />
                          <path d="m15 5 4 4" />
                        </svg>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <!-- Photos by angle + compare -->
            <div class="card wide">
              <div class="card-head">
                <span class="card-title"
                  >Progress photos · timeline by angle, drag to compare</span
                >
                <span class="card-tag">CORE</span>
              </div>
              <div class="card-body">
                Snap a front, side, and back shot whenever you can. The timeline
                organizes them by angle so the strip stays readable as months
                pile up. Tap any two shots and they drop into a before/after
                slider — drag the divider to see what actually changed.
              </div>
              <div class="mini">
                <div
                  v-for="row in dashPhotoAngles"
                  :key="row.label"
                  class="photo-angle-row"
                >
                  <span class="photo-angle-label">{{ row.label }}</span>
                  <div class="photo-angle-strip">
                    <div
                      v-for="shot in row.shots"
                      :key="shot.m"
                      class="photo-thumb"
                      :class="{ sel: shot.sel }"
                    >
                      <span class="photo-thumb-m">{{ shot.m }}</span>
                    </div>
                  </div>
                </div>
                <div class="photo-compare-hint">
                  <span class="accent">▸ Pick a second photo to compare…</span>
                  <span class="dim">Feb selected · Front</span>
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
                Common GLP-1s preloaded. Adding your own takes four fields —
                name, half-life, interval, and kinetics shape. The curve draws
                itself.
              </div>
              <div class="mini">
                <div
                  v-for="c in compounds"
                  :key="c.name"
                  class="compound-row"
                  :class="{ active: c.active }"
                >
                  <span class="compound-name">{{ c.name }}</span>
                  <span class="compound-meta">
                    <span class="compound-shape">{{ c.shape }}</span>
                    <span class="compound-t">t½ {{ c.t }}</span>
                    <span class="compound-every">every {{ c.every }}</span>
                  </span>
                </div>
                <div class="custom-form">
                  <div class="mini-eyebrow">Add custom</div>
                  <div class="form-line">
                    <span class="form-field"
                      ><span class="form-label">name</span
                      ><span class="form-val">Tesofensine</span></span
                    >
                    <span class="form-field"
                      ><span class="form-label">t½</span
                      ><span class="form-val">9.0 d</span></span
                    >
                  </div>
                  <div class="form-line">
                    <span class="form-field"
                      ><span class="form-label">interval</span
                      ><span class="form-val">7 d</span></span
                    >
                    <span class="form-field"
                      ><span class="form-label">shape</span
                      ><span class="form-val">sub-q</span></span
                    >
                    <span class="form-submit">+ add</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Kinetics shapes -->
            <div class="card wide">
              <div class="card-head">
                <span class="card-title"
                  >Kinetics shapes · bolus / sub-Q / depot</span
                >
                <span class="card-tag">CORE</span>
              </div>
              <div class="card-body">
                Not every compound absorbs the same way. Pick the profile that
                matches how yours hits — the curve adjusts. Sub-Q is the default
                for self-injected peptides; depot for long-acting oil-based
                weeklies; bolus for anything that peaks immediately.
              </div>
              <div class="mini kinetics-grid">
                <div
                  v-for="k in kineticsProfiles"
                  :key="k.value"
                  class="kinetics-cell"
                  :class="{ 'is-default': k.isDefault }"
                >
                  <div class="kinetics-head">
                    <span class="kinetics-label">{{ k.label }}</span>
                    <span v-if="k.isDefault" class="kinetics-default"
                      >DEFAULT</span
                    >
                  </div>
                  <svg
                    :viewBox="`0 0 ${k.W} ${k.H}`"
                    class="block-svg kinetics-svg"
                  >
                    <path :d="k.area" fill="rgba(230,184,85,0.12)" />
                    <path
                      :d="k.path"
                      fill="none"
                      stroke="var(--color-fat)"
                      stroke-width="1.5"
                    />
                  </svg>
                  <div class="kinetics-blurb">{{ k.blurb }}</div>
                </div>
              </div>
            </div>

            <!-- Stacked doses -->
            <div class="card">
              <div class="card-head">
                <span class="card-title"
                  >Stacked doses · modeled correctly</span
                >
                <span class="card-tag">CORE</span>
              </div>
              <div class="card-body">
                Run two compounds at once and the curves add up the way real
                pharmacokinetics do — not a toy bar chart. Each dose decays at
                its own half-life.
              </div>
              <div class="mini">
                <div class="stack-legend">
                  <span class="s-fat">━ Tirzepatide · t½ 5d</span>
                  <span class="s-green">━ Semaglutide · t½ 7d</span>
                </div>
                <svg
                  :viewBox="`0 0 ${stackedPK.W} ${stackedPK.H}`"
                  class="block-svg"
                >
                  <path :d="stackedPK.aArea" fill="rgba(230,184,85,0.14)" />
                  <path
                    :d="stackedPK.pA"
                    fill="none"
                    stroke="var(--color-fat)"
                    stroke-width="1.75"
                  />
                  <path
                    :d="stackedPK.pB"
                    fill="none"
                    stroke="var(--primary)"
                    stroke-width="1.5"
                    stroke-dasharray="3 2"
                  />
                  <text :x="14" :y="stackedPK.H - 8" class="svg-axis-dim">
                    -56d
                  </text>
                  <text
                    :x="stackedPK.right"
                    :y="stackedPK.H - 8"
                    text-anchor="end"
                    class="svg-axis-dim"
                  >
                    now
                  </text>
                </svg>
              </div>
            </div>

            <!-- Push reminders -->
            <div class="card wide">
              <div class="card-head">
                <span class="card-title"
                  >Push reminders · interval + one send-time</span
                >
                <span class="card-tag">CORE</span>
              </div>
              <div class="card-body">
                Each compound has its own dose interval and a single reminder
                time. The next dose day is computed from your last log plus the
                interval — the push fires at your chosen hour on dose days only.
                A separate daily tracking reminder nudges you in the evening if
                you haven't logged anything yet.
              </div>
              <div class="mini">
                <div class="sched-list">
                  <div
                    v-for="s in schedule"
                    :key="s.label"
                    class="sched-row"
                    :class="{ 'sched-track': s.kind === 'track' }"
                  >
                    <span
                      class="sched-dot"
                      :style="{ background: s.color }"
                    ></span>
                    <div class="sched-info">
                      <div class="sched-label">{{ s.label }}</div>
                      <div class="sched-cadence">{{ s.interval }}</div>
                    </div>
                    <div class="sched-timing">
                      <div class="sched-time">{{ s.time }}</div>
                      <div class="sched-next">{{ s.next }}</div>
                    </div>
                    <span class="sched-toggle" :class="{ on: s.on }">
                      <span class="sched-toggle-thumb"></span>
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Smart reminder -->
            <div class="card">
              <div class="card-head">
                <span class="card-title"
                  >Smart daily reminder · skips if you already logged</span
                >
                <span class="card-tag">CORE</span>
              </div>
              <div class="card-body">
                The evening tracking reminder checks your log first. If the day
                already has any entry — a weigh-in, a dose, a meal — the push
                doesn't fire. No "did I do that already?" lookups at bedtime.
              </div>
              <div class="mini push-stack">
                <div class="ios-push">
                  <div class="ios-push-header">
                    <span class="ios-push-icon" aria-hidden="true">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.6"
                        stroke-linecap="round"
                      >
                        <circle cx="12" cy="12" r="9" />
                        <line x1="12" y1="3" x2="12" y2="7" />
                        <line x1="12" y1="17" x2="12" y2="21" />
                        <line x1="3" y1="12" x2="7" y2="12" />
                        <line x1="17" y1="12" x2="21" y2="12" />
                        <circle
                          cx="12"
                          cy="12"
                          r="1.8"
                          fill="currentColor"
                          stroke="none"
                        />
                      </svg>
                    </span>
                    <span class="ios-push-app">PROTOKOL LAB</span>
                    <span class="ios-push-time">now</span>
                  </div>
                  <div class="ios-push-title">Tirzepatide due</div>
                  <div class="ios-push-body">
                    Tap to log. Expected dose: 4 mg.
                  </div>
                </div>
                <div class="push-skip">
                  <span class="skip-dot"></span>
                  <span class="skip-body">
                    <b>Daily tracking reminder skipped.</b>
                    <span class="dim"
                      >You already logged a dose at 6:42 AM.</span
                    >
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
                Built-in symptoms cover the common GLP-1 side effects. Custom
                symptoms are one field — anything you want to track lives in the
                same log.
              </div>
              <div class="mini symptoms-pad">
                <div
                  v-for="s in symptomsList"
                  :key="s.name"
                  class="symptom-row"
                >
                  <span class="symptom-name">
                    {{ s.name }}
                    <span v-if="s.custom" class="custom-tag">CUSTOM</span>
                  </span>
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
                Put any two things on the same chart. Find out nausea peaks two
                days after your shot, or that you sleep worse on high-carb days.
                Patterns, not guesses.
              </div>
              <div class="mini">
                <div class="corr-legend">
                  <span class="corr-amber">━ Dose in system</span>
                  <span class="corr-red">━ Nausea</span>
                  <span class="corr-dim">r = 0.74</span>
                </div>
                <svg
                  :viewBox="`0 0 ${correlation.W} ${correlation.H}`"
                  class="block-svg"
                >
                  <line
                    v-for="(y, i) in correlation.gridYs"
                    :key="i"
                    :x1="correlation.pad.l"
                    :x2="correlation.right"
                    :y1="y"
                    :y2="y"
                    stroke="var(--border)"
                    stroke-dasharray="1 3"
                  />
                  <path
                    :d="correlation.pkPath"
                    fill="none"
                    stroke="var(--color-fat)"
                    stroke-width="1.5"
                  />
                  <path
                    :d="correlation.nPath"
                    fill="none"
                    stroke="var(--color-carbs)"
                    stroke-width="1.5"
                    stroke-dasharray="3 2"
                  />
                </svg>
                <div class="corr-footer">
                  -40d <span class="right">today</span>
                </div>
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
                <span class="card-title"
                  >Reads your data · uses tools · acts</span
                >
                <span class="card-tag premium">PREMIUM</span>
              </div>
              <div class="card-body">
                Ask it anything. It has tools for searching foods, creating
                custom items, logging entries, pulling any stretch of your own
                data, and searching the web. What it can't look up from your
                log, it finds online — then writes the log for you.
              </div>
              <div class="mini aichat">
                <div class="aichat-msg user">
                  <div class="aichat-tag">You</div>
                  <div>I just ate a Sweetgreen Kale Caesar at lunch.</div>
                </div>
                <div class="aichat-msg ai">
                  <div class="aichat-tag">Protokol Lab</div>
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
                Every conversation is its own thread. Keep "Nausea tolerance"
                separate from "Dose escalation plan." Rename, delete, resume any
                thread at any time.
              </div>
              <div class="mini">
                <div class="thread-list">
                  <div
                    v-for="t in threads"
                    :key="t.name"
                    class="thread-row"
                    :class="{ active: t.active }"
                  >
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
            <!-- Installable PWA · push · export -->
            <div class="card wide">
              <div class="card-head">
                <span class="card-title">Installable PWA · push · export</span>
                <span class="card-tag">CORE</span>
              </div>
              <div class="card-body">
                Installs to your home screen on iOS, Android, and desktop. Push
                reminders deliver through your phone's lock screen. Your whole
                history exports as JSON or CSV whenever you want — no paywall,
                no support ticket.
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
                  <span class="export-file"
                    >protokol-lab-export-2026-04-22.json</span
                  >
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
          <h2>
            That's the tour.<br /><span class="accent">Start tracking.</span>
          </h2>
          <p>
            Free to start. Premium unlocks the AI and correlation charts from
            $6.58/mo (billed annually).
          </p>
          <div class="cta-buttons">
            <button
              class="btn-primary big"
              :disabled="demoStarting"
              @click="tryDemo"
            >
              {{ demoStarting ? 'Loading…' : 'Try the demo →' }}
            </button>
            <button class="btn-secondary big" @click="goRegister">
              Sign up free
            </button>
          </div>
        </div>
      </section>
    </div>
  </MarketingLayout>
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
  overflow-x: clip;
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
.target-auto.tone-good {
  color: var(--text-secondary);
  border-left: 2px solid var(--primary);
  border-top: 1px dashed var(--border-strong);
  border-right: 1px dashed var(--border-strong);
  border-bottom: 1px dashed var(--border-strong);
  background: var(--bg);
}
.target-sub {
  color: var(--text-tertiary);
  font-weight: 400;
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.04em;
  margin-left: 2px;
}
.target-today {
  margin-top: 4px;
  font-size: 10px;
  font-family: var(--font-mono);
  color: var(--text-tertiary);
  letter-spacing: 0.02em;
}
.target-today.over {
  color: var(--color-carbs);
}
.week-row + .week-row { margin-top: 8px; }

/* ---- Stat grid mini -------------------------------------------- */
.stat-grid {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px;
}
.stat-cell {
  padding: 10px 6px;
  background: var(--bg);
  border: 1px solid var(--border);
  text-align: center;
  min-width: 0;
}
.stat-cell-label {
  font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.12em;
  color: var(--text-tertiary); font-weight: 700;
  margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.stat-cell-value {
  font-size: 15px; font-family: var(--font-mono);
  font-weight: 700; font-variant-numeric: tabular-nums;
  color: var(--text); line-height: 1; white-space: nowrap;
}
.stat-cell-value.good { color: var(--primary); }
.stat-cell-value.bad  { color: var(--color-carbs); }
.stat-cell-unit {
  font-size: 9px; color: var(--text-tertiary); font-weight: 400;
  letter-spacing: 0.02em; margin-left: 1px;
}
@media (max-width: 560px) {
  .stat-grid { grid-template-columns: repeat(2, 1fr); }
}

/* ---- Dashboard multi-series chart mini ------------------------- */
.dash-toolbar {
  display: flex; justify-content: flex-end; margin-bottom: 8px;
}
.dash-range {
  display: inline-flex; border: 1px solid var(--border);
  background: var(--bg); padding: 2px; gap: 2px;
}
.dash-range button {
  padding: 3px 9px; background: none; border: none;
  font-family: var(--font-mono); font-size: 10px;
  color: var(--text-tertiary); cursor: default;
  letter-spacing: 0.06em;
}
.dash-range button.active {
  background: var(--surface-raised); color: var(--text); font-weight: 700;
}
.dash-chips {
  display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 10px;
}
.dash-chip {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 3px 7px;
  background: var(--surface-raised);
  border: 1px solid var(--border);
  font-size: 10px; font-family: var(--font-mono);
  color: var(--text); letter-spacing: 0.04em;
  white-space: nowrap;
}
.dash-chip-dot {
  width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0;
}
.dash-chip-x {
  color: var(--text-tertiary); font-size: 11px; margin-left: 2px; line-height: 1;
}
.dash-chip-add {
  border-style: dashed; color: var(--text-tertiary);
}
.dash-chart-wrap { margin-bottom: 8px; }
.dose-pill-text {
  fill: var(--bg); font-family: var(--font-mono);
  font-size: 8px; font-weight: 700; letter-spacing: 0.02em;
}
.dash-legend {
  display: flex; gap: 6px; align-items: baseline;
  font-family: var(--font-mono); font-size: 11px; color: var(--text-secondary);
  padding-top: 8px; border-top: 1px solid var(--border);
}

/* ---- Log history table mini ----------------------------------- */
.log-tbl {
  width: 100%; border-collapse: collapse;
  font-family: var(--font-mono); font-size: 10.5px;
  font-variant-numeric: tabular-nums;
}
.log-tbl th {
  font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.1em;
  font-weight: 700; color: var(--text-tertiary);
  padding: 6px 4px; text-align: right;
  border-bottom: 1px solid var(--border);
}
.log-tbl th.lt-date { text-align: left; }
.log-tbl th.lt-ctr { text-align: center; }
.log-tbl th.lt-cal   { color: var(--color-cal); }
.log-tbl th.lt-pro   { color: var(--color-protein); }
.log-tbl th.lt-fat   { color: var(--color-fat); }
.log-tbl th.lt-carb  { color: var(--color-carbs); }
.log-tbl td {
  padding: 7px 4px; text-align: right; color: var(--text);
  border-bottom: 1px dashed var(--border);
}
.log-tbl tbody tr:last-child td { border-bottom: none; }
.log-tbl tbody tr.today td { background: color-mix(in srgb, var(--primary) 5%, transparent); }
.log-tbl td.lt-date {
  text-align: left; color: var(--text-tertiary);
  text-transform: uppercase; letter-spacing: 0.06em; white-space: nowrap;
  font-size: 9.5px;
}
.log-tbl td.lt-ctr { text-align: center; }
.log-tbl td.lt-cal  { color: var(--color-cal); font-weight: 700; }
.log-tbl td.lt-pro  { color: var(--color-protein); }
.log-tbl td.lt-fat  { color: var(--color-fat); }
.log-tbl td.lt-carb { color: var(--color-carbs); }
.log-tbl td.lt-score { font-weight: 700; }
.log-tbl td.score-good { color: var(--primary); }
.log-tbl td.score-ok   { color: var(--color-fat); }
.log-tbl td.score-bad  { color: var(--color-carbs); }
.lt-dose {
  display: inline-block; padding: 1px 5px;
  background: var(--color-fat); color: var(--bg);
  font-size: 9px; font-weight: 700; letter-spacing: 0.02em;
}
.lt-sym-dot {
  display: inline-block; width: 7px; height: 7px; border-radius: 50%;
  background: var(--text-tertiary);
}
.lt-sym-dot.ok   { background: var(--primary); }
.lt-sym-dot.warn { background: var(--color-carbs); }
.lt-note-icon {
  width: 11px; height: 11px; color: var(--text-tertiary); vertical-align: middle;
}

/* ---- Photos: angle timeline + compare hint -------------------- */
.photo-angle-row {
  display: flex; align-items: center; gap: 12px;
  padding: 8px 0; border-bottom: 1px dashed var(--border);
}
.photo-angle-row:last-of-type { border-bottom: none; }
.photo-angle-label {
  flex-shrink: 0; width: 52px;
  font-family: var(--font-mono); font-size: 9px; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.12em;
  color: var(--text-tertiary);
}
.photo-angle-strip {
  display: flex; gap: 6px; flex: 1; min-width: 0; overflow: hidden;
}
.photo-thumb {
  width: 44px; aspect-ratio: 3/4; flex-shrink: 0;
  background: var(--surface-raised); border: 1px solid var(--border);
  background-image: repeating-linear-gradient(135deg, transparent 0 6px, rgba(91,245,145,0.04) 6px 7px);
  display: flex; align-items: flex-end; justify-content: flex-start;
  padding: 3px;
}
.photo-thumb.sel {
  border-color: var(--primary);
  outline: 1px solid var(--primary); outline-offset: 1px;
}
.photo-thumb-m {
  font-family: var(--font-mono); font-size: 8px;
  color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.08em;
}
.photo-thumb.sel .photo-thumb-m { color: var(--primary); font-weight: 700; }
.photo-compare-hint {
  margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--border);
  display: flex; justify-content: space-between; align-items: baseline;
  font-family: var(--font-mono); font-size: 11px; color: var(--text-secondary);
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
.compound-meta {
  display: inline-flex; align-items: baseline; gap: 10px;
  font-family: var(--font-mono); font-size: 10.5px;
}
.compound-shape {
  font-size: 9px; letter-spacing: 0.1em; text-transform: uppercase;
  color: var(--text-tertiary);
  padding: 1px 5px; border: 1px solid var(--border);
}
.compound-t { color: var(--color-fat); }
.compound-every { color: var(--text-tertiary); }
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

/* ---- Kinetics shape grid --------------------------------------- */
.kinetics-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px;
}
.kinetics-cell {
  padding: 12px; border: 1px solid var(--border); background: var(--surface-alt);
  display: flex; flex-direction: column; gap: 8px;
}
.kinetics-cell.is-default { border-color: var(--primary); }
.kinetics-head {
  display: flex; justify-content: space-between; align-items: baseline;
}
.kinetics-label {
  font-size: 13px; font-weight: 700; letter-spacing: 0.02em;
}
.kinetics-default {
  font-size: 8.5px; font-weight: 700; letter-spacing: 0.14em;
  color: var(--primary); padding: 2px 6px; border: 1px solid var(--primary);
}
.kinetics-svg {
  background: var(--surface); border: 1px solid var(--border);
}
.kinetics-blurb {
  font-size: 11px; color: var(--text-secondary); line-height: 1.5;
}
@media (max-width: 800px) {
  .kinetics-grid { grid-template-columns: 1fr; }
}

/* ---- Push scheduler mini -------------------------------------- */
.sched-list { display: flex; flex-direction: column; gap: 8px; }
.sched-row {
  display: grid;
  grid-template-columns: auto 1fr auto auto;
  align-items: center;
  gap: 14px;
  padding: 12px 14px;
  background: var(--surface-alt);
  border: 1px solid var(--border);
  border-left: 3px solid transparent;
}
.sched-row.sched-track { border-left-color: var(--primary); }
.sched-dot {
  width: 10px; height: 10px; display: inline-block;
  flex-shrink: 0; border-radius: 50%;
}
.sched-info { min-width: 0; }
.sched-label { color: var(--text); font-weight: 700; font-size: 13px; }
.sched-cadence {
  font-size: 10px; color: var(--text-tertiary);
  font-family: var(--font-mono); letter-spacing: 0.04em; margin-top: 2px;
}
.sched-timing { text-align: right; }
.sched-time {
  font-family: var(--font-mono); font-variant-numeric: tabular-nums;
  font-weight: 700; color: var(--primary); font-size: 14px;
}
.sched-next {
  font-family: var(--font-mono); font-size: 10px;
  color: var(--text-tertiary); margin-top: 2px;
}
.sched-toggle {
  width: 28px; height: 16px; border-radius: 9px;
  background: var(--surface-raised); border: 1px solid var(--border);
  position: relative; flex-shrink: 0; transition: background 0.2s;
}
.sched-toggle.on { background: var(--primary); border-color: var(--primary); }
.sched-toggle-thumb {
  position: absolute; top: 1px; left: 1px;
  width: 12px; height: 12px; border-radius: 50%;
  background: var(--bg); transition: left 0.2s;
}
.sched-toggle.on .sched-toggle-thumb { left: 13px; }

/* ---- iOS-native push notification mockup ---------------------- */
.push-stack { display: flex; flex-direction: column; gap: 12px; }
.ios-push {
  font-family: -apple-system, 'SF Pro', 'SF Pro Text', system-ui, sans-serif;
  background: rgba(245, 245, 247, 0.98);
  color: #000;
  border-radius: 20px;
  padding: 12px 14px 14px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.16), 0 0 0 0.5px rgba(0, 0, 0, 0.06);
}
[data-theme='dark'] .ios-push {
  background: rgba(44, 44, 46, 0.94);
  color: #fff;
  box-shadow: 0 2px 14px rgba(0, 0, 0, 0.45), 0 0 0 0.5px rgba(255, 255, 255, 0.06);
}
.ios-push-header {
  display: flex; align-items: center; gap: 8px; margin-bottom: 4px;
}
.ios-push-icon {
  width: 20px; height: 20px;
  border-radius: 5px;
  background: var(--primary);
  color: #fff;
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.ios-push-icon svg { width: 13px; height: 13px; }
.ios-push-app {
  flex: 1;
  font-size: 13px; font-weight: 600; letter-spacing: 0.02em;
  color: inherit; opacity: 0.75;
  text-transform: uppercase;
  font-family: inherit;
}
.ios-push-time {
  font-size: 13px; opacity: 0.5;
  font-family: inherit; letter-spacing: 0;
}
.ios-push-title {
  font-size: 15px; font-weight: 600; margin-bottom: 2px; line-height: 1.25;
  color: inherit;
}
.ios-push-body {
  font-size: 15px; line-height: 1.3; color: inherit; opacity: 0.85;
}

/* ---- "Skipped" callout -------------------------------------- */
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
  .notes-mini { grid-template-columns: 1fr; }
  .page-head h1 { font-size: 40px; }
  .final-cta h2 { font-size: 36px; }
}
</style>
