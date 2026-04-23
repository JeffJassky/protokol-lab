// Shared unit registry. All time-series values are stored in each dimension's
// canonical unit on the server; conversion to the user's preferred unit
// happens at the display layer. Importable from both server (Node ESM) and
// client (Vite) via relative path.

export const DIMENSIONS = {
  mass:        { canonical: 'g',     units: ['g', 'kg', 'lb', 'oz'] },
  length:      { canonical: 'cm',    units: ['cm', 'mm', 'm', 'in', 'ft'] },
  volume:      { canonical: 'ml',    units: ['ml', 'l', 'fl_oz', 'cup'] },
  duration:    { canonical: 's',     units: ['s', 'min', 'hr'] },
  temperature: { canonical: 'C',     units: ['C', 'F'] },
  pressure:    { canonical: 'mmHg',  units: ['mmHg', 'kPa'] },
  percent:     { canonical: '%',     units: ['%'] },
  frequency:   { canonical: 'bpm',   units: ['bpm'] },
  count:       { canonical: 'count', units: ['count'] },
};

// Multiplier from the named unit to its dimension's canonical unit.
// Temperature is excluded because it requires an offset, not a scale.
const LINEAR_FACTORS = {
  g: 1, kg: 1000, lb: 453.59237, oz: 28.349523125,
  cm: 1, mm: 0.1, m: 100, in: 2.54, ft: 30.48,
  ml: 1, l: 1000, fl_oz: 29.5735295625, cup: 240,
  s: 1, min: 60, hr: 3600,
  mmHg: 1, kPa: 7.50061682704,
  '%': 1, bpm: 1, count: 1,
};

const UNIT_LABELS = {
  g: 'g', kg: 'kg', lb: 'lb', oz: 'oz',
  cm: 'cm', mm: 'mm', m: 'm', in: 'in', ft: 'ft',
  ml: 'ml', l: 'L', fl_oz: 'fl oz', cup: 'cup',
  s: 's', min: 'min', hr: 'hr',
  C: '°C', F: '°F',
  mmHg: 'mmHg', kPa: 'kPa',
  '%': '%', bpm: 'bpm', count: '',
};

const UNIT_TO_DIMENSION = (() => {
  const out = {};
  for (const [dim, def] of Object.entries(DIMENSIONS)) {
    for (const u of def.units) out[u] = dim;
  }
  return out;
})();

export function dimensionOf(unit) {
  const d = UNIT_TO_DIMENSION[unit];
  if (!d) throw new Error(`Unknown unit: ${unit}`);
  return d;
}

export function canonicalUnit(dimension) {
  const def = DIMENSIONS[dimension];
  if (!def) throw new Error(`Unknown dimension: ${dimension}`);
  return def.canonical;
}

export function unitsFor(dimension) {
  const def = DIMENSIONS[dimension];
  if (!def) throw new Error(`Unknown dimension: ${dimension}`);
  return def.units.slice();
}

export function unitLabel(unit) {
  return UNIT_LABELS[unit] ?? unit;
}

// Dimensions that have only one unit don't need a user preference picker.
export function isUserSelectable(dimension) {
  return DIMENSIONS[dimension].units.length > 1;
}

export function toCanonical(value, unit) {
  if (value == null || Number.isNaN(value)) return value;
  const dim = dimensionOf(unit);
  if (dim === 'temperature') {
    return unit === 'F' ? (value - 32) * (5 / 9) : value;
  }
  return value * LINEAR_FACTORS[unit];
}

export function fromCanonical(canonicalValue, unit) {
  if (canonicalValue == null || Number.isNaN(canonicalValue)) return canonicalValue;
  const dim = dimensionOf(unit);
  if (dim === 'temperature') {
    return unit === 'F' ? canonicalValue * (9 / 5) + 32 : canonicalValue;
  }
  return canonicalValue / LINEAR_FACTORS[unit];
}

export function convert(value, fromUnit, toUnit) {
  if (fromUnit === toUnit) return value;
  if (dimensionOf(fromUnit) !== dimensionOf(toUnit)) {
    throw new Error(`Cannot convert ${fromUnit} to ${toUnit}: different dimensions`);
  }
  return fromCanonical(toCanonical(value, fromUnit), toUnit);
}

// Resolve the user's preferred unit for a dimension, falling back to canonical.
export function preferredUnit(dimension, prefs = {}) {
  return prefs[dimension] || canonicalUnit(dimension);
}

// Format a canonical value in the user's preferred unit, e.g. "175.2 lb".
export function formatCanonical(canonicalValue, dimension, prefs = {}, opts = {}) {
  if (canonicalValue == null) return '';
  const unit = preferredUnit(dimension, prefs);
  const display = fromCanonical(canonicalValue, unit);
  const decimals = opts.decimals ?? defaultDecimals(unit);
  const text = display.toFixed(decimals);
  const label = unitLabel(unit);
  return label ? `${text} ${label}` : text;
}

function defaultDecimals(unit) {
  if (['kg', 'lb', 'in', 'cm', 'mm', 'm', 'ft', 'C', 'F', 'l', 'fl_oz'].includes(unit)) return 1;
  return 0;
}
