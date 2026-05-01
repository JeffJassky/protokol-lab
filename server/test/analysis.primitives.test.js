// Pure-math tests for /server/src/analysis/primitives.js. No DB or model
// access — the global setup still spins Mongo, but these tests don't touch
// it. Focus is on the invariants we rely on in the analysis pipeline:
//   - correlations clamp into [-1, 1]
//   - rank-based methods catch monotonic non-linear signal
//   - partial correlation actually removes confounder variance
//   - lag search finds known phase shifts
//   - change-point detection picks up a synthetic slope break
//   - confidence score is monotonic in both |r| and n
//   - projection extrapolates to the target value at the right day

import { describe, it, expect } from 'vitest';
import {
  pearson,
  spearman,
  linearRegression,
  partialCorrelation,
  laggedPearson,
  bestLag,
  changePoints,
  correlationConfidence,
  projectLinear,
} from '../src/analysis/primitives.js';

const close = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

describe('pearson', () => {
  it('returns 1 for a perfect positive linear relationship', () => {
    const xs = [1, 2, 3, 4, 5];
    const ys = [2, 4, 6, 8, 10];
    expect(pearson(xs, ys)).toBe(1);
  });

  it('returns -1 for a perfect negative linear relationship', () => {
    const xs = [1, 2, 3, 4, 5];
    const ys = [10, 8, 6, 4, 2];
    expect(pearson(xs, ys)).toBe(-1);
  });

  it('returns null when either series has zero variance', () => {
    expect(pearson([1, 1, 1, 1], [2, 4, 6, 8])).toBeNull();
    expect(pearson([1, 2, 3, 4], [5, 5, 5, 5])).toBeNull();
  });

  it('returns null for mismatched lengths or n<2', () => {
    expect(pearson([1, 2, 3], [1, 2])).toBeNull();
    expect(pearson([1], [2])).toBeNull();
  });

  it('clamps floating-point overflow into [-1, 1]', () => {
    // Identity correlation with large magnitudes that can drift past 1.0
    // due to fp error; result must still respect the clamp.
    const xs = Array.from({ length: 50 }, (_, i) => i * 1e6);
    const ys = xs.slice();
    const r = pearson(xs, ys);
    expect(r).toBeLessThanOrEqual(1);
    expect(r).toBeGreaterThanOrEqual(-1);
  });
});

describe('spearman', () => {
  it('detects monotonic non-linear signal Pearson would understate', () => {
    // y = x^3 — perfectly monotonic, but Pearson on raw values < 1.
    const xs = [-3, -2, -1, 0, 1, 2, 3];
    const ys = xs.map((x) => x ** 3);
    const sp = spearman(xs, ys);
    const pe = pearson(xs, ys);
    expect(sp).toBe(1);
    expect(pe).toBeLessThan(1);
  });

  it('handles ties via average ranks (no NaN)', () => {
    const xs = [1, 2, 2, 3, 4];
    const ys = [10, 20, 20, 30, 40];
    const r = spearman(xs, ys);
    expect(r).not.toBeNull();
    expect(Number.isFinite(r)).toBe(true);
  });
});

describe('linearRegression', () => {
  it('recovers slope and intercept of a known line', () => {
    // y = 3x + 2
    const xs = [0, 1, 2, 3, 4];
    const ys = xs.map((x) => 3 * x + 2);
    const fit = linearRegression(xs, ys);
    expect(close(fit.slope, 3)).toBe(true);
    expect(close(fit.intercept, 2)).toBe(true);
    expect(close(fit.r2, 1)).toBe(true);
  });

  it('returns null when x has zero variance', () => {
    expect(linearRegression([5, 5, 5, 5], [1, 2, 3, 4])).toBeNull();
  });

  it('produces residuals that sum to ~0 for a clean fit', () => {
    const xs = [0, 1, 2, 3, 4];
    const ys = xs.map((x) => 2 * x + 1);
    const fit = linearRegression(xs, ys);
    const sum = fit.residuals.reduce((s, v) => s + v, 0);
    expect(close(sum, 0)).toBe(true);
  });
});

describe('partialCorrelation', () => {
  it('drops to ~0 when the apparent correlation is fully driven by a confounder', () => {
    // C is the common driver; A and B are A = C + small noise, B = C + small
    // noise. Naive Pearson(A, B) is ~1. Partial correlation controlling for
    // C should be near 0 — there's no remaining association once C is
    // removed.
    const n = 60;
    const cVals = Array.from({ length: n }, (_, i) => i);
    let seed = 7;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return (seed / 0x7fffffff) - 0.5;
    };
    const aVals = cVals.map((c) => c + rand() * 0.01);
    const bVals = cVals.map((c) => c + rand() * 0.01);
    const naive = pearson(aVals, bVals);
    const partial = partialCorrelation(aVals, bVals, [cVals]);
    expect(naive).toBeGreaterThan(0.99);
    expect(Math.abs(partial)).toBeLessThan(0.5);
  });

  it('falls back to plain pearson when controls is empty', () => {
    const xs = [1, 2, 3, 4, 5];
    const ys = [2, 4, 6, 8, 10];
    expect(partialCorrelation(xs, ys, [])).toBe(1);
  });

  it('returns null for collinear / singular control set', () => {
    const xs = [1, 2, 3, 4, 5];
    const ys = [2, 4, 6, 8, 10];
    // Two identical control columns → singular X^T X.
    const c = [1, 2, 3, 4, 5];
    expect(partialCorrelation(xs, ys, [c, c])).toBeNull();
  });
});

