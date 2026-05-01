<script setup>
import { ref, computed, watch, nextTick, onMounted } from 'vue';
import 'deep-chat';
import { useTheme } from '../composables/useTheme.js';
import { prepPhoto } from '../utils/imagePrep.js';
import { useAuthStore } from '../stores/auth.js';
import { usePlanLimits } from '../composables/usePlanLimits.js';
import { useUpgradeModalStore } from '../stores/upgradeModal.js';
import { useChatStarterStore } from '../stores/chatStarter.js';
import { renderChartsInHtml } from '../utils/chatChartRenderer.js';
import { nativeFetch } from '../api/index.js';

const authStore = useAuthStore();
const planLimits = usePlanLimits();
const upgradeModal = useUpgradeModalStore();
const chatStarter = useChatStarterStore();

const theme = useTheme();
const isDark = computed(() => theme.value === 'dark' || (theme.value === 'auto' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches));

const props = defineProps({
  open: Boolean,
});

const emit = defineEmits(['update:open']);

// deep-chat accepts up to 3 images per turn (matches the server multer cap).
// Both file inputs use `position: 'dropup-menu'` so they collapse into one
// `+` button next to the text field with a popup menu listing "Take Photo"
// (camera) and "Upload Photo" (file picker). Cleaner than two icons on
// opposite sides of the input.
const imagesConfig = {
  files: { acceptedFormats: 'image/*', maxNumberOfFiles: 3 },
  button: { position: 'dropup-menu' },
};
const cameraConfig = {
  files: { maxNumberOfFiles: 1 },
  button: { position: 'dropup-menu' },
};
const speechToTextConfig = {
  webSpeech: true,
  displayInterimResults: true,
  submitAfterSilence: 2000,
};
const introMessage = {
  text:
    "Hi! I can help you understand your nutrition, weight, symptoms, and health data. Snap a photo of your food and I'll calculate macros.",
};

// Photo-counter badge for plans with a finite lifetime image cap (Free is
// 0 today — counter shows the user has no allowance). Pulls the cap from
// plans.js so plan changes are reflected automatically; Unlimited (cap =
// Infinity) and any plan with no foodImageRecognition flag hide the badge.
const photosUsed = computed(() => authStore.user?.imageRecognitionCount || 0);
const photosAllowed = computed(() => {
  const cap = planLimits.chat.value?.imagesLifetime;
  return Number.isFinite(cap) ? cap : null;
});
const showPhotoCounter = computed(() => photosAllowed.value !== null);
function onUpgradeClick() {
  upgradeModal.openForGate({ featureKey: 'foodImageRecognition' });
}

// ── Thread state ──
const threads = ref([]);
const activeThreadId = ref(null);
const chatView = ref('list'); // 'list' | 'conversation'
const deepChatRef = ref(null);
const listInputText = ref('');
const pendingMessage = ref(null);
const visibleThreadCount = ref(8);
const renamingThreadId = ref(null);
const renameDraft = ref('');
const flyoutThreadId = ref(null);
const confirmingDeleteId = ref(null);

const DEFAULT_TITLE = 'New conversation';

const activeThread = computed(() =>
  threads.value.find((t) => t.id === activeThreadId.value) || null,
);

const sortedThreads = computed(() =>
  [...threads.value].sort((a, b) => b.updatedAt - a.updatedAt),
);

const visibleThreads = computed(() =>
  sortedThreads.value.slice(0, visibleThreadCount.value),
);

const hasMoreThreads = computed(() =>
  sortedThreads.value.length > visibleThreadCount.value,
);

