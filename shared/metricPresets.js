// Preset metric library. Seeded per-user on first metrics fetch. The list is
// the source of truth for "what does Body Optimizer ship with out of the box";
// users can disable any preset (history preserved) but cannot delete one.
//
// Each preset's `dimension` resolves to its display unit via
// `defaultUnitFor(dimension, user.unitSystem)` (see shared/units.js). To pin a
// specific unit regardless of system (rare) set `defaultUnit`.

export const METRIC_PRESETS = [
  // ---- Body circumference (length) -------------------------------------
  { key: 'arm_left',      name: 'Arm (left)',      category: 'body', dimension: 'length' },
  { key: 'arm_right',     name: 'Arm (right)',     category: 'body', dimension: 'length' },
  { key: 'forearm_left',  name: 'Forearm (left)',  category: 'body', dimension: 'length' },
  { key: 'forearm_right', name: 'Forearm (right)', category: 'body', dimension: 'length' },
  { key: 'thigh_left',    name: 'Thigh (left)',    category: 'body', dimension: 'length' },
  { key: 'thigh_right',   name: 'Thigh (right)',   category: 'body', dimension: 'length' },
  { key: 'calf_left',     name: 'Calf (left)',     category: 'body', dimension: 'length' },
  { key: 'calf_right',    name: 'Calf (right)',    category: 'body', dimension: 'length' },
  { key: 'wrist',         name: 'Wrist',           category: 'body', dimension: 'length' },
  { key: 'neck',          name: 'Neck',            category: 'body', dimension: 'length' },
  { key: 'shoulders',     name: 'Shoulders',       category: 'body', dimension: 'length' },
  { key: 'chest',         name: 'Chest',           category: 'body', dimension: 'length' },
  { key: 'waist',         name: 'Waist',           category: 'body', dimension: 'length' },
  { key: 'hips',          name: 'Hips',            category: 'body', dimension: 'length' },

  // ---- Body composition -----------------------------------------------
  { key: 'body_fat',      name: 'Body fat',        category: 'composition', dimension: 'percent' },
  { key: 'lean_mass',     name: 'Lean mass',       category: 'composition', dimension: 'mass' },
];

export const METRIC_CATEGORIES = [
  { key: 'body',        label: 'Body Measurements' },
  { key: 'composition', label: 'Body Composition' },
  { key: 'custom',      label: 'Custom' },
];

// Dimensions a user can pick when creating a custom metric. Kept narrow so
// the "+ Add custom" flow doesn't expose obscure dimensions like pressure or
// frequency until we have a real use case.
export const CUSTOM_METRIC_DIMENSIONS = ['length', 'mass', 'volume', 'duration', 'count'];

export function findPreset(key) {
  return METRIC_PRESETS.find((p) => p.key === key) || null;
}
