<script setup>
const props = defineProps({
  modelValue: { type: Array, default: () => [] },
});
const emit = defineEmits(['update:modelValue']);

const PLATFORMS = [
  'podcast',
  'substack',
  'youtube',
  'x',
  'instagram',
  'tiktok',
  'reddit',
  'blog',
  'website',
  'linkedin',
  'apple-podcasts',
  'spotify',
  'rss',
  'other',
];

function update(index, key, value) {
  const next = props.modelValue.map((p, i) => (i === index ? { ...p, [key]: value } : p));
  emit('update:modelValue', next);
}

function add() {
  emit('update:modelValue', [
    ...props.modelValue,
    { platform: 'website', handle: '', url: '', isPrimary: props.modelValue.length === 0 },
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
    <div v-for="(p, i) in modelValue" :key="i" class="array-editor-row">
      <div>
        <div class="row" style="margin-bottom:6px">
          <select class="select" :value="p.platform" @change="update(i, 'platform', $event.target.value)">
            <option v-for="opt in PLATFORMS" :key="opt" :value="opt">{{ opt }}</option>
          </select>
          <input class="input" placeholder="handle" :value="p.handle"
                 @input="update(i, 'handle', $event.target.value)" />
        </div>
        <div class="row" style="margin-bottom:6px">
          <input class="input grow-2" placeholder="url" :value="p.url"
                 @input="update(i, 'url', $event.target.value)" />
          <input class="input" placeholder="audience size raw (e.g. 10k-30k)" :value="p.audienceSizeRaw"
                 @input="update(i, 'audienceSizeRaw', $event.target.value)" />
        </div>
        <div class="row">
          <input class="input" type="number" placeholder="audience size (#)" :value="p.audienceSize"
                 @input="update(i, 'audienceSize', $event.target.value === '' ? null : Number($event.target.value))" />
          <select class="select" :value="p.audienceConfidence || ''" @change="update(i, 'audienceConfidence', $event.target.value || null)">
            <option value="">confidence…</option>
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
          </select>
          <label style="font-size:12px;color:var(--text-dim);display:flex;align-items:center;gap:4px">
            <input type="checkbox" :checked="!!p.isPrimary" @change="update(i, 'isPrimary', $event.target.checked)" />
            primary
          </label>
        </div>
      </div>
      <button class="btn danger" type="button" @click="remove(i)">remove</button>
    </div>
    <button class="btn" type="button" @click="add">+ add presence</button>
  </div>
</template>
