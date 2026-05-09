import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api } from '../api/index.js';

// Reference key derived from a DoseLog entry. Custom compounds keyed
// by their custom Compound _id; canonical compounds keyed by their
// core intervention key with a `core:` prefix so the two namespaces
// don't collide.
function refKeyFor(entry) {
  if (entry?.coreInterventionKey) return `core:${entry.coreInterventionKey}`;
  if (entry?.compoundId) return String(entry.compoundId);
  return null;
}

// Reference key for a compound row from useCompoundsStore.
function refKeyForCompound(compound) {
  if (!compound) return null;
  if (compound.source === 'core') return `core:${compound.coreInterventionKey}`;
  return String(compound._id);
}

export const useDosesStore = defineStore('doses', () => {
  // Flat, newest-first across all compounds. UI groups as needed.
  const entries = ref([]);
  // PK curves keyed by `refKeyFor(entry)` — handles both custom
  // (compound _id) and canonical (`core:<key>`) refs uniformly.
  const curvesByCompound = ref({});

  const entriesByCompound = computed(() => {
    const out = {};
    for (const e of entries.value) {
      const k = refKeyFor(e);
      if (!k) continue;
      if (!out[k]) out[k] = [];
      out[k].push(e);
    }
    return out;
  });

  async function fetchEntries() {
    const data = await api.get('/api/doses');
    entries.value = data.entries;
  }

  async function fetchPkCurves(from, to) {
    const params = new URLSearchParams({ points: '150' });
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const data = await api.get(`/api/doses/pk?${params}`);
    const map = {};
    for (const c of data.curves) {
      const key = c.coreInterventionKey ? `core:${c.coreInterventionKey}` : String(c.compoundId);
      map[key] = c;
    }
    curvesByCompound.value = map;
  }

  // Polymorphic dose creation. Accepts either { compoundId } for custom
  // compounds or { coreInterventionKey } for canonical ones.
  async function addDose({ compoundId, coreInterventionKey, value, date }) {
    const body = { value, date };
    if (compoundId) body.compoundId = compoundId;
    if (coreInterventionKey) body.coreInterventionKey = coreInterventionKey;
    await api.post('/api/doses', body);
    await Promise.all([fetchEntries(), fetchPkCurves()]);
  }

  async function deleteDose(id) {
    await api.del(`/api/doses/${id}`);
    await Promise.all([fetchEntries(), fetchPkCurves()]);
  }

  // Helpers take a compound row (any source) so callers don't have to
  // unpack the polymorphism themselves. Still provide the legacy id-based
  // signatures for back-compat.
  function todaysDoseFor(compound, dateStr) {
    const key = typeof compound === 'string' ? compound : refKeyForCompound(compound);
    if (!key) return null;
    return entries.value.find(
      (e) => refKeyFor(e) === key && String(e.date).slice(0, 10) === dateStr,
    );
  }

  function latestDoseFor(compound) {
    const key = typeof compound === 'string' ? compound : refKeyForCompound(compound);
    if (!key) return null;
    return entries.value
      .filter((e) => refKeyFor(e) === key)
      .sort((a, b) => new Date(b.date) - new Date(a.date))[0];
  }

  return {
    entries,
    curvesByCompound,
    entriesByCompound,
    fetchEntries,
    fetchPkCurves,
    addDose,
    deleteDose,
    todaysDoseFor,
    latestDoseFor,
    // Exported helpers for component-level ref normalization.
    refKeyFor,
    refKeyForCompound,
  };
});
