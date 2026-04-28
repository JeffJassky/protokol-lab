<script setup>
import { ref, onMounted } from 'vue';
import { api, basePath } from '../api.js';

const health = ref(null);
const error = ref(null);

onMounted(async () => {
  try {
    health.value = await api.health();
  } catch (e) {
    error.value = e.message;
  }
});
</script>

<template>
  <div>
    <h1 class="page-title">marketing-admin</h1>
    <p class="page-sub">Suite of AI marketing tools mounted at <code>{{ basePath() }}</code>.</p>

    <div class="card">
      <h2 style="margin:0 0 12px;font-size:16px">Service health</h2>
      <p v-if="error" style="color:var(--bad)">{{ error }}</p>
      <dl v-else-if="health" class="kv">
        <dt>Status</dt><dd><span class="pill good">{{ health.status }}</span></dd>
        <dt>Database</dt><dd>{{ health.db }}</dd>
        <dt>Modules enabled</dt>
        <dd>
          <span v-if="health.modules.length === 0" class="empty-state">none yet</span>
          <span v-else>
            <span class="pill" v-for="m in health.modules" :key="m" style="margin-right:6px">{{ m }}</span>
          </span>
        </dd>
        <dt>Tools registered</dt>
        <dd>
          <span v-if="health.tools.length === 0" class="empty-state">none yet</span>
          <span v-else>{{ health.tools.length }}: {{ health.tools.join(', ') }}</span>
        </dd>
        <dt>Prompts registered</dt>
        <dd>
          <span v-if="health.prompts.length === 0" class="empty-state">none yet</span>
          <span v-else>{{ health.prompts.length }}: {{ health.prompts.join(', ') }}</span>
        </dd>
        <dt>Worker handlers</dt>
        <dd>
          <span v-if="health.worker.handlers.length === 0" class="empty-state">none yet</span>
          <span v-else>{{ health.worker.handlers.join(', ') }}</span>
        </dd>
        <dt>Version</dt><dd>{{ health.version }}</dd>
      </dl>
      <p v-else class="empty-state">loading…</p>
    </div>

    <div class="card">
      <h2 style="margin:0 0 12px;font-size:16px">Where we are</h2>
      <p style="font-size:13px;color:var(--text-dim);margin:0">
        Phase 0 scaffold. Infrastructure boots, mounts, and serves itself.
        Modules light up next: Contacts CRUD (Phase 1), prompt CRUD (Phase 2),
        research agent (Phase 4), Reddit engagement (Phase 7+).
      </p>
    </div>
  </div>
</template>
