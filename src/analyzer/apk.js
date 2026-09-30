'use strict';

/**
 * APK analyzer — extracts package name, version, label, permissions and the
 * launcher icon from an .apk file (local path or download URL).
 * Parses the binary AndroidManifest.xml (AXML) with zero native dependencies.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const AdmZip = require('adm-zip');

const ANDROID_NS = 'http://schemas.android.com/apk/res/android';
const MAX_APK_BYTES = 150 * 1024 * 1024;

// ---------- minimal AXML (binary AndroidManifest.xml) parser ----------

function parseStringPool(buf, chunkOff) {
  const u32 = (o) => buf.readUInt32LE(chunkOff + o);
  const stringCount = u32(8), flags = u32(16);
  const stringsStart = u32(20);
  const isUtf8 = (flags & 0x100) !== 0;
  const offsets = [];
  for (let i = 0; i < stringCount; i++) offsets.push(u32(28 + i * 4));
  const base = chunkOff + stringsStart;

  const varint = (p) => {
    const b = buf[p];
    return (b & 0x80) ? [((b & 0x7f) << 8) | buf[p + 1], p + 2] : [b, p + 1];
  };
  const strings = offsets.map((rel) => {
    const p = base + rel;
    try {
      if (isUtf8) {
        let [, p1] = varint(p);
        let [len, p2] = varint(p1);
        return buf.toString('utf8', p2, p2 + len);
      }
      const len = buf.readUInt16LE(p);
      return buf.toString('utf16le', p + 2, p + 2 + len * 2);
    } catch { return ''; }
  });
  return strings;
}

function parseManifest(buf) {
  if (buf.readUInt16LE(0) !== 0x0003) throw new Error('Not a binary AndroidManifest.xml');
  const strings = parseStringPool(buf, 8);

  const out = { package: '', versionCode: '', versionName: '', label: '', labelResId: null, iconRef: '', iconResId: null, permissions: [] };
  let off = 8;
  const fileSize = buf.readUInt32LE(4);

  const stack = [];
  while (off < fileSize) {
    const type = buf.readUInt16LE(off);
    const size = buf.readUInt32LE(off + 4);
    if (size <= 0 || off + size > buf.length) break;

    if (type === 0x0001) { /* string pool already parsed */ }
    else if (type === 0x0102) { // START_ELEMENT
      const nameIdx = buf.readInt32LE(off + 20);
      const elName = nameIdx >= 0 ? strings[nameIdx] : '';
      const attrCount = buf.readUInt16LE(off + 28);
      const attrs = [];
      let aOff = off + 36;
      for (let i = 0; i < attrCount; i++) {
        const nsIdx = buf.readInt32LE(aOff);
        const aNameIdx = buf.readInt32LE(aOff + 4);
        const dataType = buf[aOff + 15];
        const data = buf.readUInt32LE(aOff + 16);
        attrs.push({
          ns: nsIdx >= 0 ? strings[nsIdx] : '',
          name: aNameIdx >= 0 ? strings[aNameIdx] : '',
          dataType,
          str: dataType === 0x03 && data < strings.length ? strings[data] : null,
          int: (dataType >= 0x10 && dataType <= 0x1f) ? buf.readInt32LE(aOff + 16) : null,
          resId: dataType === 0x01 ? data : null,
        });
        aOff += 20;
      }
      const attr = (n) => attrs.find((a) => a.name === n);
      if (elName === 'manifest') {
        out.package = (attr('package') || {}).str || '';
        const vc = attr('versionCode');
        out.versionCode = vc ? String(vc.int != null ? vc.int : vc.str || '') : '';
        out.versionName = ((attr('versionName') || {}).str) || '';
      } else if (elName === 'uses-permission') {
        const a = attrs.find((x) => x.name === 'name' && x.ns === ANDROID_NS) || attr('name');
        if (a && a.str) out.permissions.push(a.str);
      } else if (elName === 'application') {
        const lab = attrs.find((x) => x.name === 'label' && x.ns === ANDROID_NS);
        if (lab) {
          if (lab.str) out.label = lab.str;
          else if (lab.resId) out.labelResId = lab.resId;
        }
        const icon = attrs.find((x) => x.name === 'icon' && x.ns === ANDROID_NS);
        if (icon) {
          if (icon.resId) out.iconResId = icon.resId;
          else out.iconRef = icon.str || String(icon.int != null ? icon.int : '');
        }
      }
      stack.push(elName);
    } else if (type === 0x0103) { // END_ELEMENT
      stack.pop();
    }
    off += size;
  }
  return out;
}

