import { spawn } from 'node:child_process';
import { readdir, rm, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { childLogger, errContext } from '../lib/logger.js';

const log = childLogger('backup');

const DEFAULT_DIR = path.resolve(process.cwd(), 'backups');
const DEFAULT_KEEP = 20;

async function dirSizeBytes(dir) {
  let total = 0;
  async function walk(p) {
    const entries = await readdir(p, { withFileTypes: true });
    for (const e of entries) {
      const fp = path.join(p, e.name);
      if (e.isDirectory()) await walk(fp);
      else {
        try {
          const s = await stat(fp);
          total += s.size;
        } catch {}
      }
    }
  }
  try { await walk(dir); } catch {}
  return total;
}

export async function runStartupBackup({
  uri = process.env.MONGODB_URI,
  dir = process.env.BACKUP_DIR || DEFAULT_DIR,
  keep = Number(process.env.BACKUP_KEEP) || DEFAULT_KEEP,
} = {}) {
  if (!uri) {
    log.warn('MONGODB_URI missing — skipping backup');
    return;
  }
  await mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const out = path.join(dir, stamp);
  const t0 = Date.now();
  log.info({ outDir: out, keep }, 'startup backup: begin');

  const proc = spawn('mongodump', [`--uri=${uri}`, `--out=${out}`, '--quiet'], {
    stdio: ['ignore', 'ignore', 'pipe'],
  });

  let stderr = '';
  proc.stderr.on('data', (b) => { stderr += b.toString(); });

  proc.on('error', (err) => {
    log.warn({ ...errContext(err) }, 'mongodump binary unavailable');
  });

  proc.on('exit', async (code) => {
    const durationMs = Date.now() - t0;
    if (code !== 0) {
      log.error({ exitCode: code, stderr: stderr.trim().slice(0, 500), durationMs }, 'mongodump failed');
      await rm(out, { recursive: true, force: true }).catch(() => {});
      return;
    }
    const bytes = await dirSizeBytes(out);
    log.info(
      { outDir: path.relative(process.cwd(), out), bytes, durationMs },
      'startup backup: saved',
    );
    await prune(dir, keep);
  });
}

async function prune(dir, keep) {
  const entries = await readdir(dir, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
  const stale = dirs.slice(0, Math.max(0, dirs.length - keep));
  for (const name of stale) {
    await rm(path.join(dir, name), { recursive: true, force: true }).catch((err) => {
      log.warn({ ...errContext(err), name }, 'prune: rm failed');
    });
  }
  if (stale.length) {
    log.info({ removed: stale.length, kept: dirs.length - stale.length, keep }, 'backup: pruned old dirs');
  } else {
    log.debug({ kept: dirs.length, keep }, 'backup: no prune needed');
  }
}
