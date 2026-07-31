# S8.2 install-gate detection latency — case study

S8.2 is the Cogis milestone-8 spike that picked the handshake budget the `cogis.ai` page uses to decide whether the Cogis Chrome extension is installed. It started as a stub whose every field was `TBD`, ran through a purpose-built measurement fixture, and closed on **900 ms** — plus one contract amendment nobody had planned for, because the measurements showed the handshake the addendum specified could not complete at all. The formal finding is CLOSED — measured; M8b PR-B implements against it and against the M8 addendum v0.1.1.

Companion docs:

- [Formal finding (locked budget)](../spikes/s8-2-install-gate-latency.md) — what PR-B implements against.
- [Runbook + observation log (receipts)](../spikes/s8-2-measurement-runbook.md) — the per-run rows, transcribed by hand.
- [M8 addendum (design)](../agent_blueprint-m8-web-surface.md) **v0.1.1** — §3.9 carries the amendment this spike forced.
- [S8.1 case study](./s8-1-case-study.md) — the prior spike, one of whose inferences this one had to correct.

## What it is

S8.2 characterizes how long `COGIS_HELLO → COGIS_READY` actually takes across Chrome's isolated-world boundary on real hardware, and turns that distribution into a single number the page can wait on before declaring "not installed". The stub carried a standing warning against inventing that number from a whiteboard: too short false-positives an install-gate on a machine that has the extension, too long makes the genuine no-extension case feel broken. Both are user-visible harm. The spike landed as [PR #35](https://github.com/dsergovic/cogis/pull/35) (the measurement fixture, harness, runbook, and 42 tests) and this PR (the measurements, the close, and the addendum fold-back).

- **Budget locked: 900 ms** — inside the addendum §5 probe range 400–1200, so Tier 2, not a Tier 3 escalation.
- **Distribution measured** — 10 unthrottled cold loads at min 109.9 / p50 111.4 / p95 117.2 / max 117.2 ms; 3 throttled (Slow 4G + 4× CPU) at 371.0 / 499.3 / 665.3 ms; 3 warm at 112.1–116.7 ms, i.e. indistinguishable from cold.
- **0 false positives across 24 installed runs** — worst handshake anywhere in the set, 665.3 ms.
- **A single `COGIS_HELLO` at `DOMContentLoaded` never arrives** — the finding that reshaped the contract, below.
- **Install-gate render latency: budget + ≤ 4.1 ms** — the render allowance does not need a budget line of its own.
- **Behavioral rows all observed live** — disabled-per-origin is byte-identical to not-installed; Incognito without access is a plain install-gate with no Incognito-specific copy; a late `COGIS_READY` is ignored and the gate is never un-rendered.
- **Copy locked** — "Install the Cogis Chrome extension to search."

## The instrument was designed so it could not flatter itself

PR #35 was offered two options: a throwaway measurement script, or the real page-side client with a debug timing path. It took the second, on the grounds that **a standalone probe measures a standalone probe.** The number that matters is how long the *shipped* page waits, and the only way to guarantee the measured path is the shipped path is for them to be the same file. So the timing hook became an injectable `debug` sink on `web/assets/js/bridge-client.js` — the file M8b ships — rather than a parallel implementation free to drift from it. `COGIS_READY` stayed byte-identical to the §3.9 shape, so the extension side needed no measurement-only branch, and the harness shipped the exact §3.7 production CSP rather than a relaxed variant, because a number measured under a laxer policy would not transfer.

Two further choices did real work later:

- **`budgetMs` is a required constructor argument that throws.** While the spike was open, no default budget could exist anywhere in code — the addendum's rule that a stub spike may not be coded against was enforced by the type signature rather than by reviewer vigilance. The harness's own default was the probe *ceiling* (1200 ms), deliberately generous so the instrument could not manufacture a false positive in its own measurements.
- **The harness emitted a `budget_ms` column** in its copy-paste row, alongside the timings. This looked like redundant bookkeeping. It was not — see the verification catch below.

## The discovery: a handshake that cannot complete

While validating the fixture in a headless Chromium sandbox with the extension loaded, enabled, and flag-on, the handshake **did not resolve**. Not intermittently — structurally, on the default emit point, with **zero drops recorded**.

Zero drops is the whole signal. A drop counter at zero on a failed handshake does not mean the bridge rejected the message; it means the bridge **never heard it**. §3.8 sets the content script to `run_at: document_idle`, which fires at the earlier of `window.onload` or DOM-complete + ~200 ms — that is, at or after `DOMContentLoaded`. §3.9 specified a **single** `COGIS_HELLO` and said nothing about re-emission, so there was nothing to recover a lost one. Each section was individually correct; **jointly they were under-specified**, and the user-visible failure was an install-gate on a machine that does have the extension.

