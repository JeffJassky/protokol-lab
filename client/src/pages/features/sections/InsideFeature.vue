<script setup>
import { computed } from 'vue';

const dayTrace = computed(() => {
  const W = 540, H = 230;
  const pad = { t: 24, r: 14, b: 28, l: 32 };
  const W0 = W - pad.l - pad.r, H0 = H - pad.t - pad.b;
  const N = 96;
  const meals = [{ h: 7.5, kcal: 420 }, { h: 12.75, kcal: 680 }, { h: 19.5, kcal: 540 }];

  const glucose = Array.from({ length: N }, (_, i) => {
    const t = (i / N) * 24;
    let g = 92 + Math.sin((t - 4) * Math.PI / 12) * 4;
    for (const m of meals) {
      const dt = t - m.h;
      if (dt > 0 && dt < 4) g += (m.kcal / 12) * Math.exp(-dt / 0.8) * (1 - Math.exp(-dt / 0.3));
    }
    return g;
  });
  const insulin = glucose.map((_, i) => {
    const t = (i / N) * 24;
    let lag = 0;
    for (const m of meals) {
      const dt = t - m.h - 0.25;
      if (dt > 0 && dt < 4) lag += (m.kcal / 60) * Math.exp(-dt / 1.0) * (1 - Math.exp(-dt / 0.4));
    }
    return 4 + lag;
  });
  const cortisol = Array.from({ length: N }, (_, i) => {
    const t = (i / N) * 24;
    return 12 + Math.exp(-((t - 7) ** 2) / 8) * 14 - Math.exp(-((t - 22) ** 2) / 18) * 4;
  });

  const ix = (i) => pad.l + (i / (N - 1)) * W0;
  const norm = (arr, lo, hi) => arr.map((v) => pad.t + (1 - (v - lo) / (hi - lo)) * H0);
  const mkPath = (vals, lo, hi) => norm(vals, lo, hi)
    .map((y, i) => `${i === 0 ? 'M' : 'L'}${ix(i).toFixed(1)},${y.toFixed(1)}`).join(' ');

  return {
    W, H, pad, padB: pad.t + H0, right: W - pad.r,
    glucosePath: mkPath(glucose, 80, 160),
    insulinPath: mkPath(insulin, 0, 22),
    cortisolPath: mkPath(cortisol, 0, 30),
    ticks: [0, 6, 12, 18, 24].map((h) => ({
      x: pad.l + (h / 24) * W0,
      label: h === 0 || h === 24 ? '12a' : h === 12 ? '12p' : `${h % 12}${h < 12 ? 'a' : 'p'}`,
    })),
  };
});
</script>

<template>
  <section class="feat-section">
    <div class="wrap">
      <div class="feat-row reverse">
        <div class="feat-text">
          <h2 class="feat-head">
            See your hormones <span class="accent">between blood draws</span>.
          </h2>
          <p class="feat-body">
            Protokol estimates glucose, insulin, cortisol, and others from what
            you eat and dose — every fifteen minutes, all day. An estimate, not
            a measurement, but enough to see when something's off.
          </p>
          <ul class="feat-bullets">
            <li><span><b>A dozen biomarkers</b> — glucose, insulin, GLP-1, cortisol, growth hormone, more</span></li>
            <li><span><b>Updates as you log</b> — no waiting for a lab</span></li>
            <li><span><b>Sharper with context</b> — bloodwork, genetics, cycle, conditions all tune the model</span></li>
          </ul>
        </div>
        <div class="feat-visual">
          <div class="feat-frame" style="padding: 18px">
            <div class="inside-legend">
              <span class="leg leg-glucose">━ Glucose</span>
              <span class="leg leg-insulin">━ Insulin</span>
              <span class="leg leg-cortisol">━ Cortisol</span>
              <span class="leg-dim">· estimate, not measurement</span>
            </div>
            <svg :viewBox="`0 0 ${dayTrace.W} ${dayTrace.H}`" class="block-svg">
              <line
                v-for="t in [0.25, 0.5, 0.75]"
                :key="t"
                :x1="dayTrace.pad.l"
                :x2="dayTrace.right"
                :y1="dayTrace.pad.t + t * (dayTrace.padB - dayTrace.pad.t)"
                :y2="dayTrace.pad.t + t * (dayTrace.padB - dayTrace.pad.t)"
                stroke="var(--border)"
                stroke-dasharray="2 3"
                opacity="0.5"
              />
              <path :d="dayTrace.cortisolPath" fill="none" stroke="var(--color-fat)" stroke-width="1.5" opacity="0.7" />
              <path :d="dayTrace.insulinPath"  fill="none" stroke="var(--color-protein)" stroke-width="1.5" />
              <path :d="dayTrace.glucosePath"  fill="none" stroke="var(--color-cal)" stroke-width="2" />
              <g v-for="(t, i) in dayTrace.ticks" :key="'t' + i">
                <text :x="t.x" :y="dayTrace.H - 8" text-anchor="middle" class="svg-axis-dim">{{ t.label }}</text>
              </g>
            </svg>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.inside-legend {
  display: flex; flex-wrap: wrap; gap: 14px; align-items: baseline;
  font-family: var(--font-mono); font-size: 10px; margin-bottom: 10px;
}
.leg-glucose { color: var(--color-cal); }
.leg-insulin { color: var(--color-protein); }
.leg-cortisol { color: var(--color-fat); }
.leg-dim { color: var(--text-tertiary); margin-left: auto; }
</style>
