'use strict';
/* ToolQuiver analyzer tests — run with: npm test */

const assert = require('node:assert/strict');
const { analyze, detect } = require('../src/analyzer');
const { categorize } = require('../src/analyzer/categorize');
const { extractSetup } = require('../src/analyzer/setup');
const { extractCandidates } = require('../src/analyzer/social');
const { searchRepos } = require('../src/analyzer/github');

let passed = 0;
async function t(name, fn) {
  try { await fn(); passed++; console.log('  ✓', name); }
  catch (e) { console.error('  ✗', name, '\n   ', e.message); process.exitCode = 1; }
}

(async () => {
  console.log('detect()');
  await t('github repo url', () => assert.equal(detect('https://github.com/ollama/ollama').type, 'github'));
  await t('github with path', () => { const d = detect('https://github.com/x/y/tree/main/docs'); assert.equal(d.type, 'github'); assert.equal(d.repo, 'y'); });
  await t('website', () => assert.equal(detect('https://raycast.com').type, 'website'));
  await t('instagram reel', () => assert.equal(detect('https://www.instagram.com/reel/AbC123x/').type, 'instagram'));
  await t('x status', () => assert.equal(detect('https://x.com/someone/status/123').type, 'x'));
  await t('apk path', () => assert.equal(detect('D:\\apps\\tool.apk').type, 'apk'));
  await t('free text', () => assert.equal(detect('just some words').type, 'text'));

  console.log('categorize()');
  await t('ai repo', () => {
    const c = categorize({ name: 'ollama', description: 'Get up and running with large language models locally', topics: ['llm'], language: 'Go' });
    assert.equal(c.categoryId, 'ai-ml');
  });
  await t('devops repo', () => {
    const c = categorize({ name: 'homelab', description: 'Self-hosted docker compose homelab with traefik', topics: [], language: 'Shell' });
    assert.equal(c.categoryId, 'devops');
  });
  await t('unknown -> utilities', () => {
    const c = categorize({ name: 'zzz', description: 'qqq' });
    assert.equal(c.categoryId, 'utilities');
    assert.equal(c.confidence, 0);
  });

  console.log('extractSetup()');
  await t('finds quick install', () => {
    const md = '# Foo\n\n## Installation\n\n```bash\nnpm install -g foo\n```\n\n## Usage\n\n1. Run `foo start`\n2. Open http://localhost:3000\n';
    const s = extractSetup(md);
    assert.match(s.quickInstall, /npm install/);
    assert.ok(s.steps.length >= 1);
  });

  await t('prefers the earliest install method over a later npm mention', () => {
    const md = '# Ollama\n\n## Quickstart\n\n```sh\ncurl -fsSL https://ollama.com/install.sh | sh\n```\n\n## Community\n\nUnofficial wrapper:\n\n```sh\nnpm i ollama\n```\n';
    const s = extractSetup(md);
    assert.match(s.quickInstall, /curl.*install\.sh/);
  });

  console.log('extractCandidates()');
  await t('finds github link in caption', () => {
    const c = extractCandidates('This app is insane https://github.com/abi/screenshot-to-code try it');
    assert.ok(c.some((x) => x.name.includes('github.com')));
  });

  console.log('searchRepos() — live network');
  await t('resolves a tool name to repo matches', async () => {
    const m = await searchRepos('ripgrep');
    assert.ok(m.length > 0, 'expected at least one match');
    assert.ok(m[0].full_name && m[0].url && typeof m[0].stars === 'number');
    console.log('    →', m[0].full_name, `★${m[0].stars}`);
  });
  await t('empty query returns []', async () => {
    assert.deepEqual(await searchRepos('   '), []);
  });

  console.log('analyze() — live network');
  await t('github: ollama/ollama', async () => {
    const r = await analyze('https://github.com/ollama/ollama');
    assert.equal(r.sourceType, 'github');
    assert.ok(r.name.length > 1);
    assert.ok(r.description.length > 10);
    assert.ok(r.images.length >= 1);
    assert.ok(r.category && r.tags.length >= 0);
    assert.ok(r.stats.stars > 1000, 'expected ollama to have >1000 stars');
    console.log('    →', r.name, '|', r.category, `| ★${r.stats.stars}`);
  });
  await t('website: example og tags', async () => {
    const r = await analyze('https://github.com');
    assert.equal(r.sourceType, 'website');
    assert.ok(r.name.length > 1);
    console.log('    →', r.name, '|', r.category);
  });
  await t('social: x link asks for input', async () => {
    const r = await analyze('https://x.com/someone/status/123456789');
    assert.equal(r.sourceType, 'social');
    assert.equal(r.needsUserInput, true);
  });

  console.log(`\n${passed} tests passed${process.exitCode ? ' (with failures)' : ''}.`);
})();
