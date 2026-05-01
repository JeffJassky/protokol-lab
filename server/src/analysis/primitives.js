// Pure statistical primitives — no domain knowledge, no DB access, no I/O.
// Each function takes plain arrays of finite numbers and returns plain
// numbers/objects. This module is the math floor for everything in
// /server/src/analysis/* and is freely unit-testable in isolation.
//
// Design notes:
// - Inputs must be aligned (same length, same x-positions) and contain only
//   finite numbers. Caller is responsible for filtering nulls/NaN before
//   calling these — see series.js for the alignment + null-filtering logic.
// - Correlations return r in [-1, 1] plus n (sample size) so the caller can
//   apply downstream confidence/sample-size rules.
// - Where a computation isn't well-defined (e.g., zero variance), functions
//   return null rather than NaN so consumers can branch cleanly.

function mean(arr) {
  if (!arr.length) return 0;
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += arr[i];
  return s / arr.length;
}

function variance(arr, mu) {
  if (arr.length < 2) return 0;
  const m = mu ?? mean(arr);
  let s = 0;
  for (let i = 0; i < arr.length; i++) {
    const d = arr[i] - m;
    s += d * d;
  }
  return s / (arr.length - 1);
}

function stdev(arr, mu) {
  return Math.sqrt(variance(arr, mu));
}

// Pearson product-moment correlation. Linear, scale-invariant.
// Returns null if either array has zero variance (line is flat → no
// correlation defined) or n < 2.
export function pearson(xs, ys) {
  if (!Array.isArray(xs) || !Array.isArray(ys)) return null;
  if (xs.length !== ys.length) return null;
  const n = xs.length;
  if (n < 2) return null;

  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let dxSq = 0;
  let dySq = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    num += dx * dy;
    dxSq += dx * dx;
    dySq += dy * dy;
  }
  if (dxSq === 0 || dySq === 0) return null;
  const r = num / Math.sqrt(dxSq * dySq);
  // Floating-point can push r slightly outside [-1, 1].
  if (r > 1) return 1;
  if (r < -1) return -1;
  return r;
}

// Convert values to ranks (average ranks for ties). Used by Spearman.
function ranks(arr) {
  const indexed = arr.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => a.v - b.v);
  const out = new Array(arr.length);
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    while (j + 1 < indexed.length && indexed[j + 1].v === indexed[i].v) j++;
    // Average rank for ties; ranks are 1-based to match standard convention.
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) out[indexed[k].i] = avg;
    i = j + 1;
  }
  return out;
}

// Spearman rank correlation. Captures monotonic non-linear relationships
// where Pearson would understate the signal. Implemented as Pearson over
// the rank-transformed inputs.
export function spearman(xs, ys) {
  if (!Array.isArray(xs) || !Array.isArray(ys)) return null;
  if (xs.length !== ys.length || xs.length < 2) return null;
  return pearson(ranks(xs), ranks(ys));
}

// Linear regression y = slope * x + intercept via ordinary least squares.
// Returns null if x has zero variance (vertical line undefined).
// Useful for trend lines, projection, and as the residual machinery for
// partial correlation.
export function linearRegression(xs, ys) {
  if (!Array.isArray(xs) || !Array.isArray(ys)) return null;
  if (xs.length !== ys.length || xs.length < 2) return null;
  const n = xs.length;
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    num += dx * (ys[i] - my);
    den += dx * dx;
  }
  if (den === 0) return null;
  const slope = num / den;
  const intercept = my - slope * mx;
  // Residuals — needed by partial correlation. Cheap to compute here once.
  const residuals = new Array(n);
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    const yhat = slope * xs[i] + intercept;
    const r = ys[i] - yhat;
    residuals[i] = r;
    ssRes += r * r;
    const dy = ys[i] - my;
    ssTot += dy * dy;
  }
  const r2 = ssTot === 0 ? null : 1 - ssRes / ssTot;
  return { slope, intercept, residuals, r2, n };
}