// ---------- minimal resources.arsc parser (for icon/label resource refs) ----------

function parseArscPackage(buf, off, size) {
  const id = buf.readUInt32LE(off + 8);
  const typeStringsOff = buf.readUInt32LE(off + 268);
  const keyStringsOff = buf.readUInt32LE(off + 276);
  const typeStrings = parseStringPool(buf, off + typeStringsOff);
  const keyStrings = parseStringPool(buf, off + keyStringsOff);
  const chunks = [];
  let c = off + keyStringsOff + buf.readUInt32LE(off + keyStringsOff + 4);
  while (c < off + size) {
    const t = buf.readUInt16LE(c);
    const sz = buf.readUInt32LE(c + 4);
    if (sz <= 0 || c + sz > off + size) break;
    if (t === 0x0201) chunks.push({ off: c, size: sz });
    c += sz;
  }
  return { id, typeStrings, keyStrings, chunks };
}

/**
 * Resolve an Android resource ID (0xPPTTEEEE) to its string value.
 * For drawables/mipmaps this is the file path; for strings the text.
 * Prefers the highest-density config when several exist.
 */
function resolveResourceCandidates(arscBuf, resId) {
  if (arscBuf.readUInt16LE(0) !== 0x0002) return [];
  const fileSize = arscBuf.readUInt32LE(4);
  let off = 12;
  let globalStrings = null;
  const packages = [];
  while (off < fileSize) {
    const type = arscBuf.readUInt16LE(off);
    const size = arscBuf.readUInt32LE(off + 4);
    if (size <= 0 || off + size > arscBuf.length) break;
    if (type === 0x0001 && !globalStrings) globalStrings = parseStringPool(arscBuf, off);
    else if (type === 0x0200) packages.push(parseArscPackage(arscBuf, off, size));
    off += size;
  }
  if (!globalStrings) return [];

  const pkgId = (resId >>> 24) & 0xff;
  const typeId = (resId >>> 16) & 0xff;
  const entryId = resId & 0xffff;
  const pkg = packages.find((p) => p.id === pkgId);
  if (!pkg) return [];

  const candidates = [];
  for (const ch of pkg.chunks) {
    const c = ch.off;
    if (arscBuf.readUInt32LE(c + 8) !== typeId) continue;
    const entryCount = arscBuf.readUInt32LE(c + 12);
    if (entryId >= entryCount) continue;
    const entriesStart = arscBuf.readUInt32LE(c + 16);
    const offsetsBase = c + entriesStart - entryCount * 4;
    const entryOff = arscBuf.readUInt32LE(offsetsBase + entryId * 4);
    if (entryOff === 0xffffffff) continue;
    const e = c + entriesStart + entryOff;
    if (arscBuf.readUInt16LE(e + 2) & 0x0001) continue; // complex/bag — skip
    const dataType = arscBuf[e + 11];
    const data = arscBuf.readUInt32LE(e + 12);
    if (dataType === 0x03 && data < globalStrings.length) {
      const density = arscBuf.readUInt16LE(c + 34); // ResTable_config.density
      candidates.push({ value: globalStrings[data], density });
    }
  }
  candidates.sort((a, b) => b.density - a.density);
  return candidates;
}

function resolveResourceString(arscBuf, resId) {
  const c = resolveResourceCandidates(arscBuf, resId);
  return c.length ? c[0].value : null;
}

