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
      <router-link to="/profile" class="back-link" aria-label="Back">‹ Profile</router-link>
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
    <router-link to="/profile/settings/account/subscription" class="card link-card">
      <div class="link-card-text">
        <span class="link-card-label">Subscription</span>
        <span v-if="subLoading" class="link-card-sub">Loading…</span>
        <span v-else class="link-card-sub">
          {{ currentPlan?.marketing?.title || 'Free' }}
          <template v-if="trialEndsAt">
            · trial ends {{ trialEndsAt.toLocaleDateString() }}
          </template>
          <template v-else-if="subscription?.planExpiresAt">
            · renews {{ new Date(subscription.planExpiresAt).toLocaleDateString() }}
          </template>
        </span>
      </div>
      <span class="link-card-chevron">›</span>
    </router-link>

    <div class="card signout-card">
      <button type="button" class="btn-secondary signout-btn" @click="handleLogout">
        Sign out
      </button>
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
.page-title { margin: 0; }

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
</style>
