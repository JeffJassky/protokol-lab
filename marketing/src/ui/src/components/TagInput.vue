<script setup>
import { ref } from 'vue';

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  placeholder: { type: String, default: 'add and press Enter…' },
});
const emit = defineEmits(['update:modelValue']);

const draft = ref('');

function add() {
  const v = draft.value.trim();
  if (!v) return;
  if (props.modelValue.includes(v)) {
    draft.value = '';
    return;
  }
  emit('update:modelValue', [...props.modelValue, v]);
  draft.value = '';
}

function remove(tag) {
  emit(
    'update:modelValue',
    props.modelValue.filter((t) => t !== tag)
  );
}
</script>

<template>
  <div class="tag-input">
    <span v-for="tag in modelValue" :key="tag" class="pill" @click="remove(tag)" title="click to remove">
      {{ tag }} ×
    </span>
    <input
      v-model="draft"
      :placeholder="placeholder"
      @keydown.enter.prevent="add"
      @keydown.,.prevent="add"
    />
  </div>
</template>
