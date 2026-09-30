'use strict';

/**
 * Instagram / X (Twitter) link handler.
 *
 * These platforms block unauthenticated scraping, so ToolQuiver tries the
 * public oEmbed endpoints first and otherwise falls back to smart parsing
 * of pasted post text — extracting candidate app/tool names and any
 * GitHub or website links mentioned, which can then be analyzed directly.
 */

const { detect } = require('./detect');

async function tryOEmbed(url) {
  const endpoints = [
    `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}`,
  ];
  for (const ep of endpoints) {
    try {
      const r = await fetch(ep, { headers: { 'User-Agent': 'ToolQuiver/1.0' } });
      if (r.ok) {
        const j = await r.json();
        if (j.title || j.author_name) return { title: j.title || '', author: j.author_name || '', html: j.html || '' };
      }
    } catch { /* try next */ }
  }
  return null;
}

/** Extract candidate tool/app names from a chunk of post text. */
function extractCandidates(text) {
  const found = [];
  const push = (name, why) => {
    name = name.trim().replace(/^[@#]+/, '');
    if (name.length >= 2 && name.length <= 60 && !found.some((f) => f.name.toLowerCase() === name.toLowerCase())) {
      found.push({ name, why });
    }
  };

  // URLs inside the text (GitHub links get priority)
  const urls = text.match(/https?:\/\/[^\s)"]+/g) || [];
  for (const u of urls) {
    const d = detect(u);
    if (d.type === 'github') push(u, 'GitHub link in post');
    else if (d.type === 'website') {
      try { push(new URL(u).hostname.replace(/^www\./, ''), 'link in post'); } catch { /* ignore */ }
    }
  }

  // "X is an app/tool that ..." patterns
  const appRe = /([A-Z][A-Za-z0-9 .&'-]{1,40}?)\s+(?:is\s+an?\s+)?(?:app|tool|website|platform|extension|bot|software|ai)\b/gi;
  let m;
  while ((m = appRe.exec(text)) && found.length < 8) push(m[1], 'mentioned as app/tool');

  // Quoted names: "Foo" or 'Foo'
  const qRe = /["“]([A-Za-z0-9 .&'-]{2,40})["”]/g;
  while ((m = qRe.exec(text)) && found.length < 8) push(m[1], 'quoted name');

  return found.slice(0, 8);
}

async function analyzeSocial({ platform, raw }, { pastedText = '' } = {}) {
  const oembed = await tryOEmbed(raw);
  const text = pastedText || (oembed && `${oembed.title} ${oembed.author}`) || '';
  const candidates = extractCandidates(`${text} ${raw}`);

  // If the post text itself contains a GitHub/website link, surface it first.
  const direct = candidates.find((c) => /^https?:\/\//.test(c.name));

  return {
    sourceType: 'social',
    platform,
    url: raw,
    name: oembed && oembed.title ? oembed.title.slice(0, 80)
      : `${platform === 'instagram' ? 'Instagram' : 'X'} post`,
    description: oembed && oembed.author
      ? `Post by ${oembed.author}. Instagram/X block automated reads — paste the caption text below and ToolQuiver will pull out the tools it mentions.`
      : 'Instagram/X block automated reads. Paste the post caption text and ToolQuiver will extract every app, tool, or repo it mentions.',
    images: [],
    candidates,
    suggestedUrl: direct ? direct.name : null,
    categoryHint: { name: text.slice(0, 120), description: text.slice(0, 500), topics: [], language: '', readme: '' },
    setup: { steps: [], quickInstall: null },
    stats: {},
    meta: { platform, needsText: !text.trim() },
    needsUserInput: true,
  };
}

module.exports = { analyzeSocial, extractCandidates };
