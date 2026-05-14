<script setup>
const symptoms = [
  { name: 'Nausea',  severity: 2 },
  { name: 'Fatigue', severity: 4 },
];
const water = { current: 64, target: 96 };
const fasting = { elapsed: '16h 12m', stage: 'Ketosis' };
const cycle = { day: 14, phase: 'Ovulation' };
const exercise = { class: 'Cardio', duration: 45, kcal: 320 };

function dotColor(n) {
  if (n === 0) return 'var(--primary)';
  if (n <= 3) return 'var(--color-fat)';
  if (n <= 6) return '#f97316';
  return 'var(--color-carbs)';
}
</script>

<template>
  <section class="feat-section">
    <div class="wrap">
      <div class="feat-row">
        <div class="feat-text">
          <h2 class="feat-head">
            Log how you feel. <span class="accent">Find what causes it.</span>
          </h2>
          <p class="feat-body">
            Side effects, water, fasts, workouts, cycle phase — three taps each.
            Patterns show up over weeks, automatically.
          </p>
          <ul class="feat-bullets">
            <li><span><b>Symptoms 0–10</b> — nausea, fatigue, anything you want to add</span></li>
            <li><span><b>Water</b> — quick-add presets, daily target by body weight</span></li>
            <li><span><b>Fasting</b> — daily schedule or one-off; live timer with stage</span></li>
            <li><span><b>Exercise</b> — cardio, resistance, HIIT, recovery — duration + intensity</span></li>
            <li><span><b>Cycle</b> — log a period, Protokol tracks the phase</span></li>
          </ul>
        </div>
        <div class="feat-visual">
          <div class="feat-frame" style="padding: 18px">
            <div class="wn-eyebrow">Today · wellness</div>
            <div class="wn-rows">
              <div v-for="s in symptoms" :key="s.name" class="wn-row">
                <span class="wn-row-label">{{ s.name }}</span>
                <div class="wn-dots">
                  <span
                    v-for="n in 11"
                    :key="n"
                    class="wn-dot"
                    :style="(n - 1) <= s.severity ? { background: dotColor(s.severity), borderColor: dotColor(s.severity) } : {}"
                  ></span>
                </div>
                <span class="wn-row-val">{{ s.severity }}/10</span>
              </div>
              <div class="wn-row">
                <span class="wn-row-label">Water</span>
                <div class="wn-bar-track">
                  <div class="wn-bar" :style="{ width: (water.current / water.target * 100) + '%' }"></div>
                </div>
                <span class="wn-row-val">{{ water.current }} / {{ water.target }} oz</span>
              </div>
              <div class="wn-row wn-row-stack">
                <span class="wn-row-label">Fasting</span>
                <div class="wn-stack">
                  <div class="wn-stack-main">{{ fasting.elapsed }}</div>
                  <div class="wn-stack-sub">{{ fasting.stage }}</div>
                </div>
              </div>
              <div class="wn-row wn-row-stack">
                <span class="wn-row-label">Cycle</span>
                <div class="wn-stack">
                  <div class="wn-stack-main">Day {{ cycle.day }}</div>
                  <div class="wn-stack-sub">{{ cycle.phase }}</div>
                </div>
              </div>
              <div class="wn-row wn-row-stack">
                <span class="wn-row-label">Workout</span>
                <div class="wn-stack">
                  <div class="wn-stack-main">{{ exercise.duration }} min · {{ exercise.class }}</div>
                  <div class="wn-stack-sub">{{ exercise.kcal }} kcal</div>
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
.wn-eyebrow {
  font-size: 9px; color: var(--text-tertiary);
  text-transform: uppercase; letter-spacing: 0.12em; font-weight: 700;
  margin-bottom: 14px;
}
.wn-rows { display: flex; flex-direction: column; gap: 12px; }
.wn-row {
  display: grid; grid-template-columns: 80px 1fr auto;
  gap: 14px; align-items: center;
}
.wn-row-stack { grid-template-columns: 80px 1fr; }
.wn-row-label {
  font-size: 12px; color: var(--text); font-weight: 500;
}
.wn-row-val {
  font-family: var(--font-mono); font-size: 11px;
  color: var(--text-tertiary); font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.wn-dots { display: flex; gap: 2px; }
.wn-dot {
  flex: 1; height: 12px;
  background: var(--surface-raised);
  border: 1px solid var(--border);
}
.wn-bar-track {
  height: 8px; background: var(--surface-raised); border: 1px solid var(--border);
}
.wn-bar { height: 100%; background: var(--color-cal); }
.wn-stack { display: flex; flex-direction: column; gap: 1px; }
.wn-stack-main {
  font-family: var(--font-mono); font-size: 13px; font-weight: 600;
  color: var(--text);
}
.wn-stack-sub {
  font-family: var(--font-mono); font-size: 10px; color: var(--text-tertiary);
}
</style>
