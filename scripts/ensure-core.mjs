#!/usr/bin/env node
// Ensures @kyneticbio/core exists as a sibling of the repo root before
// npm tries to resolve `file:../../core` specs in client/ and server/.
//
// Local dev: ../core already exists (the protokol/ workspace) — this is a no-op.
// CI / DigitalOcean: only this repo gets cloned, so we shallow-clone core
// and build its dist/ so npm install can copy it into node_modules.
//
// The repo is public on GitHub even though the package isn't published to npm,
// so no auth is required.

import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '..');
const coreDir = resolve(repoRoot, '..', 'core');
const coreRepoUrl = 'https://github.com/kyneticbio/core.git';

const run = (cmd, cwd) => {
  console.log(`[ensure-core] $ ${cmd}  (cwd=${cwd})`);
  execSync(cmd, { cwd, stdio: 'inherit' });
};

if (existsSync(coreDir)) {
  console.log(`[ensure-core] ${coreDir} already exists — skipping clone.`);
} else {
  console.log(`[ensure-core] cloning ${coreRepoUrl} -> ${coreDir}`);
  run(`git clone --depth 1 ${coreRepoUrl} "${coreDir}"`, repoRoot);
}

if (!existsSync(resolve(coreDir, 'dist'))) {
  console.log('[ensure-core] dist/ missing — installing + building core.');
  run('npm ci', coreDir);
  run('npm run build', coreDir);
} else {
  console.log('[ensure-core] dist/ present — skipping build.');
}