// ── Deep-chat styles (theme-aware; deep-chat reads plain values, not CSS vars) ──
// Resolve theme tokens to literal values so deep-chat (which lives inside a
// shadow root) renders in the app's terminal-green palette + IBM Plex Mono
// instead of its indigo / system-sans defaults. Recomputes when the theme
// flips because we depend on `isDark`.
function readVar(name) {
  if (typeof window === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
const chatPalette = computed(() => {
  // Touch isDark so the computed re-runs when the theme toggles.
  void isDark.value;
  return {
    bg: readVar('--bg'),
    surface: readVar('--surface'),
    surfaceAlt: readVar('--surface-alt'),
    surfaceRaised: readVar('--surface-raised'),
    border: readVar('--border'),
    borderStrong: readVar('--border-strong'),
    text: readVar('--text'),
    textSecondary: readVar('--text-secondary'),
    textTertiary: readVar('--text-tertiary'),
    primary: readVar('--primary'),
    primaryHover: readVar('--primary-hover'),
    primarySoft: readVar('--primary-soft'),
    textOnPrimary: readVar('--text-on-primary'),
    danger: readVar('--danger'),
    fontBody: readVar('--font-body') || 'inherit',
    fontMono: readVar('--font-mono') || 'monospace',
    fontDisplay: readVar('--font-display') || 'inherit',
  };
});

const chatStyles = computed(() => ({ backgroundColor: chatPalette.value.surface }));
const inputAreaStyle = computed(() => ({
  backgroundColor: chatPalette.value.bg,
  borderTop: `1px solid ${chatPalette.value.border}`,
}));
const textInputStyle = computed(() => ({
  styles: {
    container: {
      backgroundColor: chatPalette.value.surface,
      border: `1px solid ${chatPalette.value.border}`,
      borderRadius: '0',
      color: chatPalette.value.text,
      fontFamily: chatPalette.value.fontBody,
    },
    text: { color: chatPalette.value.text, fontFamily: chatPalette.value.fontBody },
  },
  placeholder: {
    text: 'Ask anything about your data...',
    style: { color: chatPalette.value.textTertiary, fontFamily: chatPalette.value.fontBody },
  },
}));
// Custom up-arrow SVG for the submit button. Replaces deep-chat's default
// paper-plane (which doesn't fit the terminal aesthetic). Stroke uses
// currentColor so we can recolor via container `color` instead of duplicating
// every theme value into the markup.
const SUBMIT_ARROW_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="square" stroke-linejoin="miter"><path d="M12 19 L12 5 M5 12 L12 5 L19 12"/></svg>`;

const submitButtonStyle = computed(() => ({
  submit: {
    container: {
      default: {
        backgroundColor: chatPalette.value.primary,
        color: chatPalette.value.textOnPrimary,
        borderRadius: '0',
      },
      hover: { backgroundColor: chatPalette.value.primaryHover },
    },
    svg: {
      content: SUBMIT_ARROW_SVG,
      styles: { default: { filter: 'none' } },
    },
  },
  disabled: {
    container: {
      default: {
        backgroundColor: chatPalette.value.surfaceAlt,
        color: chatPalette.value.textTertiary,
        borderRadius: '0',
      },
    },
    svg: {
      content: SUBMIT_ARROW_SVG,
      styles: { default: { filter: 'none' } },
    },
  },
}));
const chatMessageStyles = computed(() => ({
  default: {
    user: {
      bubble: {
        backgroundColor: chatPalette.value.primary,
        color: chatPalette.value.textOnPrimary,
        maxWidth: '85%',
        borderRadius: '0',
        padding: '10px 14px',
        fontFamily: chatPalette.value.fontBody,
        fontSize: '13.5px',
        lineHeight: '1.55',
      },
    },
    ai: {
      bubble: {
        backgroundColor: 'transparent',
        color: chatPalette.value.text,
        border: 'none',
        maxWidth: '95%',
        overflowX: 'auto',
        padding: '4px 0',
        fontFamily: chatPalette.value.fontBody,
        fontSize: '13.5px',
        lineHeight: '1.6',
      },
    },
  },
}));

const shadowStyles = computed(() => {
  const p = chatPalette.value;
  return `
  * { font-family: ${p.fontBody}; line-height: 1.6; font-weight: 400; }
  body, .messages { color: ${p.text}; }
  p { margin: 0 0 0.6em; }
  p:last-child { margin-bottom: 0; }

  strong, b, th { font-weight: 700; color: ${p.text}; }
  em, i { font-style: italic; }

  h1, h2, h3, h4, h5, h6 {
    font-family: ${p.fontDisplay};
    font-weight: 700;
    letter-spacing: -0.01em;
    color: ${p.text};
    margin: 1em 0 0.4em;
    line-height: 1.25;
  }
  h1 { font-size: 18px; }
  h2 { font-size: 16px; }
  h3 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.08em; color: ${p.textSecondary}; }
  h4, h5, h6 { font-size: 13px; }

  ul, ol { margin: 0.4em 0 0.8em; padding-left: 1.4em; }
  li { margin: 0.15em 0; }

  a { color: ${p.primary}; text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 2px; }
  a:hover { color: ${p.primaryHover}; }

  hr { border: none; border-top: 1px solid ${p.border}; margin: 1em 0; }

  /* Inline code + code blocks */
  code, kbd, samp {
    font-family: ${p.fontMono};
    font-size: 0.92em;
    background: ${p.surfaceAlt};
    color: ${p.text};
    padding: 1px 5px;
    border: 1px solid ${p.border};
  }
  pre {
    font-family: ${p.fontMono};
    background: ${p.surfaceAlt};
    color: ${p.text};
    border: 1px solid ${p.border};
    padding: 10px 12px;
    margin: 0.6em 0;
    overflow-x: auto;
    font-size: 12.5px;
    line-height: 1.5;
  }
  pre code { background: none; border: none; padding: 0; font-size: inherit; }

  /* Inline charts emitted by the agent (\`\`\`chart fenced code blocks
     get post-processed into <figure class="chat-chart"> after streaming). */
  figure.chat-chart {
    margin: 0.8em 0;
    padding: 8px;
    border: 1px solid ${p.border};
    background: ${p.surface};
    border-radius: 4px;
  }
  figure.chat-chart img {
    display: block;
    width: 100%;
    height: auto;
    max-width: 100%;
  }
  figure.chat-chart figcaption {
    margin-top: 6px;
    font-size: 12px;
    color: ${p.textSecondary};
    text-align: center;
    font-family: ${p.fontDisplay};
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  figure.chat-chart.chat-chart-error {
    border-style: dashed;
    background: transparent;
    padding: 12px;
  }
  figure.chat-chart.chat-chart-error figcaption {
    color: ${p.danger || p.textSecondary};
    text-transform: none;
    letter-spacing: 0;
    font-family: ${p.fontBody};
    font-size: 11px;
  }

  blockquote {
    margin: 0.6em 0;
    padding: 4px 12px;
    border-left: 2px solid ${p.border};
    color: ${p.textSecondary};
    font-style: normal;
  }

  table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    font-size: 12.5px;
    margin: 0.8em 0;
    border: 1px solid ${p.border};
  }
  thead { background-color: ${p.surfaceAlt}; }
  th {
    padding: 6px 10px;
    text-align: left;
    font-family: ${p.fontDisplay};
    font-weight: 700;
    font-size: 10.5px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: ${p.textTertiary};
    white-space: nowrap;
    border-bottom: 1px solid ${p.border};
  }
  td {
    padding: 6px 10px;
    border-bottom: 1px solid ${p.border};
    color: ${p.text};
    font-variant-numeric: tabular-nums;
  }
  tbody tr:last-child td { border-bottom: none; }
  tr:hover td { background-color: ${p.surfaceAlt}; }

  /* Agent thought trail (collapsible step log) */
  details.agent-trail {
    border: 1px solid ${p.border};
    background: ${p.surfaceAlt};
    margin: 6px 0;
    font-size: 12px;
    font-family: ${p.fontMono};
  }
  details.agent-trail > summary {
    list-style: none;
    cursor: pointer;
    padding: 6px 10px;
    color: ${p.textSecondary};
    display: flex;
    align-items: center;
    gap: 8px;
    user-select: none;
  }
  details.agent-trail > summary:hover { color: ${p.text}; }
  details.agent-trail > summary::-webkit-details-marker { display: none; }
  details.agent-trail > summary::before {
    content: '▸';
    color: ${p.textTertiary};
    font-size: 10px;
    transition: transform 0.15s;
    display: inline-block;
  }
  details.agent-trail[open] > summary::before { transform: rotate(90deg); }
  details.agent-trail .trail-latest {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  details.agent-trail ol {
    list-style: none;
    margin: 0;
    padding: 4px 10px 8px 10px;
    border-top: 1px dashed ${p.border};
  }
  details.agent-trail li {
    padding: 3px 0 3px 22px;
    color: ${p.textSecondary};
    position: relative;
    line-height: 1.45;
  }
  details.agent-trail li .trail-icon {
    position: absolute;
    left: 0;
    width: 16px;
    text-align: center;
    color: ${p.textTertiary};
  }
  details.agent-trail li.trail-err { color: ${p.danger}; }
  details.agent-trail li.trail-err .trail-icon { color: ${p.danger}; }

  .agent-final { margin-top: 10px; }

  /* ── Meal proposal cards (food-image recognition) ───────────────────── */
  .meal-proposal {
    border: 1px solid ${p.border};
    background: ${p.surface};
    margin: 10px 0 4px;
    font-family: ${p.fontBody};
  }
  .meal-proposal .prop-header {
    padding: 6px 10px;
    background: ${p.surfaceAlt};
    border-bottom: 1px solid ${p.border};
    font-family: ${p.fontDisplay};
    font-size: 10.5px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: ${p.textSecondary};
    font-weight: 700;
  }
  .meal-proposal table.prop-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12.5px;
    margin: 0;
    border: none;
  }
  .meal-proposal table.prop-table td {
    padding: 6px 10px;
    border-bottom: 1px solid ${p.border};
    vertical-align: top;
  }
  .meal-proposal table.prop-table tbody tr:last-child td { border-bottom: none; }
  .meal-proposal .prop-portion { color: ${p.textSecondary}; font-size: 11.5px; white-space: nowrap; }
  .meal-proposal .prop-name { color: ${p.text}; font-size: 13px; }
  .meal-proposal .prop-portion-text { color: ${p.textSecondary}; font-size: 11px; margin-top: 2px; }
  .meal-proposal .prop-servings,
  .meal-proposal .prop-servings-static {
    white-space: nowrap;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  .meal-proposal .prop-servings-static { color: ${p.textSecondary}; }
  .meal-proposal .prop-servings { display: flex; align-items: center; gap: 2px; justify-content: center; }
  .meal-proposal .prop-servings button {
    width: 22px; height: 22px;
    border: 1px solid ${p.border};
    background: ${p.surface};
    color: ${p.text};
    cursor: pointer;
    font-size: 14px;
    line-height: 1;
    padding: 0;
    border-radius: 0;
    font-family: ${p.fontMono};
  }
  .meal-proposal .prop-servings button:hover { background: ${p.surfaceAlt}; }
  .meal-proposal .prop-servings input.prop-mult {
    width: 48px;
    text-align: center;
    border: 1px solid ${p.border};
    background: ${p.bg};
    color: ${p.text};
    padding: 2px 4px;
    font-family: ${p.fontMono};
    font-size: 12px;
    border-radius: 0;
    -moz-appearance: textfield;
  }
  .meal-proposal .prop-servings input.prop-mult::-webkit-outer-spin-button,
  .meal-proposal .prop-servings input.prop-mult::-webkit-inner-spin-button {
    -webkit-appearance: none; margin: 0;
  }
  .meal-proposal .prop-servings input.prop-mult:focus { outline: none; border-color: ${p.primary}; }
  .meal-proposal .prop-macros { font-variant-numeric: tabular-nums; white-space: nowrap; text-align: right; }
  /* CSS custom properties inherit through the shadow boundary, so the
     macro accent colors defined in themes.css resolve here just like in the
     rest of the app. Calories stay default text — only P/F/C get accents. */
  .meal-proposal .prop-p, .meal-proposal .prop-total-p { color: var(--color-protein); }
  .meal-proposal .prop-f, .meal-proposal .prop-total-f { color: var(--color-fat); }
  .meal-proposal .prop-c, .meal-proposal .prop-total-c { color: var(--color-carbs); }
  .meal-proposal .prop-sep { color: var(--text-tertiary); }
  .meal-proposal .prop-conf { text-align: right; }
  .meal-proposal .prop-conf-low { color: ${p.danger}; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.06em; }
  .meal-proposal .prop-conf-med { color: ${p.textTertiary}; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.06em; }
  .meal-proposal .prop-conf-high { color: ${p.primary}; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.06em; }
  .meal-proposal tr.prop-totals td { background: ${p.surfaceAlt}; }
  .meal-proposal .proposal-actions {
    display: flex;
    gap: 6px;
    padding: 8px 10px;
    border-top: 1px solid ${p.border};
    background: ${p.bg};
  }
  .meal-proposal .proposal-actions button {
    flex: 1;
    font-family: ${p.fontBody};
    font-size: 12.5px;
    font-weight: 600;
    padding: 7px 10px;
    border: 1px solid ${p.border};
    background: ${p.surface};
    color: ${p.text};
    cursor: pointer;
  }
  .meal-proposal .proposal-actions button[data-action="confirm"] {
    background: ${p.primary};
    color: ${p.textOnPrimary};
    border-color: ${p.primary};
  }
  .meal-proposal .proposal-actions button[data-action="confirm"]:hover { background: ${p.primaryHover}; }
  .meal-proposal .proposal-actions button[data-action="cancel"]:hover { color: ${p.danger}; border-color: ${p.danger}; }
  .meal-proposal .proposal-actions button:disabled { opacity: 0.5; cursor: wait; }
  .meal-proposal .proposal-done {
    padding: 8px 10px;
    background: ${p.primarySoft};
    color: ${p.primary};
    font-size: 12.5px;
    font-weight: 600;
    border-top: 1px solid ${p.border};
  }
  .meal-proposal .proposal-cancelled {
    padding: 8px 10px;
    background: ${p.surfaceAlt};
    color: ${p.textSecondary};
    font-size: 12.5px;
    border-top: 1px solid ${p.border};
  }
  .meal-proposal .proposal-error {
    color: ${p.danger};
    font-size: 12.5px;
    padding: 4px 8px;
  }

  /* ── Kill deep-chat default chrome ──────────────────────────────────── */
  :host { border: none !important; }
  #chat-view, #messages, #input, .input-container {
    border: none !important;
    box-shadow: none !important;
  }

  /* Side buttons (+, camera, image) — flat, transparent, theme-aware */
  .input-button {
    background: transparent !important;
    border: 1px solid transparent !important;
    border-radius: 0 !important;
    color: ${p.text} !important;
  }
  .input-button:hover { background: ${p.surfaceAlt} !important; }
  .input-button:focus-visible, .input-button:focus,
  .dropup-menu-item:focus-visible, .dropup-menu-item:focus {
    outline: none !important;
    box-shadow: 0 0 0 1px ${p.borderStrong} !important;
  }
  .input-button svg {
    /* deep-chat applies a brightness/invert filter to recolor icons; nuke it
       and use our theme fill directly so + and camera/upload glyphs match
       the rest of the UI. */
    filter: none !important;
    fill: ${p.text} !important;
  }

  /* ── Dropup menu (Take Photo / Upload Photo) ────────────────────────── */
  .dropup-menu {
    background: ${p.surface} !important;
    border: 1px solid ${p.border} !important;
    border-radius: 0 !important;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.5) !important;
    padding: 4px 0 !important;
    min-width: 180px !important;
    color: ${p.text} !important;
    font-family: ${p.fontBody} !important;
  }
  .dropup-menu-item {
    display: flex !important;
    align-items: center !important;
    gap: 10px !important;
    padding: 8px 12px !important;
    color: ${p.text} !important;
    font-size: 13px !important;
    font-family: ${p.fontBody} !important;
    cursor: pointer !important;
    background: transparent !important;
    border: none !important;
  }
  .dropup-menu-item:hover { background: ${p.surfaceAlt} !important; }
  .dropup-menu-item-icon {
    width: 18px !important; height: 18px !important;
    flex: none !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    color: ${p.text} !important;
  }
  .dropup-menu-item-icon svg,
  .dropup-menu-item-icon-element-custom {
    width: 18px !important;
    height: 18px !important;
    filter: none !important;
    fill: ${p.text} !important;
    color: ${p.text} !important;
  }
  .dropup-menu-item-text {
    color: ${p.text} !important;
    font-family: ${p.fontBody} !important;
  }
