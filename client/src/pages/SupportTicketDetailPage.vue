<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import {
  fetchMyTicket,
  addTicketMessage,
  presignTicketAttachment,
  attachTicketFile,
  uploadToSignedUrl,
} from '../api/support.js';

const route = useRoute();
const ticketId = computed(() => route.params.id);

const ticket = ref(null);
const loading = ref(true);
const error = ref(null);

// Per-message attachments (uploaded before send)
const replyBody = ref('');
const pendingFiles = ref([]);   // [{ file, status, s3Key, filename, contentType, bytes, error }]
const sending = ref(false);
const sendError = ref(null);

const MAX_FILES = 5;
const MAX_BYTES = 10 * 1024 * 1024;

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const data = await fetchMyTicket(ticketId.value);
    ticket.value = data.ticket;
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

onMounted(load);
watch(ticketId, load);

function onPickFiles(event) {
  const chosen = Array.from(event.target.files || []);
  event.target.value = '';
  for (const file of chosen) {
    if (pendingFiles.value.length >= MAX_FILES) break;
    if (file.size > MAX_BYTES) {
      pendingFiles.value.push({
        file,
        status: 'error',
        error: `Too large (max ${MAX_BYTES / 1024 / 1024}MB)`,
      });
      continue;
    }
    pendingFiles.value.push({ file, status: 'pending' });
  }
}

function removePending(i) {
  pendingFiles.value.splice(i, 1);
}

async function uploadPending(entry) {
  entry.status = 'uploading';
  try {
    const { uploadUrl, s3Key } = await presignTicketAttachment(ticketId.value, {
      filename: entry.file.name,
      contentType: entry.file.type || 'application/octet-stream',
      bytes: entry.file.size,
    });
    await uploadToSignedUrl(uploadUrl, entry.file);
    entry.s3Key = s3Key;
    entry.filename = entry.file.name;
    entry.contentType = entry.file.type || 'application/octet-stream';
    entry.bytes = entry.file.size;
    entry.status = 'uploaded';
  } catch (e) {
    entry.status = 'error';
    entry.error = e.message;
    throw e;
  }
}

async function sendReply() {
  if (!replyBody.value.trim() && !pendingFiles.value.length) return;
  sending.value = true;
  sendError.value = null;
  try {
    for (const entry of pendingFiles.value) {
      if (entry.status === 'pending') await uploadPending(entry);
    }
    const attachments = pendingFiles.value
      .filter((e) => e.status === 'uploaded')
      .map((e) => ({
        s3Key: e.s3Key, filename: e.filename, contentType: e.contentType, bytes: e.bytes,
      }));

    const { ticket: updated } = await addTicketMessage(ticketId.value, {
      body: replyBody.value.trim(),
      attachments,
    });
    ticket.value = updated;
    replyBody.value = '';
    pendingFiles.value = [];
  } catch (e) {
    sendError.value = e.message;
  } finally {
    sending.value = false;
  }
}

