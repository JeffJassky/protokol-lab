// Mongo-backed in-process worker. Polls marketing_jobs, atomically
// claims one queued job per worker slot, dispatches by type to the
// handler registered by the owning module. No Redis. Safe for single
// instance; for multi-instance later we can swap in BullMQ behind the
// same registry interface.
//
// Lock recovery: any job locked > STALE_LOCK_MS gets reset to queued
// at the start of each poll cycle. Graceful shutdown re-queues
// in-flight jobs the local instance currently owns.

import { randomUUID } from 'node:crypto';

const STALE_LOCK_MS = 10 * 60 * 1000; // 10 min

export function buildWorker({ registry, models, config, logger }) {
  // ctx is wired post-build (createMarketingAdmin needs the worker
  // before ctx is fully assembled). runJob reads the latest value via
  // this mutable ref so handlers see the complete ctx.
  const ctxRef = { current: null };
  const instanceId = `worker-${randomUUID().slice(0, 8)}`;
  let running = false;
  let active = 0;
  let timer = null;

  async function start() {
    if (!config.worker.enabled) {
      logger.info?.('[marketing-admin] worker disabled by config');
      return;
    }
    if (running) return;
    running = true;
    logger.info?.(
      { concurrency: config.worker.concurrency, handlers: registry.list(), instanceId },
      '[marketing-admin] worker started'
    );
    schedule();
  }

  async function stop() {
    running = false;
    if (timer) clearTimeout(timer);
    // Re-queue any jobs we currently own. They'll be picked up by the
    // next start() (or by another instance if we ever add one).
    await models.Job.updateMany(
      { lockedBy: instanceId, status: 'running' },
      { $set: { status: 'queued', lockedBy: null, lockedAt: null } }
    );
  }

  function schedule() {
    if (!running) return;
    timer = setTimeout(tick, config.worker.pollIntervalMs);
  }

  async function tick() {
    if (!running) return;
    try {
      // Stale-lock recovery
      await models.Job.updateMany(
        {
          status: 'running',
          lockedAt: { $lt: new Date(Date.now() - STALE_LOCK_MS) },
        },
        { $set: { status: 'queued', lockedBy: null, lockedAt: null } }
      );

      while (running && active < config.worker.concurrency) {
        const job = await models.Job.findOneAndUpdate(
          { status: 'queued', lockedBy: null },
          {
            $set: {
              status: 'running',
              lockedBy: instanceId,
              lockedAt: new Date(),
              startedAt: new Date(),
            },
          },
          { sort: { createdAt: 1 }, returnDocument: 'after' }
        );
        if (!job) break;
        active++;
        runJob(job).finally(() => {
          active--;
        });
      }
    } catch (err) {
      logger.error?.({ err: err.message }, '[marketing-admin] worker tick failed');
    } finally {
      schedule();
    }
  }

  async function runJob(job) {
    const handler = registry.get(job.type);
    if (!handler) {
      job.status = 'failed';
      job.error = `no handler registered for ${job.type}`;
      job.finishedAt = new Date();
      await job.save();
      logger.error?.({ jobId: String(job._id), type: job.type }, '[marketing-admin] no handler');
      return;
    }
    try {
      const result = await handler({ job, ctx: ctxRef.current });
      job.status = 'done';
      job.result = result;
      job.finishedAt = new Date();
      await job.save();
      logger.info?.(
        { jobId: String(job._id), type: job.type, durationMs: Date.now() - new Date(job.startedAt).getTime() },
        '[marketing-admin] job done'
      );
    } catch (err) {
      job.status = 'failed';
      job.error = err?.message || String(err);
      job.finishedAt = new Date();
      await job.save();
      logger.error?.(
        { jobId: String(job._id), type: job.type, err: err?.message },
        '[marketing-admin] job failed'
      );
    }
  }

  async function enqueue({ type, payload, contactId, listId, opportunityId, budget } = {}) {
    if (!type) throw new Error('job type required');
    const job = await models.Job.create({
      type,
      payload,
      contactId,
      listId,
      opportunityId,
      status: 'queued',
      budget: budget || { capUsd: config.budget.defaultPerJobUsd, spentUsd: 0 },
    });
    return job;
  }

  function setCtx(ctx) {
    ctxRef.current = ctx;
  }

  return { start, stop, enqueue, registry, instanceId, setCtx };
}
