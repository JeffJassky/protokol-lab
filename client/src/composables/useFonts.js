import { watch } from 'vue';
import { useStorage } from '@vueuse/core';

const SYSTEM_SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const SYSTEM_MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

export const DISPLAY_FONTS = [
  { name: 'System', family: SYSTEM_SANS, google: null },
  { name: 'Inter', family: 'Inter', google: 'Inter:wght@400;500;600;700' },
  { name: 'Space Grotesk', family: 'Space Grotesk', google: 'Space+Grotesk:wght@400;500;600;700' },
  { name: 'Poppins', family: 'Poppins', google: 'Poppins:wght@400;500;600;700' },
  { name: 'Montserrat', family: 'Montserrat', google: 'Montserrat:wght@400;500;600;700' },
  { name: 'Raleway', family: 'Raleway', google: 'Raleway:wght@400;500;600;700' },
  { name: 'Oswald', family: 'Oswald', google: 'Oswald:wght@400;500;600;700' },
  { name: 'Bebas Neue', family: 'Bebas Neue', google: 'Bebas+Neue' },
  { name: 'Playfair Display', family: 'Playfair Display', google: 'Playfair+Display:wght@400;600;700' },
  { name: 'Merriweather', family: 'Merriweather', google: 'Merriweather:wght@400;700' },
  { name: 'Lora', family: 'Lora', google: 'Lora:wght@400;500;600;700' },
  { name: 'DM Serif Display', family: 'DM Serif Display', google: 'DM+Serif+Display' },
];

export const BODY_FONTS = [
  { name: 'System', family: SYSTEM_SANS, google: null },
  { name: 'Inter', family: 'Inter', google: 'Inter:wght@400;500;600;700' },
  { name: 'Roboto', family: 'Roboto', google: 'Roboto:wght@400;500;700' },
  { name: 'Open Sans', family: 'Open Sans', google: 'Open+Sans:wght@400;500;600;700' },
  { name: 'Lato', family: 'Lato', google: 'Lato:wght@400;700' },
  { name: 'Nunito', family: 'Nunito', google: 'Nunito:wght@400;500;600;700' },
  { name: 'Source Sans 3', family: 'Source Sans 3', google: 'Source+Sans+3:wght@400;500;600;700' },
  { name: 'Work Sans', family: 'Work Sans', google: 'Work+Sans:wght@400;500;600;700' },
  { name: 'DM Sans', family: 'DM Sans', google: 'DM+Sans:wght@400;500;600;700' },
  { name: 'Noto Sans', family: 'Noto Sans', google: 'Noto+Sans:wght@400;500;700' },
];

export const MONO_FONTS = [
  { name: 'System', family: SYSTEM_MONO, google: null },
  { name: 'JetBrains Mono', family: 'JetBrains Mono', google: 'JetBrains+Mono:wght@400;500;700' },
  { name: 'Fira Code', family: 'Fira Code', google: 'Fira+Code:wght@400;500;700' },
  { name: 'Source Code Pro', family: 'Source Code Pro', google: 'Source+Code+Pro:wght@400;500;700' },
  { name: 'IBM Plex Mono', family: 'IBM Plex Mono', google: 'IBM+Plex+Mono:wght@400;500;700' },
  { name: 'Roboto Mono', family: 'Roboto Mono', google: 'Roboto+Mono:wght@400;500;700' },
  { name: 'Space Mono', family: 'Space Mono', google: 'Space+Mono:wght@400;700' },
  { name: 'Inconsolata', family: 'Inconsolata', google: 'Inconsolata:wght@400;500;700' },
  { name: 'Ubuntu Mono', family: 'Ubuntu Mono', google: 'Ubuntu+Mono:wght@400;700' },
];

const SLOTS = { display: DISPLAY_FONTS, body: BODY_FONTS, mono: MONO_FONTS };

function ensurePreconnect() {
  if (document.getElementById('gf-preconnect-1')) return;
  const a = document.createElement('link');
  a.id = 'gf-preconnect-1';
  a.rel = 'preconnect';
  a.href = 'https://fonts.googleapis.com';
  document.head.appendChild(a);
  const b = document.createElement('link');
  b.id = 'gf-preconnect-2';
  b.rel = 'preconnect';
  b.href = 'https://fonts.gstatic.com';
  b.crossOrigin = 'anonymous';
  document.head.appendChild(b);
}

function apply(slot, opt) {
  ensurePreconnect();
  const linkId = `gf-${slot}`;
  let link = document.getElementById(linkId);
  if (!opt.google) {
    link?.remove();
  } else {
    if (!link) {
      link = document.createElement('link');
      link.id = linkId;
      link.rel = 'stylesheet';
      document.head.appendChild(link);
    }
    link.href = `https://fonts.googleapis.com/css2?family=${opt.google}&display=swap`;
  }
  const fallback = slot === 'mono' ? SYSTEM_MONO : SYSTEM_SANS;
  const value = opt.google ? `"${opt.family}", ${fallback}` : opt.family;
  document.documentElement.style.setProperty(`--font-${slot}`, value);
}

function sync(slot, name) {
  const opt = SLOTS[slot].find((f) => f.name === name) || SLOTS[slot][0];
  apply(slot, opt);
}

let started = false;
export function useFonts() {
  const display = useStorage('vt-font-display', 'Inter');
  const body = useStorage('vt-font-body', 'Inter');
  const mono = useStorage('vt-font-mono', 'JetBrains Mono');

  if (!started && typeof window !== 'undefined') {
    started = true;
    sync('display', display.value);
    sync('body', body.value);
    sync('mono', mono.value);
    watch(display, (v) => sync('display', v));
    watch(body, (v) => sync('body', v));
    watch(mono, (v) => sync('mono', v));
  }

  return { display, body, mono, DISPLAY_FONTS, BODY_FONTS, MONO_FONTS };
}
