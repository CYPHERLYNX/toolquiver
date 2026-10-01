# ToolQuiver rename — ranked name candidates (2026-09-30)

"ToolQuiver" is provisional and crowded (6+ same-name repos, incl. adarshpan-02/toolquiver —
a personal tool manager with direct concept overlap). It must not ship under that name.
The word "Vault" is retired from consideration entirely.

## Method

Each candidate was checked two ways on 2026-09-30:
1. **GitHub repo search** — `api.github.com/search/repositories?q=<name>+in:name` (exact-name matches).
2. **General web search** — quoted exact-name query for products, companies, apps, brands.

Previously rejected names (from LAUNCH.md research): ToolQuiver, ToolNest, ToolShelf,
ToolTrove, Hoardly, StashIt, ToolKeep (keephq/keep proximity).

## Ranked shortlist

### 1. ToolArsenal (RECOMMENDED)
- **GitHub:** 0 repos with this name. Clean.
- **Web:** no product, company, app, or brand. The phrase "tool arsenal" appears only
  descriptively (a class name in one tiny AI repo, a docs section header in another) —
  nobody ships a product called ToolArsenal.
- **Rationale:** an arsenal is a curated collection of instruments kept ready for use —
  exactly what the app is: your personal arsenal of software tools, analyzed, categorized,
  and ready to deploy. "Arsenal" is standard red-team/cybersecurity jargon, so it lands
  perfectly on a security-adjacent builder's profile. Professional, memorable, short.
- **Brand note:** "Arsenal" alone is Arsenal FC (football club) — but the compound
  ToolArsenal is distinct and no software product uses it.

### 2. ToolQuiver (runner-up)
- **GitHub:** 0 repos with this name. Clean.
- **Web:** zero software collisions. Only hits are SEO-spam PDF sites using the idiom
  "a quiver full of arrows" — irrelevant.
- **Rationale:** a quiver holds a curated set of arrows ready to draw — a distinctive,
  memorable metaphor for a personal collection of tools kept at hand. No brand baggage
  whatsoever.
- **Brand note:** none found.
- **Why #2 not #1:** slightly poetic/unusual diction; reads a touch less "professional
  dev-tool" than Arsenal, though more distinctive.

### 3. ToolHolster (runner-up)
- **GitHub:** 1 repo — bigsir24/bta-toolholster, a tiny Minecraft mod (plus one fork).
  Unrelated space, negligible.
- **Web:** no software product. Hits are physical belt holsters for power tools
  (e.g. Spider Tool Holster, a physical-goods brand) and a Garry's Mod scripting hook.
- **Rationale:** a holster keeps your tools on your person, ready to draw — fits "personal
  library always at hand." Carries a sidearm connotation that suits the cybersecurity-adjacent
  tone without being juvenile.
- **Brand note:** "Spider Tool Holster" is a physical-products brand (different trademark
  class, physical goods) — worth knowing, not a blocker for software.
- **Why #3:** the physical-product noise in search results slightly muddies discoverability.

### 4. ToolDen
- **GitHub:** 1 repo — premmali/ToolDenoExample (a Deno tutorial repo). Unrelated.
- **Web:** no software product. Near-miss: "Toolden" (toolden.co.uk), a UK physical tool
  retailer — different spelling, physical retail, not software.
- **Rationale:** short and punchy; a den is where you keep your collection.
- **Why #4:** weakest metaphor of the shortlist, and the Toolden retailer creates mild
  search noise.

### 5. ToolTome
- **GitHub:** 0 repos with this name. Clean.
- **Web:** no exact-name product; tooltome.com is a parked domain for sale.
- **Rationale:** a tome is a book of knowledge — fits the "personal library" positioning.
- **Brand caution:** "Tome" is tome.app, a well-known funded AI presentation startup.
  The compound ToolTome is distinct, but the root word carries a real big-brand echo in
  the AI space — a genuine discoverability/confusion risk. Demoted on this basis.

### Rejected in this round

| Name | GitHub hits | Reason |
|---|---|---|
| ToolLocker | 1 repo + real products | "Tool Locker" is a shipping Android inventory app (Toollocker) and ToolLocker was a construction-equipment rental marketplace — direct product collisions in the tools-management space |
| ToolLedger | 1 repo + real project | ijaaayyy/tooledger brands itself "ToolLedger — Equipment Borrowing Management System" — direct name collision in adjacent space |
| ToolCache | concept collision | `@actions/tool-cache` (GitHub's official Actions toolkit) owns this term in dev minds; would read as a CI utility, not a library |
| ToolDepot | 4+ repos | qscrelinwe/tooldepot is a monorepo of web tools (close conceptually); plus rental-app repos |
| ToolCrate | 14 repos | crowded (Docker toolbox, DJ tools, video compressor, etc.) |
| Stockpile | 561 repos | extremely crowded, incl. mitre/stockpile (cybersec space) |
| ToolIndex | 12 repos | crowded in exactly our concept space ("structured index of developer tools") |
| Warchest | 97 repos | crowded (crypto bots, games) |
| Cacheline | 38 repos | all about CPU cache lines — would read as a systems-perf tool |
| ToolChest | 79 repos | crowded, incl. trytoolchest (real bioinformatics platform) |

## Recommendation

**Ship as ToolArsenal** — `CYPHERLYNX/toolarsenal`, product name "ToolArsenal".
Zero GitHub collisions, zero product/brand collisions, and the name does real work:
it tells a developer exactly what the app is (your ready-to-use collection of tools)
while sounding at home next to security tooling. Runners-up if the user dislikes it:
ToolQuiver, then ToolHolster.

## Caveat

Web and GitHub searches are **not** trademark or domain clearance. Before final launch,
run a proper trademark check (e.g. USPTO/in-country search) and check domain
availability if a website is planned. Search results also shift over time — re-verify
close to launch day.

## Decision (2026-09-30)

**Winner: ToolQuiver.** Selected by the user. Repo: `CYPHERLYNX/toolquiver`.
All code, docs, packaging metadata, and screenshots renamed accordingly.