// Multiple linear regression with K predictor columns + intercept via the
// normal equations (X^T X β = X^T y). Used internally by partialCorrelation
// when the caller wants to control for >1 confounder.
//
// We keep the implementation small (no external matrix library) and rely on
// straightforward Gaussian elimination. This is correct for our typical sizes
// (2-5 controls × tens to hundreds of rows), not optimized for very large K.
function multipleRegressionResiduals(predictorCols, ys) {
  const n = ys.length;
  const k = predictorCols.length;
  // Build design matrix X with leading 1-column for intercept: shape n × (k+1).
  const cols = k + 1;
  // Normal equations: A = X^T X (cols × cols), b = X^T y (cols).
  const A = [];
  for (let i = 0; i < cols; i++) A.push(new Array(cols).fill(0));
  const b = new Array(cols).fill(0);
  for (let row = 0; row < n; row++) {
    const xrow = new Array(cols);
    xrow[0] = 1;
    for (let j = 0; j < k; j++) xrow[j + 1] = predictorCols[j][row];
    for (let i = 0; i < cols; i++) {
      b[i] += xrow[i] * ys[row];
      for (let j = 0; j < cols; j++) A[i][j] += xrow[i] * xrow[j];
    }
  }
  // Solve A β = b via Gaussian elimination with partial pivoting.
  const beta = solveLinearSystem(A, b);
  if (!beta) return null;
  // Compute residuals.
  const residuals = new Array(n);
  for (let row = 0; row < n; row++) {
    let yhat = beta[0];
    for (let j = 0; j < k; j++) yhat += beta[j + 1] * predictorCols[j][row];
    residuals[row] = ys[row] - yhat;
  }
  return residuals;
}

function solveLinearSystem(A, b) {
  const n = A.length;
  // Build augmented matrix.
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    // Partial pivot: find row with largest |M[r][col]| at or below current row.
    let pivot = col;
    let pivotMag = Math.abs(M[col][col]);
    for (let r = col + 1; r < n; r++) {
      const mag = Math.abs(M[r][col]);
      if (mag > pivotMag) {
        pivot = r;
        pivotMag = mag;
      }
    }
    if (pivotMag < 1e-12) return null; // singular / collinear predictors
    if (pivot !== col) [M[col], M[pivot]] = [M[pivot], M[col]];
    // Eliminate below.
    for (let r = col + 1; r < n; r++) {
      const factor = M[r][col] / M[col][col];
      for (let c = col; c <= n; c++) M[r][c] -= factor * M[col][c];
    }
  }
  // Back-substitute.
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let c = r + 1; c < n; c++) s -= M[r][c] * x[c];
    x[r] = s / M[r][r];
  }
  return x;
}

// Partial correlation between A and B, controlling for one or more
// confounder series. Implementation: regress A and B separately on the
// controls, then compute Pearson over the residuals. Reveals the
// "remaining" association between A and B once shared variance with the
// controls is removed.
//
// Example: protein vs weight controlling for calories asks "does protein
// add explanatory power beyond what calories already explain?" Answers
// the classic confounder problem.
export function partialCorrelation(aValues, bValues, controlCols) {
  if (!Array.isArray(aValues) || !Array.isArray(bValues)) return null;
  if (aValues.length !== bValues.length) return null;
  if (!Array.isArray(controlCols) || controlCols.length === 0) {
    return pearson(aValues, bValues);
  }
  for (const col of controlCols) {
    if (!Array.isArray(col) || col.length !== aValues.length) return null;
  }
  const n = aValues.length;
  if (n < controlCols.length + 3) return null; // not enough degrees of freedom

  const aRes = multipleRegressionResiduals(controlCols, aValues);
  const bRes = multipleRegressionResiduals(controlCols, bValues);
  if (!aRes || !bRes) return null;
  return pearson(aRes, bRes);
}

// Lagged Pearson correlation. `lag > 0` means "B lags A by lag steps" —
// i.e., A[i] is paired with B[i+lag], so a positive correlation at lag=5
// reads as "A today predicts B 5 days from now."
//
// The aligned slice drops the first/last `|lag|` entries since they have
// no counterpart. Caller passes pre-aligned daily arrays; this function
// just slices them.
export function laggedPearson(aValues, bValues, lag) {
  if (!Array.isArray(aValues) || !Array.isArray(bValues)) return null;
  if (aValues.length !== bValues.length) return null;
  const lagInt = Math.trunc(lag) | 0;
  const n = aValues.length;
  if (n - Math.abs(lagInt) < 2) return null;
  let xs;
  let ys;
  if (lagInt === 0) {
    xs = aValues;
    ys = bValues;
  } else if (lagInt > 0) {
    xs = aValues.slice(0, n - lagInt);
    ys = bValues.slice(lagInt);
  } else {
    xs = aValues.slice(-lagInt);
    ys = bValues.slice(0, n + lagInt);
  }
  const r = pearson(xs, ys);
  return r == null ? null : { r, lag: lagInt, n: xs.length };
}

