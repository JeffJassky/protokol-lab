<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import MarketingLayout from '../components/MarketingLayout.vue';
import { useSeo, ORIGIN } from '../composables/useSeo.js';
import { getComparison, listComparisons } from '../comparisons.js';
import '../styles/marketing.css';

const route = useRoute();
const cmp = computed(() => getComparison(route.params.slug));

// Related comparisons (other entries in the same category, max 3)
const related = computed(() => {
  const c = cmp.value;
  if (!c) return [];
  return listComparisons()
    .filter((x) => x.slug !== c.slug && x.category === c.category)
    .slice(0, 3);
});

// Emit SEO directly (not via useRouteSeo, since marketing-meta.js holds the
// per-slug title/description; we synthesize from the comparison data here so
// adding a new competitor only touches comparisons.js).
const path = computed(() => route.path);
const title = computed(() =>
  cmp.value
    ? `Protokol Lab vs ${cmp.value.name} — GLP-1 Tracker Comparison`
    : 'Comparison — Protokol Lab',
);
const description = computed(() =>
  cmp.value
    ? `Honest comparison: Protokol Lab vs ${cmp.value.name}. Feature matrix, pricing, pros and cons, and when to pick each. ${cmp.value.tagline}`
    : 'Protokol Lab comparison.',
);

// Build FAQPage + BreadcrumbList + ComparisonPage-ish schema per slug.
const schema = computed(() => {
  if (!cmp.value) return [];
  const c = cmp.value;
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: (c.faqs || []).map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home',    item: `${ORIGIN}/` },
        { '@type': 'ListItem', position: 2, name: 'Compare', item: `${ORIGIN}/compare` },
        { '@type': 'ListItem', position: 3, name: c.name,    item: `${ORIGIN}/compare/${c.slug}` },
      ],
    },
  ];
});

// Fire SEO reactively — Vue keeps @unhead in sync as slug changes.
import { watchEffect } from 'vue';
watchEffect(() => {
  useSeo({
    path: path.value,
    title: title.value,
    description: description.value,
    ogImage: '/og/compare.png',
    schema: schema.value,
  });
});

// Template helpers — Vue auto-exposes top-level script setup bindings.
function cellClass(v) {
  if (v === '✓') return 'ok';
  if (v === '✗') return 'no';
  if (v === 'partial') return 'partial';
  return 'str';
}
function displayCell(v) {
  if (v === 'partial') return '◐';
  return v;
}
</script>

