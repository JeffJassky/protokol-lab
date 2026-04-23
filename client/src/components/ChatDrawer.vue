<script setup>
import { ref, computed, watch, nextTick, onMounted } from 'vue';
import 'deep-chat';
import { useTheme } from '../composables/useTheme.js';

const theme = useTheme();
const isDark = computed(() => theme.value === 'dark' || (theme.value === 'auto' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches));

const props = defineProps({
  open: Boolean,
});

const emit = defineEmits(['update:open']);

// ── Thread state ──
const threads = ref([]);
const activeThreadId = ref(null);
const chatView = ref('list'); // 'list' | 'conversation'
const deepChatRef = ref(null);
const listInputText = ref('');
const pendingMessage = ref(null);
const visibleThreadCount = ref(8);
const renamingThreadId = ref(null);
const renameDraft = ref('');
const flyoutThreadId = ref(null);
const confirmingDeleteId = ref(null);

const DEFAULT_TITLE = 'New conversation';

const activeThread = computed(() =>
  threads.value.find((t) => t.id === activeThreadId.value) || null,
);

const sortedThreads = computed(() =>
  [...threads.value].sort((a, b) => b.updatedAt - a.updatedAt),
);

const visibleThreads = computed(() =>
  sortedThreads.value.slice(0, visibleThreadCount.value),
);

const hasMoreThreads = computed(() =>
  sortedThreads.value.length > visibleThreadCount.value,
);

// ── Deep-chat styles (theme-aware; deep-chat reads plain values, not CSS vars) ──
const chatPalette = computed(() => {
  if (isDark.value) {
    return {
      surface: '#171717',
      surfaceAlt: '#1f1f1f',
      border: '#2e2e2e',
      borderSoft: '#404040',
      text: '#e5e5e5',
      textMuted: '#a3a3a3',
      primary: '#818cf8',
      primaryHover: '#a5b4fc',
      bubbleUserText: '#ffffff',
    };
  }
  return {
    surface: '#ffffff',
    surfaceAlt: '#f5f5f5',
    border: '#e5e5e5',
    borderSoft: '#d4d4d4',
    text: '#262626',
    textMuted: '#a3a3a3',
    primary: '#4f46e5',
    primaryHover: '#4338ca',
    bubbleUserText: '#ffffff',
  };
});

const chatStyles = computed(() => ({ backgroundColor: chatPalette.value.surface }));
const inputAreaStyle = computed(() => ({
  backgroundColor: chatPalette.value.surfaceAlt,
  borderTop: `1px solid ${chatPalette.value.border}`,
}));
const textInputStyle = computed(() => ({
  styles: {
    container: {
      backgroundColor: chatPalette.value.surface,
      border: `1px solid ${chatPalette.value.borderSoft}`,
      borderRadius: '12px',
      color: chatPalette.value.text,
    },
    text: { color: chatPalette.value.text },
  },
  placeholder: { text: 'Ask anything about your data...', style: { color: chatPalette.value.textMuted } },
}));
const submitButtonStyle = computed(() => ({
  submit: {
    container: {
      default: { backgroundColor: chatPalette.value.primary, borderRadius: '8px' },
      hover: { backgroundColor: chatPalette.value.primaryHover },
    },
  },
}));
const chatMessageStyles = computed(() => ({
  default: {
    user: {
      bubble: { backgroundColor: chatPalette.value.primary, color: chatPalette.value.bubbleUserText, maxWidth: '85%' },
    },
    ai: {
      bubble: {
        backgroundColor: 'transparent',
        color: chatPalette.value.text,
        border: 'none',
        maxWidth: '95%',
        overflowX: 'auto',
      },
    },
  },
}));

