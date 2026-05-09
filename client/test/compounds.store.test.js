// Compounds store — unified canonical + custom list. Locks in the
// polymorphic identity / write-routing contract documented in
// stores/compounds.js. The server returns one merged list with a
// `source` discriminator; UI components dispatch updates to the right
// endpoint via the store helpers without re-checking the source field.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

// Vitest hoists vi.mock above all imports — so the factory must
// construct its own state inline rather than referencing a top-level
// variable. We grab the mock back out via vi.mocked() inside each test.
vi.mock('../src/api/index.js', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    del: vi.fn(),
  },
  registerPlanLimitHandler: vi.fn(),
}));

import { api } from '../src/api/index.js';
const apiMock = api;

const sample = [
  {
    source: 'core',
    coreInterventionKey: 'tirzepatide',
    name: 'Tirzepatide',
    brandNames: ['Mounjaro', 'Zepbound'],
    enabled: true,
    halfLifeDays: 5,
    intervalDays: 7,
    doseUnit: 'mg',
    color: '#10b981',
    kineticsShape: 'subq',
    order: 1000,
  },
  {
    source: 'core',
    coreInterventionKey: 'semaglutide',
    name: 'Semaglutide',
    brandNames: ['Ozempic', 'Wegovy'],
    enabled: false,
    halfLifeDays: 7,
    intervalDays: 7,
    doseUnit: 'mg',
    color: '#3b82f6',
    kineticsShape: 'depot',
    order: 1000,
  },
  {
    _id: 'custom-1',
    source: 'custom',
    coreInterventionKey: null,
    name: 'My research peptide',
    brandNames: [],
    enabled: true,
    halfLifeDays: 0.5,
    intervalDays: 1,
    doseUnit: 'mcg',
    color: '#ff0000',
    kineticsShape: 'subq',
    order: 0,
  },
];

beforeEach(() => {
  setActivePinia(createPinia());
  for (const fn of Object.values(apiMock)) fn.mockReset();
});

import { useCompoundsStore } from '../src/stores/compounds.js';

describe('compounds store — unified list', () => {
  it('fetchAll populates the merged list and partitions by source', async () => {
    apiMock.get.mockResolvedValueOnce({ compounds: sample });
    const store = useCompoundsStore();
    await store.fetchAll();
    expect(store.compounds).toHaveLength(3);
    expect(store.canonical).toHaveLength(2);
    expect(store.custom).toHaveLength(1);
    expect(store.custom[0]._id).toBe('custom-1');
    expect(store.canonical.map((c) => c.coreInterventionKey).sort())
      .toEqual(['semaglutide', 'tirzepatide']);
  });

  it('enabled filter respects the per-row flag for both sources', async () => {
    apiMock.get.mockResolvedValueOnce({ compounds: sample });
    const store = useCompoundsStore();
    await store.fetchAll();
    expect(store.enabled.map((c) => c.name)).toEqual([
      'Tirzepatide',
      'My research peptide',
    ]);
  });
});

describe('compounds store — write routing', () => {
  it('createCustom POSTs and pushes the row into the merged list', async () => {
    apiMock.get.mockResolvedValueOnce({ compounds: [] });
    apiMock.post.mockResolvedValueOnce({
      compound: {
        _id: 'new-1',
        source: 'custom',
        coreInterventionKey: null,
        name: 'New custom',
        brandNames: [],
        enabled: true,
        halfLifeDays: 1,
        intervalDays: 1,
        doseUnit: 'mg',
        color: '',
        kineticsShape: 'subq',
        order: 0,
      },
    });
    const store = useCompoundsStore();
    await store.fetchAll();
    const created = await store.createCustom({
      name: 'New custom', halfLifeDays: 1, intervalDays: 1,
    });
    expect(created._id).toBe('new-1');
    expect(apiMock.post).toHaveBeenCalledWith('/api/compounds', expect.objectContaining({
      name: 'New custom',
    }));
    expect(store.compounds.some((c) => c._id === 'new-1')).toBe(true);
  });

  it('update with source=core hits the canonical endpoint', async () => {
    apiMock.get.mockResolvedValueOnce({ compounds: sample });
    apiMock.patch.mockResolvedValueOnce({
      compound: { ...sample[0], enabled: false },
    });
    const store = useCompoundsStore();
    await store.fetchAll();
    await store.update('tirzepatide', { enabled: false }, { source: 'core' });
    expect(apiMock.patch).toHaveBeenCalledWith(
      '/api/compounds/core/tirzepatide',
      { enabled: false },
    );
    const tirz = store.compounds.find(
      (c) => c.source === 'core' && c.coreInterventionKey === 'tirzepatide',
    );
    expect(tirz.enabled).toBe(false);
  });

  it('update with source=custom hits the by-id endpoint', async () => {
    apiMock.get.mockResolvedValueOnce({ compounds: sample });
    apiMock.patch.mockResolvedValueOnce({
      compound: { ...sample[2], color: '#00ff00' },
    });
    const store = useCompoundsStore();
    await store.fetchAll();
    await store.update('custom-1', { color: '#00ff00' }, { source: 'custom' });
    expect(apiMock.patch).toHaveBeenCalledWith(
      '/api/compounds/custom-1',
      { color: '#00ff00' },
    );
    const custom = store.compounds.find((c) => c._id === 'custom-1');
    expect(custom.color).toBe('#00ff00');
  });

  it('remove drops only the matching custom row from the merged list', async () => {
    apiMock.get.mockResolvedValueOnce({ compounds: sample });
    apiMock.del.mockResolvedValueOnce({});
    const store = useCompoundsStore();
    await store.fetchAll();
    await store.remove('custom-1');
    expect(apiMock.del).toHaveBeenCalledWith('/api/compounds/custom-1');
    expect(store.compounds.some((c) => c._id === 'custom-1')).toBe(false);
    // Canonical entries untouched.
    expect(store.compounds.filter((c) => c.source === 'core')).toHaveLength(2);
  });
});

describe('compounds store — getByRef', () => {
  beforeEach(async () => {
    apiMock.get.mockResolvedValueOnce({ compounds: sample });
  });

  it('resolves a canonical compound by intervention key', async () => {
    const store = useCompoundsStore();
    await store.fetchAll();
    const sema = store.getByRef({ coreInterventionKey: 'semaglutide' });
    expect(sema).toBeTruthy();
    expect(sema.source).toBe('core');
  });

  it('resolves a custom compound by _id', async () => {
    const store = useCompoundsStore();
    await store.fetchAll();
    const custom = store.getByRef({ compoundId: 'custom-1' });
    expect(custom).toBeTruthy();
    expect(custom.source).toBe('custom');
  });

  it('returns null when neither ref resolves', async () => {
    const store = useCompoundsStore();
    await store.fetchAll();
    expect(store.getByRef({ coreInterventionKey: 'unknown' })).toBeNull();
    expect(store.getByRef({ compoundId: 'nope' })).toBeNull();
    expect(store.getByRef({})).toBeNull();
  });
});