`;
});

// ── SSE streaming ──
const escapeHtml = (s) => {
  // Tolerate non-strings so a stray null/undefined from a malformed event
  // can't crash the entire renderBubble pipeline (would manifest as a chat
  // bubble that never updates and a permanent loading spinner).
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
};

const stepIcon = (evt) => {
  if (evt.type === 'status') return '•';
  if (evt.type === 'thought') return '💭';
  if (evt.type === 'tool_call') return '⚙️';
  if (evt.type === 'tool_result') return evt.ok === false ? '⚠️' : '✓';
  return '•';
};

const stepLabel = (evt) => {
  if (evt.type === 'status' || evt.type === 'thought') return evt.text;
  if (evt.type === 'tool_call' || evt.type === 'tool_result') return evt.summary;
  return '';
};

const renderThoughtTrail = (steps) => {
  if (!steps.length) return '';
  const latest = steps[steps.length - 1];
  const latestHtml = `<span class="trail-icon">${stepIcon(latest)}</span><span class="trail-latest">${escapeHtml(stepLabel(latest))}</span>`;
  const items = steps
    .map((s) => {
      const isErr = s.type === 'tool_result' && s.ok === false;
      return `<li class="${isErr ? 'trail-err' : ''}"><span class="trail-icon">${stepIcon(s)}</span>${escapeHtml(stepLabel(s))}</li>`;
    })
    .join('');
  return `<details class="agent-trail"><summary>${latestHtml}</summary><ol>${items}</ol></details>`;
};

const MEAL_LABELS = {
  breakfast: 'breakfast',
  lunch: 'lunch',
  dinner: 'dinner',
  snack: 'snack',
};

const confidenceBadge = (c) => {
  // Only flag low-confidence items so the table stays quiet by default —
  // high/medium are the expected case and don't need a per-row callout.
  if (c === 'low') return '<span class="prop-conf-low">low confidence</span>';
  return '';
};

const renderProposalCard = (p) => {
  const items = p.items || [];

  const rows = items
    .map((it, idx) => {
      const baseCal = Math.round(Number(it.calories) || 0);
      const baseP = Math.round(Number(it.protein) || 0);
      const baseF = Math.round(Number(it.fat) || 0);
      const baseC = Math.round(Number(it.carbs) || 0);
      const baseGrams = it.grams != null ? Math.round(Number(it.grams)) : null;
      const portionText = [it.portion, baseGrams ? `${baseGrams}g` : '']
        .filter(Boolean)
        .join(' · ');

      const macroCells = (cal, prot, fat, carb) => `
        <span class="prop-cal">${cal}</span><span class="prop-sep"> kcal · </span><span class="prop-p">${prot}p</span><span class="prop-sep"> / </span><span class="prop-f">${fat}f</span><span class="prop-sep"> / </span><span class="prop-c">${carb}c</span>
      `;

      // Pending rows are interactive (multiplier stepper). Confirmed/cancelled
      // rows render the stored values without controls so historical state is
      // immutable.
      if (p.status === 'pending') {
        return `<tr class="prop-row"
          data-idx="${idx}"
          data-base-cal="${baseCal}"
          data-base-p="${baseP}"
          data-base-f="${baseF}"
          data-base-c="${baseC}"
          data-base-grams="${baseGrams ?? ''}"
          data-name="${escapeHtml(it.name || '')}"
          data-brand="${escapeHtml(it.brand || '')}"
          data-emoji="${escapeHtml(it.emoji || '')}"
          data-portion="${escapeHtml(it.portion || '')}"
          data-confidence="${escapeHtml(it.confidence || 'medium')}"
          data-source="${escapeHtml(it.source || 'estimate')}"
          data-food-item-id="${escapeHtml(it.foodItemId || '')}"
        >
          <td>
            <div class="prop-name">${escapeHtml(it.emoji || '')} ${escapeHtml(it.name || '')}</div>
            ${portionText ? `<div class="prop-portion-text">${escapeHtml(portionText)}</div>` : ''}
          </td>
          <td class="prop-servings">
            <button type="button" data-action="dec" aria-label="Decrease">−</button>
            <input type="number" class="prop-mult" min="0" step="0.25" value="1" inputmode="decimal" />
            <button type="button" data-action="inc" aria-label="Increase">+</button>
          </td>
          <td class="prop-macros">${macroCells(baseCal, baseP, baseF, baseC)}</td>
          <td class="prop-conf">${confidenceBadge(it.confidence)}</td>
        </tr>`;
      }

      return `<tr>
        <td>
          <div class="prop-name">${escapeHtml(it.emoji || '')} ${escapeHtml(it.name || '')}</div>
          ${portionText ? `<div class="prop-portion-text">${escapeHtml(portionText)}</div>` : ''}
        </td>
        <td class="prop-servings-static">×${(it.servingCount && it.servingCount !== 1) ? Number(it.servingCount).toFixed(2).replace(/\.?0+$/, '') : '1'}</td>
        <td class="prop-macros">${macroCells(baseCal, baseP, baseF, baseC)}</td>
        <td class="prop-conf">${confidenceBadge(it.confidence)}</td>
      </tr>`;
    })
    .join('');

  const totals = items.reduce(
    (acc, it) => {
      acc.calories += Math.round(Number(it.calories) || 0);
      acc.protein += Math.round(Number(it.protein) || 0);
      acc.fat += Math.round(Number(it.fat) || 0);
      acc.carbs += Math.round(Number(it.carbs) || 0);
      return acc;
    },
    { calories: 0, protein: 0, fat: 0, carbs: 0 },
  );

  const totalRow = `<tr class="prop-totals">
    <td><strong>Total</strong></td>
    <td></td>
    <td class="prop-macros">
      <strong><span class="prop-total-cal">${totals.calories}</span><span class="prop-sep"> kcal · </span><span class="prop-total-p">${totals.protein}p</span><span class="prop-sep"> / </span><span class="prop-total-f">${totals.fat}f</span><span class="prop-sep"> / </span><span class="prop-total-c">${totals.carbs}c</span></strong>
    </td>
    <td></td>
  </tr>`;

  const mealLabel = MEAL_LABELS[p.mealType] || p.mealType || 'meal';

  if (p.status === 'confirmed') {
    return `<div class="meal-proposal" data-proposal-id="${escapeHtml(p.proposalId)}" data-proposal-status="confirmed">
      <div class="prop-header">Logged to ${escapeHtml(mealLabel)} on ${escapeHtml(p.date || '')}</div>
      <table class="prop-table"><tbody>${rows}${totalRow}</tbody></table>
      <div class="proposal-done">✓ Added to your food log</div>
    </div>`;
  }
  if (p.status === 'cancelled') {
    return `<div class="meal-proposal" data-proposal-id="${escapeHtml(p.proposalId)}" data-proposal-status="cancelled">
      <div class="prop-header">${escapeHtml(mealLabel)} on ${escapeHtml(p.date || '')}</div>
      <table class="prop-table"><tbody>${rows}${totalRow}</tbody></table>
      <div class="proposal-cancelled">Cancelled — nothing logged</div>
    </div>`;
  }
  return `<div class="meal-proposal" data-proposal-id="${escapeHtml(p.proposalId)}" data-proposal-status="pending">
    <div class="prop-header">Proposed ${escapeHtml(mealLabel)} on ${escapeHtml(p.date || '')}</div>
    <table class="prop-table"><tbody>${rows}${totalRow}</tbody></table>
    <div class="proposal-actions">
      <button type="button" data-action="confirm">Log to ${escapeHtml(mealLabel)}</button>
      <button type="button" data-action="cancel">Cancel</button>
    </div>
  </div>`;
};

const renderBubble = (steps, finalHtml, proposals = []) => {
  const trail = renderThoughtTrail(steps);
  const proposalHtml = proposals.map(renderProposalCard).join('');
  if (finalHtml) {
    return `${trail}<div class="agent-final">${finalHtml}</div>${proposalHtml}`;
  }
  return `${trail}${proposalHtml}`;
};

let trailOpenPref = false;
let trailObserver = null;

const wireTrail = (el) => {
  if (el.__trailWired) return;
  el.__trailWired = true;
  el.open = trailOpenPref;
  el.addEventListener('toggle', () => { trailOpenPref = el.open; });
};

// Click delegation for proposal Confirm/Cancel + stepper buttons. Lives on
// the .meal-proposal node so we don't have to refire listeners every time
// deep-chat re-renders an unrelated bubble.
const wireProposal = (node) => {
  if (node.__proposalWired) return;
  node.__proposalWired = true;
  node.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-action]');
    if (!btn) return;
    const proposalEl = btn.closest('.meal-proposal');
    if (!proposalEl) return;
    const action = btn.getAttribute('data-action');
    if (!action) return;
    ev.preventDefault();
    ev.stopPropagation();
    if (action === 'inc' || action === 'dec') {
      const row = btn.closest('.prop-row');
      const input = row?.querySelector('.prop-mult');
      if (!input) return;
      const cur = Number(input.value) || 0;
      const next = action === 'inc' ? cur + 0.25 : Math.max(0, cur - 0.25);
      input.value = String(next);
      recomputeProposalRow(row);
      recomputeProposalTotals(proposalEl);
      return;
    }
    const id = proposalEl.getAttribute('data-proposal-id');
    if (!id) return;
    handleProposalAction(id, action, proposalEl);
  });
  // Live update when the user types directly in the multiplier field
  // (stepper buttons fire click; keyboard / paste fire input).
  node.addEventListener('input', (ev) => {
    const input = ev.target;
    if (!(input instanceof HTMLElement) || !input.matches('.prop-mult')) return;
    const row = input.closest('.prop-row');
    if (!row) return;
    recomputeProposalRow(row);
    recomputeProposalTotals(input.closest('.meal-proposal'));
  });
};

const round0 = (n) => Math.round(Number(n) || 0);

function readMultiplier(row) {
  const input = row.querySelector('.prop-mult');
  const m = Number(input?.value);
  return Number.isFinite(m) && m >= 0 ? m : 1;
}

function recomputeProposalRow(row) {
  if (!row) return;
  const mult = readMultiplier(row);
  const baseCal = Number(row.dataset.baseCal) || 0;
  const baseP = Number(row.dataset.baseP) || 0;
  const baseF = Number(row.dataset.baseF) || 0;
  const baseC = Number(row.dataset.baseC) || 0;
  const setText = (sel, text) => {
    const el = row.querySelector(sel);
    if (el) el.textContent = text;
  };
  setText('.prop-cal', String(round0(baseCal * mult)));
  setText('.prop-p', `${round0(baseP * mult)}p`);
  setText('.prop-f', `${round0(baseF * mult)}f`);
  setText('.prop-c', `${round0(baseC * mult)}c`);
}

function recomputeProposalTotals(proposalEl) {
  if (!proposalEl) return;
  let cal = 0, p = 0, f = 0, c = 0;
  proposalEl.querySelectorAll('.prop-row').forEach((row) => {
    const m = readMultiplier(row);
    cal += (Number(row.dataset.baseCal) || 0) * m;
    p += (Number(row.dataset.baseP) || 0) * m;
    f += (Number(row.dataset.baseF) || 0) * m;
    c += (Number(row.dataset.baseC) || 0) * m;
  });
  const setText = (sel, text) => {
    const el = proposalEl.querySelector(sel);
    if (el) el.textContent = text;
  };
  setText('.prop-total-cal', String(round0(cal)));
  setText('.prop-total-p', `${round0(p)}p`);
  setText('.prop-total-f', `${round0(f)}f`);
  setText('.prop-total-c', `${round0(c)}c`);
}

// Walk the editable rows and produce the items[] payload to send to the
// confirm endpoint. Reads the multiplier so any user edits are baked in.
function readProposalItems(proposalEl) {
  const items = [];
  proposalEl.querySelectorAll('.prop-row').forEach((row) => {
    const mult = readMultiplier(row);
    if (mult <= 0) return; // user zeroed out a row → skip it entirely
    const baseGrams = row.dataset.baseGrams ? Number(row.dataset.baseGrams) : null;
    const item = {
      name: row.dataset.name || 'Food',
      brand: row.dataset.brand || '',
      emoji: row.dataset.emoji || '',
      portion: row.dataset.portion || '',
      grams: baseGrams != null ? round0(baseGrams * mult) : null,
      calories: round0((Number(row.dataset.baseCal) || 0) * mult),
      protein: round0((Number(row.dataset.baseP) || 0) * mult),
      fat: round0((Number(row.dataset.baseF) || 0) * mult),
      carbs: round0((Number(row.dataset.baseC) || 0) * mult),
      confidence: row.dataset.confidence || 'medium',
      source: row.dataset.source || 'estimate',
      servingCount: mult,
    };
    if (row.dataset.foodItemId) item.foodItemId = row.dataset.foodItemId;
    items.push(item);
  });
  return items;
}

// Replace deep-chat's default dropup labels (Photo / Image) with verbs that
// fit the action better. Keys match the icon id deep-chat assigns to each
// menu item — that's a stable hook even as deep-chat versions move around.
const DROPUP_LABEL_OVERRIDES = {
  'upload-images-icon': 'Upload Photo',
  'camera-icon': 'Take Photo',
};

const relabelDropupItem = (item) => {
  if (item.__relabeled) return;
  const svg = item.querySelector('svg[id]');
  const text = item.querySelector('.dropup-menu-item-text');
  if (!svg || !text) return;
  const override = DROPUP_LABEL_OVERRIDES[svg.id];
  if (!override) return;
  text.textContent = override;
  item.__relabeled = true;
};

const setupTrailObserver = (shadow) => {
  if (trailObserver) return;
  shadow.querySelectorAll('details.agent-trail').forEach(wireTrail);
  shadow.querySelectorAll('.meal-proposal').forEach(wireProposal);
  shadow.querySelectorAll('.dropup-menu-item').forEach(relabelDropupItem);
  trailObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      m.addedNodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        if (node.matches?.('details.agent-trail')) wireTrail(node);
        if (node.matches?.('.meal-proposal')) wireProposal(node);
        if (node.matches?.('.dropup-menu-item')) relabelDropupItem(node);
        node.querySelectorAll?.('details.agent-trail').forEach(wireTrail);
        node.querySelectorAll?.('.meal-proposal').forEach(wireProposal);
        node.querySelectorAll?.('.dropup-menu-item').forEach(relabelDropupItem);
      });
    }
  });
  trailObserver.observe(shadow, { childList: true, subtree: true });
};

// Map proposalId → {date, mealType, items, totals} so we can re-render the
// card in "confirmed" / "cancelled" state without refetching. Populated by
// the tool_proposal stream event, or by the server response on action.
const proposalCache = new Map();

async function handleProposalAction(proposalId, action, proposalEl) {
  if (proposalEl.__busy) return;
  proposalEl.__busy = true;
  const buttons = proposalEl.querySelectorAll('button[data-action]');
  buttons.forEach((b) => { b.disabled = true; });
  try {
    const endpoint = action === 'confirm' ? 'confirm' : 'cancel';
    const reqBody =
      action === 'confirm' ? { items: readProposalItems(proposalEl) } : {};
    const res = await nativeFetch(`/api/chat/proposals/${proposalId}/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(reqBody),
    });
    if (!res.ok) {
      let data = {};
      try { data = await res.json(); } catch {}
      proposalEl.querySelectorAll('.proposal-actions').forEach((el) => {
        el.innerHTML = `<span class="proposal-error">${escapeHtml(data.error || `Failed (${res.status})`)}</span>`;
      });
      return;
    }
    const data = await res.json();
    const cached = proposalCache.get(proposalId) || {};
    const updated = {
      proposalId,
      date: data.date || cached.date,
      mealType: data.mealType || cached.mealType,
      items: data.items || cached.items || [],
      totals: data.totals || cached.totals || null,
      status: action === 'confirm' ? 'confirmed' : 'cancelled',
    };
    // Swap the card in both the live DOM (instant feedback) and the
    // underlying deep-chat message HTML (so thread reload preserves it).
    const fresh = renderProposalCard(updated);
    const tpl = document.createElement('template');
    tpl.innerHTML = fresh.trim();
    const newNode = tpl.content.firstElementChild;
    if (newNode) proposalEl.replaceWith(newNode);
    persistProposalInMessage(proposalId, fresh);
    if (action === 'confirm') refreshActiveDay();
  } catch (err) {
    proposalEl.querySelectorAll('.proposal-actions').forEach((el) => {
      el.innerHTML = `<span class="proposal-error">${escapeHtml(err?.message || 'Network error')}</span>`;
    });
  } finally {
    proposalEl.__busy = false;
  }
}

