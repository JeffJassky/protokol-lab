<script setup>
import MarketingLayout from './MarketingLayout.vue';
import MarketingEndCta from './MarketingEndCta.vue';
import '../styles/marketing.css';

defineProps({
  eyebrow: { type: String, required: true },
  title: { type: String, required: true },
  accent: { type: String, default: '' },
  date: { type: String, required: true },
  readTime: { type: String, required: true },
});
</script>

<template>
  <MarketingLayout>
    <article class="blog-article">
      <div class="wrap">
        <div class="eyebrow">{{ eyebrow }}</div>
        <h1>
          <template v-for="(line, i) in title.split('|')" :key="i">
            <span v-if="i > 0"><br /></span>
            <template v-if="accent && line.includes(accent)">
              {{ line.split(accent)[0] }}<span class="accent">{{ accent }}</span>{{ line.split(accent)[1] }}
            </template>
            <template v-else>{{ line }}</template>
          </template>
        </h1>
        <div class="meta">Published {{ date }} · {{ readTime }} · by Protokol Lab</div>

        <div class="body">
          <slot />
        </div>

        <div class="disclaimer">
          <slot name="disclaimer" />
        </div>
      </div>
    </article>
    <MarketingEndCta variant="pricing" />
  </MarketingLayout>
</template>

<style scoped>
.blog-article {
  padding: 56px 0 96px;
}
.blog-article .wrap {
  max-width: 760px;
  margin: 0 auto;
  padding: 0 32px;
}
.eyebrow {
  font-size: 11px;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.18em;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 20px;
}
.eyebrow::before {
  content: '';
  width: 24px;
  height: 1px;
  background: var(--text-tertiary);
}
h1 {
  font-family: var(--font-display, var(--font-mono));
  font-size: 42px;
  line-height: 1.1;
  margin: 0 0 20px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text-max-contrast);
}
h1 .accent { color: var(--primary); }
.meta {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-bottom: 36px;
}

/* Article body — `:deep` so styles reach slot content.
   Sans-serif body via system stack: no extra HTTP request, ships everywhere.
   Headings stay JetBrains Mono for the editorial / magazine contrast. */
.body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui,
    "Helvetica Neue", Arial, sans-serif;
  font-size: 16px;
}
.body :deep(p) { margin: 0 0 16px; color: var(--text); max-width: 680px; line-height: 1.7; }
.body :deep(h2) {
  font-family: var(--font-display, var(--font-mono));
  font-size: 24px;
  line-height: 1.2;
  margin: 48px 0 14px;
  font-weight: 700;
  color: var(--text-max-contrast);
}
.body :deep(h3) {
  font-family: var(--font-display, var(--font-mono));
  font-size: 17px;
  margin: 28px 0 10px;
  color: var(--text-max-contrast);
}
.body :deep(ul), .body :deep(ol) { margin: 0 0 20px; padding-left: 22px; max-width: 680px; line-height: 1.7; }
.body :deep(li) { margin-bottom: 6px; }
.body :deep(blockquote) {
  border-left: 2px solid var(--primary);
  padding: 14px 18px;
  background: var(--surface);
  margin: 24px 0;
  color: var(--text-tertiary);
  font-size: 14px;
  font-family: var(--font-mono);
}
.body :deep(code) {
  font-family: var(--font-mono);
  background: var(--surface);
  padding: 2px 6px;
  font-size: 13px;
  border: 1px solid var(--border);
}
.body :deep(pre) {
  background: var(--surface);
  border: 1px solid var(--border);
  padding: 16px;
  overflow-x: auto;
  font-size: 13px;
  margin: 0 0 20px;
}
.body :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 20px 0;
  font-size: 13px;
}
.body :deep(th), .body :deep(td) {
  text-align: left;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
}
.body :deep(th) {
  color: var(--text-tertiary);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 11px;
  font-family: var(--font-mono);
}
.body :deep(a) { color: var(--primary); }
.body :deep(a:hover) { text-decoration: underline; }

.cta-row {
  margin: 48px 0 0;
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}
.cta-row :deep(a) {
  padding: 14px 22px;
  font-weight: 600;
  font-size: 13px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  text-decoration: none;
  border: 1px solid var(--border);
  color: var(--text);
}
.cta-row :deep(a.primary) {
  background: var(--primary);
  color: var(--bg);
  border-color: var(--primary);
}

.disclaimer :deep(blockquote) {
  border-left: 2px solid var(--primary);
  padding: 14px 18px;
  background: var(--surface);
  margin: 32px 0 0;
  color: var(--text-tertiary);
  font-size: 14px;
  line-height: 1.6;
}

@media (max-width: 768px) {
  .blog-article { padding: 32px 0 64px; }
  .blog-article .wrap { padding: 0 20px; }
  h1 { font-size: 32px; }
}
</style>