/** Generic AXML element walk — returns [{name, attrs:[{ns,name,resId,str}]}]. */
function parseAxmlElements(buf) {
  if (buf.readUInt16LE(0) !== 0x0003) return [];
  const strings = parseStringPool(buf, 8);
  const els = [];
  let off = 8;
  const fileSize = buf.readUInt32LE(4);
  while (off < fileSize) {
    const type = buf.readUInt16LE(off);
    const size = buf.readUInt32LE(off + 4);
    if (size <= 0 || off + size > buf.length) break;
    if (type === 0x0102) { // START_ELEMENT
      const nameIdx = buf.readInt32LE(off + 20);
      const attrCount = buf.readUInt16LE(off + 28);
      const attrs = [];
      let aOff = off + 36;
      for (let i = 0; i < attrCount; i++) {
        const nsIdx = buf.readInt32LE(aOff);
        const aNameIdx = buf.readInt32LE(aOff + 4);
        const dataType = buf[aOff + 15];
        const data = buf.readUInt32LE(aOff + 16);
        attrs.push({
          ns: nsIdx >= 0 ? strings[nsIdx] : '',
          name: aNameIdx >= 0 ? strings[aNameIdx] : '',
          resId: dataType === 0x01 ? data : null,
          str: dataType === 0x03 && data < strings.length ? strings[data] : null,
        });
        aOff += 20;
      }
      els.push({ name: nameIdx >= 0 ? strings[nameIdx] : '', attrs });
    }
    off += size;
  }
  return els;
}

/** Resolve the launcher icon to PNG bytes, following adaptive-icon XMLs. */
function resolveIconPng(zip, arscBuf, iconResId) {
  const entryData = (p) => {
    try { const e = p && zip.getEntry(p); return e ? e.getData() : null; }
    catch { return null; }
  };
  // 1) direct PNG candidates, highest density first
  const direct = resolveResourceCandidates(arscBuf, iconResId)
    .filter((c) => /\.png$/i.test(c.value));
  for (const c of direct) {
    const d = entryData(c.value);
    if (d && d.length > 100) return d;
  }
  // 2) adaptive-icon XML → foreground / background drawables
  const xmls = resolveResourceCandidates(arscBuf, iconResId)
    .filter((c) => /\.xml$/i.test(c.value));
  for (const x of xmls) {
    const xml = entryData(x.value);
    if (!xml) continue;
    let els;
    try { els = parseAxmlElements(xml); } catch { continue; }
    const refs = [];
    for (const el of els) {
      const d = el.attrs.find((a) => a.name === 'drawable');
      if (d && d.resId) {
        // foreground first, then monochrome, then background
        const prio = /foreground/i.test(el.name) ? 0 : /monochrome/i.test(el.name) ? 1 : 2;
        refs.push({ prio, id: d.resId });
      }
    }
    refs.sort((a, b) => a.prio - b.prio);
    for (const r of refs) {
      const sub = resolveResourceCandidates(arscBuf, r.id).filter((c) => /\.png$/i.test(c.value));
      for (const s of sub) {
        const d = entryData(s.value);
        if (d && d.length > 100) return d;
      }
    }
  }
  return null;
}

// ---------- helpers ----------

