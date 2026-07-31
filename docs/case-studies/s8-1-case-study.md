# S8.1 postMessage handshake contract — case study

S8.1 is the Cogis milestone-8 spike that proved the postMessage handshake contract between the `cogis.ai` page and the Cogis Chrome extension's content-script bridge, distilled from five rounds of live observation against a throwaway harness at `https://cogis.ai/spike/s8-1.html`. The formal finding is CLOSED — proven; M8a implements against it and against the M8 addendum.

Companion docs:

- [Formal finding (locked contract)](./s8-1-postmessage-handshake-contract.md) — what M8a implements against.
- [Observation log (receipts)](./s8-1-observation-log.md) — 5 rounds of click-by-click observations.
- [M8 addendum (design)](../agent_blueprint-m8-web-surface.md) — the design this spike verified.

## What it is

S8.1 verifies the postMessage contract Chrome's isolated-world boundary imposes on Cogis. The spike used a purpose-built extension (`spike-ext/`) that ran only on `https://cogis.ai/*` and a harness page (`web/spike/s8-1.html`) with buttons for every drop case, so counters, drop reasons, and console warnings could be observed live. Five rounds landed as [PR #27](https://github.com/dsergovic/cogis/pull/27) (harness), [PR #28](https://github.com/dsergovic/cogis/pull/28) (self-echo + CSP fixes), [PR #29](https://github.com/dsergovic/cogis/pull/29) (observation log scaffold, rounds 1–4), [PR #30](https://github.com/dsergovic/cogis/pull/30) (round 5 amendment), and [PR #31](https://github.com/dsergovic/cogis/pull/31) (the formal finding doc).

- **Locked handshake shape** — `{ type: "COGIS_HELLO", nonce, v: 1 }` from page to bridge and `{ type: "COGIS_READY", nonce, v: 1, extVersion, capabilities }` from bridge to page survive the isolated-world boundary intact, with no fields stripped and no type coercion.
- **Locked origin string** — `event.origin` and outbound `targetOrigin` are both exactly `"https://cogis.ai"` — no trailing slash, no path. Same-origin senders using `postMessage(msg, "*")` are accepted because `event.origin` still resolves correctly; M8a's page-side sender must still use the exact literal, never `"*"`.
- **Locked six-step validation ordering** — inbound bridge messages pass through origin equality, `event.source === window`, type presence, type in allowlist, nonce match, then per-type field validity, in that order. Per-type errors like `bad_query` are always downstream of the nonce gate.
- **Fail-closed pre-handshake protection** — `sessionNonce === null` before the handshake completes, so every non-`COGIS_HELLO` envelope fails at the nonce gate as `drop_nonce`. No dedicated "before handshake" gate is needed and no attack surface exists to skip the handshake.
- **STEP 0 outbound-type filter** — the bridge must silently ignore its own inbound receipt of any type it ever posts, currently `COGIS_READY`, `WEB_BRIDGE_RESULT_CHUNK`, and `WEB_BRIDGE_PLATFORM_DONE`. The filter must expand alongside the outbound type set or `malformedDropCount` inflates on every result posted back to the page.
- **Locked SW reply signaling** — `WEB_BRIDGE_PLATFORM_DONE` carries both `status:"ok"` per platform on natural completion and `status:"cancelled"` with `platform:"all"` on user cancellation, letting the page distinguish the two without out-of-band signaling.
- **Defense-in-depth origin boundary** — Chrome refuses delivery of cross-origin `postMessage` (evil hosts, `http://` scheme) at the outer layer with a console warning; the bridge's string-equality gate is the inner layer. The M6 debug panel must surface both boundaries so operators see the full failure picture.

## Design constraints for M8a

Extracted directly from the observation log and locked into the [formal finding](./s8-1-postmessage-handshake-contract.md). M8a implements against every one of these:

- **Bridge-code constraints** — STEP 0 outbound-type filter covering all types the bridge posts; validation ordering preserved end-to-end; fail-closed nonce state before handshake; SW-owned counter persistence via `chrome.runtime.sendMessage`, because `chrome.storage.session` throws from a content script ([PR #28](https://github.com/dsergovic/cogis/pull/28) discovery).
- **Envelope-schema constraints** — page-side sender always uses exact `targetOrigin: "https://cogis.ai"`; nonce is 128-bit hex `[0-9a-f]{32}`, session-lifetime, echoed on every envelope including bridge outbound work replies.
- **Testability constraints** — counter reconciliation as an integration-test criterion: given a scripted N-action sequence, every counter increment must trace to one of the N actions; a pre-handshake `WEB_BRIDGE_SEARCH` unit test must assert `drop_nonce`; M6 debug panel must surface bridge counters AND the Chrome console warnings from the outer boundary.
- **Infrastructure constraint** — CSP via `<meta http-equiv>` is a subset of the header-delivered form (`frame-ancestors` is not enforceable via meta). GitHub Pages hosting for `cogis.ai/` cannot ship `frame-ancestors`; noted for future infra work, not blocking for M8a.

## Explicit deferrals to M8a

The [formal finding](./s8-1-postmessage-handshake-contract.md) calls each of these out as a residual risk rather than a silent gap:

- **SW cold-start latency characterization** — the spike SW was warm during the happy-path clicks; M8a integration testing must measure `sw_forward` latency after ≥30s of inactivity and set a perceived-latency budget.
- **Oversized envelope handling** — the spike did not exercise size limits. M8a must set a Tier 2 payload cap and add `drop_malformed reason:"oversized"` with its own counter.
- **`sender.tab.url` origin check on the SW side** — the spike SW trusted the bridge. M8a must add this as a second origin check independent of the bridge, defense in depth.
- **`bad_platforms`, `event.origin === "null"`, `https://www.cogis.ai`** — untested but expected to follow the same validation-ordering pattern already established; noted for M8a integration tests, not blocking for the contract.
- **WAR-guard test extension** — the spike bridge was flat single-file with no dynamic imports. M8a's WAR-guard extension is a Tier 1 concern separate from the postMessage contract.
- **Harness teardown** — `spike-ext/` and `web/spike/` are deliberately retained during M8a implementation for use as a debug tool. Teardown PR must land before M8a's PR to `main`.
