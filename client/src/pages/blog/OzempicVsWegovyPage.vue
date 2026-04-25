<script setup>
import BlogArticle from '../../components/BlogArticle.vue';
import { useRouteSeo } from '../../composables/useSeo.js';
useRouteSeo();
</script>

<template>
  <BlogArticle
    eyebrow="Reference · Semaglutide"
    title="Ozempic vs Wegovy vs Compounded Semaglutide:|Dose Equivalencies."
    accent="Dose Equivalencies."
    date="2026-03-20"
    read-time="7 min read"
  >
    <p>Ozempic, Wegovy, and compounded semaglutide contain the same active molecule: semaglutide, a long-acting GLP-1 receptor agonist with a ~7-day half-life. The drug in your syringe is pharmacologically identical regardless of which bottle it came from. What differs is packaging, approved indication, and dose ladder.</p>

    <p>This matters for tracking. From a pharmacokinetic standpoint — the math the tracker does — all three are the same compound. From a practical standpoint, the dose numbers can confuse people switching between formulations.</p>

    <h2>Ozempic — diabetes formulation</h2>
    <p>Ozempic is Novo Nordisk's semaglutide, FDA-approved for type 2 diabetes. Comes in pre-filled pens. Standard dose ladder:</p>
    <ul>
      <li>0.25 mg weekly × 4 weeks (starter; not therapeutic)</li>
      <li>0.5 mg weekly × 4 weeks</li>
      <li>1.0 mg weekly (long-term maintenance for diabetes)</li>
      <li>2.0 mg weekly (max; less common)</li>
    </ul>

    <h2>Wegovy — obesity formulation</h2>
    <p>Wegovy is the same molecule, FDA-approved for chronic weight management. Comes in single-use injectors. Standard dose ladder:</p>
    <ul>
      <li>0.25 mg weekly × 4 weeks</li>
      <li>0.5 mg weekly × 4 weeks</li>
      <li>1.0 mg weekly × 4 weeks</li>
      <li>1.7 mg weekly × 4 weeks</li>
      <li>2.4 mg weekly (maintenance)</li>
    </ul>

    <p>The Wegovy ladder is designed for weight loss, which typically needs higher semaglutide doses than diabetes management. 2.4 mg/week on Wegovy is the obesity-indication maintenance dose used in the STEP trials.</p>

    <h2>Compounded semaglutide</h2>
    <p>Compounded semaglutide is prepared by a licensed compounding pharmacy under FDA guidance when the FDA-approved products are on shortage (as they were through much of 2023–2025). The active peptide is semaglutide. The formulation may differ in concentration and preservative.</p>

    <p>Dose-wise, compounded semaglutide is typically prescribed in the same weekly milligram ranges as Wegovy. A prescription for 2 mg/week compounded semaglutide and 2.4 mg/week Wegovy deliver very similar active levels — the absolute numbers are in the same ballpark.</p>

    <p>Important caveats:</p>
    <ul>
      <li>Compounded products are not FDA-approved as final formulations. Quality depends on the pharmacy.</li>
      <li>Concentration per mL varies between pharmacies. A "1 unit" draw can mean very different mg depending on what's labeled on the vial.</li>
      <li>Compounded formulations occasionally include additional ingredients — follow your pharmacy's labeling and record what you're actually injecting.</li>
    </ul>

    <h2>The pharmacokinetics are identical across all three</h2>
    <p>If you inject 1 mg of semaglutide — whether from an Ozempic pen, a Wegovy injector, or a compounded vial — the molecule in your body and its kinetic profile are the same:</p>
    <ul>
      <li><strong>Half-life:</strong> ~7 days (5–8 days observed across individuals)</li>
      <li><strong>Absorption:</strong> Sub-Q, rises over a few hours</li>
      <li><strong>Steady state:</strong> ~4–5 weeks on weekly dosing</li>
      <li><strong>Stack ratio at steady state:</strong> ~3.0× the weekly dose</li>
    </ul>

    <p>That means 1.0 mg/week Ozempic, 1.0 mg/week Wegovy, and 1.0 mg/week compounded semaglutide all produce approximately 3.0 mg of active semaglutide at steady state. The dose you inject is what matters — the brand doesn't.</p>

    <h2>Switching between formulations</h2>
    <p>People switch for supply reasons (pens out of stock), insurance reasons (Wegovy covered, Ozempic off-label for weight), cost reasons (compounded often cheaper), or dose-ladder reasons (Wegovy goes higher).</p>

    <p>When switching, the practical rule: <strong>match the weekly mg, not the formulation</strong>. A user on 1.7 mg/week Wegovy can switch to 1.7 mg/week of compounded semaglutide and maintain the same active level. Protokol Lab models this correctly — the tracker sees "semaglutide, 1.7 mg weekly" regardless of the source bottle.</p>

    <h2>Why the tracker treats them identically</h2>
    <p>In Protokol Lab's built-in compound library, all three show up as one entry: <strong>Semaglutide</strong>. The half-life, kinetic shape, and dose-to-active-level math are the same. You log the mg per injection — not the pen count, not the brand.</p>

    <p>If your compounded semaglutide includes additional ingredients, add each as a separate custom compound. The tracker stacks their curves independently, and you see two overlaid active-level lines rather than one muddled number.</p>

    <h2>Rybelsus — the one actual difference</h2>
    <p>Rybelsus is oral semaglutide. Same peptide, different delivery. Bioavailability is much lower (~1%), so the dose numbers look different — 14 mg daily roughly equates to ~1 mg weekly sub-Q in total exposure. If you're on Rybelsus, use the Rybelsus preset in the tracker, not the injectable Semaglutide preset.</p>

    <h2>What actually matters for your tracking</h2>
    <ul>
      <li>Record the <strong>mg per injection</strong>, not the pen count or the brand.</li>
      <li>Use the Semaglutide preset regardless of bottle.</li>
      <li>If your compounded mix includes other peptides, log each as its own compound.</li>
      <li>Watch active level climb to steady state over the first ~4–5 weeks of any dose change.</li>
    </ul>

    <template #cta>
      <a href="/compounds">See compound library</a>
    </template>

    <template #disclaimer>
      <blockquote>
        Ozempic and Wegovy are registered trademarks of Novo Nordisk A/S. Rybelsus is a registered trademark of Novo Nordisk A/S. Protokol Lab is not affiliated with Novo Nordisk. Medication choices should be discussed with a licensed prescriber.
      </blockquote>
    </template>
  </BlogArticle>
</template>