const shadowStyles = computed(() => {
  const p = chatPalette.value;
  const tableHead = isDark.value ? p.surfaceAlt : '#fafafa';
  const dangerColor = isDark.value ? '#f87171' : '#dc2626';
  return `
  * { line-height: 1.6; font-weight: 400; }
  strong, b, h1, h2, h3, h4, h5, h6, th { font-weight: 700; }
  table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 13px; margin: 12px 0; }
  thead { background-color: ${tableHead}; }
  th { padding: 8px 12px; text-align: left; font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: ${p.textMuted}; white-space: nowrap; border-bottom: 2px solid ${p.borderSoft}; }
  td { padding: 8px 12px; border-bottom: 1px solid ${p.border}; color: ${p.text}; }
  tr:hover td { background-color: ${tableHead}; }

  details.agent-trail { border: 1px solid ${p.border}; border-radius: 0; background: ${tableHead}; margin: 4px 0; font-size: 12.5px; }
  details.agent-trail > summary { list-style: none; cursor: pointer; padding: 8px 12px; color: ${p.textMuted}; display: flex; align-items: center; gap: 8px; user-select: none; }
  details.agent-trail > summary::-webkit-details-marker { display: none; }
  details.agent-trail > summary::before { content: '▸'; color: ${p.textMuted}; font-size: 10px; transition: transform 0.15s; display: inline-block; }
  details.agent-trail[open] > summary::before { transform: rotate(90deg); }
  details.agent-trail .trail-latest { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  details.agent-trail ol { list-style: none; margin: 0; padding: 4px 12px 10px 12px; border-top: 1px dashed ${p.border}; }
  details.agent-trail li { padding: 4px 0 4px 22px; color: ${p.textMuted}; position: relative; }
  details.agent-trail li .trail-icon { position: absolute; left: 0; width: 16px; text-align: center; }
  details.agent-trail li.trail-err { color: ${dangerColor}; }
  .agent-final { margin-top: 10px; }
`;
});

// ── SSE streaming ──
const escapeHtml = (s) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const stepIcon = (evt) => {
  if (evt.type === 'status') return '•';
  if (evt.type === 'thought') return '💭';
  if (evt.type === 'tool_call') return '⚙️';
  if (evt.type === 'tool_result') return evt.ok === false ? '⚠️' : '✓';
  return '•';
};

const stepLabel = (evt) => {
  if (evt.type === 'status' || evt.type === 'thought') return evt.text;
  if (evt.type === 'tool_call' || evt.type === 'tool_result') return evt.summary;
  return '';
};

const renderThoughtTrail = (steps) => {
  if (!steps.length) return '';
  const latest = steps[steps.length - 1];
  const latestHtml = `<span class="trail-icon">${stepIcon(latest)}</span><span class="trail-latest">${escapeHtml(stepLabel(latest))}</span>`;
  const items = steps
    .map((s) => {
      const isErr = s.type === 'tool_result' && s.ok === false;
      return `<li class="${isErr ? 'trail-err' : ''}"><span class="trail-icon">${stepIcon(s)}</span>${escapeHtml(stepLabel(s))}</li>`;
    })
    .join('');
  return `<details class="agent-trail"><summary>${latestHtml}</summary><ol>${items}</ol></details>`;
};

const renderBubble = (steps, finalHtml) => {
  const trail = renderThoughtTrail(steps);
  if (finalHtml) return `${trail}<div class="agent-final">${finalHtml}</div>`;
  return trail;
};

let trailOpenPref = false;
let trailObserver = null;

const wireTrail = (el) => {
  if (el.__trailWired) return;
  el.__trailWired = true;
  el.open = trailOpenPref;
  el.addEventListener('toggle', () => { trailOpenPref = el.open; });
};

const setupTrailObserver = (shadow) => {
  if (trailObserver) return;
  shadow.querySelectorAll('details.agent-trail').forEach(wireTrail);
  trailObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      m.addedNodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        if (node.matches?.('details.agent-trail')) wireTrail(node);
        node.querySelectorAll?.('details.agent-trail').forEach(wireTrail);
      });
    }
  });
  trailObserver.observe(shadow, { childList: true, subtree: true });
};

