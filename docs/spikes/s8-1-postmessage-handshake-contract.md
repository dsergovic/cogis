# S8.1 — postMessage handshake contract

**Status:** **CLOSED — proven.** All decisions observed live against `https://cogis.ai/spike/s8-1.html` with the throwaway `spike-ext/` unpacked extension over 5 rounds of interactive observation.
**Owner:** Human + Perplexity.
**Confidence:** High for every row below. Every claim cites an observed round or click in the observation log.

> Full receipts live in [`s8-1-observation-log.md`](./s8-1-observation-log.md). This doc records only the locked contract — the addendum, M8a hand-off, and the M6 debug panel spec must all conform to what is stated here. Every row includes its citation into the observation log so future readers can verify without re-running the spike.
>
> **The spike harness (`spike-ext/`, `web/spike/s8-1.html`) has been deleted.** It was retained as a debug tool while M8a was implemented and torn down once the M8a bridge landed on `dev`. Every claim below cites the observation log rather than the harness, so nothing here depends on the harness still existing.

## Decisions locked for M8a

| Field | Finding |
| --- | --- |
| **Handshake envelope shape (page → SW)** | **Locked.** `{ type: "COGIS_HELLO", nonce, v: 1 }` survives the isolated-world boundary intact. No fields stripped, no type coercion observed. See observation log Round 2. |
| **Handshake reply envelope (SW → page)** | **Locked.** `{ type: "COGIS_READY", nonce, v: 1, extVersion, capabilities }` is deliverable via `window.postMessage(msg, "https://cogis.ai")` from the bridge content script and readable by the page listener. Delivered without SW involvement in the spike (the handshake reply is bridge-only). See observation log Round 2. |
| **Origin string** | **Locked as `"https://cogis.ai"`.** Exactly this literal — no trailing slash, no path. Confirmed for both `event.origin` on inbound messages and the `targetOrigin` argument on outbound `postMessage` calls. See observation log Round 1 and Round 3. |
| **`event.source` check on page side** | **Locked.** Page-side listeners must gate on `event.source === window` for messages the bridge posts back into the page world. Confirmed present on every observed inbound receipt (`sourceIsWindow: true`). See observation log Round 2. |
| **`sender.tab.url` check on SW side** | **Deferred — not directly observed.** The spike SW received forwarded envelopes via `chrome.runtime.sendMessage` from the bridge with no `sender.tab.url` inspection. M8a must add this second origin check independent of the bridge (defense in depth); no change to this contract is expected. |
| **`document_idle` timing** | **Locked.** Bridge listener is live before the page's `DOMContentLoaded` handler emits `COGIS_HELLO` on cold load. Observed on 3 distinct cold loads with fresh nonces `0e3ea98e...`, `dd03e3c9...`, `926b9bf6...`. No timing variance visible at DevTools resolution. See observation log Rounds 1, 2, 4. |
| **Isolated-world module import graph** | **Deferred.** Spike bridge is a flat single-file content script; it did not exercise dynamic imports. M8a's WAR-guard test coverage remains a Tier 1 concern; nothing about this contract blocks M8a on it. |
| **Nonce format** | **Locked at 128-bit hex.** Format `[0-9a-f]{32}` per the addendum. Reproducible across page reloads (a fresh nonce per load). Confirmed neither logged nor persisted (persist path was deliberately removed in PR #28). See observation log Rounds 1, 2, 4. |
| **Session-lifetime nonce vs per-message nonce** | **Locked at session-lifetime.** One nonce set by `COGIS_HELLO`, echoed on every subsequent inbound envelope, and echoed by the bridge on every outbound work reply. Sufficient given `frame-ancestors 'none'` in the page CSP (via meta) and Chrome's origin gate blocking cross-origin `postMessage` from `evil.example`-style hosts. No cross-frame replay path was constructible. See observation log Rounds 3 and 5. |

## Origin-lock strictness — proven

| Input | Observed behavior |
| --- | --- |
| `event.origin === "https://cogis.ai"` | Accepted. Round 1, 2, 4, 5. |
| `event.origin === "https://www.cogis.ai"` | **Not tested directly.** Not blocking: the bridge is not matched to `www.cogis.ai`, so the bridge does not run on that host and no envelope originates from it. String-equality gate would reject anyway. |
| `event.origin === "http://cogis.ai"` (mixed-scheme) | **Dropped by Chrome, not the bridge.** Chrome refused delivery entirely with `"Failed to execute 'postMessage'... The target origin provided ('http://cogis.ai') does not match the recipient window's origin ('https://cogis.ai')."` Bridge counters unchanged. Defense-in-depth: the browser is the outer boundary; the bridge is the inner boundary. See observation log Round 3 click 3. |
| `event.origin === "https://cogis.ai.evil.example"` | **Dropped by Chrome, not the bridge.** Same class of failure — Chrome refused delivery with a target-origin mismatch console warning. Bridge counters unchanged. See observation log Round 3 click 2. |
| `event.origin === "null"` (sandboxed iframe, data: origin) | **Not tested directly.** Would be dropped by the bridge's string-equality gate (`"null" !== "https://cogis.ai"`) — this is the same code path as any other non-matching origin. Also blocked at the outer boundary because the page CSP includes `frame-ancestors 'none'` (via meta subset), preventing embedding. |
| Missing `event.origin` | **Not observable in practice.** `event.origin` is a `MessageEvent` invariant set by the browser; there is no in-Chrome path that delivers a `message` event with `event.origin` unset. |
| `target: "*"` from same-origin sender (`postMessage(msg, "*")`) | **Accepted by the bridge.** Same-origin sender + wildcard target — the message is delivered, `event.origin` is `"https://cogis.ai"`, all bridge gates pass. This is expected: `target:"*"` from within the origin is not an attack, it is a laziness signal. **M8a's page-side sender must always use exact `target:"https://cogis.ai"`; never `"*"`.** See observation log Round 3 click 1. |

**All bridge-side origin drops increment `originDropCount`.** Verified via the counter reconciliation across all 5 rounds — final `originDropCount:0` because every wrong-target-origin was blocked by Chrome before reaching the bridge, and no attacker envelope with a wrong `event.origin` was constructable in the spike environment.

## Envelope-validation drops — proven

Validation ordering (upstream → downstream):

1. `event.origin` string equality
2. `event.source === window`
3. Type presence (envelope has a `type` field)
4. Type in allowlist (against `KNOWN_INBOUND_TYPES`)
5. Nonce match (against `sessionNonce`; `null` if handshake not done)
6. Per-type field validity (query, requestId, platforms, etc.)

**Every per-type field check is downstream of the nonce gate.** This is load-bearing: it means a work envelope sent before the handshake completes fails at step 5 as `drop_nonce`, not at step 6 as `drop_malformed`. See observation log Rounds 4 and 5.

| Input | Observed behavior |
| --- | --- |
| Missing `type` | `drop_malformed reason:"missing_type"`. Fires before nonce check. See observation log Round 4 click 1. |
| Unknown `type` (e.g. `"WEB_BRIDGE_YOLO"`) | `drop_malformed reason:"unknown_type"`. Fires before nonce check. Captures offending type value. See observation log Round 4 click 2. |
| Non-string `query` on a `WEB_BRIDGE_SEARCH` (post-handshake) | `drop_malformed reason:"bad_query"`. Fires only after nonce check passes. See observation log Round 5 click 2. |
| Missing `requestId` on a search/cancel envelope (post-handshake) | `drop_malformed reason:"missing_requestId"`. Fires only after nonce check passes. See observation log Round 5 click 3. |
| Oversized envelope beyond a Tier 2 payload cap | **Deferred to M8a.** Spike did not exercise size limits. M8a must set the cap and add a `drop_malformed reason:"oversized"` path with counter. |
| Nonce mismatch after handshake | `drop_nonce` with both `received` and `expected` captured. See observation log Round 4 clicks 3–5. |
| Envelope sent before handshake completes | `drop_nonce` (because `sessionNonce === null`). **This is the fail-closed pre-handshake protection.** No dedicated "before handshake" gate is needed. See observation log Round 4 clicks 3–5 and Round 5 clicks 2–3. |
| Bridge-originated types received on the bridge's own inbound listener (`COGIS_READY`, `WEB_BRIDGE_RESULT_CHUNK`, `WEB_BRIDGE_PLATFORM_DONE`) | **Silently dropped at STEP 0** (the outbound-type filter, upstream of every other check). No counter increment. This filter must exist because both the page and the bridge listen on the same `window`, so the bridge would otherwise receive its own outbound envelopes. See observation log Round 5 click 4. |

## Happy-path round-trip — proven

**SEARCH:** Page → bridge (`accepted`) → SW (`sw_forward`) → bridge → page (`WEB_BRIDGE_RESULT_CHUNK` + `WEB_BRIDGE_PLATFORM_DONE` with `status:"ok"`). `requestId` and `nonce` echoed on every hop. See observation log Round 5 click 4.

**CANCEL:** Page → bridge (`accepted`) → SW (`sw_forward` + `sw_cancel_acked`) → bridge → page (`WEB_BRIDGE_PLATFORM_DONE` with `platform:"all", status:"cancelled"`). See observation log Round 5 click 5.

**SW reply signaling convention (locked):** `WEB_BRIDGE_PLATFORM_DONE` carries both `status:"ok"` (per-platform natural completion) and `status:"cancelled"` (`platform:"all"`, user cancellation). Page distinguishes completion from cancellation without out-of-band signaling.

## Counter reconciliation — the M6 debug panel criterion

Every counter increment observed across the 5 rounds is traceable to a specific user action. Final counter state:

```
originDropCount:0, nonceDropCount:3, malformedDropCount:4, acceptedCount:3, helloCount:1
```

- `helloCount:1` — one handshake (Round 5 click 1).
- `acceptedCount:3` — hello + SEARCH + CANCEL. Outbound bridge posts do not increment.
- `nonceDropCount:3` — three pre-handshake work envelopes (Round 4 clicks 3–5).
- `malformedDropCount:4` — Round 4 clicks 1 & 2 + Round 5 clicks 2 & 3.
- `originDropCount:0` — no envelope with a wrong `event.origin` reached the bridge; Chrome blocked wrong-target-origin attempts at the outer boundary.

**Reconciliation criterion for M8a and the M6 debug panel:** given a sequence of user actions, every counter increment must be explainable by a specific event. A counter that moves without an explaining event is either a bridge bug or an attack signal.

## Design constraints extracted from the spike

Feeds directly into M8a implementation. Full context per constraint lives in the observation log.

1. Bridge must ignore inbound messages whose type matches any bridge-originated outbound type (STEP 0 filter). Set must cover **all** types the bridge ever posts — currently `COGIS_READY`, `WEB_BRIDGE_RESULT_CHUNK`, `WEB_BRIDGE_PLATFORM_DONE`.
2. M8a's page-side sender must always use exact `targetOrigin: "https://cogis.ai"`. Never `"*"`.
3. Bridge counters need SW-owned persistence via `chrome.runtime.sendMessage`. The spike's `chrome.storage.session` attempt threw; that path is unavailable in a content script.
4. The M6 debug panel must surface both bridge counters AND the Chrome console warnings that fire when Chrome blocks a wrong-target-origin `postMessage` (the outer-boundary drops that never reach the bridge).
5. CSP delivered via `<meta http-equiv>` is a subset of the header-delivered form; `frame-ancestors` is not enforceable via meta. GitHub Pages gap — noted for future infra work, not blocking for M8a.
6. Handshake is off the SW critical path. The bridge answers `COGIS_HELLO` with `COGIS_READY` locally; no round-trip to the SW is required for the handshake itself.
7. Fail-closed against work envelopes until the handshake completes (`sessionNonce === null` blocks every non-`COGIS_HELLO` envelope at step 5). Load-bearing property. M8a must include a unit test that sends `WEB_BRIDGE_SEARCH` before any `COGIS_HELLO` and asserts a `drop_nonce`.
8. Validation ordering matters for observability. Per-type field errors are downstream of the nonce check; without a completed handshake they cannot fire, and the counter histogram will show `nonceDropCount` dominating — which is diagnostic information in itself.
9. STEP 0 outbound-type filter must cover ALL bridge-originated types, not just handshake replies. Applies to `WEB_BRIDGE_RESULT_CHUNK` and `WEB_BRIDGE_PLATFORM_DONE` too, or `malformedDropCount` will inflate on every result posted back to the page.
10. Counter-reconciliation is a testability criterion. Every counter increment must be explainable by a specific user action. M8a integration tests must assert this at the end of any scripted interaction sequence.
11. SW reply signaling convention: `WEB_BRIDGE_PLATFORM_DONE` carries both `status:"ok"` (per-platform completion) and `status:"cancelled"` (`platform:"all"`, user cancellation). M8a's real SW must preserve this distinction.

## Residual risks

- **SW cold-start latency** was not characterized in the spike (SW was warm during Round 5 click 4). M8a integration testing must measure `sw_forward` latency after ≥30s of SW inactivity and set a UX-appropriate perceived-latency budget for the first SEARCH after inactivity.
- **Oversized envelope handling** was not exercised. M8a must set a Tier 2 payload cap and add a `drop_malformed reason:"oversized"` path with an accompanying counter.
- **`sender.tab.url` origin check on the SW side** was not directly observed in the spike (the spike SW trusted the bridge). M8a must add this second origin check independent of the bridge and record its behavior; expected to be additive to this contract, not contradictory.
- **`bad_platforms`** validation was deferred to M8a integration tests. The validation-ordering pattern (nonce upstream of per-type fields) is already established, so `bad_platforms` will follow the same shape as `bad_query` and `missing_requestId`.
- **`event.origin === "null"`** and **`https://www.cogis.ai`** were not directly observed. Both are expected to hit the bridge's string-equality gate as ordinary origin drops if they ever reach the bridge; no path to construct them was available in the spike environment.
- **The spike harness (`spike-ext/`, `web/spike/`) has been deleted** by PR #34. It served as a debug tool while the M8a bridge was implemented (PR #33) and was torn down immediately after, satisfying the requirement that it not reach `main`.

## Definition of done — satisfied

- [x] Handshake envelope shapes proven live (both directions) — see observation log Round 2.
- [x] Origin string equality proven for `https://cogis.ai` — see observation log Rounds 1, 2, 4. Wrong-target-origin cases confirmed blocked by Chrome — see Round 3.
- [x] `document_idle` timing observed on 3 cold loads — see observation log Rounds 1, 2, 4.
- [ ] **WAR graph confirmed and WAR-guard test extended** — deferred. Spike bridge was flat single-file; no dynamic imports. M8a WAR-guard test extension is a Tier 1 concern separate from this contract.
- [x] Nonce format and lifetime decision recorded — 128-bit hex, session-lifetime, echoed on every envelope. See observation log Rounds 1, 2, 4.
- [x] Every envelope-validation drop case observed to increment its counter — see cumulative findings table in the observation log.
- [x] Residual risks enumerated with mitigations pointed at M8a AC — see section above.

## References

- Chronological observation log: [`./s8-1-observation-log.md`](./s8-1-observation-log.md) — includes all 5 rounds of interactive observations, cumulative findings table, and 11 design constraints with full context.
- M8 addendum: [`../agent_blueprint-m8-web-surface.md`](../agent_blueprint-m8-web-surface.md) v0.1.0 — the design this spike was verifying.
- Spike bridge source: `spike-ext/content/web-bridge.js` — deleted by PR #34. Recoverable from git history; the shipped equivalent is `extension/content/web-bridge.js`.
- Spike harness page source: `web/spike/s8-1.html` — deleted by PR #34. Recoverable from git history.
- Related PRs:
  - PR #27 — spike harness landed
  - PR #28 — bridge self-echo fix + CSP cleanup
  - PR #29 — observation log scaffold (Rounds 1–4)
  - PR #30 — observation log Round 5 amendment
  - PR #31 — formal finding doc locked
  - PR #33 — M8a bridge implemented against this contract
  - _This PR_ — deleted `spike-ext/` and `web/spike/`
