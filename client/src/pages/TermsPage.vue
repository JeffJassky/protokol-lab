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
        <div class="mkt-eyebrow">Legal</div>
        <h1 class="mkt-h1">Terms of Service</h1>
        <p class="mkt-lead">
          Last updated: 2026-04-24. These terms govern your use of Protokol
          Lab (protokollab.com) and the associated Progressive Web App.
        </p>

        <h2 class="mkt-h2">1. Acceptance of terms</h2>
        <p class="mkt-p">
          By creating an account, installing, or otherwise using Protokol
          Lab, you agree to these Terms of Service and our
          <a href="/privacy">Privacy Policy</a>. If you do not agree, do not
          use the service.
        </p>

        <h2 class="mkt-h2">2. What Protokol Lab is</h2>
        <p class="mkt-p">
          Protokol Lab is an organizational and mathematical modeling tool
          for recording and visualizing health-related data — body weight,
          measurements, food intake, medications you have been prescribed,
          symptoms, and notes. Pharmacokinetic charts are mathematical
          estimates provided for informational purposes only and do not
          reflect real-time biological or serum diagnostics.
        </p>
        <p class="mkt-p">
          Protokol Lab is <strong>not a medical device</strong> under the
          regulation of the U.S. Food and Drug Administration or any
          equivalent authority. It does not diagnose, treat, cure, or
          prevent any disease, and it does not provide medical advice,
          dosing recommendations, or titration suggestions. Consult a
          licensed medical professional before making any decision about
          your medication or health.
        </p>
        <p class="mkt-p">
          Protokol Lab does not sell, ship, distribute, refer users to, or
          endorse any pharmacy, telehealth provider, compounding facility,
          or substance. Users are solely responsible for the legality of
          any substance they choose to track and for obtaining any
          medication through a licensed prescriber and pharmacy.
        </p>

        <h2 class="mkt-h2">3. Eligibility</h2>
        <p class="mkt-p">
          You must be at least 18 years old to create an account. By using
          Protokol Lab you represent that (a) you are at least 18; (b) you
          have the legal capacity to enter into this agreement; and (c) any
          medication or substance you track is lawfully prescribed to you
          or otherwise lawful for you to possess in your jurisdiction.
        </p>

        <h2 class="mkt-h2">4. Your account</h2>
        <p class="mkt-p">
          You are responsible for maintaining the confidentiality of your
          account credentials and for all activity under your account.
          Notify us promptly at
          <a href="mailto:support@protokollab.com">support@protokollab.com</a>
          if you suspect unauthorized access.
        </p>

        <h2 class="mkt-h2">5. Subscriptions, billing, and cancellation</h2>
        <ul class="mkt-ul">
          <li><strong>Free tier</strong> — no payment required. We may change the scope of the free tier with reasonable notice.</li>
          <li><strong>Paid plans (Premium, Unlimited)</strong> — billed in advance at the interval you select (monthly or yearly) through our payment processor. Current pricing is posted on the <a href="/pricing">Pricing</a> page.</li>
          <li><strong>Free trial</strong> — paid plans include a 14-day free trial. You may cancel at any time before the trial ends and you will not be charged. If you do not cancel, your payment method will be charged at the end of the trial.</li>
          <li><strong>Renewals</strong> — paid plans renew automatically at the end of each billing period unless cancelled. Renewal amounts may change with notice.</li>
          <li><strong>Cancellation</strong> — cancel any time from Settings. Access to paid features continues through the end of the current billing period. No refund is issued for partial periods once billed, except as required by law.</li>
          <li><strong>Refunds</strong> — accidental renewals can be refunded on request within 7 days of the charge by emailing <a href="mailto:support@protokollab.com">support@protokollab.com</a>.</li>
          <li><strong>Taxes</strong> — prices shown exclude applicable taxes, which will be added where required.</li>
        </ul>

        <h2 class="mkt-h2">6. Acceptable use</h2>
        <p class="mkt-p">You agree not to:</p>
        <ul class="mkt-ul">
          <li>Use Protokol Lab in any way that violates applicable law or the rights of others.</li>
          <li>Attempt to reverse-engineer, decompile, or extract the source of the service beyond what is permitted by law.</li>
          <li>Interfere with, overload, or probe the service or its infrastructure, including by sending automated traffic at a rate beyond documented limits.</li>
          <li>Upload content that is illegal, infringing, or designed to harm other users or the service.</li>
          <li>Resell, sublicense, or operate Protokol Lab on behalf of third parties without written permission.</li>
        </ul>

        <h2 class="mkt-h2">7. User content and ownership</h2>
        <p class="mkt-p">
          You retain ownership of the data you submit to Protokol Lab
          ("User Content"). You grant Protokol Lab a limited, worldwide,
          non-exclusive license to host, process, transmit, and display
          User Content solely for the purpose of operating the service for
          you. We do not claim ownership of your data and we do not sell,
          license, or share it with third parties, except as described in
          our <a href="/privacy">Privacy Policy</a>.
        </p>

        <h2 class="mkt-h2">8. Third-party services</h2>
        <p class="mkt-p">
          Protokol Lab relies on third-party providers for specific
          functions (for example, payment processing and AI model access).
          Your use of those features is subject to our agreements with
          those providers. See the <a href="/privacy">Privacy Policy</a>
          for the current list of processors.
        </p>

        <h2 class="mkt-h2">9. Disclaimers</h2>
        <p class="mkt-p">
          Protokol Lab is provided "as is" and "as available" without
          warranties of any kind, express or implied, including but not
          limited to warranties of merchantability, fitness for a particular
          purpose, non-infringement, and accuracy of data or calculations.
          We do not warrant that the service will be uninterrupted,
          error-free, or secure, and we do not warrant that
          pharmacokinetic estimates reflect your individual physiology.
        </p>

        <h2 class="mkt-h2">10. Limitation of liability</h2>
        <p class="mkt-p">
          To the maximum extent permitted by law, Protokol Lab and its
          operators will not be liable for any indirect, incidental,
          special, consequential, exemplary, or punitive damages, or for
          loss of profits, revenue, data, use, goodwill, or other
          intangible losses, arising out of or in connection with your
          use of the service. In no event will our aggregate liability
          for all claims related to the service exceed the amount you paid
          to Protokol Lab in the 12 months immediately preceding the
          event giving rise to the claim, or USD $100, whichever is
          greater.
        </p>

        <h2 class="mkt-h2">11. Indemnification</h2>
        <p class="mkt-p">
          You agree to defend, indemnify, and hold harmless Protokol Lab
          and its operators from and against any claims, liabilities,
          damages, losses, and expenses arising out of (a) your use of the
          service; (b) your violation of these Terms; (c) your violation
          of any law or the rights of a third party; or (d) any substance
          you choose to track using the service.
        </p>

        <h2 class="mkt-h2">12. Termination</h2>
        <p class="mkt-p">
          You may stop using Protokol Lab and delete your account at any
          time from Settings. We may suspend or terminate your access if
          we reasonably believe you have violated these Terms, if we are
          required to do so by law, or if continued operation of the
          service is no longer commercially reasonable. On termination,
          your right to use the service ends; provisions that by their
          nature should survive will survive.
        </p>

        <h2 class="mkt-h2">13. Changes to the service</h2>
        <p class="mkt-p">
          We may add, remove, or modify features of the service at our
          discretion. Material changes that negatively affect paid users
          will be communicated by email with reasonable notice.
        </p>

        <h2 class="mkt-h2">14. Changes to these terms</h2>
        <p class="mkt-p">
          We may update these Terms from time to time. The "Last updated"
          date above reflects the current version. For material changes,
          we will notify registered users by email or in-app notice before
          the change takes effect. Continued use of the service after the
          effective date constitutes acceptance of the updated Terms.
        </p>

        <h2 class="mkt-h2">15. Governing law and disputes</h2>
        <p class="mkt-p">
          These Terms are governed by the laws of the jurisdiction in
          which Protokol Lab's operator is organized, without regard to
          conflict-of-law principles. You and Protokol Lab agree to resolve
          disputes first by good-faith email discussion; unresolved
          disputes shall be submitted to the courts of competent
          jurisdiction in that location, unless applicable consumer-
          protection law grants you different rights.
        </p>

        <h2 class="mkt-h2">16. Contact</h2>
        <p class="mkt-p">
          Questions about these Terms:
          <a href="mailto:support@protokollab.com">support@protokollab.com</a>.
        </p>
      </div>
    </section>
  </MarketingLayout>
</template>