// Search for the lag in [-maxLag, maxLag] that maximizes |r|. Returns the
// best result (or null if none found). Used for "auto" lag selection in
// the high-level correlate() — answers "what time-shift makes these two
// series most related?"
export function bestLag(aValues, bValues, maxLag = 14) {
  let best = null;
  const cap = Math.max(0, Math.trunc(maxLag) | 0);
  for (let lag = -cap; lag <= cap; lag++) {
    const result = laggedPearson(aValues, bValues, lag);
    if (!result) continue;
    if (!best || Math.abs(result.r) > Math.abs(best.r)) best = result;
  }
  return best;
}

// Sliding-window change-point detection. Walks across the series with two
// adjacent windows (of size `window` days each) and computes the slope
// difference at each candidate split. Returns positions where the slope
// shift exceeds `threshold` standard deviations of the local noise.
//
// This is intentionally simple — it catches the obvious "weight loss
// accelerated 3 weeks ago" pattern without the heavy machinery of PELT.
// `xs` is the time index (typically 0..n-1, days from window start).
export function changePoints(xs, ys, { window = 14, minMagnitude = 0.5 } = {}) {
  if (!Array.isArray(xs) || !Array.isArray(ys)) return [];
  if (xs.length !== ys.length) return [];
  if (xs.length < window * 2 + 1) return [];

  const points = [];
  for (let i = window; i <= ys.length - window; i++) {
    const leftXs = xs.slice(i - window, i);
    const leftYs = ys.slice(i - window, i);
    const rightXs = xs.slice(i, i + window);
    const rightYs = ys.slice(i, i + window);
    const left = linearRegression(leftXs, leftYs);
    const right = linearRegression(rightXs, rightYs);
    if (!left || !right) continue;
    const magnitude = Math.abs(right.slope - left.slope);
    // Use the larger of the two side standard deviations as the "local
    // noise" yardstick — keeps the threshold scale-aware.
    const sd = Math.max(stdev(leftYs), stdev(rightYs));
    if (sd === 0) continue;
    const normalized = magnitude / sd;
    if (normalized < minMagnitude) continue;
    points.push({
      index: i,
      beforeSlope: left.slope,
      afterSlope: right.slope,
      magnitude,
      normalized,
    });
  }
  // Greedy peak-pick: collapse runs of overlapping change points within one
  // window of each other into the strongest one.
  points.sort((a, b) => b.normalized - a.normalized);
  const picked = [];
  for (const p of points) {
    if (picked.some((q) => Math.abs(q.index - p.index) < window)) continue;
    picked.push(p);
  }
  picked.sort((a, b) => a.index - b.index);
  return picked;
}

// Confidence score [0, 1] for a correlation result. Combines the magnitude
// of |r| with the sample size n via a smooth-saturating formula. Used by
// the insights aggregator to rank findings — weak correlations on tiny
// samples score very low even if |r| looks impressive.
//
// Tuned heuristically:
//   confidence ≈ |r| * sigmoid((n - 14) / 14)
// At n=14, sigmoid term is 0.5. At n=42 (~3x), it's ~0.95. At n=7, ~0.27.
export function correlationConfidence(r, n) {
  if (r == null || !Number.isFinite(r)) return 0;
  if (!Number.isFinite(n) || n < 2) return 0;
  const sample = 1 / (1 + Math.exp(-(n - 14) / 14));
  return Math.abs(r) * sample;
}

// Project a linear trend forward from the most recent window of values.
// Returns the estimated slope and a per-day projection array reaching the
// target value (if provided). `xs` should be days-from-start.
export function projectLinear(xs, ys, { target = null, maxDays = 365 } = {}) {
  const fit = linearRegression(xs, ys);
  if (!fit) return null;
  const lastX = xs[xs.length - 1];
  const lastY = ys[ys.length - 1];
  const projection = [];
  let targetReachedDay = null;
  if (target != null && Number.isFinite(target) && fit.slope !== 0) {
    // Days from lastX until y crosses target.
    const days = (target - lastY) / fit.slope;
    // Only meaningful if heading toward the target.
    if (days > 0 && days < maxDays) targetReachedDay = lastX + days;
  }
  // Always emit a sparse projection (every 7 days for up to 12 weeks)
  // for use as a forward-line in the dashboard.
  const limit = Math.min(maxDays, targetReachedDay != null ? targetReachedDay - lastX + 14 : 84);
  for (let d = 7; d <= limit; d += 7) {
    const x = lastX + d;
    projection.push({ daysFromNow: d, value: fit.intercept + fit.slope * x });
  }
  return {
    slope: fit.slope,
    intercept: fit.intercept,
    r2: fit.r2,
    projection,
    targetReachedDay,
    n: fit.n,
  };
}

// Re-export internal helpers that are useful to the rest of the analysis
// module (e.g., series.js uses mean/stdev for daily-aggregate summaries).
export { mean, variance, stdev };
