<script setup>
import { ref, watch, computed, onMounted, onUnmounted } from 'vue';

const props = defineProps({
  open: { type: Boolean, required: true },
  photos: { type: Array, required: true },
  startIndex: { type: Number, default: 0 },
});
const emit = defineEmits(['close']);

const index = ref(0);

watch(
  () => [props.open, props.startIndex],
  ([isOpen, start]) => {
    if (isOpen) index.value = Math.max(0, Math.min(start, props.photos.length - 1));
  },
);

const current = computed(() => props.photos[index.value] || null);

function prev() {
  if (index.value > 0) index.value -= 1;
}
function next() {
  if (index.value < props.photos.length - 1) index.value += 1;
}
function close() {
  emit('close');
}

function onKey(e) {
  if (!props.open) return;
  if (e.key === 'Escape') close();
  else if (e.key === 'ArrowLeft') prev();
  else if (e.key === 'ArrowRight') next();
}

onMounted(() => window.addEventListener('keydown', onKey));
onUnmounted(() => window.removeEventListener('keydown', onKey));

function formatDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
}
</script>

<template>
  <div v-if="open && current" class="viewer-overlay" @click.self="close">
    <button class="viewer-close" @click="close">×</button>

    <button
      v-if="index > 0"
      class="viewer-nav prev"
      @click.stop="prev"
      aria-label="Previous photo"
    >‹</button>
    <button
      v-if="index < photos.length - 1"
      class="viewer-nav next"
      @click.stop="next"
      aria-label="Next photo"
    >›</button>

    <figure class="viewer-frame" @click.stop>
      <img :src="current.url" :alt="`${current.angle} photo for ${current.date}`" />
      <figcaption>
        <span class="cap-angle">{{ current.angle }}</span>
        <span class="cap-date">{{ formatDate(current.date) }}</span>
        <span class="cap-count">{{ index + 1 }} / {{ photos.length }}</span>
      </figcaption>
    </figure>
  </div>
</template>

<style scoped>
.viewer-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.88);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
}
.viewer-close {
  position: absolute;
  top: 1rem;
  right: 1rem;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
  border: none;
  font-size: 1.4rem;
  line-height: 1;
  cursor: pointer;
}
.viewer-close:hover { background: rgba(255, 255, 255, 0.3); }

.viewer-nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
  border: none;
  font-size: 1.8rem;
  line-height: 1;
  cursor: pointer;
}
.viewer-nav.prev { left: 1rem; }
.viewer-nav.next { right: 1rem; }
.viewer-nav:hover { background: rgba(255, 255, 255, 0.3); }

.viewer-frame {
  margin: 0;
  max-width: min(92vw, 1100px);
  max-height: 92vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
}
.viewer-frame img {
  max-width: 100%;
  max-height: 84vh;
  object-fit: contain;
  border-radius: 6px;
  background: #000;
}
.viewer-frame figcaption {
  display: flex;
  align-items: center;
  gap: 1rem;
  color: rgba(255, 255, 255, 0.85);
  font-size: 0.85rem;
}
.cap-angle {
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 600;
  font-size: 0.72rem;
  color: #fff;
}
.cap-count {
  font-variant-numeric: tabular-nums;
  opacity: 0.65;
}
</style>
