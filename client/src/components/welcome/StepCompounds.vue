<script setup>
import { onMounted } from 'vue';
import { useCompoundsStore } from '../../stores/compounds.js';

const compounds = useCompoundsStore();

onMounted(async () => {
  if (!compounds.loaded) await compounds.fetchAll();
});

// Only system compounds get toggled here. Custom ones live in Settings.
function systemOnly() {
  return compounds.compounds.filter((c) => c.isSystem);
}

async function toggle(c) {
  await compounds.update(c._id, { enabled: !c.enabled });
}

// Brand names lead, generic appended last. The generic is a synonym, not a
// subtitle — same weight, same separator. Skipped when the generic is empty
// or already present in brandNames (defensive: shouldn't happen with seed).
function displayNames(c) {
  const brands = c.brandNames || [];
  if (!brands.length) return c.name;
  const lower = brands.map((b) => b.toLowerCase());
  if (c.name && !lower.includes(c.name.toLowerCase())) {
    return [...brands, c.name].join(' · ');
  }
  return brands.join(' · ');
}
</script>

<template>
  <div class="step">
    <h2>GLP-1s & peptides</h2>
    <p class="lede">
      Tracking a compound? Flip it on and the app will remind you on dose days
      and overlay levels on your weight chart. Skip if not applicable.
    </p>

    <ul v-if="systemOnly().length" class="list">
      <li v-for="c in systemOnly()" :key="c._id">
        <button
          type="button"
          class="row"
          :class="{ active: c.enabled }"
          @click="toggle(c)"
        >
          <div class="meta">
            <span class="name">{{ displayNames(c) }}</span>
            <span class="sub">{{ c.intervalDays }}d interval · {{ c.halfLifeDays }}d half-life</span>
          </div>
          <span class="check" :class="{ on: c.enabled }">
            <template v-if="c.enabled">✓</template>
          </span>
        </button>
      </li>
    </ul>
    <div v-else class="empty">Loading…</div>

    <p class="footnote">
      Need something else (cagrilintide, retatrutide, custom blends)? Add it in
      <strong>Settings → Compounds</strong> after onboarding — half-life,
      interval, and PK profile are all configurable.
    </p>
  </div>
</template>

<style scoped>
.step h2 { margin: 0 0 var(--space-1); font-size: var(--font-size-xl); }
.lede { margin: 0 0 var(--space-4); color: var(--text-secondary); font-size: var(--font-size-s); }
.list { list-style: none; padding: 0; margin: 0 0 var(--space-3); display: flex; flex-direction: column; gap: var(--space-2); }
.row {
  width: 100%;
  display: grid;
  grid-template-columns: 1fr 28px;
  gap: var(--space-3);
  align-items: center;
  padding: var(--space-3);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-medium);
  cursor: pointer;
  text-align: left;
  color: var(--text);
  transition: all var(--transition-fast);
}
.row:hover { border-color: var(--text-secondary); }
.row.active {
  border-color: var(--primary);
  box-shadow: 0 0 0 1px var(--primary);
}
.meta { display: flex; flex-direction: column; gap: 0.15rem; min-width: 0; }
.name { font-weight: var(--font-weight-medium); font-size: var(--font-size-s); }
.sub { font-size: var(--font-size-xs); color: var(--text-secondary); }
.check {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid var(--border);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
}
.check.on {
  background: var(--primary);
  border-color: var(--primary);
  color: var(--text-on-primary, white);
}
.empty { color: var(--text-secondary); font-size: var(--font-size-s); }
.footnote {
  margin: var(--space-3) 0 0;
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  line-height: 1.5;
}
.footnote strong { color: var(--text); font-weight: var(--font-weight-medium); }
</style>
