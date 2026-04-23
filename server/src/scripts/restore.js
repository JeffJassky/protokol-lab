#!/usr/bin/env node
import 'dotenv/config';
import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const BACKUP_DIR = process.env.BACKUP_DIR || path.resolve(process.cwd(), 'backups');
const URI = process.env.MONGODB_URI;

if (!URI) {
  console.error('MONGODB_URI missing');
  process.exit(1);
}

const entries = await readdir(BACKUP_DIR, { withFileTypes: true }).catch(() => []);
const backups = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();

if (!backups.length) {
  console.error(`No backups found in ${BACKUP_DIR}`);
  process.exit(1);
}

const arg = process.argv[2];
let target;

if (arg === 'latest') {
  target = backups.at(-1);
} else if (arg) {
  target = backups.find((b) => b === arg || b.startsWith(arg));
  if (!target) {
    console.error(`No backup matching "${arg}"`);
    process.exit(1);
  }
} else {
  console.log('Available backups:');
  backups.forEach((b, i) => console.log(`  [${i}] ${b}`));
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const pick = await rl.question(`Pick index (default ${backups.length - 1} = latest): `);
  rl.close();
  const idx = pick.trim() === '' ? backups.length - 1 : Number(pick);
  if (!Number.isInteger(idx) || idx < 0 || idx >= backups.length) {
    console.error('Invalid selection');
    process.exit(1);
  }
  target = backups[idx];
}

const dumpPath = path.join(BACKUP_DIR, target);
const dbName = new URL(URI).pathname.slice(1).split('?')[0] || '(default)';

console.log('');
console.log('WARNING: restore is destructive.');
console.log(`  Target DB:   ${dbName}`);
console.log(`  Backup:      ${target}`);
console.log(`  Mode:        --drop (wipes existing collections before restore)`);
console.log('');

const rl = readline.createInterface({ input: stdin, output: stdout });
const confirm = await rl.question('Type "RESTORE" to proceed: ');
rl.close();

if (confirm.trim() !== 'RESTORE') {
  console.log('Aborted.');
  process.exit(0);
}

const proc = spawn('mongorestore', [`--uri=${URI}`, '--drop', dumpPath], {
  stdio: 'inherit',
});

proc.on('exit', (code) => process.exit(code ?? 1));
