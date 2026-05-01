// HTTP surface for the analysis engine. Thin wrappers around the JS
// functions in /server/src/analysis — both the dashboard and the chat
// agent use the same module, with the chat invoking via direct function
// call (no HTTP) and the dashboard via these endpoints.

import { Router } from 'express';
import {
  insights,
  correlate,
  rankCorrelations,
  partialCorrelate,
  changePoints,
  compare,
  project,
  getSeries,
} from '../analysis/index.js';
import { childLogger, errContext } from '../lib/logger.js';

const log = childLogger('analysis');
const router = Router();

// Parses a comma-separated query param into a non-empty array, or returns
// undefined so callers can apply their own defaults.
function csv(val) {
  if (typeof val !== 'string' || !val.length) return undefined;
  const parts = val.split(',').map((s) => s.trim()).filter(Boolean);
  return parts.length ? parts : undefined;
}

// Cap analysis windows at 5 years. rankAllPairs is O(k²·days), and the
// fetchers pull every log row in range — an unbounded `from=1900-01-01`
// would torch the DB and CPU.
const MAX_RANGE_DAYS = 5 * 365;
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
function rangeTooWide(from, to) {
  if (!from || !to) return false;
  if (typeof from !== 'string' || typeof to !== 'string') return false;
  if (!YMD_RE.test(from) || !YMD_RE.test(to)) return false;
  const f = Date.parse(`${from}T00:00:00Z`);
  const t = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(f) || !Number.isFinite(t)) return false;
  return (t - f) / 86400000 > MAX_RANGE_DAYS;
}
function guardRange(req, res) {
  if (rangeTooWide(req.query.from, req.query.to)) {
    res.status(400).json({ error: 'range_too_wide', maxDays: MAX_RANGE_DAYS });
    return true;
  }
  return false;
}

router.get('/insights', async (req, res) => {
  if (guardRange(req, res)) return;
  const t0 = Date.now();
  try {
    const result = await insights(req.userId, {
      from: req.query.from,
      to: req.query.to,
    });
    (req.log || log).debug(
      { from: result.from, to: result.to, findings: result.findings.length, durationMs: Date.now() - t0 },
      'insights: ok',
    );
    res.json(result);
  } catch (err) {
    (req.log || log).error({ ...errContext(err) }, 'insights: failed');
    res.status(500).json({ error: 'analysis_failed' });
  }
});

router.get('/correlate', async (req, res) => {
  if (!req.query.a || !req.query.b) {
    return res.status(400).json({ error: 'a and b query params required' });
  }
  if (guardRange(req, res)) return;
  try {
    const result = await correlate(req.userId, {
      a: req.query.a,
      b: req.query.b,
      from: req.query.from,
      to: req.query.to,
      lag: req.query.lag === 'auto' ? 'auto' : Number(req.query.lag) || 0,
      maxLag: Number(req.query.maxLag) || 14,
      method: req.query.method === 'spearman' ? 'spearman' : 'pearson',
    });
    res.json(result);
  } catch (err) {
    (req.log || log).error({ ...errContext(err) }, 'correlate: failed');
    res.status(500).json({ error: 'analysis_failed' });
  }
});

router.get('/correlations', async (req, res) => {
  if (!req.query.target) {
    return res.status(400).json({ error: 'target query param required' });
  }
  if (guardRange(req, res)) return;
  try {
    const result = await rankCorrelations(req.userId, {
      target: req.query.target,
      candidates: csv(req.query.candidates),
      from: req.query.from,
      to: req.query.to,
      maxLag: Number(req.query.maxLag) || 14,
    });
    res.json(result);
  } catch (err) {
    (req.log || log).error({ ...errContext(err) }, 'correlations: failed');
    res.status(500).json({ error: 'analysis_failed' });
  }
});

router.get('/partial-correlate', async (req, res) => {
  if (!req.query.a || !req.query.b) {
    return res.status(400).json({ error: 'a and b query params required' });
  }
  if (guardRange(req, res)) return;
  try {
    const result = await partialCorrelate(req.userId, {
      a: req.query.a,
      b: req.query.b,
      controls: csv(req.query.controls) || [],
      from: req.query.from,
      to: req.query.to,
      lag: Number(req.query.lag) || 0,
    });
    res.json(result);
  } catch (err) {
    (req.log || log).error({ ...errContext(err) }, 'partial-correlate: failed');
    res.status(500).json({ error: 'analysis_failed' });
  }
});

router.get('/change-points', async (req, res) => {
  if (!req.query.series) {
    return res.status(400).json({ error: 'series query param required' });
  }
  if (guardRange(req, res)) return;
  try {
    const result = await changePoints(req.userId, {
      series: req.query.series,
      from: req.query.from,
      to: req.query.to,
      window: Number(req.query.window) || 14,
    });
    res.json(result);
  } catch (err) {
    (req.log || log).error({ ...errContext(err) }, 'change-points: failed');
    res.status(500).json({ error: 'analysis_failed' });
  }
});

router.get('/compare', async (req, res) => {
  const series = csv(req.query.series);
  if (!series || !req.query.aFrom || !req.query.aTo || !req.query.bFrom || !req.query.bTo) {
    return res.status(400).json({ error: 'series, aFrom, aTo, bFrom, bTo required' });
  }
  if (rangeTooWide(req.query.aFrom, req.query.aTo) || rangeTooWide(req.query.bFrom, req.query.bTo)) {
    return res.status(400).json({ error: 'range_too_wide', maxDays: MAX_RANGE_DAYS });
  }
  try {
    const result = await compare(req.userId, {
      series,
      aFrom: req.query.aFrom,
      aTo: req.query.aTo,
      bFrom: req.query.bFrom,
      bTo: req.query.bTo,
    });
    res.json(result);
  } catch (err) {
    (req.log || log).error({ ...errContext(err) }, 'compare: failed');
    res.status(500).json({ error: 'analysis_failed' });
  }
});

router.get('/project', async (req, res) => {
  if (!req.query.series) {
    return res.status(400).json({ error: 'series query param required' });
  }
  if (guardRange(req, res)) return;
  try {
    const result = await project(req.userId, {
      series: req.query.series,
      target: req.query.target != null ? Number(req.query.target) : null,
      from: req.query.from,
      to: req.query.to,
    });
    res.json(result);
  } catch (err) {
    (req.log || log).error({ ...errContext(err) }, 'project: failed');
    res.status(500).json({ error: 'analysis_failed' });
  }
});

router.get('/series', async (req, res) => {
  if (!req.query.series || !req.query.from || !req.query.to) {
    return res.status(400).json({ error: 'series, from, to required' });
  }
  if (guardRange(req, res)) return;
  try {
    const result = await getSeries(req.userId, {
      series: req.query.series,
      from: req.query.from,
      to: req.query.to,
    });
    res.json(result);
  } catch (err) {
    (req.log || log).error({ ...errContext(err) }, 'series: failed');
    res.status(500).json({ error: 'analysis_failed' });
  }
});

export default router;
