'use strict';
/* ToolQuiver renderer */

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const state = {
  view: 'add',
  items: [],
  categories: [],
  filter: { q: '', category: '', favoritesOnly: false, sort: 'newest' },
  detailId: null,
};

// CSP-safe replacement for inline onerror: broken covers remove themselves.
// (error events don't bubble, so this uses the capture phase.)
document.addEventListener('error', (e) => {
  const t = e.target;
  if (t && t.dataset && t.dataset.errRemove !== undefined) t.remove();
}, true);

function coverSrc(item) {
  if (item.cover_path) {
    const p = String(item.cover_path).replace(/\\/g, '/');
    return 'file:///' + encodeURI(p.replace(/^([A-Za-z]):/, '$1:'));
  }
  if (item.images && item.images[0] && /^https?:\/\//.test(item.images[0])) return item.images[0];
  return null;
}
function coverHtml(item, cls) {
  const ch = esc((item.name || '?').trim().charAt(0).toUpperCase() || '◈');
  const src = coverSrc(item);
  const ph = `<div class="phfill">${ch}</div>`;
  if (!src) return `<div class="${cls}">${ph}</div>`;
  // Placeholder sits underneath; the image removes itself if it fails to load.
  return `<div class="${cls} coverwrap">${ph}<img src="${esc(src)}" alt="" data-err-remove></div>`;
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2600);
}

/* ---------------- navigation ---------------- */
function setView(view, category = '') {
  state.view = view;
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
  document.querySelectorAll('#sidebar .nav-item[data-view]').forEach((b) =>
    b.classList.toggle('active', b.dataset.view === view && !category));
  if (view === 'add') $('#view-add').classList.add('active');
  else {
    $('#view-library').classList.add('active');
    state.filter.favoritesOnly = view === 'favorites';
    state.filter.category = category;
    $('#libTitle').textContent = view === 'favorites' ? 'Favorites' : category ? catLabel(category) : 'Library';
    refreshLibrary();
  }
}
function catLabel(id) {
  const c = state.categories.find((x) => x.id === id);
  return c ? c.label : id;
}
document.querySelectorAll('#sidebar .nav-item[data-view]').forEach((b) =>
  b.addEventListener('click', () => setView(b.dataset.view)));
document.querySelector('[data-goto="add"]')?.addEventListener('click', () => setView('add'));
document.querySelectorAll('.modal-x, [data-close]').forEach((b) =>
  b.addEventListener('click', () => b.closest('.modal').classList.add('hidden')));
document.querySelectorAll('.modal').forEach((m) =>
  m.addEventListener('click', (e) => { if (e.target === m) m.classList.add('hidden'); }));

/* ---------------- analyze flow ---------------- */
async function runAnalyze(input, opts = {}) {
  const zone = $('#resultZone');
  zone.innerHTML = `<div class="spinner">Analyzing — fetching metadata, README & setup steps…</div>`;
  $('#analyzeBtn').disabled = true;
  try {
    const res = await window.tv.analyze(input, opts);
    if (res.needsInput) return showSocialModal(res.preview, input);
    const item = res.item;
    await refreshSidebar();
    zone.innerHTML = resultCardHtml(item, true);
    bindResultCard(zone, item);
    toast(`Filed under ${item.category} ◈`);
  } catch (err) {
    zone.innerHTML = `<div class="error-box">${esc(err.message || 'Analysis failed.')}</div>`;
  } finally {
    $('#analyzeBtn').disabled = false;
  }
}

function resultCardHtml(item, filed) {
  const setup = item.setup || {};
  const steps = (setup.steps || []).slice(0, 3);
  return `
  <div class="result-card ${filed ? 'filed' : ''}">
    ${coverHtml(item, 'result-cover')}
    <div class="result-body">
      <h3>${esc(item.name)}</h3>
      <p>${esc(item.description)}</p>
      <div class="tagrow">
        <span class="tag cat">${esc(item.category)}</span>
        ${(item.tags || []).slice(0, 4).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}
      </div>
      ${setup.quickInstall ? `<div class="setup-mini">Quick install <code>${esc(setup.quickInstall)}</code></div>` : ''}
      ${steps.length ? `<div class="setup-mini">${steps.map((s) => `• ${esc(s.split('\n')[0])}`).join('<br>')}</div>` : ''}
      <div class="result-actions">
        <button class="btn-primary" data-open="${item.id}">Open in library →</button>
        ${item.url ? `<button class="btn-ghost" data-ext="${esc(item.url)}">Visit source ↗</button>` : ''}
      </div>
    </div>
  </div>`;
}
function bindResultCard(zone, item) {
  zone.querySelector('[data-open]')?.addEventListener('click', () => { setView('library'); openDetail(item.id); });
  zone.querySelector('[data-ext]')?.addEventListener('click', (e) => window.tv.openExternal(e.target.dataset.ext));
}

