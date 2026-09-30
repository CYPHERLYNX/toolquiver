'use strict';

/**
 * Website analyzer — extracts Open Graph / meta tags from any URL.
 * Dependency-free: lightweight regex parsing of the <head>.
 */

const { stripMarkdown } = require('./setup');

function meta(html, ...names) {
  for (const name of names) {
    const re = new RegExp(
      `<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']+)["']|` +
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${name}["']`,
      'i'
    );
    const m = html.match(re);
    if (m) return (m[1] || m[2] || '').trim();
  }
  return '';
}

function absolutize(url, base) {
  try { return new URL(url, base).href; } catch { return url; }
}

function cleanTitle(t) {
  return stripMarkdown(t).replace(/\s*[|\-–—]\s*.*$/, '').trim() || t;
}

async function analyzeWebsite({ url }) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ToolQuiver/1.0' },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`Could not fetch page (HTTP ${res.status}).`);
  const finalUrl = res.url;
  const html = await res.text();
  const head = html.slice(0, html.toLowerCase().indexOf('</head>') > 0 ? html.toLowerCase().indexOf('</head>') : 60000);

  const title = meta(head, 'og:title', 'twitter:title')
    || (head.match(/<title[^>]*>([^<]+)<\/title>/i) || [])[1] || '';
  const description = meta(head, 'og:description', 'twitter:description', 'description') || '';
  let image = meta(head, 'og:image', 'twitter:image');
  if (image) image = absolutize(image, finalUrl);

  const images = [];
  if (image) images.push(image);
  // favicon fallback
  const iconMatch = head.match(/<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']+)["']/i);
  if (iconMatch) images.push(absolutize(iconMatch[1], finalUrl));

  let hostname = '';
  try { hostname = new URL(finalUrl).hostname.replace(/^www\./, ''); } catch { /* ignore */ }

  const name = cleanTitle(title) || hostname || 'Untitled site';

  return {
    sourceType: 'website',
    url: finalUrl,
    name,
    description: stripMarkdown(description).slice(0, 500) || `A website worth keeping: ${hostname}`,
    images: images.slice(0, 2),
    categoryHint: { name, description, topics: [], language: '', readme: '' },
    setup: { steps: [`Open ${finalUrl} in your browser.`, 'Bookmark it — or better, keep it here in ToolQuiver.'], quickInstall: null },
    stats: { domain: hostname },
    meta: { domain: hostname },
  };
}

module.exports = { analyzeWebsite };
