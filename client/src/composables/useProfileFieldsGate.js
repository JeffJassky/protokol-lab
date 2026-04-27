// Just-in-time profile gating (PRD §9, step 8).
//
// Flow: a feature that needs UserSettings fields the user hasn't filled yet
// awaits `ensure(['height','weight','sex','age'])`. If all are present the
// promise resolves immediately. If any are missing, a global modal opens
// asking only for those fields; the promise resolves after Save (true) or
// Skip (false). Callers can choose: gate the action behind `if (await
// ensure(...))` or always run it and degrade if the user skips.
//
// One shared module-level state is fine — only one prompt should be visible
// at a time, and a second concurrent ensure() can queue behind it.

import { ref } from 'vue';

const open = ref(false);
const pending = ref(null);
// FIFO queue so two concurrent ensure()s don't fight over the modal.
const queue = [];

const FIELD_DEFS = {
  sex:               { label: 'Sex',                kind: 'enum',   options: ['male', 'female'] },
  age:               { label: 'Age',                kind: 'number', min: 1, max: 120 },
  heightInches:      { label: 'Height (inches)',    kind: 'number', min: 30, max: 96 },
  currentWeightLbs:  { label: 'Current weight (lbs)', kind: 'number', min: 50, max: 800, step: 0.1 },
  goalWeightLbs:     { label: 'Goal weight (lbs)',  kind: 'number', min: 50, max: 800, step: 0.1 },
  goalRateLbsPerWeek:{ label: 'Goal pace (lbs / week, negative = lose)', kind: 'number', step: 0.1 },
};

function isMissing(settings, field) {
  if (!settings) return true;
  const v = settings[field];
  return v == null || v === '';
}

function presentNext() {
  if (open.value || !queue.length) return;
  pending.value = queue.shift();
  open.value = true;
}

export function useProfileFieldsGate() {
  return {
    // Awaits user input. Resolves true on save, false on skip.
    ensure(needs, settings) {
      const missing = needs.filter((f) => isMissing(settings, f));
      if (!missing.length) return Promise.resolve(true);
      return new Promise((resolve) => {
        queue.push({
          needs: missing.map((f) => ({ field: f, ...FIELD_DEFS[f] })).filter((d) => d.label),
          resolve,
        });
        presentNext();
      });
    },
  };
}

// Used by the modal component. Closes the current prompt with a verdict.
export function _resolveCurrent(verdict) {
  if (pending.value) {
    pending.value.resolve(verdict);
    pending.value = null;
  }
  open.value = false;
  // Drain queue if anything stacked.
  presentNext();
}

export function _gateState() {
  return { open, pending };
}
