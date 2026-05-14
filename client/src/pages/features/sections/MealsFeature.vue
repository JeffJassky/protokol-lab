<script setup>
const sortFoodRows = [
  { n: 'Chicken breast, grilled', cal: 165, pro: 31 },
  { n: 'Greek yogurt, 2%',        cal: 59,  pro: 9.9 },
  { n: 'Whey isolate, vanilla',   cal: 120, pro: 25 },
  { n: 'Oats, dry',               cal: 389, pro: 17 },
  { n: 'Avocado',                 cal: 160, pro: 2 },
];
const savedMeals = [
  { name: 'Standard breakfast', items: 'Yogurt · banana · whey', kcal: 420 },
  { name: 'Post-lift bowl',     items: 'Rice · chicken · greens', kcal: 680 },
];
</script>

<template>
  <section class="feat-section">
    <div class="wrap">
      <div class="feat-row">
        <div class="feat-text">
          <h2 class="feat-head">
            Log a meal in <span class="accent">seconds</span>, not minutes.
          </h2>
          <p class="feat-body">
            Search, scan a barcode, snap a photo, or just save your usual lunch
            as a one-tap relog. Pick the way that fits the moment.
          </p>
          <ul class="feat-bullets">
            <li><span><b>Search</b> — USDA + Open Food Facts, plus your own custom items</span></li>
            <li><span><b>Scan</b> — barcode for anything off the shelf</span></li>
            <li><span><b>Snap</b> — photo of your plate, AI logs the items</span></li>
            <li><span><b>Save</b> — your usual meals, one-tap relog any future day</span></li>
          </ul>
        </div>
        <div class="feat-visual">
          <div class="feat-frame">
            <div class="meals-mock">
                <div class="meals-mock-head">
                  <span>Search foods…</span>
                  <span class="meals-mock-icons">⌕  ⎙  ◯</span>
                </div>
                <div class="meals-mock-eyebrow">Recent</div>
                <div
                  v-for="r in sortFoodRows"
                  :key="r.n"
                  class="meals-mock-row"
                >
                  <span class="meals-mock-n">{{ r.n }}</span>
                  <span class="meals-mock-cal">{{ r.cal }}</span>
                  <span class="meals-mock-pro">{{ r.pro }}g</span>
                  <span class="meals-mock-add">+</span>
                </div>
                <div class="meals-mock-eyebrow" style="margin-top: 14px">Saved meals</div>
                <div
                  v-for="m in savedMeals"
                  :key="m.name"
                  class="meals-mock-saved"
                >
                  <div class="meals-mock-saved-name">{{ m.name }}</div>
                  <div class="meals-mock-saved-items">{{ m.items }}</div>
                  <div class="meals-mock-saved-kcal">{{ m.kcal }} kcal</div>
                </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.meals-mock { padding: 14px; font-family: var(--font-body); }
.meals-mock-head {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 12px; border: 1px solid var(--border);
  background: var(--bg);
  font-size: 12px; color: var(--text-tertiary);
  margin-bottom: 14px;
}
.meals-mock-icons { font-family: var(--font-mono); letter-spacing: 0.1em; color: var(--text-tertiary); }
.meals-mock-eyebrow {
  font-size: 9px; color: var(--text-tertiary);
  text-transform: uppercase; letter-spacing: 0.12em;
  margin-bottom: 6px;
}
.meals-mock-row {
  display: grid; grid-template-columns: 1fr auto auto auto;
  gap: 10px; align-items: baseline;
  padding: 9px 4px; border-bottom: 1px dashed var(--border);
  font-size: 13px;
}
.meals-mock-row:last-of-type { border-bottom: none; }
.meals-mock-n { color: var(--text); }
.meals-mock-cal { font-family: var(--font-mono); color: var(--color-cal); font-weight: 600; }
.meals-mock-pro { font-family: var(--font-mono); color: var(--color-protein); font-size: 11px; }
.meals-mock-add { color: var(--primary); font-weight: 700; width: 16px; text-align: center; }

.meals-mock-saved {
  display: grid; grid-template-columns: 1fr auto;
  gap: 4px 10px; padding: 10px 4px;
  border-bottom: 1px dashed var(--border);
}
.meals-mock-saved:last-child { border-bottom: none; }
.meals-mock-saved-name { font-size: 13px; color: var(--text); font-weight: 500; }
.meals-mock-saved-kcal {
  font-family: var(--font-mono); font-size: 12px;
  color: var(--color-cal); font-weight: 600;
  grid-row: 1 / 3; align-self: center;
}
.meals-mock-saved-items {
  font-size: 11px; color: var(--text-tertiary);
  font-family: var(--font-mono); grid-column: 1;
}
</style>