function persistProposalInMessage(proposalId, newCardHtml) {
  const el = deepChatRef.value;
  if (!el?.getMessages) return;
  const msgs = el.getMessages();
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (!m?.html || !m.html.includes(`data-proposal-id="${proposalId}"`)) continue;
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div id="_root">${m.html}</div>`, 'text/html');
    const node = doc.querySelector(`[data-proposal-id="${proposalId}"]`);
    if (node) {
      const tpl = doc.createElement('template');
      tpl.innerHTML = newCardHtml.trim();
      const replacement = tpl.content.firstElementChild;
      if (replacement) {
        node.replaceWith(replacement);
        const updatedHtml = doc.getElementById('_root').innerHTML;
        try { el.updateMessage({ html: updatedHtml }, i); } catch {}
      }
    }
    break;
  }
  captureMessages();
}

// Tell stores that own the food log page to reload so the confirmed meal
// shows up immediately without needing a manual refresh. Lazy import to
// avoid a circular init order with Pinia on page boot.
async function refreshActiveDay() {
  try {
    const mod = await import('../stores/foodlog.js');
    const store = mod.useFoodLogStore();
    if (store.currentDate) await store.loadDay(store.currentDate);
  } catch {}
}

const PLAN_DISPLAY_NAMES = { premium: 'Premium', unlimited: 'Unlimited' };

const formatChatHttpError = async (res) => {
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON body */ }

  if (data?.error === 'chat_limit_exceeded' && data?.message) {
    let msg = data.message;
    if (data.upgradeAvailable && data.upgradePlanId) {
      const label = PLAN_DISPLAY_NAMES[data.upgradePlanId] || data.upgradePlanId;
      msg += ` Upgrade to ${label} for higher limits.`;
    }
    return msg;
  }
  if (res.status === 401) return 'Your session expired. Please sign in again.';
  return data?.message || data?.error || `Request failed (${res.status})`;
};

// Extract File refs that deep-chat attached to the outgoing user message.
// deep-chat sets `.files = [{ref: File, name, src, type}]` on the user turn
// when a file input / camera was used. If anything non-image slipped through
// (shouldn't, given our config) we drop it here.
function collectImageFiles(messages) {
  const last = messages?.[messages.length - 1];
  const files = Array.isArray(last?.files) ? last.files : [];
  return files
    .map((f) => f?.ref)
    .filter((f) => f instanceof File && f.type.startsWith('image/'));
}

// When the outgoing message has files attached, deep-chat hands the handler a
// FormData (keys: `files`, `message1`, `message2`, ...) rather than a plain
// `{messages: [...]}` object. We unpack it back into the same shape the rest
// of the code expects so the FormData path doesn't have to be threaded
// through the entire request build.
function unpackBody(body) {
  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    const files = body.getAll('files').filter((f) => f instanceof File);
    const messages = [];
    let i = 1;
    while (body.has(`message${i}`)) {
      const raw = body.get(`message${i}`);
      try {
        messages.push(typeof raw === 'string' ? JSON.parse(raw) : raw);
      } catch {
        break;
      }
      i += 1;
    }
    return { messages, files };
  }
  const messages = body?.messages || [];
  return { messages, files: collectImageFiles(messages) };
}

const streamChat = (body, signals) => {
  const tid = activeThreadId.value;
  const { messages: outgoingMessages, files: imageFiles } = unpackBody(body);
  console.log('[chat] streamChat invoked', {
    threadId: tid,
    messageCount: outgoingMessages.length,
    imageCount: imageFiles.length,
    bodyType: body?.constructor?.name,
  });
  const payload = {
    messages: outgoingMessages,
    threadId: tid && !String(tid).startsWith('temp-') ? tid : null,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
  const controller = new AbortController();
  signals.stopClicked.listener = () => controller.abort();

  (async () => {
    let requestBody;
    let headers = { 'Content-Type': 'application/json' };

    if (imageFiles.length) {
      // Strip the ref/src URLs from the in-flight copy of messages — they'd
      // either duplicate the upload or break JSON.stringify on File objects.
      // The server re-associates uploaded bytes with the last user message.
      const sanitizedMessages = outgoingMessages.map((m, i) => {
        if (i !== outgoingMessages.length - 1) return m;
        const { files, ...rest } = m;
        return rest;
      });
      const form = new FormData();
      form.append(
        'payload',
        JSON.stringify({ ...payload, messages: sanitizedMessages }),
      );
      try {
        for (let i = 0; i < imageFiles.length; i++) {
          // Resize + strip EXIF before upload — cuts payload to ~200–400KB
          // instead of the 4–10MB a raw phone photo would be.
          const prepared = await prepPhoto(imageFiles[i]);
          const filename = `image_${i}.${prepared.ext}`;
          form.append('images', prepared.fullBlob, filename);
        }
      } catch (e) {
        await signals.onResponse({ error: `Image prep failed: ${e?.message || e}` });
        signals.onClose();
        return;
      }
      requestBody = form;
      headers = {}; // let the browser set multipart boundary
    } else {
      requestBody = JSON.stringify(payload);
    }

    let res;
    try {
      res = await nativeFetch('/api/chat', {
        method: 'POST',
        headers,
        body: requestBody,
        credentials: 'same-origin',
        signal: controller.signal,
      });
    } catch (e) {
      await signals.onResponse({ error: e?.message || 'Network error' });
      signals.onClose();
      return;
    }

    if (!res.ok || !res.body) {
      const msg = await formatChatHttpError(res);
      await signals.onResponse({ error: msg });
      signals.onClose();
      return;
    }

    signals.onOpen();

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const steps = [];
    const proposals = [];
    let finalHtml = null;
    let persistedFiles = null;

    const flush = async () => {
      let html;
      try {
        html = renderBubble(steps, finalHtml, proposals);
      } catch (err) {
        // A render failure that bubbles up here used to manifest as the
        // chat just hanging — the spinner stayed up forever because
        // `signals.onResponse` was never called. Log it loudly and emit a
        // visible error instead of swallowing.
        console.error('[chat] renderBubble failed', err, { steps, proposals, finalHtml });
        html = '<div class="agent-final"><em>Render error — open console</em></div>';
      }
      try {
        await signals.onResponse({ html, overwrite: true });
      } catch (err) {
        console.error('[chat] signals.onResponse failed', err);
      }
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let sepIdx;
        while ((sepIdx = buffer.indexOf('\n\n')) !== -1) {
          const block = buffer.slice(0, sepIdx);
          buffer = buffer.slice(sepIdx + 2);
          if (!block.startsWith('data:')) continue;
          const json = block.slice(5).trim();
          if (!json) continue;

          let evt;
          try { evt = JSON.parse(json); } catch { continue; }

          if (evt.type === 'final') {
            finalHtml = evt.html || (evt.text ? escapeHtml(evt.text) : '');
            await flush();
          } else if (evt.type === 'error') {
            await signals.onResponse({ error: evt.message });
          } else if (evt.type === 'tool_proposal') {
            const proposal = {
              proposalId: evt.proposalId,
              date: evt.date,
              mealType: evt.mealType,
              items: evt.items || [],
              totals: evt.totals || null,
              status: 'pending',
            };
            proposals.push(proposal);
            proposalCache.set(evt.proposalId, proposal);
            await flush();
          } else if (evt.type === 'message_files') {
            // Server uploaded the photo(s) and returned signed URLs; remember
            // them so we can attach to the persisted user message below.
            persistedFiles = Array.isArray(evt.files) ? evt.files : null;
          } else {
            steps.push(evt);
            await flush();
          }
        }
      }
    } catch (e) {
      if (e?.name !== 'AbortError') {
        await signals.onResponse({ error: e?.message || 'Stream error' });
      }
    } finally {
      signals.onClose();
      await nextTick();
      // Photo counter visibly ticks up after a successful image turn.
      if (imageFiles.length) authStore.fetchMe().catch(() => {});
      attachPersistedFilesToLastUserMessage(persistedFiles);
      captureMessages();
      maybeGenerateTitle();
      // Upgrade any ```chart``` fenced code blocks in the final assistant
      // message to inline images. Best-effort — a render failure just
      // leaves the original code block in place rather than blocking the
      // rest of the chat.
      upgradeAssistantChartBlocks().catch((err) => {
        console.warn('[chat] chart upgrade failed', err);
      });
    }
  })();
};

// Walks all rendered messages and upgrades any ```chart fenced code
// blocks into inline images. `mostRecentOnly` short-circuits after the
// last assistant turn — used right after a fresh stream completes since
// older messages were already upgraded the first time around.
async function upgradeAssistantChartBlocks(mostRecentOnly = true) {
  const el = deepChatRef.value;
  if (!el?.getMessages) return;
  const msgs = el.getMessages();
  let changed = false;
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    const isAssistant = m?.role !== 'user' && m?.role !== 'human';
    if (mostRecentOnly && !isAssistant) break;
    if (!isAssistant) continue;
    if (!m?.html || !m.html.includes('language-chart')) continue;
    const upgraded = await renderChartsInHtml(m.html);
    if (upgraded === m.html) continue;
    try { el.updateMessage({ html: upgraded }, i); } catch { /* drawer closed mid-flight */ }
    changed = true;
    if (mostRecentOnly) break;
  }
  if (changed) captureMessages();
}

