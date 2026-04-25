<script setup>
import MarketingLayout from '../components/MarketingLayout.vue';
import { useRouteSeo } from '../composables/useSeo.js';
import '../styles/marketing.css';

useRouteSeo();
</script>

<template>
  <MarketingLayout>
    <section class="mkt-page">
      <div class="wrap">
        <div class="mkt-eyebrow">AI · Agentic assistant</div>
        <h1 class="mkt-h1">An assistant<br /><span class="accent">that does the work.</span></h1>
        <p class="mkt-lead">
          Most trackers give you a chat window and call it AI. Protokol Lab's
          AI has tools. Snap a photo of your plate, or just describe what you
          ate — it identifies the food, looks it up across your library and
          common nutrition databases, falls back to a web search if needed,
          and writes the entry into your day. It also knows every dose,
          symptom, target, and weigh-in you've logged, so its answers are
          grounded in your data, not generic GLP-1 talking points.
        </p>

        <h2 class="mkt-h2">What it can actually do</h2>
        <div class="mkt-card-grid">
          <div class="mkt-card">
            <h3>Photo of your plate</h3>
            <p>Upload a meal photo. The AI identifies what's on the plate, estimates portions, finds matching items in your library or online, and writes a log entry per item — all in one round-trip.</p>
          </div>
          <div class="mkt-card">
            <h3>Multi-source food lookup</h3>
            <p>Your library first, then common nutrition databases, then a web search as fallback. Whatever route gets the macros, it picks. Restaurant menu, supplement label, obscure protein bar — handled.</p>
          </div>
          <div class="mkt-card">
            <h3>Reads your full history</h3>
            <p>Every food entry, dose, weigh-in, waist measurement, symptom rating, day note, and saved meal is available as context. No copy-pasting, no "let me explain my situation."</p>
          </div>
          <div class="mkt-card">
            <h3>Symptom × dose reasoning</h3>
            <p>"Why is the nausea hitting on day 2?" "When does hunger usually come back?" The AI cross-references your symptom log against your actual dose schedule, not population averages.</p>
          </div>
          <div class="mkt-card">
            <h3>Target-aware suggestions</h3>
            <p>Knows your daily and rolling 7-day calorie + macro targets, and what you've eaten so far. Ask "what should I have for dinner?" and it suggests real foods from your library that close the gap.</p>
          </div>
          <div class="mkt-card">
            <h3>Creates custom foods</h3>
            <p>If you eat something not in your library, the AI builds a custom food entry with accurate macros and saves it for next time. One-off meals don't stay one-off — they become reusable.</p>
          </div>
          <div class="mkt-card">
            <h3>Writes log entries</h3>
            <p>Single items, multi-item meals from a photo, copies of yesterday's lunch — all written directly to today's log in the right meal slot, counting toward daily and weekly totals.</p>
          </div>
          <div class="mkt-card">
            <h3>Dose-cycle awareness</h3>
            <p>It knows where you are in your tirzepatide or semaglutide cycle — half-life, last dose, time since peak — and can explain why appetite is suppressed today or expected to return tomorrow.</p>
          </div>
          <div class="mkt-card">
            <h3>Multi-thread history</h3>
            <p>Keep "Dose escalation plan" separate from "Nausea tolerance" from "Hitting protein on low-appetite days." Each thread keeps its own context and runs forward independently.</p>
          </div>
        </div>

        <h2 class="mkt-h2">Example: photo to logged entries</h2>
        <div class="mkt-callout">
          <strong>You:</strong> [photo of grilled salmon, asparagus, and rice]<br />
          "Just had this for dinner — best guess on macros?"<br /><br />
          <strong>AI (tool trail):</strong><br />
          • Reading request + image<br />
          ⚙ Identifying items in photo<br />
          ✓ Found: ~6 oz grilled salmon, ~1 cup asparagus, ~¾ cup white rice<br />
          ⚙ Checking your food library<br />
          ✓ Salmon and rice match recents — asparagus is new<br />
          ⚙ Searching nutrition databases<br />
          ✓ Asparagus · 27 kcal · 3g P · 0g F · 5g C per cup<br />
          ⚙ Saving asparagus as a custom food<br />
          ✓ Added to your library<br />
          ⚙ Writing 3 entries to dinner<br />
          ✓ Logged · 540 kcal · 42g P · 16g F · 38g C<br /><br />
          <strong>AI:</strong> Logged 3 items. You're at 1,940 kcal — 160
          to go on the day, well under your weekly budget. Protein's at
          165g, comfortably above target. Solid macro split for tomorrow's
          tirzepatide peak day.
        </div>

        <h2 class="mkt-h2">Example: target-aware suggestion</h2>
        <div class="mkt-callout">
          <strong>You:</strong> What should I have for dinner? Trying to hit
          protein.<br /><br />
          <strong>AI (tool trail):</strong><br />
          ⚙ Reading today's log + targets + saved meals<br />
          ✓ Today: 1,420 kcal · 92g protein · 680 kcal + 88g protein left<br />
          ✓ Saved meal "Post-lift chicken bowl" hits 680 kcal · 65g P<br /><br />
          <strong>AI:</strong> You've got 680 kcal and 88g protein to hit
          today. Your saved <em>Post-lift chicken bowl</em> covers most of
          it (65g P, 680 kcal) — add a Greek yogurt cup after and you'll
          land at exactly your target. Want me to log both now?
        </div>

        <h2 class="mkt-h2">How it's built</h2>
        <p class="mkt-p">
          The AI is a multimodal Gemini-based agent with tool-calling. It
          accepts text and image inputs in the same turn, has structured
          access to your data via internal APIs (food log, doses, symptoms,
          weight, settings, saved meals), runs bounded iteration loops per
          message so it can't loop forever, and grounds external lookups
          through a web search tool when a nutrition fact isn't in your
          library.
        </p>
        <p class="mkt-p">
          Messages are rate-limited to protect against abuse, and agent
          iteration counts are capped per-message for determinism. Full
          per-plan limits live on the <a href="/pricing">Pricing</a> page.
        </p>

        <h2 class="mkt-h2">Privacy</h2>
        <p class="mkt-p">
          The AI has read/write access only to your own data. We do not train
          on your logs. Chat threads stay in your account and export with the
          rest of your data when you ask for it.
        </p>

        <h2 class="mkt-h2">Available on Premium and Unlimited</h2>
        <p class="mkt-p">
          AI chat is a Premium feature. Unlimited raises daily message caps
          and context windows. <a href="/pricing">See pricing →</a>
        </p>

        <div class="mkt-cta-row">
          <a href="/register" class="mkt-btn-primary">Start free trial →</a>
          <a href="/features" class="mkt-btn-secondary">See all features</a>
        </div>
      </div>
    </section>
  </MarketingLayout>
</template>
