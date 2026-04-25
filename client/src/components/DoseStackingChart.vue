<script setup>
import { computed } from 'vue';

/**
 * Self-contained visual for the half-life stacking concept.
 *
 * Shows N weekly doses as individual decaying curves (faint) plus the
 * cumulative active level (bold). The point: the bold line keeps climbing
 * because each new dose lands before the previous one has decayed. Same
 * Bateman math as the landing-page hero, stripped to one idea.
 */
const props = defineProps({
  weeks: { type: Number, default: 6 },
  mg: { type: Number, default: 5 },
  halfLifeDays: { type: Number, default: 5 },
});

function subqDose(t, mg, halfLifeDays) {
  if (t < 0) return 0;
  const ka = Math.LN2 / 0.25;
  const ke = Math.LN2 / halfLifeDays;
  if (Math.abs(ka - ke) < 1e-6) return mg * ke * t * Math.exp(-ke * t);
  return mg * (ka / (ka - ke)) * (Math.exp(-ke * t) - Math.exp(-ka * t));
}

const chart = computed(() => {
  const W = 620, H = 320;
  const pad = { t: 24, r: 56, b: 36, l: 12 };
  const W0 = W - pad.l - pad.r, H0 = H - pad.t - pad.b;

  const days = props.weeks * 7;
  const samplesPerDay = 8;
  const N = days * samplesPerDay + 1;

  const doses = Array.from({ length: props.weeks }, (_, w) => ({
    day: w * 7,
    mg: props.mg,
  }));

  const perDose = doses.map((d) =>
    Array.from({ length: N }, (_, i) =>
      subqDose(i / samplesPerDay - d.day, d.mg, props.halfLifeDays),
    ),
  );
  const total = Array.from({ length: N }, (_, i) =>
    perDose.reduce((s, c) => s + c[i], 0),
  );

  const yMax = Math.max(...total) * 1.15;
  const x = (i) => pad.l + (i / (N - 1)) * W0;
  const y = (v) => pad.t + (1 - v / yMax) * H0;

  const toPath = (arr) =>
    arr
      .map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
      .join(' ');

  return {
    W, H, pad, padB: pad.t + H0, right: W - pad.r, yMax,
    dosePaths: perDose.map((arr) => toPath(arr)),
    totalPath: toPath(total),
    totalArea: `${toPath(total)} L${x(N - 1).toFixed(1)},${pad.t + H0} L${x(0).toFixed(1)},${pad.t + H0} Z`,
    doses: doses.map((d) => ({ ...d, x: pad.l + (d.day / days) * W0 })),
    grid: Array.from({ length: 4 }, (_, i) => pad.t + (i / 3) * H0),
    weekTicks: Array.from({ length: props.weeks + 1 }, (_, w) => ({
      x: pad.l + (w * 7 / days) * W0,
      label: `Wk ${w}`,
      anchor: w === 0 ? 'start' : w === props.weeks ? 'end' : 'middle',
    })),
    yLabelHigh: `~${total[total.length - 1].toFixed(1)} mg`,
    yLabelLow: '0',
  };
});
</script>

<template>
  <figure class="dose-stacking">
    <svg
      :viewBox="`0 0 ${chart.W} ${chart.H}`"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Weekly tirzepatide doses stacking into a higher cumulative active level"
    >
      <line
        v-for="(yy, i) in chart.grid"
        :key="i"
        :x1="chart.pad.l"
        :x2="chart.right"
        :y1="yy"
        :y2="yy"
        stroke="var(--border)"
        stroke-width="1"
        stroke-dasharray="1 3"
      />

      <path :d="chart.totalArea" fill="rgba(230,184,85,0.10)" />

      <path
        v-for="(d, i) in chart.dosePaths"
        :key="`dose-${i}`"
        :d="d"
        fill="none"
        stroke="rgba(230,184,85,0.55)"
        stroke-width="1.4"
        stroke-dasharray="3 2"
      />

      <path
        :d="chart.totalPath"
        fill="none"
        stroke="#e6b855"
        stroke-width="2.5"
        stroke-linejoin="round"
      />

      <g v-for="d in chart.doses" :key="`tick-${d.day}`">
        <line
          :x1="d.x"
          :x2="d.x"
          :y1="chart.padB"
          :y2="chart.padB + 4"
          stroke="#e6b855"
          stroke-width="1.5"
        />
        <text
          :x="d.x"
          :y="chart.padB + 14"
          text-anchor="middle"
          class="dose-mg"
        >{{ d.mg }}mg</text>
      </g>

      <text
        v-for="(t, i) in chart.weekTicks"
        :key="`wk-${i}`"
        :x="t.x"
        :y="chart.H - 6"
        :text-anchor="t.anchor"
        class="axis-label"
      >{{ t.label }}</text>

      <text
        :x="chart.right + 8"
        :y="chart.pad.t + 4"
        text-anchor="start"
        class="axis-label-amber"
      >{{ chart.yLabelHigh }}</text>
      <text
        :x="chart.right + 8"
        :y="chart.padB + 4"
        text-anchor="start"
        class="axis-label-amber"
      >{{ chart.yLabelLow }}</text>
    </svg>
    <figcaption>
      <span class="legend">
        <span class="swatch swatch-line"></span>
        <span>Cumulative active level</span>
      </span>
      <span class="legend">
        <span class="swatch swatch-dash"></span>
        <span>Individual dose tails</span>
      </span>
      <span class="caption">{{ weeks }} weekly {{ mg }} mg doses · {{ halfLifeDays }}-day half-life</span>
    </figcaption>
  </figure>
</template>

<style scoped>
.dose-stacking {
  margin: 28px 0 32px;
  padding: 20px;
  border: 1px solid var(--border);
  background: var(--surface);
}
svg { width: 100%; height: auto; display: block; }
.axis-label, .dose-mg, .axis-label-amber {
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.06em;
}
.axis-label { fill: var(--text-tertiary); }
.dose-mg { fill: #e6b855; font-weight: 700; font-size: 9px; }
.axis-label-amber { fill: #e6b855; font-weight: 600; }
figcaption {
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 18px;
  flex-wrap: wrap;
  font-size: 11px;
  color: var(--text-tertiary);
  letter-spacing: 0.04em;
}
.legend { display: inline-flex; align-items: center; gap: 6px; }
.swatch { display: inline-block; width: 18px; height: 2px; }
.swatch-line { background: #e6b855; }
.swatch-dash {
  background: repeating-linear-gradient(90deg, rgba(230,184,85,0.55) 0 3px, transparent 3px 5px);
}
.caption { margin-left: auto; font-style: italic; }

@media (max-width: 680px) {
  figcaption { font-size: 10px; gap: 12px; }
  .caption { margin-left: 0; flex-basis: 100%; }
}
</style>
