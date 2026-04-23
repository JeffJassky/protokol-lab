<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import EmojiPicker from 'vue3-emoji-picker';
import 'vue3-emoji-picker/css';

const props = defineProps({
  modelValue: { type: String, default: '' },
  size: { type: String, default: 'md' }, // 'sm' | 'md'
});
const emit = defineEmits(['update:modelValue']);

const open = ref(false);
const rootEl = ref(null);

function toggle(e) {
  e.stopPropagation();
  open.value = !open.value;
}

function handleSelect(emoji) {
  emit('update:modelValue', emoji.i);
  open.value = false;
}

function clearEmoji(e) {
  e.stopPropagation();
  emit('update:modelValue', '');
  open.value = false;
}

function onDocClick(e) {
  if (!rootEl.value) return;
  if (!rootEl.value.contains(e.target)) open.value = false;
}

onMounted(() => document.addEventListener('click', onDocClick));
onBeforeUnmount(() => document.removeEventListener('click', onDocClick));
</script>

<template>
  <div class="emoji-picker-wrap" :class="`size-${size}`" ref="rootEl">
    <button type="button" class="emoji-btn" @click="toggle">
      <span v-if="modelValue" class="emoji-glyph">{{ modelValue }}</span>
      <span v-else class="emoji-placeholder">+</span>
    </button>
    <div v-if="open" class="emoji-popover" @click.stop>
      <div class="popover-header">
        <span class="popover-title">Pick emoji</span>
        <button v-if="modelValue" type="button" class="clear-btn" @click="clearEmoji">Clear</button>
      </div>
      <EmojiPicker :native="true" hide-search-disabled :theme="'auto'" @select="handleSelect" />
    </div>
  </div>
</template>

<style scoped>
.emoji-picker-wrap { position: relative; display: inline-block; }

.emoji-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px dashed var(--border);
  background: var(--bg);
  border-radius: 8px;
  cursor: pointer;
  padding: 0;
  transition: border-color 0.1s, background 0.1s;
}
.size-md .emoji-btn { width: 38px; height: 38px; font-size: 1.35rem; }
.size-sm .emoji-btn { width: 28px; height: 28px; font-size: 1rem; border-radius: 6px; }
.emoji-btn:hover { border-color: var(--primary); background: var(--surface); }
.emoji-glyph { line-height: 1; }
.emoji-placeholder { color: var(--text-secondary); font-size: 1rem; }

.emoji-popover {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 2000;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: var(--shadow-m);
  overflow: hidden;
}
.popover-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.4rem 0.6rem;
  border-bottom: 1px solid var(--border);
}
.popover-title { font-size: 0.72rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.04em; }
.clear-btn {
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 0.75rem;
  padding: 0.15rem 0.4rem;
  border-radius: 4px;
}
.clear-btn:hover { color: var(--danger); background: var(--danger-soft); }

:deep(.v3-emoji-picker) { border: none !important; }
</style>
