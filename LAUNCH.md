# Launch checklist — ToolQuiver

## Naming research (2026-09-30)

"ToolQuiver" as a GitHub repo slug is **crowded** — found 6+ existing repos:

| Repo | What it is | Collision risk |
|---|---|---|
| vishnandaman/toolquiver | Curated AI-tools directory (Next.js) | Medium — same "tools directory" space |
| galaxy-ht/toolquiver | Enterprise AI-agent tool gateway | Low — different audience |
| z4km4rm3l/toolquiver | AI inventory management (Spring Boot) | Low |
| adarshpan-02/toolquiver | **Personal website & tool manager, offline-first** | **HIGH — direct concept overlap** |
| davidcjw/toolquiver | In-browser file tools | Low |
| tanmay-stack07/toolquiver-scrapping-agent | AI tool scraper | Low |

Also checked and rejected: **ToolNest** (8+ repos), **ToolShelf** (4+ repos),
**ToolTrove** (3+ repos), **StashIt** (5+ repos), **Hoardly** (taken),
**ToolKeep** (too close to keephq/keep, a major AIOps project).

**Recommendation:** keep `toolquiver` as the working repo slug (slugs are
per-user unique, so it works), but consider a more distinctive **display name**
for trending/discoverability. Options to decide with the user:
- Keep "ToolQuiver" (simplest; crowded search results)
- Distinctive alternative (e.g. something built around "stash / hoard / trove / keep" that isn't taken)

## Pre-upload fixes

- [x] Analyzer unit tests (18 pass)
- [x] Electron E2E via IPC (test/e2e.test.js, `npm run test:e2e`)
- [x] Social flow: re-propose candidates after pasted caption
- [x] Social flow: name-only candidates get GitHub repo lookup + user picks the match
- [x] Setup ranking: earliest install method wins
- [x] README: fix overclaims (local-only wording, APK icon honesty)
- [ ] README: replace CYPHERLYNX placeholders after repo creation
- [x] Add CSP to renderer (+ sandbox:true, navigation lockdown, IPC validation)
- [x] SECURITY.md, CODE_OF_CONDUCT.md, issue/PR templates
- [x] Release workflow (.github/workflows/release.yml)
- [x] CONTRIBUTING: fix "native-module-free" claim
- [x] Native-module scripts for Windows CI packaging (ensure-*-sqlite.js, real dlopen checks)
- [x] Validate electron-builder Windows config (see Build validation below)
- [x] Remove temp test files

## Build validation (2026-09-30, Linux container)

- `npm test` → 18/18 pass; `pretest` auto-rebuilds better-sqlite3 for Node ABI.
- `npm run test:e2e` (under xvfb) → **E2E PASS** (11 IPC checks through real main.js).
- `npx electron-builder --win --dir` → valid `dist/win-unpacked` (ToolQuiver.exe, asar).
- Portable artifact: `dist/ToolQuiver-1.0.0-win-x64-portable.zip` (119 MB) with the
  correct **PE32+ Windows x64** better-sqlite3 binary (official electron-v130-win32-x64 prebuild).
- Known Linux-only limits (do NOT affect Windows CI):
  - Final NSIS `.exe` link needs Wine on Linux → the `build-windows` CI job
    (windows-latest) produces the real installer; `release.yml` attaches it on `v*` tags.
  - electron-builder's internal prebuild fetch can flake through the egress proxy
    and silently keep the wrong-ABI binary — always verify the packaged
    `better_sqlite3.node` is PE32+ before shipping a cross-built zip.

## Still needed from the user

- [ ] Approve the final product/display name (ToolQuiver is crowded on GitHub).
- [ ] GitHub repo owner + name (to replace `CYPHERLYNX` placeholders).
- [ ] Permission to create/upload the repository.

## Upload (needs user)

- [ ] Final name / display-name decision
- [ ] Explicit permission to create repo on the user's GitHub account
- [ ] `CYPHERLYNX` → real username across docs
- [ ] First release: `npm run dist` on Windows → upload exe to Releases
- [ ] Demo GIF/screenshots in README
