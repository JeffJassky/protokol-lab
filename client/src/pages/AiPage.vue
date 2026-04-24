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
          AI has tools. It reads your full log — every food, dose, weigh-in,
          symptom, and note — searches the web for anything new, creates
          custom foods, and writes entries directly into your day. Describe
          what you ate. It handles the rest.
        </p>

        <h2 class="mkt-h2">What it can actually do</h2>
        <div class="mkt-card-grid">
          <div class="mkt-card">
            <h3>Reads your data</h3>
            <p>Every food entry, dose, weigh-in, symptom rating, and day note is available as context. No copy-pasting.</p>
          </div>
          <div class="mkt-card">
            <h3>Searches the web</h3>
            <p>New restaurant, new supplement, any nutrition fact — the AI runs a Google search and grounds the answer in what it finds.</p>
          </div>
          <div class="mkt-card">
            <h3>Creates custom foods</h3>
            <p>If you eat something not in your library, the AI can build a custom food entry with accurate macros and save it for next time.</p>
          </div>
          <div class="mkt-card">
            <h3>Writes log entries</h3>
            <p>"I just ate a Sweetgreen Kale Caesar" — it logs it to the right meal slot, counting toward your daily and weekly totals.</p>
          </div>
          <div class="mkt-card">
            <h3>Multi-thread history</h3>
            <p>Keep "Dose escalation plan" separate from "Nausea tolerance" from "Hitting protein on low-appetite days." Each thread keeps its own context.</p>
          </div>
          <div class="mkt-card">
            <h3>Dose-aware answers</h3>
            <p>It knows where you are in your tirzepatide or semaglutide cycle and can reason about why appetite is suppressed today or expected tomorrow.</p>
          </div>
        </div>

        <h2 class="mkt-h2">Example: real round-trip</h2>
        <div class="mkt-callout">
          <strong>You:</strong> I just ate a Sweetgreen Kale Caesar at lunch.<br /><br />
          <strong>AI (tool trail):</strong><br />
          • Reading request<br />
          ⚙ Checking your food library<br />
          ✓ Not in library yet<br />
          ⚙ Searching the web for nutrition info<br />
          ✓ Found · 560 cal · 40g P · 31g F · 42g C<br />
          ⚙ Saving as a custom food<br />
          ✓ Added to your library<br />
          ⚙ Writing the entry to today<br />
          ✓ Logged to lunch<br /><br />
          <strong>AI:</strong> Logged. You're at 1,240 cal, 340 to go for the
          day. Protein's at 92g — you'll want another shake before bed to hit
          180.
        </div>

        <h2 class="mkt-h2">How it's built</h2>
        <p class="mkt-p">
          The AI is a Gemini-based agent with tool-calling. It has structured
          access to your data via API, runs bounded iteration loops per
          message (no runaway tool use), and can ground web searches through
          Google Search integration when a nutrition fact isn't in your
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
