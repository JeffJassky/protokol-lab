import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api } from '../api/index.js';

// Unified compound list. After the canonical-compound migration the
// server returns a merged list — every entry carries `source: 'core' |
// 'custom'` and either `coreInterventionKey` (canonical) or `_id`
// (custom). UI doesn't need to know which path was used to render the
// picker; it just iterates the list.
//
// Writes split:
//   - canonical row (`source: 'core'`)  → PATCH /api/compounds/core/:key
//   - custom row    (`source: 'custom'`) → POST/PATCH/DELETE /api/compounds/[/:id]
export const useCompoundsStore = defineStore('compounds', () => {
  const compounds = ref([]);
  const loaded = ref(false);

  const enabled = computed(() => compounds.value.filter((c) => c.enabled));
  const canonical = computed(() => compounds.value.filter((c) => c.source === 'core'));
  const custom = computed(() => compounds.value.filter((c) => c.source === 'custom'));

  async function fetchAll() {
    const data = await api.get('/api/compounds');
    compounds.value = data.compounds;
    loaded.value = true;
  }

  // Create only takes custom compounds — canonical ones live in the
  // catalog, you can't "create" Tirzepatide.
  async function createCustom({ name, brandNames, halfLifeDays, intervalDays, doseUnit, color, kineticsShape }) {
    const data = await api.post('/api/compounds', {
      name, brandNames, halfLifeDays, intervalDays, doseUnit, color, kineticsShape,
    });
    compounds.value.push(data.compound);
    return data.compound;
  }

  // Polymorphic update — routes to the right endpoint based on source.
  async function update(idOrKey, patch, { source } = {}) {
    if (source === 'core') {
      const data = await api.patch(`/api/compounds/core/${idOrKey}`, patch);
      const idx = compounds.value.findIndex(
        (c) => c.source === 'core' && c.coreInterventionKey === idOrKey,
      );
      if (idx !== -1) compounds.value[idx] = data.compound;
      return data.compound;
    }
    const data = await api.patch(`/api/compounds/${idOrKey}`, patch);
    const idx = compounds.value.findIndex(
      (c) => c.source === 'custom' && c._id === idOrKey,
    );
    if (idx !== -1) compounds.value[idx] = data.compound;
    return data.compound;
  }

  // Delete only operates on customs. Canonical compounds disable via
  // `update(key, { enabled: false }, { source: 'core' })`.
  async function remove(id) {
    await api.del(`/api/compounds/${id}`);
    compounds.value = compounds.value.filter(
      (c) => !(c.source === 'custom' && c._id === id),
    );
  }

  // Lookup helpers. `getById` keeps the legacy contract (treat the
  // identifier as a custom compound _id). `getByRef` is the new
  // polymorphic accessor — pass either { compoundId } or
  // { coreInterventionKey } and it returns the right row.
  function getById(id) {
    return compounds.value.find(
      (c) => c.source === 'custom' && c._id === id,
    ) || null;
  }

  function getByRef(ref = {}) {
    if (ref.coreInterventionKey) {
      return compounds.value.find(
        (c) => c.source === 'core' && c.coreInterventionKey === ref.coreInterventionKey,
      ) || null;
    }
    if (ref.compoundId) return getById(ref.compoundId);
    return null;
  }

  return {
    compounds, enabled, canonical, custom, loaded,
    fetchAll, createCustom, update, remove, getById, getByRef,
    // Back-compat alias — some legacy call sites still call .create().
    create: createCustom,
  };
}, {
  persist: { pick: ['compounds'] },
});
