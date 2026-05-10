// Worker-thread entry. Receives serialized {meals, exercises, doses,
// subjectPartial, conditionsPartial, signals, viewFromMs, viewToMs,
// initialState} payloads from the pool, runs `runEndoSim`, posts the
// result back to the parent.
//
// Why a worker? `runEndoSim` is pure CPU — the engine integrates per-
// minute state across days of simulated events. Running it inline
// blocks Node's event loop, queueing every other API request. The
// pool runs N workers in parallel and keeps the main thread serving
// I/O while the engine churns.

import { parentPort } from 'node:worker_threads';
import { runEndoSim } from './runner.js';

if (!parentPort) {
  // Defensive: this file should only ever load via `new Worker(...)`.
  throw new Error('simWorker.js must be loaded as a worker_threads worker');
}

parentPort.on('message', (msg) => {
  if (!msg || msg.type !== 'run') return;
  const { id, input } = msg;
  try {
    const result = runEndoSim(input);
    parentPort.postMessage({ id, ok: true, result });
  } catch (err) {
    parentPort.postMessage({
      id,
      ok: false,
      error: String(err?.stack || err?.message || err),
    });
  }
});

// Tell the parent we're alive — pool waits for `ready` before sending
// jobs so we don't lose messages posted during module init.
parentPort.postMessage({ type: 'ready' });
