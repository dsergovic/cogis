# S8.1 — postMessage handshake contract

**Status:** **OPEN — stub.** Not a finding. Every field below is `TBD`.
**Owner:** Human + Perplexity — **or** the first task inside M8a (see `docs/agent_blueprint-m8-web-surface.md` §6) if this file is still a stub when M8a is handed off.
**Confidence:** None. Nothing here has been observed live.

> **This file does not authorize any implementation claim.** A `TBD` field is not a default to code against — it is a question. M8a cannot claim its behavioral AC against a stub. Fill this in from **live observation on an unpacked Chrome build against a real `https://cogis.ai/` (or a `file://` / preview-URL harness that exercises the same origin-check codepath)**, commit it, then implement against it.
>
> **Do not invent envelope fields, timing tolerances, or drop counters that were not observed.** An unobserved rule stays `TBD` and behavior falls back to the honest default: origin string equality, single-nonce session, drop-and-count on any mismatch.

## Decisions to lock for M8a

| Field | Finding |
| --- | --- |
| **Handshake envelope shape (page → SW)** | **TBD.** Confirm the addendum shape `{ type: "COGIS_HELLO", nonce, v: 1 }` survives Chrome's isolated-world boundary intact (no field stripped, no automatic type coercion). Record any Chrome-imposed structured-clone quirks. |
| **Handshake reply envelope (SW → page)** | **TBD.** Confirm `{ type: "COGIS_READY", nonce, v: 1, extVersion, capabilities }` is deliverable via `window.postMessage(msg, "https://cogis.ai")` from the bridge content script and readable by the page listener. |
| **Origin string** | **TBD.** Confirm `event.origin` for messages emitted by a page loaded at `https://cogis.ai/` is exactly `"https://cogis.ai"` (no trailing slash, no path). Confirm the same for the bridge's outbound target-origin argument. |
| **`event.source` check on page side** | **TBD.** Confirm the page can safely require `event.source === window` on inbound bridge replies (given that content scripts run in the isolated world and postMessage into the page world). |
| **`sender.tab.url` check on SW side** | **TBD.** Confirm `chrome.runtime.onMessage` on the SW side receives a `sender.tab.url` that starts with `https://cogis.ai/` for messages forwarded by the bridge, so the SW can enforce a second origin check independent of the bridge. |
| **`document_idle` timing** | **TBD.** Confirm the bridge's `run_at: "document_idle"` produces a live listener before the page's own `DOMContentLoaded` handler emits `COGIS_HELLO`, on a cold `cogis.ai` load with no cached assets. Record the observed timing distribution across at least three cold loads. |
| **Isolated-world module import graph** | **TBD.** If the bridge dynamically imports from `lib/*`, confirm the exact WAR graph required and that the WAR guard test (M1 pattern) fails when a transitively-imported file is missing. |
| **Nonce format** | **TBD.** Confirm the addendum's "128-bit hex" is acceptable and reproducible across page reloads (a new session nonce per page load). Confirm nonces are neither logged nor persisted. |
| **Session-lifetime nonce vs per-message nonce** | **TBD.** Addendum defaults to a single session-lifetime nonce set by `COGIS_HELLO` and echoed on every subsequent message. Confirm this is enough to defeat cross-frame replay in practice, given `frame-ancestors 'none'` in the page CSP already blocks iframing. If not, upgrade to per-message nonces — Tier 3, not Tier 2. |

## Origin-lock strictness — to prove

| Input | Expected behavior |
| --- | --- |
| `event.origin === "https://cogis.ai"` | Accept |
| `event.origin === "https://www.cogis.ai"` | **TBD — expect drop.** Bridge is not matched to `www`; but confirm a stray message can't arrive here anyway. |
| `event.origin === "http://cogis.ai"` | **TBD — expect drop** (no mixed-content path exists, but confirm). |
| `event.origin === "https://cogis.ai.evil.example"` | **TBD — expect drop** (string equality, not substring). |
| `event.origin === "null"` | **TBD — expect drop** (sandboxed iframe / data: origin). |
| Missing `event.origin` | **TBD — expect drop**. |

Every dropped case must increment `originDropCount` (see addendum §7) — confirm the counter increments in practice, not merely in code review.

## Envelope-validation drops — to prove

| Input | Expected behavior |
| --- | --- |
| Missing `type` | **TBD — expect drop + `malformedDropCount++`.** |
| Unknown `type` (not in allowlist) | **TBD — expect drop.** |
| Non-string `query` on a `WEB_BRIDGE_SEARCH` | **TBD — expect drop.** |
| Oversized envelope beyond a Tier 2 payload cap | **TBD — expect drop.** Record the cap chosen. |
| Nonce mismatch after handshake | **TBD — expect drop + `nonceDropCount++`.** |
| Missing `requestId` on a search/cancel/chunk envelope | **TBD — expect drop.** |

## Residual risks

**TBD** — to be enumerated once the handshake is proven. Record each so M8a's PR body can address them under **Choices made**.

## Definition of done

- [ ] Handshake envelope shapes proven live (both directions)
- [ ] Origin string equality proven for `https://cogis.ai` and each drop case above
- [ ] `document_idle` timing observed on ≥ 3 cold loads
- [ ] WAR graph confirmed and WAR-guard test extended
- [ ] Nonce format and lifetime decision recorded (session vs per-message)
- [ ] Every envelope-validation drop case observed to increment its counter
- [ ] Residual risks enumerated with mitigations pointed at M8a AC