<template>
  <MarketingLayout>
    <section class="mkt-page" v-if="cmp">
      <div class="wrap">
        <div class="mkt-eyebrow">
          Comparison · <a href="/compare" class="eyebrow-link">All comparisons</a>
        </div>
        <h1 class="mkt-h1">
          Protokol Lab<br /><span class="accent">vs {{ cmp.name }}.</span>
        </h1>
        <p class="mkt-lead">
          {{ cmp.tagline }}
        </p>

        <h2 class="mkt-h2">What {{ cmp.name }} does well</h2>
        <ul class="mkt-ul">
          <li v-for="(s, i) in cmp.strengths" :key="'s' + i">{{ s }}</li>
        </ul>

        <h2 class="mkt-h2">Where {{ cmp.name }} falls short for GLP-1 users</h2>
        <ul class="mkt-ul">
          <li v-for="(g, i) in cmp.gaps" :key="'g' + i">{{ g }}</li>
        </ul>

        <h2 class="mkt-h2">Feature matrix</h2>
        <table class="mkt-table cmp-matrix">
          <thead>
            <tr>
              <th>Feature</th>
              <th>{{ cmp.name }}</th>
              <th>Protokol Lab</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, i) in cmp.matrix" :key="i">
              <td>
                {{ row.feature }}
                <div v-if="row.note" class="cmp-note">{{ row.note }}</div>
              </td>
              <td :class="['cmp-cell', cellClass(row.them)]">{{ displayCell(row.them) }}</td>
              <td :class="['cmp-cell', cellClass(row.us)]">{{ displayCell(row.us) }}</td>
            </tr>
          </tbody>
        </table>

        <div class="cmp-when">
          <div class="cmp-when-card">
            <h3 class="cmp-when-h">Use {{ cmp.name }} if…</h3>
            <p class="mkt-p" v-html="cmp.useThemIf"></p>
          </div>
          <div class="cmp-when-card accent">
            <h3 class="cmp-when-h">Use Protokol Lab if…</h3>
            <p class="mkt-p" v-html="cmp.usePlIf"></p>
          </div>
        </div>

        <h2 class="mkt-h2">FAQ</h2>
        <div v-for="(f, i) in cmp.faqs" :key="i" class="faq-item">
          <h3 class="faq-q">{{ f.q }}</h3>
          <p class="faq-body">{{ f.a }}</p>
        </div>

        <div class="mkt-cta-row">
          <a href="/register" class="mkt-btn-primary">Try Protokol Lab free →</a>
          <a href="/pricing" class="mkt-btn-secondary">See pricing</a>
          <a :href="cmp.website" rel="nofollow noopener" target="_blank" class="cmp-ext">
            Visit {{ cmp.name }} ↗
          </a>
        </div>

        <div v-if="related.length" class="cmp-related">
          <h3 class="mkt-h3">Other comparisons</h3>
          <ul class="cmp-related-list">
            <li v-for="r in related" :key="r.slug">
              <a :href="`/compare/${r.slug}`">Protokol Lab vs {{ r.name }}</a>
            </li>
          </ul>
        </div>
      </div>
    </section>

    <section v-else class="mkt-page">
      <div class="wrap">
        <h1 class="mkt-h1">Comparison not found.</h1>
        <p class="mkt-p"><a href="/compare">See all comparisons →</a></p>
      </div>
    </section>
  </MarketingLayout>
</template>

<style scoped>
.eyebrow-link { color: inherit; text-decoration: underline; }
.cmp-matrix td, .cmp-matrix th { vertical-align: top; }
.cmp-matrix th:nth-child(2), .cmp-matrix th:nth-child(3),
.cmp-matrix td:nth-child(2), .cmp-matrix td:nth-child(3) {
  text-align: center;
  width: 18%;
}
.cmp-cell { font-weight: 700; font-size: 16px; }
.cmp-cell.ok { color: var(--primary); }
.cmp-cell.no { color: var(--color-carbs, #ef4444); }
.cmp-cell.partial { color: var(--color-fat, #e6b855); }
.cmp-cell.str { font-size: 12px; color: var(--text-secondary); font-weight: 500; }
.cmp-note {
  display: block;
  font-size: 11px;
  color: var(--text-tertiary);
  margin-top: 4px;
  line-height: 1.4;
}

.cmp-when {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin: 32px 0;
}
.cmp-when-card {
  border: 1px solid var(--border);
  padding: 24px;
  background: var(--surface);
}
.cmp-when-card.accent { border-color: var(--primary); }
.cmp-when-h {
  font-family: var(--font-display);
  font-size: 15px;
  margin: 0 0 12px;
  font-weight: 700;
  color: var(--text);
}
.cmp-when-card.accent .cmp-when-h { color: var(--primary); }

.cmp-ext {
  font-size: 12px;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  align-self: center;
}

.cmp-related { margin-top: 56px; padding-top: 32px; border-top: 1px solid var(--border); }
.cmp-related-list { list-style: none; padding: 0; display: flex; flex-wrap: wrap; gap: 16px; }
.cmp-related-list a {
  font-size: 13px;
  color: var(--primary);
  text-decoration: none;
}
.cmp-related-list a:hover { text-decoration: underline; }

@media (max-width: 640px) {
  .cmp-when { grid-template-columns: 1fr; }
}
</style>
