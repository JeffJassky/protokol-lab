<script setup>
import { ref, computed } from 'vue';
import { usePhotosStore } from '../stores/photos.js';
import PhotoCompareModal from './PhotoCompareModal.vue';
import PhotoViewerModal from './PhotoViewerModal.vue';

const props = defineProps({
  // Optional YYYY-MM-DD floor; entries before this date are hidden.
  fromDate: { type: String, default: null },
});

const photosStore = usePhotosStore();

const ROWS = [
  { key: 'front', label: 'Front' },
  { key: 'side', label: 'Side' },
  { key: 'back', label: 'Back' },
  { key: 'other', label: 'Other' },
];

// Selection state — tap first thumb = "before", second = "after" → open compare.
const selected = ref(null); // first tapped photo
const viewerOpen = ref(false);
const viewerIndex = ref(0);
const viewerList = ref([]);

const compareOpen = ref(false);
const comparePair = ref({ before: null, after: null });

const photosByAngle = computed(() => {
  const out = {};
  for (const r of ROWS) out[r.key] = [];
  for (const p of photosStore.entries) {
    if (props.fromDate && p.date < props.fromDate) continue;
    if (out[p.angle]) out[p.angle].push(p);
  }
  // Oldest → newest within each row so eyes track time left-to-right.
  for (const k of Object.keys(out)) {
    out[k].sort((a, b) => a.date.localeCompare(b.date));
  }
  return out;
});

const hasAny = computed(() => Object.values(photosByAngle.value).some((arr) => arr.length > 0));

function handleThumbClick(photo) {
  // Clicking a single photo opens the viewer. Cmd/Ctrl/Shift-click (or double-
  // click from the "selected" state) picks it as the second photo in a compare.
  if (!selected.value) {
    selected.value = photo;
    return;
  }
  if (selected.value._id === photo._id) {
    // Re-tap deselects → open single viewer instead.
    selected.value = null;
    openViewer(photo);
    return;
  }
  // Order the pair chronologically so "before" is always the older photo.
  const pair = selected.value.date <= photo.date
    ? { before: selected.value, after: photo }
    : { before: photo, after: selected.value };
  comparePair.value = pair;
  compareOpen.value = true;
  selected.value = null;
}

function clearSelection() {
  selected.value = null;
}

function openViewer(photo) {
  const list = photosByAngle.value[photo.angle] || [];
  const idx = list.findIndex((p) => p._id === photo._id);
  viewerList.value = list;
  viewerIndex.value = Math.max(0, idx);
  viewerOpen.value = true;
}

function formatShort(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function isSelected(photo) {
  return selected.value?._id === photo._id;
}
</script>

<template>
  <div class="timeline-card">
    <div class="tl-header">
      <h3>Progress Photos</h3>
      <span v-if="selected" class="tl-pick">
        Pick a second photo to compare…
        <button class="tl-cancel" @click="clearSelection">cancel</button>
      </span>
    </div>

    <div v-if="!hasAny" class="tl-empty">
      No photos yet. Add one from the
      <router-link :to="{ name: 'log', hash: '#photos' }">Log</router-link>
      page.
    </div>

    <div v-else class="tl-rows">
      <div
        v-for="row in ROWS"
        :key="row.key"
        v-show="photosByAngle[row.key].length > 0"
        class="tl-row"
      >
        <div class="tl-row-label">{{ row.label }}</div>
        <div class="tl-strip">
          <button
            v-for="p in photosByAngle[row.key]"
            :key="p._id"
            class="tl-thumb"
            :class="{ selected: isSelected(p) }"
            :title="`${row.label} — ${p.date}`"
            @click="handleThumbClick(p)"
          >
            <img
              :src="p.thumbUrl"
              :alt="`${row.label} ${p.date}`"
              loading="lazy"
            />
            <span class="tl-date">{{ formatShort(p.date) }}</span>
          </button>
        </div>
      </div>
    </div>

    <p v-if="hasAny" class="tl-hint">
      Tap two photos to compare with a slider.
    </p>

    <PhotoCompareModal
      :open="compareOpen"
      :before="comparePair.before"
      :after="comparePair.after"
      @close="compareOpen = false"
    />
    <PhotoViewerModal
      :open="viewerOpen"
      :photos="viewerList"
      :start-index="viewerIndex"
      @close="viewerOpen = false"
    />
  </div>
</template>

<style scoped>
.timeline-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-medium);
  padding: var(--space-5);
  margin-bottom: var(--space-4);
}
.tl-header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}
.tl-header h3 {
  margin: 0;
  font-size: var(--font-size-m);
  flex: 1;
}
.tl-pick {
  font-size: var(--font-size-xs);
  color: var(--primary);
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.tl-cancel {
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: var(--font-size-xs);
  text-decoration: underline;
  padding: 0;
}
.tl-cancel:hover { color: var(--text); }

.tl-empty {
  color: var(--text-tertiary);
  font-size: var(--font-size-s);
  text-align: center;
  padding: var(--space-4) 0;
}

.tl-rows {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.tl-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}
.tl-row-label {
  width: 48px;
  flex-shrink: 0;
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  font-weight: var(--font-weight-bold);
  color: var(--text-secondary);
}

.tl-strip {
  display: flex;
  gap: var(--space-1);
  overflow-x: auto;
  padding: 0.15rem 0 var(--space-1);
  flex: 1;
  min-width: 0;
  scrollbar-width: thin;
}
.tl-thumb {
  position: relative;
  flex-shrink: 0;
  width: 64px;
  aspect-ratio: 3 / 4;
  border-radius: var(--radius-small);
  overflow: hidden;
  border: 2px solid transparent;
  background: var(--bg);
  padding: 0;
  cursor: pointer;
  transition: transform var(--transition-fast), border-color var(--transition-fast);
}
.tl-thumb:hover { transform: translateY(-2px); }
.tl-thumb.selected {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-ring);
}
.tl-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.tl-date {
  position: absolute;
  bottom: 2px;
  left: 2px;
  right: 2px;
  font-size: 9px;
  color: #fff;
  text-align: center;
  background: rgba(0, 0, 0, 0.55);
  padding: 1px 3px;
  border-radius: var(--radius-small);
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
}

.tl-hint {
  margin: var(--space-3) 0 0;
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  text-align: center;
}
</style>
