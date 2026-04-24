import { api } from './index.js';

// ---- Tickets (user) ----
export function fetchMyTickets() {
  return api.get('/api/support/tickets');
}
export function fetchMyTicket(id) {
  return api.get(`/api/support/tickets/${id}`);
}
export function createTicket({ subject, description }) {
  return api.post('/api/support/tickets', { subject, description });
}
export function addTicketMessage(id, { body, attachments }) {
  return api.post(`/api/support/tickets/${id}/messages`, { body, attachments });
}
export function presignTicketAttachment(id, { filename, contentType, bytes }) {
  return api.post(`/api/support/tickets/${id}/attachments/presign`, { filename, contentType, bytes });
}
export function attachTicketFile(id, { s3Key, filename, contentType, bytes }) {
  return api.post(`/api/support/tickets/${id}/attachments`, { s3Key, filename, contentType, bytes });
}

// Upload file directly to S3 via presigned PUT URL.
export async function uploadToSignedUrl(url, file) {
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  });
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
}

// ---- Feature requests ----
export function fetchFeatures({ status = '', q = '', sort = 'top' } = {}) {
  const p = new URLSearchParams();
  if (status) p.set('status', status);
  if (q) p.set('q', q);
  if (sort) p.set('sort', sort);
  return api.get(`/api/support/features?${p}`);
}
export function fetchFeature(id) {
  return api.get(`/api/support/features/${id}`);
}
export function createFeature({ title, description }) {
  return api.post('/api/support/features', { title, description });
}
export function upvoteFeature(id) {
  return api.post(`/api/support/features/${id}/upvote`);
}
export function removeUpvote(id) {
  return api.del(`/api/support/features/${id}/upvote`);
}
export function addFeatureComment(id, body) {
  return api.post(`/api/support/features/${id}/comments`, { body });
}

// ---- User profile (display name) ----
export function updateMyProfile({ displayName }) {
  return api.patch('/api/auth/me', { displayName });
}
