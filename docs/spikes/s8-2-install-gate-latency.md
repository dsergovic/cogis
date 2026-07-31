# S8.2 — Install-gate detection latency

**Status:** **CLOSED — measured 2026-07-31.** Every field below is filled from live runs on real hardware.
**Owner:** Human (David) — measurements taken on his primary machine; fixture landed by M8b PR-A ([PR #35](https://github.com/dsergovic/cogis/pull/35)).
**Confidence:** High for the measured distribution and the behavioral rows — 24 installed runs plus 4 gated runs, all on one physical machine (Dell Latitude 5550 / Windows 11 25H2 / Chrome 150), with the "second profile" supplied by DevTools throttling rather than a second machine. See [Environment](#environment) and [Residual risks](#residual-risks) for exactly what that does and does not cover.
**Environment (one-liner):** Dell Latitude 5550, Intel Core Ultra 7 155U, 12C/14T, Windows 11 Business 25H2 (26200.8973), Chrome 150.0.7871.187, extension dev-unpacked v0.6.0 with `WEB_SEARCH_SURFACE_ENABLED` flipped locally; harness served from `https://cogis.ai/spike/s8-2.html`.
**Fixture:** landed (see [Fixture](#fixture)). The fixture is the instrument; the numbers below are the finding.

> **Budget locked: 900 ms.** Defended against the measured distribution in the
> [Handshake budget](#decisions-to-lock-for-m8b) row, not chosen for tidiness.
>
> **This close carries one contract change.** A single `COGIS_HELLO` at
> `DOMContentLoaded` or earlier is **structurally lost** against a
> `run_at: document_idle` bridge. Addendum §3.9 has been amended (v0.1.1) to
> allow a 100 ms re-emit cadence on the same nonce. A page that emits once and
> waits will false-positive the install-gate on machines that *do* have the
> extension — the exact harm this spike existed to prevent.

Companion docs:

- [Measurement runbook + observation log](./s8-2-measurement-runbook.md) — the
  per-run rows of record, transcribed by hand from live loads.
- [Case study](../case-studies/s8-2-case-study.md) — how the number was arrived
  at, including what went wrong on the way.
- [M8 addendum](../agent_blueprint-m8-web-surface.md) **v0.1.1** — §3.9 carries
  the re-emit amendment this spike forced; §5 records 900 ms.

## Decisions to lock for M8b

| Field | Finding |
| --- | --- |
| **Handshake budget (ms)** | **900 ms — LOCKED** (David, 2026-07-31). Inside the addendum §5 probe range 400–1200, so **Tier 2**, not Tier 3. Defence: 900 is **≈ 1.35×** the worst handshake ever observed on an installed machine (665.3 ms, throttled cold load) and **≈ 7.7×** the unthrottled cold p95 (117.2 ms), and it leaves **300 ms of headroom** below the Tier-2 ceiling for a future slower profile without a Tier-3 escalation. It is not the p95 plus a rounding — the unthrottled p95 is so tight (109.9–117.2 ms, a 7.3 ms spread across 10 runs) that a p95-derived budget would have no defence at all against the throttled tail. The number is sized against the *throttled* tail instead, then re-verified with the timer actually armed at 900 (3/3 connected, 496.9–511.5 ms). **This budget is only valid together with the §3.9 re-emit cadence** — see the note at the top of this file. |
| **Measurement fixture** | **Landed — not a measurement.** `performance.now()` at page `COGIS_HELLO` emit vs page `COGIS_READY` receive, recorded by `web/assets/js/bridge-client.js` and read off the throwaway harness `web/spike/s8-2.html`. No hidden debug field is added to `COGIS_READY`: the envelope stays byte-identical to the §3.9 shape, so the measured path is the shipped path. See [Fixture](#fixture). The harness is deleted by the PR that closes this spike; `bridge-client.js` and its tests stay. |
| **Cold-load distribution** | **Measured.** Primary machine, 10 unthrottled cold loads: **min 109.9 / p50 111.4 / p95 117.2 / max 117.2 ms** (p95 nearest-rank). Second profile (DevTools **Slow 4G + 4× CPU** on the same machine — *not* a second machine), 3 cold loads: **371.0 / 499.3 / 665.3 ms**. Verification at the armed 900 ms budget, throttled, 3 cold loads: **511.5 / 501.0 / 496.9 ms**. Full per-run tables in [`s8-2-measurement-runbook.md`](./s8-2-measurement-runbook.md). |
| **Cache state** | **Measured — warm ≈ cold.** 3 warm loads (cache enabled, soft reload): **113.2 / 116.7 / 112.1 ms**, sitting inside the cold spread (109.9–117.2), not below it. The handshake is dominated by `document_idle` content-script scheduling, not by asset fetch, so the cache barely moves it. The budget is therefore chosen against the cold *throttled* case; warm loads are not a distinct regime worth budgeting for. |
| **False-positive rate** | **0 / 24 — LOCKED.** Zero missed handshakes across every run with the extension installed and enabled: 10 unthrottled cold + 3 throttled cold @1200 + 3 warm + 5 mis-parameterised verification runs @1200 + 3 throttled cold @900. Worst handshake in the whole set: **665.3 ms**, i.e. 234.7 ms of slack under the locked budget. |
| **False-negative behavior** | **Measured — gate renders at budget + ≤ 4.1 ms.** Both timed gated runs put the install-gate on screen a hair after the budget expired, measured from the *first* `COGIS_HELLO`: disabled-per-origin at 1194.7 ms since navigation (first HELLO 293.0 + 900 + ≈ 1.7 ms), Incognito at 1463.4 ms (first HELLO 559.3 + 900 + ≈ 4.1 ms). **Caveat on provenance:** the physically-uninstalled case was not separately timed. The two runs above are protocol-indistinguishable from it — the bridge is absent, zero `COGIS_READY` arrives, zero page-side drops are counted — so they stand in for it. The render allowance is a few milliseconds, not a regime of its own. |
| **Extension-disabled-per-origin case** | **Measured — identical to not-installed, no hang, no state leak.** With `cogis.ai` site access toggled off, the page emitted 9 HELLOs over the budget window, received none, and rendered the **same** install-gate as an uninstalled browser. No late `COGIS_READY`. Nothing distinguishes the two cases to a page that has not handshaken, which is the correct posture: per-origin permission state must not leak to an un-handshaken page. |
| **Chrome Incognito case** | **Measured — plain install-gate (stub option 1). LOCKED.** With no Incognito access granted, an Incognito window rendered the ordinary install-gate: 9 unanswered HELLOs, no late `COGIS_READY`, gate at 1463.4 ms since navigation. **No Incognito-specific copy** ("Enable Cogis in Incognito to search" is *not* adopted) — the page cannot tell Incognito-without-access apart from not-installed at the protocol level, so copy claiming otherwise would be a guess rendered as a fact. |

## Measured distribution

All runs on the primary machine (see [Environment](#environment)) against
`https://cogis.ai/spike/s8-2.html`, DevTools open, **Preserve log** on, hard
reload between runs. `handshake_ms` is first `COGIS_HELLO` emit → `COGIS_READY`
receive; `since_last_hello_ms` is last emit → receive, and the two differ
exactly because of the re-emit cadence. Per-run rows live in the runbook; the
summaries are here.

**Cold, unthrottled, `?budget=1200&reemit=100`, `Disable cache` + hard reload — 10 runs**

| Statistic | handshake_ms |
| --- | --- |
| min | 109.9 |
| p50 | 111.4 |
| p95 (nearest-rank) | 117.2 |
| max | 117.2 |

Sorted: 109.9, 109.9, 110.0, 110.9, 111.4, 111.4, 113.2, 115.0, 116.2, 117.2.
Every run took **2 emits** — the first lost to `document_idle`, the second
answered in 5.7–11.1 ms. That second-emit latency, not the first, is what the
extension actually costs; the ~110 ms is almost entirely the wait for the next
re-emit tick.

**Cold, throttled (Slow 4G + 4× CPU), `?budget=1200&reemit=100` — 3 runs**

| Run | handshake_ms | since_last_hello_ms | first_hello_ms | hello_emits |
| --- | --- | --- | --- | --- |
| 1 | 371.0 | 65.0 | 3736.9 | 4 |
| 2 | 499.3 | 48.0 | 3744.1 | 5 |
| 3 | 665.3 | 82.3 | 3637.6 | 5 |

`first_hello_ms` of ~3.6–3.7 s is the page fetch itself under Slow 4G, and it
**does not eat the budget**: the budget clock starts at the first HELLO, not at
navigation. This is why a slow *network* cannot false-positive the gate — only
a slow *content-script injection* can.

**Warm, `?budget=1200&reemit=100`, cache enabled, soft reload — 3 runs**

| Run | handshake_ms | first_hello_ms | hello_emits |
| --- | --- | --- | --- |
| 1 | 113.2 | 222.1 | 2 |
| 2 | 116.7 | 311.7 | 2 |
| 3 | 112.1 | 466.2 | 2 |

**Verification at the locked budget — throttled, `?budget=900&reemit=100`, cold — 3 runs**

| Run | handshake_ms | since_last_hello_ms | first_hello_ms | hello_emits | budget_ms |
| --- | --- | --- | --- | --- | --- |
| 1 | 511.5 | 87.8 | 3807.9 | 4 | 900 |
| 2 | 501.0 | 67.9 | 3902.7 | 5 | 900 |
| 3 | 496.9 | 50.5 | 3768.0 | 5 | 900 |

3/3 connected with the timer **actually armed** at the chosen number. An earlier
verification attempt was run at `?budget=1200` by mistake; its handshakes
(throttled 564.1 / 599.2 / 501.5, unthrottled 111.8 / 115.0) are retained above
in the 0/24 false-positive tally as valid evidence — every one is under 900 —
but they are **not** the verification, because the budget under test was not the
budget armed. The `budget_ms` column exists precisely so that this kind of
mis-parameterisation is visible in the transcribed row rather than invisible in
the operator's memory.

## Emit-point ordering — the finding that gates the budget

Extension installed, enabled, flag on, `?budget=1200`. This series was run
**before** any budget was picked, per runbook step 6d.

| Config | state | handshake_ms | since_last_hello_ms | first_hello_ms | ready_ms | gate_ms | hello_emits |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `?hello=dom-content-loaded` | **GATED** | — | — | 168.3 | — | 1383.1 | 1 |
| `?hello=load` | connected | 15.0 | 15.0 | 381.1 | 396.1 | — | 1 |
| `?hello=immediate` | **GATED** | — | — | 240.5 | — | 1441.6 | 1 |
| `?hello=dom-content-loaded&reemit=200` | connected | 218.5 | 12.0 | 269.1 | 487.6 | — | 2 |

**Verdict of record: the single pre-idle HELLO is structurally lost — the bridge
never hears it.** §3.8 sets the content script to `run_at: document_idle`, which
fires at or after `DOMContentLoaded`, so a single `COGIS_HELLO` emitted at DCL
or earlier lands before any listener exists, and §3.9 as written specified a
single HELLO with no recovery path. The failure mode is an install-gate on a
machine that has the extension installed and working.

The distinguishing evidence is the drop counters: on a failed handshake, a drop
counter at zero does not mean "the bridge rejected it", it means the bridge
never heard it. Zero-drop gated runs were recorded live during the
pre-measurement debugging (both blockers below) and in PR #35's sandbox
reproduction of these same four configs. **The per-run drop counters for the
four rows above were not separately transcribed**, so the table records the
states and timings only; the loss is attributed on the lifecycle argument plus
the corroborating zero-drop observations, not on a drop column in this table.

`?hello=load` connects (15.0 ms) but was rejected as the fix: it makes the
install decision hostage to the `load` event, which under Slow 4G arrives
seconds after the user is already looking at the page. The re-emit row recovers
on the second emit, which is the shape that was adopted.

**Escalated and resolved:** addendum §3.9 amended to v0.1.1 — the page **MAY**
re-emit `COGIS_HELLO` at a **100 ms** cadence, same nonce, stopping on the first
`COGIS_READY`; the budget clock runs from the **first** emit. Same-nonce repeats
are already idempotent on the bridge side and re-reply `COGIS_READY`
(`extension/content/web-bridge.js` hello-nonce branch, "a repeat of the same
nonce is idempotent and re-replies READY"), so no extension change was needed —
the amendment permits page behaviour the bridge already tolerated.

This also corrects an inference S8.1 left standing.
`s8-1-observation-log.md` reasoned from `bridge_loaded` at
`readyState: "interactive"` that ordering was fine. `readyState` turns
`interactive` **at** the DOMContentLoaded boundary, so that observation bounds
`document_idle` to "before `load`" — which is exactly why `?hello=load` works —
but says nothing about whether a listener exists on the DCL tick itself. It did
not cover the case that actually breaks.

## User-facing behavior at the budget boundary

| Time since page emit | Observed / locked behavior |
| --- | --- |
| `t < budget` and no reply yet | **Confirmed: no gate before the budget.** In every gated run the install-gate appeared only after the budget elapsed (see the row below), so nothing renders the "not installed" claim early. The addendum default stands: a neutral checking state (searchbox present but disabled, "Checking for Cogis extension…" hint). The exact hint markup is a **Tier 1–2 PR-B rendering detail**, not a measured value — nothing here fixes it. |
| `t == budget` and no reply | **Confirmed: install-gate replaces the searchbox, budget + ≤ 4.1 ms.** Measured at ≈ 1.7 ms (disabled-per-origin) and ≈ 4.1 ms (Incognito) after budget expiry. The render allowance does not need its own budget line. |
| `t > budget` and late reply arrives | **Confirmed: ignored, gate NOT un-rendered.** Forced live with `?budget=1&hello=load` on real hardware: the gate rendered at 367.5 ms since navigation (first HELLO 336.5), `COGIS_READY` then arrived, and the timing panel reported `late READY after gate: 1 (gate NOT un-rendered)`. The gate stayed on screen. **The UX is confirmed, not just the code** — a gate that flickers away after the user has started reading it is worse than a gate that is simply honest and asks for a reload. |
| Reply arrives before page emit | **Confirmed impossible, and never observed.** The bridge's `post()` returns early while `sessionNonce === null` (`extension/content/web-bridge.js`), so no bridge path can emit an unsolicited `COGIS_READY`; the page registers no `message` listener until `start()` mints the nonce. Across all 28 runs (24 installed + 4 gated) no `COGIS_READY` ever preceded a HELLO. |

## Install-gate copy — LOCKED

Locked by David, 2026-07-31, against the copy actually rendered in the E1/E2
gated runs — not against a draft.

| State | Copy |
| --- | --- |
| Extension not detected | **LOCKED: "Install the Cogis Chrome extension to search."** Wording confirmed as rendered on screen in both gated runs. |
| Extension disabled per-origin | **LOCKED: identical to the row above.** Observed live to render the same gate, and it must stay that way — the page cannot detect per-origin state without a handshake, and copy that implied otherwise would leak a permission state it has not actually observed. |
| Web Store link visible | **Resolved — not visible in M8b.** Not a measured row: it resolves on the state of the world, and no public Chrome Web Store listing exists (parent blueprint §12 #1 — a separate human escalation that M8 does not block). Until a listing exists the gate links to GitHub-hosted unpacked-dev install instructions. |
| Second CTA (docs / GitHub) | **Resolved — none in M8b.** Also not a measured row. The addendum leaves this **Tier 2**; PR-B ships the single install CTA and may add a second one later without reopening this spike. |

### A note the copy has to survive

Two of the three real install-gates seen during this spike were **not** "the
extension is not installed":

1. Chrome had **withheld the `https://cogis.ai/*` site-access grant** that M8a
   added — the per-site toggle sat off under "Automatically allow access on the
   following sites" and had to be enabled by hand.
2. `WEB_SEARCH_SURFACE_ENABLED` was still **`false` in the loaded build** — the
   runbook's flag flip had been applied to a different checkout than the one
   Chrome had loaded.

Both produced the identical symptom: HELLO emitted, **zero** page-side drops,
**zero** `COGIS_READY`, install-gate. Neither is distinguishable from
"not installed" at the protocol level, and neither is rare in the wild — a
withheld host permission is a routine Chrome state. This is the argument for
copy that says what the page *knows* ("we did not hear from the extension")
rather than what it *assumes* ("you have not installed it"), and it is why the
locked wording points at an install-instructions page rather than asserting a
diagnosis.

## Fixture

Landed by M8b PR-A ([PR #35](https://github.com/dsergovic/cogis/pull/35)).
**Nothing in this section is a finding** — it describes the instrument that
produced the numbers above.

> **The harness has been deleted** by the PR that closes this spike, same
> lifecycle as `web/spike/s8-1.html` (removed by PR #34). `bridge-client.js` and
> its unit tests stay — they are M8b product code, not spike scaffolding. Every
> number in this file is transcribed into
> [`s8-2-measurement-runbook.md`](./s8-2-measurement-runbook.md), so nothing here
> depends on the harness still existing; it is recoverable from git history.

| File | Role |
| --- | --- |
| `web/assets/js/bridge-client.js` | Page side of addendum §3.9. Mints the session nonce, emits `COGIS_HELLO`, validates inbound envelopes, arms the install-gate budget, and exposes the timing snapshot. This is the file M8b ships; the S8.2 timing path is an injectable `debug` sink on it, not a separate build. **Retained.** |
| `web/spike/s8-2.html` + `web/spike/s8-2.js` | Throwaway observation harness. Showed the handshake number on-page, mirrored it to the console as `[s8.2-page]`, and emitted a tab-separated row that pasted straight into the runbook table. **Deleted with this close.** |
| `tests/unit/bridge-client.test.js` | Unit coverage of the timing path, the budget boundary, late-reply handling, and every page-side drop reason. |
| `tests/unit/bridge-client-contract-sync.test.js` | Fails if the page-side literals drift from `extension/lib/web-bridge.js`, per addendum §3.3. |
| `docs/spikes/s8-2-measurement-runbook.md` | Step-by-step for the operator running the cold loads. |

Fixture properties that matter for reading the numbers:

- **`budgetMs` is a required constructor argument.** `createBridgeClient` throws
  without it, so no default budget could exist in code while this spike was open.
  The harness's own default was **1200 ms — the ceiling of the addendum §5 probe
  range, labelled as a probe, not a chosen budget** — so that the instrument
  could not itself manufacture a false positive. Now that the spike is closed,
  **PR-B passes 900 explicitly**; the constructor argument stays required, so the
  budget can only ever come from a caller citing this file.
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
  **The default was the emit point under test, not a validated one** — and it
  failed. `document_idle` fires at the earlier of `window.onload` or DOM-complete
  + ~200 ms, i.e. after `DOMContentLoaded`, so the bridge's listener is **not**
  attached when a single `COGIS_HELLO` goes out at DCL. Settled by the
  [emit-point series](#emit-point-ordering--the-finding-that-gates-the-budget).
- **Re-emission was off by default.** §3.9 originally specified a single
  `COGIS_HELLO` and said nothing about a re-emit cadence, so `?reemit=<ms>` was
  a measurement knob and deliberately **not** a contract decision. It is now
  both: the measurements said the shipped page needs one, so the cadence moved
  into addendum §3.9 (v0.1.1) where it belongs, rather than being absorbed into
  the page as an undocumented workaround.
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
  is not un-rendered. The code does this; the boundary table above records that
  the *UX judgement* was separately confirmed live.
- A repeated `COGIS_HELLO` carrying the same nonce is idempotent and re-replies
  `COGIS_READY` (`extension/content/web-bridge.js`, hello nonce branch). This is
  what made the re-emit probe safe to run, and it is why the §3.9 v0.1.1
  amendment needed **no extension-side change** — the bridge already tolerated
  the behaviour the contract now permits.
- The `COGIS_READY` reply is posted **synchronously from the content script**
  (`extension/content/web-bridge.js`, `TYPE_HELLO` branch → `post()`), with no
  `chrome.runtime.sendMessage` round-trip. The service worker is **not on the
  handshake reply path**, so SW cold start and SW eviction cannot delay or lose
  the handshake. See [Residual risks](#residual-risks).

## Environment

Every number in this file comes from this one machine, on 2026-07-31.

| Item | Value |
| --- | --- |
| Machine | Dell Latitude 5550 (mobile) |
| CPU | Intel Core Ultra 7 155U @ 1700 MHz, 12 cores / 14 logical processors |
| OS | Windows 11 Business, Version 25H2 (Build 26200.8973) — `chrome://version` reports 26200.8973; `msinfo32` reports 10.0.26200 Build 26200 |
| Browser | Chrome 150.0.7871.187 (Official Build) (64-bit), cohort Stable, V8 15.0.245.21 |
| Profile | `C:\Users\DavidSergovic\AppData\Local\Google\Chrome\User Data\Default` |
| Extension | dev-unpacked v0.6.0, `WEB_SEARCH_SURFACE_ENABLED` flipped locally in **both** mirrors, never committed |
| Harness URL | `https://cogis.ai/spike/s8-2.html`, published from the spike branch via `pages.yml` `workflow_dispatch` |
| "Second profile" | **DevTools throttling (Slow 4G + 4× CPU) of the same machine — not a second machine.** |

The second-profile substitution is the single largest limit on this spike's
confidence and is carried into [Residual risks](#residual-risks) rather than
being quietly rounded off. Throttling reproduces a slow network and a slow CPU;
it does not reproduce a different Chrome build, a different OS scheduler, a
low-memory device under pressure, or an antivirus filter driver sitting in the
extension load path.

### Blockers hit before any number could be taken

Both are recorded in full in the runbook and the
[case study](../case-studies/s8-2-case-study.md); they matter here because each
one produced a **clean, believable install-gate on a correctly installed
extension**:

1. **Chrome withheld the `https://cogis.ai/*` site-access grant** that M8a added
   to `host_permissions`. The per-site toggle was off under "Automatically allow
   access on the following sites" and had to be enabled by hand.
2. **`WEB_SEARCH_SURFACE_ENABLED` was still `false` in the loaded build** — the
   runbook's step-1 flip had not been applied to the checkout Chrome had
   actually loaded. Fixed by flipping both mirrors and reloading the extension.

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

Each risk names what M8b AC #1 (connected state) and AC #2 (install-gate within
budget) actually do about it. Where the answer is "nothing yet", it says so.

**R1 — A machine slower than the throttled profile exceeds 900 ms.**
The worst handshake observed is 665.3 ms under Slow 4G + 4× CPU; 900 leaves
234.7 ms of slack over that, but the whole distribution comes from one physical
machine (see [Environment](#environment)). A device that is slower in a way
throttling does not model — heavy antivirus in the extension load path, a
cold spinning disk, a low-memory Chromebook — could push content-script
injection past the budget.
*Defence:* AC #2 stays honest rather than correct — the page renders the
install-gate, which is a recoverable and self-explanatory state, not a hang or a
silent failure. The re-emit cadence means recovery costs one reload, not a
reinstall. **Not mitigated to zero, and deliberately not padded away:** raising
the budget toward 1200 to cover an unmeasured machine would degrade the real
not-installed case for every user in order to serve a hypothetical one. Revisit
with a genuine second machine before M8e; do not revisit by guessing.

**R2 — Extension update / reload leaves a transient no-handshake window.**
When Chrome updates or reloads the extension, already-open tabs lose their
content script until they are reloaded. A `cogis.ai` page loaded inside that
window emits its HELLOs into a tab with no bridge and gates.
*Defence:* none at the protocol level, and the re-emit cadence does **not** help
— re-emitting into a tab with no listener is still nothing. AC #1/#2 are
unaffected because both are stated over a *cold load*, which is exactly the
recovery action. **Not measured in this spike.** The user-visible cost is one
stale tab showing an install-gate until reloaded; the mitigation is the same
reload the gate copy already implies.

**R3 — Service-worker eviction between page load and handshake. Does not apply.**
This risk was listed on the stub and is retired rather than mitigated: the SW is
**not on the handshake reply path**. `COGIS_READY` is posted synchronously from
the content script's `TYPE_HELLO` branch (`extension/content/web-bridge.js` →
`post()`), with no `chrome.runtime.sendMessage` round-trip, so a cold or evicted
service worker cannot delay, lose, or gate the handshake. The 900 ms budget
defends against **content-script injection timing only**. SW cold-start latency
is real, but it is a *first-search* latency concern (S8.1's deferred
`sw_forward` characterisation), not an install-gate concern, and must not be
folded into this budget.

**R4 — An install-gate does not mean "not installed".**
Two of the three real gates encountered during this spike were a withheld
per-site host permission and a stale feature flag in the loaded build, both
protocol-indistinguishable from an uninstalled browser (zero drops, zero READY).
A withheld `https://cogis.ai/*` grant is a routine Chrome state that any real
user can land in, especially since M8a *added* that host permission to an
already-installed extension — which is exactly the condition under which Chrome
withholds rather than grants.
*Defence:* the locked copy points at install instructions rather than asserting
a diagnosis, and AC #2 is written as "install-gate renders", not "the extension
is proven absent". **PR-B must not add copy that claims to know why the
handshake failed.** Whether the install-instructions page should also cover
"already installed? check site access" is a Tier 2 content decision for PR-B.

**R5 — The budget is only valid with the re-emit cadence.**
900 ms was measured with `reemit=100` in every run. Without it, the DCL emit
point gates **100% of the time** regardless of budget — no number in the
400–1200 range rescues a handshake the bridge never hears.
*Defence:* the cadence is now normative in addendum §3.9 (v0.1.1), not a page
implementation detail, so removing it is a contract change rather than a
refactor. PR-B must pass both `budgetMs: 900` and the 100 ms cadence, and a
regression that drops the cadence should be read as breaking AC #1, not as a
performance nit.

## Definition of done

- [x] Handshake latency measured on ≥ 10 cold loads on ≥ 2 machine profiles (or 1 machine + throttled DevTools profile) — 10 unthrottled + 3 throttled cold loads; **profile 2 was DevTools throttling, not a second machine** (R1)
- [x] Emit-point ordering settled: does a single `COGIS_HELLO` at `DOMContentLoaded` reach a `document_idle` bridge? If not, re-emit cadence or emit point escalated to the addendum — **it does not**; escalated and resolved as addendum §3.9 v0.1.1 (100 ms re-emit, same nonce, stop on first READY)
- [x] Budget picked and defended with the measured distribution — **900 ms**, defended against the throttled tail (665.3) rather than the unthrottled p95 (117.2)
- [x] False-positive rate at chosen budget observed to be 0/N on installed runs — **0/24**
- [x] Install-gate render latency measured on uninstalled runs — budget + ≤ 4.1 ms; measured on the two protocol-equivalent gated runs, not on a physically-removed extension (noted in the row)
- [x] Extension-disabled-per-origin case observed — identical to not-installed, no state leak
- [x] Incognito case observed and behavior recorded — plain install-gate, no Incognito-specific copy
- [x] Late-reply behavior confirmed (ignore, do not un-render) — forced live at `?budget=1`, gate stayed on screen
- [x] Install-gate copy locked — "Install the Cogis Chrome extension to search."
- [x] Residual risks enumerated with mitigations — R1–R5 above
