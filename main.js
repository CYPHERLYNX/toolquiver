'use strict';

/**
 * ToolQuiver — Electron main process (Windows-first, black theme).
 */

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { analyze } = require('./src/analyzer');
const { searchRepos } = require('./src/analyzer/github');
const { init: initDb } = require('./src/store/db');

let store = null;
let coversDir = '';

function ensureDirs() {
  // TOOLQUIVER_DATA_DIR overrides the profile location — used by the E2E test
  // to keep its SQLite db + covers out of the real user profile.
  const base = process.env.TOOLQUIVER_DATA_DIR || app.getPath('userData');
  coversDir = path.join(base, 'covers');
  fs.mkdirSync(coversDir, { recursive: true });
  store = initDb(path.join(base, 'toolquiver.db'));
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#050505',
    title: 'ToolQuiver',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  // Never navigate the app window anywhere — external links go through shell.
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.on('closed', () => { /* single window app */ });
  return win;
}

/** Download a remote cover image into the covers dir. Returns saved path or null. */
async function saveCoverImage(url, id) {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'ToolQuiver/1.0' } });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    if (!ct.startsWith('image/')) return null;
    const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : ct.includes('gif') ? 'gif' : 'jpg';
    const dest = path.join(coversDir, `${id}.${ext}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 8 * 1024 * 1024) return null;
    fs.writeFileSync(dest, buf);
    return dest;
  } catch { return null; }
}

function saveIconBuffer(buffer, id) {
  try {
    const dest = path.join(coversDir, `${id}-icon.png`);
    fs.writeFileSync(dest, buffer);
    return dest;
  } catch { return null; }
}

app.whenReady().then(() => {
  ensureDirs();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---------------- IPC ----------------

const asId = (v) => (Number.isInteger(v) && v > 0 ? v : null);

ipcMain.handle('tv:analyze', async (_e, input, opts = {}) => {
  if (typeof input !== 'string' || !input.trim()) throw new Error('Provide a link or some text to analyze.');
  const token = store.getSetting('github_token', '');
  const result = await analyze(input, { ...(opts || {}), token: token || undefined });

  // Social links needing user text: keep proposing candidates until there is
  // nothing more to extract — only then save the post as a generic entry.
  if (result.needsUserInput) {
    const links = (result.candidates || []).filter((c) => /^https?:\/\//.test(c.name));
    if (!opts.pastedText || links.length > 0) {
      return { needsInput: true, preview: result };
    }
  }

  const saved = store.addItem(result);
  let coverPath = null;
  if (result.iconBuffer) coverPath = saveIconBuffer(result.iconBuffer, saved.id);
  else if (result.images && result.images[0]) coverPath = await saveCoverImage(result.images[0], saved.id);
  if (coverPath) return { item: store.addItem(result, coverPath) };
  return { item: saved };
});

ipcMain.handle('tv:list', (_e, filters) => store.listItems(filters && typeof filters === 'object' ? filters : {}));
ipcMain.handle('tv:categories', () => store.categories());
ipcMain.handle('tv:count', () => store.count());
ipcMain.handle('tv:delete', (_e, id) => { const n = asId(id); if (n == null) return false; store.deleteItem(n); return true; });
ipcMain.handle('tv:favorite', (_e, id) => { const n = asId(id); if (n == null) throw new Error('Bad id'); return store.toggleFavorite(n); });
ipcMain.handle('tv:note', (_e, id, note) => {
  const n = asId(id); if (n == null) throw new Error('Bad id');
  return store.updateNote(n, typeof note === 'string' ? note.slice(0, 10000) : '');
});
ipcMain.handle('tv:recategorize', (_e, id, categoryId, label) => {
  const n = asId(id); if (n == null) throw new Error('Bad id');
  return store.updateCategory(n, typeof categoryId === 'string' ? categoryId : 'other',
    typeof label === 'string' ? label : 'Other');
});

ipcMain.handle('tv:pick-apk', async () => {
  const r = await dialog.showOpenDialog({ filters: [{ name: 'Android packages', extensions: ['apk'] }], properties: ['openFile'] });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle('tv:open-external', (_e, url) => {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url.trim())) return false;
  shell.openExternal(url.trim());
  return true;
});

ipcMain.handle('tv:lookup-name', async (_e, name) => {
  if (typeof name !== 'string' || !name.trim()) return [];
  const token = store.getSetting('github_token', '');
  return searchRepos(name.trim(), token || undefined);
});

ipcMain.handle('tv:setting-get', (_e, key, fallback) =>
  store.getSetting(typeof key === 'string' ? key : '', fallback));
ipcMain.handle('tv:setting-set', (_e, key, value) => {
  if (typeof key !== 'string' || !key) throw new Error('Bad setting key');
  store.setSetting(key, typeof value === 'string' ? value : String(value ?? ''));
  return true;
});

ipcMain.handle('tv:export', async (_e, format) => {
  const fmt = format === 'md' ? 'md' : 'json'; // only two supported formats
  const items = store.exportData();
  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath: `toolquiver-library.${fmt}`,
    filters: fmt === 'md'
      ? [{ name: 'Markdown', extensions: ['md'] }]
      : [{ name: 'JSON', extensions: ['json'] }],
  });
  if (canceled || !filePath) return null;

  let content;
  if (fmt === 'md') {
    const lines = ['# ToolQuiver Library', '', `Exported ${new Date().toLocaleDateString()} — ${items.length} tools`, ''];
    for (const it of items) {
      lines.push(`## ${it.name}`, '');
      lines.push(`> ${it.description}`, '');
      lines.push(`- **Category:** ${it.category}`, `- **Source:** ${it.url}`, `- **Tags:** ${(it.tags || []).join(', ') || '—'}`);
      const steps = (it.setup && it.setup.steps) || [];
      if (it.setup && it.setup.quickInstall) lines.push(`- **Quick install:** \`${it.setup.quickInstall}\``);
      if (steps.length) { lines.push('', '**Setup:**'); steps.forEach((s, i) => lines.push(`${i + 1}. ${s.replace(/\n/g, ' ')}`)); }
      if (it.note) lines.push('', `**My note:** ${it.note}`);
      lines.push('', '---', '');
    }
    content = lines.join('\n');
  } else {
    content = JSON.stringify(items, null, 2);
  }
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
});
