# Cogis — M8 Web Search Surface (Blueprint Addendum)

**Project:** Cogis
**Repository:** [`dsergovic/cogis`](https://github.com/dsergovic/cogis)
**Framework:** [Full-Lifecycle Agentic Software Engineering v1.1.0](https://github.com/dsergovic/research/blob/main/docs/Full-Lifecycle%20Agentic%20Software%20Engineering.md)
**Parent blueprint:** [`docs/agent_blueprint.md`](./agent_blueprint.md) **v0.3.0** (locked; this addendum amends only the sections named in §11 below)
**Phase 0 input for M8:** this document (Phase-0-style addendum for the M8 web search surface)
**Status:** Phase 0 addendum — awaiting dual reviewer sign-off (Claude Code + Codex) and human merge before any implementation branch is cut
**Version:** 0.1.0
**Integration branch:** `dev`
**Depends on:** M1–M4 adapters (merged), M5 selector manifest (merged), M6 debug panel (merged); **does not depend on M7 (Grok)**

---

## 1. Intent

Cogis M8 adds a **second search surface** at `https://cogis.ai/` — a Google-V1-style page with a single searchbox — backed by the exact same extension the popup uses. The user opens `cogis.ai`, types a query, presses Enter, and sees the same grouped, capability-labeled results the popup already renders — on the page, not in a popover.

M8 is **additive**. The popup remains the primary product and can be listed on the Chrome Web Store on its own timeline; the web surface is feature-flagged (`WEB_SEARCH_SURFACE_ENABLED`, default `false`) so the extension can ship with the flag off. The web page **cannot function without the installed extension** — the extension holds every credential and does every lab call, exactly as in the popup surface.

This addendum is the concrete build-out of the reserved V2 seam from parent blueprint §14: *"`cogis.ai/search` additional surface (extension bridge via `postMessage`, origin lock + nonce — never `"*"`)."* The only substantive change from that seam is that the searchbox lives at **`/`**, not `/search`.

**M8 win condition:** with the flag on, the extension installed, and the user logged in to at least one supported lab, typing a query at `https://cogis.ai/` and pressing Enter returns the same grouped result set the popup returns, within the same timeout budget, with identical capability labels and honest terminal states.

---

## 2. Users and distribution

M8 introduces **two deployables where V1 had one**:

| Deployable | What ships | Where | Who ships |
| --- | --- | --- | --- |
| Chrome MV3 extension | Popup + new `web-bridge` content script, flag-gated | Unpacked dev / Chrome Web Store (unchanged from V1) | Human, unchanged escalation |
| `cogis.ai` static site | HTML/CSS/vanilla-JS page under `web/` | GitHub Pages (custom domain, apex) | Human toggles DNS; agent lands PRs |

Distribution rules:

- **Chrome + extension installed is a hard prerequisite.** Detection is done by handshake (§4); when the handshake times out the page renders an install-gate rather than any query UI.
- **Extension remains independent.** Popup users never depend on the page. Listing the extension on the Chrome Web Store stays a separate human escalation (parent §12 #1) and is **not** blocked by M8.
- **Single-user, no accounts.** The page has no login, no server-side state, no query logging. Same posture as the popup.
- **No non-Chrome browsers on the page** in M8; the feature-detection path renders the install-gate for any browser without the Cogis extension. Firefox/Edge/etc. remain V2+ seams (parent §14).

---

## 3. Architecture

### 3.1 Two deployables, one search brain

- **Extension is still the only search brain.** All lab calls, all session cookies, all adapters, all capability labels, all timeouts, all cancel semantics — unchanged from M1–M4.
- **`cogis.ai` is a dumb renderer.** It owns the DOM and the search box; it does not know how to talk to any lab. It only knows how to talk to the extension.
- **The bridge is the only new I/O.** A new content script `content/web-bridge.js` is the sole channel between the page and the service worker. It is matched to `https://cogis.ai/*` and to nothing else.

### 3.2 Data flow (M8)

1. User visits `https://cogis.ai/`. Page loads static assets only (no network to Cogis-owned services).
2. Page emits a handshake `postMessage` to `window` (see §4). If no reply within the handshake budget, page renders the install-gate.
3. On reply, page shows the searchbox and the "Extension connected" indicator.
4. User submits a query. Page `postMessage`s a `webBridge:search` envelope (origin-locked, nonce-bound) to the bridge content script.
5. Bridge forwards to the service worker via `chrome.runtime.sendMessage`.
6. Service worker fans out to the existing M1–M4 adapters **without modification**. `requestId`, per-platform 8s budget, ~15s wall, and in-flight cancel are identical to popup behavior.
7. Result chunks stream back: service worker → bridge → page, one platform at a time, keyed by `requestId`.
8. Page renders each group as it arrives, using the same state vocabulary as the popup (`idle | loading | ready | empty | login_required | unavailable | timeout`) and the same capability labels.
9. Deep-link clicks open in a new tab (`target="_blank" rel="noopener noreferrer"`); the extension does not intercept navigation from the page.

### 3.3 Folder structure delta (option **a** — single repo)

```text
cogis/
├── extension/                      # unchanged M1–M6 structure
│   ├── manifest.json               # + host_permissions https://cogis.ai/*, + web-bridge content_scripts, + WAR entry
│   ├── background/
│   │   └── service-worker.js       # + webBridge:* message types (thin wrappers over popup contract)
│   ├── content/
│   │   ├── chatgpt.js
│   │   ├── perplexity.js
│   │   ├── claude.js
│   │   ├── gemini.js
│   │   └── web-bridge.js           # NEW — cogis.ai <-> SW postMessage bridge, matched to https://cogis.ai/* only
│   ├── lib/
│   │   ├── flags.js                # NEW or extended — WEB_SEARCH_SURFACE_ENABLED = false (default)
│   │   └── … (unchanged)
│   ├── debug/
│   │   └── panel.js                # + "Web bridge" row (see §7)
│   └── … (unchanged)
├── web/                            # NEW — static site served by GitHub Pages
│   ├── index.html                  # Google-V1-simple: header, searchbox, results region, footer
│   ├── CNAME                       # exactly: cogis.ai
│   ├── 404.html                    # optional — redirects unknown paths to /
│   ├── assets/
│   │   ├── css/
│   │   │   └── site.css            # self-hosted; no CDN fonts, no third-party CSS
│   │   ├── js/
│   │   │   ├── page.js             # UI wiring only; no network to labs, no fetch to Cogis backend
│   │   │   ├── bridge-client.js    # handshake + postMessage envelope construction (mirror of web-bridge.js contract)
│   │   │   └── render.js           # renders groups, capability labels, error chips (mirrors popup render rules)
│   │   ├── icons/                  # favicon + apple-touch-icon; self-hosted
│   │   └── NOTICE.txt              # ToS/privacy posture (verbatim from parent §8.2)
│   └── privacy.html                # required footer link; renders §8.1 posture verbatim
├── tests/
│   ├── unit/
│   │   └── web-bridge/             # NEW — pure-logic tests: origin lock, nonce echo, envelope validation, request-id cancel
│   └── fixtures/
│       └── web-bridge/             # NEW — recorded postMessage envelopes (no live secrets)
├── docs/
│   ├── agent_blueprint.md          # unchanged file; §11 of *this* addendum lists the exact amendments to apply as a follow-up docs PR
│   ├── agent_blueprint-m8-web-surface.md   # THIS FILE
│   └── spikes/
│       ├── s8-1-postmessage-handshake-contract.md   # stub authored with this addendum
│       ├── s8-2-install-gate-latency.md             # stub authored with this addendum
│       └── s8-3-github-pages-apex-and-www.md        # stub authored with this addendum
└── .github/workflows/
    ├── build-and-test.yml          # extended with a `web-build-and-check` job
    └── pages.yml                   # NEW — deploys `web/` to GitHub Pages on merge to `main`
```

Notes:

- The static site is **plain HTML/CSS/vanilla JS**. No framework, no bundler, no transpile step. Matches parent §3.4 stack posture.
- GitHub Pages source = `main` branch, folder `/web`. `dev` never publishes.
- The bridge protocol contract lives in **two mirrored files**: `extension/content/web-bridge.js` (SW side) and `web/assets/js/bridge-client.js` (page side). Any change to the envelope shape must land in the same PR on both sides.

### 3.4 Naming standards

Same as parent §3.4. Additional M8 constants:

- Message types (page ↔ bridge): `COGIS_HELLO`, `COGIS_READY`, `WEB_BRIDGE_SEARCH`, `WEB_BRIDGE_CANCEL`, `WEB_BRIDGE_RESULT_CHUNK`, `WEB_BRIDGE_PLATFORM_DONE`, `WEB_BRIDGE_ERROR`.
- Bridge origin allowlist constant: `WEB_BRIDGE_PAGE_ORIGIN = "https://cogis.ai"` — **single value**, string equality only, no glob, no regex.
- Feature flag: `WEB_SEARCH_SURFACE_ENABLED` (boolean, default `false`).

### 3.5 Database schema

**N/A.** M8 introduces zero persistent state on either side. The page uses no `localStorage`, no `sessionStorage`, no cookies of its own, no IndexedDB. The extension uses no new `chrome.storage` keys.

### 3.6 API surface

**Still no Cogis-owned HTTP API.** M8 adds:

| Outbound | Origin | Purpose | Payload |
| --- | --- | --- | --- |
| Page → SW (via bridge) | `https://cogis.ai` → `chrome-extension://<id>` | Search / cancel | `{ requestId, query, platforms[] }` — same as popup message contract |
| SW → Page (via bridge) | `chrome-extension://<id>` → `https://cogis.ai` | Result chunks | Same pointer records as popup — never message bodies, never cookies |
| Page → `cogis.ai` origin | `https://cogis.ai` | Serve static HTML/CSS/JS only | No query text ever sent to `cogis.ai` origin |

`cogis.ai` **does not log queries** (parent §8.1 restated; the page never issues an HTTP request that carries query text — all query traffic goes through the bridge to the extension and then to lab origins directly).

### 3.7 Environment and secrets policy

Inherits parent §3.7 in full. Additions:

- The static site ships **no third-party JS**, **no analytics**, **no CDN fonts**, **no tag managers**. Fonts and icons are self-hosted under `web/assets/`.
- The site enforces a strict CSP header via `<meta http-equiv="Content-Security-Policy">` (GitHub Pages does not let us set arbitrary response headers; the meta tag is our lock): `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; upgrade-insecure-requests`. `connect-src 'none'` is intentional — the page must never `fetch`/XHR/WebSocket anywhere; all cross-context traffic goes through `postMessage` to the extension.
- The extension gains `https://cogis.ai/*` in `host_permissions` and adds `web-bridge.js` to `content_scripts` (see §3.8). No widening toward `<all_urls>`, no unrelated origins.
- The `www.cogis.ai` origin is **only** ever a 301 redirect to `https://cogis.ai`, managed by GitHub Pages via the custom-domain feature. The bridge content script is **not** matched against `https://www.cogis.ai/*` — any user landing on `www` is redirected before bridge code runs. The origin allowlist stays a single value.

### 3.8 Manifest delta (illustrative — implementer lands the exact JSON)

```jsonc
{
  "host_permissions": [
    "https://chatgpt.com/*",
    "https://chat.openai.com/*",
    "https://www.perplexity.ai/*",
    "https://perplexity.ai/*",
    "https://claude.ai/*",
    "https://gemini.google.com/*",
    "https://cogis.ai/packs/*",
    "https://cogis.ai/*"          // NEW — bridge host
  ],
  "content_scripts": [
    // … existing four platform blocks unchanged …
    {
      "matches": ["https://cogis.ai/*"],   // NEW — apex only, no www, no subdomains
      "js": ["content/web-bridge.js"],
      "run_at": "document_idle"
    }
  ],
  "web_accessible_resources": [
    // … existing four platform blocks unchanged …
    {
      // NEW — bridge WAR block. Populated to whatever transitive
      // graph web-bridge.js dynamically imports. WAR guard test
      // (from M1 pattern) must fail if the graph is incomplete.
      "resources": [
        "lib/web-bridge-envelope.js",
        "lib/platforms.js",
        "lib/results.js"
      ],
      "matches": ["https://cogis.ai/*"]
    }
  ]
}
```

The exact WAR entry list is a Tier 2 implementer decision, gated by the WAR-guard unit test — same rule as M1–M4.

### 3.9 Bridge protocol (contract)

The following is the **normative** contract. Implementers land the code that matches it.

**Handshake**

- Page → window (page's own DOM):
  `{ type: "COGIS_HELLO", nonce: <128-bit hex>, v: 1 }`
- Content script reply (via `window.postMessage(msg, "https://cogis.ai")`):
  `{ type: "COGIS_READY", nonce: <echoed>, v: 1, extVersion: <string>, capabilities: { search: true, cancel: true } }`
- Page treats **no reply within the S8.2 install-gate budget** (S8.2 fills the number; see §5) as "extension not installed" and renders the install-gate.

**Search**

- Page → bridge:
  `{ type: "WEB_BRIDGE_SEARCH", nonce: <session nonce>, requestId: <uuid>, query: <string>, platforms: [<ids>] }`
- Bridge → SW (`chrome.runtime.sendMessage`) → adapters (unchanged internal contract).
- SW → bridge → page:
  `{ type: "WEB_BRIDGE_RESULT_CHUNK", nonce, requestId, platform, status, capability?, results?, errorCode? }`
  `{ type: "WEB_BRIDGE_PLATFORM_DONE", nonce, requestId, platform, status }`

**Cancel**

- Page → bridge: `{ type: "WEB_BRIDGE_CANCEL", nonce, requestId }` — bridge issues a `SEARCH_CANCEL` on the popup contract. A superseded `requestId` is dropped across all platform groups just as in the popup.

**Envelope rules (drop-and-count on any failure)**

- `event.origin === "https://cogis.ai"` (string equality) — required on every inbound message on both sides.
- `event.source === window` on the page side; `sender.tab.url.startsWith("https://cogis.ai/")` on the SW side.
- `nonce` present, string, length matches the handshake session nonce — required on every message after the handshake.
- Message `type` present and in the allowlist above — anything else dropped.
- No `postMessage("*")` anywhere. Every reply passes the explicit `"https://cogis.ai"` target origin.
- The bridge **never** posts anything to the page until a valid `COGIS_HELLO` is received.

Any drop increments a counter surfaced in the M6 debug panel (§7).

---

## 4. What Cogis M8 does *not* do (non-goals)

Additions to parent §6:

- **No server-side search on `cogis.ai`, ever.** The moment the page runs a query itself, the privacy story collapses.
- **No accounts, no login, no sync, no saved searches, no history, no share-this-result links.**
- **No snippet or context preview** in result rows beyond what the popup shows (still parent §6 / §14 V2).
- **No native-messaging host or local HTTP endpoint** (still parent §14 V2).
- **No page-side telemetry.** No analytics, no error reporter, no first-party ping from the page. The only maintainer signal remains the M6 opt-in ping, which comes from the extension, not from the page.
- **No search UI on any non-apex host.** `www.cogis.ai` 301s to apex; `packs.cogis.ai` (M5 host, if used) never renders search UI; any future subdomains are out of scope until explicitly amended.
- **No cross-origin `fetch` from the page.** `connect-src 'none'` in CSP enforces this at the browser level.
- **No shared code between the page and the extension via cross-context loading.** The two sides talk only through the postMessage envelope. Shared *contract* (envelope shape, platform ids, error codes) is duplicated in `web/assets/js/bridge-client.js` and kept in sync via the M8-Verify AC below.
- **No coupling to M7 (Grok).** M8 works with whatever platform set M1–M4 (plus M7 if landed) currently ship. M8 must not block on M7.

---

## 5. Named spike tasks (M8)

Owned by Human + Perplexity per framework §3.5 Tier 3, same as S1–S7. Findings under `docs/spikes/s8-*.md`; folded back into this addendum's revision (version bump) before the M8 milestone that depends on them can claim its AC.

**S8.1 — postMessage handshake contract.**
Confirm the handshake envelope shape survives Chrome's isolated-world boundary in a fresh unpacked build; confirm the content script's `document_idle` timing produces a `COGIS_READY` reply within the install-gate budget on a cold `cogis.ai` load; confirm origin-lock strictness (mismatched origins are silently dropped and never leak into the SW). Blocks M8a AC.

**S8.2 — Install-gate detection latency.**
Characterize the latency distribution of `COGIS_HELLO → COGIS_READY` on real machines. Pick a handshake budget that (a) is short enough that a real "extension not installed" case renders the install-gate quickly, and (b) is long enough not to false-positive install-gates on slow machines. Recommended starting probe range: 400 ms – 1200 ms; the spike picks and defends one number. Also confirms the false-positive rate when a user has the extension installed but disabled per-origin. Blocks M8b AC.

**S8.3 — GitHub Pages apex + `www` redirect + custom-domain HTTPS.**
Confirm the exact DNS records needed for apex `cogis.ai` (`ALIAS`/`ANAME`/four `A` records to GitHub Pages IPs, per current GitHub docs) plus the `CNAME` for `www.cogis.ai`; confirm GitHub Pages issues an apex Let's Encrypt certificate and 301s `www → apex` automatically once both hostnames are configured; time the propagation window; document the exact `web/CNAME` contents. Blocks M8e AC.

S8.1–S8.3 stubs are authored alongside this addendum under `docs/spikes/` with all fields `TBD` and are filled by Human + Perplexity before the milestone that depends on them opens. If a stub is still open when the relevant milestone is handed off, filling it is the first task inside that milestone — same rule as S7/M7.

---

## 6. Milestone shape (M8 sub-milestones)

Follows the parent §10 pattern. Each M8x is its own PR against `dev`, human-merged. Global constraints from parent §10 apply verbatim.

### M8a — Bridge protocol + content script (flag-gated, no page)

**Goal.** Land the extension side of the bridge, gated by `WEB_SEARCH_SURFACE_ENABLED = false`, with unit tests. No `web/` directory yet.

**Depends on:** S8.1.

**Scope.**

- New `extension/content/web-bridge.js` matched to `https://cogis.ai/*`.
- Manifest updates (§3.8).
- Service worker gains `webBridge:*` message handlers — thin wrappers over the popup message contract; adapters unchanged.
- `extension/lib/flags.js` (new or extended) with `WEB_SEARCH_SURFACE_ENABLED = false`. When `false`, both the bridge content script and the SW handlers hard-return without any side effect.
- WAR guard unit test extended to cover the bridge's transitive graph.

**Behavioral AC.**

1. All M1–M6 (and M7 if landed) AC remain green.
2. With `WEB_SEARCH_SURFACE_ENABLED = false`, no `webBridge:*` message produces any observable effect (no adapter call, no counter increment beyond the drop counter, no console noise).
3. With the flag flipped on **in a test harness only** (not shipped on), a well-formed `COGIS_HELLO` from an origin string equal to `https://cogis.ai` receives a `COGIS_READY` reply with matching nonce and current `extVersion`.
4. Origin mismatch (`https://cogis.ai.evil.example`, `http://cogis.ai`, `https://www.cogis.ai`, `null`, missing) drops the message and increments the drop counter; no reply is emitted.
5. Nonce mismatch after handshake drops the message; no reply.
6. Malformed envelope (missing `type`, unknown `type`, non-string `query`, oversized payload beyond a Tier 2 limit) drops and counts.
7. A `WEB_BRIDGE_CANCEL` for a superseded `requestId` drops in-flight chunks across all platform groups, identical to popup cancel semantics.
8. Five-platform (or four-platform, depending on M7 status) fan-out via the bridge respects the same 8s/15s budgets as the popup path — no new timeout paths are introduced.
9. No new `chrome.storage` keys; no new persistent state.
10. `npm test`, `npm run lint`, `npm run format:check` pass.

**Out of scope for M8a.**

- Any file under `web/`.
- Any DNS or GitHub Pages configuration.
- Debug-panel row extension (that lands in M8d).

### M8b — Static `cogis.ai` page + ChatGPT-only end-to-end

**Goal.** Ship the static page under `web/` with the searchbox and install-gate; wire it end-to-end **for ChatGPT only** so we can verify the full loop on a real logged-in Chrome profile without pulling in every adapter path at once.

**Depends on:** S8.2, M8a merged.

**Scope.**

- `web/index.html` at repo `main` root (via GitHub Pages `/web` publish path). Structure: header (wordmark + About / Install / GitHub), searchbox with autofocus and `/` shortcut, install-status pill, results region (empty by default), footer (Privacy link, ToS posture, NOTICE).
- `web/assets/js/bridge-client.js` implementing the page side of §3.9.
- `web/assets/js/page.js` implementing input handling (Enter / Search button, empty-submit clear, in-flight cancel, `/`-focus shortcut).
- `web/assets/js/render.js` implementing the group-render rules (capability label per group, per-group loading spinner + error chip, layout allocated up front, deep-link click cascade).
- `web/CNAME` = `cogis.ai`. `web/404.html` renders a minimal "page not found — go to `/`" link.
- CSP meta tag per §3.7.
- Flag on the extension side flipped to `true` for a **local human smoke build only** — not for any published extension build. This lets the human verify the ChatGPT loop end-to-end on a real profile; the shipped extension version does not enable the flag until M8e.
- `.github/workflows/pages.yml` configured to publish `web/` from `main` on merge; no publish from `dev`.

**Behavioral AC (page).**

1. Cold-loading `https://<gh-pages-preview-url>/` (or a `file://` build for the human smoke) with the extension installed and the flag on locally produces a searchbox, autofocus, install-status pill showing "Extension connected."
2. Cold-loading the same URL **without** the extension shows the install-gate within the S8.2 handshake budget; no searchbox is rendered until the handshake resolves.
3. Enter with a non-empty query runs one search; results appear in the ChatGPT group with the full-text capability label per parent §4.2.
4. Empty / whitespace submit clears results, cancels in-flight, shows the "Type a query and press Enter." hint (same copy family as popup per parent §4.6).
5. New submit while a prior one is in flight cancels the prior; late chunks from the prior never render.
6. Deep-link click opens `https://chatgpt.com/c/{id}` in a new tab with `rel="noopener noreferrer"`.
7. Logged-out ChatGPT yields "Please log in to ChatGPT" as a group-level chip; other groups (once M8c lands) are unaffected.
8. Layout does not jump as chunks arrive; reserved height per group is allocated on submit.
9. No network requests from the page origin other than static asset fetches from `cogis.ai` itself (verified in DevTools Network tab: `connect-src 'none'` enforces).
10. `View source` on the page shows **zero** third-party origins referenced.
11. CSP meta tag present with exact contents per §3.7.
12. `web-build-and-check` CI job passes: HTML validates; no `<script src="http…">` outside `self`; no `<link rel="stylesheet" href="http…">` outside `self`; `CNAME` file contents match `cogis.ai` exactly; CSP meta tag present.

**Out of scope for M8b.**

- Perplexity, Claude, Gemini, Grok groups (fold in during M8c).
- Debug-panel row extension (M8d).
- Real DNS cutover to `cogis.ai` (M8e).

### M8c — Remaining labs folded in

**Goal.** Extend the page to render Perplexity, Claude, Gemini, and (if M7 has landed) Grok groups using the existing adapters unchanged.

**Depends on:** M8b merged.

**Scope.**

- Zero changes to `content/*.js` platform adapters or `lib/*-adapter.js`. If a live behavior discrepancy shows up that requires an adapter change, that is a **separate hotfix branch outside M8** (parent §10 global constraint).
- Group order on the page: ChatGPT → Perplexity → Claude → Gemini → Grok (M7), matching parent §4.7.
- Per-platform capability labels come from the same source of truth as the popup (`lib/platforms.js`).

**Behavioral AC.**

1. All M8b AC hold with additional groups present.
2. Each additional group renders with the capability label from the parent §3.6.1 lab contracts table — no fabrication.
3. Partial failure remains partial: one lab down does not block the others; per-group chips show `login_required` / `unavailable` / `timeout` honestly.
4. Empty is `empty` only when the adapter actually returned empty; a truncated / soft-ceilinged / login-required state is never labeled `empty` (mirrors parent M7 AC #2, #5, #6).
5. Five-group (or four-group) fan-out from the page respects the 8s/15s budgets; the wall is not extended by adding groups.
6. Deep-link click cascade uses each platform's proven URL pattern from parent §3.6.1; where `deepLinkUrl` is `null`, the page falls back to the lab origin — never a fabricated deep link.
7. Human smoke on a real logged-in Chrome profile passes US-1 through US-7 on the page surface (parent §5), with the page substituting for the popup as the entry point.

### M8d — Debug-panel "Web bridge" row + docs

**Goal.** Extend the M6 debug panel to surface bridge stats; land the README/NOTICE deltas so the two-surface product is honestly documented.

**Depends on:** M8c merged.

**Scope.**

- `extension/debug/panel.js` gains a "Web bridge" section: last handshake timestamp, handshake count (session-lifetime), origin-drop count, nonce-drop count, malformed-envelope drop count, last five request IDs served through the bridge (id + status; no query text, no titles).
- `README.md` gains a "Two surfaces" section: what the popup is, what `cogis.ai` is, why both exist, privacy posture restated (parent §8.1), install-gate copy, screenshot placeholder.
- `NOTICE` restated verbatim in `web/assets/NOTICE.txt` and in `web/privacy.html`.
- Docs runbook: DNS records for apex + `www`, custom-domain configuration steps, HTTPS-ready check, rollback procedure (flip DNS back / disable feature flag).

**Behavioral AC.**

1. Opening the M6 debug panel with the flag on shows the "Web bridge" section populated.
2. Query text never appears in the debug panel or in any panel-driven storage.
3. README and NOTICE deltas describe the two surfaces without contradicting parent §8.
4. Panel closed → zero observable effect on the page or the extension (M6 rule preserved).
5. `npm test`, `npm run lint`, `npm run format:check` pass.

### M8e — DNS cutover, flag flip, and smoke on real `cogis.ai`

**Goal.** Make the page live at `https://cogis.ai/` and enable the feature flag in the extension build that ships.

**Depends on:** S8.3, M8d merged.

**Scope.**

- DNS records applied per S8.3 finding (apex + `www` CNAME). GitHub Pages custom-domain set. Let's Encrypt cert issued and verified.
- `WEB_SEARCH_SURFACE_ENABLED` flipped to `true` in the extension source; extension version bump per parent §3.10 (behavior change = version bump).
- Human smoke on `https://cogis.ai/` (not GH Pages preview URL) covering US-1 through US-7 on a real logged-in Chrome profile.
- Rollback plan documented and rehearsed: (a) flip the flag back to `false` and ship an extension version bump — the page continues to render the install-gate forever; (b) if the page itself needs to disappear, revert the DNS record or unpublish the GitHub Pages custom domain — the extension continues to function via the popup.

**Behavioral AC.**

1. `https://cogis.ai/` loads over HTTPS with a valid certificate; no mixed-content warnings.
2. `http://cogis.ai/` and `http://www.cogis.ai/` 301-redirect to `https://cogis.ai/`; `https://www.cogis.ai/` 301-redirects to `https://cogis.ai/`.
3. The bridge content script is **not** injected on `https://www.cogis.ai/*` (verified because the manifest `matches` value is `https://cogis.ai/*` only).
4. US-1 through US-7 pass on `https://cogis.ai/` with the shipped extension version.
5. Popup surface AC (M1–M4, M6, M7 if landed) remain green on the same shipped extension version.
6. Rollback path (a) — flag off — reverts the page to install-gate within one extension version.
7. Rollback path (b) — DNS revert — leaves the extension working exactly as before M8.

---

## 7. Debug-panel and observability deltas

The M6 debug panel gains one "Web bridge" section (landing in M8d) with:

- `handshakeCount` — count of successful `COGIS_READY` sends this SW lifetime.
- `originDropCount` — count of inbound messages dropped for origin mismatch.
- `nonceDropCount` — count of inbound messages dropped for nonce mismatch.
- `malformedDropCount` — count of inbound messages dropped for bad envelope.
- `lastHandshakeAt` — ISO timestamp of the most recent successful handshake.
- `recentRequests` — last five bridge-served request IDs with status only; **no query text, no titles**.

No new ping payload fields. The M6 optional maintainer ping remains parent §8.1-bound: `{ platformId, selectorPackVersion, errorClass }` only. M8 does **not** extend the ping payload.

---

## 8. Privacy, ToS, and outbound network (delta)

Inherits parent §8 in full. Additional binding statements the page must render (via `NOTICE.txt`, `privacy.html`, and the site footer):

- The `cogis.ai` origin serves **static assets only**; it never receives query text and never operates a search backend.
- Every lab call still originates from the user's browser, under the user's own session cookies, driven by the extension — not by `cogis.ai`.
- The page has no analytics, no tag manager, no third-party fonts, no third-party scripts, no page-side telemetry.
- Chrome Web Store listing of the extension is a separate human decision; using `cogis.ai` while the extension is loaded unpacked is a first-class supported configuration during M8.
- Outbound-network matrix gains one row (M8): the page fetches its own static assets from `cogis.ai`. That is the only new outbound. Nothing else.

---

## 9. Testing strategy (M8 delta)

Inherits parent §11. Additions:

| Layer | M8 coverage |
| --- | --- |
| Unit (vitest) | Envelope validation (origin, nonce, type allowlist, payload shape); drop counters; cancel semantics via the bridge |
| Fixtures | Recorded `postMessage` envelopes under `tests/fixtures/web-bridge/` — redacted like all other fixtures |
| CI job | `web-build-and-check`: HTML validate; asset origin check (no third-party origins referenced in `web/**`); `CNAME` contents check; CSP meta tag presence check |
| Codified DOM | Same two-tier rule as parent §10 — codified only after S8.1/S8.2 findings are locked |
| Live human smoke | US-1 through US-7 exercised on the page in M8b (ChatGPT-only), M8c (all groups), and M8e (real `cogis.ai`) |

Live automation of `cogis.ai` in CI (headless Chrome + extension load + fake lab origin) is **out of scope** for M8 and remains an escalation (secrets + ToS surface).

---

## 10. Implementer independence (M8 tier map)

Adds to parent §13:

| Topic | Tier |
| --- | --- |
| Exact handshake budget (within S8.2's approved range) | **Tier 2** (note in PR); outside the range → **Tier 3** |
| Max results per platform on the page | **Tier 2**, mirrors popup default 20 unless human amends |
| Page CSS polish and layout micro-decisions | **Tier 1–2** |
| Changing the bridge envelope shape after M8a | **Tier 3** (spike) — requires an addendum bump |
| Widening the bridge `matches` beyond `https://cogis.ai/*` | **Escalation** — parent §12 #8 |
| Adding any `fetch`/XHR from the page | **Escalation** — CSP relaxation, parent §12 #14 |
| Adding a page-side analytics or telemetry SDK | **Escalation** — parent §12 #14 + this addendum §4 non-goal |
| Introducing a bundler or framework for `web/` | **Escalation** — parent §12 #6 |
| Publishing `web/` from `dev` instead of `main` | **Tier 3** — deploy topology change |

---

## 11. Amendments to parent blueprint (`docs/agent_blueprint.md`)

M8 is authorized by **this addendum**. Applying M8 requires the following surgical amendments to the parent blueprint. These are **not** attempted in this PR (which is documentation-only for the addendum); they land as a small follow-up docs PR **after** this addendum is human-merged, so reviewers see the two changes in sequence.

Follow-up docs PR must:

1. **§3.1 (One deployable) — amend.** Add: *"M8 introduces a second deployable — the `cogis.ai` static site under `web/` — that is a **dumb renderer** for the extension's search brain. All lab calls, all auth, all adapters remain in the extension. See `docs/agent_blueprint-m8-web-surface.md`."*
2. **§3.3 (Folder structure) — amend.** Add the `web/` subtree to the tree diagram exactly as shown in §3.3 of this addendum.
3. **§3.6 (API routes) — amend.** Add the "Page → `cogis.ai` origin (static assets only)" row to the outbound-contacts table with the "no query text" note.
4. **§4.7 (Results UX) — amend.** Add: *"The page surface renders the same group order and state vocabulary as the popup; the two surfaces share the platform id, capability label, and state enum sources of truth in `lib/platforms.js`."*
5. **§6 (Non-goals) — amend.** Replace *"No `cogis.ai/search` as a V1 search surface."* with *"No `cogis.ai/search` sub-route — the M8 web search surface lives at `cogis.ai/` per `docs/agent_blueprint-m8-web-surface.md`."* Leave every other non-goal intact.
6. **§8.3 (Outbound network matrix) — amend.** Add an "M8" row: *"Labs + `cogis.ai` static asset fetches from the page (no query text)."*
7. **§9 (Spikes) — amend.** Add S8.1, S8.2, S8.3 rows as *Open (stub)*, pointing to `docs/spikes/s8-*.md`.
8. **§10 (Milestones) — amend.** Add a summary paragraph under a new "**M8 — Web search surface at `cogis.ai/`**" heading that points to this addendum for full behavioral AC, and lists sub-milestones M8a–M8e with their one-line goals.
9. **§12 (Escalation list) — amend.** Add: *"**Approved exception: the M8 web search surface at `cogis.ai/`** is authorized by `docs/agent_blueprint-m8-web-surface.md`. That addendum is the amendment; it does not generalize. Any other new hosted surface, sub-route, or origin still stops at this list."* This mirrors the M7/Grok pattern.
10. **§14 (V2 seams) — amend.** Move `cogis.ai/search additional surface` **out** of "reserved, not built" and note it is realized at `cogis.ai/` per this addendum; the remaining seams (native-messaging host, other browsers, snippet preview, richer ranking, additional platforms) stay reserved.
11. **Changelog — amend.** Add a `v0.4.0 (2026-07-XX) — M8 web-surface amendment: added the M8 sub-milestones, the `cogis.ai` static site under `web/`, the postMessage bridge with strict origin lock and nonce, the S8.1/S8.2/S8.3 spike stubs, and the escalation-#8/#14 exception for the bridge. Full behavioral AC lives in `docs/agent_blueprint-m8-web-surface.md`.` entry.

If any of these amendments proves impossible without changing binding language elsewhere (auth posture, secrets policy, capability labels, timeout budgets), that is a **Tier 3 stop** and the addendum comes back for revision — the parent blueprint's locked language wins.

---

## 12. V2 seams still reserved (post-M8)

M8 realizes only the `cogis.ai/` searchbox seam. The following remain reserved:

- Native-messaging host or local HTTP endpoint for external tools (Cursor, CLIs, other user tooling).
- Firefox / Edge / Brave / Arc extension ports (and, therefore, their bridge equivalents on the page).
- Snippet / context preview in result rows.
- Richer ranking beyond group + date-desc / lab order.
- Additional platforms beyond the parent §4.1 set (M7 remains the only approved exception; M8 does not authorize any new platform).
- Any subdomain of `cogis.ai` beyond apex + the M5 `packs.cogis.ai` (if used) and the GitHub-Pages-managed `www` redirect.

---

## 13. Phase 2 operator hand-off

M8 sub-milestones will be handed off via `docs/handoff-prompts.md` in the same pattern as M1–M7. Hand-off prompts for M8a–M8e are authored as a **separate** operator-owned document once this addendum is human-merged; the addendum is not itself a hand-off prompt.

---

## Changelog

| Version | Date | Change |
| --- | --- | --- |
| 0.1.0 | 2026-07-30 | Initial Phase-0-style addendum for the M8 web search surface. Authors the two-deployable architecture (extension + `cogis.ai` static site under `web/`), the postMessage bridge with strict origin lock (`https://cogis.ai` string equality) and nonce echo, the `WEB_SEARCH_SURFACE_ENABLED` feature flag, the CSP lock (`connect-src 'none'`), the `www.cogis.ai` → apex redirect posture, the S8.1–S8.3 spike stubs, and the M8a–M8e sub-milestones with behavioral AC. Lists the surgical amendments to the parent blueprint (§11 of this addendum) to be applied in a follow-up docs PR after human merge. No code changes; no `web/` subtree yet; no manifest changes yet. |
