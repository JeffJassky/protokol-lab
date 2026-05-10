// Pool of `worker_threads` running the simulation engine. Keeps the
// main Node thread responsive during expensive runEndoSim calls. The
// pool starts cold (no workers), spins up on first job, and reuses
// warm workers across subsequent jobs to amortize the cost of loading
// `@kyneticbio/core` on each worker.

import { Worker } from 'node:worker_threads';
import { childLogger } from '../lib/logger.js';

const log = childLogger('sim-worker-pool');

// Two workers is enough for a single Node instance — the response
// cache absorbs most repeated requests, so concurrent cache misses
// are rare. Bump if real workloads show queue depth.
const WORKER_COUNT = Number(process.env.SIM_WORKER_COUNT) || 2;

const _workers = [];
const _queue = [];
let _initialized = false;
let _nextJobId = 0;

function workerUrl() {
  return new URL('./simWorker.js', import.meta.url);
}

function spawn() {
  const w = new Worker(workerUrl());
  // Per-worker mutable state. Tracked on the worker object so the
  // message handler closure can find them.
  w._busy = false;
  w._currentJob = null;
  w._ready = false;

  w.on('message', (msg) => {
    if (msg?.type === 'ready') {
      w._ready = true;
      drainQueue();
      return;
    }
    const job = w._currentJob;
    if (!job) return; // stray message, ignore
    w._currentJob = null;
    w._busy = false;
    if (msg.ok) job.resolve(msg.result);
    else job.reject(new Error(msg.error || 'sim worker error'));
    drainQueue();
  });

  w.on('error', (err) => {
    log.error({ err: String(err?.stack || err?.message || err) }, 'sim worker errored');
    if (w._currentJob) {
      w._currentJob.reject(err);
      w._currentJob = null;
    }
    w._busy = false;
    // Replace the dead worker so the pool stays at WORKER_COUNT.
    const idx = _workers.indexOf(w);
    if (idx !== -1) {
      _workers.splice(idx, 1, spawn());
    }
  });

  w.on('exit', (code) => {
    if (code !== 0) {
      log.warn({ code }, 'sim worker exited unexpectedly');
    }
  });

  return w;
}

function init() {
  if (_initialized) return;
  _initialized = true;
  for (let i = 0; i < WORKER_COUNT; i++) {
    _workers.push(spawn());
  }
  log.info({ count: WORKER_COUNT }, 'sim worker pool initialized');
}

function drainQueue() {
  while (_queue.length) {
    const free = _workers.find((w) => w._ready && !w._busy);
    if (!free) break;
    const job = _queue.shift();
    free._busy = true;
    free._currentJob = job;
    free.postMessage({ type: 'run', id: job.id, input: job.input });
  }
}

// Public API. Returns the same shape `runEndoSim` returns synchronously.
// Caller is on the main thread — this Promise resolves when the worker
// posts back, so I/O on the main thread is not blocked during compute.
export function runEndoSimInWorker(input) {
  init();
  return new Promise((resolve, reject) => {
    _queue.push({ id: ++_nextJobId, input, resolve, reject });
    drainQueue();
  });
}

// Test/admin helper.
export function _poolStats() {
  return {
    initialized: _initialized,
    workerCount: _workers.length,
    queueDepth: _queue.length,
    busy: _workers.filter((w) => w._busy).length,
    ready: _workers.filter((w) => w._ready).length,
  };
}
