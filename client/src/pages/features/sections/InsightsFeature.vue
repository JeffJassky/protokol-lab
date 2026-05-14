<script setup>
import { computed } from 'vue';

const corr = computed(() => {
  const W = 540, H = 200;
  const pad = { t: 18, r: 14, b: 26, l: 30 };
  const W0 = W - pad.l - pad.r, H0 = H - pad.t - pad.b;
  const N = 40;
  const pk = Array.from({ length: N }, (_, i) => 0.5 + 0.5 * Math.exp(-(i % 7) / 4) + Math.sin(i * 0.3) * 0.08);
  const nausea = Array.from({ length: N }, (_, i) => Math.max(0, pk[i] - 0.35) * 8 + (i * 0.173 % 0.6));
  const ix = (i) => pad.l + (i / (N - 1)) * W0;
  const py = (v, max) => pad.t + (1 - v / max) * H0;
  const pkPath = pk.map((v, i) => `${i === 0 ? 'M' : 'L'}${ix(i).toFixed(1)},${py(v, 1.2).toFixed(1)}`).join(' ');
  const nPath = nausea.map((v, i) => `${i === 0 ? 'M' : 'L'}${ix(i).toFixed(1)},${py(v, 6).toFixed(1)}`).join(' ');
  return {
    W, H, pad, pkPath, nPath, padB: pad.t + H0, right: W - pad.r,
    gridYs: [0.25, 0.5, 0.75].map(f => pad.t + f * H0),
  };
});

const findings = [
  { headline: 'Nausea peaks 36h after dose', stat: 'r = 0.74', sub: 'last 8 weeks · 56 paired days' },
  { headline: 'Sleep dips on >250g carb days', stat: 'r = -0.42', sub: 'last 12 weeks · 84 days' },
  { headline: 'Weight loss accelerates above 130g protein', stat: 'change-point', sub: 'shift detected · day 47' },
];
</script>

<template>
  <section class="feat-section">
    <div class="wrap">
      <div class="feat-row">
        <div class="feat-text">
          <h2 class="feat-head">
            Find what's <span class="accent">actually causing what</span>.
          </h2>
          <p class="feat-body">
            Protokol scans your data for patterns — like "nausea peaks 36h
            after dose" or "you sleep worse on high-carb days." Lag built in,
            so cause comes before effect.
          </p>
          <ul class="feat-bullets">
            <li><span><b>Correlations with lag</b> — surfaces the time delay between cause and effect</span></li>
            <li><span><b>Change-point detection</b> — flags when your trend actually shifted</span></li>
            <li><span><b>Top findings only</b> — filtered for sample size and effect, no junk</span></li>
            <li><span><b>Plain English</b> — every finding explained in a sentence</span></li>
          </ul>
        </div>
        <div class="feat-visual">
          <div class="feat-frame" style="padding: 18px">
            <div class="ins-eyebrow">Top finding · this month</div>
            <div class="ins-legend">
              <span class="ins-leg-amber">━ Dose in system</span>
              <span class="ins-leg-red">━ Nausea</span>
              <span class="ins-leg-r">r = 0.74 · lag 36h</span>
            </div>
            <svg :viewBox="`0 0 ${corr.W} ${corr.H}`" class="block-svg">
              <line
                v-for="(y, i) in corr.gridYs"
                :key="i"
                :x1="corr.pad.l"
                :x2="corr.right"
                :y1="y"
                :y2="y"
                stroke="var(--border)"
                stroke-dasharray="2 3"
              />
              <path :d="corr.pkPath" fill="none" stroke="var(--color-fat)" stroke-width="1.75" />
              <path :d="corr.nPath" fill="none" stroke="var(--color-carbs)" stroke-width="1.75" stroke-dasharray="3 2" />
              <text :x="corr.pad.l" :y="corr.H - 8" class="svg-axis-dim">40 days ago</text>
              <text :x="corr.right" :y="corr.H - 8" text-anchor="end" class="svg-axis-dim">today</text>
            </svg>
            <div class="ins-divider"></div>
            <div class="ins-eyebrow">Other findings</div>
            <div class="ins-list">
              <div v-for="f in findings.slice(1)" :key="f.headline" class="ins-item">
                <div class="ins-item-headline">{{ f.headline }}</div>
                <div class="ins-item-meta">
                  <span class="ins-item-stat">{{ f.stat }}</span>
                  <span class="ins-item-sub">· {{ f.sub }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.ins-eyebrow {
  font-size: 9px; color: var(--text-tertiary);
  text-transform: uppercase; letter-spacing: 0.12em; font-weight: 700;
  margin-bottom: 10px;
}
.ins-legend {
  display: flex; flex-wrap: wrap; gap: 14px; align-items: baseline;
  font-family: var(--font-mono); font-size: 10px; margin-bottom: 8px;
}
.ins-leg-amber { color: var(--color-fat); }
.ins-leg-red { color: var(--color-carbs); }
.ins-leg-r { color: var(--text-tertiary); margin-left: auto; }

.ins-divider {
  margin: 18px 0 14px; border-top: 1px dashed var(--border);
}

.ins-list { display: flex; flex-direction: column; gap: 10px; }
.ins-item {
  padding: 10px 12px;
  background: var(--bg); border-left: 2px solid var(--primary);
}
.ins-item-headline {
  font-size: 13px; color: var(--text); font-weight: 500; margin-bottom: 4px;
}
.ins-item-meta {
  display: flex; gap: 6px; align-items: baseline;
  font-family: var(--font-mono); font-size: 10.5px;
}
.ins-item-stat { color: var(--primary); font-weight: 600; }
.ins-item-sub { color: var(--text-tertiary); }
</style>
