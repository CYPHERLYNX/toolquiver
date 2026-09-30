'use strict';

/**
 * Ensures better-sqlite3 is built for the Electron ABI before `npm start`
 * or `npm run dist`. Uses a marker file so repeat runs are instant.
 * Windows-cmd safe: plain node, no shell-specific syntax.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const buildDir = path.join(__dirname, '..', 'node_modules', 'better-sqlite3', 'build', 'Release');
const binding = path.join(buildDir, 'better_sqlite3.node');
const marker = path.join(buildDir, '.tv-built-for-electron');

function main() {
  if (fs.existsSync(binding) && fs.existsSync(marker)) return; // already good
  if (fs.existsSync(path.join(buildDir, '.forge-meta'))) {
    fs.rmSync(path.join(buildDir, '.forge-meta'), { force: true }); // stale metadata breaks electron-rebuild
  }
  console.log('[toolquiver] building better-sqlite3 for Electron…');
  execSync('npx electron-rebuild -f -w better-sqlite3', { stdio: 'inherit' });
  // Verify: an Electron-ABI binary must FAIL to dlopen under plain node.
  // (If it loads, the rebuild didn't take and we'd ship a broken app.)
  let loadsUnderNode = false;
  try {
    new (require('better-sqlite3'))(':memory:').close();
    loadsUnderNode = true;
  } catch { /* expected: ABI mismatch under plain node */ }
  if (loadsUnderNode) {
    throw new Error('[toolquiver] electron-rebuild did not produce an Electron-ABI binary — refusing to mark it ready.');
  }
  fs.mkdirSync(buildDir, { recursive: true });
  fs.writeFileSync(marker, `electron ${process.version}`);
  console.log('[toolquiver] better-sqlite3 ready for Electron.');
}

main();
