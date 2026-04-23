<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';

const props = defineProps({
  open: { type: Boolean, required: true },
  before: { type: Object, default: null },
  after: { type: Object, default: null },
});
const emit = defineEmits(['close']);

// Split position, 0–100 (% of frame width from the left).
const split = ref(50);
const dragging = ref(false);
const frameEl = ref(null);

function setSplitFromEvent(event) {
  if (!frameEl.value) return;
  const rect = frameEl.value.getBoundingClientRect();
  const x = (event.touches ? event.touches[0].clientX : event.clientX) - rect.left;
  const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
  split.value = pct;
}

function onDown(event) {
  dragging.value = true;
  setSplitFromEvent(event);
}
function onMove(event) {
  if (!dragging.value) return;
  event.preventDefault();
  setSplitFromEvent(event);
}
function onUp() {
  dragging.value = false;
}

watch(() => props.open, (isOpen) => {
  if (isOpen) split.value = 50;
});

function onKey(e) {
  if (!props.open) return;
  if (e.key === 'Escape') emit('close');
  else if (e.key === 'ArrowLeft') split.value = Math.max(0, split.value - 2);
  else if (e.key === 'ArrowRight') split.value = Math.min(100, split.value + 2);
}

onMounted(() => {
  window.addEventListener('keydown', onKey);
  window.addEventListener('mouseup', onUp);
  window.addEventListener('touchend', onUp);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('touchmove', onMove, { passive: false });
});
onUnmounted(() => {
  window.removeEventListener('keydown', onKey);
  window.removeEventListener('mouseup', onUp);
  window.removeEventListener('touchend', onUp);
  window.removeEventListener('mousemove', onMove);
  window.removeEventListener('touchmove', onMove);
});

function formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

const dayDiff = computed(() => {
  if (!props.before || !props.after) return null;
  const toMs = (s) => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d).getTime();
  };
  return Math.round(Math.abs(toMs(props.after.date) - toMs(props.before.date)) / 86400000);
});

// clip-path keeps both images at the frame's full size, so the split divider
// slides across without either image shifting or rescaling.
const beforeClip = computed(() => `inset(0 ${100 - split.value}% 0 0)`);
</script>

<template>
  <div v-if="open && before && after" class="cmp-overlay" @click.self="emit('close')">
    <button class="cmp-close" @click="emit('close')">×</button>

    <div class="cmp-shell" @click.stop>
      <div class="cmp-heading">
        <span class="cmp-angle">{{ before.angle }}</span>
        <span class="cmp-dates">
          {{ formatDate(before.date) }} → {{ formatDate(after.date) }}
          <span v-if="dayDiff != null" class="cmp-days">({{ dayDiff }} days)</span>
        </span>
      </div>

      <div
        ref="frameEl"
        class="cmp-frame"
        @mousedown="onDown"
        @touchstart="onDown"
      >
        <img class="cmp-img" :src="after.url" alt="After" draggable="false" />
        <img
          class="cmp-img cmp-before"
          :src="before.url"
          :style="{ clipPath: beforeClip }"
          alt="Before"
          draggable="false"
        />
        <div class="cmp-divider" :style="{ left: split + '%' }">
          <div class="cmp-handle">⇔</div>
        </div>
        <div class="cmp-tag tag-before">Before</div>
        <div class="cmp-tag tag-after">After</div>
      </div>

      <div class="cmp-hint">Drag the handle — or use ← → arrow keys.</div>
    </div>
  </div>
</template>

<style scoped>
.cmp-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.9);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-6);
}
.cmp-close {
  position: absolute;
  top: var(--space-4);
  right: var(--space-4);
  width: 36px;
  height: 36px;
  border-radius: var(--radius-pill);
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
  border: none;
  font-size: var(--font-size-xl);
  line-height: 1;
  cursor: pointer;
}
.cmp-close:hover { background: rgba(255, 255, 255, 0.3); }

.cmp-shell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  max-width: min(92vw, 980px);
  width: 100%;
}
.cmp-heading {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  color: rgba(255, 255, 255, 0.92);
  font-size: var(--font-size-s);
}
.cmp-angle {
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  font-weight: var(--font-weight-bold);
  font-size: var(--font-size-xs);
  background: rgba(255, 255, 255, 0.18);
  color: #fff;
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-pill);
}
.cmp-dates { font-variant-numeric: tabular-nums; }
.cmp-days { color: rgba(255, 255, 255, 0.55); margin-left: var(--space-1); }

.cmp-frame {
  position: relative;
  width: 100%;
  max-height: 78vh;
  aspect-ratio: 3 / 4;
  background: #000;
  border-radius: var(--radius-small);
  overflow: hidden;
  cursor: ew-resize;
  user-select: none;
  touch-action: none;
}
.cmp-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #000;
}
.cmp-divider {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: rgba(255, 255, 255, 0.85);
  transform: translateX(-1px);
  pointer-events: none;
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
}
.cmp-handle {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 36px;
  height: 36px;
  border-radius: var(--radius-pill);
  background: #fff;
  color: #111;
  font-size: var(--font-size-s);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: var(--font-weight-bold);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
}
.cmp-tag {
  position: absolute;
  top: var(--space-2);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-pill);
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  font-weight: var(--font-weight-bold);
  pointer-events: none;
}
.tag-before { left: var(--space-2); }
.tag-after { right: var(--space-2); }

.cmp-hint {
  color: rgba(255, 255, 255, 0.55);
  font-size: var(--font-size-xs);
}
</style>