const streamChat = (body, signals) => {
  const payload = { messages: body.messages };
  const controller = new AbortController();
  signals.stopClicked.listener = () => controller.abort();

  (async () => {
    let res;
    try {
      res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'same-origin',
        signal: controller.signal,
      });
    } catch (e) {
      await signals.onResponse({ error: e?.message || 'Network error' });
      signals.onClose();
      return;
    }

    if (!res.ok || !res.body) {
      await signals.onResponse({ error: `Request failed (${res.status})` });
      signals.onClose();
      return;
    }

    signals.onOpen();

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const steps = [];
    let finalHtml = null;

    const flush = async () => {
      await signals.onResponse({
        html: renderBubble(steps, finalHtml),
        overwrite: true,
      });
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let sepIdx;
        while ((sepIdx = buffer.indexOf('\n\n')) !== -1) {
          const block = buffer.slice(0, sepIdx);
          buffer = buffer.slice(sepIdx + 2);
          if (!block.startsWith('data:')) continue;
          const json = block.slice(5).trim();
          if (!json) continue;

          let evt;
          try { evt = JSON.parse(json); } catch { continue; }

          if (evt.type === 'final') {
            finalHtml = evt.html || (evt.text ? escapeHtml(evt.text) : '');
            await flush();
          } else if (evt.type === 'error') {
            await signals.onResponse({ error: evt.message });
          } else {
            steps.push(evt);
            await flush();
          }
        }
      }
    } catch (e) {
      if (e?.name !== 'AbortError') {
        await signals.onResponse({ error: e?.message || 'Stream error' });
      }
    } finally {
      signals.onClose();
      await nextTick();
      captureMessages();
      maybeGenerateTitle();
    }
  })();
};

const updateChatConnect = () => {
  const el = deepChatRef.value;
  if (!el) return;

  const shadow = el.shadowRoot;
  if (shadow) {
    let styleEl = shadow.querySelector('#chat-styles');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'chat-styles';
      shadow.appendChild(styleEl);
    }
    styleEl.textContent = shadowStyles.value;
    setupTrailObserver(shadow);
  }

  el.connect = {
    stream: true,
    handler: streamChat,
  };
};

watch(shadowStyles, (css) => {
  const shadow = deepChatRef.value?.shadowRoot;
  const styleEl = shadow?.querySelector('#chat-styles');
  if (styleEl) styleEl.textContent = css;
});

// ── Thread management ──
const activeThreadHistory = computed(() => {
  const msgs = activeThread.value?.messages || [];
  return msgs
    .map((m) => {
      if (!m || typeof m !== 'object') return null;
      const role = m.role || 'ai';
      const out = { role };
      if (m.html) out.html = m.html;
      else if (m.text) out.html = escapeHtml(m.text);
      if (Array.isArray(m.files) && m.files.length) out.files = m.files;
      if (!out.html && !out.files) return null;
      return out;
    })
    .filter(Boolean);
});

const loadThreads = async () => {
  try {
    const res = await fetch('/api/chat/threads?includeMessages=1', { credentials: 'same-origin' });
    if (!res.ok) { threads.value = []; return; }
    const data = await res.json();
    threads.value = data.threads || [];
  } catch {
    threads.value = [];
  }

  if (threads.value.length) {
    activeThreadId.value = null;
    chatView.value = 'list';
  } else {
    await newThread({ syncUi: false });
  }
};

const saveTimers = new Map();
const scheduleSave = (threadId) => {
  if (saveTimers.has(threadId)) clearTimeout(saveTimers.get(threadId));
  const timer = setTimeout(() => {
    saveTimers.delete(threadId);
    saveThreadNow(threadId);
  }, 400);
  saveTimers.set(threadId, timer);
};

