#!/usr/bin/env node
const cwd = process.cwd();
const allow = process.env.PREZI_ALLOW_FUSE_NPM === '1';
if (cwd.startsWith('/storage/emulated') && !allow) {
  console.error('usar scripts/termux-setup.sh');
  console.error(`npm install abortado: cwd FUSE (${cwd})`);
  process.exit(1);
}
