<script setup>
import { onMounted, ref, useTemplateRef } from 'vue';

const props = defineProps({
  // GIS button config — see https://developers.google.com/identity/gsi/web/reference/js-reference#GsiButtonConfiguration
  text: { type: String, default: 'continue_with' },
});
const emit = defineEmits(['credential', 'error']);

const target = useTemplateRef('target');
const unavailable = ref(false);

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

// Cache the script load promise across components/mounts so we only inject one
// <script> tag per page.
let scriptPromise = null;
function loadScript() {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve();
    const existing = document.querySelector(`script[src="${SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('GIS script failed to load')));
      return;
    }
    const s = document.createElement('script');
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('GIS script failed to load'));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

onMounted(async () => {
  if (!CLIENT_ID) {
    unavailable.value = true;
    return;
  }
  try {
    await loadScript();
    window.google.accounts.id.initialize({
      client_id: CLIENT_ID,
      callback: (response) => {
        if (response?.credential) emit('credential', response.credential);
        else emit('error', new Error('No credential returned from Google'));
      },
      // We only need the popup-button flow on these pages, not the One Tap
      // bubble; leaving auto_select off prevents surprise re-auth.
      auto_select: false,
      ux_mode: 'popup',
    });
    if (target.value) {
      window.google.accounts.id.renderButton(target.value, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: props.text,
        shape: 'rectangular',
        logo_alignment: 'left',
        width: target.value.clientWidth || 320,
      });
    }
  } catch (err) {
    unavailable.value = true;
    emit('error', err);
  }
});
</script>

<template>
  <div class="google-btn">
    <div ref="target" class="google-btn-target"></div>
    <p v-if="unavailable" class="google-btn-fallback">
      Google sign-in is unavailable.
    </p>
  </div>
</template>

<style scoped>
.google-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
}
.google-btn-target {
  width: 100%;
  display: flex;
  justify-content: center;
  min-height: 44px;
}
.google-btn-fallback {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  margin: var(--space-2) 0 0;
}
</style>
