<script setup>
import { computed } from 'vue';

// Smoothed weight chart with regression trend + ETA marker.
const weightChart = computed(() => {
  const W = 540, H = 240;
  const pad = { t: 24, r: 80, b: 28, l: 14 };
  const W0 = W - pad.l - pad.r, H0 = H - pad.t - pad.b;
  const N = 90;
  const data = Array.from({ length: N }, (_, i) => {
    const t = i / (N - 1);
    return 226 - t * 19 + Math.sin(i * 0.55) * 0.9 + Math.cos(i * 1.1) * 0.6;
  });
  const xs = data.map((_, i) => i);
  const xMean = xs.reduce((a, b) => a + b, 0) / N;
  const yMean = data.reduce((a, b) => a + b, 0) / N;
  const slope = xs.reduce((a, x, i) => a + (x - xMean) * (data[i] - yMean), 0) /
                xs.reduce((a, x) => a + (x - xMean) ** 2, 0);
  const intercept = yMean - slope * xMean;
  const trend = xs.map((x) => slope * x + intercept);
  const lo = Math.min(...data) - 1, hi = Math.max(...data) + 1;
  const ix = (i) => pad.l + (i / (N - 1)) * W0;
  const py = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * H0;
  const path = data.map((v, i) => `${i === 0 ? 'M' : 'L'}${ix(i).toFixed(1)},${py(v).toFixed(1)}`).join(' ');
  const trendPath = trend.map((v, i) => `${i === 0 ? 'M' : 'L'}${ix(i).toFixed(1)},${py(v).toFixed(1)}`).join(' ');
  return {
    W, H, pad, padB: pad.t + H0, right: W - pad.r,
    path, trendPath,
    current: data[N - 1].toFixed(1),
    trendVal: (slope * 7).toFixed(2),
    eta: 17,
  };
});
</script>

<template>
  <section class="feat-section">
    <div class="wrap">
      <div class="feat-row">
        <div class="feat-text">
          <h2 class="feat-head">
            Track your <span class="accent">body</span>, not just your scale.
          </h2>
          <p class="feat-body">
            Daily weight bounces — the trend line cuts through the noise. Add
            photos, measurements, anything else that matters to you.
          </p>
          <ul class="feat-bullets">
            <li><span><b>Weight with a trend line</b> — daily noise filtered, ETA always visible</span></li>
            <li><span><b>Progress photos</b> — front, side, back; tap two and drag to compare</span></li>
            <li><span><b>Any measurement</b> — waist, body fat, sleep, resting heart rate, your own</span></li>
          </ul>
        </div>
        <div class="feat-visual">
          <div class="feat-frame" style="padding: 18px">
            <div class="track-stats">
              <div class="track-stat">
                <div class="track-stat-label">Current</div>
                <div class="track-stat-val">{{ weightChart.current }}<span class="track-stat-unit">lb</span></div>
              </div>
              <div class="track-stat">
                <div class="track-stat-label">Trend</div>
                <div class="track-stat-val accent">{{ weightChart.trendVal }}<span class="track-stat-unit">/wk</span></div>
              </div>
              <div class="track-stat">
                <div class="track-stat-label">ETA to goal</div>
                <div class="track-stat-val accent">{{ weightChart.eta }}<span class="track-stat-unit">wks</span></div>
              </div>
            </div>
            <svg :viewBox="`0 0 ${weightChart.W} ${weightChart.H}`" class="block-svg">
              <line
                v-for="t in [0.25, 0.5, 0.75]"
                :key="t"
                :x1="weightChart.pad.l"
                :x2="weightChart.right"
                :y1="weightChart.pad.t + t * (weightChart.padB - weightChart.pad.t)"
                :y2="weightChart.pad.t + t * (weightChart.padB - weightChart.pad.t)"
                stroke="var(--border)"
                stroke-dasharray="2 3"
                opacity="0.5"
              />
              <path :d="weightChart.trendPath" fill="none" stroke="var(--primary)" stroke-width="1.25" stroke-dasharray="6 4" opacity="0.55" />
              <path :d="weightChart.path" fill="none" stroke="var(--primary)" stroke-width="2" />
              <text :x="weightChart.pad.l" :y="weightChart.H - 8" class="svg-axis-dim">90 days ago</text>
              <text :x="weightChart.right" :y="weightChart.H - 8" text-anchor="end" class="svg-axis-dim">today</text>
            </svg>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.track-stats {
  display: grid; grid-template-columns: repeat(3, 1fr);
  gap: 12px; margin-bottom: 18px;
}
.track-stat {
  padding: 12px 14px; background: var(--bg);
  border: 1px solid var(--border);
}
.track-stat-label {
  font-size: 9px; color: var(--text-tertiary);
  text-transform: uppercase; letter-spacing: 0.12em; font-weight: 700;
  margin-bottom: 6px;
}
.track-stat-val {
  font-family: var(--font-mono); font-size: 20px; font-weight: 700;
  color: var(--text); font-variant-numeric: tabular-nums; line-height: 1;
}
.track-stat-val.accent { color: var(--primary); }
.track-stat-unit {
  font-size: 10px; color: var(--text-tertiary); font-weight: 400; margin-left: 3px;
}
</style>
