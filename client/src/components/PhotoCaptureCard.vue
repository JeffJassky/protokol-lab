<script setup>
import { ref, computed } from 'vue';
import { usePhotosStore } from '../stores/photos.js';
import { useUpgradeModalStore } from '../stores/upgradeModal.js';
import { usePlanLimits } from '../composables/usePlanLimits.js';
import PhotoViewerModal from './PhotoViewerModal.vue';
import UpgradeBadge from './UpgradeBadge.vue';

const props = defineProps({
  date: { type: String, required: true },
});

const photosStore = usePhotosStore();
const upgradeModal = useUpgradeModalStore();
const planLimits = usePlanLimits();

// Photos are capped per calendar month. Pre-flight check before any
// upload so we don't sign URLs / push bytes / hit S3 unnecessarily.
const photoCap = computed(() => planLimits.storageCap('photosPerMonth'));
const photosAtCap = computed(
  () => !planLimits.canAddStorage('photosPerMonth', photosStore.currentMonthCount),
);
const photoUpgradeTier = computed(() => {
  const target = planLimits.planRequiredFor({ storageKey: 'photosPerMonth' });
  return target?.id || null;
});

const ANGLES = [
  { key: 'front', label: 'Front' },
  { key: 'side', label: 'Side' },
  { key: 'back', label: 'Back' },
];

// We key a hidden file input per angle so the camera/file picker opens on tap
// without any extra intermediate UI.
const fileInputs = ref({});
const errorMsg = ref('');
const viewerOpen = ref(false);
const viewerIndex = ref(0);

const slots = computed(() =>
  ANGLES.map((a) => ({
    ...a,
    entry: photosStore.forDateAngle(props.date, a.key),
  })),
);

// All photos for the current date, sorted front/side/back/other — used by the
// viewer so left/right arrows walk through the day's shots.
const dayPhotos = computed(() => {
  const order = ['front', 'side', 'back', 'other'];
  return [...photosStore.forDate(props.date)].sort(
    (a, b) => order.indexOf(a.angle) - order.indexOf(b.angle),
  );
});

function triggerPick(angle) {
  if (photosAtCap.value) {
    upgradeModal.openForGate({
      limitKey: 'photosPerMonth',
      used: photosStore.currentMonthCount,
    });
    return;
  }
  const el = fileInputs.value[angle];
  if (el) el.click();
}

async function onFile(angle, event) {
  const file = event.target.files?.[0];
  event.target.value = ''; // allow re-selecting the same file
  if (!file) return;
  errorMsg.value = '';
  try {
    await photosStore.uploadPhoto(file, { date: props.date, angle });
  } catch (err) {
    errorMsg.value = err.message || 'Upload failed';
  }
}

function openViewer(entry) {
  const idx = dayPhotos.value.findIndex((p) => p._id === entry._id);
  viewerIndex.value = Math.max(0, idx);
  viewerOpen.value = true;
}

async function handleDelete(entry, event) {
  event.stopPropagation();
  if (!confirm(`Delete this ${entry.angle} photo?`)) return;
  try {
    await photosStore.deletePhoto(entry._id);
  } catch (err) {
    errorMsg.value = err.message || 'Delete failed';
  }
}
</script>

<template>
  <div class="photo-card">
    <div class="photo-header">
      <h3>
        Photos
        <UpgradeBadge
          v-if="photosAtCap && photoUpgradeTier"
          :tier="photoUpgradeTier"
          limit-key="photosPerMonth"
          clickable
        />
      </h3>
      <span v-if="photosStore.uploading" class="card-sub">uploading…</span>
    </div>
    <p class="hint">
      Snap a front, side, and back shot whenever you can. Consistency beats frequency.
    </p>
    <p v-if="photosAtCap" class="hint" style="color: var(--text-tertiary)">
      <template v-if="photoCap === 1">
        You've used your photo for this month. Resets at the start of next month.
      </template>
      <template v-else>
        You've used {{ photosStore.currentMonthCount }} of {{ photoCap }} photos this month.
      </template>
    </p>

    <div class="photo-slots">
      <div
        v-for="slot in slots"
        :key="slot.key"
        class="photo-slot"
        :class="{ filled: !!slot.entry }"
        @click="slot.entry ? openViewer(slot.entry) : triggerPick(slot.key)"
      >
        <img
          v-if="slot.entry"
          :src="slot.entry.thumbUrl"
          :alt="`${slot.label} progress photo`"
          loading="lazy"
        />
        <span v-else class="photo-plus">+</span>
        <span class="photo-slot-label">{{ slot.label }}</span>
        <button
          v-if="slot.entry"
          class="photo-del"
          title="Delete"
          @click="handleDelete(slot.entry, $event)"
        >×</button>
        <input
          :ref="(el) => (fileInputs[slot.key] = el)"
          type="file"
          accept="image/*"
          capture="environment"
          class="file-input"
          @change="onFile(slot.key, $event)"
        />
      </div>
    </div>

    <p v-if="errorMsg" class="photo-error">{{ errorMsg }}</p>

    <PhotoViewerModal
      :open="viewerOpen"
      :photos="dayPhotos"
      :start-index="viewerIndex"
      @close="viewerOpen = false"
    />
  </div>
</template>

<style scoped>
.photo-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-medium);
  padding: var(--space-3) var(--space-4);
}
.photo-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-1);
}
.photo-header h3 {
  margin: 0;
  flex: 1;
  font-size: var(--font-size-m);
}
.hint {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  margin: 0 0 var(--space-3);
}
.card-sub {
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  color: var(--text-secondary);
  font-weight: var(--font-weight-medium);
}

.photo-slots {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-1);
}
.photo-slot {
  position: relative;
  aspect-ratio: 3 / 4;
  background: var(--bg);
  border: 1px dashed var(--border);
  border-radius: var(--radius-small);
  cursor: pointer;
  overflow: hidden;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: var(--space-1);
  transition: border-color var(--transition-base), background var(--transition-base);
}
.photo-slot:hover { border-color: var(--primary); }
.photo-slot.filled { border-style: solid; border-color: var(--border); }
.photo-slot img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.photo-plus {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: var(--font-size-xl);
  color: var(--text-secondary);
  line-height: 1;
  font-weight: var(--font-weight-light);
}
.photo-slot-label {
  position: relative;
  z-index: 1;
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  font-weight: var(--font-weight-bold);
  color: var(--text-secondary);
  background: var(--surface);
  padding: 0.1rem 0.4rem;
  border-radius: var(--radius-small);
}
.photo-slot.filled .photo-slot-label {
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
}
.photo-del {
  position: absolute;
  top: 3px;
  right: 3px;
  width: 20px;
  height: 20px;
  border-radius: var(--radius-pill);
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  border: none;
  font-size: var(--font-size-s);
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  opacity: 0;
  transition: opacity var(--transition-fast);
}
.photo-slot:hover .photo-del { opacity: 1; }
.photo-del:hover { background: var(--danger); }

.file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.photo-error {
  color: var(--danger);
  font-size: var(--font-size-xs);
  margin: var(--space-1) 0 0;
}
</style>
