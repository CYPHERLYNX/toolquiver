'use strict';

/**
 * Heuristic auto-categorization engine.
 * Scores name + description + topics + language against keyword sets.
 * No API key required — runs fully offline.
 */

const CATEGORIES = [
  { id: 'ai-ml', label: 'AI & Machine Learning', keywords: ['ai', 'llm', 'gpt', 'language model', 'large language', 'machine learning', 'deep learning', 'neural', 'transformer', 'diffusion', 'stable diffusion', 'chatbot', 'rag', 'embeddings', 'vector', 'mlops', 'pytorch', 'tensorflow', 'huggingface', 'inference', 'fine-tune', 'agent', 'copilot', 'whisper', 'tts', 'image generation', 'prompt'] },
  { id: 'devtools', label: 'Developer Tools', keywords: ['developer', 'devtool', 'cli', 'sdk', 'api', 'framework', 'library', 'boilerplate', 'starter', 'bundler', 'linter', 'formatter', 'debug', 'terminal', 'vscode', 'extension', 'git', 'ci', 'cd', 'testing', 'mock', 'npm', 'package'] },
  { id: 'devops', label: 'DevOps & Infrastructure', keywords: ['devops', 'docker', 'kubernetes', 'k8s', 'deploy', 'self-host', 'selfhost', 'server', 'cloud', 'infrastructure', 'terraform', 'ansible', 'monitoring', 'observability', 'proxy', 'nginx', 'homelab', 'vps', 'ci/cd', 'pipeline'] },
  { id: 'web', label: 'Web Apps & Sites', keywords: ['website', 'web app', 'webapp', 'saas', 'platform', 'dashboard', 'portal', 'online tool', 'browser', 'web-based', 'next.js', 'landing page'] },
  { id: 'design', label: 'Design & Creative', keywords: ['design', 'figma', 'ui', 'ux', 'illustration', 'photo', 'image editor', 'video editor', 'canvas', 'font', 'icon', 'theme', 'mockup', 'prototype', '3d', 'blender', 'creative'] },
  { id: 'productivity', label: 'Productivity', keywords: ['productivity', 'notes', 'note-taking', 'markdown', 'second brain', 'knowledge base', 'wiki', 'todo', 'task', 'kanban', 'notion', 'obsidian', 'calendar', 'reminder', 'pomodoro', 'habit', 'journal', 'planner', 'organize', 'workflow', 'automation', 'shortcut'] },
  { id: 'media', label: 'Media & Entertainment', keywords: ['music', 'video', 'streaming', 'podcast', 'player', 'youtube', 'spotify', 'movie', 'anime', 'manga', 'gallery', 'entertainment', 'radio', 'editor'] },
  { id: 'mobile', label: 'Mobile Apps', keywords: ['android', 'ios', 'apk', 'mobile', 'flutter', 'react native', 'kotlin', 'swift', 'app store', 'play store'] },
  { id: 'security', label: 'Security & Privacy', keywords: ['security', 'privacy', 'vpn', 'encryption', 'password', '2fa', 'auth', 'firewall', 'pentest', 'vulnerability', 'malware', 'adblock', 'tracker', 'anonymous'] },
  { id: 'data', label: 'Data & Analytics', keywords: ['data', 'analytics', 'database', 'sql', 'dashboard', 'visualization', 'chart', 'pandas', 'etl', 'warehouse', 'bigquery', 'metrics', 'scrape', 'crawl'] },
  { id: 'gaming', label: 'Gaming', keywords: ['game', 'gaming', 'unity', 'unreal', 'godot', 'emulator', 'minecraft', 'rpg', 'fps', 'puzzle game', 'itch.io'] },
  { id: 'education', label: 'Education & Learning', keywords: ['learn', 'course', 'tutorial', 'education', 'study', 'flashcard', 'quiz', 'documentation', 'handbook', 'roadmap', 'cheatsheet', 'interview prep'] },
  { id: 'finance', label: 'Finance & Crypto', keywords: ['finance', 'crypto', 'bitcoin', 'blockchain', 'trading', 'stock', 'budget', 'expense', 'invoice', 'web3', 'defi', 'wallet'] },
  { id: 'communication', label: 'Communication', keywords: ['chat', 'messaging', 'email', 'discord', 'slack', 'video call', 'meet', 'forum', 'social', 'comment'] },
  { id: 'utilities', label: 'Utilities', keywords: ['utility', 'utilities', 'converter', 'calculator', 'downloader', 'compress', 'pdf', 'qr', 'screenshot', 'clipboard', 'file manager', 'rename', 'backup', 'cleaner'] },
];

const LANG_HINTS = {
  python: ['ai-ml', 'data'], javascript: ['web', 'devtools'], typescript: ['web', 'devtools'],
  go: ['devops', 'devtools'], rust: ['devtools', 'security'], kotlin: ['mobile'], swift: ['mobile'],
  dart: ['mobile'], java: ['mobile', 'devtools'], 'c++': ['gaming', 'devtools'], 'c#': ['gaming', 'devtools'],
  shell: ['devops'], lua: ['gaming'],
};

function tokenize(s) {
  return String(s || '').toLowerCase();
}

// Short keywords (ai, cli, api…) must match whole words — otherwise
// "ai" matches "said" and "api" matches "rapid".
function hit(hay, kw) {
  if (kw.length <= 3) {
    const safe = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${safe}\\b`).test(hay);
  }
  return hay.includes(kw);
}

function categorize({ name = '', description = '', topics = [], language = '', readme = '' }) {
  const hayName = tokenize(name);
  const hayDesc = tokenize(description);
  const hayTopics = tokenize(topics.join(' '));
  const hayReadme = tokenize(readme.slice(0, 4000));

  const scores = CATEGORIES.map((cat) => {
    let score = 0;
    const matched = [];
    for (const kw of cat.keywords) {
      const k = kw.toLowerCase();
      if (hit(hayName, k)) { score += 3; matched.push(kw); }
      else if (hit(hayTopics, k)) { score += 2.5; matched.push(kw); }
      else if (hit(hayDesc, k)) { score += 2; matched.push(kw); }
      else if (hit(hayReadme, k)) { score += 0.5; }
    }
    return { cat, score, matched: [...new Set(matched)] };
  });

  // Language prior nudge
  const langKey = tokenize(language);
  if (LANG_HINTS[langKey]) {
    for (const s of scores) {
      if (LANG_HINTS[langKey].includes(s.cat.id)) s.score += 1.5;
    }
  }

  scores.sort((a, b) => b.score - a.score);
  const best = scores[0];
  const runnerUp = scores[1];

  const confidence = best.score <= 0 ? 0
    : best.score >= 8 ? 0.95
    : best.score >= 5 ? 0.8
    : best.score >= 3 ? 0.6
    : 0.4;

  const category = best.score > 0 ? best.cat : { id: 'utilities', label: 'Utilities' };
  const tags = [...new Set([
    ...best.matched.slice(0, 5),
    ...(runnerUp && runnerUp.score > 0 ? runnerUp.matched.slice(0, 2) : []),
    ...topics.slice(0, 4),
  ])].slice(0, 8);

  return {
    category: category.label,
    categoryId: category.id,
    confidence: Math.round(confidence * 100) / 100,
    tags,
  };
}

module.exports = { categorize, CATEGORIES };