function fmtBytes(n) {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function fmtDate(v) {
  return v ? new Date(v).toLocaleString() : '—';
}

const statusLabel = { open: 'Open', in_progress: 'In progress', closed: 'Closed' };

function isImage(a) {
  return (a.contentType || '').startsWith('image/');
}
</script>

<template>
  <div class="ticket-detail">
    <header class="page-header">
      <router-link to="/support" class="back-link">← Support</router-link>
      <h1 v-if="ticket">{{ ticket.subject }}</h1>
      <p v-if="ticket" class="subtitle">
        <span class="status-pill" :data-status="ticket.status">{{ statusLabel[ticket.status] }}</span>
        <span class="muted">Opened {{ fmtDate(ticket.createdAt) }}</span>
      </p>
    </header>

    <div v-if="loading" class="loading">Loading…</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <template v-else-if="ticket">
      <!-- Initial message -->
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
            {{ m.authorRole === 'admin' ? 'Support' : (m.authorDisplayName || m.authorEmail) }}
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

      <!-- Reply composer -->
      <form v-if="ticket.status !== 'closed'" class="composer card" @submit.prevent="sendReply">
        <label>
          <span>Reply</span>
          <textarea v-model="replyBody" rows="4" maxlength="10000" placeholder="Add more details or answer a question…" />
        </label>
        <div class="file-row">
          <label class="file-picker">
            <input
              type="file"
              multiple
              accept="image/*,application/pdf,text/plain"
              :disabled="pendingFiles.length >= MAX_FILES"
              @change="onPickFiles"
            />
            <span>Attach files ({{ pendingFiles.length }}/{{ MAX_FILES }})</span>
          </label>
          <span class="hint">Up to {{ MAX_FILES }} files, 10MB each. Images, PDFs, text.</span>
        </div>
        <ul v-if="pendingFiles.length" class="pending-list">
          <li v-for="(p, i) in pendingFiles" :key="i">
            <span>{{ p.file.name }}</span>
            <span class="muted">{{ fmtBytes(p.file.size) }}</span>
            <span class="status" :class="p.status">{{ p.status }}</span>
            <span v-if="p.error" class="error">{{ p.error }}</span>
            <button type="button" class="link-btn" @click="removePending(i)">remove</button>
          </li>
        </ul>
        <p v-if="sendError" class="error">{{ sendError }}</p>
        <div class="row-actions">
          <button class="btn primary" type="submit" :disabled="sending">
            {{ sending ? 'Sending…' : 'Send reply' }}
          </button>
        </div>
      </form>
      <div v-else class="card closed-notice">This ticket is closed. Reopen by creating a new ticket.</div>
    </template>
  </div>
</template>

<style scoped>
.ticket-detail { font-family: var(--font-body); color: var(--text); }
.back-link { color: var(--text-secondary); text-decoration: none; font-size: 12px; }
.back-link:hover { color: var(--primary); }
.page-header h1 { font-family: var(--font-display); font-size: 22px; margin: 6px 0 6px; }
.subtitle { color: var(--text-secondary); font-size: 13px; margin: 0 0 18px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.muted { color: var(--text-tertiary, var(--text-secondary)); }

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

.file-row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; font-size: 12px; color: var(--text-secondary); }
.file-picker { display: inline-block; background: var(--surface-alt); border: 1px dashed var(--border); padding: 6px 12px; cursor: pointer; border-radius: 4px; }
.file-picker input { display: none; }
.file-picker:hover { border-color: var(--primary); color: var(--primary); }
.hint { color: var(--text-tertiary, var(--text-secondary)); font-size: 11.5px; }

.pending-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 4px; }
.pending-list li { display: flex; gap: 10px; align-items: center; font-size: 12px; padding: 4px 6px; border: 1px solid var(--border); border-radius: 4px; background: var(--surface-alt); }
.status { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.06em; padding: 1px 6px; border-radius: 3px; }
.status.pending { background: var(--border); color: var(--text-secondary); }
.status.uploading { background: var(--primary-soft, var(--primary)); color: var(--primary); }
.status.uploaded { background: #16a34a22; color: #16a34a; }
.status.error { background: #d9534f22; color: #d9534f; }
.link-btn { background: none; border: none; color: var(--primary); cursor: pointer; font-size: 11.5px; padding: 0; margin-left: auto; }
.link-btn:hover { text-decoration: underline; }

.row-actions { display: flex; gap: 10px; align-items: center; }
.btn { background: var(--surface); border: 1px solid var(--border); color: var(--text); padding: 8px 14px; font-size: 13px; cursor: pointer; border-radius: var(--radius-small, 6px); font-family: inherit; }
.btn:hover:not(:disabled) { border-color: var(--primary); color: var(--primary); }
.btn:disabled { opacity: 0.4; cursor: not-allowed; }
.btn.primary { background: var(--primary); border-color: var(--primary); color: var(--text-on-primary, #fff); }

.card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-small, 6px); padding: 14px 16px; margin-top: 14px; }
.closed-notice { color: var(--text-secondary); font-size: 13px; text-align: center; }

.status-pill { display: inline-block; padding: 2px 8px; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.06em; border: 1px solid var(--border); color: var(--text-secondary); border-radius: 4px; }
.status-pill[data-status="open"] { color: var(--primary); border-color: var(--primary); }
.status-pill[data-status="in_progress"] { color: var(--text); }
.status-pill[data-status="closed"] { color: var(--text-tertiary, var(--text-secondary)); }

.loading, .error { padding: 20px; text-align: center; color: var(--text-secondary); font-size: 13px; }
.error { color: var(--danger, #d9534f); }
</style>
