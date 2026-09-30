'use strict';

/**
 * Link-type detection for ToolQuiver.
 * Classifies raw user input into one of: github | website | instagram | x | apk | text
 */

const GITHUB_REPO_RE = /^https?:\/\/(www\.)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?(?:[\/#?].*)?$/i;
const INSTAGRAM_RE = /^https?:\/\/(www\.)?instagram\.com\/(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i;
const X_RE = /^https?:\/\/(www\.)?(x\.com|twitter\.com)\/([A-Za-z0-9_]+)\/status\/(\d+)/i;
const URL_RE = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;

function detect(input) {
  const text = String(input || '').trim();
  if (!text) return { type: 'empty', raw: text };

  // Local APK file path
  if (/\.apk$/i.test(text) && !URL_RE.test(text)) {
    return { type: 'apk', raw: text, path: text.replace(/^file:\/\//, '') };
  }
  // Remote APK link
  if (/\.apk(\?|#|$)/i.test(text) && URL_RE.test(text)) {
    return { type: 'apk', raw: text, url: text };
  }

  let m;
  if ((m = text.match(GITHUB_REPO_RE))) {
    return { type: 'github', raw: text, owner: m[2], repo: m[3] };
  }
  if ((m = text.match(INSTAGRAM_RE))) {
    return { type: 'instagram', raw: text, platform: 'instagram', shortcode: m[3] };
  }
  if ((m = text.match(X_RE))) {
    return { type: 'x', raw: text, platform: 'x', handle: m[3], statusId: m[4] };
  }
  if (URL_RE.test(text.split(/\s+/)[0]) && !/\s/.test(text)) {
    return { type: 'website', raw: text, url: text };
  }
  // Free text (e.g. pasted post caption mentioning a tool)
  return { type: 'text', raw: text };
}

module.exports = { detect };
