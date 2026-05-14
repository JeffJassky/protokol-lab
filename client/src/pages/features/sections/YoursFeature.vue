<script setup>
const devices = [
  { name: 'iPhone',  sub: 'App Store + Safari' },
  { name: 'Android', sub: 'Play Store + Chrome' },
  { name: 'Mac',     sub: 'Safari · Chrome · Arc' },
  { name: 'Windows', sub: 'Edge · Chrome' },
];
</script>

<template>
  <section class="feat-section">
    <div class="wrap">
      <div class="feat-row">
        <div class="feat-text">
          <h2 class="feat-head">
            Your data <span class="accent">stays yours</span>.
          </h2>
          <p class="feat-body">
            No ads. No data sales. Install on any device, sync across all of
            them, and export everything as a spreadsheet whenever you want.
          </p>
          <ul class="feat-bullets">
            <li><span><b>Lives on every device</b> — iPhone, Android, Mac, Windows; one account, synced</span></li>
            <li><span><b>Export anything</b> — every meal, dose, weigh-in, photo, as JSON or CSV</span></li>
            <li><span><b>No ads, no third parties</b> — your data is never sold or shared</span></li>
            <li><span><b>Free for everything you log</b> — premium only unlocks the AI</span></li>
          </ul>
        </div>
        <div class="feat-visual">
          <div class="feat-frame" style="padding: 22px">
            <div class="yours-eyebrow">Installs on</div>
            <div class="yours-devices">
              <div v-for="d in devices" :key="d.name" class="yours-device">
                <div class="yours-device-name">{{ d.name }}</div>
                <div class="yours-device-sub">{{ d.sub }}</div>
              </div>
            </div>
            <div class="yours-divider"></div>
            <div class="yours-eyebrow">Export anytime</div>
            <div class="yours-export">
              <span class="yours-export-file">protokol-export-2026-05-10.json</span>
              <span class="yours-export-btn">↓ download</span>
            </div>
            <div class="yours-export" style="margin-top: 8px">
              <span class="yours-export-file">protokol-export-2026-05-10.csv</span>
              <span class="yours-export-btn">↓ download</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.yours-eyebrow {
  font-size: 9px; color: var(--text-tertiary);
  text-transform: uppercase; letter-spacing: 0.12em; font-weight: 700;
  margin-bottom: 12px;
}
.yours-devices {
  display: grid; grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}
.yours-device {
  padding: 12px 14px; background: var(--bg);
  border: 1px solid var(--border);
}
.yours-device-name { font-size: 14px; font-weight: 600; color: var(--text); margin-bottom: 2px; }
.yours-device-sub { font-size: 11px; color: var(--text-tertiary); font-family: var(--font-mono); }

.yours-divider {
  margin: 22px 0 18px; border-top: 1px dashed var(--border);
}

.yours-export {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 14px; border: 1px dashed var(--border-strong);
  font-family: var(--font-mono); font-size: 12px;
}
.yours-export-file { color: var(--text); }
.yours-export-btn {
  color: var(--primary); font-weight: 700;
  letter-spacing: 0.08em; text-transform: uppercase; font-size: 11px;
}
</style>
