'use strict';

/**
 * Ensures better-sqlite3 loads under plain node before `npm test`.
 * If the binary was built for Electron (ABI mismatch), rebuild it for node.
 * Removes the electron marker so the next `npm start` rebuilds for Electron.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const buildDir = path.join(__dirname, '..', 'node_modules', 'better-sqlite3', 'build', 'Release');
const marker = path.join(buildDir, '.tv-built-for-electron');

function main() {
  try {
    // Bare require() is NOT enough: better-sqlite3 loads its native binding
    // lazily. Opening a real (in-memory) database forces the dlopen, which is
    // what actually fails on an ABI mismatch.
    const Database = require('better-sqlite3');
    new Database(':memory:').close();
    return; // loads fine under this node — nothing to do
  } catch (err) {
    console.log('[toolquiver] rebuilding better-sqlite3 for node…');
  }
  execSync('npm rebuild better-sqlite3', { stdio: 'inherit' });
  if (fs.existsSync(marker)) fs.rmSync(marker, { force: true });
  // Verify in a FRESH process: re-dlopening in-process after a failed load
  // can segfault (stale loader state), even though the new binary is fine.
  const { execFileSync } = require('child_process');
  execFileSync(process.execPath,
    ['-e', `new (require('better-sqlite3'))(':memory:').close();`],
    { stdio: 'inherit', cwd: path.join(__dirname, '..') });
  console.log('[toolquiver] better-sqlite3 ready for node.');
}

main();
