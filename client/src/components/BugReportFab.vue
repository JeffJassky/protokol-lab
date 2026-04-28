<script setup>
import { ref, computed, watchEffect, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { createTicket } from '../api/support.js';
import { snapshotContext, buildSubject, buildDescription } from '../utils/bugReport.js';

const route = useRoute();
const router = useRouter();

const open = ref(false);
const submitting = ref(false);
const error = ref(null);

const happened = ref('');
const expected = ref('');
const doing = ref('');

const happenedRef = ref(null);

const canSubmit = computed(
  () => happened.value.trim().length > 0 && !submitting.value,
);

async function openModal() {
  open.value = true;
  await nextTick();
  happenedRef.value?.focus?.();
}

function closeModal() {
  if (submitting.value) return;
  open.value = false;
  error.value = null;
}

function reset() {
  happened.value = '';
  expected.value = '';
  doing.value = '';
  error.value = null;
}

async function submit() {
  if (!canSubmit.value) return;
  submitting.value = true;
  error.value = null;
  try {
    const ctx = snapshotContext(route);
    const { ticket } = await createTicket({
      subject: buildSubject(happened.value),
      description: buildDescription(
        { happened: happened.value, expected: expected.value, doing: doing.value },
        ctx,
      ),
    });
    open.value = false;
    reset();
    router.push(`/support/tickets/${ticket.id || ticket._id}`);
  } catch (e) {
    error.value = e.message || 'Could not submit. Try again.';
  } finally {
    submitting.value = false;
  }
}

// Esc-to-close. watchEffect's onCleanup runs both when `open` flips back to
// false AND when the component unmounts, so the listener is always removed
// exactly once per open. The previous nested-watch pattern stacked listeners
// across opens.
watchEffect((onCleanup) => {
  if (!open.value) return;
  function onKey(e) {
    if (e.key === 'Escape') closeModal();
  }
  window.addEventListener('keydown', onKey);
  onCleanup(() => window.removeEventListener('keydown', onKey));
});
</script>

<template>
  <button
    type="button"
    class="bug-fab"
    :class="{ 'is-open': open }"
    aria-label="Report a bug"
    title="Report a bug"
    @click="openModal"
  >
    <svg
      class="bug-icon"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="m8 2 1.88 1.88" />
      <path d="M14.12 3.88 16 2" />
      <path d="M9 7.13v-1a3.003 3.003 0 0 1 6 0v1" />
      <path
        d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"
      />
      <path d="M12 20v-9" />
      <path d="M6.53 9C4.6 8.8 3 7.1 3 5" />
      <path d="M6 13H2" />
      <path d="M3 21c0-2.1 1.7-3.9 3.8-4" />
      <path d="M20.97 5c0 2.1-1.6 3.8-3.5 4" />
      <path d="M22 13h-4" />
      <path d="M17.2 17c2.1.1 3.8 1.9 3.8 4" />
    </svg>
    <span class="bug-label">Report a bug</span>
  </button>

  <Teleport to="body">
    <div
      v-if="open"
      class="br-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="br-title"
      @click.self="closeModal"
    >
      <div class="br-card">
        <header class="br-head">
          <h3 id="br-title" class="br-title">Report a bug</h3>
          <button
            type="button"
            class="br-close"
            aria-label="Close"
            @click="closeModal"
          >
            ×
          </button>
        </header>
        <p class="br-sub">Tell us in your own words.</p>

        <form class="br-form" @submit.prevent="submit">
          <label class="br-field">
            <span class="br-label">What happened?</span>
            <textarea
              ref="happenedRef"
              v-model="happened"
              rows="3"
              maxlength="2000"
              required
              placeholder="e.g. The page went blank after I clicked Save."
            />
          </label>

          <label class="br-field">
            <span class="br-label">What did you expect to happen instead?</span>
            <textarea
              v-model="expected"
              rows="2"
              maxlength="2000"
              placeholder="e.g. I expected my note to be saved and shown in the list."
            />
          </label>

          <label class="br-field">
            <span class="br-label"
              >What were you doing right before?
              <span class="br-optional">(optional)</span></span
            >
            <textarea
              v-model="doing"
              rows="2"
              maxlength="2000"
              placeholder="e.g. I tapped on a meal, edited the calories, then hit Save."
            />
          </label>

          <p v-if="error" class="br-error">{{ error }}</p>

          <div class="br-actions">
            <button
              type="button"
              class="br-btn br-btn-secondary"
              :disabled="submitting"
              @click="closeModal"
            >
              Cancel
            </button>
            <button
              type="submit"
              class="br-btn br-btn-primary"
              :disabled="!canSubmit"
            >
              {{ submitting ? 'Sending…' : 'Send report' }}
            </button>
          </div>
          <p class="br-hint">
            You can add screenshots after the ticket is created.
          </p>
        </form>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.bug-fab {
  position: fixed;
  bottom: var(--space-6);
  left: var(--space-6);
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px 10px 12px;
  border-radius: var(--radius-pill, 999px);
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border);
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  z-index: 70;
  transition: background var(--transition-base), border-color var(--transition-base), transform var(--transition-base);
}
.bug-fab:hover {
  border-color: var(--primary);
  color: var(--primary);
  transform: translateY(-1px);
}
.bug-fab.is-open { display: none; }
.bug-icon { width: 18px; height: 18px; flex: none; }