$('#analyzeBtn').addEventListener('click', () => {
  const v = $('#linkInput').value.trim();
  if (!v) return toast('Paste a link first.');
  runAnalyze(v);
});
$('#linkInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#analyzeBtn').click(); }
});
$('#apkBtn').addEventListener('click', async () => {
  const p = await window.tv.pickApk();
  if (p) { $('#linkInput').value = p; runAnalyze(p); }
});
document.querySelectorAll('.ex').forEach((b) =>
  b.addEventListener('click', () => { $('#linkInput').value = b.dataset.ex; runAnalyze(b.dataset.ex); }));

/* ---------------- social / needs-input modal ---------------- */
function showSocialModal(preview, originalInput) {
  const body = $('#socialBody');
  const cands = preview.candidates || [];
  body.innerHTML = `
    <h3>${preview.platform === 'instagram' ? 'Instagram' : 'X'} post detected</h3>
    <p class="muted social-desc">${esc(preview.description)}</p>
    ${preview.suggestedUrl ? `
      <div class="cand"><div><b>${esc(preview.suggestedUrl)}</b><span>Link found in post — analyze it directly</span></div>
      <button class="btn-primary" id="socDirect">Analyze link →</button></div>` : ''}
    ${cands.length ? `<div class="detail-sec"><h5>Names spotted in the post</h5>
      ${cands.map((c, i) => `<div class="cand" data-candrow="${i}"><div><b>${esc(c.name)}</b><span>${esc(c.why)}</span></div>
        ${/^https?:\/\//.test(c.name)
          ? `<button class="btn-ghost" data-cand="${esc(c.name)}">Analyze</button>`
          : `<button class="btn-ghost" data-lookup="${esc(c.name)}" data-row="${i}">Look up →</button>`}</div>`).join('')}
      </div>` : ''}
    <div class="detail-sec"><h5>Paste the post caption</h5>
      <textarea id="socText" class="note-area" rows="4" aria-label="Post caption text" placeholder="Paste the caption / text of the post here…"></textarea>
      <div class="row row-tight">
        <button class="btn-primary" id="socExtract">Extract tools →</button>
      </div>
    </div>`;
  $('#socialModal').classList.remove('hidden');

  $('#socDirect')?.addEventListener('click', () => {
    $('#socialModal').classList.add('hidden');
    $('#linkInput').value = preview.suggestedUrl;
    runAnalyze(preview.suggestedUrl);
  });
  body.querySelectorAll('[data-cand]').forEach((b) =>
    b.addEventListener('click', () => {
      $('#socialModal').classList.add('hidden');
      $('#linkInput').value = b.dataset.cand;
      runAnalyze(b.dataset.cand);
    }));
  // Name-only candidate → search GitHub, let the user pick the right repo.
  body.querySelectorAll('[data-lookup]').forEach((b) =>
    b.addEventListener('click', async () => {
      const name = b.dataset.lookup;
      const row = body.querySelector(`[data-candrow="${b.dataset.row}"]`);
      b.disabled = true; b.textContent = 'Looking up…';
      let matches = [];
      try { matches = await window.tv.lookupName(name); } catch { matches = []; }
      row.querySelector('.lookup-results')?.remove();
      const box = document.createElement('div');
      box.className = 'lookup-results';
      if (!matches.length) {
        box.innerHTML = `<div class="muted lookup-empty">No GitHub repos found for “${esc(name)}” — paste its link directly if you have it.</div>`;
      } else {
        box.innerHTML = matches.map((m) => `
          <div class="cand cand-sub">
            <div><b>${esc(m.full_name)}</b><span>${esc(m.description || '')}${m.stars ? ` · ★${Number(m.stars).toLocaleString()}` : ''}${m.language ? ` · ${esc(m.language)}` : ''}</span></div>
            <button class="btn-primary" data-pick="${esc(m.url)}">Analyze →</button>
          </div>`).join('');
        box.querySelectorAll('[data-pick]').forEach((p) =>
          p.addEventListener('click', () => {
            $('#socialModal').classList.add('hidden');
            $('#linkInput').value = p.dataset.pick;
            runAnalyze(p.dataset.pick);
          }));
      }
      row.after(box);
      b.disabled = false; b.textContent = 'Look up →';
    }));
  $('#socExtract').addEventListener('click', async () => {
    const t = $('#socText').value.trim();
    if (!t) return toast('Paste the caption text first.');
    $('#socialModal').classList.add('hidden');
    await runAnalyze(originalInput, { pastedText: t });
  });
}

