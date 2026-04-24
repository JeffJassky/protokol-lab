<script setup>
import MarketingLayout from '../components/MarketingLayout.vue';
import { useRouteSeo } from '../composables/useSeo.js';
import '../styles/marketing.css';

const faqs = [
  {
    q: 'Does Protokol Lab work with Mounjaro and Zepbound?',
    a: 'Yes. Mounjaro and Zepbound are both tirzepatide. Pick Tirzepatide from the built-in compound library and Protokol Lab handles the half-life modeling automatically. Your dose, schedule, and active blood level are tracked identically whether you\'re on Mounjaro (diabetes indication) or Zepbound (obesity indication).',
  },
  {
    q: 'Does Protokol Lab work with Ozempic and Wegovy?',
    a: 'Yes. Ozempic and Wegovy are both semaglutide. Pick Semaglutide from the built-in compound library. The half-life (~7 days) and subcutaneous kinetics are the same across both brands. If you also use oral semaglutide (Rybelsus), switch to the Rybelsus preset for its daily dose pattern.',
  },
  {
    q: 'Can I track compounded tirzepatide or compounded semaglutide?',
    a: 'Yes. Compounded GLP-1s contain the same peptide as the brand-name versions — same molecule, same pharmacokinetics. Use the built-in Tirzepatide or Semaglutide preset. For any non-standard formulation, add a custom compound by entering a name and a half-life.',
  },
  {
    q: 'Can I track custom or compounded compounds?',
    a: 'Yes. For any compound outside the FDA-approved list that Protokol Lab ships by default, users can add a custom compound by entering a name and a half-life. Bolus, subcutaneous, and depot absorption profiles are supported. Protokol Lab does not publish pharmacokinetic defaults for compounds that are not FDA-approved; users supply their own values and assume full responsibility for the accuracy of those values and for the legality of any substance they track. Protokol Lab does not sell, ship, or refer users to pharmacies or compounding facilities for any substance.',
  },
  {
    q: 'How accurate is the half-life curve?',
    a: 'Protokol Lab uses the Bateman equation — the standard two-compartment pharmacokinetic model for extravascular absorption. Defaults are based on published PK: tirzepatide ~5 days (Urva et al., 2021), semaglutide ~7 days (Lau et al., 2015). You can override half-life per compound to match individual metabolism, compounded formulations, or clinical measurements.',
  },
  {
    q: 'Why does Protokol Lab use a weekly calorie budget instead of a daily one?',
    a: 'GLP-1s don\'t produce uniform hunger. Appetite drops hard for 2–3 days after each injection, then returns. A 24-hour daily target treats a low-appetite day as a win and a normal-appetite day as failure — even when the weekly total is on track. Protokol Lab rolls unused calories forward into the next day, so your weekly target is what you actually hit, not midnight resets.',
  },
  {
    q: 'Can the AI actually log food for me, or is it just chat?',
    a: 'It logs for you. Describe what you ate in plain English — the AI checks your food library, runs a web search if the item isn\'t there, creates a custom food entry with the right macros, and writes it into today\'s log. You watch the tool trail as it works. It has write access to your account, not just text output.',
  },
  {
    q: 'Is my health data private?',
    a: 'Your data stays yours. Protokol Lab does not sell, share, or monetize user health data. Full JSON or CSV export is always free and unlimited.',
  },
  {
    q: 'Is Protokol Lab FDA-approved or HIPAA-certified?',
    a: 'No. Protokol Lab is an organizational and mathematical modeling tool, not a medical device. It does not diagnose, treat, or prescribe. It is not a covered entity under HIPAA. Consult a licensed medical professional before making any decisions about your medication or health.',
  },
  {
    q: 'Do you sell GLP-1 medications or connect me to a pharmacy?',
    a: 'No. Protokol Lab is a tracker only. We do not sell, distribute, or endorse any compound in the library. Obtain medications from a licensed prescriber and pharmacy.',
  },
  {
    q: 'How is this different from MyFitnessPal or Cronometer?',
    a: 'MyFitnessPal and Cronometer are general-purpose calorie counters. Protokol Lab is built specifically for GLP-1 patterns: it models dose half-lives, runs rolling weekly calorie budgets instead of daily resets, tracks injection-site symptoms and medication timing, and its AI reads your dose and symptom data together. If you\'re on a GLP-1, a generic tracker misses the physiology that actually drives your week.',
  },
  {
    q: 'Can I export all my data?',
    a: 'Yes. Full history export as JSON or CSV, anytime, no paywall, no support ticket. Your data belongs to you.',
  },
  {
    q: 'What happens if I stop paying for Premium?',
    a: 'Your account drops to Free. All your historical data (food, doses, weight, symptoms, photos, notes) stays intact. You lose AI chat, correlation charts, and higher compound caps — but the core tracker keeps working.',
  },
  {
    q: 'Does Protokol Lab support stacked compounds?',
    a: 'Yes. Run multiple active compounds simultaneously — their curves are summed correctly at every time point, so the active-level chart reflects the full schedule rather than just the most recent injection.',
  },
  {
    q: 'Can I track compounded tirzepatide from a telehealth service?',
    a: 'Yes. The peptide is the same whether it comes from a brand-name pharmacy or a licensed compounding pharmacy. Use the built-in Tirzepatide preset and log your prescribed mg per injection. Protokol Lab does not endorse or refer users to specific pharmacies, telehealth services, or compounding facilities — obtain medication through a licensed prescriber.',
  },
];

// FAQPage schema is built from the visible `faqs` array above so the two
// never drift. Registry provides breadcrumb + title/description.
useRouteSeo({
  schema: [
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faqs.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    },
  ],
});
</script>

<template>
  <MarketingLayout>
    <section class="mkt-page">
      <div class="wrap">
        <div class="mkt-eyebrow">FAQ</div>
        <h1 class="mkt-h1">Questions,<br /><span class="accent">answered.</span></h1>
        <p class="mkt-lead">
          Everything we get asked about tracking GLP-1s on Protokol Lab —
          Mounjaro, Zepbound, Ozempic, Wegovy, compounded semaglutide and
          tirzepatide, half-life accuracy, privacy, and pricing.
        </p>

        <div v-for="(f, i) in faqs" :key="i" class="faq-item">
          <h2 class="faq-q">{{ f.q }}</h2>
          <p class="faq-body">{{ f.a }}</p>
        </div>

        <div class="mkt-cta-row">
          <a href="/register" class="mkt-btn-primary">Start tracking free →</a>
          <a href="/pricing" class="mkt-btn-secondary">See pricing</a>
        </div>
      </div>
    </section>
  </MarketingLayout>
</template>
