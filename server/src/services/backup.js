import { spawn } from 'node:child_process';
import { readdir, rm, mkdir } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_DIR = path.resolve(process.cwd(), 'backups');
const DEFAULT_KEEP = 20;

export async function runStartupBackup({
  uri = process.env.MONGODB_URI,
  dir = process.env.BACKUP_DIR || DEFAULT_DIR,
  keep = Number(process.env.BACKUP_KEEP) || DEFAULT_KEEP,
} = {}) {
  if (!uri) {
    console.warn('[backup] MONGODB_URI missing, skipping backup');
    return;
  }
  await mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const out = path.join(dir, stamp);

  const proc = spawn('mongodump', [`--uri=${uri}`, `--out=${out}`, '--quiet'], {
    stdio: ['ignore', 'ignore', 'pipe'],
  });

  let stderr = '';
  proc.stderr.on('data', (b) => { stderr += b.toString(); });

  proc.on('error', (err) => {
    console.warn(`[backup] mongodump unavailable: ${err.message}`);
  });

  proc.on('exit', async (code) => {
    if (code !== 0) {
      console.warn(`[backup] mongodump exit ${code}: ${stderr.trim()}`);
      await rm(out, { recursive: true, force: true }).catch(() => {});
      return;
    }
    console.log(`[backup] saved ${path.relative(process.cwd(), out)}`);
    await prune(dir, keep);
  });
}

async function prune(dir, keep) {
  const entries = await readdir(dir, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
  const stale = dirs.slice(0, Math.max(0, dirs.length - keep));
  for (const name of stale) {
    await rm(path.join(dir, name), { recursive: true, force: true }).catch(() => {});
  }
  if (stale.length) console.log(`[backup] pruned ${stale.length} old backup(s)`);
}
