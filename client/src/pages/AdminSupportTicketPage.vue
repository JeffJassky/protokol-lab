<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import {
  fetchAdminTicket,
  updateAdminTicket,
  replyAdminTicket,
  deleteAdminTicket,
} from '../api/adminSupport.js';

const route = useRoute();
const ticketId = computed(() => route.params.id);

const ticket = ref(null);
const loading = ref(true);
const error = ref(null);
const busy = ref(null);
const banner = ref(null);

const replyBody = ref('');

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const data = await fetchAdminTicket(ticketId.value);
    ticket.value = data.ticket;
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

onMounted(load);
watch(ticketId, load);

async function changeStatus(next) {
  if (!next || next === ticket.value.status) return;
  busy.value = 'status';
  banner.value = null;
  try {
    const { ticket: updated } = await updateAdminTicket(ticketId.value, { status: next });
    ticket.value = updated;
    banner.value = { ok: true, msg: `Status → ${next}. User notified.` };
  } catch (e) {
    banner.value = { ok: false, msg: e.message };
  } finally {
    busy.value = null;
  }
}

async function sendReply() {
  if (!replyBody.value.trim()) return;
  busy.value = 'reply';
  banner.value = null;
  try {
    const { ticket: updated } = await replyAdminTicket(ticketId.value, replyBody.value.trim());
    ticket.value = updated;
    replyBody.value = '';
    banner.value = { ok: true, msg: 'Reply sent. User emailed.' };
  } catch (e) {
    banner.value = { ok: false, msg: e.message };
  } finally {
    busy.value = null;
  }
}

async function removeTicket() {
  if (!confirm('Delete this ticket and all its files? Cannot be undone.')) return;
  busy.value = 'delete';
  try {
    await deleteAdminTicket(ticketId.value);
    location.href = '/admin/support';
  } catch (e) {
    banner.value = { ok: false, msg: e.message };
    busy.value = null;
  }
}

const STATUSES = ['open', 'in_progress', 'closed'];
const statusLabel = { open: 'Open', in_progress: 'In progress', closed: 'Closed' };

