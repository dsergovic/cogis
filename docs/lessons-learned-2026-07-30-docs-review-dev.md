# Cogis — `docs/` Review

**Purpose** This document was created after the completion of M6. The lesson learned is that the blueprint document should not be used to track project status. The next project should make better use of standard agile mechanisms in GitHub or DevOps.

**Branch reviewed:** `dev` @ `e3db651`
**Reviewer role:** senior software engineer + security
**Scope:** every file in `docs/`, with special depth on `docs/agent_blueprint.md`. Docs claims cross-checked against the implementation in `extension/` and `tests/`.
**Mode:** review only — no code, commits, branches, or PRs were created.

Files reviewed:

| File | Lines |
| --- | --- |
| `docs/agent_blueprint.md` | 782 |
| `docs/handoff-prompts.md` | 340 |
| `docs/backlog.md` | 79 |
| `docs/cogis-ai-search-pre-blueprint.md` | 175 |
| `docs/spikes/README.md` | 15 |
| `docs/spikes/s1-chatgpt-search-contract.md` | 101 |
| `docs/spikes/s2-claude-recents-contract.md` | 70 |
| `docs/spikes/s3-perplexity-thread-contract.md` | 90 |
| `docs/spikes/s4-gemini-history-contract.md` | 69 |
| `docs/spikes/s5-auth-state-detection.md` | 62 |
| `docs/spikes/s6-long-history-reach.md` | 26 |
| `docs/spikes/s7-grok-history-contract.md` | 62 |

**Severity key:** `blocking` — must fix before the docs can be trusted as a spec; `major` — real defect, fix this milestone; `minor` — should fix, low risk; `nit` — polish.

**Headline:** the security posture in these docs is genuinely good and the code honors it (no `innerHTML`, no `eval`, all deep links built from hardcoded origins with `encodeURIComponent`, ping default-off with no endpoint, selector pack fail-closed with a forbidden-key scan). The problems are **spec integrity**, not exploitable vulnerabilities: the blueprint is three milestones stale, it declares scope that shipped code has disabled, and the authoritative honesty rules that the review process enforces are cited to a spike file that does not contain them.

---

## 1. `docs/agent_blueprint.md`

### 1.1 — Perplexity Spaces scope was dropped without the amendment the blueprint requires — `blocking`

**Current text** — `docs/agent_blueprint.md:228-241`:

```markdown
### 4.3 Search scope (V1b)

For **each** platform milestone, scope includes:

1. Default history, and
2. The user's own **Spaces / Projects** (or platform equivalent) containers.

Chats only inside Projects/Spaces must still be findable. This is real V1 scope per platform milestone — not a post-M4 nice-to-have.

| Milestone | Platform | Container scope in that milestone |
| M2 | Perplexity | Default history + **Perplexity Spaces** |
```

`docs/agent_blueprint.md:588` (M2 AC-5):

```markdown
5. **Spaces:** thread only in a Space is findable, or S3-documented limitation is human-amended into blueprint before merge.
```