PR #35 deliberately did not fix it. Changing the fixture's default emit point to `load` would have turned the harness green and hidden the question; whether the answer was a later emit point, a re-emit cadence, or an earlier listener attach is a §3.9 contract change, not a harness tweak. So the default stayed on the failing emit point, `?reemit=` was documented as a measurement knob and explicitly *not* a contract decision, and runbook step 6d made the operator settle it **before** any budget was chosen. A budget measured on top of a lost handshake would have been meaningless.

### What S8.1's inference missed

S8.1 had looked at this and concluded ordering was fine. Its observation log records `bridge_loaded` firing at `readyState: "interactive"` and reasons from there — while also, to its credit, recording that its own timing buttons "were designed for observation but wired to click-triggered emission" and calling that a harness gap.

The inference does not hold. `readyState` becomes `"interactive"` **at** the DOMContentLoaded boundary, so that observation bounds `document_idle` to "before `load`" — which is exactly why `?hello=load` connects — but says nothing about whether a listener exists on the DCL tick itself. The bound was real; it just did not cover the case that breaks. This is the specific failure mode of inferring a timing contract from an adjacent observation rather than emitting at the lifecycle event and watching: the reasoning is sound and the conclusion is still wrong.

## Getting the bridge up on real hardware: two gates that were not "not installed"

Before a single number could be taken, two things produced clean, entirely believable install-gates on a machine with the extension correctly installed and enabled:

1. **Chrome had withheld the `https://cogis.ai/*` site-access grant.** M8a added that host permission to an extension that was already loaded, and Chrome does not silently grant a newly-added host permission — it withholds it. The per-site toggle sat off under "Automatically allow access on the following sites" and had to be enabled by hand.
2. **`WEB_SEARCH_SURFACE_ENABLED` was still `false` in the loaded build.** The runbook's flag flip had been applied, but to a different checkout than the one Chrome had loaded unpacked.

Both presented **identically**: HELLO emitted, zero page-side drops, zero `COGIS_READY`, install-gate. Neither is distinguishable from an uninstalled browser at the protocol level, and neither is exotic — a withheld host permission is a routine Chrome state, and it is *most* likely precisely in the situation M8a created, where an existing install gains a new origin.

This is the case study's most transferable finding, and it is not a timing result. **The install-gate fires for reasons other than "you have not installed it."** Copy that asserts a diagnosis the page has not actually made will be confidently wrong for a meaningful slice of users. The locked wording points at install instructions instead of asserting absence, and the spike carries it as residual risk R4 with an explicit instruction to PR-B not to add copy that claims to know why the handshake failed.

## The measurement

With the cadence in place, the emit-point matrix ran first, at the probe ceiling:

| Config | state | handshake_ms | first_hello_ms | gate_ms | hello_emits |
| --- | --- | --- | --- | --- | --- |
| `?hello=dom-content-loaded` | **GATED** | — | 168.3 | 1383.1 | 1 |
| `?hello=load` | connected | 15.0 | 381.1 | — | 1 |
| `?hello=immediate` | **GATED** | — | 240.5 | 1441.6 | 1 |
| `?hello=dom-content-loaded&reemit=200` | connected | 218.5 | 269.1 | — | 2 |

The sandbox result reproduced on real hardware. `?hello=load` connects fastest of anything measured (15.0 ms) and was still rejected: it makes the install decision hostage to the `load` event, which under Slow 4G lands seconds after the user is already looking at the page. The re-emit row connects on its **second** emit — `since_last_hello_ms` of 12.0 against a `handshake_ms` of 218.5 is one 200 ms cadence tick, which is what "the first one was lost" looks like in numbers.

The distribution followed. Ten unthrottled cold loads clustered inside a **7.3 ms** spread (109.9–117.2), every one taking exactly two emits, with the second answered in 5.7–11.1 ms. That decomposition matters: the ~110 ms is overwhelmingly the wait for the next cadence tick, not work the extension is doing. Throttled runs stretched to 371.0–665.3 ms and needed 4–5 emits. Warm loads came in at 112.1–116.7 ms — *inside* the cold spread, not below it, because the handshake is dominated by content-script scheduling rather than by asset fetch.

One number is worth reading twice: under Slow 4G the **first HELLO** went out ~3.7 s after navigation, while the handshake still resolved in ~500 ms. The budget clock starts at the first emit, not at navigation, so a slow network cannot false-positive the gate. Only slow content-script injection can.

## Defending 900

