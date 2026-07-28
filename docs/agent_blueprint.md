# Cogis — Agent Blueprint

**Project:** Cogis  
**Display name:** Cogis — AI Search  
**Repository:** [`dsergovic/cogis`](https://github.com/dsergovic/cogis)  
**License:** MIT  
**Framework:** [Full-Lifecycle Agentic Software Engineering v1.1.0](https://github.com/dsergovic/research/blob/main/docs/Full-Lifecycle%20Agentic%20Software%20Engineering.md)  
**Phase 0 input:** [`docs/cogis-ai-search-pre-blueprint.md`](./cogis-ai-search-pre-blueprint.md) **v0.2.0** (locked; do not re-litigate)  
**Status:** Phase 1 blueprint — spikes S1–S6 resolved; ready for Phase 2 hand-off  
**Version:** 0.2.1  
**Integration branch:** `dev` (day-to-day working area; feature PRs target `dev`)  
**Spike findings:** [`docs/spikes/`](./spikes/)

---

## 1. One-sentence product

Cogis is a single-user Chrome MV3 extension that searches the user's own conversation history across ChatGPT, Claude, Perplexity, and Gemini from a single popup and returns clickable pointers into each lab — a **launcher**, not a knowledge base.

**V1 win condition:** the user types a query in the popup, sees a grouped list of hits across the four supported labs within the timeout budget, and can click any hit to land on that lab (deep link preferred). Nothing more.

---

## 2. Runtime target and distribution channel

| Dimension | V1 lock |
| --- | --- |
| **Runtime** | Google Chrome, Manifest V3 extension (service worker + popup + content scripts) |
| **Distribution (V1)** | `dev-unpacked` only — load unpacked from a local clone via `chrome://extensions` |
| **Distribution (later)** | Chrome Web Store listing — **human escalation**; agent never lists or submits |
| **Environment topology** | Single topology: developer/user machine, unpacked. No staging/production split in V1. No hosted app server. |
| **Other browsers** | Out of V1 (Firefox / Edge / Brave / Arc are V2+ seams) |
| **Open source** | Public open-source intent (MIT). Repo may remain private until a human flips visibility — that flip is a human gate, not an agent action. |

Language, stack, runtime, and distribution are settled here. **The executing agent never chooses the runtime target.**

---

## 3. Technical architecture

### 3.1 One deployable

- **One deployable:** Chrome MV3 extension only.
- **Search surface:** extension **popup** only.
- **No** hosted web app, companion server, database, or Cogis-owned HTTP API in V1.
- **No** `cogis.ai/search` page in V1 (reserved V2 seam).
- `cogis.ai` may exist later as marketing/install and as the **data-only** selector-manifest host (M5); it does not host search UI in V1.

### 3.2 Data flow (locked)

1. User opens the popup and submits a query (Enter or Search button).
2. Service worker fans the query to per-platform adapters.
3. Each adapter uses, in preference order:
   1. Session-cookie-authenticated **first-party endpoint** on the lab origin (no API keys, no stored auth).
   2. Else **DOM-driving** the lab's own search UI via a content script in an existing tab, or a background tab opened for the purpose.
   3. Else graceful failure chip (`please log in` or `temporarily unavailable`).
4. Results stream back to the popup, grouped by platform, date-descending within each group (or lab-stable order if that is what the lab returns).
5. Nothing is cached between queries. Re-query every time.

### 3.3 Folder structure

Plain HTML / CSS / JS. No React/Vue/Svelte/etc. No bundler required for V1.

```text
cogis/
├── LICENSE
├── README.md
├── NOTICE                          # ToS / privacy posture (human-visible)
├── package.json                    # dev tooling only (lint, format, test)
├── package-lock.json               # locked
├── eslint.config.js                # or .eslintrc.cjs — Tier 2 filename
├── .prettierrc
├── .prettierignore
├── .gitignore
├── vitest.config.js
├── docs/
│   ├── cogis-ai-search-pre-blueprint.md   # Phase 0 (immutable input)
│   ├── agent_blueprint.md                 # this file
│   └── spikes/                            # written spike findings (S1–S6)
│       └── README.md
├── extension/                      # load this directory as unpacked extension
│   ├── manifest.json
│   ├── background/
│   │   └── service-worker.js
│   ├── popup/
│   │   ├── popup.html
│   │   ├── popup.css
│   │   └── popup.js
│   ├── content/
│   │   ├── chatgpt.js
│   │   ├── perplexity.js
│   │   ├── claude.js
│   │   └── gemini.js
│   ├── lib/
│   │   ├── messaging.js            # popup ↔ SW ↔ content message shapes
│   │   ├── platforms.js            # platform ids, labels, capability enums
│   │   ├── results.js              # normalize pointer records
│   │   ├── readiness.js            # MutationObserver + debounced poll helper
│   │   ├── timeouts.js             # 8s / 15s constants
│   │   └── selectors/
│   │       ├── local-pack.json     # bundled data-only selectors (versioned)
│   │       └── loader.js           # merge local + optional remote (M5)
│   ├── assets/
│   │   └── icons/                  # 16, 48, 128
│   └── debug/                      # M6 debug panel pages/scripts
│       └── panel.html              # optional; may land in M6 only
├── tests/
│   ├── unit/                       # pure JS (messaging, normalize, timeouts)
│   └── fixtures/                   # HAR / JSON fixtures per platform (no live secrets)
│       ├── chatgpt/
│       ├── perplexity/
│       ├── claude/
│       └── gemini/
└── scripts/                        # optional maintainer scripts (Tier 2)
```

**Notes for implementers**

- `extension/` is the unpacked root (not the repo root), so `package.json` and tests stay out of the Chrome package.
- Content scripts are **one file per platform** at V1; splitting helpers under `lib/` is fine (Tier 1/2).
- M5 remote manifest merge lives in `lib/selectors/loader.js`; remote payload remains **data-only forever**.
- M6 debug UI may add files under `extension/debug/` without changing the overall tree purpose.

### 3.4 Naming standards (vanilla JS)

| Kind | Convention | Examples |
| --- | --- | --- |
| Files | `kebab-case.js` / `.html` / `.css` | `service-worker.js`, `popup.css` |
| Directories | `kebab-case` | `content/`, `lib/selectors/` |
| Modules | ES modules (`import` / `export`) where MV3 allows; service worker and content scripts follow Chrome module rules as pinned in manifest |
| Variables / functions | `camelCase` | `searchChatgpt`, `normalizeResult` |
| Constants | `UPPER_SNAKE_CASE` | `PLATFORM_TIMEOUT_MS` |
| Platform ids | stable lowercase strings | `chatgpt`, `perplexity`, `claude`, `gemini` |
| CSS classes | `kebab-case`, prefix `cogis-` for popup UI | `cogis-results`, `cogis-group--loading` |
| Message types | `UPPER_SNAKE` string constants | `SEARCH_REQUEST`, `SEARCH_RESULT_CHUNK`, `SEARCH_CANCEL` |
| DOM `data-*` | `data-cogis-*` | `data-cogis-platform` |
| JSON field names | `camelCase` | `chatTitle`, `deepLinkUrl`, `capability` |
| Branches | `feature/...`, `spike/...`, `agent-stuck/mN-yyyy-mm-dd` | `feature/m1-chatgpt-e2e` |
| Commits | imperative, milestone-scoped when possible | `feat(m1): render chatgpt result group` |

Do not introduce TypeScript, JSX, or CSS-in-JS in V1.

### 3.5 Database schema

**N/A.** Cogis has no database and no persistent application state store in V1.

### 3.6 API routes (owned)

**N/A — no Cogis-owned API surface in V1.**

Outbound contacts (not “our API”):

| Target | When | Purpose |
| --- | --- | --- |
| Lab origins (ChatGPT, Claude, Perplexity, Gemini) | Every search | Session-cookie first-party calls and/or DOM UI in the user's browser |
| `cogis.ai` (path TBD) | M5+ | Fetch **data-only** selector hotfix manifest |
| Maintainer ping endpoint (URL TBD) | M6, **opt-in, default off** | Anonymous selector-failure signal only |

### 3.6.1 Lab contracts (from resolved spikes S1–S4)

| Platform | Strategy | Capability | Deep link | Prefill | Containers |
| --- | --- | --- | --- | --- | --- |
| ChatGPT | `GET /backend-api/conversations/search` (session Bearer from `/api/auth/session`); DOM Search chats fallback | **full-text** | `https://chatgpt.com/c/{id}` | No stable URL; optional content-script focus | **Projects via search** (list-only is insufficient) |
| Perplexity | `POST /rest/thread/list_ask_threads` + `search_term`; session cookies | **title-match** (until proven full-text) | `https://www.perplexity.ai/search/{slug}` | `https://www.perplexity.ai/search?q=` | Spaces via S3 ladder |
| Claude | Org session APIs under `/api/organizations/{orgId}/…`; DOM Recents fallback | **title-match** | `https://claude.ai/chat/{uuid}` | No stable URL | Projects required |
| Gemini | **DOM-first** history; endpoint if live Network reveals one | **title-match** | `https://gemini.google.com/app/{id}` | None | Flat history + any UI containers |

Full write-ups: `docs/spikes/s1-…` through `s4-…`. Auth matrix: `s5-…`. Long history: `s6-…`.

**Residual risk (not open product questions):** brittle CSS selectors and occasional header/param drift. Handle via M-milestone fixtures + M5 data-only pack — do not reopen S1–S6 unless a strategy in the table fails entirely.

### 3.7 Environment variables and secrets policy

| Rule | Detail |
| --- | --- |
| **Secrets** | **None.** No API keys, OAuth client secrets, tokens, or long-lived credentials. |
| **Env files** | None required for runtime. Optional `.env` for maintainer-only scripts must never hold user session material and must be gitignored if introduced later (escalation to add). |
| **Auth state** | **Never stored** by Cogis. Session cookies remain on each lab origin, owned by the browser. |
| **Permissions** | Declare the **minimum** host permissions needed for the four lab origins (and, from M5, the selector-manifest host). Broad `<all_urls>` is an **escalation**. |
| **Queries** | Query strings never leave the local machine except as typed into lab UIs / lab first-party calls the user already uses. `cogis.ai` must not log queries. Ping payload must never include query text. |
| **Fixtures** | Tests use recorded HAR/JSON **stripped of cookies and tokens**. |

State this posture in `NOTICE` and `README` (M1 deliverable alongside shell).

### 3.8 Internal message contract (logical)

Implementers define exact payloads in code (Tier 1/2) but must preserve these roles:

- `SEARCH_REQUEST` — `{ requestId, query, platforms[] }`
- `SEARCH_CANCEL` — `{ requestId }`
- `SEARCH_RESULT_CHUNK` — `{ requestId, platform, status, capability?, results[]?, errorCode? }`
- `SEARCH_PLATFORM_DONE` — `{ requestId, platform, status }`
- Pointer record: `{ platform, title, dateIso | null, deepLinkUrl | null, prefillSupported | boolean }`

### 3.9 Readiness detection

- Prefer **MutationObserver** on the results container; resolve when the list stabilizes.
- Debounced polling fallback is **Section 3.5 Tier 2** (note in PR; output identical).
- Naive fixed `sleep(1500)` as the sole readiness strategy is **not** acceptable.

### 3.10 Selector abstraction

- Bundled **local** data-only pack (`local-pack.json`) with a version string.
- M5: optional remote pack merge; **CSS selectors, wait predicate strings, URL pattern strings only**.
- **No** remote JS, `eval`, dynamic `import()` of remote code, or template evaluation of remote strings as code.
- Behavior changes = extension version bump. Selector churn = data pack bump.

---

## 4. Search capability and scope policy

### 4.1 Platforms (V1)

ChatGPT, Perplexity, Claude, Gemini. **No DeepSeek.**

### 4.2 Capability policy

- **Full-text** where the platform supports it — **ChatGPT = full-text** (S1 + OpenAI Help).
- **Title-match** for **Perplexity, Claude, Gemini** (S2–S4) unless a later human-amended finding upgrades a label.
- Per-platform capability label on each results group.
- Popup footnote (always visible in results chrome):  
  **“Some AIs do not support full-text search.”**

### 4.3 Search scope (V1b)

For **each** platform milestone, scope includes:

1. Default history, and  
2. The user's own **Spaces / Projects** (or platform equivalent) containers.

Chats only inside Projects/Spaces must still be findable. This is real V1 scope per platform milestone — not a post-M4 nice-to-have.

| Milestone | Platform | Container scope in that milestone |
| --- | --- | --- |
| M1 | ChatGPT | Default history + **ChatGPT Projects** |
| M2 | Perplexity | Default history + **Perplexity Spaces** |
| M3 | Claude | Default history + **Claude Projects** |
| M4 | Gemini | Default history + Gemini history containers as characterized by S4 |

### 4.4 Result click cascade

For each hit, on click, attempt in order:

1. **Deep link** to the specific chat when `deepLinkUrl` is present.  
2. Else **pre-fill** when `prefillSupported` (Perplexity: URL `?q=`; others: optional content-script assist only, not a fake deep link).  
3. Else open the **lab home / history** surface.

Per-platform flags are locked in §3.6.1 / spike findings. Behavioral acceptance requires honest flags — not faking deep links.

### 4.5 Timeouts

| Budget | Value |
| --- | --- |
| Per-platform search | **8 seconds** then that group → timed-out / unavailable (or empty if the lab returned empty before timeout — do not mislabel empty as unavailable) |
| Overall wall for a request | **~15 seconds** (stragglers after wall are cancelled) |
| In-flight cancel | Immediate abort of work for the previous `requestId` when a new search starts |

### 4.6 Query UX

| Rule | Behavior |
| --- | --- |
| Trigger | **Only** Enter key or explicit Search button — no live-as-you-type search |
| Minimum length | **1** non-whitespace character after trim |
| Empty submit | **Clear** results panel, **cancel** in-flight search, show gentle hint: “Type a query and press Enter.” |
| New submit while in flight | **Abort** active search (`requestId` cancel), start new request |
| Whitespace-only | Treat as empty submit |

### 4.7 Results UX

- Grouped by platform; UI order: **ChatGPT → Perplexity → Claude → Gemini** (matches milestone order; groups for platforms not yet implemented may be omitted until their milestone).
- Layout reserved up front so the popup does not jump as groups fill.
- Per-group states: `idle` | `loading` | `ready` | `empty` | `login_required` | `unavailable` | `timeout`.
- Each result row: platform affordance (group header), **title**, **date** (when known).
- **No** snippet/body preview in V1.
- Default max results rendered per platform: **20** (Tier 2 to adjust; note in PR).
- Partial failure is visible, not fatal — other groups still render.

### 4.8 Auth failure copy

- Logged out: **“Please log in to {Platform}”** with link to the lab origin.  
- DOM/endpoint break or timeout with no usable payload: **“{Platform} is temporarily unavailable.”**  
- M6 may offer opt-in “report selector issue” using the anonymous ping (never auto-send query text).

---

## 5. User stories

Stories are acceptance paths for Phase 4 manual smoke and for behavioral criteria below. Codified DOM assertions wait for spike findings where noted.

### US-1 — Canonical recipe finder (happy path)

**As** a user who remembers a distinctive term from a past chat (e.g. a recipe) but not which lab held it,  
**I want** to search once from the Cogis popup,  
**so that** I get grouped pointers and can open the right conversation.

**Acceptance path**

1. User is logged into at least ChatGPT (M1) / relevant labs for later milestones.  
2. User opens Cogis — AI Search popup, types a distinctive query, presses Enter.  
3. Within timeout budget, groups show loading then results or empty.  
4. A hit that matches the conversation appears under the correct platform group with title (and date if available) and the correct capability label on the group.  
5. User clicks the hit; cascade opens deep link, else pre-fill, else lab home.  
6. No message bodies were stored by Cogis; a second identical query re-hits the labs (no cache).

### US-2 — Partial login / multi-lab

**As** a user logged into only some labs,  
**I want** results from labs I am in and clear guidance for the others,  
**so that** a single logged-out lab does not fail the whole search.

**Acceptance path**

1. User logged into platform A, logged out of platform B (for M1: exercise login_required path via ChatGPT logged-out state).  
2. On search, A returns results or empty; B shows **Please log in to {B}** with link.  
3. A remains usable; no uncaught errors; cancel/new search still works.

### US-3 — Empty / no-hit query

**As** a user whose query matches nothing,  
**I want** an explicit empty state,  
**so that** I can tell “no hits” from “still loading” or “broken.”

**Acceptance path**

1. Submit a nonsense query unlikely to hit history.  
2. Each implemented platform group reaches `empty` or a failure state — never infinite `loading` past timeout.  
3. Empty is not presented as `unavailable` unless the adapter actually failed.

### US-4 — DOM break / unavailable

**As** a user when a lab's UI contract breaks,  
**I want** that group to show temporarily unavailable,  
**so that** other labs still work and I know which surface needs a selector fix.

**Acceptance path**

1. Simulate or encounter adapter failure (fixture in unit tests; manual fault injection acceptable in Phase 4).  
2. Failed group → `unavailable` (or `timeout` if that is the failure mode).  
3. Other groups unaffected.  
4. No remote code execution attempted as a “fix.”

### US-5 — Scroll-to-reveal hit

**As** a user clicking a result whose chat is not above the fold on the lab page,  
**I want** to land in a state where I can reach that chat,  
**so that** deep links (or lab navigation) still complete the launcher job.

**Acceptance path**

1. Click a hit that opens the lab (deep link preferred).  
2. If the lab lands mid-history or requires scrolling to see the conversation entry, that is acceptable for V1 **provided** the deep link targets the chat when the platform supports it (S1–S4 / S6 characterize limits).  
3. Cogis does not scrape message bodies to “scroll inside” a conversation for content — only navigation to the pointer.

### US-6 — Empty submit hygiene

**As** a user who presses Enter with an empty box,  
**I want** prior results cleared and a gentle hint,  
**so that** stale hits do not look like answers to a new empty query.

**Acceptance path**

1. Run a successful search; results visible.  
2. Clear input; press Enter.  
3. Results clear; in-flight cancelled; hint shown: “Type a query and press Enter.”

### US-7 — In-flight cancel / replace

**As** a user who mistyped and immediately searches again,  
**I want** the first search aborted,  
**so that** late chunks from the first request never overwrite the second.

**Acceptance path**

1. Start search A.  
2. Before completion, submit search B.  
3. UI reflects B only; no A chunks apply after cancel; no duplicate mixed titles from A.

---

## 6. Non-goals

Lifted from pre-blueprint §4 and extended where Phase 1 made new ones visible:

- **No caching** of queries or results between searches.  
- **No message-body scraping, indexing, storage, or redistribution.**  
- **No cross-referencing** other product lines or shared product codebases outside `dsergovic/research` framework docs.  
- **No API keys** and **no stored auth state.**  
- **No shared/team-chat** surfaces; **no SSO-enterprise commitment.**  
- **No DeepSeek.**  
- **No `cogis.ai/search`** as a V1 search surface.  
- **No native-messaging host or local HTTP endpoint** for external tools in V1 (V2 seam).  
- **No other browsers in V1.**  
- **No runtime UI framework**, bundler requirement, or TypeScript in V1.  
- **No snippet/context preview** in result rows (V2).  
- **No result ranking** beyond group + date-desc / lab order (V2).  
- **No Chrome Web Store publish** as an agent or milestone exit criterion.  
- **No query telemetry** and no logging of query text to `cogis.ai` or the ping endpoint.  
- **No persistent extension storage of conversation content** (`chrome.storage` for tiny UI prefs in M6 is allowed only if it cannot store query text or message bodies — introducing storage of search history is an **escalation**).  
- **No remote executable code** in the selector manifest or elsewhere.

---

## 7. Dependency pinning

Runtime is browser-native. **DevDependencies only** for lint/format/test.

### 7.1 Extension platform

| Item | Pin |
| --- | --- |
| `manifest_version` | **3** |
| Minimum Chrome | Current stable at M1 start — record exact `minimum_chrome_version` in manifest as a Tier 2 choice if set; default omit unless required |

### 7.2 Dev toolchain (initial pins)

Exact semver ranges are locked in `package-lock.json` at M1 scaffold. Blueprint pins the **stack identity** and minimum major lines:

| Package | Role | Pin policy |
| --- | --- | --- |
| `eslint` | Lint | Latest ESLint **9.x** at M1 scaffold; lockfile pins exact |
| `@eslint/js` | ESLint recommended | Compatible with ESLint 9.x; lockfile pins exact |
| `prettier` | Format | **3.x**; lockfile pins exact |
| `eslint-config-prettier` | Disable conflicting rules | Compatible major; lockfile pins exact |
| `vitest` | Unit tests | **3.x** (or current stable 2/3 at scaffold — pick one major and lock); lockfile pins exact |
| `jsdom` (optional) | DOM unit helpers | Only if needed for popup pure-logic tests; lockfile pins exact |

**Not in V1 unless escalated:** Webpack, Rollup, esbuild, Vite-as-bundler for the extension, React, TypeScript, Playwright, Puppeteer, web-ext sign tooling.

### 7.3 npm scripts (M1)

- `npm run lint`  
- `npm run format` / `format:check`  
- `npm test` (vitest)

### 7.4 Package manager

**npm** with committed `package-lock.json`. Switching to pnpm/yarn is an escalation.

### 7.5 New dependencies

Any new runtime or dev dependency, or major-version jump of a pinned tool, is **Guardrail #4 / Tier 4** — stop and escalate.

---

## 8. Privacy, ToS, and outbound network

### 8.1 Privacy posture (must appear in NOTICE/README)

- Queries are processed locally and only sent into lab surfaces the user already uses.  
- Cogis does not operate a search backend that receives query text.  
- Session cookies are never copied into extension storage or transmitted to Cogis infrastructure.  
- Selector-manifest fetch (M5) carries no query text.  
- Optional maintainer ping (M6) is **off by default**, opt-in, and may include only: platform id, selector pack version, error class / code — **never** query text, titles list, or cookies.

### 8.2 ToS posture (verbatim intent for NOTICE)

Cogis drives the user's own logged-in sessions to retrieve conversation **pointers** the user already owns. It does not:

- Bypass authentication, MFA, or rate limits.  
- Impersonate the user against any lab's servers.  
- Store, redistribute, or resell conversation content.  
- Scrape or index conversation bodies.

The extension operates under the user's own credentials, in the user's own browser, at the user's own request.

Chrome Web Store listing is a **human escalation** after reviewing then-current lab ToS. The agent never lists Cogis autonomously.

### 8.3 Outbound network matrix

| Phase | Allowed destinations |
| --- | --- |
| M1–M4 | Lab origins only (via content script / page context / session cookies) |
| M5 | Labs + `cogis.ai` selector-manifest HTTPS fetch (data-only JSON) |
| M6 | Labs + optional opt-in ping endpoint (URL enable = escalation) |

---

## 9. Named spike tasks — RESOLVED

Spikes are **owned by Human + Perplexity** (framework §3.5 Tier 3). **S1–S6 were resolved in Phase 1 (2026-07-28)** so Cursor can implement milestones with higher autonomy. Findings live under `docs/spikes/`.

| Spike | Finding | Status |
| --- | --- | --- |
| S1 ChatGPT | [s1-chatgpt-search-contract.md](./spikes/s1-chatgpt-search-contract.md) | **Resolved** — search endpoint + full-text + `/c/{id}` + Projects via search |
| S2 Claude | [s2-claude-recents-contract.md](./spikes/s2-claude-recents-contract.md) | **Resolved** — title-match + `/chat/{uuid}` + Projects required |
| S3 Perplexity | [s3-perplexity-thread-contract.md](./spikes/s3-perplexity-thread-contract.md) | **Resolved** — `list_ask_threads` endpoint-first + slug deep link + `?q=` prefill |
| S4 Gemini | [s4-gemini-history-contract.md](./spikes/s4-gemini-history-contract.md) | **Resolved** — DOM-first title-match + `/app/{id}` |
| S5 Auth | [s5-auth-state-detection.md](./spikes/s5-auth-state-detection.md) | **Resolved** — per-platform predicate matrix |
| S6 Long history | [s6-long-history-reach.md](./spikes/s6-long-history-reach.md) | **Resolved** — reach matrix |

**Evidence bar:** official docs + logged-out live UI (2026-07-28) + corroborated open-source reverse-eng. Local logged-in Comet was unavailable during authoring; residual risk is selector/header drift (M5 + milestone fixtures), not open strategy questions.

**Re-open rule:** Only if a locked strategy in §3.6.1 fails entirely on a live personal account — then raise a **new** Tier 3 spike request; do not silently switch endpoint↔DOM in a way that contradicts the finding without a written amendment.

---

## 10. Milestone breakdown and behavioral acceptance criteria

**Two-tier rule (binding):**

- **Behavioral criteria** below are authored here and are binding.  
- **Codified assertions** for DOM-touching behavior may be typed as the **first task inside** the milestone after the relevant spike finding, and only after human approval of the codified form.  
- The agent never invents or softens behavioral criteria. Uncodifiable criterion → escalation.

**Global constraints for every milestone**

- **Branching:** cut feature branches from `dev`; open PRs **to `dev`**. Never commit implementation directly to `dev` or `main`. Do not open milestone PRs to `main`.  
- Agent opens PR; **human merges** (into `dev`).  
- Stop-loss: 5 consecutive attempts on one error; milestone budget: **25** total debugging attempts (or human-stated cap). On trip: `agent-stuck/mN-yyyy-mm-dd` + summary.  
- Note Tier 2 decisions under PR **Choices made**.  
- No new dependencies without escalation.  
- No PortableAI/PortableChat references in code or docs added by the agent.

---

### M1 — ChatGPT only, end-to-end

**Goal:** Ship the extension shell and a complete ChatGPT launcher loop, including **Projects** scope.

**Depends on:** S1/S5/S6 findings (resolved — attach when handing off). Human merge of this blueprint + spike files before coding.

#### M1 scope

- Repo scaffold per §3.3 (`extension/`, tooling, tests skeleton, NOTICE/README posture).  
- `manifest.json` MV3: popup, service worker, ChatGPT content script + host permissions for ChatGPT only (other platforms may be listed as future matches only if required — prefer **ChatGPT-only hosts in M1**).  
- Popup UI: query input, Search button, footnote, ChatGPT result group with capability label, state chrome.  
- Service worker orchestration: request ids, cancel, 8s platform timeout, 15s wall.  
- ChatGPT adapter: search default history + **Projects**; normalize pointers; cascade flags from S1.  
- Unit tests for pure logic (messaging normalize, timeout helpers, cancel semantics) + fixture hooks.  
- First implementation tasks may include codified unit tests from behavioral AC + S1 contracts; live DOM selector capture updates `local-pack.json` and redacted fixtures (Tier 2 note if shape differs slightly from S1).

#### M1 out of scope

- Perplexity, Claude, Gemini adapters.  
- Remote selector manifest fetch (M5).  
- Debug panel / ping (M6).  
- Web Store packaging.

#### M1 behavioral acceptance criteria

1. **Load unpacked:** Loading `extension/` as an unpacked MV3 extension succeeds with no hard errors on the extensions page.  
2. **Popup opens:** Clicking the toolbar icon opens **Cogis — AI Search** popup with input, Search control, and full-text footnote.  
3. **Empty submit:** Enter with empty/whitespace input clears results, cancels in-flight, shows hint “Type a query and press Enter.”  
4. **Search trigger:** A non-empty query runs **only** on Enter or Search click (no debounced live search).  
5. **In-flight cancel:** Submitting query B while A is in flight aborts A; UI does not apply late A chunks.  
6. **ChatGPT loading chrome:** On search, ChatGPT group shows `loading` without layout jump, then a terminal state within **8s** (or earlier).  
7. **Full-text label:** ChatGPT group capability label is **full-text**; footnote visible.  
8. **Happy path (US-1):** Logged-in user can find a known ChatGPT chat by distinctive query (default history) and see title (+ date if available).  
9. **Projects (US-1 scope):** A chat that lives **only** inside a ChatGPT Project is findable via **search** (not list-only), per S1.  
10. **Click cascade:** Clicking a result opens `https://chatgpt.com/c/{id}` when id present; else lab home (prefill URL not required for ChatGPT).  
11. **Login required (US-2):** Logged-out ChatGPT yields **Please log in to ChatGPT** (or equivalent exact copy with platform name), not a hang.  
12. **Empty hits (US-3):** Nonsense query yields `empty` (or honest failure), not infinite loading past timeout.  
13. **Unavailable (US-4):** Forced adapter failure yields `unavailable` or `timeout` without breaking popup shell.  
14. **Timeouts:** Exceeding 8s without success transitions group off `loading`; wall cancel works.  
15. **No cache:** Two identical queries each invoke the adapter path again (observable via debug logs or test spies).  
16. **No secrets / no body scrape:** Code paths do not persist cookies or message bodies; lint/tests include a fixture that ensures normalizer rejects/ignores body fields if present in raw lab payloads.  
17. **Tooling:** `npm test`, `npm run lint`, and `npm run format:check` pass on the PR.  
18. **NOTICE/README:** Privacy + ToS posture present; V1 = dev-unpacked stated.

#### M1 first tasks (ordered)

1. Scaffold + pin lockfile + unit tests for messaging/timeouts/cancel.  
2. Implement ChatGPT adapter per S1 (search endpoint preferred) + popup UI.  
3. Redacted fixtures from first successful live shape when available.  
4. Open PR with Choices made.

---

### M2 — Perplexity

**Goal:** Add Perplexity group end-to-end with Spaces scope; prefer session-cookie first-party endpoint per S3.

**Depends on:** S3/S5/S6 findings (resolved).

#### M2 behavioral acceptance criteria

1. All M1 criteria remain green.  
2. Perplexity host permissions + content/endpoint adapter land without adding frameworks.  
3. Search shows Perplexity group with correct capability label from S3.  
4. Default history hits work for a known thread when logged in.  
5. **Spaces:** thread only in a Space is findable, or S3-documented limitation is human-amended into blueprint before merge.  
6. Login / empty / unavailable / timeout behaviors match §4 for Perplexity.  
7. Click cascade respects S3 deep-link/prefill/home flags.  
8. Endpoint-vs-DOM choice matches S3 finding; if implementer wants the opposite, **Tier 3 stop** (not silent Tier 2).  
9. Cancel and dual-query isolation still hold with two platforms.  
10. `npm test` / lint / format:check pass; codified tests added under two-tier rule after S3.

---

### M3 — Claude

**Goal:** Claude group with title-match (or S2-corrected) capability label + Projects scope.

**Depends on:** S2/S5/S6 findings (resolved).

#### M3 behavioral acceptance criteria

1. M1–M2 criteria remain green.  
2. Claude group renders with capability label from S2 (expected title-match unless S2 proves otherwise).  
3. Known Claude chat findable by title/preview terms per S2.  
4. **Projects** included per S2.  
5. Login / empty / unavailable / timeout / cascade per S2 flags.  
6. Partial failure: Claude down does not block ChatGPT/Perplexity.  
7. Tooling green; codified tests after S2 approval.

---

### M4 — Gemini

**Goal:** Gemini group; expected thinnest surface; honest limitations from S4.

**Depends on:** S4/S5/S6 findings (resolved).

#### M4 behavioral acceptance criteria

1. M1–M3 criteria remain green.  
2. Gemini group with capability label from S4.  
3. Known Gemini history item findable within S4-documented scope.  
4. Container/history equivalents included per S4.  
5. Login / empty / unavailable / timeout / cascade per S4.  
6. Four-platform fan-out respects 8s/15s and cancel semantics.  
7. README lists per-platform capability matrix from spikes.  
8. Tooling green; codified tests after S4 approval.

---

### M5 — Selector hotfix manifest (data-only)

**Goal:** Versioned local pack + optional remote JSON fetch/merge from a `cogis.ai` path so selector churn does not require a full Web Store release later.

#### M5 behavioral acceptance criteria

1. Local pack remains sufficient when remote is unreachable (offline-safe fallback).  
2. Remote document is parsed as **data only** (selectors / predicate strings / URL patterns).  
3. Automated or unit safeguards: rejecting payloads that contain executable-looking keys (e.g. raw script fields) fails closed to local pack.  
4. No `eval`, no dynamic remote code import, no `new Function` on remote strings.  
5. Manifest version visible to debug surface hooks (M6 may display).  
6. Fetch uses HTTPS to an allowlisted host path; host permission narrowly declared.  
7. Failure to fetch does not break search (log + local pack).  
8. Tooling green.

**Escalation:** any proposal to put executable logic in the remote pack; any expansion beyond data-only.

---

### M6 — Telemetry / debug panel + optional ping

**Goal:** Maintainer-facing debug panel: per-platform latency, hit counts, last-known-good selector pack version. Optional **opt-in** anonymous selector-failure ping (default **off**).

#### M6 behavioral acceptance criteria

1. Debug panel reachable from popup or a documented extension page (Tier 2 UX).  
2. Shows per-platform: last latency ms, last hit count, last status, selector pack version.  
3. Does **not** display or store full message bodies.  
4. Query text is not written to `chrome.storage` or sent to Cogis infrastructure.  
5. Ping: default off; when off, no ping network calls.  
6. When user opts in, ping payload ≤ `{ platformId, selectorPackVersion, errorClass }` (+ generic extension version optional).  
7. Ping endpoint URL is configuration reviewed by human before enable in any build that points at production — **escalation to enable**.  
8. M1–M5 behavior unchanged when panel closed and ping off.  
9. Tooling green.

---

## 11. Testing strategy (sites we do not control)

| Layer | V1 approach |
| --- | --- |
| Unit | vitest for pure JS: normalize, timeouts, cancel, selector merge reject-exec, message routing |
| Fixtures | Per-platform JSON/HAR **redacted** under `tests/fixtures/{platform}/` |
| Codified DOM | After each spike; human-approved; may use fixtures mimicking DOM snippets |
| Live manual smoke | Phase 4 human: US-1–US-7 on real logged-in browser |
| Nightly live smoke | Aspirational; not a V1 CI gate. Document as maintainer manual checklist in README. Automating live lab logins in CI is an **escalation** (secrets + ToS). |

---

## 12. Escalation list (Tier 4 — stop; do not decide)

The executing agent **stops and summarizes** rather than deciding:

1. **Chrome Web Store** listing, listing account, privacy questionnaire answers, or store screenshots/copy finalization.  
2. **Any deviation from data-only** selector manifest (remote code, eval, dynamic remote import, wasm remote, etc.).  
3. **Any change to auth posture** (API keys, OAuth app, storing cookies/tokens, proxying sessions).  
4. **Persistent storage of queries, results, or conversation content**; introducing sync storage of history.  
5. **Anything ToS-adjacent** beyond the stated NOTICE posture (aggressive scraping, rate-limit bypass, multi-account automation).  
6. **New dependency** or unpin/major bump of eslint/prettier/vitest/npm stack; adding a bundler or UI framework.  
7. **Runtime target change** (Firefox-first, Electron, hosted web app, companion server).  
8. **Host permission widening** to `<all_urls>` or unrelated origins.  
9. **Enabling** maintainer ping against a production endpoint or expanding ping payload.  
10. **Adding or removing a platform** (including DeepSeek) or reordering product scope vs this blueprint.  
11. **Dropping Projects/Spaces scope** for a platform without a human-approved spike finding + blueprint amendment.  
12. **Public GitHub visibility flip** or org transfer.  
13. **Softening or deleting** pre-approved behavioral acceptance criteria or approved codified tests to get green.  
14. **Security-sensitive** changes: CSP relaxations, `unsafe-eval`, remotely hosted scripts in popup.  
15. Stop-loss or milestone-budget trip (Guardrail #1).

---

## 13. Implementer independence (project notes)

Default framework §3.5 tiers apply. Project-specific clarifications:

| Topic | Tier |
| --- | --- |
| Debounced polling vs MutationObserver when observer thrashes | **Tier 2** (note in PR) — strategy already preferred Observer-first |
| Max results per platform (default 20) | **Tier 2** |
| Exact popup dimensions / CSS polish | **Tier 1–2** |
| Endpoint vs DOM for a lab | **Tier 3** (spike) — not Tier 2 |
| Prefill injection technique once S-finding says prefill is possible | **Tier 2** if multiple equivalent DOM methods; **Tier 3** if unsure whether prefill is allowed/possible |
| Background tab vs existing tab reuse | **Tier 2** if both session-safe; **Tier 3** if it changes auth or detection semantics |

---

## 14. V2 seams (reserved, not built)

Design V1 so these remain possible without rewrite:

- `cogis.ai/search` additional surface (extension bridge via `postMessage`, origin lock + nonce — never `"*"`).  
- Native-messaging host or local HTTP endpoint for external tools (Cursor, CLIs, other user tooling).  
- Firefox / Edge / Brave / Arc ports.  
- Snippet / context preview.  
- Richer ranking.  
- Additional platforms (DeepSeek still not implied).

---

## 15. Phase 2 operator hand-off

Operator will provide hand-off prompts.

---

## Changelog

| Version | Date | Change |
| --- | --- | --- |
| 0.2.1 | 2026-07-28 | Integration branch retarget: day-to-day working area is `dev`. Feature branches cut from `dev`; milestone PRs target `dev` (not `main`). Header + global milestone constraints updated. |
| 0.2.0 | 2026-07-28 | Spikes S1–S6 resolved and folded in (§3.6.1 contract table; §9 marked resolved). Capability labels locked (ChatGPT full-text; others title-match). Click cascade flags locked per platform. §15 collapsed to operator-owned hand-off pointer (no path). M1–M4 no longer gated on open spikes. Residual risk = selector/header drift only. Operator hand-off prompts authored alongside this blueprint as a separate human-only doc. |
| 0.1.0 | 2026-07-28 | Initial Phase 1 agent blueprint under framework v1.1.0. Compiled from pre-blueprint v0.2.0 plus Phase 1 interview locks: M1 includes ChatGPT Projects; Spaces/Projects inside each platform milestone; click cascade deep-link → prefill → lab home; query UX Enter/Search only with empty clear+hint and in-flight cancel; timeouts 8s/15s; stack HTML/CSS/JS + ESLint + Prettier + vitest; display name Cogis — AI Search; M5 data-only remote selector pack; M6 debug panel + opt-in anonymous ping designed off-by-default; behavioral AC for M1–M6; spikes S1–S6 formalized. Authored in Perplexity Computer session for Phase 1 (no application code). |
