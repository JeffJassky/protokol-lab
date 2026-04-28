<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { api } from '../api.js';

const props = defineProps({
  promptKey: { type: String, required: true },
});

const prompt = ref(null);
const history = ref([]);
const draftBody = ref('');
const error = ref(null);
const saving = ref(false);
const testContext = ref('{\n  \n}');
const testResult = ref(null);

const dirty = computed(() => prompt.value && draftBody.value !== prompt.value.body);

async function load() {
  prompt.value = await api.prompts.get(props.promptKey);
  draftBody.value = prompt.value.body;
  const h = await api.prompts.history(props.promptKey);
  history.value = h.versions;
}
onMounted(load);
watch(() => props.promptKey, load);

async function save() {
  saving.value = true;
  error.value = null;
  try {
    prompt.value = await api.prompts.save(props.promptKey, draftBody.value);
    draftBody.value = prompt.value.body;
    const h = await api.prompts.history(props.promptKey);
    history.value = h.versions;
  } catch (e) { error.value = e.message; }
  finally { saving.value = false; }
}

async function restoreDefault() {
  if (!confirm('Replace current body with shipped default? Creates a new version.')) return;
  saving.value = true;
  try {
    prompt.value = await api.prompts.restoreDefault(props.promptKey);
    draftBody.value = prompt.value.body;
    const h = await api.prompts.history(props.promptKey);
    history.value = h.versions;
  } catch (e) { error.value = e.message; }
  finally { saving.value = false; }
}

async function activateVersion(v) {
  if (!confirm(`Activate version ${v}? This creates a new version copying its body.`)) return;
  saving.value = true;
  try {
    prompt.value = await api.prompts.activateVersion(props.promptKey, v);
    draftBody.value = prompt.value.body;
    const h = await api.prompts.history(props.promptKey);
    history.value = h.versions;
  } catch (e) { error.value = e.message; }
  finally { saving.value = false; }
}

async function runTest(useLlm = false) {
  testResult.value = { loading: true };
  try {
    const ctx = JSON.parse(testContext.value || '{}');
    testResult.value = await api.prompts.test(props.promptKey, ctx, useLlm);
  } catch (e) { testResult.value = { error: e.message }; }
}

function insertVariable(name) {
  const placeholder = `{{${name}}}`;
  draftBody.value = draftBody.value + placeholder;
}
</script>

<template>
  <div v-if="!prompt"><p class="empty-state">loading…</p></div>
  <div v-else>
    <p v-if="error" style="color:var(--bad)">{{ error }}</p>

    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
        <div>
          <h3 style="margin:0 0 4px;font-size:15px">{{ prompt.title || prompt.key }}</h3>
          <p style="margin:0;font-size:12px;color:var(--text-dim)">{{ prompt.description }}</p>
          <p style="margin:8px 0 0;font-size:11px;color:var(--text-dim);font-family:ui-monospace,'SF Mono',Menlo,monospace">{{ prompt.key }}</p>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
          <span class="pill">{{ prompt.module }} · v{{ prompt.version }}</span>
          <select class="select" style="max-width:200px;font-size:12px"
                  @change="(e) => { if (e.target.value) activateVersion(Number(e.target.value)); e.target.value = ''; }">
            <option value="">version history…</option>
            <option v-for="h in history" :key="h._id" :value="h.version" :disabled="h.isActive">
              v{{ h.version }}{{ h.isActive ? ' (active)' : '' }} · {{ new Date(h.editedAt || h.createdAt).toLocaleString() }}
            </option>
          </select>
        </div>
      </div>
    </div>

    <div class="card">
      <div style="display:grid;grid-template-columns:1fr 220px;gap:16px">
        <div>
          <label class="field-label">Prompt body (markdown — use double-curly placeholders for variables, e.g. contact.name)</label>
          <textarea class="textarea" v-model="draftBody" rows="22"
                    style="font-family:ui-monospace,'SF Mono',Menlo,monospace;font-size:13px"></textarea>
          <div style="margin-top:12px;display:flex;gap:8px">
            <button class="btn primary" :disabled="!dirty || saving" @click="save">
              {{ saving ? 'Saving…' : dirty ? 'Save new version' : 'Saved' }}
            </button>
            <button class="btn" :disabled="saving" @click="restoreDefault">Restore default</button>
            <button class="btn" :disabled="!dirty" @click="draftBody = prompt.body">Discard changes</button>
          </div>
        </div>
        <div>
          <label class="field-label">Variables</label>
          <div v-if="(prompt.variables || []).length === 0" class="empty-state" style="font-size:12px">
            no declared variables
          </div>
          <ul v-else style="list-style:none;padding:0;margin:0;font-size:12px">
            <li v-for="v in prompt.variables" :key="v.name"
                style="background:var(--panel-2);border:1px solid var(--border);border-radius:4px;padding:6px 8px;margin-bottom:4px;cursor:pointer"
                @click="insertVariable(v.name)" title="click to insert">
              <strong style="font-family:ui-monospace,'SF Mono',Menlo,monospace">{{ v.name }}</strong>
              <div v-if="v.description" style="color:var(--text-dim);margin-top:2px">{{ v.description }}</div>
            </li>
          </ul>
        </div>
      </div>
    </div>

    <div class="card">
      <h4 style="margin:0 0 8px;font-size:13px">Test</h4>
      <p style="margin:0 0 8px;font-size:12px;color:var(--text-dim)">
        Provide a sample context (JSON) — values are substituted into placeholders.
        Click Render to see the resolved prompt; "Run via LLM" calls the configured model.
      </p>
      <textarea class="textarea" v-model="testContext" rows="6"
                style="font-family:ui-monospace,'SF Mono',Menlo,monospace;font-size:12px"></textarea>
      <div style="margin-top:8px;display:flex;gap:8px">
        <button class="btn" @click="runTest(false)">Render only</button>
        <button class="btn" @click="runTest(true)">Run via LLM</button>
      </div>
      <div v-if="testResult" style="margin-top:12px">
        <p v-if="testResult.loading" class="empty-state">running…</p>
        <p v-else-if="testResult.error" style="color:var(--bad)">{{ testResult.error }}</p>
        <div v-else>
          <details open>
            <summary style="cursor:pointer;font-size:12px;color:var(--text-dim)">Rendered prompt</summary>
            <pre style="background:var(--bg);padding:10px;border-radius:6px;font-size:12px;white-space:pre-wrap;max-height:300px;overflow:auto;margin-top:6px">{{ testResult.rendered }}</pre>
          </details>
          <details v-if="testResult.output" open style="margin-top:8px">
            <summary style="cursor:pointer;font-size:12px;color:var(--text-dim)">
              Output {{ testResult.model ? `(${testResult.model})` : '' }} {{ testResult.costUsd ? `· $${testResult.costUsd.toFixed(4)}` : '' }}
            </summary>
            <pre style="background:var(--bg);padding:10px;border-radius:6px;font-size:12px;white-space:pre-wrap;max-height:300px;overflow:auto;margin-top:6px">{{ testResult.output }}</pre>
          </details>
        </div>
      </div>
    </div>
  </div>
</template>