function fmtDate(v) { return v ? new Date(v).toLocaleString() : '—'; }
function fmtBytes(n) {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
function isImage(a) { return (a.contentType || '').startsWith('image/'); }
</script>

<template>
  <div class="admin-page">
    <header class="page-header">
      <div>
        <router-link to="/admin/support" class="back-link">← Support queue</router-link>
        <h1 v-if="ticket">{{ ticket.subject }}</h1>
        <p v-if="ticket" class="subtitle">
          <router-link :to="`/admin/users/${ticket.userId}`" class="muted">{{ ticket.userEmail }}</router-link>
          <span class="muted">· Opened {{ fmtDate(ticket.createdAt) }}</span>
        </p>
      </div>
      <div v-if="ticket" class="header-controls">
        <label>
          <span>Status</span>
          <select
            :value="ticket.status"
            :disabled="busy === 'status'"
            @change="changeStatus($event.target.value)"
          >
            <option v-for="s in STATUSES" :key="s" :value="s">{{ statusLabel[s] }}</option>
          </select>
        </label>
        <button class="btn danger" :disabled="busy === 'delete'" @click="removeTicket">Delete</button>
      </div>
    </header>

    <div v-if="banner" class="banner" :class="{ ok: banner.ok, err: !banner.ok }">{{ banner.msg }}</div>

    <div v-if="loading" class="loading">Loading…</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <template v-else-if="ticket">
      <!-- Original -->
      <article class="msg user">
        <div class="msg-head">
          <strong>{{ ticket.userEmail }}</strong>
          <span class="muted">{{ fmtDate(ticket.createdAt) }}</span>
        </div>
        <div class="msg-body">{{ ticket.description }}</div>
        <ul v-if="ticket.attachments?.length" class="attachments">
          <li v-for="a in ticket.attachments" :key="a.s3Key">
            <a :href="a.url" target="_blank" rel="noopener">
              <img v-if="isImage(a) && a.url" :src="a.url" :alt="a.filename" class="thumb" />
              <span>{{ a.filename }}</span>
              <span class="muted">{{ fmtBytes(a.bytes) }}</span>
            </a>
          </li>
        </ul>
      </article>

      <!-- Thread -->
      <article
        v-for="m in ticket.messages"
        :key="m._id || m.createdAt"
        class="msg"
        :class="m.authorRole"
      >
        <div class="msg-head">
          <strong>
            {{ m.authorRole === 'admin' ? (m.authorDisplayName || 'Support') : m.authorEmail }}
          </strong>
          <span v-if="m.authorRole === 'admin'" class="badge admin">Staff</span>
          <span class="muted">{{ fmtDate(m.createdAt) }}</span>
        </div>
        <div class="msg-body">{{ m.body }}</div>
        <ul v-if="m.attachments?.length" class="attachments">
          <li v-for="a in m.attachments" :key="a.s3Key">
            <a :href="a.url" target="_blank" rel="noopener">
              <img v-if="isImage(a) && a.url" :src="a.url" :alt="a.filename" class="thumb" />
              <span>{{ a.filename }}</span>
              <span class="muted">{{ fmtBytes(a.bytes) }}</span>
            </a>
          </li>
        </ul>
      </article>

      <!-- Admin reply -->
      <form class="composer card" @submit.prevent="sendReply">
        <label>
          <span>Reply as staff</span>
          <textarea v-model="replyBody" rows="5" maxlength="10000" placeholder="Your response…" />
        </label>
        <div class="row-actions">
          <button class="btn primary" type="submit" :disabled="busy === 'reply' || !replyBody.trim()">
            {{ busy === 'reply' ? 'Sending…' : 'Send reply + email' }}
          </button>
          <p class="hint">User will be emailed. Status auto-moves to "In progress" if currently open.</p>
        </div>
      </form>
    </template>
  </div>
</template>

<style scoped>
.admin-page { max-width: 1000px; margin: 0 auto; padding: 24px; font-family: var(--font-body); color: var(--text); }
.back-link { color: var(--text-secondary); text-decoration: none; font-size: 12px; }
.back-link:hover { color: var(--primary); }
.page-header { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; margin-bottom: 18px; flex-wrap: wrap; }
.page-header h1 { font-family: var(--font-display); font-size: 22px; margin: 4px 0 4px; word-break: break-word; }
.subtitle { color: var(--text-secondary); font-size: 13px; margin: 0; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.subtitle a { color: inherit; }
.muted { color: var(--text-tertiary, var(--text-secondary)); }

.header-controls { display: flex; gap: 10px; align-items: flex-end; }
.header-controls label { display: flex; flex-direction: column; gap: 4px; font-size: 11px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.08em; }
.header-controls select { background: var(--surface); border: 1px solid var(--border); color: var(--text); padding: 6px 10px; font-family: inherit; font-size: 13px; }

.banner { padding: 10px 14px; margin-bottom: 16px; font-size: 13px; border: 1px solid; }
.banner.ok { background: var(--surface); border-color: var(--primary); color: var(--primary); }
.banner.err { background: var(--surface); border-color: var(--danger, #d9534f); color: var(--danger, #d9534f); }

.msg { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-small, 6px); padding: 12px 14px; margin-bottom: 10px; }
.msg.admin { border-left: 3px solid var(--primary); }
.msg-head { display: flex; gap: 10px; align-items: center; font-size: 13px; margin-bottom: 6px; flex-wrap: wrap; }
.msg-head .muted { font-size: 11.5px; margin-left: auto; }
.msg-body { font-size: 14px; line-height: 1.5; white-space: pre-wrap; color: var(--text); }
.badge.admin { background: var(--primary-soft, var(--primary)); color: var(--primary); padding: 2px 6px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; border-radius: 4px; }

.attachments { list-style: none; padding: 0; margin: 10px 0 0; display: flex; flex-wrap: wrap; gap: 8px; }
.attachments li a { display: flex; align-items: center; gap: 8px; padding: 6px 10px; background: var(--surface-alt); border: 1px solid var(--border); border-radius: 4px; color: var(--text); text-decoration: none; font-size: 12px; }
.attachments li a:hover { border-color: var(--primary); color: var(--primary); }
.thumb { width: 48px; height: 48px; object-fit: cover; border-radius: 3px; }

.composer { display: flex; flex-direction: column; gap: 10px; }
.composer label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.06em; }
.composer textarea { background: var(--surface); border: 1px solid var(--border); color: var(--text); padding: 8px 10px; font-family: inherit; font-size: 14px; resize: vertical; text-transform: none; letter-spacing: 0; }
.composer textarea:focus { outline: none; border-color: var(--primary); }
.row-actions { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.hint { color: var(--text-secondary); font-size: 12px; margin: 0; }

.card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-small, 6px); padding: 14px 16px; margin-top: 14px; }

.btn { background: var(--surface); border: 1px solid var(--border); color: var(--text); padding: 8px 14px; font-size: 13px; cursor: pointer; font-family: inherit; border-radius: var(--radius-small, 6px); }
.btn:hover:not(:disabled) { border-color: var(--primary); color: var(--primary); }
.btn:disabled { opacity: 0.4; cursor: not-allowed; }
.btn.primary { background: var(--primary); border-color: var(--primary); color: var(--text-on-primary, #fff); }
.btn.danger { border-color: var(--danger, #d9534f); color: var(--danger, #d9534f); }

.loading, .error { padding: 20px; text-align: center; color: var(--text-secondary); font-size: 13px; }
.error { color: var(--danger, #d9534f); }
</style>
