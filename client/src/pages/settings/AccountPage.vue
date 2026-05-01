<script setup>
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth.js';
import { fetchSubscription } from '../../api/stripe.js';
import { getPublicPlans, PLAN_IDS } from '../../../../shared/plans.js';

const auth = useAuthStore();
const router = useRouter();

const subscription = ref(null);
const subLoading = ref(true);

const publicPlans = getPublicPlans();
const currentPlanId = computed(() => subscription.value?.plan?.id || PLAN_IDS.FREE);
const currentPlan = computed(
  () => publicPlans.find((p) => p.id === currentPlanId.value) || null,
);
const trialEndsAt = computed(() => {
  if (!subscription.value?.planExpiresAt) return null;
  if (!subscription.value?.planActivatedAt) return null;
  return new Date(subscription.value.planExpiresAt);
});

async function handleLogout() {
  await auth.logout();
  router.push('/login');
}

// Account deletion is a two-step modal: a confirm screen plus either a
// password challenge (for password accounts) or an "I understand" checkbox
// (for OAuth-only accounts where there's nothing to challenge against).
// Apple App Store guideline 5.1.1(v) requires this be reachable in-app.
const deleteOpen = ref(false);
const deleteAcknowledged = ref(false);
const deletePassword = ref('');
const deleteError = ref('');
const deleteSubmitting = ref(false);

const hasPassword = computed(() => Boolean(auth.user?.hasPassword));
const canSubmitDelete = computed(() => {
  if (!deleteAcknowledged.value) return false;
  if (hasPassword.value && !deletePassword.value) return false;
  return !deleteSubmitting.value;
});

function openDeleteModal() {
  deleteAcknowledged.value = false;
  deletePassword.value = '';
  deleteError.value = '';
  deleteOpen.value = true;
}

function closeDeleteModal() {
  if (deleteSubmitting.value) return;
  deleteOpen.value = false;
}

async function handleDelete() {
  deleteError.value = '';
  deleteSubmitting.value = true;
  try {
    if (hasPassword.value) {
      await auth.deleteAccount({ password: deletePassword.value });
    } else {
      await auth.deleteAccount({ confirm: true });
    }
    deleteOpen.value = false;
    router.push('/login');
  } catch (err) {
    if (err?.code === 'invalid_password') {
      deleteError.value = 'Wrong password.';
    } else if (err?.code === 'password_required') {
      deleteError.value = 'Password is required.';
    } else {
      deleteError.value = err?.message || 'Could not delete account. Try again.';
    }
  } finally {
    deleteSubmitting.value = false;
  }
}

onMounted(async () => {
  subLoading.value = true;
  try {
    subscription.value = await fetchSubscription();
  } catch {
    subscription.value = null;
  } finally {
    subLoading.value = false;
  }
});
</script>

<template>
  <div class="account-page">
    <div class="head">
      <router-link to="/profile" class="back-link" aria-label="Back"
        >‹ Profile</router-link
      >
      <h2 class="page-title">Account</h2>
    </div>

    <!-- Identity -->
    <div class="card">
      <div class="row">
        <span class="row-label">Email</span>
        <span class="row-value">{{ auth.user?.email || '—' }}</span>
      </div>
    </div>

    <!-- Subscription summary + manage link -->
    <router-link
      to="/profile/settings/account/subscription"
      class="card link-card"
    >
      <div class="link-card-text">
        <span class="link-card-label">Subscription</span>
        <span v-if="subLoading" class="link-card-sub">Loading…</span>
        <span v-else class="link-card-sub">
          {{ currentPlan?.marketing?.title || 'Free' }}
          <template v-if="trialEndsAt">
            · trial ends {{ trialEndsAt.toLocaleDateString() }}
          </template>
          <template v-else-if="subscription?.planExpiresAt">
            · renews
            {{ new Date(subscription.planExpiresAt).toLocaleDateString() }}
          </template>
        </span>
      </div>
      <span class="link-card-chevron">›</span>
    </router-link>

    <div class="card signout-card">
      <button
        type="button"
        class="btn-secondary signout-btn"
        @click="handleLogout"
      >
        Sign out
      </button>
    </div>

    <!-- Danger zone -->
    <div class="card danger-card">
      <h3 class="danger-title">Delete account</h3>
      <p class="danger-body">
        Permanently delete your account, all of your logs, photos, and any
        active subscription. This can't be undone.
      </p>
      <button
        type="button"
        class="btn-danger"
        @click="openDeleteModal"
      >
        Delete account
      </button>
    </div>

    <!-- Confirm modal -->
    <div
      v-if="deleteOpen"
      class="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-title"
      @click.self="closeDeleteModal"
    >
      <div class="modal">
        <h3 id="delete-title" class="modal-title">Delete your account?</h3>
        <p class="modal-body">
          Everything tied to <strong>{{ auth.user?.email }}</strong> will be
          erased: logs, photos, settings, and your active subscription. This
          can't be undone.
        </p>
        <label class="modal-confirm">
          <input
            v-model="deleteAcknowledged"
            type="checkbox"
            :disabled="deleteSubmitting"
          />
          <span>I understand this is permanent.</span>
        </label>
        <div v-if="hasPassword" class="modal-field">
          <label for="delete-password" class="modal-label">
            Confirm with your password
          </label>
          <input
            id="delete-password"
            v-model="deletePassword"
            type="password"
            autocomplete="current-password"
            class="modal-input"
            :disabled="deleteSubmitting"
            @keyup.enter="canSubmitDelete && handleDelete()"
          />
        </div>
        <p v-if="deleteError" class="modal-error">{{ deleteError }}</p>
        <div class="modal-actions">
          <button
            type="button"
            class="btn-secondary"
            :disabled="deleteSubmitting"
            @click="closeDeleteModal"
          >
            Cancel
          </button>
          <button
            type="button"
            class="btn-danger"
            :disabled="!canSubmitDelete"
            @click="handleDelete"
          >
            {{ deleteSubmitting ? 'Deleting…' : 'Delete account' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.account-page { max-width: 560px; }
.head {
  padding: var(--space-5) var(--space-5) 0;
  margin-bottom: var(--space-4);
}
.back-link {
  display: inline-flex;
  align-items: center;
  font-size: var(--font-size-s);
  color: var(--text-secondary);
  text-decoration: none;
  margin-bottom: var(--space-2);
  padding: var(--space-1) 0;
}
.back-link:hover { color: var(--text); }
.page-title { margin: 0; text-align: center; }

.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-medium);
  padding: var(--space-5);
  margin-bottom: var(--space-3);
}

