// Re-exports the canonical genetics catalog from @kyneticbio/core +
// the input-validation helpers the server and client need. The catalog
// itself (panel groupings, labels, hints, option enums) lives in core.

// See bloodworkPanels.js for why we import via a relative path into
// core's dist/ rather than the package alias.
import {
  GENETICS_PANELS,
  GENETICS_FIELD_INDEX,
} from '../../core/dist/index.js';

export { GENETICS_PANELS, GENETICS_FIELD_INDEX };

// Coerce a single genetics value. Validates that the value matches the
// field's declared options (for select fields), parses booleans, or
// clamps to enum/min/max for numeric fields. Returns null when the
// field is unknown or the value can't be coerced.
export function sanitizeGeneticsValue(dotPath, raw) {
  const field = GENETICS_FIELD_INDEX.get(dotPath);
  if (!field) return null;
  if (raw === null || raw === undefined || raw === '') return null;

  if (field.kind === 'select') {
    const s = String(raw);
    return field.options.includes(s) ? s : null;
  }
  if (field.kind === 'boolean') {
    if (typeof raw === 'boolean') return raw;
    if (raw === 'true' || raw === 'false') return raw === 'true';
    return Boolean(raw);
  }
  if (field.kind === 'number') {
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    if (field.enumValues && !field.enumValues.includes(n)) return null;
    const min = Number.isFinite(field.min) ? field.min : -Infinity;
    const max = Number.isFinite(field.max) ? field.max : Infinity;
    return Math.max(min, Math.min(max, n));
  }
  return null;
}

export function expandGeneticsFlat(flat = {}) {
  const out = {};
  for (const [dotPath, value] of Object.entries(flat)) {
    if (value === null || value === undefined) continue;
    const [panel, field] = dotPath.split('.');
    if (!panel || !field) continue;
    if (!out[panel]) out[panel] = {};
    out[panel][field] = value;
  }
  return out;
}

export function flattenGeneticsNested(nested = {}) {
  const out = {};
  if (!nested || typeof nested !== 'object') return out;
  for (const [panel, fields] of Object.entries(nested)) {
    if (!fields || typeof fields !== 'object') continue;
    for (const [field, value] of Object.entries(fields)) {
      if (value === null || value === undefined) continue;
      out[`${panel}.${field}`] = value;
    }
  }
  return out;
}
