<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();
const goRegister = () => router.push('/register');
const goLogin = () => router.push('/login');

// ---- Hero composite chart ------------------------------------------------
const hero = computed(() => {
  const W = 620, H = 420;
  const pad = { t: 32, r: 52, b: 40, l: 52 };
  const W0 = W - pad.l - pad.r, H0 = H - pad.t - pad.b;
  const days = 84;
  const weight = Array.from({ length: days }, (_, i) => {
    const t = i / (days - 1);
    return 226 - t * 19 + Math.sin(i * 0.6) * 0.7 + Math.cos(i * 1.2) * 0.4;
  });
  const mgSteps = [2,2,2.5,2.5,3,3,3.5,3.5,4,4,4,4,4,4,4,4];
  const doses = [7,12,17,22,27,32,37,42,47,52,57,62,67,72,77,82].map((day, i) => ({ day, mg: mgSteps[i] }));
  const k = Math.log(2) / 6;
  const pk = Array.from({ length: days }, (_, i) => {
    let a = 0; for (const d of doses) if (d.day <= i) a += d.mg * Math.exp(-k * (i - d.day));
    return a;
  });
  const ix = (i) => pad.l + (i / (days - 1)) * W0;
  const wMin = Math.min(...weight) - 1, wMax = Math.max(...weight) + 1;
  const wy = (v) => pad.t + (1 - (v - wMin) / (wMax - wMin)) * H0;
  const pkMax = Math.max(...pk) * 1.1;
  const py = (v) => pad.t + (1 - v / pkMax) * H0;
  const weightPath = weight.map((v, i) => `${i === 0 ? 'M' : 'L'}${ix(i).toFixed(1)},${wy(v).toFixed(1)}`).join(' ');
  const pkPath = pk.map((v, i) => `${i === 0 ? 'M' : 'L'}${ix(i).toFixed(1)},${py(v).toFixed(1)}`).join(' ');
  const pkArea = `${pkPath} L${ix(days - 1).toFixed(1)},${pad.t + H0} L${ix(0).toFixed(1)},${pad.t + H0} Z`;
  const grid = Array.from({ length: 5 }, (_, i) => pad.t + (i / 4) * H0);
  return {
    W, H, pad, wMin, wMax, pkMax, weightPath, pkPath, pkArea, grid,
    padB: pad.t + H0,
    right: W - pad.r,
    doses: doses.map(d => ({ ...d, x: ix(d.day) })),
  };
});

// ---- PK mini ------------------------------------------------------------
const pkMini = computed(() => {
  const W = 560, H = 240;
  const pad = { t: 16, r: 16, b: 28, l: 40 };
  const W0 = W - pad.l - pad.r, H0 = H - pad.t - pad.b;
  const days = 70;
  const dosesBase = [5,12,19,26,33,40,47,54,61,68];
  const mgs =       [2,2, 3, 3, 4, 4, 4, 5, 5, 5];
  const doses = dosesBase.map((d, i) => ({ day: d, mg: mgs[i] }));
  const k = Math.log(2) / 6;
  const pk = Array.from({ length: days }, (_, i) => {
    let a = 0; for (const d of doses) if (d.day <= i) a += d.mg * Math.exp(-k * (i - d.day));
    return a;
  });
  const ix = (i) => pad.l + (i / (days - 1)) * W0;
  const pkMax = Math.max(...pk) * 1.1;
  const py = (v) => pad.t + (1 - v / pkMax) * H0;
  const path = pk.map((v, i) => `${i === 0 ? 'M' : 'L'}${ix(i).toFixed(1)},${py(v).toFixed(1)}`).join(' ');
  const area = `${path} L${ix(days-1)},${pad.t+H0} L${ix(0)},${pad.t+H0} Z`;
  const activeNow = pk[pk.length - 1].toFixed(2);
  const gridYs = [0.25, 0.5, 0.75].map(f => pad.t + f * H0);
  return {
    W, H, pad, pkMax, path, area, gridYs, activeNow,
    doses: doses.map(d => ({ ...d, x: ix(d.day), y: py(d.mg * Math.exp(-k * 0)) })),
    padB: pad.t + H0,
    right: W - pad.r,
  };
});

