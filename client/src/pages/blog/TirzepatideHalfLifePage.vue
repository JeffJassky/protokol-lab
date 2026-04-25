<script setup>
import BlogArticle from '../../components/BlogArticle.vue';
import DoseStackingChart from '../../components/DoseStackingChart.vue';
import { useRouteSeo } from '../../composables/useSeo.js';
useRouteSeo();
</script>

<template>
  <BlogArticle
    eyebrow="Pharmacokinetics · Tirzepatide"
    title="Tirzepatide Half-Life Explained:|Why Week 4 Feels Different."
    accent="Why Week 4 Feels Different."
    date="2026-01-12"
    read-time="8 min read"
  >
    <p>If you're on Mounjaro or Zepbound — both tirzepatide — you've probably noticed something by the fourth or fifth week: appetite suppression is stronger than the dose would suggest. Week 1 feels like a nudge. Week 4 feels like a different drug. That's not titration psychology. It's math.</p>

    <p>Tirzepatide has a half-life of roughly <strong>5 days</strong>. On a weekly schedule, you're injecting the next dose before the previous one has decayed more than halfway. Doses stack. The <em>active</em> level in your bloodstream keeps climbing for about a month before the curve flattens out.</p>

    <h2>The one-line version</h2>
    <p>Your active tirzepatide level at steady state is about <strong>2.5× your weekly dose</strong> — and it takes ~4–5 weeks to get there.</p>

    <h2>What "half-life" actually means</h2>
    <p>Half-life (<code>t½</code>) is the time it takes for the body to eliminate half of a drug's active amount. If you inject 5 mg of tirzepatide and its t½ is 5 days, then:</p>

    <ul>
      <li>Day 0: 5.0 mg active</li>
      <li>Day 5: 2.5 mg active (one half-life)</li>
      <li>Day 10: 1.25 mg active (two half-lives)</li>
      <li>Day 15: 0.62 mg active</li>
      <li>Day 20: 0.31 mg active</li>
    </ul>

    <p>That's the decay from a single injection. But you're not injecting once. You're injecting every 7 days — and when dose 2 lands on day 7, there's still ~2.3 mg of dose 1 active. Dose 2 adds to that, not replaces it.</p>

    <h2>Stacking: the real story</h2>
    <p>Each new injection lands while the previous dose is still half-active. The faint dashed lines below are the individual decay tails from six weekly 2 mg doses with a 7-day half-life; the solid amber line is what your body actually sees at any moment — the sum of all those tails.</p>

    <DoseStackingChart :weeks="6" :mg="2" :half-life-days="7" />

    <p>Here's what the active level looks like over five weeks of 5 mg weekly injections (approximate, assuming perfect sub-Q absorption):</p>

    <table>
      <thead>
        <tr><th>After dose</th><th>Active tirzepatide (mg)</th></tr>
      </thead>
      <tbody>
        <tr><td>1 (day 0)</td><td>5.0</td></tr>
        <tr><td>2 (day 7)</td><td>~7.3</td></tr>
        <tr><td>3 (day 14)</td><td>~8.4</td></tr>
        <tr><td>4 (day 21)</td><td>~8.9</td></tr>
        <tr><td>5 (day 28)</td><td>~9.1</td></tr>
        <tr><td>Steady state</td><td>~9.4</td></tr>
      </tbody>
    </table>

    <p>By week 4, you have almost twice as much tirzepatide working in you as you had on week 1 — at the <em>same weekly dose</em>. That's why appetite suppression keeps getting stronger even though the number on your syringe hasn't changed.</p>

    <h2>Why dose escalation compounds this</h2>
    <p>The standard tirzepatide titration is 2.5 mg → 5 mg → 7.5 mg → 10 mg → 12.5 mg → 15 mg, stepping up roughly every 4 weeks. Each step happens right around when the previous dose is reaching steady state.</p>

    <p>So when you move from 2.5 mg to 5 mg, the first week on 5 mg doesn't feel like "5 mg worth of drug." It feels like 5 mg <em>stacked on top of residual 2.5 mg</em>, sliding toward a new steady state that's higher than what you just had. This is why dose-escalation weeks often bring nausea spikes — the active level is climbing faster than your receptors adapted to.</p>

    <h2>The Bateman equation</h2>
    <p>Protokol Lab models this with the Bateman equation — the standard two-compartment pharmacokinetic model for subcutaneous absorption:</p>

    <pre>C(t) = D · (kₐ / (kₐ − kₑ)) · (e^(−kₑ·t) − e^(−kₐ·t))</pre>

    <p>Where <code>D</code> is dose, <code>kₐ</code> is the absorption rate constant (~ln(2)/0.25 days for sub-Q tirzepatide, giving a 6-hour absorption rise), and <code>kₑ</code> is the elimination rate (ln(2) / 5 days for tirzepatide).</p>

    <p>For multiple doses, you sum the contribution of each past dose at any current time <code>t</code>. That's what produces the stacked curve.</p>

    <h2>What this means for tracking</h2>
    <ol>
      <li><strong>A "bad" week in month 1 isn't a bad dose.</strong> It's the absence of the stack. Your active level is lower than it will be at steady state — because you haven't built up a stack yet.</li>
      <li><strong>Steady state takes ~4–5 half-lives.</strong> For tirzepatide on weekly dosing, that's about 20–25 days. You don't know how a dose "really" works until week 4.</li>
      <li><strong>Skipped doses hit hard.</strong> Miss one and your active level halves by the time the next dose lands. Expect appetite to return and nausea to drop.</li>
      <li><strong>Dose-escalation nausea is real.</strong> It's not a bigger drug — it's a rising stack. If you need to, sit longer at a step before titrating up.</li>
    </ol>

    <h2>How Protokol Lab visualizes this</h2>
    <p>Every dose you log gets plotted on a pharmacokinetic curve — one line for each compound, stacked correctly so the "active now" number at the top of your dashboard reflects all doses from the past month, not just the last one.</p>

    <p>Log a future dose to see where your active level will be next week. Skip a dose in the model and watch the curve drop. Compare a 5-mg weekly schedule against a 7.5-mg schedule to see the steady-state difference before committing.</p>

    <h2>References</h2>
    <ul>
      <li>Urva S, et al. "Effects of renal impairment on the pharmacokinetics of the dual GIP and GLP-1 receptor agonist tirzepatide." <em>Clinical Pharmacokinetics</em> (2021).</li>
      <li>Coskun T, et al. "LY3298176, a novel dual GIP and GLP-1 receptor agonist for the treatment of type 2 diabetes mellitus." <em>Molecular Metabolism</em> (2018).</li>
    </ul>

    <template #cta>
      <a href="/compounds">See compound library</a>
    </template>
  </BlogArticle>
</template>
