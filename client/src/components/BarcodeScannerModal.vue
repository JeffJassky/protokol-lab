<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { isNativePlatform } from '../api/auth-token.js';

const emit = defineEmits(['detected', 'close']);

const videoRef = ref(null);
const error = ref('');
const devices = ref([]);
const deviceId = ref(null);
// On native we hide the modal chrome — the OS scanner is fullscreen and
// shows its own UI. We still mount the component so the parent's
// `<BarcodeScannerModal>` v-if logic stays unchanged; we just don't render
// the in-app camera surface.
const showWebUi = ref(!isNativePlatform());

let reader = null;
let controls = null;

async function startWebScanner() {
  try {
    // Lazy-import ZXing only when actually using the web path. Keeps the
    // ~150 kB cost out of the native bundle entirely.
    const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
      import('@zxing/browser'),
      import('@zxing/library'),
    ]);
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
    reader = new BrowserMultiFormatReader(hints);

    // Prompt for camera perm first so we can list labeled devices.
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    stream.getTracks().forEach((t) => t.stop());
    const all = await BrowserMultiFormatReader.listVideoInputDevices();
    devices.value = all;
    const rear = all.find((d) => /back|rear|environment/i.test(d.label));
    deviceId.value = rear?.deviceId || all[0]?.deviceId || null;
    await startWebDevice(deviceId.value);
  } catch (e) {
    error.value = e?.message || 'Camera access denied';
  }
}

async function startWebDevice(id) {
  if (!reader) return;
  try {
    if (controls) { controls.stop(); controls = null; }
    controls = await reader.decodeFromVideoDevice(id || undefined, videoRef.value, (result, _err, ctrl) => {
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

async function startNativeScanner() {
  try {
    // ML Kit native scanner — uses the OS camera with a system-rendered
    // overlay. Returns immediately on a successful scan or on cancel; no
    // in-app camera surface needed. Plugin loads only on native.
    const { BarcodeScanner } = await import('@capacitor-mlkit/barcode-scanning');

    // Probe / install the scanning module on Android (no-op on iOS where
    // ML Kit is bundled). Best-effort: failure here surfaces in the .scan()
    // call below.
    try {
      const supported = await BarcodeScanner.isSupported();
      if (!supported.supported) {
        error.value = 'Barcode scanning is not supported on this device.';
        return;
      }
      const moduleAvailable = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable?.();
      if (moduleAvailable && !moduleAvailable.available) {
        await BarcodeScanner.installGoogleBarcodeScannerModule?.();
      }
    } catch (_e) {
      // Older plugin versions skip the module check; ignore.
    }

    const perm = await BarcodeScanner.checkPermissions();
    if (perm.camera !== 'granted') {
      const req = await BarcodeScanner.requestPermissions();
      if (req.camera !== 'granted') {
        error.value = 'Camera permission denied.';
        return;
      }
    }

    const { barcodes } = await BarcodeScanner.scan();
    const code = barcodes?.[0]?.rawValue || barcodes?.[0]?.displayValue;
    if (code) emit('detected', code);
    else emit('close');
  } catch (e) {
    // User cancellation surfaces as a thrown error on some platforms.
    const msg = String(e?.message || e || '').toLowerCase();
    if (msg.includes('cancel')) {
      emit('close');
      return;
    }
    error.value = e?.message || 'Scan failed';
  }
}

onMounted(() => {
  if (isNativePlatform()) {
    startNativeScanner();
  } else {
    startWebScanner();
  }
});

onBeforeUnmount(() => {
  if (controls) { controls.stop(); controls = null; }
});

function switchCamera(e) {
  deviceId.value = e.target.value;
  startWebDevice(deviceId.value);
}
</script>

<template>
  <div v-if="showWebUi" class="scanner-overlay" @click.self="emit('close')">
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
  <!-- Native: ML Kit handles all UI — the modal renders nothing while the
       OS scanner is open. If a permission / module install fails, surface
       the error inline so the parent can react. -->
  <div v-else-if="error" class="scanner-error-toast" role="alert">
    {{ error }}
    <button class="close-btn" @click="emit('close')">Close</button>
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
.scanner-error-toast {
  position: fixed;
  inset: auto 0 var(--space-4) 0;
  margin: 0 auto;
  max-width: 360px;
  background: var(--surface);
  border: 1px solid var(--danger, #d33);
  border-radius: var(--radius-medium);
  padding: var(--space-3);
  color: var(--text);
  font-size: var(--font-size-s);
  display: flex;
  align-items: center;
  gap: var(--space-2);
  z-index: 1001;
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