`docs/agent_blueprint.md:733` (escalation #11):

```markdown
11. **Dropping Projects/Spaces scope** for a platform without a human-approved spike finding + blueprint amendment.
```

**What actually shipped** — `extension/lib/perplexity-adapter.js:21` and `:306-310`:

```javascript
export const SPACE_THREAD_ENUMERATION_ENABLED = false;
...
async function enumerateSpacesThreads(deps) {
  // Honest no-op while candidates are gated. Prefer fail-soft over inventing routes.
  if (!SPACE_THREAD_ENUMERATION_ENABLED) {
    return { pointers: [], used: false, gated: true, fetchCount: 0 };
  }
```

**Problem.** Space-only threads are unfindable in shipped code. M2 AC-5 offered exactly two exits — findability, or a *blueprint amendment* — and neither happened. §4.3 still asserts Spaces is "real V1 scope." The amendment landed instead as `docs/backlog.md:44` (BL-021) and as an "accepted precedent" in `docs/handoff-prompts.md:244`, which is precisely the substitution escalation #11 forbids. `docs/spikes/s3-perplexity-thread-contract.md:58` reinforces it: *"'give up on Spaces' is Tier 4."*

This is the single most consequential finding. The blueprint is the accepted delivery spec; it currently claims a capability the product does not have, and the mechanism that was supposed to prevent exactly that (escalation #11) was bypassed by a backlog row. Anyone reading the blueprint to decide whether V1 is done will get the wrong answer.

**Correction.** Amend §4.3 and record it in the changelog. Suggested §4.3 table row and a new note:

```markdown
| M2 | Perplexity | Default history (Library). **Spaces: deferred — see amendment note below** |

> **Amendment (0.3.1, 2026-07-30) — Perplexity Spaces deferred.** S3's Spaces ladder
> (A: list endpoint, B: DOM directory, C: `search_term` covers Spaces) was not
> live-proven during M2. Rather than ship an unproven probe, Space-thread
> enumeration is gated off (`SPACE_THREAD_ENUMERATION_ENABLED = false`,
> `extension/lib/perplexity-adapter.js:21`) and tracked as **BL-021**. Space-only
> threads are **not findable** in V1. This is a human-approved scope reduction
> under escalation #11, not an implementer decision. M2 AC-5 is satisfied by this
> amendment. Re-enable requires a live-proven route, not a Tier 2 choice.
```

Then correct M2 AC-5 to point at the amendment so the criterion reads as satisfied rather than silently unmet.

---

### 1.2 — The blueprint is three milestones stale and still self-describes as pre-implementation — `major`

**Current text** — `docs/agent_blueprint.md:9-10`:

```markdown
**Status:** Phase 1 blueprint — spikes S1–S6 resolved; ready for Phase 2 hand-off
**Version:** 0.3.0
```

**Reality.** `extension/manifest.json:4` is `"version": "0.6.0"`; M1–M6 have all shipped (`extension/lib/` contains all four adapters, `extension/debug/panel.html`, `extension/lib/ping.js`, and a working remote selector-pack fetch). `docs/backlog.md:34` records an M1 operator smoke pass on 2026-07-28. The blueprint changelog (`:777-782`) has no entry for any milestone landing.

This is a process miss with a named owner: `docs/handoff-prompts.md:54` requires the operator to *"reconcile blueprint Version/Changelog and `docs/backlog.md`"* after every merge. That step has been skipped for M1 through M6.

**Problem.** A spec whose status line says "ready for Phase 2 hand-off" after Phase 2 is essentially complete cannot be used to judge completeness. It also hides finding 1.1: a reader has no signal that §4.3 was overtaken by events.

**Correction** — replace `:9-10`:

```markdown
**Status:** Phase 3 — M1–M6 merged to `dev` (extension `0.6.0`, selector pack `1.3.0`);
M7 (Grok) open, gated on S7. Scope amendments since 0.3.0 are recorded in the changelog
and in `docs/backlog.md`.
**Version:** 0.3.1
```

and add a changelog row per shipped milestone recording the AC deviations each one carried (Spaces gate, Claude Projects unconfirmed routes, Gemini stub selectors).

---

### 1.3 — Truncated/partial coverage has no representable state, so an authoritative honesty rule is unenforceable — `major`

**Current text** — `docs/agent_blueprint.md:277`:

```markdown
- Per-group states: `idle` | `loading` | `ready` | `empty` | `login_required` | `unavailable` | `timeout`.
```

**Conflicting requirement** — `docs/handoff-prompts.md:107,109` (SC-2, SC-4), the table every platform PR must fill:

```markdown
| SC-2 | **Partial hits are success** — if any authenticated page or container returned results, the group reports those hits (with a partial/truncation signal), never a blanket `unavailable` |
| SC-4 | **Mixed failure** — one container succeeds while another fails ⇒ coverage is `truncated`; mixed success must not authorize `empty` |
```

**What the code does.** The state enum is implemented verbatim with no truncation member — `extension/lib/messaging.js:28`:

```javascript
/** @typedef {'idle'|'loading'|'ready'|'empty'|'login_required'|'unavailable'|'timeout'} GroupStatus */
```

Adapters *do* track coverage honestly and downgrade to an `errorCode` (`extension/lib/gemini-adapter.js:591,610,619` — `history_coverage_unproven`, `history_soft_ceiling`), but the popup only logs it — `extension/popup/popup.js:313`:

```javascript
console.info('[cogis]', message.platform, message.status, message.errorCode);
```

`renderResults` (`extension/popup/popup.js:181-208`) draws no partial indicator. A user seeing 20 Claude hits from a truncated scan sees the same UI as a complete one.

**Problem.** SC-2's "with a partial/truncation signal" is unsatisfiable in the UI as the blueprint specifies it, so every platform PR has had to either overclaim the row or reinterpret it as console-only. `docs/spikes/s6-long-history-reach.md:18` reinterprets it in the doc layer — *"Partial results are success; note truncation only in debug (M6)"* — directly contradicting SC-2's "the group reports." Three docs disagree about whether the user is told.

**Correction** — decide and write it down. Recommended (matches shipped behavior, costs nothing):

```markdown
- Per-group states: `idle` | `loading` | `ready` | `empty` | `login_required` | `unavailable` | `timeout`.
- **Coverage flag (orthogonal to state).** A `ready` group additionally carries
  `coverage: 'complete' | 'partial'`. `partial` means the adapter returned real hits
  but did not finish its scan (page/budget truncation, a failed container in a
  breadth-first fan-out). `partial` renders a non-blocking "showing partial results"
  note in the group header and always carries an `errorCode`. Coverage is **not** a
  terminal state: partial-with-hits is `ready`, never `unavailable`.
- A **soft reach ceiling** (a documented platform limit, e.g. Claude root ~100) is
  `complete` coverage and may legitimately yield `empty`. Failure truncation is
  `partial` and must never yield `empty`. These are different things (§4.8, S6).
```

Then reword S6 rule 2 to match, and SC-2/SC-4 become checkable.

---

### 1.4 — `web_accessible_resources` is load-bearing architecture and is absent from the spec — `major`

**Current text.** WAR appears exactly once in 782 lines, inside M7 scope — `docs/agent_blueprint.md:684`:

```markdown
- `host_permissions` and `web_accessible_resources` **narrowly** scoped to the origins S7 proves.
```

§3.3 (`:64-115`), §3.4, and §3.10 never mention it. §3.10 addresses only remote code:

```markdown
- **No** remote JS, `eval`, dynamic `import()` of remote code, or template evaluation of remote strings as code.
```

**Reality.** Every adapter reaches the page through WAR + dynamic import — `extension/content/chatgpt.js:32-34`:

```javascript
adapterPromise = import(chrome.runtime.getURL('lib/chatgpt-adapter.js'))
  .then(...
    return import(chrome.runtime.getURL('lib/selectors/loader.js')).then(
```

backed by four per-origin WAR blocks in `extension/manifest.json` exposing `lib/*-adapter.js`, `lib/results.js`, `lib/platforms.js`, `lib/timeouts.js`, `lib/selectors/loader.js`, `lib/selectors/local-pack.js`. There is a dedicated test harness for it (`tests/helpers/war-coverage.js`, `tests/unit/war-coverage.test.js`) — the project clearly treats WAR as a core invariant. The blueprint does not.

**Problem.** Two concrete risks. (a) A reader of §3.10 could reasonably conclude dynamic `import()` is banned outright and "fix" the content scripts. (b) The narrow-`matches` requirement, the transitive-import-coverage rule, and the `use_dynamic_url` question have no written home, so each milestone re-derives them. M7 will add a fifth WAR block against origins S7 has not yet identified.

**Correction** — add to §3, and amend §3.10's bullet to say "remote code" explicitly so extension-local dynamic import is unambiguously allowed:

```markdown
### 3.11 Web-accessible resources (WAR) contract

Content scripts are classic scripts; shared logic lives in ES modules under `lib/` and is
reached with `import(chrome.runtime.getURL(...))`. This is **extension-local** dynamic
import and is expressly permitted — §3.10's ban covers *remote* code only.

Binding rules:

1. One WAR block per lab, `matches` narrowed to that lab's origins only. Never `<all_urls>`,
   never a wildcard `resources` glob (escalation #8).
2. A module is listed only if it is reachable from that lab's adapter entry. The static
   import graph plus every `chrome.runtime.getURL()` literal must be covered — enforced by
   `tests/unit/war-coverage.test.js`; a new adapter without a passing WAR test is incomplete.
3. WAR-exposed modules are readable by any script on the matched origin, including
   third-party scripts on the lab page. They must therefore contain **no secrets, no
   endpoints not already known to that origin, and no cross-platform data.** Never add
   another lab's adapter to a lab's WAR block.
4. WAR without `use_dynamic_url` lets the matched origins detect that Cogis is installed.
   Accepted for V1 dev-unpacked; revisit before any Web Store listing (see §8.1).
```

---

### 1.5 — §3.8 defines message shapes but no trust boundary, and §14 reserves a `postMessage` bridge — `major`

**Current text** — `docs/agent_blueprint.md:186-194`:

```markdown
### 3.8 Internal message contract (logical)

Implementers define exact payloads in code (Tier 1/2) but must preserve these roles:

- `SEARCH_REQUEST` — `{ requestId, query, platforms[] }`
...
```

Nothing about who may send these, or what the receiver must verify.

**Reality** — `extension/background/service-worker.js:660`:

```javascript
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message.type !== 'string') return false;
```

`_sender` is discarded. Same in `extension/content/chatgpt.js:164`. Only the shape is validated, never the origin.

**Assessment — and I want to be precise about exploitability.** Today this is **not** exploitable. The manifest declares no `externally_connectable`, so web pages cannot reach `chrome.runtime.onMessage`, and there is no `window.addEventListener('message')` anywhere in `extension/`. Chrome's own boundary is doing the work.

The problem is that it works *by accident of omission* rather than by a written invariant — and the blueprint already plans the change that breaks it. `docs/agent_blueprint.md:760`:

```markdown
- `cogis.ai/search` additional surface (extension bridge via `postMessage`, origin lock + nonce — never `"*"`).
```

The moment that seam is built, an unvalidated `SEARCH_REQUEST` handler becomes reachable from a web origin. §14 puts the origin-lock burden on the bridge; §3.8 should put it on the receiver too. Defense in depth belongs in the spec before the seam exists, not after.

**Correction** — append to §3.8:

```markdown
**Trust boundary (binding).** Message *shape* validation is not *sender* validation.

- Every `chrome.runtime.onMessage` / `chrome.runtime.onConnect` handler validates the
  sender before acting: reject unless `sender.id === chrome.runtime.id`, and for
  content-script traffic require a `sender.tab` whose origin is in that platform's
  `hostPatterns` (§3.4).
- `externally_connectable` stays **absent** in V1. Adding it is escalation #3 (auth
  posture) and #14 (security-sensitive), not a Tier 2 choice.
- If the §14 `cogis.ai/search` bridge is built, the extension side validates
  `event.origin` against an exact allowlist **and** a per-session nonce, and re-validates
  every field. `"*"` as a target origin is forbidden.
- The service worker never echoes `query` back to any surface other than the popup that
  originated the `requestId`.
```

---

### 1.6 — The ChatGPT bearer-token rule is one clause where it needs to be a rule set — `major`

**Current text** — `docs/agent_blueprint.md:163` (§3.6.1) and `:179` (§3.7):

```markdown
| ChatGPT | `GET /backend-api/conversations/search` (session Bearer from `/api/auth/session`); DOM Search chats fallback | **full-text** | ... |
```
```markdown
| **Auth state** | **Never stored** by Cogis. Session cookies remain on each lab origin, owned by the browser. |
```

**Problem.** §3.7 says "never stored" and speaks only about *cookies*. But ChatGPT's path extracts a live OAuth-style bearer token into extension-controlled JavaScript — a materially different and more sensitive artifact than a cookie the browser manages, because it is a string the code can log, serialize, or forward. §3.7's cookie-shaped wording does not cover it, and a reader could satisfy §3.7 completely while `console.log`-ing the token.

The code is currently correct — `extension/lib/chatgpt-adapter.js:12-17` returns the token for immediate in-flight use only, `extension/lib/results.js:4-18` lists `accessToken`, `access_token`, `authorization`, `token` in `FORBIDDEN_BODY_KEYS`, and no logging path touches it. Good defaults that the spec does not actually require.

**Correction** — replace the §3.7 "Auth state" row:

```markdown
| **Auth state** | **Never stored.** Session cookies stay on the lab origin, owned by the browser. Where a lab requires a bearer token (ChatGPT `/api/auth/session` → `Authorization: Bearer …`), that token is **request-scoped memory only**: never written to `chrome.storage`, never logged (including `console.debug`), never placed in a message payload, a pointer record, an `errorCode`, a ping, or a fixture, and never sent to any origin other than the one that issued it. `tests/fixtures/**` are redacted of tokens; the normalizer drops token-shaped keys (`FORBIDDEN_BODY_KEYS`) as a backstop. |
```

---

### 1.7 — §3.3 folder structure no longer matches the repo — `major`

**Current text** — `docs/agent_blueprint.md:94-114` (excerpt):

```text
│   ├── lib/
│   │   ├── messaging.js
│   │   ├── platforms.js
│   │   ├── results.js
│   │   ├── readiness.js
│   │   ├── timeouts.js
│   │   └── selectors/
│   │       ├── local-pack.json
│   │       └── loader.js
...
│   └── debug/
│       └── panel.html              # optional; may land in M6 only
├── tests/
│   ├── unit/
│   └── fixtures/
└── scripts/
```

**Actual tree.** `extension/lib/` additionally contains `chatgpt-adapter.js`, `claude-adapter.js`, `perplexity-adapter.js`, `gemini-adapter.js`, `orchestration.js`, `ping.js`, `debug-prefs.js`, `debug-stats.js`, `popup-collapse.js`, and `selectors/local-pack.js`. `extension/debug/` has `panel.html`, `panel.js`, `panel.css`. `tests/` has a `helpers/` directory. `scripts/` does not exist. There is a `.github/` directory the tree omits.

**Problem.** Two things a newcomer cannot learn from this tree, both of which matter:

- **The adapter layer is invisible.** Four `lib/*-adapter.js` files are the heart of the system and the exact files each WAR block exposes (finding 1.4). §3.3's note at `:120` — *"Content scripts are one file per platform at V1; splitting helpers under `lib/` is fine (Tier 1/2)"* — implies adapters are an optional implementer flourish. They are the architecture.
- **`local-pack.js` next to `local-pack.json` looks like a mistake and isn't.** There is a sync test (`tests/unit/pack-sync.test.js`) keeping the two in step. Undocumented, this duplication is the kind of thing a future agent "cleans up."

**Correction** — refresh the tree and replace the note at `:120-122`:

```text
│   ├── lib/
│   │   ├── messaging.js            # message shapes + trust boundary (§3.8)
│   │   ├── platforms.js            # ids, labels, capability enums, PLATFORM_ORDER
│   │   ├── orchestration.js        # request tracker, wall/timeout resolution
│   │   ├── results.js              # pointer normalization; FORBIDDEN_BODY_KEYS
│   │   ├── readiness.js            # MutationObserver + debounced poll helper
│   │   ├── timeouts.js             # 8s / 15s / watchdog constants
│   │   ├── {chatgpt,perplexity,claude,gemini}-adapter.js   # one per lab; WAR-exposed
│   │   ├── ping.js                 # M6 opt-in ping (endpoint null by default)
│   │   ├── debug-prefs.js          # M6 prefs (pingOptIn only)
│   │   ├── debug-stats.js          # M6 per-platform stats (no query text)
│   │   ├── popup-collapse.js       # BL-020 session-only collapse
│   │   └── selectors/
│   │       ├── local-pack.json     # canonical data-only pack (versioned)
│   │       ├── local-pack.js       # ES-module twin of the JSON, kept in sync by
│   │       │                       #   tests/unit/pack-sync.test.js — MV3 content
│   │       │                       #   scripts cannot import JSON directly
│   │       └── loader.js           # local + optional remote merge (M5)
│   └── debug/                      # M6 panel: panel.html / panel.js / panel.css
├── tests/
│   ├── unit/
│   ├── helpers/                    # war-coverage.js and friends
│   └── fixtures/
```

Drop `scripts/` (never created) or mark it "not present; optional".

---

### 1.8 — "Spikes resolved" overstates the evidence, and downstream docs inherit the overstatement — `major`

**Current text** — `docs/agent_blueprint.md:486` and `:498`:

```markdown
Spikes are **owned by Human + Perplexity** (framework §3.5 Tier 3). **S1–S6 were resolved in Phase 1 (2026-07-28)**
...
**Evidence bar:** official docs + logged-out live UI (2026-07-28) + corroborated open-source reverse-eng. Local logged-in Comet was unavailable during authoring; residual risk is selector/header drift (M5 + milestone fixtures), not open strategy questions.
```

Echoed at `docs/spikes/README.md:15`: *"Residual risk is limited to brittle CSS selectors and occasional endpoint param drift … not as open product questions."*

**Problem.** "Residual risk is only selector drift" is not true, and the backlog proves it. Two *routes* — not selectors — were never confirmed:

- `docs/backlog.md:44` (BL-021): Perplexity Spaces list endpoint unproven → feature gated off entirely.
- `docs/backlog.md:45` (BL-022): *"Projects directory + `…/projects/{id}/conversations` **inferred** (S2 residual #2)."*

An unproven route is an open contract question. It is what made finding 1.1 possible: the evidence bar told the implementer that strategy was settled, so the failure mode when the route did not materialize was a backlog row rather than the Tier 3 stop `docs/spikes/s3-perplexity-thread-contract.md:58` calls for.

The individual spikes are honest — S1 says *"Medium on exact DOM selectors / request headers"*, S2 *"Medium on … Projects API"*, S4 *"Low–Medium on search API"*. The summary layer rounds all of that up to "Resolved."

**Correction** — replace the §9 evidence-bar paragraph:

```markdown
**Evidence bar (read this before trusting a spike).** S1–S6 combine official docs,
**logged-out** live UI probes (2026-07-28), and corroborated open-source reverse
engineering. **No spike was validated against a logged-in personal account** — Comet was
unavailable during authoring. "Resolved" means *a strategy is chosen and is safe to build
against*; it does **not** mean every endpoint in the finding was observed live.

Residual risk is therefore two kinds, not one:

1. **Selector / header drift** — mitigated by M5 data-only pack + milestone fixtures.
2. **Unconfirmed routes** — endpoints inferred from third-party clients rather than
   observed. Each is tracked with a backlog ID and must ship behind an honest coverage
   signal, never a silent `empty`: Perplexity Spaces (**BL-021**, gated off),
   Claude Projects directory (**BL-022**, inferred), Gemini live selectors (**BL-025**, stub-level).

A route in category 2 failing live is **not** covered by the re-open rule below — it is a
Tier 3 stop, because "the strategy failed entirely on a live account" is exactly what it is.
```

Mirror the same two-category split in `docs/spikes/README.md:15`.

---

### 1.9 — §4.5 timeout budget omits the popup watchdog and the tab sub-budget — `minor`

**Current text** — `docs/agent_blueprint.md:256-262`:

```markdown
| Per-platform search | **8 seconds** then that group → timed-out / unavailable ... |
| Overall wall for a request | **~15 seconds** (stragglers after wall are cancelled) |
| In-flight cancel | Immediate abort of work for the previous `requestId` when a new search starts |
```

**Reality** — `extension/lib/timeouts.js`:

```javascript
export const PLATFORM_TIMEOUT_MS = 8000;
export const TAB_COMPLETE_MS = 3000;      // undocumented sub-budget
export const OVERALL_WALL_MS = 15000;
export const POPUP_WATCHDOG_MS = OVERALL_WALL_MS + 500;   // undocumented third timer
```

Three timers exist; the spec documents two. The tab sub-budget matters: it is spent *inside* the 8s (`service-worker.js:519-551` recomputes `platformBudgetMs = max(400, PLATFORM_TIMEOUT_MS - spent)`), so a platform that needs a fresh tab may get as little as 400ms of actual search time. That is a real product behavior no reader of §4.5 would predict. The popup watchdog matters because it is the only thing that clears a group if the service worker dies.

Also unstated: the wall is **not** the sum of platform budgets — fan-out is parallel (`Promise.all`, `service-worker.js:647`), which is why five platforms in M7 "must not push the wall" (`:701`). Worth saying once rather than implying it.

**Correction**:

```markdown
| Budget | Value |
| --- | --- |
| Per-platform search | **8s** (`PLATFORM_TIMEOUT_MS`) covering *tab preparation and search combined*. Terminal state on expiry: `timeout`. Empty-before-timeout stays `empty` — never mislabel empty as unavailable. |
| Tab-ready sub-budget | **3s** (`TAB_COMPLETE_MS`), spent inside the 8s. A platform needing a fresh tab keeps the remainder (floor 400ms). Adapters receive the remaining budget, not a fresh 8s. |
| Overall wall | **~15s** (`OVERALL_WALL_MS`). Fan-out is **parallel**, so the wall is a ceiling on the slowest platform, not the sum. Adding a platform must not move it. |
| Popup watchdog | **15.5s** (`OVERALL_WALL_MS + 500`). Popup-side safety net: any group still `loading` is forced to `timeout`. Guards against a dead/restarted service worker. |
| In-flight cancel | New search supersedes the previous `requestId`: in-flight `fetch`es abort via `AbortController`, and any late chunk from a superseded id is dropped before it reaches the popup. |
```

---

### 1.10 — Minimum query length of 1 character is specified without a cap-interaction rule — `minor`

**Current text** — `docs/agent_blueprint.md:268` and `:280`:

```markdown
| Minimum length | **1** non-whitespace character after trim |
...
- Default max results rendered per platform: **20** (Tier 2 to adjust; note in PR).
```

**Problem.** On the three title-match platforms the query is a client-side substring filter (`extension/lib/results.js:302-308`, `.toLowerCase().includes(q)`). A one-character query matches nearly every title, and the 20-cap then truncates by *list position*, not relevance — so the user gets 20 essentially arbitrary chats presented identically to 20 precise hits. On Claude the adapter must normalize pages uncapped before filtering (SC-6), so a 1-char query also maximizes wasted normalization work inside the 8s budget.

The blueprint has no ranking (§6, `:400`, "No result ranking … (V2)"), which is fine — but combined with a 1-char minimum it produces a silently misleading result set.

**Correction** — keep the 1-char minimum (it is legitimate for full-text ChatGPT) and state the interaction:

```markdown
| Minimum length | **1** non-whitespace character after trim. Note: on title-match
platforms the query is a client-side substring filter, so very short queries match
broadly and the §4.7 per-platform cap truncates by list order, not relevance. Where a
title-match group is capped, it renders with the §4.7 `partial` coverage note so the user
can tell "top 20 of many" from "20 total". Ranking remains out of scope (§6). |
```

(This depends on the coverage flag from finding 1.3.)

---

### 1.11 — "Cap after filter" is a correctness rule that lives only in the hand-off doc — `minor`

**Current text.** `docs/agent_blueprint.md:280` states the cap. The ordering rule appears nowhere in the blueprint. It lives at `docs/handoff-prompts.md:111` (SC-6) and `:138`:

```markdown
- **Cap after the client-side title filter, not before.** Normalize the whole page, filter by title, *then* cap. Capping the raw page first throws away matches sitting further down it.
```

**Problem.** This is a silent-data-loss bug class, not a process preference, and the blueprint is the doc that survives. It is already encoded in the code's API — `extension/lib/results.js:428-437`, `normalizeClaudeListResponse` deliberately defaults `max` to `undefined`:

```javascript
 * When `max` is omitted, returns all valid pointers (caller title-filters then
 * caps — required for Claude client-side title-match).
```

That subtlety (one normalizer defaults uncapped, the others cap inline) is exactly the kind of thing that gets "consistency-refactored" away by someone reading only the blueprint.

**Correction** — add to §4.7:

```markdown
- **Cap after filtering.** On title-match platforms, normalize the full fetched page
  **uncapped**, apply the client-side title filter, and only then apply the per-platform
  cap. Capping before filtering silently drops matches further down the page. Normalizers
  used on this path must default to uncapped.
```

---

### 1.12 — `cogis.ai` manifest path is documented as TBD but is pinned in code and manifest — `minor`

**Current text** — `docs/agent_blueprint.md:156`:

```markdown
| `cogis.ai` (path TBD) | M5+ | Fetch **data-only** selector hotfix manifest |
```

**Reality** — `extension/lib/selectors/loader.js:7` and `extension/manifest.json`:

```javascript
export const REMOTE_PACK_URL = 'https://cogis.ai/packs/selectors.json';
```
```json
"host_permissions": [ ..., "https://cogis.ai/packs/*" ]
```

The host is also hard-validated at `loader.js:120` (`parsed.hostname === 'cogis.ai'`).

**Correction**:

```markdown
| `cogis.ai` | M5+ | `GET https://cogis.ai/packs/selectors.json` — data-only selector pack. Host permission narrowed to `https://cogis.ai/packs/*`; hostname re-validated in `loader.js` before fetch; `credentials: 'omit'`, 1.5s timeout, fail-closed to the bundled pack. Path is Tier 2; **host is not**. |
```

---

### 1.13 — No baseline CSP is specified, though escalation #14 polices CSP relaxations — `minor`

**Current text** — `docs/agent_blueprint.md:736`:

```markdown
14. **Security-sensitive** changes: CSP relaxations, `unsafe-eval`, remotely hosted scripts in popup.
```

**Reality.** `extension/manifest.json` declares no `content_security_policy` key at all — the extension relies on the MV3 default.

**Problem.** You cannot detect a "relaxation" against an unstated baseline. The MV3 default is strong, so this is not a live vulnerability — but an explicit declaration converts a convention into a diffable line, which is what escalation #14 needs to be enforceable.

**Correction** — add to §3.7:

```markdown
| **CSP** | Extension pages declare an explicit CSP rather than relying on the MV3 default, so any weakening is visible in the manifest diff (escalation #14): `"content_security_policy": { "extension_pages": "script-src 'self'; object-src 'self'" }`. No inline `<script>`, no `unsafe-eval`, no remote script/style in popup or debug pages. |
```

---

### 1.14 — Privacy posture does not acknowledge extension-presence disclosure to lab origins — `minor`

**Current text** — `docs/agent_blueprint.md:452-458` (§8.1) covers queries, cookies, selector fetch, and ping. It does not mention that the four lab origins can tell Cogis is installed.

**Reality.** The WAR blocks expose `chrome-extension://<id>/lib/...` to the matched origins, and content scripts load those URLs on every lab page. Without `use_dynamic_url: true` the ID is stable, making Cogis detectable/fingerprintable by chatgpt.com, claude.ai, perplexity.ai, and gemini.google.com.

For a product whose pitch is privacy, this belongs in the posture — stated and accepted, not omitted. It is also directly relevant to the ToS posture in §8.2, since lab-side detection is the realistic enforcement vector.

**Correction** — add a §8.1 bullet:

```markdown
- **Extension presence is visible to the four lab origins.** Cogis exposes `lib/` modules
  to each lab via `web_accessible_resources`; those origins can therefore detect that the
  extension is installed. Cogis does not send them any additional identifier, query text,
  or cross-platform data. `use_dynamic_url` is not enabled in V1 (dev-unpacked); enabling
  it — and the resulting per-session resource URLs — is a prerequisite item to evaluate
  before any Chrome Web Store listing (§2, escalation #1).
```

---

### 1.15 — §11 testing table omits the orchestration-coverage gap the backlog already records — `minor`

**Current text** — `docs/agent_blueprint.md:711`:

```markdown
| Unit | vitest for pure JS: normalize, timeouts, cancel, selector merge reject-exec, message routing |
```

**Reality** — `docs/backlog.md:29` (BL-002):

```markdown
| BL-002 | open | **SW / popup orchestration tests** | Unit suite covers pure helpers + WAR graph; little/no direct `chrome.runtime` / `chrome.tabs` / popup watchdog coverage. Gap that hid timeout and tab races in review. |
```

A known gap that *already caused escaped defects* is invisible in the doc that describes the testing strategy. The blueprint reads as if cancel semantics are unit-covered; they are covered as pure helpers, not as service-worker behavior.

**Correction** — add a row and a note:

```markdown
| Unit (pure) | vitest: normalize, timeouts, cancel helpers, selector merge reject-exec, message shape |
| Unit (chrome-mocked) | Service-worker orchestration and popup watchdog against a mocked `chrome.runtime` / `chrome.tabs`: tab adoption, discarded tabs, wall expiry, supersede/cancel races. **Currently a known gap (BL-002)** — pure helpers are covered, the wiring is not. Add coverage whenever a PR touches the SW. |
| WAR graph | `tests/unit/war-coverage.test.js` — every adapter's transitive imports and `getURL()` literals are WAR-declared (§3.11) |
```

---

### 1.16 — `prefillSupported | boolean` is malformed type notation — `nit`

**Current text** — `docs/agent_blueprint.md:194`:

```markdown
- Pointer record: `{ platform, title, dateIso | null, deepLinkUrl | null, prefillSupported | boolean }`
```

`dateIso | null` reads as "string or null"; `prefillSupported | boolean` is a union with nothing on the left. **Correction** — match the implemented typedef (`extension/lib/messaging.js:30-37`):

```markdown
- Pointer record: `{ platform: string, title: string, dateIso: string|null, deepLinkUrl: string|null, prefillSupported: boolean }`
  — no snippet, body, or token fields, ever (§3.7, `FORBIDDEN_BODY_KEYS`).
```

---

### 1.17 — Vitest pin policy contradicts itself — `nit`

**Current text** — `docs/agent_blueprint.md:421,429`:

```markdown
Exact semver ranges are locked in `package-lock.json` at M1 scaffold. Blueprint pins the **stack identity** and minimum major lines:
...
| `vitest` | Unit tests | **3.x** (or current stable 2/3 at scaffold — pick one major and lock); lockfile pins exact |
```

"Pins the minimum major line" and "3.x or 2, pick one" cannot both hold; every other row states a single major. Since M1 has long shipped, replace the hedge with the fact. **Correction:**

```markdown
| `vitest` | Unit tests | **3.x** (locked at M1 scaffold; lockfile pins exact). Major bump = escalation #6. |
```

---

### 1.18 — Header status line predates the S7/M7 amendment — `nit`

`docs/agent_blueprint.md:9` says *"spikes S1–S6 resolved"* while §3.6.1, §9, and §10 M7 all carry S7. Folded into the 1.2 rewrite.

---

## 2. `docs/handoff-prompts.md`

### 2.1 — "Residual concerns go to the backlog, do not request changes" can absorb blueprint-AC violations — `major`

**Current text** — `docs/handoff-prompts.md:241`:

```markdown
- **Residual product or docs concerns go to `docs/backlog.md` with a `BL-0xx` ID. Do not request changes for them.** A review that keeps a PR open on a product preference has stopped being a review.
```

**Problem.** The intent is good — prevent bikeshed deadlock. But the rule has no carve-out for the one class of "product concern" that must block, and §6.2's blocking list (`:255-262`) says *"A violated blueprint behavioral AC"* is blocking without saying which rule wins when a finding is both.

The Perplexity Spaces outcome (finding 1.1) is what this ambiguity produces in practice: an unmet blueprint AC that is also a product-scope concern was routed to BL-021 and then promoted to an "accepted precedent" at `:244`, after which §6.1's no-re-litigation rule froze it. The process converted a Tier 4 escalation into settled precedent without a human ever ruling on the escalation.

**Correction** — amend `:241`:

```markdown
- **Residual product or docs concerns go to `docs/backlog.md` with a `BL-0xx` ID. Do not
  request changes for them.** A review that keeps a PR open on a product preference has
  stopped being a review.
  **Two carve-outs — a backlog row cannot absorb these:**
  1. **An unmet blueprint behavioral AC.** If the AC itself offers "or amend the blueprint"
     as an exit (e.g. M2 AC-5), the amendment must land **in the blueprint** before merge.
     A `BL-0xx` row is not an amendment.
  2. **Anything on the §12 escalation list** — notably #11 (dropping Projects/Spaces scope).
     These stop for a human ruling. A precedent recorded in §6.1 does not retroactively
     supply that ruling.
```

Add the same to §6.2's blocking list, and annotate the §6.1 precedents that are actually deferred escalations (BL-021 in particular) as *"deferred pending blueprint amendment"* rather than *"accepted."*

---

### 2.2 — SC-5's 403 rule is attributed to S5, which does not contain it — `major`

**Current text** — `docs/handoff-prompts.md:110` (SC-5):

```markdown
| SC-5 | **Auth mapping** — `401` ⇒ login copy; `403` ⇒ `unavailable` **unless** a login shell is detected (then login); the login-shell signal has a test |
```

Cited as inherited from S5 in two other places — `docs/agent_blueprint.md:699` (M7 AC-5, *"Auth mapping per S5"*) and `docs/spikes/s7-grok-history-contract.md:32`:

```markdown
Mapping rules are **not** TBD — they are inherited from S5 and are binding regardless of what this spike finds: `401` ⇒ login copy; `403` ⇒ `unavailable` **unless** a login shell is detected;
```

**Reality.** `docs/spikes/s5-auth-state-detection.md` contains no HTTP status mapping at all. Its per-platform tables (`:18-56`) list DOM and endpoint signals; the string "403" never appears. The nearest thing is S2's `:55` — *"Failure | 403/5xx on org or conversations → unavailable"* — which lacks the login-shell exception, and S1's `:74` — *"401/403 on backend-api → treat as login_required or unavailable per status"* — which is vaguer still and arguably contradicts SC-5 by permitting 403 → login_required unconditionally.

**Problem.** The binding rule has no authoritative home. Three docs cite S5 for text S5 does not contain, and the two spikes that *do* mention 403 disagree with SC-5 and each other. M7 will implement Grok auth mapping "per S5" and find nothing to implement against. This is a correctness rule — mislabeling 403 as logged-out sends users to a login page they are already past.

**Correction** — add the missing section to `docs/spikes/s5-auth-state-detection.md`, then leave the citations alone (they become accurate):

```markdown
## HTTP status mapping (binding, all platforms)

Applies to every adapter — endpoint-driven or DOM-driven — and overrides any looser
wording in a per-platform spike.

| Status | Outcome | Notes |
| --- | --- | --- |
| `200` + parseable payload | `authenticated` | Zero items ⇒ `empty`, **never** `login_required` |
| `401` | `login_required` | Unambiguous |
| `403` | `unavailable` | **Unless** a login shell is detected (redirect to a login URL, or the platform's logged-out markers below) — then `login_required`. Bare `403` is far more often entitlement/region/bot-block than logged-out. |
| `404` on a documented route | `unavailable` | Route drift, not an auth signal |
| `429`, `5xx` | `unavailable` | Never `empty` |
| Non-JSON / HTML where JSON expected | `unavailable` | Usually an interstitial or challenge page |
| Network error, abort, timeout | `timeout` | Never `empty` |

**The login-shell signal requires a test** (SC-5). Per-platform markers are in the tables
above; `s1:72`, `s2:53`, `s3:73`, `s4:52` supply them.

**A logged-out state must never surface as `empty`.**
```

Then reword S1's `:74` row to *"401 ⇒ login_required; 403 ⇒ unavailable unless a login shell is detected (S5 HTTP mapping)"* and extend S2's `:55` row the same way.

---

### 2.3 — §5.7 lets the implementing agent author the spike it will be graded against — `major`

**Current text** — `docs/handoff-prompts.md:211`:

```markdown
> **Task 1 — the spike, if it is still open.** ... your **first task** is to write a short spike finding from **live investigation** ... Commit that finding, then implement against it.
```

**Problem.** This inverts the control that makes the rest of the framework work. `docs/agent_blueprint.md:486` states spikes are Tier 3, *"owned by Human + Perplexity"*, and `:100` of the pre-blueprint is explicit: *"The agent may be commissioned to gather evidence; it does not own or close a spike on its own initiative."* Under §5.7 the agent authors the evidence, implements against it, and fills its own §3.1 self-check — three roles that were deliberately separated. If the agent misreads Grok's history surface, the spike, the implementation, and the evidence cells are wrong in the same direction, and dual review has no independent artifact to check against.

The blueprint does acknowledge the tension at `:677` and constrains it ("may not decide anything on the §12 escalation list"), and S7's stub is unusually well-armored — `docs/spikes/s7-grok-history-contract.md:9`, *"Fabricating a contract here is worse than leaving it open, because everything downstream treats this file as evidence."* Good instincts. But no gate enforces them.

**Correction** — add a human checkpoint between the two tasks:

```markdown
> **Task 1 — the spike, if it is still open.** ... Commit that finding **as its own commit,
> then stop and post the finding for human sign-off before writing adapter code.** The
> agent may *author* an S7 finding from live investigation; it may not *close* one — Tier 3
> ownership (blueprint §9) is unchanged. Sign-off is a two-minute read, and it is the only
> point at which a mis-read Grok surface can be caught before it is baked into the adapter,
> the fixtures, and the self-check table.
>
> Every field you did not observe live stays `TBD`, and `TBD` binds you to the honest
> default: no deep link, `title-match`, `unavailable` rather than `empty`. In the PR body,
> list which S7 fields you observed live and which remain `TBD` — an S7 field you filled in
> without observing it is an overclaim under §2.4.
```

Also flip `docs/spikes/README.md:13`'s S7 owner to reflect that M7-authored findings still require sign-off.

---

### 2.4 — Prettier-ignore claim is correct — no action

`docs/handoff-prompts.md:72` states *"`docs/` and `AGENTS.md` are Prettier-ignored; `README.md` is **not**."* Verified against `.prettierignore` (contains `docs/`, `AGENTS.md`, `LICENSE`, not `README.md`). Accurate. Noted because a docs review should confirm the claims that hold, not only the ones that fail.

---

### 2.5 — §3.1 self-check table has no row for the WAR invariant — `minor`

**Current text.** SC-1 … SC-14 (`:106-119`) cover honesty, auth, caps, tab adoption, cancel, privacy. Nothing covers `web_accessible_resources`, despite every platform milestone adding a WAR block and M7 explicitly requiring one (`docs/agent_blueprint.md:684`).

**Problem.** WAR breakage is silent in unit tests unless `tests/unit/war-coverage.test.js` is extended for the new platform — and nothing in the checklist tells the implementer to extend it. A missing WAR entry manifests as a runtime dynamic-import failure on the lab page, which surfaces as a generic `unavailable` chip.

**Correction** — add:

```markdown
| SC-15 | **WAR coverage** — the new platform's adapter and every module in its transitive import graph are listed in a `web_accessible_resources` block whose `matches` is narrowed to that platform's origins only; `tests/unit/war-coverage.test.js` extended and passing; no wildcard `resources`, no widened `matches` (escalation #8) | |
```

---

### 2.6 — §8 operator smoke has no step for the M5/M6 surfaces — `nit`

The smoke list (`:320-327`) covers US-1/2/3/6/7, click cascade, container scope, and console `errorCode` — all platform behaviors. Nothing verifies the debug panel opens, shows the pack version, and has ping off; nothing verifies the extension still searches with `cogis.ai` unreachable (the M5 fail-closed path, which in dev-unpacked is the *normal* path since the host likely serves nothing). Add two lines:

```markdown
- Debug panel opens; per-platform latency/hit-count/status and selector pack version render; ping toggle reads **off**
- Search still works with the selector-pack host unreachable (M5 fail-closed to the bundled pack)
```

---

## 3. `docs/backlog.md`

### 3.1 — BL-001 is `open` in the table and `done` in the changelog — `major`

**Current text** — `docs/backlog.md:28` vs `:79`:

```markdown
| BL-001 | open | **Tab close on cancel race** | ... Pass-2 in flight: cancel-by-`searchState` + epoch freshness + close orphans not in newer `state.tabs`. Keep open until verify-only + operator smoke. |
```
```markdown
| 2026-07-30 | BL-001 tab litter / supersede close race + BL-020 per-lab collapse marked done (hotfix branch). |
```

BL-020 was updated in both places (`:43` shows `done`); BL-001 was updated only in the changelog. The repo state supports "done" — HEAD is `e3db651 Merge pull request #20 from dsergovic/feature/undo-sticky-footer`, and the epoch/`searchState` machinery described as "pass-2 in flight" is present in `extension/background/service-worker.js`.

**Problem.** BL-001 is a tab-lifecycle resource leak. Leaving it `open` means the next agent may re-fix a fixed race in code it does not fully understand — a genuinely risky redundant change.

**Correction** — `:28`:

```markdown
| BL-001 | done | **Tab close on cancel race** | Fixed on the 2026-07-30 hotfix branch: cancel-by-`searchState` + epoch freshness + close orphans absent from a newer `state.tabs`. Covered by `tests/unit/tab-lifecycle.test.js`. Operator smoke passed. |
```

### 3.2 — "Last updated" predates the newest changelog entry — `nit`

`:8` reads `**Last updated:** 2026-07-29`; the changelog's newest row (`:79`) is `2026-07-30`. Set to `2026-07-30`, or drop the field and let the changelog be the single source.

### 3.3 — Binding scope reductions live in a file that disclaims authority — `major`

**Current text** — `docs/backlog.md:3-5`:

```markdown
Open follow-ups that are **not** binding Phase 1 blueprint work.
Pick up during polish, the next natural milestone, or a short fix branch.
Do **not** treat this file as agent context unless the operator attaches it.
```

**Problem.** This header is now false for a subset of its own contents. BL-021 (Spaces gated off), BL-022 (Claude Projects routes unconfirmed), BL-023 (Claude DOM fallback dropped), and BL-024 (soft ceilings authorize `empty`) are not "follow-ups" — they are **product-scope and honesty decisions currently in force in shipped code**, and `docs/handoff-prompts.md:242-248` elevates them to binding review precedents. Meanwhile the file tells agents not to read it unless attached.

The result: an agent handed the blueprint alone reads §4.3 and believes Spaces works. An agent handed the backlog too reads BL-021 and believes it does not. Both are following instructions.

**Correction** — split the file's authority explicitly:

```markdown
Two kinds of rows live here — check which you are reading.

**Deferred work (advisory).** Ordinary follow-ups. Not binding; pick up during polish or
the next natural milestone.

**Shipped-scope decisions (binding).** Rows marked **[SCOPE]** record a product decision
already in force in shipped code and treated as a review precedent by
`docs/handoff-prompts.md` §6.1. These are **not** optional context: every one of them must
also be reflected in `docs/agent_blueprint.md`, and a `[SCOPE]` row whose blueprint
amendment is missing is a documentation defect, not a backlog item. Current `[SCOPE]`
rows: **BL-021**, **BL-022**, **BL-023**, **BL-024**.

Attach this file for any milestone or fix branch touching a lab adapter.
```

Then mark those four rows `[SCOPE]` and confirm each has a matching blueprint amendment (per finding 1.1, BL-021 does not).

---

## 4. `docs/cogis-ai-search-pre-blueprint.md`

Declared immutable at `docs/agent_blueprint.md:8` (*"v0.2.0 (locked; do not re-litigate)"*), so findings are limited to places where immutability now misleads.

### 4.1 — Immutable Phase 0 doc now contradicts the live spec on platform count — `minor`

**Current text** — `:58` and `:166`:

```markdown
Four platforms in V1: **ChatGPT, Claude, Perplexity, Gemini.**
```
```markdown
- **Additional platforms** beyond the V1 four (DeepSeek explicitly not on this list — see §4).
```

Blueprint 0.3.0 (`:217`) amended this: *"the V1 matrix is these four labs **+ Grok (M7)**."* A locked document cannot be edited, but it can carry a pointer — otherwise "locked; do not re-litigate" reads as "Grok is out of scope," which is the opposite of the human-approved amendment.

**Correction** — add a header note (a superseded-by marker is a status change, not a re-litigation):

```markdown
> **Superseded in part.** This Phase 0 artifact is locked as a historical input. Where it
> conflicts with `docs/agent_blueprint.md`, the blueprint wins. Known divergences as of
> blueprint 0.3.0: §5/§14 platform count (blueprint §4.1 adds **Grok** at M7 via the
> human-approved §10 M7 amendment); §13's "nightly smoke test the extension runs against
> itself" (blueprint §11 downgrades this to an aspirational manual checklist, not a CI gate).
```

### 4.2 — §3 data flow describes content-script-first; blueprint locks endpoint-first — `nit`

`:36-37` describes the service worker fanning out *"to per-platform content scripts … Each content script drives the target lab's own search UI (or, where available, a first-party endpoint …)"*. Blueprint §3.2 (`:53-56`) inverts the preference to endpoint-first, and three of four shipped adapters are endpoint-based. §7 of the same pre-blueprint (`:82`) already states the correct preference order, so this is an internal inconsistency in the Phase 0 doc rather than a live conflict. Covered by the 4.1 superseded-by note; no separate edit needed.

---

## 5. `docs/spikes/README.md`

### 5.1 — Index repeats the "selector drift only" overstatement — `major`

`:15` — *"Residual risk is limited to brittle CSS selectors and occasional endpoint param drift — handled as M-milestone first-task codified tests + M5 selector pack, not as open product questions."*

Same defect as finding 1.8, in the file most likely to be skimmed as a summary. BL-021 and BL-022 are unconfirmed *routes*, i.e. open contract questions. **Correction** — apply the two-category residual-risk split from finding 1.8 here verbatim.

### 5.2 — Status column should carry the confidence qualifiers — `minor`

Rows `:7-12` all read "Resolved (…)" while the underlying files carry Medium and Low–Medium confidence on the parts that matter (S1 headers/selectors, S2 Projects API, S3 Spaces shape, S4 search API). Surface it in the index so a skim cannot mislead:

```markdown
| S2 Claude Recents contract | [s2-…](./s2-claude-recents-contract.md) | Resolved — strategy locked. **Medium confidence:** Projects routes inferred, not observed (BL-022) | 2026-07-28 |
| S3 Perplexity thread contract | [s3-…](./s3-perplexity-thread-contract.md) | Resolved — endpoint-first. **Medium confidence:** Spaces enumeration unproven; gated off (BL-021) | 2026-07-28 |
| S4 Gemini history contract | [s4-…](./s4-gemini-history-contract.md) | Resolved — DOM-first. **Low–Medium confidence:** selectors stub-level (BL-025) | 2026-07-28 |
```

---

## 6. `docs/spikes/s1-chatgpt-search-contract.md`

### 6.1 — 401/403 guidance is vaguer than the binding rule and permits the wrong mapping — `major`

**Current text** — `:74`:

```markdown
| Logged in but failing | 401/403 on backend-api → treat as login_required or unavailable per status |
```

"per status" is undefined, and lumping 401 with 403 permits exactly the mapping SC-5 forbids (403 → logged-out with no login shell). Same root cause as finding 2.2. **Correction:**

```markdown
| Logged in but failing | Per the S5 HTTP status mapping: `401` ⇒ `login_required`; `403` ⇒ `unavailable` **unless** a login shell is detected (`data-testid="login-button"`, or redirect to a sign-in URL) ⇒ then `login_required`; `429`/`5xx`/non-JSON ⇒ `unavailable`. Never `empty`. |
```

### 6.2 — Residual risk #1 is resolved in code but still listed as open — `minor`

`:87` — *"Search query param name (`query` vs `q`) … may drift — pin via fixture after first successful live capture."* Resolved: `extension/lib/selectors/local-pack.json:19` carries `"searchQueryParams": ["query", "q"]`, handling both. Annotate:

```markdown
1. ~~Search query param name (`query` vs `q`)~~ — **handled**: the pack tries both
   (`searchQueryParams: ["query","q"]`, `local-pack.json:19`). Response field-name drift is
   still open; pin via redacted live fixture (**BL-003**).
```

### 6.3 — Token-handling line is the right instinct, stated too weakly — `minor`

`:16` — *"Never persist token outside the page/session worker memory for the request."* Awkward and narrower than needed. Align with the §3.7 rewrite in finding 1.6:

```markdown
| **Auth** | Session cookies on `chatgpt.com` → `GET /api/auth/session` yields `accessToken` for `Authorization: Bearer …` on backend-api calls. The token is **request-scoped memory only**: never stored, never logged, never placed in a message payload, pointer record, ping, or fixture, and never sent to any origin but `chatgpt.com`. |
```

### 6.4 — DoD is fully checked while confidence is Medium — `nit`

`:92-99` shows every box ticked; `:5` says *"Medium on exact DOM selectors / request headers (confirm in M1 live run)."* Add an unchecked box so the state is visible: `- [ ] Live selector/header capture confirmed on a logged-in account (BL-003)`.

---

## 7. `docs/spikes/s2-claude-recents-contract.md`

### 7.1 — Auth predicates omit 401 and mishandle 403 — `major`

**Current text** — `:55`:

```markdown
| Failure | 403/5xx on org or conversations → unavailable |
```

No 401 row at all, and no login-shell exception on 403. Since Claude hard-redirects `/` → `/login` when logged out (`:17`), the login-shell signal is unusually reliable here and should be named. **Correction:**

```markdown
| Logged out | Location `/login`; “Continue with Google/email”; no chat shell; **`401` on organizations or conversations** |
| Failure | `403` ⇒ `unavailable` **unless** a login shell is detected (redirect to `/login`) ⇒ then `login_required`; `429`/`5xx`/non-JSON ⇒ `unavailable`. Never `empty`. See the S5 HTTP status mapping. |
```

### 7.2 — Residual risk #2 is still unconfirmed after M3 shipped — `major`

`:60` — *"Projects API path names need live confirmation."* Still true: BL-022 (`docs/backlog.md:45`) records the directory and `…/projects/{id}/conversations` routes as **inferred**. M3 shipped against inferred routes.

To the implementation's credit this was handled honestly — `extension/lib/claude-adapter.js:242` gates the `empty` chip on established coverage, and `local-pack.js:66` documents the ladder — so it is not a false-`empty` defect. But `docs/agent_blueprint.md:608` (M3 AC-4) reads flatly *"**Projects** included per S2"*, which claims more than was proven, and §4.3 lists Claude Projects as delivered V1 scope. Same shape as finding 1.1, one degree less severe because the code is honest at runtime.

**Correction** — annotate S2 and qualify M3 AC-4 in the blueprint:

```markdown
2. **Projects API path names need live confirmation — STILL OPEN after M3 (BL-022).**
   `GET /api/organizations/{orgId}/projects` and `…/projects/{id}/conversations` are
   inferred from third-party clients, not observed. M3 ships against them behind an honest
   coverage signal: unconfirmed or failed Project coverage yields `unavailable`/`timeout`,
   never `empty`. **Project-only findability is unverified.** Confirm in the Network tab on
   a logged-in account, then tighten this finding, the README, and blueprint M3 AC-4.
```

Blueprint `:608`:

```markdown
4. **Projects** attempted per S2, behind an honest coverage signal. Project-only findability
   is **unverified** pending live route confirmation (**BL-022**); unproven coverage resolves
   to `unavailable`/`timeout`, never `empty`.
```

### 7.3 — Capability label hedge is unresolved — `nit`

`:12` — *"treat as title/preview unless live probe upgrades."* Shipped as `title-match` (`extension/lib/platforms.js`, capability `'title-match'`), matching the review brief's "Claude title-match under review." No live probe has been run. Add a line so the hedge does not linger indefinitely: *"Not probed as of M3; `title-match` stands. Upgrading the label requires a live probe plus a human-amended finding (blueprint §4.2) — an implementer may not upgrade it."*

---

## 8. `docs/spikes/s3-perplexity-thread-contract.md`

### 8.1 — M2 acceptance clause was not honored and the file still reads as binding — `blocking` (same defect as 1.1)

**Current text** — `:58`:

```markdown
**M2 acceptance:** must find a thread that exists only in a Space **or** document a hard platform limitation with blueprint amendment. Implementer tries C then A then B; choice among working strategies is Tier 2 only after one works; “give up on Spaces” is Tier 4.
```

Neither branch was taken; Spaces was gated off and filed as BL-021. **Correction** — record the outcome in the spike so the next reader is not misled:

```markdown
**M2 acceptance — OUTCOME (2026-07-29).** Neither branch was completed during M2. Ladder C
(`search_term` covering Space threads) was not live-confirmed and ladders A/B were not
attempted, so Space-thread enumeration ships **gated off**
(`SPACE_THREAD_ENUMERATION_ENABLED = false`) rather than as an unproven probe — see
**BL-021**. Space-only threads are **not findable** in V1.

Under escalation #11 this required a blueprint amendment; see blueprint §4.3. Re-enabling
requires a **live-proven** route, is Tier 3, and is not an implementer choice. The original
ladder below stands as the plan for whoever picks BL-021 up.
```

### 8.2 — `x-app-apiversion: 2.18` will age out; note where it is pinned — `minor`

`:17` and residual `:79` correctly flag drift, but neither says where the value lives now, so the next maintainer has to hunt. Add: *"Pinned in the data-only pack (`extension/lib/selectors/local-pack.json`), so a version bump is a pack change, not an extension release (blueprint §3.10)."*

### 8.3 — Auth predicate lacks the 403 row — `minor`

`:75` covers only *"Non-auth 5xx / HTML error page → unavailable."* Add the S5 mapping reference, as in 6.1/7.1. Perplexity is the platform most likely to return 403 from bot detection on rapid POST (its own residual #4, `:82`), so mapping it to logged-out would be actively wrong.

---

## 9. `docs/spikes/s4-gemini-history-contract.md`

### 9.1 — Selector hints are stub-level and the file does not say so — `minor`

`:11` locks DOM-first, but the only concrete selector in shipped code is `a[href*="/app/"]` (`docs/backlog.md:48`, BL-025: *"Pack selectors are stub-level"*). S4 lists no selectors at all, so a reader assumes they were characterized. On the thinnest, churniest platform that assumption is expensive.

**Correction** — add after `:15`:

```markdown
### Selector status (post-M4)

S4 was authored from a **logged-out** session, so no logged-in history-rail selectors were
captured. M4 ships stub-level selectors (`historyItem: a[href*="/app/"]`) in the data-only
pack. Confirm against a logged-in personal account and tighten the pack — **BL-025**. The
honesty rules do not move: an unreached or unproven scan is `unavailable`/`timeout`, never
`empty` (`extension/lib/gemini-adapter.js`, `geminiCoverageEstablished`).
```

### 9.2 — Auth predicate is the weakest of the four and is the one most likely to false-positive — `minor`

`:52` — logged-in is *"History rail without sign-in upsell **or** account chip present."* On Gemini a *logged-in user with zero history* and a *logged-out user whose upsell failed to render* can both present as "no rail, no upsell." S5 already warns *"capture a positive owner signal, not merely 'no sign-in button'"* (phrased in S7 `:29`, and the same principle applies here). The code hedges correctly (`coverage = 'rail_missing'` → not `empty`), but the spike should state the requirement:

```markdown
| Logged in | **Positive owner signal required** — account chip/avatar, or a populated history rail. "No sign-in CTA" alone is **not** sufficient: a logged-in zero-history account and a logged-out page with an unrendered upsell look identical. Absent a positive signal, coverage is unproven ⇒ `unavailable`, never `empty`. |
```

### 9.3 — Residual risk #3 has a shipped mitigation path not recorded — `nit`

`:60` (multi-account chooser) is tracked as BL-026 with a concrete idea — *"prefer active Gemini tab's account chip over opening a new tab"* (`docs/backlog.md:49`). Cross-reference it from the spike so the two do not drift.

---

## 10. `docs/spikes/s5-auth-state-detection.md`

### 10.1 — Missing the HTTP status mapping that three other documents cite it for — `blocking`

This is the highest-leverage single fix in the review. S5 is the named authority for auth mapping in `docs/handoff-prompts.md:110` (SC-5), `docs/agent_blueprint.md:699` (M7 AC-5), and `docs/spikes/s7-grok-history-contract.md:32` — and it does not contain the rule. Full correction text is in finding 2.2; adding that one section to S5 resolves 2.2, 6.1, 7.1, and 8.3 at the source.

Rated `blocking` rather than `major` because M7 is the next milestone, it is DOM-first on an unknown surface, and its AC-5 instructs the implementer to follow a rule that does not exist in the file it points to.

### 10.2 — Three-outcome model has no slot for `timeout`, which the UI has — `minor`

**Current text** — `:8-14`:

```markdown
Use three outcomes per platform adapter before/during search:

| `authenticated` | Session can attempt search | (none — proceed) |
| `login_required` | Clearly logged out | Please log in to {Platform} + link |
| `unavailable` | Ambiguous failure / 5xx / DOM break | {Platform} is temporarily unavailable |
```

But `docs/agent_blueprint.md:277` defines seven group states including `timeout`, and the code distinguishes them (`wall_timeout` vs other error codes). S5's three-outcome framing pushes implementers to collapse timeout into `unavailable`, losing the diagnosability SC-10 requires. **Correction** — add a fourth row:

```markdown
| `timeout` | Platform budget (8s) or wall (15s) expired before a terminal answer | {Platform} is temporarily unavailable (distinct `errorCode`: `platform_timeout` / `wall_timeout`) |
```

and note: *"`timeout` and `unavailable` share user-facing copy but must stay distinct in `errorCode` — operator smoke depends on telling a hung platform from a broken one (SC-10)."*

### 10.3 — "Do not treat zero hits as login_required" deserves its converse — `nit`

`:16` states one direction. The failure that actually shipped elsewhere is the other one. Add: *"Equally: never treat a logged-out or unproven-coverage state as `empty`. `empty` means the adapter completed a full scan of its authorized window and matched nothing."*

---

## 11. `docs/spikes/s6-long-history-reach.md`

### 11.1 — Rule 2 contradicts SC-2 on whether the user is told about truncation — `major`

**Current text** — `:18`:

```markdown
2. Partial results are success; note truncation only in debug (M6).
```

Against `docs/handoff-prompts.md:107` (SC-2): *"the group reports those hits (**with a partial/truncation signal**)."* One says debug-only, the other says the group reports it. Root cause of finding 1.3. **Correction** — once §4.7 gains the coverage flag:

```markdown
2. **Partial results are success.** If any authorized page or container returned hits,
   return them — never a blanket `unavailable`. A truncated scan is reported to the user as
   `ready` + `coverage: 'partial'` (blueprint §4.7), with the specific `errorCode` visible
   in the console and the M6 panel. "Success" does not mean "silent": the user must be able
   to tell "top N of many" from "N total".
```

### 11.2 — Claude row is "Partial / unknown" and stayed unknown — `minor`

`:12` — *"**Partial / unknown** at desk … Prefer paginated API if available; else scroll-with-budget then search filter."* M3 shipped with soft caps (root ~100, per-project ~60, per BL-024) that authorize `empty` by design. That is a material reach limit absent from the matrix everyone consults for reach questions. **Correction:**

```markdown
| **Claude** | **Yes** via paginated `chat_conversations` (confirmed in M3) | No for the endpoint path | Breadth-first across root + Projects. **Soft caps: root ~100, per-project ~60** — a fully scanned window up to the cap with zero matches is `empty` **by design** (documented platform limit, BL-024). Failure/budget truncation is **not** `empty`. |
```

### 11.3 — Rule 3 wording invites the misreading it means to prevent — `nit`

`:19` — *"'Chat older than N days not found' is **not** automatically `unavailable` if the adapter completed cleanly with empty/partial hits."* Correct but phrased as a licence not to report `unavailable`, which reads as encouragement toward `empty`. Tighten: *"A chat beyond the reach ceiling is a **documented platform limit**, not a failure: a cleanly completed scan reports `empty` (or `partial` with hits). This licence applies **only** to a scan that completed. A scan cut short by error, budget, or an unreached container has not completed and must report `unavailable`/`timeout`."*

---

## 12. `docs/spikes/s7-grok-history-contract.md`

The strongest document in the set. The anti-fabrication framing at `:7-9` — *"A `TBD` field is not a default to code against — it is a question"*, *"Fabricating a contract here is worse than leaving it open, because everything downstream treats this file as evidence"* — is exactly right, and the unchecked DoD at `:53-62` correctly withholds authority. Two findings only.

### 12.1 — Inherits the S5 citation defect — `major` (fixed by 10.1)

`:32` asserts the 401/403 mapping is *"inherited from S5 and … binding regardless of what this spike finds."* S5 contains no such mapping (finding 10.1). The rule as stated in S7 is correct — S7 is currently the **only** place in the repo where the binding 403 rule is written down in full. Once S5 gains the section, reduce S7 to a pointer so there is one source:

```markdown
Mapping rules are **not** TBD — the **S5 HTTP status mapping** section binds regardless of
what this spike finds. Do not restate it here; follow it.
```

### 12.2 — Origin list should require recording redirect chains, not just the final origin — `minor`

**Current text** — `:15`:

```markdown
| **Origin(s)** | **TBD.** Candidates to check live: `grok.com`, `grok.x.ai`, `x.com` (Grok surfaced inside X). Record which origin actually serves the history UI and which ones only redirect — `host_permissions` must be narrow, and a redirect target is not automatically a permission we need. |
```

Good instinct, but for Grok specifically it is worth going further: `x.com` is a high-traffic social origin, and if Grok's history is served there, a `host_permissions` entry plus a WAR block on `x.com/*` grants Cogis content-script reach across the entire site. That is a materially larger blast radius than `chatgpt.com` or `claude.ai`, and it is close enough to escalation #8's spirit ("host permission widening to unrelated origins") to deserve a human ruling rather than a spike outcome.

**Correction** — extend the row:

```markdown
| **Origin(s)** | **TBD.** Candidates: `grok.com`, `grok.x.ai`, `x.com`. Record the full
redirect chain, not just the endpoint: which origin serves the history UI, which only
redirect, and whether history is shared across them. `host_permissions` and the WAR block
cover **only** the serving origin — a redirect target is not a permission we need.
**Escalation:** if the history surface turns out to be served from `x.com` (or another
general-purpose, non-Grok-dedicated origin), **stop and escalate** before adding the host
permission. Granting Cogis content-script and WAR reach across an entire social platform is
a different risk posture from a dedicated lab origin, and it is escalation #8 territory —
not an S7 outcome the agent may decide. |
```

---

## Overall summary

### What is genuinely good

The security work is real and the docs mostly earned it. Verified in code, not just claimed:

- **No XSS surface.** Zero `innerHTML` / `outerHTML` / `insertAdjacentHTML` / `document.write` in `extension/`. Lab-controlled titles render via `textContent` (`popup.js:194`), and every `href` is built from a hardcoded `https://` origin with `encodeURIComponent` (`results.js:65,169,315,445`) — a hostile lab payload cannot inject a `javascript:` URL into a privileged popup.
- **No remote code path.** `eval` and `new Function` appear only as *forbidden key strings* in the pack validator (`loader.js:13-26`). The remote pack is fetched with `credentials: 'omit'`, a 1.5s abort, hostname re-validation, a recursive forbidden-key scan, an allowed-overlay-key list, and same-host URL validation — failing closed to the bundled pack on every error path. This is a careful implementation of blueprint §3.10.
- **Privacy holds.** `chrome.storage` holds exactly one boolean (`{ pingOptIn }`, `debug-prefs.js:23-32`). `PING_ENDPOINT_URL = null` (`ping.js:8`). Query text never reaches storage or the network. `FORBIDDEN_BODY_KEYS` drops body and token fields at the normalizer.
- **Cancellation is sound.** requestId tracker + `AbortController` + an `emitIfActive` gate (`service-worker.js:347-351`) that drops superseded chunks before they reach the popup, plus a popup-side watchdog.
- **The honesty discipline is unusual and worth preserving.** `coverage`/`empty` separation, `errorCode` on every non-hit state, "unproven ⇒ `unavailable`, never `empty`" enforced in adapter code. S7's anti-fabrication stub and §2.4's anti-overclaiming rules are the best-written parts of the corpus.

I found **no exploitable vulnerability**. The `_sender` omission (1.5) is currently unreachable because no `externally_connectable` is declared; I have flagged it as a spec gap that becomes live the moment §14's `postMessage` bridge is built, not as a present bug.

### What is actually wrong

Every significant finding is **spec integrity**, and they share one root cause: *the docs stopped tracking the code at the M1/M2 boundary, and the process that was supposed to catch that routed the divergences into a file that disclaims authority.*

The chain is visible end to end. The blueprint says Spaces is real V1 scope (§4.3). M2 could not prove the route. Escalation #11 says dropping it needs a human ruling plus an amendment. Instead it became BL-021 in a backlog headed *"not binding … do not treat this file as agent context"*, then an "accepted precedent" in `handoff-prompts.md` §6.1, where the no-re-litigation rule froze it. Three documents now disagree about whether Cogis searches Perplexity Spaces, and the blueprint — the accepted delivery spec — is the one that is wrong.

The same shape, one degree milder, produced BL-022 (Claude Projects shipped against inferred routes while M3 AC-4 reads "Projects included"). And a variant produced the S5 gap: a binding auth rule that three documents cite to a file that never contained it, which M7 is about to implement against.

Blocking findings:

| # | Finding | File |
| --- | --- | --- |
| 1.1 / 8.1 | Perplexity Spaces scope dropped without the amendment escalation #11 requires; blueprint still claims it | `agent_blueprint.md`, `s3-…md` |
| 10.1 | S5 lacks the 401/403 HTTP mapping that SC-5, M7 AC-5, and S7 all cite it for | `s5-auth-state-detection.md` |

### Recommendation

**Do not hand off M7 against these docs as they stand.** M7 is DOM-first on an unknown surface with an agent-authored spike — the configuration most dependent on the written rules being correct — and it is instructed to follow an auth-mapping rule that does not exist in the file it is pointed at (10.1), against a state model that cannot express the truncation its self-check demands (1.3), with a WAR contract that is nowhere specified (1.4) on origins that may include `x.com` (12.2).

Suggested sequence, roughly half a day of documentation work and no code changes:

1. **Add the HTTP status mapping section to S5** (finding 2.2 text). One edit; resolves 2.2, 6.1, 7.1, 8.3, 12.1. Do this first — it unblocks M7.
2. **Amend blueprint §4.3 for Spaces** (1.1) and qualify M3 AC-4 for Claude Projects (7.2). This is a human ruling on a deferred escalation, not an edit an agent should make alone.
3. **Reconcile blueprint status, version, changelog, and §3.3 tree** (1.2, 1.7). Add the per-milestone changelog rows that `handoff-prompts.md:54` has always required.
4. **Decide the truncation question once** (1.3) — add the `coverage` flag to §4.7, reword S6 rule 2, and SC-2/SC-4 become checkable instead of aspirational.
5. **Write the WAR contract as §3.11** (1.4) and add SC-15 (2.5) before M7 adds a fifth WAR block.
6. **Close the process hole** (2.1, 3.3): backlog rows cannot absorb unmet ACs or escalation-list items; mark the four `[SCOPE]` rows and verify each has a blueprint amendment.
7. **Add the S7 human sign-off checkpoint** (2.3) before M7 starts.
8. Sweep the remaining minors and nits.

Items 1–2 are the ones I would gate M7 on. The rest can land alongside it.

One closing note on posture. It would be easy to read this review as harsh on a project that is, by the standards of most browser extensions handling authenticated sessions, unusually disciplined — the honesty rules, the fail-closed pack loader, and the anti-overclaiming culture in §2.4 are genuinely better than typical. The findings are concentrated in the docs precisely *because* the code kept its promises while the documents drifted. The fix is bookkeeping, not redesign.
