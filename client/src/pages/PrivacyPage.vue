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
        <div class="mkt-eyebrow">Legal · Privacy</div>
        <h1 class="mkt-h1">Privacy Policy</h1>
        <p class="mkt-lead">
          Last updated: 2026-04-24. Your health data is yours. We do not sell
          it, license it, share it with advertisers, or train machine-learning
          models on it for anyone else's benefit.
        </p>

        <h2 class="mkt-h2">Quick summary</h2>
        <ul class="mkt-ul">
          <li>We collect only what the service needs to work: account info, the health data you log, and billing metadata for paid plans.</li>
          <li>We do not sell or share your data with advertisers or data brokers.</li>
          <li>We use a small number of processors (listed below) to deliver the service.</li>
          <li>You can export or delete your entire account at any time.</li>
          <li>Questions: <a href="mailto:privacy@protokollab.com">privacy@protokollab.com</a>.</li>
        </ul>

        <h2 class="mkt-h2">1. Who we are</h2>
        <p class="mkt-p">
          Protokol Lab ("we," "us") operates the Protokol Lab service at
          protokollab.com. Contact for privacy inquiries:
          <a href="mailto:privacy@protokollab.com">privacy@protokollab.com</a>.
        </p>

        <h2 class="mkt-h2">2. Data we collect</h2>
        <p class="mkt-p"><strong>Account data</strong> — email address,
        hashed password, account creation timestamp, and plan tier. Optional
        display preferences (theme, timezone, unit system).</p>

        <p class="mkt-p"><strong>Health and logged data</strong> — whatever
        you choose to record: body weight, measurements, food entries,
        medication names and doses, injection timestamps, symptoms and 0–10
        severity ratings, day notes, and progress photos you upload. You
        control what is entered; we do not extract data from other apps or
        devices unless you explicitly authorize sync.</p>

        <p class="mkt-p"><strong>Billing metadata</strong> — if you pay for
        a subscription, our payment processor collects payment-method
        information. We receive a subscription status, amount, and
        processor-issued identifiers, but we <strong>do not store full
        credit-card numbers</strong> on our servers.</p>

        <p class="mkt-p"><strong>AI chat content</strong> — if you use the
        AI assistant, your chat messages and the relevant portions of your
        logged data are sent to our AI model provider to generate a
        response. The provider is contractually restricted from using
        this content to train public models on your behalf.</p>

        <p class="mkt-p"><strong>Technical data</strong> — standard server
        logs (IP address, user-agent, timestamps, request paths) for
        operational security and abuse prevention. We may use lightweight
        first-party analytics to understand aggregate product usage. We do
        not use third-party ad-tracking pixels.</p>

        <h2 class="mkt-h2">3. How we use your data</h2>
        <ul class="mkt-ul">
          <li><strong>Operate the service</strong> — render your logs, compute charts, process payments, deliver AI responses, send reminders you've opted into.</li>
          <li><strong>Support</strong> — respond to requests you send us.</li>
          <li><strong>Security and abuse prevention</strong> — detect and block fraudulent, abusive, or illegal use.</li>
          <li><strong>Service improvement</strong> — analyze aggregate, de-identified usage to improve features.</li>
          <li><strong>Legal compliance</strong> — respond to valid legal process and comply with law.</li>
        </ul>
        <p class="mkt-p">We do not use your data for advertising or to build
        profiles for third parties. We do not train publicly-available AI
        models on your logs.</p>

        <h2 class="mkt-h2">4. Who we share data with</h2>
        <p class="mkt-p">We use a small set of processors, each bound by a
        contract to use your data only to deliver the service to us:</p>
        <ul class="mkt-ul">
          <li><strong>Hosting and database</strong> — infrastructure providers for application hosting and data storage.</li>
          <li><strong>Payment processor</strong> — Stripe (<a href="https://stripe.com/privacy" rel="nofollow noopener" target="_blank">privacy policy</a>) for subscriptions and billing.</li>
          <li><strong>AI model provider</strong> — Google (Gemini API, <a href="https://policies.google.com/privacy" rel="nofollow noopener" target="_blank">privacy policy</a>) to process AI chat requests.</li>
          <li><strong>Transactional email</strong> — SendGrid (<a href="https://www.twilio.com/legal/privacy" rel="nofollow noopener" target="_blank">privacy policy</a>) for account, security, and billing emails.</li>
        </ul>
        <p class="mkt-p">We do not sell, license, or otherwise transfer your
        personal data to advertisers, data brokers, or any third party for
        their independent marketing or analytics purposes.</p>

        <h2 class="mkt-h2">5. Cookies and local storage</h2>
        <p class="mkt-p">
          Protokol Lab uses first-party cookies and browser local storage
          to keep you signed in, remember your theme and settings, and cache
          data for offline use. We do not set third-party advertising or
          cross-site tracking cookies.
        </p>

        <h2 class="mkt-h2">6. Security and encryption</h2>
        <p class="mkt-p">
          Data in transit between your device and our servers is protected
          by TLS. Account passwords are stored only as salted, one-way
          hashes (we cannot recover your password; we can only reset it).
          Data at rest is stored on encrypted cloud infrastructure.
        </p>
        <p class="mkt-p">
          No system is perfectly secure. If we become aware of a breach
          affecting your data, we will notify you and the appropriate
          authorities as required by applicable law.
        </p>

        <h2 class="mkt-h2">7. Data retention</h2>
        <p class="mkt-p">
          We retain your data for as long as your account is active.
          When you delete your account, we delete your data from our
          production systems within a reasonable period and from backups
          within a longer period aligned to our backup retention cycle.
          We may retain anonymized or aggregated data, and we may retain
          limited records as required to comply with law, resolve disputes,
          or enforce our agreements.
        </p>

        <h2 class="mkt-h2">8. Your rights</h2>
        <p class="mkt-p">Regardless of jurisdiction, you can:</p>
        <ul class="mkt-ul">
          <li><strong>Access and export</strong> your full data as JSON or CSV at any time from Settings — no support ticket required, no paywall.</li>
          <li><strong>Correct</strong> any data in your account by editing it directly.</li>
          <li><strong>Delete</strong> your account and associated data from Settings.</li>
          <li><strong>Opt out of marketing emails</strong> (transactional emails like billing receipts and security alerts cannot be opted out of while you have an account).</li>
        </ul>
        <p class="mkt-p">
          Residents of certain states (including California, Virginia,
          Colorado, Connecticut, and Utah) have additional rights under
          state privacy law, including the right to know what categories of
          personal data we process and to request deletion. Residents of
          the European Economic Area and the United Kingdom have rights
          under GDPR and UK GDPR, including access, rectification, erasure,
          restriction, portability, and objection. To exercise any of these
          rights, email
          <a href="mailto:privacy@protokollab.com">privacy@protokollab.com</a>.
        </p>

        <h2 class="mkt-h2">9. Children</h2>
        <p class="mkt-p">
          Protokol Lab is intended for users 18 and older. We do not
          knowingly collect personal data from anyone under 13. If we
          learn we have collected data from a child under 13, we will
          delete it promptly.
        </p>

        <h2 class="mkt-h2">10. International transfers</h2>
        <p class="mkt-p">
          Our servers and processors operate in the United States. If you
          access the service from outside the United States, your data
          will be transferred to and processed in the U.S. under standard
          safeguards including, where applicable, the European
          Commission's Standard Contractual Clauses.
        </p>

        <h2 class="mkt-h2">11. HIPAA, FIPA, and scope</h2>
        <p class="mkt-p">
          Protokol Lab is not a "covered entity" or a "business associate"
          under the U.S. Health Insurance Portability and Accountability
          Act (HIPAA). Data you log into Protokol Lab is not Protected
          Health Information under HIPAA and is not subject to HIPAA's
          safeguards. Where state laws such as the Florida Information
          Protection Act (FIPA) apply to specific data categories we
          process, we apply reasonable administrative and technical
          security measures consistent with those laws.
        </p>

        <h2 class="mkt-h2">12. Changes to this policy</h2>
        <p class="mkt-p">
          We may update this Privacy Policy periodically. The "Last updated"
          date above reflects the current version. For material changes
          we will notify registered users by email or in-app notice.
        </p>

        <h2 class="mkt-h2">13. Contact</h2>
        <p class="mkt-p">
          Privacy inquiries, data-rights requests, or security concerns:
          <a href="mailto:privacy@protokollab.com">privacy@protokollab.com</a>.
        </p>
      </div>
    </section>
  </MarketingLayout>
</template>