function prettifyPackage(pkg) {
  const last = (pkg || '').split('.').pop() || 'Unknown app';
  return last.replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function humanizePermission(p) {
  const short = p.split('.').pop() || p;
  return short.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function pickIcon(zip) {
  const entries = zip.getEntries().filter((e) => !e.isDirectory && /ic_launcher[^/]*\.png$/i.test(e.entryName));
  if (!entries.length) return null;
  const densityRank = (n) => {
    const m = n.match(/-(xxxhdpi|xxhdpi|xhdpi|hdpi|mdpi|ldpi|nodpi)/i);
    const order = { xxxhdpi: 6, xxhdpi: 5, xhdpi: 4, hdpi: 3, mdpi: 2, ldpi: 1, nodpi: 0 };
    return m ? order[m[1].toLowerCase()] : -1;
  };
  // prefer round icons? plain launcher icons are fine; prefer highest density
  entries.sort((a, b) => densityRank(b.entryName) - densityRank(a.entryName));
  const best = entries.find((e) => /mipmap/i.test(e.entryName)) || entries[0];
  return { buffer: best.getData(), name: path.basename(best.entryName) };
}

async function downloadApk(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'ToolQuiver/1.0' } });
  if (!res.ok) throw new Error(`Could not download APK (HTTP ${res.status}).`);
  const len = Number(res.headers.get('content-length') || 0);
  if (len > MAX_APK_BYTES) throw new Error('APK is larger than 150 MB — too big to analyze.');
  const ab = await res.arrayBuffer();
  if (ab.byteLength > MAX_APK_BYTES) throw new Error('APK is larger than 150 MB — too big to analyze.');
  const tmp = path.join(os.tmpdir(), `toolquiver-${Date.now()}.apk`);
  fs.writeFileSync(tmp, Buffer.from(ab));
  return tmp;
}

async function analyzeApk({ path: localPath, url }) {
  let apkPath = localPath;
  let downloaded = false;
  if (url) { apkPath = await downloadApk(url); downloaded = true; }
  if (!apkPath || !fs.existsSync(apkPath)) throw new Error('APK file not found.');

  let zip;
  try { zip = new AdmZip(apkPath); }
  catch { throw new Error('Could not read APK — the file may be corrupted.'); }

  const manifestEntry = zip.getEntry('AndroidManifest.xml');
  if (!manifestEntry) throw new Error('No AndroidManifest.xml found — not a valid APK.');
  const m = parseManifest(manifestEntry.getData());

  // Resolve @string/@mipmap resource references via resources.arsc
  const arscEntry = zip.getEntry('resources.arsc');
  const arscBuf = arscEntry ? arscEntry.getData() : null;
  const arscResolve = (id) => {
    if (!arscBuf || !id) return null;
    try { return resolveResourceString(arscBuf, id); } catch { return null; }
  };

  let label = m.label && !m.label.startsWith('@') ? m.label : '';
  if (!label && m.labelResId) label = arscResolve(m.labelResId) || '';
  const name = label || prettifyPackage(m.package);

  let iconBuffer = null;
  if (m.iconResId && arscBuf) {
    try { iconBuffer = resolveIconPng(zip, arscBuf, m.iconResId); } catch { /* ignore */ }
  }
  const icon = iconBuffer ? { buffer: iconBuffer } : pickIcon(zip);
  if (downloaded) { try { fs.unlinkSync(apkPath); } catch { /* ignore */ } }

  const perms = [...new Set(m.permissions)].slice(0, 12).map(humanizePermission);

  const steps = [
    `Download the APK${url ? ' from the link above' : ''}.`,
    'On your Android phone, open Settings → Security and allow "Install unknown apps".',
    `Open the APK file to install ${name}${m.versionName ? ` v${m.versionName}` : ''}.`,
  ];

  return {
    sourceType: 'apk',
    url: url || apkPath,
    name,
    description: `${name} — Android package ${m.package || '(unknown package)'}` +
      (m.versionName ? `, version ${m.versionName}` : '') +
      (perms.length ? `. Permissions: ${perms.slice(0, 5).join(', ')}${perms.length > 5 ? ', …' : ''}.` : '.'),
    images: [],
    iconBuffer: icon ? icon.buffer : null,
    categoryHint: { name, description: `android apk mobile app ${m.package}`, topics: [], language: '', readme: '' },
    setup: { steps, quickInstall: null },
    stats: {
      package: m.package, version: m.versionName, versionCode: m.versionCode,
      permissions: perms,
    },
    meta: { package: m.package },
  };
}

module.exports = { analyzeApk };
