<script setup>
import { computed } from 'vue';
import { subqDose } from '../../../composables/usePharmacokinetics.js';

const doseChart = computed(() => {
  const W = 540, H = 240;
  const pad = { t: 36, r: 14, b: 28, l: 14 };
  const W0 = W - pad.l - pad.r, H0 = H - pad.t - pad.b;
  const days = 56;
  const doses = [0, 7, 14, 21, 28, 35, 42, 49];
  const mg = 4;
  const halfLife = 5;
  const pk = Array.from({ length: days }, (_, i) => {
    let a = 0; for (const d of doses) a += subqDose(i - d, mg, halfLife);
    return a;
  });
  const ix = (i) => pad.l + (i / (days - 1)) * W0;
  const yMax = Math.max(...pk) * 1.15;
  const py = (v) => pad.t + (1 - v / yMax) * H0;
  const path = pk.map((v, i) => `${i === 0 ? 'M' : 'L'}${ix(i).toFixed(1)},${py(v).toFixed(1)}`).join(' ');
  const area = `${path} L${ix(days - 1).toFixed(1)},${pad.t + H0} L${ix(0).toFixed(1)},${pad.t + H0} Z`;
  return {
    W, H, pad, padB: pad.t + H0, right: W - pad.r,
    path, area,
    doseMarks: doses.map((d) => ({ x: ix(d) })),
    weekTicks: [0, 14, 28, 42, 56].map((d) => ({
      x: ix(Math.min(d, days - 1)),
      label: `wk ${Math.floor(d / 7) + 1}`,
    })),
    todayX: ix(35),
    todayVal: pk[35].toFixed(1),
    todayY: py(pk[35]),
  };
});
</script>

<template>
  <section class="feat-section">
    <div class="wrap">
      <div class="feat-row reverse">
        <div class="feat-text">
          <h2 class="feat-head">
            See <span class="accent">how much is still working</span>.
          </h2>
          <p class="feat-body">
            Tirzepatide, Semaglutide, Mounjaro — the curve shows exactly how
            much is in your system, every day until your next shot. Two fields
            to add anything that isn't preloaded.
          </p>
          <ul class="feat-bullets">
            <li><span><b>Common GLP-1s preloaded</b> — Tirzepatide, Semaglutide, Liraglutide, more</span></li>
            <li><span><b>Anything custom</b> — peptides, HRT, anything with a half-life — the curve draws itself</span></li>
            <li><span><b>Stack two compounds</b> — modeled together, not bar-chart math</span></li>
            <li><span><b>Smart reminders</b> — fire on dose days only, stay silent if you've already logged</span></li>
          </ul>
        </div>
        <div class="feat-visual">
          <div class="feat-frame" style="padding: 20px 18px 12px">
              <svg :viewBox="`0 0 ${doseChart.W} ${doseChart.H}`" class="block-svg">
                <line
                  v-for="t in [0.25, 0.5, 0.75]"
                  :key="t"
                  :x1="doseChart.pad.l"
                  :x2="doseChart.right"
                  :y1="doseChart.pad.t + t * (doseChart.padB - doseChart.pad.t)"
                  :y2="doseChart.pad.t + t * (doseChart.padB - doseChart.pad.t)"
                  stroke="var(--border)"
                  stroke-dasharray="2 3"
                  opacity="0.5"
                />
                <g v-for="(d, i) in doseChart.doseMarks" :key="'d' + i">
                  <rect
                    :x="d.x - 9"
                    :y="doseChart.pad.t - 18"
                    width="18"
                    height="11"
                    fill="var(--color-fat)"
                  />
                  <text
                    :x="d.x"
                    :y="doseChart.pad.t - 10"
                    text-anchor="middle"
                    class="dose-pill-text"
                  >4mg</text>
                  <line
                    :x1="d.x"
                    :x2="d.x"
                    :y1="doseChart.pad.t - 6"
                    :y2="doseChart.padB"
                    stroke="var(--color-fat)"
                    stroke-dasharray="2 3"
                    opacity="0.25"
                  />
                </g>
                <path :d="doseChart.area" fill="var(--color-fat)" opacity="0.12" />
                <path :d="doseChart.path" fill="none" stroke="var(--color-fat)" stroke-width="2" />
                <line
                  :x1="doseChart.todayX"
                  :x2="doseChart.todayX"
                  :y1="doseChart.pad.t"
                  :y2="doseChart.padB"
                  stroke="var(--primary)"
                  stroke-width="1"
                />
                <circle :cx="doseChart.todayX" :cy="doseChart.todayY" r="4" fill="var(--primary)" />
                <text :x="doseChart.todayX + 8" :y="doseChart.todayY - 6" class="today-label">
                  today · {{ doseChart.todayVal }}mg active
                </text>
                <g v-for="(t, i) in doseChart.weekTicks" :key="'w' + i">
                  <text :x="t.x" :y="doseChart.H - 8" text-anchor="middle" class="svg-axis-dim">{{ t.label }}</text>
                </g>
            </svg>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.dose-pill-text {
  fill: var(--bg); font-family: var(--font-mono);
  font-size: 8px; font-weight: 700;
}
.today-label {
  fill: var(--primary); font-family: var(--font-mono);
  font-size: 11px; font-weight: 600;
}
</style>
