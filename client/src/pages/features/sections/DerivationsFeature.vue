<script setup>
import { computed } from 'vue';
import { subqDose } from '../../../composables/usePharmacokinetics.js';

const dashChart = computed(() => {
  const W = 540, H = 240;
  const pad = { t: 30, r: 38, b: 26, l: 36 };
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
  return {
    W, H, pad, weightPath, calPath, pkPath, pkArea, trendPath,
    padB: pad.t + H0, right: W - pad.r,
    doses: doses.map((d) => ({ ...d, x: ix(d.day) })),
  };
});

const chips = [
  { label: 'Weight',      color: 'var(--primary)' },
  { label: 'Calories',    color: 'var(--color-cal)' },
  { label: 'Tirzepatide', color: 'var(--color-fat)' },
];
</script>

<template>
  <section class="feat-section">
    <div class="wrap">
      <div class="feat-row reverse">
        <div class="feat-text">
          <h2 class="feat-head">
            Put any two things on <span class="accent">the same chart</span>.
          </h2>
          <p class="feat-body">
            Weight + dose level. Sleep + nausea. Calories + scale. Anything you
            track, side by side, any time range — patterns you'd otherwise miss.
          </p>
          <ul class="feat-bullets">
            <li><span><b>Multi-series chart</b> — overlay any two things you log</span></li>
            <li><span><b>Trend lines</b> — regression over the visible range</span></li>
            <li><span><b>Day-note pins</b> — your own context attached to specific dates</span></li>
            <li><span><b>Log table</b> — one row per day, jump to the full log</span></li>
          </ul>
        </div>
        <div class="feat-visual">
          <div class="feat-frame" style="padding: 18px">
            <div class="der-chips">
              <span v-for="c in chips" :key="c.label" class="der-chip">
                <span class="der-chip-dot" :style="{ background: c.color }"></span>
                {{ c.label }}
              </span>
              <span class="der-chip-add">+ add</span>
            </div>
            <svg :viewBox="`0 0 ${dashChart.W} ${dashChart.H}`" class="block-svg">
              <line
                v-for="t in [0.25, 0.5, 0.75]"
                :key="t"
                :x1="dashChart.pad.l"
                :x2="dashChart.right"
                :y1="dashChart.pad.t + t * (dashChart.padB - dashChart.pad.t)"
                :y2="dashChart.pad.t + t * (dashChart.padB - dashChart.pad.t)"
                stroke="var(--border)"
                stroke-dasharray="2 3"
                opacity="0.5"
              />
              <path :d="dashChart.pkArea" fill="var(--color-fat)" opacity="0.1" />
              <path :d="dashChart.pkPath" fill="none" stroke="var(--color-fat)" stroke-width="1.5" stroke-dasharray="4 3" />
              <path :d="dashChart.calPath" fill="none" stroke="var(--color-cal)" stroke-width="1.25" opacity="0.75" />
              <path :d="dashChart.trendPath" fill="none" stroke="var(--primary)" stroke-width="1.25" stroke-dasharray="6 4" opacity="0.55" />
              <path :d="dashChart.weightPath" fill="none" stroke="var(--primary)" stroke-width="2" />
              <g v-for="(d, i) in dashChart.doses" :key="'d' + i">
                <rect
                  :x="d.x - 11"
                  :y="dashChart.pad.t - 5"
                  width="22"
                  height="11"
                  fill="var(--color-fat)"
                />
                <text
                  :x="d.x"
                  :y="dashChart.pad.t + 3"
                  text-anchor="middle"
                  class="der-dose-text"
                >{{ d.mg }}mg</text>
              </g>
              <text :x="dashChart.pad.l" :y="dashChart.H - 8" class="svg-axis-dim">90 days ago</text>
              <text :x="dashChart.right" :y="dashChart.H - 8" text-anchor="end" class="svg-axis-dim">today</text>
            </svg>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.der-chips {
  display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px;
}
.der-chip {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 4px 8px;
  background: var(--surface-alt); border: 1px solid var(--border);
  font-family: var(--font-mono); font-size: 10px;
  color: var(--text); letter-spacing: 0.04em;
}
.der-chip-dot { width: 7px; height: 7px; border-radius: 50%; }
.der-chip-add {
  display: inline-flex; align-items: center;
  padding: 4px 8px;
  border: 1px dashed var(--border-strong);
  font-family: var(--font-mono); font-size: 10px;
  color: var(--text-tertiary); letter-spacing: 0.04em;
}
.der-dose-text {
  fill: var(--bg); font-family: var(--font-mono);
  font-size: 8px; font-weight: 700;
}
</style>