// After the stream returns signed URLs for uploaded photos, graft them onto
// the last user message inside deep-chat's own message list so captureMessages
// persists them. Without this step, the chat would forget about the image on
// next thread open.
function attachPersistedFilesToLastUserMessage(persistedFiles) {
  if (!persistedFiles || !persistedFiles.length) return;
  const el = deepChatRef.value;
  const getMessages = el?.getMessages;
  if (typeof getMessages !== 'function') return;
  const msgs = getMessages.call(el);
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m.role !== 'user' && m.role !== 'human') continue;
    const files = persistedFiles.map((f) => ({
      src: f.url,
      name: f.originalName || 'meal.jpg',
      type: 'image',
      s3Key: f.s3Key,
      mimeType: f.mimeType,
      bytes: f.bytes,
    }));
    // deep-chat's updateMessage replaces files on the given message index.
    if (typeof el.updateMessage === 'function') {
      try { el.updateMessage({ files }, i); } catch {}
    }
    break;
  }
}

const updateChatConnect = () => {
  const el = deepChatRef.value;
  if (!el) return;

  const shadow = el.shadowRoot;
  if (shadow) {
    let styleEl = shadow.querySelector('#chat-styles');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'chat-styles';
      shadow.appendChild(styleEl);
    }
    styleEl.textContent = shadowStyles.value;
    setupTrailObserver(shadow);
  }

  el.connect = {
    stream: true,
    handler: streamChat,
  };
};