describe('laggedPearson', () => {
  it('finds a positive correlation at the true phase shift', () => {
    // B is A shifted forward by 3 steps: B[i] = A[i-3]. So pairing A[i]
    // with B[i+3] (lag = +3) should recover the strong correlation.
    const a = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const b = [0, 0, 0, 1, 2, 3, 4, 5, 6, 7];
    const r0 = laggedPearson(a, b, 0);
    const r3 = laggedPearson(a, b, 3);
    expect(r3.r).toBeGreaterThan(0.99);
    expect(r3.lag).toBe(3);
    expect(r3.n).toBe(7);
    expect(Math.abs(r3.r)).toBeGreaterThan(Math.abs(r0.r));
  });

  it('handles negative lags symmetrically', () => {
    const a = [0, 0, 0, 1, 2, 3, 4, 5, 6, 7];
    const b = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const r = laggedPearson(a, b, -3);
    expect(r.r).toBeGreaterThan(0.99);
    expect(r.lag).toBe(-3);
  });

  it('returns null when lag eats too much of the series', () => {
    expect(laggedPearson([1, 2], [3, 4], 5)).toBeNull();
  });
});

describe('bestLag', () => {
  it('returns the lag that maximizes |r|', () => {
    // A monotonic A would correlate with itself at any lag, so the lag
    // search has no unique maximum. Use a non-linear A so only the true
    // phase shift produces a perfect match.
    const a = [3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5, 8];
    // B is A shifted forward by 3: B[i] = A[i-3] for i ≥ 3.
    const b = [0, 0, 0, 3, 1, 4, 1, 5, 9, 2, 6, 5];
    const best = bestLag(a, b, 5);
    expect(best.lag).toBe(3);
    expect(best.r).toBeGreaterThan(0.99);
  });

  it('returns null when both series are flat across every lag', () => {
    const a = [5, 5, 5, 5, 5, 5, 5];
    const b = [9, 9, 9, 9, 9, 9, 9];
    expect(bestLag(a, b, 2)).toBeNull();
  });
});

describe('changePoints', () => {
  it('detects a synthetic slope break near the true location', () => {
    // 20 days, break at index 10. Window=5: with a 5-point window the
    // local stdev of an arithmetic progression is small enough relative
    // to a |Δslope|=0.6 break to clear the normalized > 0.5 threshold.
    // Larger windows over a clean piecewise-linear signal under-fire
    // because the slope itself dominates the in-window variance — that's
    // a documented property of the detector, not a bug.
    const window = 5;
    const n = 20;
    const xs = Array.from({ length: n }, (_, i) => i);
    const ys = xs.map((x) => (x < 10 ? x * 0.1 : 10 * 0.1 + (x - 10) * -0.5));
    const points = changePoints(xs, ys, { window });
    expect(points.length).toBeGreaterThan(0);
    const top = points.sort((a, b) => b.normalized - a.normalized)[0];
    expect(Math.abs(top.index - 10)).toBeLessThanOrEqual(window);
  });

  it('returns no points for a clean linear trend', () => {
    const xs = Array.from({ length: 60 }, (_, i) => i);
    const ys = xs.map((x) => 2 * x + 1);
    expect(changePoints(xs, ys, { window: 10 })).toEqual([]);
  });

  it('returns [] when there are not enough points for two windows', () => {
    const xs = [0, 1, 2, 3, 4];
    const ys = [0, 1, 2, 3, 4];
    expect(changePoints(xs, ys, { window: 10 })).toEqual([]);
  });
});

describe('correlationConfidence', () => {
  it('is monotonic non-decreasing in n at fixed |r|', () => {
    const r = 0.5;
    const a = correlationConfidence(r, 7);
    const b = correlationConfidence(r, 14);
    const c = correlationConfidence(r, 60);
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
  });

  it('is monotonic non-decreasing in |r| at fixed n', () => {
    const n = 30;
    expect(correlationConfidence(0.1, n)).toBeLessThan(correlationConfidence(0.5, n));
    expect(correlationConfidence(-0.5, n)).toBeLessThan(correlationConfidence(-0.9, n));
  });

  it('returns 0 for null/invalid inputs', () => {
    expect(correlationConfidence(null, 30)).toBe(0);
    expect(correlationConfidence(0.5, 1)).toBe(0);
    expect(correlationConfidence(NaN, 30)).toBe(0);
  });
});

describe('projectLinear', () => {
  it('estimates the day a series will cross a target value', () => {
    // y = 200 - 0.5 x. Last x = 14, last y = 193. Target 180 → need 26 more
    // days from last x (193 - 180 = 13 / 0.5).
    const xs = Array.from({ length: 15 }, (_, i) => i);
    const ys = xs.map((x) => 200 - 0.5 * x);
    const out = projectLinear(xs, ys, { target: 180 });
    expect(close(out.slope, -0.5)).toBe(true);
    // targetReachedDay is in absolute x-units; should be at x = 14 + 26 = 40.
    expect(close(out.targetReachedDay, 40, 1e-3)).toBe(true);
    expect(out.projection.length).toBeGreaterThan(0);
  });

  it('does not set targetReachedDay when the trend points away from the target', () => {
    // Going up; target is below — never reached.
    const xs = [0, 1, 2, 3, 4];
    const ys = [10, 11, 12, 13, 14];
    const out = projectLinear(xs, ys, { target: 5 });
    expect(out.targetReachedDay).toBeNull();
  });

  it('returns null when the underlying regression has no slope info', () => {
    // Zero variance in x → linearRegression returns null → projectLinear null.
    const xs = [3, 3, 3, 3];
    const ys = [1, 2, 3, 4];
    expect(projectLinear(xs, ys, { target: 10 })).toBeNull();
  });
});
