<script setup>
import MarketingLayout from '../components/MarketingLayout.vue';
import { useRouteSeo, ORIGIN } from '../composables/useSeo.js';
import '../styles/marketing.css';

// Blog posts are Vue pages prerendered at build time so crawlers (and AI
// crawlers that don't execute JS) see full article text. This index lists
// them with a link to each route.
const posts = [
  {
    slug: 'tirzepatide-half-life-explained',
    title: 'Tirzepatide Half-Life Explained: Why Week 4 Feels Different',
    excerpt: 'A 5-day half-life sounds simple until you\'re on your fourth weekly injection and your active blood level is ~2.5× your dose. The math behind why Mounjaro and Zepbound keep ramping for about a month.',
    date: '2026-01-12',
  },
  {
    slug: 'weekly-calorie-budget-for-glp1',
    title: 'The Weekly Calorie Budget for GLP-1 Users',
    excerpt: 'Why daily calorie targets fail on Ozempic, Wegovy, Mounjaro, and Zepbound — and how a 7-day rolling window fixes the problem without asking you to overeat.',
    date: '2026-02-04',
  },
  {
    slug: 'glp1-nausea-timeline',
    title: 'GLP-1 Nausea Timeline: When It Peaks, When It Fades',
    excerpt: 'Nausea patterns on tirzepatide and semaglutide are predictable. Knowing when the peak lands (and when it goes away) is the difference between white-knuckling it and planning around it.',
    date: '2026-03-01',
  },
  {
    slug: 'ozempic-vs-wegovy-vs-compounded-semaglutide',
    title: 'Ozempic vs Wegovy vs Compounded Semaglutide: Dose Equivalencies',
    excerpt: 'Same peptide, three deliveries. The practical differences between Ozempic, Wegovy, and compounded semaglutide — and why the tracker treats them identically.',
    date: '2026-03-20',
  },
  {
    slug: 'managing-glp1-side-effects',
    title: 'Managing GLP-1 Side Effects: A Practical Overview',
    excerpt: 'An educational overview of nausea, reflux, sulfur burps, constipation, diarrhea, and fatigue on Ozempic, Wegovy, Mounjaro, and Zepbound — what causes them, what users commonly try, and when to call a prescriber.',
    date: '2026-04-24',
  },
  {
    slug: 'adhd-nutrition-tracker',
    title: 'The Atomic Habits Lie: Why ADHD Brains Need a Different Kind of Tracker',
    excerpt: 'A founder essay on why MyFitnessPal-style daily logging structurally fails ADHD users — and the principles that an ADHD-friendly nutrition tracker actually has to satisfy.',
    date: '2026-04-27',
  },
];

// Blog schema is built from the visible `posts` array above so the two
// never drift. Registry provides breadcrumb + title/description.
useRouteSeo({
  schema: [
    {
      '@context': 'https://schema.org',
      '@type': 'Blog',
      name: 'Protokol Lab Blog',
      blogPost: posts.map((p) => ({
        '@type': 'BlogPosting',
        headline: p.title,
        url: `${ORIGIN}/blog/${p.slug}`,
        datePublished: p.date,
      })),
    },
  ],
});
</script>

<template>
  <MarketingLayout>
    <section class="mkt-page">
      <div class="wrap">
        <div class="mkt-eyebrow">Blog · GLP-1 reference</div>
        <h1 class="mkt-h1">Reading for<br /><span class="accent">GLP-1 users.</span></h1>
        <p class="mkt-lead">
          Pharmacokinetics, dose strategies, calorie planning, and the physiology
          behind why the tracker is built the way it is. Written for people on
          tirzepatide, semaglutide, and compounded peptides who want to
          understand what's actually happening, not just follow a regimen.
        </p>

        <div class="blog-list">
          <a
            v-for="p in posts"
            :key="p.slug"
            :href="`/blog/${p.slug}`"
            class="blog-item"
          >
            <div class="blog-date">{{ p.date }}</div>
            <h2 class="blog-title">{{ p.title }}</h2>
            <p class="blog-excerpt">{{ p.excerpt }}</p>
            <span class="blog-arrow">Read →</span>
          </a>
        </div>
      </div>
    </section>
  </MarketingLayout>
</template>

<style scoped>
.blog-list { display: grid; gap: 32px; margin-top: 32px; }
.blog-item {
  display: block;
  padding: 28px;
  border: 1px solid var(--border);
  background: var(--surface);
  text-decoration: none;
  color: inherit;
  transition: border-color .15s;
}
.blog-item:hover { border-color: var(--primary); }
.blog-date {
  font-size: 11px;
  color: var(--text-tertiary);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  margin-bottom: 10px;
}
.blog-title {
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 700;
  margin: 0 0 10px;
  line-height: 1.3;
}
.blog-excerpt {
  font-size: 14px;
  color: var(--text-secondary);
  line-height: 1.6;
  margin: 0 0 14px;
}
.blog-arrow {
  font-size: 12px;
  color: var(--primary);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
</style>