.br-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 24px;
}
.br-card {
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--radius-small, 6px);
  max-width: 520px;
  width: 100%;
  padding: 24px 24px 20px;
  max-height: calc(100vh - 48px);
  overflow-y: auto;
}
.br-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.br-title { font-family: var(--font-display, inherit); font-size: 20px; margin: 0; letter-spacing: -0.01em; }
.br-close { background: none; border: none; color: var(--text-secondary); font-size: 24px; line-height: 1; cursor: pointer; padding: 0 4px; }
.br-close:hover { color: var(--text); }
.br-sub { font-size: 13px; color: var(--text-secondary); margin: 6px 0 16px; line-height: 1.5; }

.br-form { display: flex; flex-direction: column; gap: 14px; }
.br-field { display: flex; flex-direction: column; gap: 4px; }
.br-label {
  font-family: var(--font-display, inherit);
  font-size: 13px;
  font-weight: var(--font-weight-bold, 600);
  color: var(--text);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.br-optional { color: var(--text-secondary); font-weight: 400; text-transform: none; letter-spacing: 0; }
.br-field textarea {
  background: var(--bg);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 10px 12px;
  font: inherit;
  font-size: 14px;
  border-radius: var(--radius-small, 6px);
  resize: vertical;
  min-height: 64px;
}
.br-field textarea:focus { outline: none; border-color: var(--primary); }

.br-error { color: var(--danger, #d9534f); font-size: 13px; margin: 0; }
.br-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 4px; }
.br-btn { font-family: inherit; font-size: 13px; padding: 10px 16px; border: 1px solid var(--border); background: transparent; color: var(--text); cursor: pointer; border-radius: var(--radius-small, 6px); }
.br-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.br-btn-primary { background: var(--primary); color: var(--text-on-primary, var(--bg)); border-color: var(--primary); }
.br-btn-primary:hover:not(:disabled) { filter: brightness(1.05); }
.br-btn-secondary:hover:not(:disabled) { border-color: var(--border-strong, var(--text-secondary)); }
.br-hint { color: var(--text-secondary); font-size: 12px; margin: 0; text-align: right; }

@media (max-width: 768px) {
  .bug-fab {
    bottom: calc(56px + env(safe-area-inset-bottom, 0) + var(--space-3));
    left: var(--space-3);
    padding: 8px 12px 8px 10px;
    font-size: 12px;
  }
  .bug-icon { width: 16px; height: 16px; }
  .br-card { padding: 18px 18px 16px; }
}
</style>
