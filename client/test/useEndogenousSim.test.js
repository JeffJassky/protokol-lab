// Control-flow tests for useEndogenousSim. The actual ODE simulation is
// covered upstream in @kyneticbio/core; here we only verify the
// composable's orchestration: fetch parallelization, busy/error flags,
// stale-response ignoring, and worker handoff.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/api/index.js', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    del: vi.fn(),
  },
  registerPlanLimitHandler: vi.fn(),
}));

// The composable lazily constructs `new Worker(new URL(...))`. happy-dom
// doesn't ship a Worker, so install a fake before import.
class FakeWorker {
  constructor() {
    this.listeners = new Map();
    this.terminated = false;
    FakeWorker.instances.push(this);
  }
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
  }
  removeEventListener(type, fn) {
    this.listeners.get(type)?.delete(fn);
  }
  postMessage(msg) {
    this.lastMessage = msg;
  }
  terminate() {
    this.terminated = true;
  }
  // Helper used in tests to deliver a message back to the composable.
  emit(data) {
    const handlers = this.listeners.get('message');
    if (!handlers) return;
    for (const fn of [...handlers]) fn({ data });
  }
}
FakeWorker.instances = [];

globalThis.Worker = FakeWorker;

import { api } from '../src/api/index.js';
import { useEndogenousSim } from '../src/composables/useEndogenousSim.js';

beforeEach(() => {
  api.get.mockReset();
  FakeWorker.instances.length = 0;
});

const PARAMS = {
  from: '2026-05-01',
  to: '2026-05-09',
  signals: ['glucose'],
  subject: { sex: 'male', ageYears: 30 },
  conditions: {},
};

describe('useEndogenousSim', () => {
  it('short-circuits when signals list is empty', async () => {
    const { run, result, busy } = useEndogenousSim();
    await run({ ...PARAMS, signals: [] });
    expect(api.get).not.toHaveBeenCalled();
    expect(busy.value).toBe(false);
    expect(result.value).toEqual({ timestamps: [], series: {}, mealCount: 0 });
  });

  it('fetches meals + exercises in parallel, then posts to worker', async () => {
    api.get
      .mockResolvedValueOnce({ meals: [{ timestamp: '2026-05-01T08:00:00Z' }] })
      .mockResolvedValueOnce({ events: [{ timestamp: '2026-05-01T17:00:00Z', engineClass: 'exercise_cardio' }] });

    const { run, result, busy, error } = useEndogenousSim();
    const runPromise = run(PARAMS);

    // Allow microtasks so the fetch resolves and the worker is constructed.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(api.get).toHaveBeenCalledTimes(2);
    expect(api.get.mock.calls[0][0]).toContain('/api/foodlog/range-meals');
    expect(api.get.mock.calls[1][0]).toContain('/api/exerciselog/range-events');

    const worker = FakeWorker.instances[0];
    expect(worker).toBeDefined();
    expect(worker.lastMessage.meals.length).toBe(1);
    expect(worker.lastMessage.exercises.length).toBe(1);
    expect(worker.lastMessage.signals).toEqual(['glucose']);

    worker.emit({
      timestamps: [0, 900_000],
      series: { glucose: [90, 95] },
      computeTimeMs: 12,
      mealCount: 1,
      exerciseCount: 1,
    });

    await runPromise;
    expect(busy.value).toBe(false);
    expect(error.value).toBeNull();
    expect(result.value.series.glucose).toEqual([90, 95]);
  });

  it('surfaces a worker error message', async () => {
    api.get.mockResolvedValueOnce({ meals: [{ timestamp: '2026-05-01T08:00:00Z' }] });
    api.get.mockResolvedValueOnce({ events: [] });

    const { run, error, busy } = useEndogenousSim();
    const promise = run(PARAMS);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const worker = FakeWorker.instances[0];
    worker.emit({ error: 'ode blew up' });

    await promise;
    expect(error.value).toBe('ode blew up');
    expect(busy.value).toBe(false);
  });

  it('surfaces a fetch failure', async () => {
    api.get.mockRejectedValue(new Error('network down'));

    const { run, error, busy } = useEndogenousSim();
    await run(PARAMS);

    expect(error.value).toBe('network down');
    expect(busy.value).toBe(false);
    expect(FakeWorker.instances.length).toBe(0);
  });

  it('ignores stale worker responses when a newer run starts', async () => {
    // First run: meals fetch resolves; we hold the worker response.
    api.get
      .mockResolvedValueOnce({ meals: [{ timestamp: '2026-05-01T08:00:00Z' }] })
      .mockResolvedValueOnce({ events: [] })
      // Second run: also resolves immediately.
      .mockResolvedValueOnce({ meals: [{ timestamp: '2026-05-02T08:00:00Z' }] })
      .mockResolvedValueOnce({ events: [] });

    const sim = useEndogenousSim();
    const firstPromise = sim.run(PARAMS);

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    const firstWorker = FakeWorker.instances[0];

    // Kick off a second run before responding to the first. The composable
    // terminates the first worker via freshWorker() and installs a new one.
    const secondPromise = sim.run(PARAMS);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(firstWorker.terminated).toBe(true);
    const secondWorker = FakeWorker.instances[1];
    expect(secondWorker).toBeDefined();

    // The first worker tries to deliver — the composable should ignore it
    // (token mismatch) and not overwrite result.value.
    firstWorker.emit({
      timestamps: [0],
      series: { glucose: [999] },
      computeTimeMs: 1,
      mealCount: 1,
      exerciseCount: 0,
    });

    secondWorker.emit({
      timestamps: [0, 900_000],
      series: { glucose: [85, 88] },
      computeTimeMs: 5,
      mealCount: 1,
      exerciseCount: 0,
    });

    await Promise.all([firstPromise, secondPromise]);
    expect(sim.result.value.series.glucose).toEqual([85, 88]);
  });
});
