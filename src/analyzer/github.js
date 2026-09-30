'use strict';

/**
 * GitHub repository analyzer.
 * Fetches repo metadata + README via the public GitHub API (no key needed),
 * extracts a summary, setup steps, cover images, and stats.
 */

const { extractSetup } = require('./setup');

const API = 'https://api.github.com';
const UA = { 'User-Agent': 'ToolQuiver/1.0', Accept: 'application/vnd.github+json' };

function headers(token) {
  const h = { ...UA };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function headOk(url) {
  try {
    const r = await fetch(url, { method: 'HEAD' });
    return r.ok;
  } catch { return false; }
}

function readmeImages(readme = '', owner, repo) {
  const imgs = [];
  const mdRe = /!\[[^\]]*\]\(([^)]+)\)/g;
  const htmlRe = /<img[^>]+src=["']([^"']+)["']/gi;
  let m;
  while ((m = mdRe.exec(readme)) && imgs.length < 4) imgs.push(m[1]);
  while ((m = htmlRe.exec(readme)) && imgs.length < 4) imgs.push(m[1]);
  return imgs
    .map((u) => {
      if (/^https?:\/\//i.test(u)) return u;
      if (u.startsWith('/')) return `https://raw.githubusercontent.com/${owner}/${repo}/HEAD${u}`;
      return `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${u.replace(/^\.\//, '')}`;
    })
    .filter((u, i, a) => a.indexOf(u) === i);
}

async function analyzeGithub({ owner, repo }, { token } = {}) {
  const h = headers(token);

  const repoRes = await fetch(`${API}/repos/${owner}/${repo}`, { headers: h });
  if (repoRes.status === 404) throw new Error(`Repository ${owner}/${repo} not found.`);
  if (repoRes.status === 403) throw new Error('GitHub API rate limit reached. Add a token in Settings to raise the limit.');
  if (!repoRes.ok) throw new Error(`GitHub API error: ${repoRes.status}`);
  const r = await repoRes.json();

  let readme = '';
  try {
    const readmeRes = await fetch(`${API}/repos/${owner}/${repo}/readme`, {
      headers: { ...h, Accept: 'application/vnd.github.raw' },
    });
    if (readmeRes.ok) readme = await readmeRes.text();
  } catch { /* README optional */ }

  const { steps, quickInstall, summary } = extractSetup(readme);

  // Cover images: social preview card first, then README images
  const images = [];
  const socialPreview = `https://opengraph.githubassets.com/1/${r.owner.login}/${r.name}`;
  if (await headOk(socialPreview)) images.push(socialPreview);
  for (const img of readmeImages(readme, r.owner.login, r.name)) {
    if (images.length >= 2) break;
    if (!images.includes(img)) images.push(img);
  }
  if (!images.length) images.push(r.owner.avatar_url);

  const description = r.description || summary || 'No description provided.';

  return {
    sourceType: 'github',
    url: r.html_url,
    name: r.name.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    rawName: r.name,
    description,
    images: images.slice(0, 2),
    categoryHint: {
      name: r.name, description, topics: r.topics || [],
      language: r.language || '', readme,
    },
    setup: { steps, quickInstall },
    stats: {
      stars: r.stargazers_count, forks: r.forks_count,
      language: r.language, license: r.license ? r.license.spdx_id : null,
      updated: r.updated_at, openIssues: r.open_issues_count,
    },
    meta: { owner: r.owner.login, repo: r.name, topics: r.topics || [] },
  };
}

/** Search GitHub repos by name — used to resolve name-only social candidates.
 *  Returns up to 5 simplified matches for the user to pick from. */
async function searchRepos(query, token) {
  const q = String(query || '').trim().slice(0, 100);
  if (!q) return [];
  try {
    const r = await fetch(`${API}/search/repositories?q=${encodeURIComponent(q)}&per_page=5&sort=stars&order=desc`, { headers: headers(token) });
    if (!r.ok) return [];
    const j = await r.json();
    return (j.items || []).map((it) => ({
      full_name: it.full_name,
      description: (it.description || '').slice(0, 140),
      stars: it.stargazers_count || 0,
      language: it.language || '',
      url: it.html_url,
    }));
  } catch { return []; }
}

module.exports = { analyzeGithub, searchRepos };