// ---- Rolling 7-day strip ------------------------------------------------
const rolling = computed(() => {
  const days = [
    { d: 'Wed', cal: 2040, tgt: 2100 },
    { d: 'Thu', cal: 1340, tgt: 2100 },
    { d: 'Fri', cal: 1180, tgt: 2100 },
    { d: 'Sat', cal: 2460, tgt: 2100 },
    { d: 'Sun', cal: 2390, tgt: 2100 },
    { d: 'Mon', cal: 2120, tgt: 2100 },
    { d: 'Tue', cal: 1840, tgt: 2100, today: true },
  ];
  const weekTgt = 2100 * 7;
  const weekCons = days.reduce((a, b) => a + b.cal, 0);
  const left = weekTgt - weekCons;
  return {
    days: days.map(d => ({
      ...d,
      h: Math.round((d.cal / 2600) * 100),
      targetPct: Math.round((d.tgt / 2600) * 100),
      over: d.cal > d.tgt,
    })),
    weekTgt: weekTgt.toLocaleString(),
    weekCons: weekCons.toLocaleString(),
    leftAbs: Math.abs(left).toLocaleString(),
  };
});

// ---- Compound library (used by Feature 01) ------------------------------
const compoundLib = [
  { name: 'Semaglutide',    t: '7.0 d' },
  { name: 'Tirzepatide',    t: '5.0 d' },
  { name: 'Retatrutide',    t: '6.0 d', active: true },
  { name: 'BPC-157',        t: '4 hrs' },
  { name: 'Custom...',      t: '—',     custom: true },
];

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
</script>

