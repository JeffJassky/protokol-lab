#!/usr/bin/env node
// Ensures @kyneticbio/core is present at <repoRoot>/core before npm
// resolves `file:../core` specs in client/ and server/, and before
// shared/bio imports `../../core/dist/index.js` at runtime.
//
// Layout strategy:
//   - Local dev (protokol/{log,core} siblings): symlink log/core -> ../core
//     so edits in the real repo are picked up live.
//   - CI / DigitalOcean (only this repo cloned): shallow-clone core into
//     log/core and build its dist/.
//
// kyneticbio/core is public on GitHub (the npm package isn't published) so
// no auth token is required for the clone.

import { existsSync, lstatSync, symlinkSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, relative, dirname } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '..');
const target = resolve(repoRoot, 'core');
const sibling = resolve(repoRoot, '..', 'core');
const coreRepoUrl = 'https://github.com/kyneticbio/core.git';

const run = (cmd, cwd) => {
  console.log(`[ensure-core] $ ${cmd}  (cwd=${cwd})`);
  execSync(cmd, { cwd, stdio: 'inherit' });
};

const exists = (p) => {
  try {
    lstatSync(p);
    return true;
  } catch {
    return false;
  }
};

if (exists(target)) {
  console.log(`[ensure-core] ${target} already present — skipping setup.`);
} else if (existsSync(resolve(sibling, 'package.json'))) {
  // Local dev: link to the real repo so edits propagate without a rebuild
  // dance. Use a relative target so it survives moving the parent folder.
  const linkTarget = relative(dirname(target), sibling);
  console.log(`[ensure-core] symlinking ${target} -> ${linkTarget}`);
  symlinkSync(linkTarget, target, 'dir');
} else {
  console.log(`[ensure-core] cloning ${coreRepoUrl} -> ${target}`);
  run(`git clone --depth 1 ${coreRepoUrl} "${target}"`, repoRoot);
}

if (!existsSync(resolve(target, 'dist'))) {
  console.log('[ensure-core] dist/ missing — installing + building core.');
  run('npm ci', target);
  run('npm run build', target);
} else {
  console.log('[ensure-core] dist/ present — skipping build.');
}
