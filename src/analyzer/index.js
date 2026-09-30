'use strict';

/**
 * ToolQuiver analysis pipeline — single entry point.
 * detect() → per-type analyzer → categorize() → normalized item.
 */

const { detect } = require('./detect');
const { analyzeGithub } = require('./github');
const { analyzeWebsite } = require('./website');
const { analyzeSocial } = require('./social');
const { analyzeApk } = require('./apk');
const { categorize } = require('./categorize');

function canonicalUrl(detected, result) {
  if (detected.type === 'github') return `https://github.com/${detected.owner}/${detected.repo}`.toLowerCase();
  if (result && result.url) return String(result.url).split('#')[0].toLowerCase();
  return String(detected.raw || '').toLowerCase();
}

async function analyze(input, opts = {}) {
  const detected = detect(input);
  if (detected.type === 'empty') throw new Error('Paste a link first.');

  let result;
  switch (detected.type) {
    case 'github':
      result = await analyzeGithub(detected, opts);
      break;
    case 'website':
      result = await analyzeWebsite(detected, opts);
      break;
    case 'instagram':
    case 'x':
      result = await analyzeSocial(detected, opts);
      break;
    case 'apk':
      result = await analyzeApk(detected, opts);
      break;
    case 'text': {
      // Free text: try to find links inside, else treat as a manual note
      const urls = String(input).match(/https?:\/\/[^\s)"]+/g) || [];
      for (const u of urls) {
        const inner = detect(u);
        if (inner.type !== 'website' || /github\.com|instagram\.com|x\.com|twitter\.com/.test(u)) {
          return analyze(u, opts);
        }
      }
      if (urls.length) return analyze(urls[0], opts);
      throw new Error('No link found in that text. Paste a GitHub, website, Instagram/X, or APK link.');
    }
    default:
      throw new Error('Could not understand that input.');
  }

  const cat = categorize(result.categoryHint || {});
  return {
    ...result,
    category: result.category || cat.category,
    categoryId: cat.categoryId,
    confidence: cat.confidence,
    tags: cat.tags,
    canonical: canonicalUrl(detected, result),
    analyzedAt: new Date().toISOString(),
  };
}

module.exports = { analyze, detect };