<template>
  <div class="landing-root">
    <div class="scanlines" aria-hidden="true"></div>

    <!-- NAV -->
    <div class="nav">
      <div class="wrap nav-inner">
        <span class="logo">
          <svg viewBox="0 0 64 64" width="22" height="22" class="logo-mark">
            <circle
              cx="32"
              cy="32"
              r="26"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
            />
            <line
              x1="32"
              y1="2"
              x2="32"
              y2="18"
              stroke="currentColor"
              stroke-width="2.5"
            />
            <line
              x1="32"
              y1="46"
              x2="32"
              y2="62"
              stroke="currentColor"
              stroke-width="2.5"
            />
            <line
              x1="2"
              y1="32"
              x2="18"
              y2="32"
              stroke="currentColor"
              stroke-width="2.5"
            />
            <line
              x1="46"
              y1="32"
              x2="62"
              y2="32"
              stroke="currentColor"
              stroke-width="2.5"
            />
            <circle cx="32" cy="32" r="7" fill="var(--primary)" />
          </svg>
          Protokol Lab
        </span>
        <div class="nav-links">
          <a href="/features" class="nav-link">Features</a>
          <a href="#ai" class="nav-link">AI</a>
          <a href="#pricing" class="nav-link">Pricing</a>
        </div>
        <button class="nav-cta" @click="goLogin">Sign in</button>
      </div>
    </div>

    <!-- HERO -->
    <section class="hero wrap">
      <div>
        <div class="eyebrow eyebrow-green">
          <span class="dot-live"></span> For Semaglutide · Tirzepatide ·
          Retatrutide
        </div>
        <h1>
          Best tracker<br />
          <span class="accent">for GLP-1s.</span><span class="cursor"></span>
        </h1>
        <p class="hero-lead">
          Log your macros, doses, weight, symptoms and photos in one app. See
          how your medication is actually moving the needle, week over week.
        </p>
        <div class="hero-ctas">
          <button class="btn-primary" @click="goRegister">
            Start tracking →
          </button>
          <button class="btn-secondary" @click="goLogin">Sign in</button>
        </div>
        <div class="hero-meta">
          <div class="hero-meta-row">
            <span class="dot-live"></span> Works offline
          </div>
          <div class="hero-meta-row">Free to start · $2.99/mo premium</div>
          <div class="hero-meta-row">No ads · your data stays yours</div>
        </div>
      </div>
      <div>
        <div class="hero-terminal">
          <div class="term-titlebar">
            <div class="term-dots">
              <span class="term-dot"></span>
              <span class="term-dot"></span>
              <span class="term-dot"></span>
            </div>
            <span class="term-title">dashboard · 84d · weight × compound</span>
            <span class="term-badge"><span class="dot-live"></span>LIVE</span>
          </div>
          <div class="term-body" style="padding: 16px; height: 420px;">
            <svg :viewBox="`0 0 ${hero.W} ${hero.H}`" class="block-svg">
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
              <path :d="hero.pkArea" fill="rgba(230,184,85,0.12)" />
              <path
                :d="hero.pkPath"
                fill="none"
                stroke="var(--color-fat)"
                stroke-width="1.5"
                stroke-dasharray="3 3"
                opacity="0.85"
              />
              <path
                :d="hero.weightPath"
                fill="none"
                stroke="var(--primary)"
                stroke-width="2"
              />
              <g v-for="(d, i) in hero.doses" :key="i">
                <line
                  :x1="d.x"
                  :x2="d.x"
                  :y1="hero.pad.t + 6"
                  :y2="hero.padB"
                  stroke="var(--color-fat)"
                  stroke-width="0.75"
                  stroke-dasharray="1 3"
                  opacity="0.35"
                />
                <rect
                  :x="d.x - 16"
                  :y="hero.pad.t - 4"
                  width="32"
                  height="14"
                  fill="var(--color-fat)"
                />
                <text
                  :x="d.x"
                  :y="hero.pad.t + 6"
                  text-anchor="middle"
                  class="svg-dose-label"
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
              <text
                :x="hero.pad.l"
                :y="hero.H - 14"
                text-anchor="start"
                class="svg-axis-dim"
              >
                84d ago
              </text>
              <text
                :x="hero.right"
                :y="hero.H - 14"
                text-anchor="end"
                class="svg-axis-dim"
              >
                today
              </text>
            </svg>
          </div>
        </div>
      </div>
    </section>

    <!-- FEATURE 01 -->
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
            Every dose has a half-life. Protocol plots it for you so you can see
            exactly how much of your medication is active right now — and why
            your appetite comes and goes the way it does. Pick from a library of
            common compounds, or add your own.
          </p>
        </div>
        <div class="feat-row">
          <div class="feat-text">
            <h3 class="feat-head">
              Every compound.<br /><span class="accent">Your schedule.</span>
            </h3>
            <p class="feat-body">
              One-tap presets for Semaglutide, Tirzepatide, Retatrutide, and
              more. Adding your own is two fields: a name and a half-life. The
              curve draws itself.
            </p>
            <ul class="feat-bullets">
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
          <div class="feat-visual">
            <div class="hero-terminal">
              <div class="term-titlebar">
                <div class="term-dots">
                  <span class="term-dot"></span><span class="term-dot"></span
                  ><span class="term-dot"></span>
                </div>
                <span class="term-title">compound · retatrutide · t½ 6d</span>
              </div>
              <div class="term-body" style="height: 400px;">
                <!-- CompoundMini -->
                <div class="mini-pad">
                  <div class="mini-eyebrow">Your library</div>
                  <div
                    v-for="(c, i) in compoundLib"
                    :key="i"
                    class="compound-row"
                    :class="{ active: c.active, custom: c.custom }"
                  >
                    <span class="compound-name">{{ c.name }}</span>
                    <span class="compound-t">t½ {{ c.t }}</span>
                  </div>
                </div>
                <!-- PKMini -->
                <div class="mini-pad alt">
                  <div class="pk-header">
                    <div>
                      <div class="mini-eyebrow">Compound</div>
                      <div class="pk-name">
                        Retatrutide <span class="pk-t">· t½ = 6.0 days</span>
                      </div>
                    </div>
                    <div class="right">
                      <div class="mini-eyebrow">Active now</div>
                      <div class="pk-active">
                        {{ pkMini.activeNow }}<span class="pk-unit"> mg</span>
                      </div>
                    </div>
                  </div>
                  <svg
                    :viewBox="`0 0 ${pkMini.W} ${pkMini.H}`"
                    class="block-svg"
                  >
                    <line
                      v-for="(y, i) in pkMini.gridYs"
                      :key="i"
                      :x1="pkMini.pad.l"
                      :x2="pkMini.right"
                      :y1="y"
                      :y2="y"
                      stroke="var(--border)"
                      stroke-dasharray="1 3"
                    />
                    <path :d="pkMini.area" fill="rgba(230,184,85,0.15)" />
                    <path
                      :d="pkMini.path"
                      fill="none"
                      stroke="var(--color-fat)"
                      stroke-width="1.75"
                    />
                    <g v-for="(d, i) in pkMini.doses" :key="i">
                      <circle
                        :cx="d.x"
                        :cy="d.y"
                        r="3"
                        fill="var(--color-fat)"
                        stroke="var(--bg)"
                        stroke-width="1.5"
                      />
                      <line
                        :x1="d.x"
                        :x2="d.x"
                        :y1="pkMini.padB"
                        :y2="pkMini.padB + 4"
                        stroke="var(--color-fat)"
                        stroke-width="1"
                      />
                    </g>
                    <text
                      :x="pkMini.pad.l - 6"
                      :y="pkMini.pad.t + 4"
                      text-anchor="end"
                      class="svg-axis-dim"
                    >
                      {{ pkMini.pkMax.toFixed(1) }}
                    </text>
                    <text
                      :x="pkMini.pad.l - 6"
                      :y="pkMini.padB + 4"
                      text-anchor="end"
                      class="svg-axis-dim"
                    >
                      0
                    </text>
                    <text
                      :x="pkMini.pad.l"
                      :y="pkMini.H - 8"
                      class="svg-axis-dim"
                    >
                      -70d
                    </text>
                    <text
                      :x="pkMini.right"
                      :y="pkMini.H - 8"
                      text-anchor="end"
                      class="svg-axis-dim"
                    >
                      now
                    </text>
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- FEATURE 02 -->
    <section>
      <div class="wrap">
        <div class="section-head">
          <div class="eyebrow">02 · Weekly calories</div>
          <h2>
            Bad day? It's fine.<br /><span class="accent"
              >Look at your week.</span
            >
          </h2>
          <p class="lead">
            GLP-1s flatten your hunger for a couple days, then it comes back. A
            24-hour calorie counter treats that like failure. Protocol doesn't.
            Your target is a 7-day total — eat light when you can't eat, catch
            up when you can.
          </p>
        </div>
        <div class="feat-row reverse">
          <div class="feat-text">
            <h3 class="feat-head">
              A low-appetite day<br />isn't a
              <span class="accent">broken streak.</span>
            </h3>
            <p class="feat-body">
              Calories roll over. Daily targets adjust to what you've actually
              eaten this week. The strip tells you where you stand at a glance —
              no math, no spreadsheet, no shame.
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
                  ><b>Targets that actually adjust</b> · your week recalibrates
                  as it unfolds</span
                >
              </li>
              <li>
                <span
                  ><b>No red streaks</b> · a light day is information, not a
                  failure</span
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
                      <div class="rolling-track">
                        <div
                          class="rolling-fill"
                          :class="{ today: day.today, over: day.over && !day.today }"
                          :style="{ height: day.h + '%' }"
                        ></div>
                        <div
                          class="rolling-target"
                          :style="{ bottom: day.targetPct + '%' }"
                        ></div>
                      </div>
                      <div class="rolling-label" :class="{ today: day.today }">
                        {{ day.d }}
                      </div>
                    </div>
                  </div>
                  <div class="rolling-note">
                    <span class="arrow">▸</span> Couldn't eat much Thu–Fri.
                    Those calories rolled over.
                    <span class="dim">Week still on track.</span>
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
            Not a chatbot. The AI has tools — it reads your log, searches the
            web for anything new, creates custom foods, and writes entries
            directly into your day. You describe what you ate. It handles the
            rest.
          </p>
        </div>
        <div class="feat-row">
          <div class="feat-text">
            <h3 class="feat-head">
              Tell it what you ate.<br /><span class="accent">It logs it.</span>
            </h3>
            <p class="feat-body">
              Most trackers give you a chat window and call it AI. This one
              actually does things. Watch the tool trail on the right — it
              checks your food database, falls back to web search when a new
              item isn't there, saves it to your library, and writes the
              entry into today's log.
            </p>
            <ul class="feat-bullets">
              <li>
                <span>
                  <b>Reads your data</b> · every food, dose, weigh-in, symptom,
                  and note is available context
                </span>
              </li>
              <li>
                <span>
                  <b>Searches the web</b> · new restaurant, new supplement, any
                  nutrition fact it needs to check
                </span>
              </li>
              <li>
                <span>
                  <b>Creates &amp; logs</b> · custom foods and log entries
                  written straight to your account
                </span>
              </li>
              <li>
                <span>
                  <b>Multi-thread history</b> · keep "Dose escalation plan"
                  separate from "Nausea tolerance"
                </span>
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
                <span class="term-title">ai · tool trail</span>
                <span class="term-badge"><span class="dot-live"></span>LIVE</span>
              </div>
              <div class="term-body" style="padding: 0;">
                <div class="aichat">
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
            If you're coming from MyFitnessPal, you won't miss a thing. Barcode
            scanning, custom foods, saved meals, targets — it's all here, and
            it's all quick.
          </p>
        </div>
        <div class="fg">
          <!-- 01 Food library -->
          <div class="fg-cell">
            <div class="fg-label"><span class="num">01</span>FOOD LIBRARY</div>
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
              Set calories, protein, fat, and carbs the way you want. Lock them
              in, or let them adjust to your actual weekly trend.
            </div>
            <div class="mini-ui">
              <div class="mini-pad alt targets-pad">
                <div v-for="r in targetRows" :key="r.label" class="target-row">
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
                <div class="target-auto">⚙ Auto-adjust: on (weekly)</div>
              </div>
            </div>
          </div>

          <!-- 04 Symptoms -->
          <div class="fg-cell">
            <div class="fg-label"><span class="num">04</span>HOW YOU FEEL</div>
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
              Monthly shots, kept private on your device. Swipe between any two
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
            That's the sales pitch.<br /><span class="accent">See the full tour.</span>
          </h2>
          <p class="lead">
            Food library, saved meals, macro targets, BMR projections, goal
            countdown, progress photos, push scheduler, custom symptoms,
            offline sync, data export. Every feature illustrated with a real
            screen from the app.
          </p>
          <div class="more-cta">
            <a href="/features" class="btn-secondary">Browse all features →</a>
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
        </div>
        <div class="price-cards">
          <div class="price-card">
            <div class="price-kind">Free</div>
            <div class="price-amount">
              $0<span class="per"> / forever</span>
            </div>
            <div class="price-desc">
              Enough to actually run your week. No credit card, no trial timer.
            </div>
            <ul class="price-feats">
              <li>Food log, meals, barcode scan</li>
              <li>Weight and waist tracking</li>
              <li>Symptoms and notes</li>
              <li>Dose tracking with half-life curves</li>
              <li>Rolling 7-day calorie budget</li>
              <li>Progress photos (on-device)</li>
            </ul>
            <button class="btn-secondary wide" @click="goRegister">
              Get started
            </button>
          </div>
          <div class="price-card featured">
            <div class="price-kind accent">Premium</div>
            <div class="price-amount">
              $2.99<span class="per"> / month</span>
            </div>
            <div class="price-desc">
              Everything in Free, plus the tools that turn your data into
              answers.
            </div>
            <ul class="price-feats">
              <li>AI chat that reads your data</li>
              <li>Correlation charts, any two metrics</li>
              <li>Deeper dose charts and stats</li>
              <li>Unlimited custom compounds</li>
              <li>Cloud sync and encrypted backup</li>
              <li>Export all your data, anytime</li>
            </ul>
            <button class="btn-primary wide" @click="goRegister">
              Start premium →
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- FINAL CTA -->
    <section id="cta" class="final-cta">
      <div class="wrap">
        <h2>Stop guessing.<br /><span class="accent">Start tracking.</span></h2>
        <p>
          Food, doses, weight, how you feel — one app, one place. See what's
          actually working for you.
        </p>
        <button class="btn-primary big" @click="goRegister">
          Get started free →
        </button>
      </div>
    </section>

    <!-- FOOTER -->
    <footer>
      <div class="wrap">
        <div class="footer-grid">
          <div>
            <div class="logo footer-logo">
              <svg viewBox="0 0 64 64" width="20" height="20">
                <circle
                  cx="32"
                  cy="32"
                  r="26"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                />
                <line
                  x1="32"
                  y1="2"
                  x2="32"
                  y2="18"
                  stroke="currentColor"
                  stroke-width="2.5"
                />
                <line
                  x1="32"
                  y1="46"
                  x2="32"
                  y2="62"
                  stroke="currentColor"
                  stroke-width="2.5"
                />
                <line
                  x1="2"
                  y1="32"
                  x2="18"
                  y2="32"
                  stroke="currentColor"
                  stroke-width="2.5"
                />
                <line
                  x1="46"
                  y1="32"
                  x2="62"
                  y2="32"
                  stroke="currentColor"
                  stroke-width="2.5"
                />
                <circle cx="32" cy="32" r="7" fill="var(--primary)" />
              </svg>
              Protokol Lab
            </div>
            <div class="footer-blurb">
              Calorie tracking built for GLP-1s. Food, weight, doses, and
              symptoms in one place — so you can see what's actually working.
            </div>
          </div>
          <div class="footer-col">
            <h4>Product</h4>
            <ul>
              <li><a href="#features">Features</a></li>
              <li><a href="#premium">Premium</a></li>
              <li><a href="#pricing">Pricing</a></li>
              <li><a href="#">Changelog</a></li>
            </ul>
          </div>
          <div class="footer-col">
            <h4>Resources</h4>
            <ul>
              <li><a href="#">Help center</a></li>
              <li><a href="#">Compound library</a></li>
              <li><a href="#">Blog</a></li>
              <li><a href="#">Community</a></li>
            </ul>
          </div>
          <div class="footer-col">
            <h4>Legal</h4>
            <ul>
              <li><a href="#">Terms</a></li>
              <li><a href="#">Privacy</a></li>
              <li><a href="#">Data export</a></li>
            </ul>
          </div>
        </div>
        <div class="footer-disclaimer">
          Protokol Lab is an organizational and mathematical modeling tool. It
          does not provide medical advice, diagnose conditions, or recommend the
          consumption of any substance. Users are solely responsible for how
          they choose to interpret their own data. Protokol Lab does not sell,
          distribute, or endorse any compound listed in its library. Consult a
          licensed medical professional before making decisions about your
          health.
        </div>
      </div>
    </footer>
  </div>
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
  overflow-x: hidden;
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
  padding: 72px 0 96px;
  display: grid; grid-template-columns: 1.1fr 1fr; gap: 64px;
  align-items: center;
  border-bottom: 1px solid var(--border);
}
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
.btn-secondary {
  padding: 14px 22px; background: transparent; color: var(--text);
  border: 1px solid var(--border-strong); font-weight: 600; font-size: 13px;
  letter-spacing: 0.08em; text-transform: uppercase;
  cursor: pointer; font-family: inherit;
  transition: border-color .15s, color .15s;
}
.btn-secondary:hover { border-color: var(--primary); color: var(--primary); }
.btn-secondary.wide { width: 100%; }
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
.svg-axis-green { font-size: 10px; fill: var(--primary); font-family: var(--font-mono); }
.svg-axis-amber { font-size: 10px; fill: var(--color-fat); font-family: var(--font-mono); }
.svg-axis-dim   { font-size: 9px;  fill: var(--text-tertiary); font-family: var(--font-mono); }
.svg-axis-tag   { font-size: 9px;  fill: var(--text-tertiary); font-family: var(--font-mono); text-transform: uppercase; letter-spacing: 0.08em; }

