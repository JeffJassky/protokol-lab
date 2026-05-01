import { api } from './index.js';

function qs(params) {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === '') continue;
    usp.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  const s = usp.toString();
  return s ? `?${s}` : '';
}

export function fetchInsights({ from, to } = {}) {
  return api.get(`/api/analysis/insights${qs({ from, to })}`);
}

export function correlate({ a, b, from, to, lag, method } = {}) {
  return api.get(`/api/analysis/correlate${qs({ a, b, from, to, lag, method })}`);
}

export function rankCorrelations({ target, candidates, from, to, maxLag } = {}) {
  return api.get(`/api/analysis/correlations${qs({ target, candidates, from, to, maxLag })}`);
}

export function partialCorrelate({ a, b, controls, from, to, lag } = {}) {
  return api.get(`/api/analysis/partial-correlate${qs({ a, b, controls, from, to, lag })}`);
}

export function fetchChangePoints({ series, from, to, window: win } = {}) {
  return api.get(`/api/analysis/change-points${qs({ series, from, to, window: win })}`);
}

export function compareWindows({ series, aFrom, aTo, bFrom, bTo } = {}) {
  return api.get(`/api/analysis/compare${qs({ series, aFrom, aTo, bFrom, bTo })}`);
}

export function projectSeries({ series, target, from, to } = {}) {
  return api.get(`/api/analysis/project${qs({ series, target, from, to })}`);
}

export function getSeriesDaily({ series, from, to } = {}) {
  return api.get(`/api/analysis/series${qs({ series, from, to })}`);
}