/* ---------------- library ---------------- */
async function refreshSidebar() {
  const [cats, n] = await Promise.all([window.tv.categories(), window.tv.count()]);
  state.categories = cats;
  $('#libCount').textContent = n || '';
  const nav = $('#catNav');
  nav.innerHTML = cats.map((c) =>
    `<button class="nav-item" data-cat="${esc(c.id)}"><span class="ico">◈</span> ${esc(c.label)} <span class="count">${c.count}</span></button>`).join('')
    || `<div class="muted cats-empty">No categories yet.</div>`;
  nav.querySelectorAll('[data-cat]').forEach((b) =>
    b.addEventListener('click', () => setView('library', b.dataset.cat)));
}

async function refreshLibrary() {
  const items = await window.tv.list(state.filter);
  state.items = items;
  const pills = $('#catPills');
  pills.innerHTML = `<button class="pill ${!state.filter.category ? 'active' : ''}" data-p="">All</button>` +
    state.categories.map((c) =>
      `<button class="pill ${state.filter.category === c.id ? 'active' : ''}" data-p="${esc(c.id)}">${esc(c.label)} · ${c.count}</button>`).join('');
  pills.querySelectorAll('[data-p]').forEach((b) =>
    b.addEventListener('click', () => { state.filter.category = b.dataset.p; refreshLibrary(); }));

  const grid = $('#grid');
  $('#emptyLib').classList.toggle('hidden', items.length > 0);
  grid.innerHTML = items.map((it) => `
    <div class="card" data-id="${it.id}">
      <div class="card-cover">${coverHtml(it, '')}
        <button class="card-fav ${it.favorite ? 'on' : ''}" data-fav="${it.id}" aria-label="Toggle favorite" title="Toggle favorite">${it.favorite ? '★' : '☆'}</button>
      </div>
      <div class="card-body">
        <div class="card-cat">${esc(it.category)}</div>
        <h4>${esc(it.name)}</h4>
        <p>${esc(it.description)}</p>
        <div class="card-meta"><span>${esc(it.source_type)}</span><span>${(it.stats && it.stats.stars) ? '★ ' + it.stats.stars.toLocaleString() : ''}</span></div>
      </div>
    </div>`).join('');
  grid.querySelectorAll('.card').forEach((c) =>
    c.addEventListener('click', (e) => {
      if (e.target.dataset.fav) return;
      openDetail(Number(c.dataset.id));
    }));
  grid.querySelectorAll('[data-fav]').forEach((b) =>
    b.addEventListener('click', async (e) => {
      e.stopPropagation();
      await window.tv.favorite(Number(b.dataset.fav));
      refreshLibrary();
    }));
}

let searchTimer;
$('#searchInput').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { state.filter.q = e.target.value.trim(); refreshLibrary(); }, 250);
});
$('#sortSel').addEventListener('change', (e) => { state.filter.sort = e.target.value; refreshLibrary(); });

