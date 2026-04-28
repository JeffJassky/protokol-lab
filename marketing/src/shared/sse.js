import { EventEmitter } from 'node:events';

// In-process pub/sub for SSE channels. Workers emit on a channel name
// (e.g. `research-job-:id`); HTTP handlers subscribe and forward events
// to clients as `text/event-stream` frames.

export function buildSseHub() {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(0);

  function emit(channel, event) {
    emitter.emit(channel, event);
  }

  function subscribe(channel, listener) {
    emitter.on(channel, listener);
    return () => emitter.off(channel, listener);
  }

  return { emit, subscribe };
}
