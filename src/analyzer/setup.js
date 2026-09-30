'use strict';

/**
 * Extracts simple, human-friendly setup steps from a README.
 * Finds install / quick-start / usage sections, pulls out code blocks
 * and list steps, and detects one-line install commands.
 */

const SECTION_RE = /^#{1,4}\s*(.+)$/gim;
const INTERESTING = /install|quick.?start|getting started|set.?up|usage|deploy|run it|try it/i;
const BORING = /contribut|license|credit|acknowledg|support|donat|sponsor|faq|troubleshoot|changelog|roadmap/i;

const ONE_LINERS = [
  /npm\s+(i|install)\s+(-g\s+)?([^\s&|;]+)/i,
  /pip\s+install\s+([^\s&|;]+)/i,
  /go\s+install\s+([^\s&|;]+)/i,
  /cargo\s+install\s+([^\s&|;]+)/i,
  /brew\s+install\s+([^\s&|;]+)/i,
  /docker\s+run\s+[^\n]*/i,
  /curl\s+[^\n]*\|\s*(sh|bash)/i,
  /winget\s+install\s+([^\s&|;]+)/i,
  /scoop\s+install\s+([^\s&|;]+)/i,
];

function stripMarkdown(s) {
  return String(s || '')
    .replace(/```[\s\S]*?```/g, ' ')   // code blocks handled separately
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~|-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractCodeBlocks(section) {
  const blocks = [];
  const re = /```(?:\w+)?\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(section)) && blocks.length < 4) {
    const code = m[1].split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 3).join('\n');
    if (code) blocks.push(code);
  }
  return blocks;
}

function extractListSteps(section) {
  const steps = [];
  for (const line of section.split('\n')) {
    const m = line.match(/^\s*(?:\d+[.)]|[-*])\s+(.{12,160})/);
    if (m) {
      const clean = stripMarkdown(m[1]);
      if (clean && !/click.*star|star.*repo/i.test(clean)) steps.push(clean);
    }
    if (steps.length >= 6) break;
  }
  return steps;
}

function extractSetup(readme = '') {
  if (!readme) return { steps: [], quickInstall: null };

  const sections = [];
  const matches = [...readme.matchAll(SECTION_RE)];
  for (let i = 0; i < matches.length; i++) {
    const title = matches[i][1];
    const start = matches[i].index + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : readme.length;
    sections.push({ title, body: readme.slice(start, end) });
  }

  const interesting = sections.filter(
    (s) => INTERESTING.test(s.title) && !BORING.test(s.title)
  );
  const pool = (interesting.length ? interesting : sections.slice(0, 3))
    .map((s) => s.body).join('\n');

  // One-line install command: prefer the earliest match inside the install
  // sections — maintainers document the primary method first (a later
  // `npm i x` mention shouldn't beat the official `curl ... | sh` line).
  let quickInstall = null;
  {
    let bestIdx = Infinity;
    for (const re of ONE_LINERS) {
      const gre = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
      for (const m of pool.matchAll(gre)) {
        if (m.index < bestIdx) { bestIdx = m.index; quickInstall = m[0].trim().slice(0, 120); }
      }
    }
  }
  if (!quickInstall) {
    for (const re of ONE_LINERS) {
      const m = readme.match(re);
      if (m) { quickInstall = m[0].trim().slice(0, 120); break; }
    }
  }

  // Steps: list items first, then code blocks as steps
  const steps = [];
  for (const s of interesting.length ? interesting : sections.slice(0, 2)) {
    for (const st of extractListSteps(s.body)) {
      if (steps.length < 6 && !steps.includes(st)) steps.push(st);
    }
  }
  for (const block of extractCodeBlocks(pool)) {
    if (steps.length < 6) steps.push('Run:\n' + block);
  }

  // Fallbacks from the whole README if nothing found
  if (!steps.length) {
    const m = readme.match(/```(?:bash|sh|shell|console)?\n([\s\S]{1,200}?)```/i);
    if (m) steps.push('Run:\n' + m[1].split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 3).join('\n'));
  }

  const summary = (() => {
    const first = readme.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && !l.startsWith('![') && !l.startsWith('<'))[0];
    return first ? stripMarkdown(first).slice(0, 280) : '';
  })();

  return { steps: steps.slice(0, 6), quickInstall, summary };
}

module.exports = { extractSetup, stripMarkdown };