The obvious move — p95 plus headroom — is useless here. The unthrottled p95 is 117.2 ms with a 7.3 ms spread; a budget derived from it would have no defence whatsoever against the throttled tail. So the number is sized against the **throttled worst case (665.3 ms)** instead:

- **≈ 1.35×** the worst handshake ever observed on an installed machine.
- **≈ 7.7×** the unthrottled cold p95.
- **300 ms below** the Tier-2 ceiling, leaving room for a genuinely slower profile without a Tier-3 escalation.

Padding toward 1200 to cover an unmeasured machine was rejected explicitly: it would degrade the real not-installed case for every user in order to serve a hypothetical one. The residual risk is carried honestly instead — the whole distribution comes from one physical machine, with the "second profile" supplied by DevTools throttling rather than second hardware.

### The verification catch

The first verification run at the chosen budget was **mis-parameterised**: it went out at `?budget=1200` while purporting to verify 900. Its handshakes were all comfortably under 900, so every visible signal said "verified."

The `budget_ms` column said otherwise. Because the harness stamped the armed budget into the same transcribed row as the timings, the mismatch was legible on the page instead of living in the operator's memory of which URL had been typed. The run was redone with the timer actually armed at 900 — 3/3 throttled connections at 496.9–511.5 ms — and the mis-parameterised runs were retained as valid false-positive evidence but explicitly **not** counted as the verification, because the number under test was not the number armed.

An instrument that only reports the measurement lets this class of error through silently. Recording the *configuration* next to the measurement is what caught it, and it cost one extra column.

## Design constraints for M8b PR-B

Extracted from the finding and locked into the [spike](../spikes/s8-2-install-gate-latency.md) and addendum v0.1.1. PR-B implements against every one:

- **Budget is 900 ms, passed explicitly.** `budgetMs` stays a required constructor argument that throws — the budget can only ever reach the client from a caller citing the spike, never from a default.
- **The 100 ms re-emit cadence is part of the contract, not a page detail.** Same nonce on every re-emit, stop on the first `COGIS_READY`, budget clock from the first emit. **900 ms is only valid together with the cadence** — without it the DCL emit point gates 100% of the time and no number in the 400–1200 range rescues it. A change that drops the cadence breaks AC #1; it is not a performance nit.
- **Late `COGIS_READY` is ignored and the gate is never un-rendered.** Confirmed as a UX judgement live, not just as code behavior — a gate that vanishes after the user has started reading it is worse than one that is honest and asks for a reload.
- **Install-gate copy is locked** to "Install the Cogis Chrome extension to search.", identical for the disabled-per-origin case, with no Incognito-specific variant. The page must not render a diagnosis it has not made.
- **AC #1 targets the apex `https://cogis.ai/`**, published from `dev` during M8 development. A GH Pages preview URL and `file://` cannot satisfy it — the origin gate is string equality — and the addendum previously required exactly those. The sanctioned local fallback is the runbook's origin-spoof recipe, valid for behavioral checks and not for timing.
- **The service worker is not on the handshake reply path.** `COGIS_READY` is posted synchronously from the content script with no `chrome.runtime.sendMessage` round-trip, so SW cold start and eviction cannot gate the handshake. The budget defends content-script injection timing only, and SW latency must not be folded into it.

## Explicit non-scope

Neither this spike nor the PR that closes it does any of the following, and each absence is deliberate:

- **No page implementation.** No `index.html`, `page.js`, `render.js`, `404.html`, no searchbox, no results rendering — all M8b PR-B.
- **No extension code changes.** The §3.9 amendment required none: same-nonce repeats were already idempotent on the bridge, so the contract now permits behavior the code already tolerated.
- **No `pages.yml` change.** The workflow was corrected *in the addendum*, which had described a topology that did not match the file on disk; the file itself is untouched.
- **No flag flip.** `WEB_SEARCH_SURFACE_ENABLED` remains `false` in both mirrors. The measurement flip was local and never committed, guarded by `tests/unit/web-bridge-flag-sync.test.js`.
- **No second physical machine.** The second profile was DevTools throttling, which is the weaker of the two options the spike allowed. Carried as residual risk R1 rather than rounded off, to be revisited with real hardware before M8e — and not to be revisited by guessing.
- **No extension-update-window measurement.** The transient no-handshake window after an extension reload is enumerated as residual risk R2 and was not measured; the re-emit cadence does not help there, since re-emitting into a tab with no listener is still nothing.
- **Harness teardown.** `web/spike/` is deleted by the closing PR, same lifecycle as `web/spike/s8-1.html` (removed by PR #34). `bridge-client.js` and its tests stay — they are product code, not scaffolding.
