# Contributing to ToolQuiver

Thanks for wanting to make ToolQuiver better! A few ground rules:

## Getting started

```bash
git clone https://github.com/CYPHERLYNX/toolquiver.git
cd toolquiver
npm install
npm start
```

Run the analyzer tests (a mix of offline unit tests and live checks against the
GitHub API / F-Droid, which need internet and skip gracefully offline):

```bash
npm test
```

## What to work on

- **New source analyzers** — `src/analyzer/` is pluggable. Add a file, export an
  `analyzeX()` function, wire it into `detect.js` + `index.js`.
- **Better categorization** — `src/analyzer/categorize.js` is heuristic today.
  PRs that improve precision (with test cases) are very welcome.
- **UI polish** — the renderer is dependency-free HTML/CSS/JS in `renderer/`.

## Pull requests

1. Fork, branch off `main` (`feat/my-thing` / `fix/my-bug`).
2. Keep changes focused; add/extend tests in `test/` when you touch the analyzer.
3. `npm test` must pass.
4. Describe *what* and *why* in the PR body. Screenshots for UI changes.

## Code style

- Plain, readable JavaScript. No new runtime dependencies without discussion —
  keeping `npm install` fast matters, and new **native** modules need extra
  scrutiny since they complicate the Windows build (`better-sqlite3` is currently
  the only one, rebuilt for Electron via `@electron/rebuild`).
- The app must work with **zero API keys** out of the box. Anything requiring a
  key goes behind Settings as optional.

## Code of conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md).
Be kind, be direct, assume good intent.