const saveThreadNow = async (threadId) => {
  const t = threads.value.find((x) => x.id === threadId);
  if (!t) return;
  try {
    await fetch(`/api/chat/threads/${threadId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ title: t.title, messages: t.messages }),
    });
  } catch (e) {
    console.warn('Failed to save thread', e);
  }
};

const captureMessages = () => {
  const el = deepChatRef.value;
  const thread = activeThread.value;
  if (!el || !thread) return;
  try {
    const freshMsgs = JSON.parse(JSON.stringify(el.getMessages?.() || []));
    thread.messages = freshMsgs;
    thread.updatedAt = Date.now();
    scheduleSave(thread.id);
  } catch (e) {
    console.warn('Failed to capture messages', e);
  }
};

let creatingThread = false;

const newThread = async (opts = {}) => {
  const { syncUi = true } = opts;
  if (creatingThread) return;

  captureMessages();

  // Reuse empty thread
  const empty = threads.value.find((t) => !t.messages || t.messages.length === 0);
  if (empty) {
    activeThreadId.value = empty.id;
    chatView.value = 'conversation';
    return;
  }

  const tempId = `temp-${Date.now()}`;
  const now = Date.now();
  threads.value.unshift({
    id: tempId,
    title: DEFAULT_TITLE,
    createdAt: now,
    updatedAt: now,
    messages: [],
  });
  activeThreadId.value = tempId;
  chatView.value = 'conversation';

  creatingThread = true;
  try {
    const res = await fetch('/api/chat/threads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ title: DEFAULT_TITLE }),
    });
    if (!res.ok) throw new Error('Create failed');
    const { thread } = await res.json();
    const idx = threads.value.findIndex((t) => t.id === tempId);
    if (idx !== -1) {
      thread.messages = threads.value[idx].messages;
      threads.value[idx] = thread;
    }
    if (activeThreadId.value === tempId) activeThreadId.value = thread.id;
  } catch (e) {
    console.warn('Failed to create thread', e);
    threads.value = threads.value.filter((t) => t.id !== tempId);
    if (activeThreadId.value === tempId) activeThreadId.value = threads.value[0]?.id || null;
  } finally {
    creatingThread = false;
  }
};

const switchThread = async (id) => {
  if (id === activeThreadId.value && chatView.value === 'conversation') return;
  captureMessages();
  activeThreadId.value = id;
  chatView.value = 'conversation';
};

const deleteThread = async (id) => {
  const prev = threads.value;
  threads.value = prev.filter((t) => t.id !== id);
  try {
    const res = await fetch(`/api/chat/threads/${id}`, { method: 'DELETE', credentials: 'same-origin' });
    if (!res.ok) throw new Error();
  } catch {
    threads.value = prev;
    return;
  }
  if (activeThreadId.value === id) {
    activeThreadId.value = null;
    chatView.value = 'list';
  }
};

const goBackToList = () => {
  captureMessages();
  chatView.value = 'list';
  visibleThreadCount.value = 8;
};

const submitFromList = async () => {
  const text = listInputText.value.trim();
  if (!text) return;
  listInputText.value = '';
  pendingMessage.value = text;
  await newThread();
};

const threadPreview = (t) => {
  const firstUser = t.messages?.find((m) => m.role === 'user');
  if (!firstUser) return '';
  const text = firstUser.text || (firstUser.html || '').replace(/<[^>]*>/g, ' ').trim();
  return text.slice(0, 100);
};

const formatRelative = (ts) => {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
};

const startRename = (t) => {
  renamingThreadId.value = t.id;
  renameDraft.value = t.title || '';
  nextTick(() => {
    const input = document.querySelector(`input[data-thread-rename="${t.id}"]`);
    input?.focus();
    input?.select();
  });
};

const commitRename = () => {
  const id = renamingThreadId.value;
  if (!id) return;
  const thread = threads.value.find((t) => t.id === id);
  if (thread) {
    thread.title = renameDraft.value.trim() || DEFAULT_TITLE;
    thread.updatedAt = Date.now();
    saveThreadNow(thread.id);
  }
  renamingThreadId.value = null;
  renameDraft.value = '';
};

const cancelRename = () => {
  renamingThreadId.value = null;
  renameDraft.value = '';
};

const toggleFlyout = (id) => {
  flyoutThreadId.value = flyoutThreadId.value === id ? null : id;
  confirmingDeleteId.value = null;
};

const closeFlyout = () => {
  flyoutThreadId.value = null;
  confirmingDeleteId.value = null;
};

const confirmDelete = (id) => {
  closeFlyout();
  deleteThread(id);
};

const maybeGenerateTitle = async () => {
  const thread = activeThread.value;
  if (!thread || (thread.title && thread.title !== DEFAULT_TITLE)) return;
  const firstUser = thread.messages?.find((m) => m.role === 'user');
  if (!firstUser) return;
  const userText = firstUser.text || (firstUser.html || '').replace(/<[^>]*>/g, ' ').trim();
  if (!userText.trim()) return;
  try {
    const res = await fetch('/api/chat/title', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ userMessage: userText }),
    });
    if (!res.ok) return;
    const { title } = await res.json();
    if (title) {
      thread.title = title;
      thread.updatedAt = Date.now();
      saveThreadNow(thread.id);
    }
  } catch {}
};

// ── Watchers ──
watch(() => props.open, async (open) => {
  if (!open) return;
  await loadThreads();
  await nextTick();
  updateChatConnect();
});

watch(activeThreadId, async () => {
  trailObserver?.disconnect();
  trailObserver = null;
  await nextTick();
  updateChatConnect();
});

// Pending message → submit after deep-chat mounts
watch(
  [() => chatView.value, activeThreadId],
  async ([view, threadId]) => {
    if (view !== 'conversation' || !threadId || !pendingMessage.value) return;
    const msg = pendingMessage.value;
    pendingMessage.value = null;

    const waitFrame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    for (let i = 0; i < 10; i++) {
      await waitFrame();
      await nextTick();
      if (activeThreadId.value?.startsWith('temp-')) continue;
      const el = deepChatRef.value;
      if (!el?.shadowRoot) continue;
      updateChatConnect();
      const input = el.shadowRoot.querySelector('[contenteditable]');
      if (!input) continue;
      await waitFrame();
      el.submitUserMessage({ text: msg });
      return;
    }
    console.warn('deep-chat never became ready for pending message');
  },
);

onMounted(() => {
  if (props.open) loadThreads();
});
</script>

<template>
  <div v-show="open" class="chat-drawer">
    <!-- Header -->
    <div class="chat-header">
      <div class="chat-header-left">
        <div class="chat-icon">✦</div>
        <div>
          <div class="chat-title">Health Assistant</div>
          <div class="chat-subtitle">Ask about your data</div>
        </div>
      </div>
      <button class="chat-close" @click="emit('update:open', false)">✕</button>
    </div>

    <!-- List View -->
    <template v-if="chatView === 'list'">
      <div class="chat-body">
        <div class="chat-list-actions">
          <button class="btn-new-thread" @click="newThread()">
            + New conversation
          </button>
        </div>

        <div class="thread-list" @click="closeFlyout">
          <div v-if="sortedThreads.length === 0" class="thread-empty">
            No conversations yet
          </div>
          <div
            v-for="t in visibleThreads"
            :key="t.id"
            @click="switchThread(t.id)"
            class="thread-item"
          >
            <div class="thread-item-body">
              <input
                v-if="renamingThreadId === t.id"
                v-model="renameDraft"
                :data-thread-rename="t.id"
                type="text"
                maxlength="60"
                class="thread-rename-input"
                @click.stop
                @keydown.enter.prevent="commitRename"
                @keydown.esc.prevent="cancelRename"
                @blur="commitRename"
              />
              <template v-else>
                <div class="thread-title">{{ t.title || 'Untitled' }}</div>
                <div v-if="threadPreview(t)" class="thread-preview">{{ threadPreview(t) }}</div>
                <div class="thread-time">{{ formatRelative(t.updatedAt) }}</div>
              </template>
            </div>
            <div v-if="renamingThreadId !== t.id" class="thread-menu-wrap">
              <button class="thread-menu-btn" @click.stop="toggleFlyout(t.id)">⋯</button>
              <div v-if="flyoutThreadId === t.id" class="thread-flyout">
                <button @click.stop="closeFlyout(); startRename(t)" class="flyout-item">Rename</button>
                <button
                  v-if="confirmingDeleteId !== t.id"
                  @click.stop="confirmingDeleteId = t.id"
                  class="flyout-item flyout-danger"
                >Delete</button>
                <div v-else class="flyout-confirm">
                  <span class="flyout-confirm-text">Delete?</span>
                  <button @click.stop="confirmDelete(t.id)" class="flyout-confirm-yes">Yes</button>
                  <button @click.stop="confirmingDeleteId = null" class="flyout-confirm-no">No</button>
                </div>
              </div>
            </div>
          </div>

          <div v-if="hasMoreThreads" class="thread-more">
            <button @click.stop="visibleThreadCount += 8" class="thread-more-btn">Show more</button>
          </div>
        </div>

        <div class="chat-list-input">
          <form @submit.prevent="submitFromList" class="list-form">
            <input v-model="listInputText" type="text" placeholder="Ask anything..." class="list-input" />
            <button type="submit" :disabled="!listInputText.trim()" class="list-send">→</button>
          </form>
        </div>
      </div>
    </template>

    <!-- Conversation View -->
    <template v-else>
      <div class="conv-bar">
        <button @click="goBackToList" class="conv-back">←</button>
        <div class="conv-title-wrap">
          <input
            v-if="renamingThreadId === activeThreadId"
            v-model="renameDraft"
            :data-thread-rename="activeThreadId"
            type="text"
            maxlength="60"
            class="thread-rename-input"
            @keydown.enter.prevent="commitRename"
            @keydown.esc.prevent="cancelRename"
            @blur="commitRename"
          />
          <button
            v-else
            @click="activeThread && startRename(activeThread)"
            class="conv-title-btn"
          >
            {{ activeThread?.title || 'New conversation' }}
          </button>
        </div>
        <button @click="newThread()" class="conv-new" title="New conversation">+</button>
      </div>

      <div class="conv-chat-area">
        <deep-chat
          :key="`${activeThreadId || 'empty'}`"
          ref="deepChatRef"
          :demo="true"
          :requestBodyLimits="{ maxMessages: 0 }"
          :history="activeThreadHistory"
          :introMessage="{ text: 'Hi! I can help you understand your nutrition, weight, symptoms, and health data. What would you like to know?' }"
          style="height: 100%; width: 100%; border: none; display: block;"
          :chatStyle="chatStyles"
          :inputAreaStyle="inputAreaStyle"
          :textInput="textInputStyle"
          :submitButtonStyles="submitButtonStyle"
          :messageStyles="chatMessageStyles"
        ></deep-chat>
      </div>
    </template>
  </div>
</template>

<style scoped>
.chat-drawer {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--surface, #fff);
}

.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid var(--border);
  background: var(--bg);
  flex: none;
}
.chat-header-left {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}
.chat-icon {
  width: 36px;
  height: 36px;
  background: var(--primary);
  border-radius: var(--radius-small);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-on-primary);
  font-size: var(--font-size-m);
}
.chat-title {
  font-weight: var(--font-weight-bold);
  font-size: var(--font-size-m);
  color: var(--text);
}
.chat-subtitle {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  text-transform: uppercase;
  font-weight: var(--font-weight-bold);
  letter-spacing: var(--tracking-wide);
}
.chat-close {
  background: none;
  border: none;
  font-size: var(--font-size-m);
  color: var(--text-secondary);
  cursor: pointer;
  padding: var(--space-1);
}

/* ── List View ── */
.chat-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.chat-list-actions {
  padding: var(--space-3) var(--space-4);
  flex: none;
}
.btn-new-thread {
  width: 100%;
  padding: var(--space-2);
  background: var(--primary);
  color: var(--text-on-primary);
  border: none;
  border-radius: var(--radius-small);
  font-size: var(--font-size-s);
  font-weight: var(--font-weight-bold);
  cursor: pointer;
  transition: background var(--transition-base);
}
.btn-new-thread:hover {
  background: var(--primary-hover);
}

.thread-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 var(--space-3);
}
.thread-empty {
  text-align: center;
  color: var(--text-secondary);
  font-size: var(--font-size-s);
  padding: var(--space-12) var(--space-4);
}
.thread-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3);
  border-radius: var(--radius-small);
  cursor: pointer;
  transition: background var(--transition-base);
}
.thread-item:hover {
  background: var(--bg);
}
.thread-item-body {
  flex: 1;
  min-width: 0;
}
.thread-title {
  font-size: var(--font-size-s);
  font-weight: var(--font-weight-medium);
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.thread-preview {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 2px;
}
.thread-time {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  margin-top: 2px;
}
.thread-rename-input {
  width: 100%;
  font-size: var(--font-size-s);
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--primary);
  border-radius: var(--radius-small);
  background: var(--surface);
  color: var(--text);
  outline: none;
}
.thread-menu-wrap {
  position: relative;
  flex: none;
}
.thread-menu-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: var(--space-1) var(--space-2);
  color: var(--text-secondary);
  font-size: var(--font-size-m);
  opacity: 0;
  transition: opacity var(--transition-base);
}
.thread-item:hover .thread-menu-btn {
  opacity: 1;
}
.thread-flyout {
  position: absolute;
  right: 0;
  top: 100%;
  width: 140px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-medium);
  box-shadow: var(--shadow-m);
  z-index: 20;
  padding: var(--space-1) 0;
}
.flyout-item {
  display: block;
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  padding: var(--space-2) var(--space-3);
  font-size: var(--font-size-s);
  cursor: pointer;
  color: var(--text);
}
.flyout-item:hover {
  background: var(--bg);
}
.flyout-danger {
  color: var(--danger);
}
.flyout-confirm {
  padding: var(--space-2) var(--space-3);
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-size-s);
}
.flyout-confirm-text {
  color: var(--text-secondary);
}
.flyout-confirm-yes {
  background: var(--danger);
  color: #fff;
  border: none;
  border-radius: var(--radius-small);
  padding: var(--space-1) var(--space-2);
  cursor: pointer;
  font-size: var(--font-size-xs);
}
.flyout-confirm-no {
  background: var(--bg);
  color: var(--text);
  border: none;
  border-radius: var(--radius-small);
  padding: var(--space-1) var(--space-2);
  cursor: pointer;
  font-size: var(--font-size-xs);
}

.thread-more {
  text-align: center;
  padding: var(--space-3);
}
.thread-more-btn {
  background: none;
  border: none;
  color: var(--primary);
  font-size: var(--font-size-s);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
}

.chat-list-input {
  padding: var(--space-3) var(--space-4);
  border-top: 1px solid var(--border);
  flex: none;
}
.list-form {
  display: flex;
  gap: var(--space-2);
}
.list-input {
  flex: 1;
  padding: var(--space-2) var(--space-3);
  font-size: var(--font-size-s);
}
.list-send {
  width: 38px;
  height: 38px;
  background: var(--primary);
  color: var(--text-on-primary);
  border: none;
  border-radius: var(--radius-small);
  cursor: pointer;
  font-size: var(--font-size-m);
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
}
.list-send:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* ── Conversation View ── */
.conv-bar {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--border);
  flex: none;
}
.conv-back,
.conv-new {
  background: none;
  border: none;
  cursor: pointer;
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-small);
  color: var(--text-secondary);
  font-size: var(--font-size-m);
  flex: none;
}
.conv-back:hover,
.conv-new:hover {
  background: var(--bg);
}
.conv-title-wrap {
  flex: 1;
  min-width: 0;
  padding: 0 var(--space-1);
}
.conv-title-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: var(--font-size-s);
  font-weight: var(--font-weight-medium);
  color: var(--text);
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: block;
  max-width: 100%;
  padding: 0;
}
.conv-title-btn:hover {
  color: var(--primary);
}

.conv-chat-area {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
</style>
