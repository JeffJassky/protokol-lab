<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import EmojiPicker from 'vue3-emoji-picker';
import 'vue3-emoji-picker/css';

const props = defineProps({
  modelValue: { type: String, default: '' },
  size: { type: String, default: 'md' }, // 'sm' | 'md' | 'lg'
  borderless: { type: Boolean, default: false },
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
  <div class="emoji-picker-wrap" :class="[`size-${size}`, { borderless }]" ref="rootEl">
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
  border-radius: var(--radius-small);
  cursor: pointer;
  padding: 0;
  transition: border-color var(--transition-fast), background var(--transition-fast);
}
.size-md .emoji-btn { width: 38px; height: 38px; font-size: var(--font-size-l); }
.size-sm .emoji-btn { width: 28px; height: 28px; font-size: var(--font-size-m); }
.size-lg .emoji-btn { width: 44px; height: 44px; font-size: 1.85rem; }
.emoji-btn:hover { border-color: var(--primary); background: var(--surface); }
.borderless .emoji-btn { border: none; background: transparent; padding: 0; }
.borderless .emoji-btn:hover { background: transparent; }
.emoji-glyph { line-height: 1; }
.emoji-placeholder { color: var(--text-secondary); font-size: var(--font-size-m); }

.emoji-popover {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 2000;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-medium);
  box-shadow: var(--shadow-m);
  overflow: hidden;
}
.popover-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-1) var(--space-2);
  border-bottom: 1px solid var(--border);
}
.popover-title { font-size: var(--font-size-xs); color: var(--text-secondary); text-transform: uppercase; letter-spacing: var(--tracking-wide); }
.clear-btn {
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: var(--font-size-xs);
  padding: 0.15rem var(--space-1);
  border-radius: var(--radius-small);
}
.clear-btn:hover { color: var(--danger); background: var(--danger-soft); }

:deep(.v3-emoji-picker) { border: none !important; }
</style>
