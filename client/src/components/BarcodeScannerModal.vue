<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';

const emit = defineEmits(['detected', 'close']);

const videoRef = ref(null);
const error = ref('');
const devices = ref([]);
const deviceId = ref(null);

const hints = new Map();
hints.set(DecodeHintType.POSSIBLE_FORMATS, [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.ITF,
]);
const reader = new BrowserMultiFormatReader(hints);
let controls = null;

async function start(id) {
  try {
    if (controls) { controls.stop(); controls = null; }
    controls = await reader.decodeFromVideoDevice(id || undefined, videoRef.value, (result, err, ctrl) => {
      if (result) {
        ctrl.stop();
        controls = null;
        emit('detected', result.getText());
      }
    });
  } catch (e) {
    error.value = e?.message || 'Unable to start camera';
  }
}

onMounted(async () => {
  try {
    // Prompt for camera perm first so we can list labeled devices.
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    stream.getTracks().forEach((t) => t.stop());
    const all = await BrowserMultiFormatReader.listVideoInputDevices();
    devices.value = all;
    // Prefer rear camera if label hints at it.
    const rear = all.find((d) => /back|rear|environment/i.test(d.label));
    deviceId.value = rear?.deviceId || all[0]?.deviceId || null;
    await start(deviceId.value);
  } catch (e) {
    error.value = e?.message || 'Camera access denied';
  }
});

onBeforeUnmount(() => {
  if (controls) { controls.stop(); controls = null; }
});

function switchCamera(e) {
  deviceId.value = e.target.value;
  start(deviceId.value);
}
</script>

<template>
  <div class="scanner-overlay" @click.self="emit('close')">
    <div class="scanner-card">
      <div class="scanner-header">
        <h3>Scan Barcode</h3>
        <button class="close-btn" @click="emit('close')">×</button>
      </div>
      <div class="video-wrap">
        <video ref="videoRef" autoplay playsinline muted></video>
        <div class="reticle"></div>
      </div>
      <p v-if="error" class="scanner-error">{{ error }}</p>
      <div v-if="devices.length > 1" class="camera-select">
        <label>Camera</label>
        <select :value="deviceId" @change="switchCamera">
          <option v-for="d in devices" :key="d.deviceId" :value="d.deviceId">
            {{ d.label || `Camera ${d.deviceId.slice(0, 6)}` }}
          </option>
        </select>
      </div>
      <p class="hint">Point the camera at a product barcode.</p>
    </div>
  </div>
</template>

<style scoped>
.scanner-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: var(--space-4);
}
.scanner-card {
  background: var(--surface);
  border-radius: var(--radius-medium);
  width: 100%;
  max-width: 480px;
  padding: var(--space-4);
  color: var(--text);
}
.scanner-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-3);
}
.scanner-header h3 { margin: 0; font-size: var(--font-size-m); }
.close-btn {
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: var(--font-size-xl);
  cursor: pointer;
  line-height: 1;
}
.close-btn:hover { color: var(--text); }
.video-wrap {
  position: relative;
  background: #000;
  border-radius: var(--radius-small);
  overflow: hidden;
  aspect-ratio: 4/3;
}
.video-wrap video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.reticle {
  position: absolute;
  left: 10%;
  right: 10%;
  top: 40%;
  height: 20%;
  border: 2px solid rgba(255, 80, 80, 0.85);
  border-radius: var(--radius-small);
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.25);
  pointer-events: none;
}
.scanner-error {
  color: var(--danger, #d33);
  font-size: var(--font-size-s);
  margin: var(--space-3) 0 0;
}
.camera-select {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-3);
  font-size: var(--font-size-s);
  color: var(--text-secondary);
}
.camera-select select {
  flex: 1;
  padding: var(--space-1) var(--space-2);
  font-size: var(--font-size-s);
}
.hint {
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
  margin: var(--space-2) 0 0;
  text-align: center;
}
</style>