watch(shadowStyles, (css) => {
  const shadow = deepChatRef.value?.shadowRoot;
  const styleEl = shadow?.querySelector('#chat-styles');
  if (styleEl) styleEl.textContent = css;
});

// ── Thread management ──
const activeThreadHistory = computed(() => {
  const msgs = activeThread.value?.messages || [];
  return msgs
    .map((m) => {
      if (!m || typeof m !== 'object') return null;
      const role = m.role || 'ai';
      const out = { role };
      if (m.html) out.html = m.html;
      else if (m.text) out.html = escapeHtml(m.text);
      if (Array.isArray(m.files) && m.files.length) out.files = m.files;
      if (!out.html && !out.files) return null;
      return out;
    })
    .filter(Boolean);
});

const loadThreads = async () => {
  try {
    const res = await nativeFetch('/api/chat/threads?includeMessages=1', { credentials: 'same-origin' });
    if (!res.ok) { threads.value = []; return; }
    const data = await res.json();
    threads.value = data.threads || [];
  } catch {
    threads.value = [];
  }

  if (threads.value.length) {
    activeThreadId.value = null;
    chatView.value = 'list';
  } else {
    await newThread({ syncUi: false });
  }
};

const saveTimers = new Map();
const scheduleSave = (threadId) => {
  if (saveTimers.has(threadId)) clearTimeout(saveTimers.get(threadId));
  const timer = setTimeout(() => {
    saveTimers.delete(threadId);
    saveThreadNow(threadId);
  }, 400);
  saveTimers.set(threadId, timer);
};

