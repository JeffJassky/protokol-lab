<script setup>
const panels = [
  {
    label: 'Bloodwork',
    rows: [
      { k: 'Fasting glucose', v: '92', unit: 'mg/dL' },
      { k: 'HbA1c',           v: '5.4', unit: '%' },
      { k: 'TSH',             v: '1.8', unit: 'mIU/L' },
      { k: 'ApoB',            v: '78',  unit: 'mg/dL' },
    ],
  },
  {
    label: 'Genetics',
    rows: [
      { k: 'MTHFR C677T', v: 'heterozygous' },
      { k: 'APOE',        v: 'ε3/ε3' },
      { k: 'CYP2D6',      v: 'normal' },
    ],
  },
  {
    label: 'Conditions',
    rows: [
      { k: 'PCOS',     v: 'on' },
      { k: 'Insomnia', v: 'on' },
      { k: 'COMT slow',v: 'on' },
    ],
  },
];
</script>

<template>
  <section class="feat-section">
    <div class="wrap">
      <div class="feat-row reverse">
        <div class="feat-text">
          <h2 class="feat-head">
            Tell Protokol about you. <span class="accent">Once.</span>
          </h2>
          <p class="feat-body">
            Bloodwork, genetics, conditions, age — all used to tune the
            simulation and inform AI answers. Skip what you don't have;
            defaults work fine on day one.
          </p>
          <ul class="feat-bullets">
            <li><span><b>Bloodwork panels</b> — glucose, lipids, hormones, thyroid; trends with two values</span></li>
            <li><span><b>Genetics from 23andMe</b> — MTHFR, COMT, APOE, CYP variants</span></li>
            <li><span><b>Diagnosed conditions</b> — PCOS, POTS, insomnia, MCAS, others</span></li>
            <li><span><b>Used by sim and AI</b> — "given your MTHFR, your homocysteine…"</span></li>
          </ul>
        </div>
        <div class="feat-visual">
          <div class="feat-frame" style="padding: 18px">
            <div class="ctx-grid">
              <div v-for="panel in panels" :key="panel.label" class="ctx-panel">
                <div class="ctx-eyebrow">{{ panel.label }}</div>
                <div v-for="row in panel.rows" :key="row.k" class="ctx-row">
                  <span class="ctx-k">{{ row.k }}</span>
                  <span class="ctx-v">
                    {{ row.v }}<span v-if="row.unit" class="ctx-unit"> {{ row.unit }}</span>
                  </span>
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
.ctx-grid {
  display: grid; grid-template-columns: 1fr;
  gap: 14px;
}
.ctx-panel {
  padding: 12px 14px;
  background: var(--bg);
  border: 1px solid var(--border);
}
.ctx-eyebrow {
  font-size: 9px; color: var(--text-tertiary);
  text-transform: uppercase; letter-spacing: 0.12em; font-weight: 700;
  margin-bottom: 8px;
}
.ctx-row {
  display: flex; justify-content: space-between; align-items: baseline;
  padding: 5px 0; border-bottom: 1px dashed var(--border);
  font-size: 12px;
}
.ctx-row:last-child { border-bottom: none; }
.ctx-k { color: var(--text); }
.ctx-v {
  font-family: var(--font-mono); font-variant-numeric: tabular-nums;
  color: var(--primary); font-weight: 600;
}
.ctx-unit { color: var(--text-tertiary); font-weight: 400; font-size: 10px; }
</style>
