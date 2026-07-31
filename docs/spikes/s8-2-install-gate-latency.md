# S8.2 — Install-gate detection latency

**Status:** **OPEN — stub.** Not a finding. Every measured field below is `TBD`.
**Owner:** Human + Perplexity — **or** the first task inside M8b (see `docs/agent_blueprint-m8-web-surface.md` §6) if this file is still a stub when M8b is handed off.
**Confidence:** None. Nothing here has been observed live.
**Fixture:** landed (see [Fixture](#fixture) below). **No measurements taken yet** — the fixture is the instrument, not the finding.

> **This file does not authorize any implementation claim.** A `TBD` field is not a default to code against — it is a question. M8b cannot claim its install-gate AC against a stub. Fill this in from **live observation of real cold loads on real machines**, commit it, then implement against it.
>
> **Do not invent a handshake budget from a whiteboard.** A budget that is too short false-positives the install-gate on machines that actually have the extension; a budget that is too long makes the "no extension" case feel broken. Both are user-visible harm; pick a number that survives the measured distribution, not one that looks tidy.

## Decisions to lock for M8b

| Field | Finding |
| --- | --- |
| **Handshake budget (ms)** | **TBD.** The addendum recommends a *probe range* of **400–1200 ms**; the spike picks one number inside that range and defends it. Outside the range is Tier 3, not Tier 2. |
| **Measurement fixture** | **Landed — not a measurement.** `performance.now()` at page `COGIS_HELLO` emit vs page `COGIS_READY` receive, recorded by `web/assets/js/bridge-client.js` and read off `web/spike/s8-2.html`. No hidden debug field is added to `COGIS_READY`: the envelope stays byte-identical to the §3.9 shape, so the measured path is the shipped path. See [Fixture](#fixture). |
| **Cold-load distribution** | **TBD.** ≥ 10 cold loads on the primary developer machine; ≥ 3 cold loads on at least one other machine (or a throttled DevTools "Slow 4G / Slow CPU" profile of the primary machine, if a second machine is unavailable). Record min / p50 / p95 / max. |
| **Cache state** | **TBD.** Distinguish cold (`Disable cache` on in DevTools + hard reload) from warm loads. Budget defends against cold loads; warm loads should be well under budget. |
| **False-positive rate** | **TBD.** With the extension installed and enabled, the handshake must resolve inside the budget on every measured run. Any missed handshake at the chosen budget disqualifies it. |
| **False-negative behavior** | **TBD.** With the extension **not** installed (or disabled per-origin via `chrome://extensions`), the install-gate must appear within budget + a small render allowance. Record the observed install-gate render latency. |
| **Extension-disabled-per-origin case** | **TBD.** Chrome allows disabling site access per-origin. Confirm the page treats this case identically to "extension not installed" (install-gate) and does not hang. |
| **Chrome Incognito case** | **TBD.** With the extension not allowed in Incognito, confirm the install-gate appears and the page footer surfaces "Enable Cogis in Incognito to search" copy — or, alternatively, treats it as a normal install-gate. Record which. |

## User-facing behavior at the budget boundary

| Time since page emit | Expected UI |
| --- | --- |
| `t < budget` and no reply yet | **TBD.** Addendum default: show a neutral loading state (searchbox present but disabled, "Checking for Cogis extension…" hint). |
| `t == budget` and no reply | **TBD.** Install-gate replaces the searchbox. |
| `t > budget` and late reply arrives | **TBD.** Addendum default: **ignore**. Once the install-gate is shown, a late `COGIS_READY` does not un-render it — the page must be reloaded. Rationale: a late reply on a slow machine is exactly the case we do not want to encourage; the install-gate is honest either way. Confirm this UX or Tier-3-escalate. |
| Reply arrives before page emit | **TBD.** Impossible under the current protocol (SW replies only to `COGIS_HELLO`); confirm no bridge path can emit an unsolicited `COGIS_READY`. |

## Install-gate copy — to lock

| State | Copy |
| --- | --- |
| Extension not detected | **TBD.** Addendum working draft: "Install the Cogis Chrome extension to search." Confirm exact wording. |
| Extension disabled per-origin | **TBD.** Addendum working draft: same as above (do not leak per-origin state to a page that hasn't handshaken). Confirm. |
| Web Store link visible | **TBD** — visible only once a public listing exists. Until then, link to a GitHub-hosted install-instructions page (unpacked-dev). |
| Second CTA (docs / GitHub) | **TBD** — optional; the addendum leaves this a Tier 2 detail. |

## Fixture

Landed by M8b PR-A. **Nothing in this section is a finding** — it describes the
instrument that produces the numbers the rows above are still waiting for.

| File | Role |
| --- | --- |
| `web/assets/js/bridge-client.js` | Page side of addendum §3.9. Mints the session nonce, emits `COGIS_HELLO`, validates inbound envelopes, arms the install-gate budget, and exposes the timing snapshot. This is the file M8b ships; the S8.2 timing path is an injectable `debug` sink on it, not a separate build. |
| `web/spike/s8-2.html` + `web/spike/s8-2.js` | Throwaway observation harness. Shows the handshake number on-page, mirrors it to the console as `[s8.2-page]`, and emits a tab-separated row that pastes straight into the runbook table. Deleted when M8b lands, same lifecycle as `web/spike/s8-1.html` (removed by PR #34). |
| `tests/unit/bridge-client.test.js` | Unit coverage of the timing path, the budget boundary, late-reply handling, and every page-side drop reason. |
| `tests/unit/bridge-client-contract-sync.test.js` | Fails if the page-side literals drift from `extension/lib/web-bridge.js`, per addendum §3.3. |
| `docs/spikes/s8-2-measurement-runbook.md` | Step-by-step for the operator running the cold loads. |

Fixture properties that matter for reading the numbers:

- **`budgetMs` is a required constructor argument.** `createBridgeClient` throws
  without it, so no default budget can exist in code while this spike is open.
  The harness's own default is **1200 ms — the ceiling of the addendum §5 probe
  range, labelled as a probe, not a chosen budget.**
- **The clock starts at the first `COGIS_HELLO` emit**, because that is the
  instant the user starts waiting. `firstHelloAt` (ms since navigation start) is
  recorded alongside `handshakeMs`, so the total time-to-decision is
  reconstructable: `firstHelloAt + handshakeMs`.
- **Default emit point is the `DOMContentLoaded` tick**, which is the timing
  S8.1 locked (`s8-1-postmessage-handshake-contract.md`, `document_idle` timing
  row). `?hello=immediate` and `?hello=load` exist because S8.1's harness never
  actually auto-emitted at lifecycle events — that gap is recorded verbatim in
  `s8-1-observation-log.md` ("Timing observation for `document_idle` vs page's
  inline emissions"). Closing it is an S8.2 observation, not an assumption.
  **The default is the emit point under test, not a validated one.** `document_idle`
  fires at the earlier of `window.onload` or DOM-complete + ~200 ms, i.e. after
  `DOMContentLoaded`, so whether the bridge's listener is attached when a single
  `COGIS_HELLO` goes out is unproven. If it is not, the handshake is lost with no
  drop recorded and the install-gate false-positives on a machine that *does*
  have the extension. Step 5 of the protocol below exists to settle this.
- **Re-emission is off by default.** §3.9 specifies a single `COGIS_HELLO` and
  says nothing about a re-emit cadence, so `?reemit=<ms>` is a measurement knob
  and **not** a contract decision. Whether the shipped page needs one is an open
  question this spike should answer; if it does, the cadence belongs in the
  addendum, not in a harness query string.
- **Nothing is persisted.** No `localStorage`, no `sessionStorage`, no cookies
  (§3.5), so each cold load reports one run and the operator transcribes it. All
  settings ride the query string precisely so a hard reload preserves them.
- **The harness ships the exact §3.7 production CSP**, not a relaxed variant. A
  number measured under a laxer policy would not transfer to the shipped page.

### Non-measured facts the fixture pins by construction

These are code-verifiable, not observations, and they do **not** close any row
above:

- The bridge cannot emit an unsolicited `COGIS_READY`:
  `extension/content/web-bridge.js` `post()` returns early while
  `sessionNonce === null` (§3.9: "The bridge **never** posts anything to the page
  until a valid `COGIS_HELLO` is received"). The page side is fail-closed too —
  it registers no `message` listener until `start()` mints the nonce.
- A late `COGIS_READY` after the gate renders is logged and **ignored**; the gate
  is not un-rendered. That is the addendum default in the boundary table above.
  The row stays `TBD` because the spike must *confirm the UX*, not the code.
- A repeated `COGIS_HELLO` carrying the same nonce is idempotent and re-replies
  `COGIS_READY` (`extension/content/web-bridge.js`, hello nonce branch), which is
  what makes the optional re-emit probe safe to run.

## Measurement protocol

Executed by the operator on real hardware; see
`docs/spikes/s8-2-measurement-runbook.md` for the click-by-click version.

1. Load the extension unpacked with `WEB_SEARCH_SURFACE_ENABLED` flipped **on
   locally only** (both mirrors: `extension/lib/flags.js` and the inline literal
   in `extension/content/web-bridge.js`). The flip is never committed.
2. Reach the harness on an origin whose `event.origin` is exactly
   `https://cogis.ai` — the manifest `matches` value is `https://cogis.ai/*` and
   the origin gate is string equality, so `localhost` and `file://` cannot
   exercise the bridge at all.
3. DevTools open, **Disable cache** checked, **Preserve log** checked. Hard
   reload for every run.
4. ≥ 10 cold loads on the primary machine at the default emit timing; record the
   harness row per run.
5. **Emit-point comparison.** With the extension installed and enabled, run each
   of `?hello=dom-content-loaded`, `?hello=load`, `?hello=immediate` with a
   single HELLO, then repeat `dom-content-loaded` with `?reemit=200`. A run that
   reaches the install-gate here is a **false positive**, and the drop counters
   distinguish the two failure modes: all-zero drops means the bridge never
   heard the HELLO (a lifecycle ordering loss), a non-zero counter means it heard
   it and rejected it. If the ordering loss reproduces, the fix — a re-emit
   cadence, a later emit point, or attaching the bridge listener earlier — is an
   addendum §3.9 change and must be escalated, not absorbed into the page.
6. ≥ 3 cold loads on a second profile — a second machine, or the primary under
   DevTools **Slow 4G + 4× CPU** throttling. Record which was used.
7. Repeat a short warm-load series (cache enabled, soft reload) for the
   cold-vs-warm row.
8. Disable the extension per-origin, then remove it, then run Incognito without
   Incognito access; record what the page renders in each case.
9. Force the late-reply case (extension disabled per-origin during load, or a
   deliberately short `?budget=`) and confirm the gate is not un-rendered.
10. Only then fill the tables above, pick the budget, and flip the status.

## Residual risks

**TBD** — to be enumerated once the budget is chosen. Likely candidates: cold-start on very slow machines exceeding the budget, extension-update reloads producing a transient no-handshake window, service-worker eviction between the page load and the handshake. Record each and how M8b's AC #1 and #2 defend against it.

## Definition of done

- [ ] Handshake latency measured on ≥ 10 cold loads on ≥ 2 machine profiles (or 1 machine + throttled DevTools profile)
- [ ] Emit-point ordering settled: does a single `COGIS_HELLO` at `DOMContentLoaded` reach a `document_idle` bridge? If not, re-emit cadence or emit point escalated to the addendum
- [ ] Budget picked and defended with the measured distribution
- [ ] False-positive rate at chosen budget observed to be 0/N on installed runs
- [ ] Install-gate render latency measured on uninstalled runs
- [ ] Extension-disabled-per-origin case observed
- [ ] Incognito case observed and behavior recorded
- [ ] Late-reply behavior confirmed (ignore, do not un-render)
- [ ] Install-gate copy locked
- [ ] Residual risks enumerated with mitigations
