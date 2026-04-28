import { api } from './index.js';

export function fetchAdminUsageOverview({ days = 30, limit = 50 } = {}) {
  return api.get(`/api/admin/usage?days=${days}&limit=${limit}`);
}

export function fetchAdminUsers({ q = '', plan = '', page = 1, limit = 50 } = {}) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (plan) params.set('plan', plan);
  params.set('page', String(page));
  params.set('limit', String(limit));
  return api.get(`/api/admin/users?${params}`);
}

export function fetchAdminUserDetail(userId, { days = 30 } = {}) {
  return api.get(`/api/admin/users/${userId}?days=${days}`);
}

export function updateUserPlan(userId, body) {
  return api.patch(`/api/admin/users/${userId}/plan`, body);
}

export function syncUserFromStripe(userId) {
  return api.post(`/api/admin/users/${userId}/stripe-sync`);
}

export function fetchAdminFunnel({ days = 30 } = {}) {
  return api.get(`/api/admin/funnel?days=${days}`);
}