.row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: var(--font-size-s);
}
.row-label {
  color: var(--text-tertiary);
  text-transform: uppercase;
  font-size: var(--font-size-xs);
  letter-spacing: var(--tracking-wider);
  font-weight: var(--font-weight-bold);
}
.row-value {
  color: var(--text);
  font-weight: var(--font-weight-medium);
}

.link-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  text-decoration: none;
  color: var(--text);
  transition: border-color var(--transition-fast);
}
.link-card:hover { border-color: var(--primary); }
.link-card-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.link-card-label {
  font-size: var(--font-size-m);
  font-weight: var(--font-weight-medium);
  color: var(--text);
}
.link-card-sub {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
}
.link-card-chevron {
  font-size: var(--font-size-l);
  color: var(--text-tertiary);
  flex: none;
}

.signout-card { display: flex; justify-content: center; }
.signout-btn { min-width: 200px; }

.danger-card {
  border-color: var(--color-danger, #c0392b);
}
.danger-title {
  margin: 0 0 var(--space-2);
  font-size: var(--font-size-m);
  color: var(--color-danger, #c0392b);
}
.danger-body {
  margin: 0 0 var(--space-4);
  font-size: var(--font-size-s);
  color: var(--text-secondary);
  line-height: 1.5;
}
.btn-danger {
  background: var(--color-danger, #c0392b);
  color: #fff;
  border: none;
  border-radius: var(--radius-medium);
  padding: var(--space-2) var(--space-4);
  font-size: var(--font-size-s);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
  transition: opacity var(--transition-fast);
}
.btn-danger:hover:not(:disabled) { opacity: 0.85; }
.btn-danger:disabled { opacity: 0.5; cursor: not-allowed; }

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-4);
  z-index: 1000;
}
.modal {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-large, 16px);
  padding: var(--space-5);
  max-width: 420px;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.modal-title {
  margin: 0;
  font-size: var(--font-size-l);
  color: var(--text);
}
.modal-body {
  margin: 0;
  font-size: var(--font-size-s);
  color: var(--text-secondary);
  line-height: 1.5;
}
.modal-confirm {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  font-size: var(--font-size-s);
  color: var(--text);
  cursor: pointer;
}
.modal-confirm input { margin-top: 3px; }
.modal-field { display: flex; flex-direction: column; gap: var(--space-1); }
.modal-label {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  font-weight: var(--font-weight-bold);
}
.modal-input {
  background: var(--surface-elevated, var(--surface));
  border: 1px solid var(--border);
  border-radius: var(--radius-medium);
  padding: var(--space-2) var(--space-3);
  font-size: var(--font-size-m);
  color: var(--text);
}
.modal-input:focus {
  outline: none;
  border-color: var(--primary);
}
.modal-error {
  margin: 0;
  font-size: var(--font-size-s);
  color: var(--color-danger, #c0392b);
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  margin-top: var(--space-2);
}
</style>
