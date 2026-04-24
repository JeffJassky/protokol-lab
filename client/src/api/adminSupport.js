import { api } from './index.js';

// ---- Tickets (admin) ----
export function fetchAdminTickets({ status = '', q = '', userId = '', page = 1, limit = 50 } = {}) {
  const p = new URLSearchParams();
  if (status) p.set('status', status);
  if (q) p.set('q', q);
  if (userId) p.set('userId', userId);
  p.set('page', String(page));
  p.set('limit', String(limit));
  return api.get(`/api/admin/support/tickets?${p}`);
}
export function fetchAdminTicket(id) {
  return api.get(`/api/admin/support/tickets/${id}`);
}
export function updateAdminTicket(id, body) {
  return api.patch(`/api/admin/support/tickets/${id}`, body);
}
export function replyAdminTicket(id, body) {
  return api.post(`/api/admin/support/tickets/${id}/messages`, { body });
}
export function deleteAdminTicket(id) {
  return api.del(`/api/admin/support/tickets/${id}`);
}

// ---- Feature requests (admin) ----
export function fetchAdminFeatures({ status = '', q = '' } = {}) {
  const p = new URLSearchParams();
  if (status) p.set('status', status);
  if (q) p.set('q', q);
  return api.get(`/api/admin/support/features?${p}`);
}
export function fetchAdminFeature(id) {
  return api.get(`/api/admin/support/features/${id}`);
}
export function updateAdminFeature(id, body) {
  return api.patch(`/api/admin/support/features/${id}`, body);
}
export function deleteAdminFeature(id) {
  return api.del(`/api/admin/support/features/${id}`);
}

// ---- Nav badge ----
export function fetchAdminSupportSummary() {
  return api.get('/api/admin/support/summary');
}