/* ---------------- detail modal ---------------- */
async function openDetail(id) {
  const items = await window.tv.list({});
  const item = items.find((i) => i.id === id) || state.items.find((i) => i.id === id);
  if (!item) return;
  state.detailId = id;
  const setup = item.setup || {};
  const steps = setup.steps || [];
  const stats = item.stats || {};
  const body = $('#detailBody');
  body.innerHTML = `
    <div class="detail-hero">
      ${coverHtml(item, 'detail-cover')}
      <div>
        <h2>${esc(item.name)}</h2>
        <div class="tagrow"><span class="tag cat">${esc(item.category)}</span>
          ${(item.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>
        <p>${esc(item.description)}</p>
      </div>
    </div>
    ${Object.keys(stats).length ? `<div class="detail-sec"><h5>Facts</h5><div class="stat-row">
      ${stats.stars != null ? `<div class="stat"><b>★ ${Number(stats.stars).toLocaleString()}</b><span>stars</span></div>` : ''}
      ${stats.forks != null ? `<div class="stat"><b>${Number(stats.forks).toLocaleString()}</b><span>forks</span></div>` : ''}
      ${stats.language ? `<div class="stat"><b>${esc(stats.language)}</b><span>language</span></div>` : ''}
      ${stats.license ? `<div class="stat"><b>${esc(stats.license)}</b><span>license</span></div>` : ''}
      ${stats.domain ? `<div class="stat"><b>${esc(stats.domain)}</b><span>domain</span></div>` : ''}
      ${stats.package ? `<div class="stat"><b class="pkg">${esc(stats.package)}</b><span>package</span></div>` : ''}
      ${stats.version ? `<div class="stat"><b>${esc(stats.version)}</b><span>version</span></div>` : ''}
    </div></div>` : ''}
    ${setup.quickInstall || steps.length ? `<div class="detail-sec"><h5>Setup — the simple version</h5>
      ${setup.quickInstall ? `<div class="step"><div>Quick install<code>${esc(setup.quickInstall)}</code><button class="copybtn" data-copy="${esc(setup.quickInstall)}">copy</button></div></div>` : ''}
      ${steps.map((s, i) => {
        const [head, ...rest] = s.split('\n');
        return `<div class="step"><n>${i + 1}</n><div>${esc(head)}${rest.length ? `<code>${esc(rest.join('\n'))}</code>` : ''}</div></div>`;
      }).join('')}
    </div>` : ''}
    <div class="detail-sec"><h5>Your note</h5>
      <textarea id="noteArea" class="note-area" aria-label="Your note" placeholder="Why are you keeping this?">${esc(item.note || '')}</textarea>
    </div>
    <div class="detail-actions">
      ${item.url ? `<button class="btn-primary" id="dOpen">Open source ↗</button>` : ''}
      <button class="btn-ghost" id="dFav">${item.favorite ? '★ Unfavorite' : '☆ Favorite'}</button>
      <button class="btn-ghost" id="dSave">Save note</button>
      <button class="btn-ghost btn-danger" id="dDel">Delete</button>
    </div>`;
  $('#detailModal').classList.remove('hidden');

  body.querySelectorAll('[data-copy]').forEach((b) =>
    b.addEventListener('click', () => { navigator.clipboard.writeText(b.dataset.copy); toast('Copied ◈'); }));
  $('#dOpen')?.addEventListener('click', () => window.tv.openExternal(item.url));
  $('#dFav').addEventListener('click', async () => { await window.tv.favorite(id); openDetail(id); refreshLibrary(); });
  $('#dSave').addEventListener('click', async () => {
    await window.tv.saveNote(id, $('#noteArea').value);
    toast('Note saved ◈');
  });
  $('#dDel').addEventListener('click', async () => {
    if (!confirm(`Delete "${item.name}" from your vault?`)) return;
    await window.tv.remove(id);
    $('#detailModal').classList.add('hidden');
    refreshLibrary(); refreshSidebar();
    toast('Deleted.');
  });
}

/* ---------------- settings / export ---------------- */
$('#settingsBtn').addEventListener('click', async () => {
  $('#ghToken').value = await window.tv.settingGet('github_token', '');
  $('#settingsModal').classList.remove('hidden');
});
$('#saveToken').addEventListener('click', async () => {
  await window.tv.settingSet('github_token', $('#ghToken').value.trim());
  toast('Token saved ◈');
  $('#settingsModal').classList.add('hidden');
});
$('#clearToken').addEventListener('click', async () => {
  await window.tv.settingSet('github_token', '');
  $('#ghToken').value = '';
  toast('Token cleared.');
});
async function doExport(fmt) {
  const p = await window.tv.exportLib(fmt);
  if (p) toast(`Exported to ${p.split(/[\\/]/).pop()} ◈`);
}
$('#exportBtn').addEventListener('click', () => doExport('md'));
$('#expMd').addEventListener('click', () => doExport('md'));
$('#expJson').addEventListener('click', () => doExport('json'));

/* ---------------- boot ---------------- */
(async function boot() {
  await refreshSidebar();
})();
