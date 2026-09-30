// ToolQuiver E2E — boots the real main.js (IPC + SQLite), drives the full
// analyze → cover → library → favorite → note → delete flow through the
// preload bridge with stubbed network, then exits 0 on pass / 1 on fail.
//
// Run:  npm run test:e2e
// Needs a display (or xvfb) since it boots real Electron windows.
// In root containers, launch with:  xvfb-run -a npx electron --no-sandbox test/e2e.test.js
// Network is stubbed because CI sandboxes can't guarantee egress;
// the analyzer itself is covered by test/analyzer.test.js under plain node.
'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.join(__dirname, '..');
process.env.TOOLQUIVER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'toolquiver-e2e-'));

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

const repoJson = {
  name: 'uv',
  full_name: 'astral-sh/uv',
  description: 'An extremely fast Python package and project manager, written in Rust.',
  html_url: 'https://github.com/astral-sh/uv',
  stargazers_count: 50000,
  forks_count: 3000,
  open_issues_count: 100,
  language: 'Rust',
  topics: ['python', 'package-manager', 'rust'],
  license: { spdx_id: 'MIT' },
  owner: { login: 'astral-sh', avatar_url: 'https://avatars.githubusercontent.com/u/1?v=4' },
  default_branch: 'main',
  homepage: 'https://docs.astral.sh/uv/',
};
const readme = `# uv\n\nAn extremely fast Python package manager.\n\n## Installation\n\n\`\`\`sh\ncurl -LsSf astral.sh/uv/install.sh | sh\npip install uv\n\`\`\`\n\n## Quick start\n\n1. Install uv\n2. Run \`uv init\`\n3. Run \`uv add ruff\`\n`;

const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  const u = String(url);
  if (u.includes('/readme')) {
    return new Response(readme, { status: 200, headers: { 'content-type': 'text/plain' } });
  }
  if (u.includes('api.github.com/repos/astral-sh/uv')) {
    return new Response(JSON.stringify(repoJson), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (u.includes('opengraph.githubassets.com') || u.includes('avatars.githubusercontent.com')) {
    return new Response(PNG_1PX, { status: 200, headers: { 'content-type': 'image/png' } });
  }
  return realFetch(url, opts);
};

require(path.join(ROOT, 'main.js'));

const { app, BrowserWindow } = require('electron');

app.whenReady().then(async () => {
  const watchdog = setTimeout(() => { console.error('E2E WATCHDOG: hung'); process.exit(3); }, 60000);
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(ROOT, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  await win.loadFile(path.join(ROOT, 'renderer', 'index.html'));
  await new Promise((r) => setTimeout(r, 1200));

  const checks = [];
  const check = (name, ok) => { checks.push({ name, ok: !!ok }); };

  try {
    const out = await win.webContents.executeJavaScript(`(async () => {
      const log = {};
      const r = await window.tv.analyze('https://github.com/astral-sh/uv');
      log.analyzeOk = !!(r && r.item);
      log.name = r.item && r.item.name;
      log.category = r.item && r.item.category;
      log.setupSteps = r.item && r.item.setup && r.item.setup.steps.length;
      log.quickInstall = r.item && r.item.setup && r.item.setup.quickInstall;
      log.coverSaved = !!(r.item && r.item.cover_path);
      log.stars = r.item && r.item.stats && r.item.stats.stars;
      const items = await window.tv.list({ sort: 'recent' });
      log.libCount = items.length;
      const id = items[0].id;
      await window.tv.favorite(id);
      await window.tv.saveNote(id, 'e2e note');
      const after = await window.tv.list({ sort: 'recent' });
      log.favAndNote = after[0].favorite === true && after[0].note === 'e2e note';
      log.count = await window.tv.count();
      const cats = await window.tv.categories();
      log.hasDevTools = cats.some(c => c.id === 'devtools');
      // export opens a native save dialog — skipped headless by design
      await window.tv.remove(id);
      log.goneAfterRemove = (await window.tv.list({})).length === 0;
      try { await window.tv.analyze('not a link at all xyz'); log.badHandled = false; }
      catch (e) { log.badHandled = /No link found/.test(e.message); }
      return log;
    })()`);

    check('analyze returns item', out.analyzeOk);
    check('name = Uv', out.name === 'Uv');
    check('category detected', out.category === 'Developer Tools');
    check('setup steps extracted', out.setupSteps > 0);
    check('cover saved', out.coverSaved);
    check('library lists 1 item', out.libCount === 1);
    check('favorite + note persist', out.favAndNote);
    check('count = 1', out.count === 1);
    check('categories include devtools', out.hasDevTools);
    check('delete removes item', out.goneAfterRemove);
    check('malformed input rejected', out.badHandled);
  } catch (e) {
    check('no exception: ' + e.message, false);
  }

  clearTimeout(watchdog);
  const failed = checks.filter((c) => !c.ok);
  for (const c of checks) console.log(`${c.ok ? '  ✓' : '  ✗'} ${c.name}`);
  console.log(failed.length === 0 ? 'E2E PASS' : `E2E FAIL (${failed.length} failed)`);
  try { fs.rmSync(process.env.TOOLQUIVER_DATA_DIR, { recursive: true, force: true }); } catch {}
  process.exit(failed.length === 0 ? 0 : 1);
});
app.on('window-all-closed', () => app.quit());