const saveThreadNow = async (threadId) => {
  const t = threads.value.find((x) => x.id === threadId);
  if (!t) return;
  try {
    await nativeFetch(`/api/chat/threads/${threadId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ title: t.title, messages: t.messages }),
    });
  } catch (e) {
    console.warn('Failed to save thread', e);
  }
};

const captureMessages = () => {
  const el = deepChatRef.value;
  const thread = activeThread.value;
  if (!el || !thread) return;
  try {
    const freshMsgs = JSON.parse(JSON.stringify(el.getMessages?.() || []));
    thread.messages = freshMsgs;
    thread.updatedAt = Date.now();
    scheduleSave(thread.id);
  } catch (e) {
    console.warn('Failed to capture messages', e);
  }
};

let creatingThread = false;

const newThread = async (opts = {}) => {
  const { syncUi = true } = opts;
  if (creatingThread) return;

  captureMessages();

  // Reuse empty thread
  const empty = threads.value.find((t) => !t.messages || t.messages.length === 0);
  if (empty) {
    activeThreadId.value = empty.id;
    chatView.value = 'conversation';
    return;
  }

  const tempId = `temp-${Date.now()}`;
  const now = Date.now();
  threads.value.unshift({
    id: tempId,
    title: DEFAULT_TITLE,
    createdAt: now,
    updatedAt: now,
    messages: [],
  });
  activeThreadId.value = tempId;
  chatView.value = 'conversation';

  creatingThread = true;
  try {
    const res = await nativeFetch('/api/chat/threads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ title: DEFAULT_TITLE }),
    });
    if (!res.ok) throw new Error('Create failed');
    const { thread } = await res.json();
    const idx = threads.value.findIndex((t) => t.id === tempId);
    if (idx !== -1) {
      thread.messages = threads.value[idx].messages;
      threads.value[idx] = thread;
    }
    if (activeThreadId.value === tempId) activeThreadId.value = thread.id;
  } catch (e) {
    console.warn('Failed to create thread', e);
    threads.value = threads.value.filter((t) => t.id !== tempId);
    if (activeThreadId.value === tempId) activeThreadId.value = threads.value[0]?.id || null;
  } finally {
    creatingThread = false;
  }
};

const switchThread = async (id) => {
  if (id === activeThreadId.value && chatView.value === 'conversation') return;
  captureMessages();
  activeThreadId.value = id;
  chatView.value = 'conversation';
};

const deleteThread = async (id) => {
  const prev = threads.value;
  threads.value = prev.filter((t) => t.id !== id);
  try {
    const res = await nativeFetch(`/api/chat/threads/${id}`, { method: 'DELETE', credentials: 'same-origin' });
    if (!res.ok) throw new Error();
  } catch {
    threads.value = prev;
    return;
  }
  if (activeThreadId.value === id) {
    activeThreadId.value = null;
    chatView.value = 'list';
  }
};

const goBackToList = () => {
  captureMessages();
  chatView.value = 'list';
  visibleThreadCount.value = 8;
};

const submitFromList = async () => {
  const text = listInputText.value.trim();
  if (!text) return;
  listInputText.value = '';
  pendingMessage.value = text;
  await newThread();
};

// When something else (e.g., the Insights "Explain" button) seeds a
// pendingPrompt via the chatStarter store, auto-send it as a fresh thread.
// We watch the prompt directly rather than only when the drawer mounts so
// a starter that arrives while the drawer is already open also fires.
watch(
  () => chatStarter.pendingPrompt,
  async (prompt) => {
    if (!prompt) return;
    const text = chatStarter.consumePrompt();
    if (!text) return;
    listInputText.value = '';
    pendingMessage.value = text;
    await newThread();
  },
  { immediate: true },
);

const threadPreview = (t) => {
  const firstUser = t.messages?.find((m) => m.role === 'user');
  if (!firstUser) return '';
  const text = firstUser.text || (firstUser.html || '').replace(/<[^>]*>/g, ' ').trim();
  return text.slice(0, 100);
};

const formatRelative = (ts) => {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
};

const startRename = (t) => {
  renamingThreadId.value = t.id;
  renameDraft.value = t.title || '';
  nextTick(() => {
    const input = document.querySelector(`input[data-thread-rename="${t.id}"]`);
    input?.focus();
    input?.select();
  });
};

const commitRename = () => {
  const id = renamingThreadId.value;
  if (!id) return;
  const thread = threads.value.find((t) => t.id === id);
  if (thread) {
    thread.title = renameDraft.value.trim() || DEFAULT_TITLE;
    thread.updatedAt = Date.now();
    saveThreadNow(thread.id);
  }
  renamingThreadId.value = null;
  renameDraft.value = '';
};

const cancelRename = () => {
  renamingThreadId.value = null;
  renameDraft.value = '';
};

const toggleFlyout = (id) => {
  flyoutThreadId.value = flyoutThreadId.value === id ? null : id;
  confirmingDeleteId.value = null;
};

const closeFlyout = () => {
  flyoutThreadId.value = null;
  confirmingDeleteId.value = null;
};

const confirmDelete = (id) => {
  closeFlyout();
  deleteThread(id);
};

const maybeGenerateTitle = async () => {
  const thread = activeThread.value;
  if (!thread || (thread.title && thread.title !== DEFAULT_TITLE)) return;
  const firstUser = thread.messages?.find((m) => m.role === 'user');
  if (!firstUser) return;
  const userText = firstUser.text || (firstUser.html || '').replace(/<[^>]*>/g, ' ').trim();
  if (!userText.trim()) return;
  try {
    const res = await nativeFetch('/api/chat/title', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ userMessage: userText }),
    });
    if (!res.ok) return;
    const { title } = await res.json();
    if (title) {
      thread.title = title;
      thread.updatedAt = Date.now();
      saveThreadNow(thread.id);
    }
  } catch {}
};

// ── Watchers ──
watch(() => props.open, async (open) => {
  if (!open) return;
  // Refresh user snapshot so the photo-counter reflects image usage from
  // other tabs/devices. Cheap; runs in parallel with thread load.
  authStore.fetchMe().catch(() => {});
  await loadThreads();
  await nextTick();
  updateChatConnect();
});

watch(activeThreadId, async () => {
  trailObserver?.disconnect();
  trailObserver = null;
  await nextTick();
  updateChatConnect();
  // Upgrade ```chart blocks in any historical assistant messages once
  // deep-chat has rendered them. New messages are upgraded by the stream
  // pipeline, but reopening an old thread needs this pass.
  upgradeAssistantChartBlocks(false).catch((err) => {
    console.warn('[chat] historical chart upgrade failed', err);
  });
});

// Pending message → submit after deep-chat mounts
watch(
  [() => chatView.value, activeThreadId],
  async ([view, threadId]) => {
    if (view !== 'conversation' || !threadId || !pendingMessage.value) return;
    const msg = pendingMessage.value;
    pendingMessage.value = null;

    const waitFrame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    for (let i = 0; i < 10; i++) {
      await waitFrame();
      await nextTick();
      if (activeThreadId.value?.startsWith('temp-')) continue;
      const el = deepChatRef.value;
      if (!el?.shadowRoot) continue;
      updateChatConnect();
      const input = el.shadowRoot.querySelector('[contenteditable]');
      if (!input) continue;
      await waitFrame();
      el.submitUserMessage({ text: msg });
      return;
    }
    console.warn('deep-chat never became ready for pending message');
  },
);

onMounted(() => {
  if (props.open) loadThreads();
});
</script>

<template>
  <div v-show="open" class="chat-drawer">
    <!-- Header -->
    <div class="chat-header">
      <div class="chat-header-left">
        <div class="chat-icon">✦</div>
        <div>
          <div class="chat-title">Health Assistant</div>
          <div class="chat-subtitle">Ask about your data</div>
        </div>
      </div>
      <button class="chat-close" @click="emit('update:open', false)">✕</button>
    </div>

    <!-- List View -->
    <template v-if="chatView === 'list'">
      <div class="chat-body">
        <div class="chat-list-actions">
          <button class="btn-new-thread" @click="newThread()">
            + New conversation
          </button>
        </div>

        <div class="thread-list" @click="closeFlyout">
          <div v-if="sortedThreads.length === 0" class="thread-empty">
            No conversations yet
          </div>
          <div
            v-for="t in visibleThreads"
            :key="t.id"
            @click="switchThread(t.id)"
            class="thread-item"
          >
            <div class="thread-item-body">
              <input
                v-if="renamingThreadId === t.id"
                v-model="renameDraft"
                :data-thread-rename="t.id"
                type="text"
                maxlength="60"
                class="thread-rename-input"
                @click.stop
                @keydown.enter.prevent="commitRename"
                @keydown.esc.prevent="cancelRename"
                @blur="commitRename"
              />
              <template v-else>
                <div class="thread-title">{{ t.title || 'Untitled' }}</div>
                <div v-if="threadPreview(t)" class="thread-preview">{{ threadPreview(t) }}</div>
                <div class="thread-time">{{ formatRelative(t.updatedAt) }}</div>
              </template>
            </div>
            <div v-if="renamingThreadId !== t.id" class="thread-menu-wrap">
              <button class="thread-menu-btn" @click.stop="toggleFlyout(t.id)">⋯</button>
              <div v-if="flyoutThreadId === t.id" class="thread-flyout">
                <button @click.stop="closeFlyout(); startRename(t)" class="flyout-item">Rename</button>
                <button
                  v-if="confirmingDeleteId !== t.id"
                  @click.stop="confirmingDeleteId = t.id"
                  class="flyout-item flyout-danger"
                >Delete</button>
                <div v-else class="flyout-confirm">
                  <span class="flyout-confirm-text">Delete?</span>
                  <button @click.stop="confirmDelete(t.id)" class="flyout-confirm-yes">Yes</button>
                  <button @click.stop="confirmingDeleteId = null" class="flyout-confirm-no">No</button>
                </div>
              </div>
            </div>
          </div>

          <div v-if="hasMoreThreads" class="thread-more">
            <button @click.stop="visibleThreadCount += 8" class="thread-more-btn">Show more</button>
          </div>
        </div>

        <div class="chat-list-input">
          <form @submit.prevent="submitFromList" class="list-form">
            <input v-model="listInputText" type="text" placeholder="Ask anything..." class="list-input" />
            <button type="submit" :disabled="!listInputText.trim()" class="list-send">→</button>
          </form>
        </div>
      </div>
    </template>

    <!-- Conversation View -->
    <template v-else>
      <div class="conv-bar">
        <button @click="goBackToList" class="conv-back">←</button>
        <div class="conv-title-wrap">
          <input
            v-if="renamingThreadId === activeThreadId"
            v-model="renameDraft"
            :data-thread-rename="activeThreadId"
            type="text"
            maxlength="60"
            class="thread-rename-input"
            @keydown.enter.prevent="commitRename"
            @keydown.esc.prevent="cancelRename"
            @blur="commitRename"
          />
          <button
            v-else
            @click="activeThread && startRename(activeThread)"
            class="conv-title-btn"
          >
            {{ activeThread?.title || 'New conversation' }}
          </button>
        </div>
        <button @click="newThread()" class="conv-new" title="New conversation">+</button>
      </div>

      <div v-if="showPhotoCounter" class="photo-counter">
        📷 {{ photosUsed }} of {{ photosAllowed }} free food photos used
        <button v-if="photosUsed >= photosAllowed" class="photo-counter-upgrade" @click="onUpgradeClick">Upgrade</button>
      </div>
      <div class="conv-chat-area">
        <deep-chat
          :key="`${activeThreadId || 'empty'}`"
          ref="deepChatRef"
          :requestBodyLimits="{ maxMessages: 0 }"
          :history="activeThreadHistory"
          :introMessage="introMessage"
          :images="imagesConfig"
          :camera="cameraConfig"
          :speechToText="speechToTextConfig"
          style="height: 100%; width: 100%; border: none; display: block;"
          :chatStyle="chatStyles"
          :inputAreaStyle="inputAreaStyle"
          :textInput="textInputStyle"
          :submitButtonStyles="submitButtonStyle"
          :messageStyles="chatMessageStyles"
        ></deep-chat>
      </div>
    </template>
  </div>
</template>

<style scoped>
.chat-drawer {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--surface, #fff);
}

.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid var(--border);
  background: var(--bg);
  flex: none;
}
.chat-header-left {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}
.chat-icon {
  width: 36px;
  height: 36px;
  background: var(--primary);
  border-radius: var(--radius-small);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-on-primary);
  font-size: var(--font-size-m);
}
.chat-title {
  font-weight: var(--font-weight-bold);
  font-size: var(--font-size-m);
  color: var(--text);
}
.chat-subtitle {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  text-transform: uppercase;
  font-weight: var(--font-weight-bold);
  letter-spacing: var(--tracking-wide);
}
.chat-close {
  background: none;
  border: none;
  font-size: var(--font-size-m);
  color: var(--text-secondary);
  cursor: pointer;
  padding: var(--space-1);
}

