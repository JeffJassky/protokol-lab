<script setup>
import { computed } from 'vue';
import { usePwa } from '../composables/usePwa.js';
import { getInstallGuide } from '../utils/installGuides.js';

const pwa = usePwa();

// Resolution order:
//   1. installed → done
//   2. canPromptInstall → one-click button (Chromium browsers that fired
//      beforeinstallprompt — works on Android + desktop)
//   3. else → look up the os/browser-specific guide from the matrix
const guide = computed(() => {
  if (pwa.installed.value) return { kind: 'installed' };
  if (pwa.canPromptInstall.value) return { kind: 'prompt' };
  return getInstallGuide(pwa.os.value, pwa.browser.value);
});

async function handleInstall() {
  await pwa.promptInstall();
}

// Render `**bold**` segments in guide strings as <strong>. ONLY safe for
// the static installGuides.js matrix — escapes `< > &` first, then re-injects
// <strong> markup (so `**user input**` containing tags-via-bold is NOT
// neutralized). Do NOT call with dynamic / user / server input.
function renderStaticGuideMarkup(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}
</script>

<template>
  <div class="install-instructions">
    <!-- Already installed -->
    <div v-if="guide.kind === 'installed'" class="state ok">
      <span class="check">✓</span> App is installed on this device.
    </div>

    <!-- Browser fired beforeinstallprompt → direct one-click -->
    <div v-else-if="guide.kind === 'prompt'" class="state">
      <p class="lead">
        Install Protokol Lab for faster launch + reliable reminders.
      </p>
      <button class="btn-primary" type="button" @click="handleInstall">
        Install app
      </button>
    </div>

    <!-- Numbered steps with optional inline icon -->
    <div v-else-if="guide.kind === 'steps'" class="state">
      <p v-if="guide.title" class="lead">{{ guide.title }}:</p>
      <ol class="install-steps">
        <li v-for="(s, i) in guide.steps" :key="i">
          <span v-if="s.icon === 'share'" class="step-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22">
              <path
                fill="currentColor"
                d="M12 2 7 7h3v7h4V7h3l-5-5Zm-7 18h14v2H5v-2Zm0-4h14v2H5v-2Z"
              />
            </svg>
          </span>
          <span class="step-text" v-html="renderStaticGuideMarkup(s.text)" />
        </li>
      </ol>
      <p v-if="guide.note" class="note">{{ guide.note }}</p>
    </div>

    <!-- "Open this in a different browser" message -->
    <div v-else-if="guide.kind === 'redirect'" class="state warn">
      <p v-if="guide.title" class="lead">{{ guide.title }}</p>
      <p v-html="renderStaticGuideMarkup(guide.message)" />
    </div>

    <!-- Browser doesn't support installing on this OS at all -->
    <div v-else-if="guide.kind === 'unsupported'" class="state warn">
      <p v-if="guide.title" class="lead">{{ guide.title }}</p>
      <p v-html="renderStaticGuideMarkup(guide.message)" />
    </div>

    <!-- Generic fallback -->
    <div v-else class="state">
      <p v-html="renderStaticGuideMarkup(guide.message)" />
    </div>
  </div>
</template>

<style scoped>
.install-instructions { font-size: var(--font-size-s); color: var(--text); }
.lead { margin: 0 0 var(--space-2); }
.note { margin: var(--space-2) 0 0; font-size: var(--font-size-xs); color: var(--text-secondary); }

.state {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-medium);
  padding: var(--space-3) var(--space-4);
}
.state.ok {
  background: var(--success-soft, var(--bg));
  border-color: var(--success, var(--border));
  color: var(--success, var(--text));
}
.state.warn {
  border-color: var(--warning, var(--border));
  color: var(--warning, var(--text));
}
.state p { margin: 0 0 var(--space-1); }
.state p:last-child { margin-bottom: 0; }
.check { font-weight: var(--font-weight-bold); margin-right: var(--space-1); }

.install-steps {
  margin: 0;
  padding-left: var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  color: var(--text);
}
.install-steps li {
  line-height: 1.4;
}
.step-icon {
  display: inline-flex;
  align-items: center;
  vertical-align: -5px;
  color: var(--primary);
  margin-right: var(--space-1);
}
.step-text :deep(strong) {
  color: var(--text);
  font-weight: var(--font-weight-bold);
}
</style>
