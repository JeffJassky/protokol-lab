// All API calls go through this thin client. basePath is resolved from
// the global the server injects at SPA shell render time. In dev (vite
// server), there's no host — point at a default and CORS-share it from
// the host app, or just don't run dev mode without the host running.

const BASE = (typeof window !== 'undefined' && window.__MARKETING_BASE__) || '/admin/marketing';

async function request(method, path, body) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return res.json();
}

export const api = {
  health: () => request('GET', '/health'),
  prompts: {
    list: () => request('GET', '/prompts'),
    get: (key) => request('GET', `/prompts/${encodeURIComponent(key)}`),
    history: (key) => request('GET', `/prompts/${encodeURIComponent(key)}/history`),
    save: (key, body) => request('PATCH', `/prompts/${encodeURIComponent(key)}`, { body }),
    restoreDefault: (key) => request('POST', `/prompts/${encodeURIComponent(key)}/restore-default`),
    activateVersion: (key, version) =>
      request('POST', `/prompts/${encodeURIComponent(key)}/activate-version`, { version }),
    test: (key, context, useLlm = false) =>
      request('POST', `/prompts/${encodeURIComponent(key)}/test`, { context, useLlm }),
  },
  usage: {
    summary: () => request('GET', '/usage/summary'),
  },
  contacts: {
    list: (params = {}) => request('GET', `/contacts?${qs(params)}`),
    create: (body) => request('POST', '/contacts', body),
    get: (id) => request('GET', `/contacts/${id}`),
    update: (id, body) => request('PATCH', `/contacts/${id}`, body),
    remove: (id) => request('DELETE', `/contacts/${id}`),
    classify: (id) => request('POST', `/contacts/${id}/classify`),
    voices: () => request('GET', '/contacts/voices'),
    findOrCreateByPresence: (body) => request('POST', '/contacts/find-or-create-by-presence', body),
    importMany: (contacts) => request('POST', '/contacts/import', { contacts }),
  },
  research: {
    enqueue: (contactId, listId, budgetCapUsd) =>
      request('POST', '/influencers/research/jobs', { contactId, listId, budgetCapUsd }),
    enqueueBulk: (params) => request('POST', '/influencers/research/jobs/bulk', params),
    listJobs: (params = {}) => request('GET', `/influencers/research/jobs?${qs(params)}`),
    getJob: (id) => request('GET', `/influencers/research/jobs/${id}`),
    cancelJob: (id) => request('POST', `/influencers/research/jobs/${id}/cancel`),
    streamUrl: (id) => `${BASE}/api/influencers/research/jobs/${id}/stream`,
  },
  drafts: {
    list: (params = {}) => request('GET', `/influencers/drafts?${qs(params)}`),
    create: (params) => request('POST', '/influencers/drafts', params),
    get: (id) => request('GET', `/influencers/drafts/${id}`),
    update: (id, body) => request('PATCH', `/influencers/drafts/${id}`, body),
    approve: (id) => request('POST', `/influencers/drafts/${id}/approve`),
    markSent: (id) => request('POST', `/influencers/drafts/${id}/mark-sent`),
    discard: (id) => request('POST', `/influencers/drafts/${id}/discard`),
  },
  redditEngagement: {
    listSubreddits: () => request('GET', '/reddit-engagement/subreddits'),
    createSubreddit: (body) => request('POST', '/reddit-engagement/subreddits', body),
    getSubreddit: (id) => request('GET', `/reddit-engagement/subreddits/${id}`),
    updateSubreddit: (id, body) => request('PATCH', `/reddit-engagement/subreddits/${id}`, body),
    deleteSubreddit: (id) => request('DELETE', `/reddit-engagement/subreddits/${id}`),
    scanNow: (id) => request('POST', `/reddit-engagement/subreddits/${id}/scan-now`),

    listOpportunities: (params = {}) =>
      request('GET', `/reddit-engagement/opportunities?${qs(params)}`),
    getOpportunity: (id) => request('GET', `/reddit-engagement/opportunities/${id}`),
    updateOpportunity: (id, body) => request('PATCH', `/reddit-engagement/opportunities/${id}`, body),
    triage: (id) => request('POST', `/reddit-engagement/opportunities/${id}/triage`),
    draft: (id, steeringNote) =>
      request('POST', `/reddit-engagement/opportunities/${id}/draft`, { steeringNote }),
    dismiss: (id) => request('POST', `/reddit-engagement/opportunities/${id}/dismiss`),
    markPosted: (id, commentUrl) =>
      request('POST', `/reddit-engagement/opportunities/${id}/mark-posted`, { commentUrl }),
    refreshPerformance: (id) =>
      request('POST', `/reddit-engagement/opportunities/${id}/refresh-performance`),
    linkAuthorToContact: (id, contactId) =>
      request('POST', `/reddit-engagement/opportunities/${id}/link-author-to-contact`, { contactId }),

    listRuns: (params = {}) => request('GET', `/reddit-engagement/runs?${qs(params)}`),
  },
  lists: {
    list: () => request('GET', '/contact-lists'),
    create: (body) => request('POST', '/contact-lists', body),
    get: (id) => request('GET', `/contact-lists/${id}`),
    update: (id, body) => request('PATCH', `/contact-lists/${id}`, body),
    remove: (id) => request('DELETE', `/contact-lists/${id}`),
    addMembers: (id, contactIds) =>
      request('POST', `/contact-lists/${id}/contacts`, { contactIds }),
    removeMember: (id, contactId) =>
      request('DELETE', `/contact-lists/${id}/contacts/${contactId}`),
  },
};

function qs(params) {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    usp.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  return usp.toString();
}

export function basePath() {
  return BASE;
}
