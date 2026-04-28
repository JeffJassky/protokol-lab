<script setup>
const props = defineProps({
  modelValue: { type: Array, default: () => [] },
});
const emit = defineEmits(['update:modelValue']);

const TYPES = [
  'email',
  'reddit_dm',
  'x_dm',
  'instagram_dm',
  'substack_message',
  'youtube_business',
  'contact_form',
  'linkedin_inmail',
  'other',
];

function update(index, key, value) {
  const next = props.modelValue.map((c, i) => (i === index ? { ...c, [key]: value } : c));
  emit('update:modelValue', next);
}

function add() {
  emit('update:modelValue', [
    ...props.modelValue,
    { type: 'email', value: '', confidence: 'guessed', isPreferred: props.modelValue.length === 0 },
  ]);
}

function remove(index) {
  emit(
    'update:modelValue',
    props.modelValue.filter((_, i) => i !== index)
  );
}
</script>

<template>
  <div>
    <div v-for="(c, i) in modelValue" :key="i" class="array-editor-row">
      <div>
        <div class="row" style="margin-bottom:6px">
          <select class="select" :value="c.type" @change="update(i, 'type', $event.target.value)">
            <option v-for="opt in TYPES" :key="opt" :value="opt">{{ opt }}</option>
          </select>
          <input class="input grow-2" placeholder="value (email, url…)" :value="c.value"
                 @input="update(i, 'value', $event.target.value)" />
        </div>
        <div class="row">
          <input class="input grow-2" placeholder="source url (where it was found)" :value="c.sourceUrl"
                 @input="update(i, 'sourceUrl', $event.target.value)" />
          <select class="select" :value="c.confidence" @change="update(i, 'confidence', $event.target.value)">
            <option value="guessed">guessed</option>
            <option value="scraped">scraped</option>
            <option value="verified">verified</option>
          </select>
          <label style="font-size:12px;color:var(--text-dim);display:flex;align-items:center;gap:4px">
            <input type="checkbox" :checked="!!c.isPreferred" @change="update(i, 'isPreferred', $event.target.checked)" />
            preferred
          </label>
        </div>
      </div>
      <button class="btn danger" type="button" @click="remove(i)">remove</button>
    </div>
    <button class="btn" type="button" @click="add">+ add channel</button>
  </div>
</template>
