# ToolQuiver Architecture

## Overview

ToolQuiver is an Electron app with a strict separation between the **analysis
pipeline** (pure Node, no Electron dependencies — fully testable with
`npm test`) and the **desktop shell** (window, IPC, file dialogs, local storage).

```
┌─────────────────────────────────────────────────────────┐
│  Renderer (renderer/)        black-theme UI, no framework │
│   index.html / styles.css / app.js                       │
│        ↕  window.tv bridge (preload.js, contextIsolated) │
│  Main (main.js)              window, dialogs, IPC handlers│
│        ↕                                               │
│  Analyzer (src/analyzer/)    pure functions, no Electron │
│        ↕                                               │
│  Store (src/store/db.js)     better-sqlite3              │
└─────────────────────────────────────────────────────────┘
```

## Analysis pipeline (`src/analyzer/index.js`)

Every input goes through the same pipeline:

```
raw input → detect() → per-type analyzer → categorize() → normalized item
```

The normalized item shape:

```js
{
  sourceType: 'github' | 'website' | 'social' | 'apk',
  platform,            // 'instagram' | 'x' | null
  url, canonical,      // canonical = dedupe key
  name, description,
  images: [],          // remote cover candidates (max 2)
  iconBuffer,          // APK launcher icon bytes (if found)
  category, categoryId, confidence, tags,
  setup: { steps: [], quickInstall },
  stats: {},           // stars, language, package, version…
  meta: {},
  needsUserInput,      // social links: true until user pastes caption text
}
```

### Module notes

- **detect.js** — regex-based classification. GitHub URLs are normalized
  (`/tree/…`, `.git` suffixes stripped). Anything with a single URL and no
  whitespace is a website; multi-word text with URLs inside is re-dispatched.
- **github.js** — `api.github.com/repos/{o}/{r}` + raw README. Cover = the
  repo's Open Graph social card
  (`opengraph.githubassets.com/1/{owner}/{repo}`, verified with HEAD), then
  README images, then owner avatar. Unauthenticated = 60 req/hr; optional token
  via Settings.
- **website.js** — fetches HTML, parses `<head>` with regexes (no DOM needed):
  `og:title` → `twitter:title` → `<title>`; same cascade for description/image.
- **social.js** — Instagram/X block unauthenticated scraping. Strategy: try the
  public oEmbed endpoint; otherwise parse pasted caption text with
  `extractCandidates()` (URLs, "X is an app/tool…" patterns, quoted names) and
  let the user pick. This is deliberately honest rather than fake-scraping.
- **apk.js** — the deepest module. Hand-written parsers, zero native deps:
  - `parseStringPool()` — AXML/ARSC string pools (UTF-8 and UTF-16).
  - `parseManifest()` — walks binary `AndroidManifest.xml` chunks; reads
    `<manifest>` attrs (package, versionCode/Name), `<uses-permission>`, and
    `<application>` (label, icon) including resource-reference typed values.
  - `resolveResourceCandidates()` — minimal `resources.arsc` parser: package →
    type/key string pools → type chunks → entry offsets → `Res_value`. Returns
    all config variants so callers can prefer by density.
  - `resolveIconPng()` — direct PNG candidates first (highest density), then
    adaptive-icon XMLs (`<foreground>` → `<monochrome>` → `<background>`
    drawable refs), then a filename heuristic for classic APKs.
  - Vector-only icons (no PNG in the APK) intentionally fall back to the
    placeholder — rasterizing vectors is out of scope.
- **categorize.js** — 16 categories, weighted keyword scoring
  (name ×3, topics ×2.5, description ×2, README ×0.5). Keywords ≤3 chars use
  word-boundary regexes so "AI" doesn't match "said". Language priors nudge
  (Go → DevOps/DevTools, Kotlin → Mobile…).
- **setup.js** — finds install/quick-start/usage README sections, extracts list
  steps + fenced code blocks, and detects one-line installers
  (`npm i`, `pip install`, `brew install`, `docker run`, `winget`…).

## Store (`src/store/db.js`)

better-sqlite3, WAL mode. Tables: `items` (UNIQUE on `canonical` for dedupe —
re-analyzing a link refreshes it) and `settings` (key/value, e.g.
`github_token`). Cover images are downloaded by `main.js` into
`{userData}/covers/{id}.ext` and referenced by `cover_path`; the renderer loads
them via `file://`.

## IPC surface (`preload.js` → `main.js`)

`tv.analyze`, `tv.list`, `tv.categories`, `tv.count`, `tv.remove`,
`tv.favorite`, `tv.saveNote`, `tv.recategorize`, `tv.pickApk`,
`tv.openExternal`, `tv.settingGet/Set`, `tv.exportLib`. The renderer never
touches Node APIs directly.

## Testing

`npm test` runs `test/analyzer.test.js` — detection, categorization, setup
extraction, candidate extraction, plus live end-to-end analyses (GitHub repo,
website, social fallback). Network required for the live section.
