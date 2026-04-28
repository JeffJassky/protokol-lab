// Periodic-task scheduler. Modules register tasks with a check() that
// returns jobs to enqueue (or null). The internal tick fires every
// SCHEDULER_TICK_MS; tasks decide for themselves whether they're due
// (typically by reading lastRunAt off the records they own).
//
// Idempotent: tasks should be safe to invoke even if no work is due.

const SCHEDULER_TICK_MS = 60_000;

export function buildScheduler({ logger, worker }) {
  const tasks = [];
  let running = false;
  let timer = null;
  let tickInFlight = false;

  function register(task) {
    if (!task?.name || typeof task.check !== 'function') {
      throw new Error('[marketing-admin] scheduler.register requires { name, check() }');
    }
    tasks.push(task);
  }

  async function tick() {
    if (tickInFlight || !running) return;
    tickInFlight = true;
    try {
      for (const task of tasks) {
        try {
          const jobs = await task.check();
          if (Array.isArray(jobs) && jobs.length > 0 && worker) {
            for (const j of jobs) await worker.enqueue(j);
            logger.info?.({ task: task.name, enqueued: jobs.length }, '[marketing-admin] scheduler enqueued');
          }
        } catch (err) {
          logger.error?.({ task: task.name, err: err.message }, '[marketing-admin] scheduler task failed');
        }
      }
    } finally {
      tickInFlight = false;
    }
  }

  async function start() {
    if (running) return;
    running = true;
    logger.info?.(
      { tasks: tasks.map((t) => t.name), tickMs: SCHEDULER_TICK_MS },
      '[marketing-admin] scheduler started'
    );
    // Fire once immediately so newly-registered tasks pick up due work
    // without waiting a full tick.
    tick();
    timer = setInterval(tick, SCHEDULER_TICK_MS);
  }

  async function stop() {
    running = false;
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  return { register, start, stop, tick /* exposed for tests */ };
}