/* ── List View ── */
.chat-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.chat-list-actions {
  padding: var(--space-3) var(--space-4);
  flex: none;
}
.btn-new-thread {
  width: 100%;
  padding: var(--space-2);
  background: var(--primary);
  color: var(--text-on-primary);
  border: none;
  border-radius: var(--radius-small);
  font-size: var(--font-size-s);
  font-weight: var(--font-weight-bold);
  cursor: pointer;
  transition: background var(--transition-base);
}
.btn-new-thread:hover {
  background: var(--primary-hover);
}

.thread-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 var(--space-3);
}
.thread-empty {
  text-align: center;
  color: var(--text-secondary);
  font-size: var(--font-size-s);
  padding: var(--space-12) var(--space-4);
}
.thread-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3);
  border-radius: var(--radius-small);
  cursor: pointer;
  transition: background var(--transition-base);
}
.thread-item:hover {
  background: var(--bg);
}
.thread-item-body {
  flex: 1;
  min-width: 0;
}
.thread-title {
  font-size: var(--font-size-s);
  font-weight: var(--font-weight-medium);
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.thread-preview {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 2px;
}
.thread-time {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  margin-top: 2px;
}
.thread-rename-input {
  width: 100%;
  font-size: var(--font-size-s);
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--primary);
  border-radius: var(--radius-small);
  background: var(--surface);
  color: var(--text);
  outline: none;
}
.thread-menu-wrap {
  position: relative;
  flex: none;
}
.thread-menu-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: var(--space-1) var(--space-2);
  color: var(--text-secondary);
  font-size: var(--font-size-m);
  opacity: 0;
  transition: opacity var(--transition-base);
}
.thread-item:hover .thread-menu-btn {
  opacity: 1;
}
.thread-flyout {
  position: absolute;
  right: 0;
  top: 100%;
  width: 140px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-medium);
  box-shadow: var(--shadow-m);
  z-index: 20;
  padding: var(--space-1) 0;
}
.flyout-item {
  display: block;
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  padding: var(--space-2) var(--space-3);
  font-size: var(--font-size-s);
  cursor: pointer;
  color: var(--text);
}
.flyout-item:hover {
  background: var(--bg);
}
.flyout-danger {
  color: var(--danger);
}
.flyout-confirm {
  padding: var(--space-2) var(--space-3);
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-size-s);
}
.flyout-confirm-text {
  color: var(--text-secondary);
}
.flyout-confirm-yes {
  background: var(--danger);
  color: #fff;
  border: none;
  border-radius: var(--radius-small);
  padding: var(--space-1) var(--space-2);
  cursor: pointer;
  font-size: var(--font-size-xs);
}
.flyout-confirm-no {
  background: var(--bg);
  color: var(--text);
  border: none;
  border-radius: var(--radius-small);
  padding: var(--space-1) var(--space-2);
  cursor: pointer;
  font-size: var(--font-size-xs);
}

.thread-more {
  text-align: center;
  padding: var(--space-3);
}
.thread-more-btn {
  background: none;
  border: none;
  color: var(--primary);
  font-size: var(--font-size-s);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
}

.chat-list-input {
  padding: var(--space-3) var(--space-4);
  border-top: 1px solid var(--border);
  flex: none;
}
.list-form {
  display: flex;
  gap: var(--space-2);
}
.list-input {
  flex: 1;
  padding: var(--space-2) var(--space-3);
  font-size: var(--font-size-s);
}
.list-send {
  width: 38px;
  height: 38px;
  background: var(--primary);
  color: var(--text-on-primary);
  border: none;
  border-radius: var(--radius-small);
  cursor: pointer;
  font-size: var(--font-size-m);
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
}
.list-send:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* ── Conversation View ── */
.conv-bar {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--border);
  flex: none;
}
.conv-back,
.conv-new {
  background: none;
  border: none;
  cursor: pointer;
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-small);
  color: var(--text-secondary);
  font-size: var(--font-size-m);
  flex: none;
}
.conv-back:hover,
.conv-new:hover {
  background: var(--bg);
}
.conv-title-wrap {
  flex: 1;
  min-width: 0;
  padding: 0 var(--space-1);
}
.conv-title-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: var(--font-size-s);
  font-weight: var(--font-weight-medium);
  color: var(--text);
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: block;
  max-width: 100%;
  padding: 0;
}
.conv-title-btn:hover {
  color: var(--primary);
}

.conv-chat-area {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.photo-counter {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: var(--surface-alt);
  border-bottom: 1px solid var(--border);
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
  flex: none;
}
.photo-counter-upgrade {
  margin-left: auto;
  background: var(--primary);
  color: var(--text-on-primary);
  border: none;
  padding: var(--space-1) var(--space-2);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
  cursor: pointer;
  border-radius: var(--radius-small);
}
.photo-counter-upgrade:hover { background: var(--primary-hover); }
</style>
