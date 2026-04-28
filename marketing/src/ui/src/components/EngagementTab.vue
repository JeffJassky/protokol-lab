<script setup>
import { ref, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api.js';

const props = defineProps({ contact: { type: Object, required: true } });
const router = useRouter();

const opps = ref([]);
const loading = ref(true);
const error = ref(null);

async function load() {
  loading.value = true;
  try {
    const r = await api.redditEngagement.listOpportunities({ authorContactId: props.contact._id });
    opps.value = r.opportunities;
  } catch (e) { error.value = e.message; }
  finally { loading.value = false; }
}
onMounted(load);
watch(() => props.contact._id, load);
</script>

<template>
  <div>
    <p v-if="error" style="color:var(--bad)">{{ error }}</p>
    <p v-if="loading" class="empty-state">loading…</p>

    <div v-else-if="opps.length === 0" class="card">
      <p class="empty-state">No engagement opportunities reference this contact (yet). When the Reddit scanner picks up a thread by this person, it'll show up here.</p>
    </div>

    <div v-else>
      <p style="font-size:13px;color:var(--text-dim);margin-bottom:8px">
        Threads this contact has authored that the Reddit Engagement scanner has surfaced.
      </p>
      <div v-for="o in opps" :key="o._id" class="card"
           style="cursor:pointer"
           @click="router.push({ name: 'opportunity-detail', params: { id: o._id } })">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div>
            <span class="pill">r/{{ o.subreddit }}</span>
            <span class="pill" style="margin-left:6px">{{ o.status }}</span>
            <span v-if="o.triage?.fit" class="pill" style="margin-left:6px">fit: {{ o.triage.fit }}</span>
          </div>
          <span style="font-size:11px;color:var(--text-dim)">{{ new Date(o.postedAt).toLocaleString() }}</span>
        </div>
        <strong style="display:block;margin-top:6px;font-size:13px">{{ o.title }}</strong>
        <p v-if="o.draft?.body" style="margin:6px 0 0;font-size:12px;color:var(--text-dim)">
          Drafted reply queued.
        </p>
      </div>
    </div>
  </div>
</template>
