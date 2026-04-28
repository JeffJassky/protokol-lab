// Job handler registry. Modules register handlers keyed by job.type at
// startup; the worker dispatches by type when it claims a job.

export function buildJobRegistry() {
  const handlers = new Map();

  function register(type, handler) {
    if (handlers.has(type)) {
      throw new Error(`[marketing-admin] duplicate job handler for type: ${type}`);
    }
    handlers.set(type, handler);
  }

  function get(type) {
    return handlers.get(type);
  }

  function list() {
    return Array.from(handlers.keys());
  }

  return { register, get, list };
}
