// Auth store — thinnest wrapper around the api/fetch boundary. The value here
// is not re-testing Pinia; it's locking in the *contract* between UI and
// server: what state each call puts the store into, and what errors propagate.
// When the server route shape changes, this test breaks loudly before the UI
// renders an empty/broken screen.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useAuthStore } from '../src/stores/auth.js';

function mockFetchOnce({ status = 200, body = {} } = {}) {
  global.fetch = vi.fn(async () => ({
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  }));
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.restoreAllMocks();
});

describe('auth store — fetchMe', () => {
  it('stores user on 200 and sets checked=true', async () => {
    mockFetchOnce({ body: { user: { id: '1', email: 'me@x.com' } } });
    const store = useAuthStore();
    await store.fetchMe();
    expect(store.user).toEqual({ id: '1', email: 'me@x.com' });
    expect(store.checked).toBe(true);
  });

  it('clears user on 401 and still sets checked=true', async () => {
    mockFetchOnce({ status: 401, body: { error: 'Not authenticated' } });
    const store = useAuthStore();
    store.user = { id: 'stale' };
    await store.fetchMe();
    expect(store.user).toBeNull();
    expect(store.checked).toBe(true);
  });
});

describe('auth store — login', () => {
  it('sets user on success', async () => {
    mockFetchOnce({ body: { user: { id: '1', email: 'me@x.com' } } });
    const store = useAuthStore();
    await store.login('me@x.com', 'passw0rd-ok');
    expect(store.user).toEqual({ id: '1', email: 'me@x.com' });
  });

  it('throws on 401 and leaves user null', async () => {
    mockFetchOnce({ status: 401, body: { error: 'Invalid credentials' } });
    const store = useAuthStore();
    await expect(store.login('me@x.com', 'wrong')).rejects.toThrow();
    expect(store.user).toBeNull();
  });

  it('sends JSON body + credentials:include', async () => {
    mockFetchOnce({ body: { user: { id: '1', email: 'a@b.co' } } });
    const store = useAuthStore();
    await store.login('a@b.co', 'passw0rd-ok');
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/auth/login',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ email: 'a@b.co', password: 'passw0rd-ok' }),
      }),
    );
  });
});

describe('auth store — register', () => {
  it('sets user on 201', async () => {
    mockFetchOnce({ status: 201, body: { user: { id: '1', email: 'me@x.com' } } });
    const store = useAuthStore();
    await store.register('me@x.com', 'passw0rd-ok');
    expect(store.user).toEqual({ id: '1', email: 'me@x.com' });
  });

  it('propagates server error message on 409', async () => {
    mockFetchOnce({ status: 409, body: { error: 'An account with that email already exists' } });
    const store = useAuthStore();
    await expect(store.register('x@y.co', 'passw0rd-ok'))
      .rejects.toThrow(/already exists/i);
  });
});

describe('auth store — logout', () => {
  it('clears user after server 200', async () => {
    mockFetchOnce({ body: { ok: true } });
    const store = useAuthStore();
    store.user = { id: '1' };
    await store.logout();
    expect(store.user).toBeNull();
  });
});

describe('auth store — password reset', () => {
  it('requestPasswordReset posts email (server returns 200 even for unknown)', async () => {
    mockFetchOnce({ body: { ok: true } });
    const store = useAuthStore();
    await store.requestPasswordReset('ghost@nowhere.io');
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/auth/forgot-password',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'ghost@nowhere.io' }),
      }),
    );
  });

  it('resetPassword posts token + password', async () => {
    mockFetchOnce({ body: { ok: true } });
    const store = useAuthStore();
    await store.resetPassword('tok-abc', 'brand-new-pass-123');
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/auth/reset-password',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ token: 'tok-abc', password: 'brand-new-pass-123' }),
      }),
    );
  });

  it('resetPassword propagates 400 as an Error', async () => {
    mockFetchOnce({ status: 400, body: { error: 'Invalid or expired reset link' } });
    const store = useAuthStore();
    await expect(store.resetPassword('bad', 'brand-new-pass-123'))
      .rejects.toThrow(/invalid or expired/i);
  });
});
