// Preset photo-type library. Seeded per-user on first photo-types fetch.
// Same model as metricPresets.js: users can disable any preset (history
// preserved) but cannot delete one. Customs cover everything else (skin
// condition tracking, outfit shots, recipe references, etc.).

export const PHOTO_TYPE_PRESETS = [
  { key: 'front', name: 'Front',  defaultOrder: 0 },
  { key: 'side',  name: 'Side',   defaultOrder: 1 },
  { key: 'back',  name: 'Back',   defaultOrder: 2 },
];

// "Other" is migration-only — old Photo rows used `angle: 'other'` as a
// catch-all. Migration creates this row alongside the presets so legacy
// "other" photos have somewhere to land. New users don't need it; the
// custom-add flow gives them better-named buckets.
export const LEGACY_OTHER_KEY = 'other';
export const LEGACY_OTHER_NAME = 'Other';

export function findPhotoTypePreset(key) {
  return PHOTO_TYPE_PRESETS.find((p) => p.key === key) || null;
}
