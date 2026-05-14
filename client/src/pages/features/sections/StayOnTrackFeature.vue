<script setup>
const days = [
  { label: 'M', val: 1820, today: false },
  { label: 'T', val: 2240, today: false },
  { label: 'W', val: 1100, today: false, suppressed: true },
  { label: 'T', val: 2380, today: false },
  { label: 'F', val: 1980, today: false },
  { label: 'S', val: 0,    today: false, fasted: true },
  { label: 'S', val: 940,  today: true,  partial: true },
];
const weekTarget = 14700;
const weekConsumed = days.reduce((a, d) => a + d.val, 0);
const leftThisWeek = weekTarget - weekConsumed;
</script>

<template>
  <section class="feat-section">
    <div class="wrap">
      <div class="feat-row reverse">
        <div class="feat-text">
          <h2 class="feat-head">
            An off day isn't a <span class="accent">broken streak</span>.
          </h2>
          <p class="feat-body">
            GLP-1s flatten your appetite for a couple days, then it comes back.
            Heavy Wednesday means lighter Thursday — Protokol does the math
            across your whole week so one rough day doesn't blow up your plan.
          </p>
          <ul class="feat-bullets">
            <li><span><b>Rolling 7-day budget</b> — unused calories carry forward, they don't disappear at midnight</span></li>
            <li><span><b>Honest streaks</b> — vacation, illness, an unexpected dinner: nothing resets</span></li>
            <li><span><b>Reminders that shut up</b> — if you've already logged today, the evening nudge stays silent</span></li>
            <li><span><b>Plan ahead</b> — drop in tomorrow's meals, check them off as you eat</span></li>
          </ul>
        </div>
        <div class="feat-visual">
          <div class="feat-frame" style="padding: 20px 22px">
            <div class="stay-head">
              <div>
                <div class="stay-eyebrow">Week so far</div>
                <div class="stay-val">{{ weekConsumed.toLocaleString() }}<span class="stay-tgt"> / {{ weekTarget.toLocaleString() }}</span></div>
              </div>
              <div style="text-align:right">
                <div class="stay-eyebrow">Left</div>
                <div class="stay-left">{{ leftThisWeek.toLocaleString() }}<span class="stay-unit">kcal</span></div>
              </div>
            </div>
            <div class="stay-bars">
              <div v-for="(d, i) in days" :key="i" class="stay-col">
                <div class="stay-bar-track">
                  <div
                    class="stay-bar"
                    :class="{ today: d.today, partial: d.partial, suppressed: d.suppressed, fasted: d.fasted }"
                    :style="{ height: Math.min(100, (d.val / 2400) * 100) + '%' }"
                  ></div>
                </div>
                <div class="stay-bar-val">
                  <template v-if="d.fasted">—</template>
                  <template v-else>{{ Math.round(d.val / 100) / 10 }}k</template>
                </div>
                <div class="stay-bar-day" :class="{ today: d.today }">{{ d.label }}</div>
              </div>
            </div>
            <div class="stay-note">
              <span class="dim">Wed</span> low-appetite day
              · <span class="dim">Sat</span> fasted, doesn't count against the week
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.stay-head {
  display: flex; justify-content: space-between; align-items: flex-end;
  margin-bottom: 18px;
}
.stay-eyebrow {
  font-size: 9px; color: var(--text-tertiary);
  text-transform: uppercase; letter-spacing: 0.12em; font-weight: 700;
  margin-bottom: 4px;
}
.stay-val {
  font-family: var(--font-mono); font-size: 22px; font-weight: 700;
  color: var(--text); font-variant-numeric: tabular-nums; line-height: 1;
}
.stay-tgt { color: var(--text-tertiary); font-weight: 400; font-size: 14px; }
.stay-left {
  font-family: var(--font-mono); font-size: 18px; font-weight: 700;
  color: var(--primary); font-variant-numeric: tabular-nums; line-height: 1;
}
.stay-unit { font-size: 10px; color: var(--text-tertiary); font-weight: 400; margin-left: 3px; }

.stay-bars {
  display: grid; grid-template-columns: repeat(7, 1fr);
  gap: 8px; margin-bottom: 14px;
}
.stay-col { display: flex; flex-direction: column; align-items: center; }
.stay-bar-track {
  width: 100%; height: 110px;
  background: var(--bg); border: 1px solid var(--border);
  display: flex; align-items: flex-end;
  margin-bottom: 6px;
}
.stay-bar {
  width: 100%; background: var(--color-cal);
}
.stay-bar.today { background: var(--primary); }
.stay-bar.partial { background: linear-gradient(to top, var(--primary), color-mix(in srgb, var(--primary) 30%, transparent)); }
.stay-bar.suppressed { background: var(--color-fat); opacity: 0.6; }
.stay-bar.fasted { background: transparent; border-top: 2px dashed var(--text-tertiary); }
.stay-bar-val {
  font-family: var(--font-mono); font-size: 10px; color: var(--text-tertiary);
  font-variant-numeric: tabular-nums; margin-bottom: 2px;
}
.stay-bar-day {
  font-family: var(--font-mono); font-size: 11px; color: var(--text-tertiary);
  font-weight: 600;
}
.stay-bar-day.today { color: var(--primary); }
.stay-note {
  font-size: 11px; color: var(--text-secondary);
  font-family: var(--font-mono); padding-top: 12px;
  border-top: 1px dashed var(--border);
}
.stay-note .dim { color: var(--text-tertiary); }
</style>
