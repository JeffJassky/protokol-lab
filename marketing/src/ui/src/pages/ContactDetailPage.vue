<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api.js';
import TagInput from '../components/TagInput.vue';
import PresenceEditor from '../components/PresenceEditor.vue';
import ContactChannelEditor from '../components/ContactChannelEditor.vue';
import ResearchTab from '../components/ResearchTab.vue';
import DraftsTab from '../components/DraftsTab.vue';
import EngagementTab from '../components/EngagementTab.vue';

const route = useRoute();
const router = useRouter();

const contact = ref(null);
const loading = ref(true);
const saving = ref(false);
const error = ref(null);
const activeTab = ref('overview');

async function load() {
  loading.value = true;
  try {
    contact.value = await api.contacts.get(route.params.id);
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

onMounted(load);
watch(() => route.params.id, load);

const showVoiceTab = computed(
  () => contact.value && ['self', 'team'].includes(contact.value.relationship)
);

async function save() {
  saving.value = true;
  error.value = null;
  try {
    contact.value = await api.contacts.update(route.params.id, contact.value);
  } catch (e) {
    error.value = e.message;
  } finally {
    saving.value = false;
  }
}

async function remove() {
  if (!confirm(`Delete ${contact.value.name}? This is permanent.`)) return;
  await api.contacts.remove(route.params.id);
  router.push({ name: 'contacts' });
}

const RELATIONSHIPS = ['target', 'self', 'team', 'unknown'];
const CLASSIFICATIONS = ['influencer', 'creator', 'journalist', 'company', 'partner', 'prospect', 'employee', 'other'];
const STATUSES = ['new', 'researching', 'enriched', 'drafted', 'sent', 'replied', 'declined', 'do_not_contact'];
const SELF_PROMO = ['never', 'when-asked', 'soft-link-when-relevant'];

// Ensure voiceProfile exists when relationship flips to self/team
function ensureVoice() {
  if (showVoiceTab.value && !contact.value.voiceProfile) {
    contact.value.voiceProfile = {
      active: false,
      voiceDescription: '',
      expertiseTags: [],
      doNotMention: [],
      selfPromoPolicy: 'never',
      signatureSnippet: '',
    };
  }
}
watch(showVoiceTab, ensureVoice);
</script>

<template>
  <div v-if="loading"><p class="empty-state">loading…</p></div>
  <div v-else-if="!contact"><p style="color:var(--bad)">Contact not found.</p></div>
  <div v-else>
    <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:8px">
      <div>
        <h1 class="page-title">{{ contact.name || 'Untitled' }}</h1>
        <p class="page-sub">
          <span class="pill" :class="{ accent: contact.relationship !== 'target' }">{{ contact.relationship }}</span>
          <span v-if="contact.classification" class="pill" style="margin-left:6px">{{ contact.classification }}</span>
          <span v-if="contact.primaryRole" class="pill" style="margin-left:6px">{{ contact.primaryRole }}</span>
        </p>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn danger" @click="remove">Delete</button>
        <button class="btn primary" :disabled="saving" @click="save">
          {{ saving ? 'Saving…' : 'Save' }}
        </button>
      </div>
    </div>
    <p v-if="error" style="color:var(--bad)">{{ error }}</p>

    <div class="tabs">
      <button class="tab" :class="{ active: activeTab === 'overview' }" @click="activeTab='overview'">Overview</button>
      <button v-if="showVoiceTab" class="tab" :class="{ active: activeTab === 'voice' }" @click="activeTab='voice'">Voice</button>
      <button class="tab" :class="{ active: activeTab === 'research' }" @click="activeTab='research'">Research</button>
      <button class="tab" :class="{ active: activeTab === 'drafts' }" @click="activeTab='drafts'">Drafts</button>
      <button class="tab" :class="{ active: activeTab === 'engagement' }" @click="activeTab='engagement'">Engagement</button>
      <button class="tab" :class="{ active: activeTab === 'history' }" @click="activeTab='history'">History</button>
    </div>

    <!-- OVERVIEW -->
    <div v-show="activeTab === 'overview'">
      <div class="card">
        <h3 style="margin:0 0 12px;font-size:14px">Identity</h3>
        <div class="row" style="margin-bottom:8px">
          <div class="field" style="flex:2">
            <label class="field-label">Name</label>
            <input class="input" v-model="contact.name" />
          </div>
          <div class="field">
            <label class="field-label">Display handle</label>
            <input class="input" v-model="contact.displayHandle" placeholder="@onthepen" />
          </div>
        </div>
        <div class="row" style="margin-bottom:8px">
          <div class="field">
            <label class="field-label">Relationship</label>
            <select class="select" v-model="contact.relationship">
              <option v-for="r in RELATIONSHIPS" :key="r" :value="r">{{ r }}</option>
            </select>
          </div>
          <div class="field">
            <label class="field-label">Classification</label>
            <select class="select" v-model="contact.classification">
              <option value="">—</option>
              <option v-for="c in CLASSIFICATIONS" :key="c" :value="c">{{ c }}</option>
            </select>
          </div>
          <div class="field">
            <label class="field-label">Primary role</label>
            <input class="input" v-model="contact.primaryRole" placeholder="podcaster, writer…" />
          </div>
          <div class="field">
            <label class="field-label">Status</label>
            <select class="select" v-model="contact.status">
              <option v-for="s in STATUSES" :key="s" :value="s">{{ s }}</option>
            </select>
          </div>
        </div>
        <div class="field">
          <label class="field-label">Roles</label>
          <TagInput v-model="contact.roles" placeholder="podcaster, redditor…" />
        </div>
        <div class="field">
          <label class="field-label">Tags</label>
          <TagInput v-model="contact.tags" placeholder="glp1, peptides…" />
        </div>
        <div class="field">
          <label class="field-label">Bio</label>
          <textarea class="textarea" v-model="contact.bio" rows="2" />
        </div>
        <div class="field">
          <label class="field-label">Niche / differentiator</label>
          <textarea class="textarea" v-model="contact.niche" rows="4" />
        </div>
      </div>

      <div class="card">
        <h3 style="margin:0 0 12px;font-size:14px">Presences</h3>
        <PresenceEditor v-model="contact.presences" />
      </div>

      <div class="card">
        <h3 style="margin:0 0 12px;font-size:14px">Contact channels</h3>
        <ContactChannelEditor v-model="contact.contactChannels" />
      </div>

      <div class="card">
        <h3 style="margin:0 0 12px;font-size:14px">Flags</h3>
        <div class="field">
          <label class="field-label">Conflicts</label>
          <TagInput v-model="contact.conflicts" placeholder="pharma sponsor, sells own products…" />
        </div>
        <div class="row">
          <label style="display:flex;gap:6px;align-items:center;font-size:13px">
            <input type="checkbox" v-model="contact.doNotContact" /> Do not contact
          </label>
          <input class="input" v-model="contact.doNotContactReason"
                 v-if="contact.doNotContact"
                 placeholder="reason (optional)" />
        </div>
      </div>

      <div class="card">
        <h3 style="margin:0 0 12px;font-size:14px">Source</h3>
        <div class="kv">
          <dt>Type</dt><dd>{{ contact.source?.type || '—' }}</dd>
          <dt>Note</dt><dd>{{ contact.source?.note || '—' }}</dd>
          <dt>Imported at</dt><dd>{{ contact.source?.importedAt || '—' }}</dd>
        </div>
      </div>
    </div>

    <!-- VOICE -->
    <div v-show="activeTab === 'voice'">
      <div v-if="!contact.voiceProfile" class="card">
        <p class="empty-state">Voice profile is empty. Save once to initialize.</p>
      </div>
      <div v-else class="card">
        <h3 style="margin:0 0 12px;font-size:14px">Voice profile</h3>
        <div class="row" style="margin-bottom:8px">
          <label style="display:flex;gap:6px;align-items:center;font-size:13px">
            <input type="checkbox" v-model="contact.voiceProfile.active" /> Active (show in voice pickers)
          </label>
          <div class="field" style="margin:0">
            <label class="field-label">Self-promo policy</label>
            <select class="select" v-model="contact.voiceProfile.selfPromoPolicy">
              <option v-for="p in SELF_PROMO" :key="p" :value="p">{{ p }}</option>
            </select>
          </div>
        </div>
        <div class="field">
          <label class="field-label">Voice description</label>
          <textarea class="textarea" v-model="contact.voiceProfile.voiceDescription" rows="6"
                    placeholder="Tone, areas of expertise, what we never claim, products mentionable…" />
        </div>
        <div class="field">
          <label class="field-label">Expertise tags</label>
          <TagInput v-model="contact.voiceProfile.expertiseTags" />
        </div>
        <div class="field">
          <label class="field-label">Do not mention</label>
          <TagInput v-model="contact.voiceProfile.doNotMention" />
        </div>
        <div class="field">
          <label class="field-label">Signature snippet (optional)</label>
          <textarea class="textarea" v-model="contact.voiceProfile.signatureSnippet" rows="2" />
        </div>
        <p style="font-size:12px;color:var(--text-dim);margin:0">
          Reddit/X/IG presence binding (which presence is this voice's account on each network)
          arrives in Phase 7 alongside the engagement module's subreddit picker.
        </p>
      </div>
    </div>

    <!-- RESEARCH -->
    <div v-show="activeTab === 'research'">
      <ResearchTab :contact="contact" @contact-updated="(c) => contact = c" />
    </div>

    <!-- DRAFTS -->
    <div v-show="activeTab === 'drafts'">
      <DraftsTab :contact="contact" />
    </div>

    <!-- ENGAGEMENT -->
    <div v-show="activeTab === 'engagement'">
      <EngagementTab :contact="contact" />
    </div>

    <!-- HISTORY -->
    <div v-show="activeTab === 'history'">
      <div class="card">
        <div class="kv">
          <dt>Created</dt><dd>{{ contact.createdAt }}</dd>
          <dt>Updated</dt><dd>{{ contact.updatedAt }}</dd>
          <dt>Last researched</dt><dd>{{ contact.lastResearchedAt || '—' }}</dd>
        </div>
        <p style="font-size:12px;color:var(--text-dim);margin:12px 0 0">
          Per-job usage logs and research history land here in Phase 4+.
        </p>
      </div>
    </div>
  </div>
</template>