/* ---- Sections ----------------------------------------------------- */
section { padding: 96px 0; border-bottom: 1px solid var(--border); }
section.hero { padding: 72px 0 96px; }
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
.rolling-track { height: 70px; display: flex; align-items: flex-end; position: relative; }
.rolling-fill { width: 100%; background: var(--color-cal); opacity: 0.75; }
.rolling-fill.over { background: var(--color-carbs); }
.rolling-fill.today { background: var(--primary); opacity: 1; }
.rolling-target {
  position: absolute; left: 0; right: 0; height: 1px;
  background: var(--text); opacity: 0.25;
}
.rolling-label {
  font-size: 9px; font-family: var(--font-mono); color: var(--text-tertiary); text-align: center;
}
.rolling-label.today { color: var(--primary); font-weight: 700; }
.rolling-note {
  margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--border);
  font-size: 11px; color: var(--text-secondary); line-height: 1.5;
}
.rolling-note .arrow { color: var(--primary); }
.rolling-note .dim { color: var(--text-tertiary); }

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
  padding: 28px; border-right: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
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
.price-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; max-width: 860px; margin: 0 auto; }
.price-card { background: var(--surface); border: 1px solid var(--border); padding: 36px; }
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
  .hero { grid-template-columns: 1fr; padding: 56px 0; }
  .hero h1 { font-size: 44px; }
  .feat-row, .feat-row.reverse { grid-template-columns: 1fr; gap: 36px; }
  .feat-row.reverse .feat-text { order: 1; }
  .feat-row.reverse .feat-visual { order: 2; }
  .fg, .price-cards { grid-template-columns: 1fr; }
  .fg-cell { border-right: none !important; border-bottom: 1px solid var(--border) !important; }
  .footer-grid { grid-template-columns: 1fr 1fr; }
}
</style>
