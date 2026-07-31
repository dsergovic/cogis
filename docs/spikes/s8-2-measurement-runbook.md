# S8.2 measurement runbook and observation log

Click-by-click procedure for the operator taking the S8.2 cold-load
measurements, **and the filled observation log of record** for the run that
closed the spike. The spike itself — what the numbers mean and which rows they
close — is [`s8-2-install-gate-latency.md`](./s8-2-install-gate-latency.md); the
protocol summary there and the steps here are the same procedure at two levels
of detail. This file holds the per-run rows; that file holds the decisions.

> **You are the instrument here, not the code.** Nothing in this repo may fill a
> measured field in the spike doc. Every number below is transcribed by hand from
> a real cold load on real hardware.

**Executed 2026-07-31 by David on his primary machine. Spike CLOSED; budget
locked at 900 ms.** The procedure below is kept intact rather than rewritten in
the past tense, so the run is reproducible and so the fill-in columns show
exactly which cells were transcribed and which were not.

> **The harness is gone.** `web/spike/s8-2.html` + `s8-2.js` were deleted by the
> PR that closed this spike (same lifecycle as `web/spike/s8-1.html`, removed by
> PR #34). Re-running §6 requires restoring them from git history —
> `web/assets/js/bridge-client.js` and its tests are still present.

## Pre-measurement blockers — read before re-running

Two things stopped the very first run dead, and **both produced a completely
believable install-gate on a machine with the extension correctly installed and
enabled**: HELLO emitted, zero page-side drops, zero `COGIS_READY`, gate. Neither
is distinguishable from "not installed" at the protocol level, so neither
announces itself.

1. **Chrome withheld the `https://cogis.ai/*` site-access grant.** M8a added the
   host permission to an extension that was already loaded; Chrome does not
   silently grant a newly-added host permission, it withholds it. The per-site
   toggle sat **off** under `chrome://extensions` → the extension → **Site
   access** → "Automatically allow access on the following sites". Fixed by
   enabling `cogis.ai` by hand. **Check this first — before doubting the code.**
2. **`WEB_SEARCH_SURFACE_ENABLED` was still `false` in the loaded build.** Step 1
   below had been applied, but not to the checkout Chrome had actually loaded
   unpacked. Fixed by flipping both mirrors in the loaded checkout and pressing
   reload on the extension card.

Diagnostic order that would have saved the time: (a) does the extension card
show `cogis.ai` under Site access, (b) does the *loaded* checkout have both flag
mirrors `true`, (c) only then suspect the page.

## 0. What you will end up with

- A filled `Cold-load distribution` row: min / p50 / p95 / max, from ≥ 10 cold
  loads on the primary machine and ≥ 3 on a second profile.
- A defended handshake budget inside the addendum §5 probe range (400–1200 ms).
  A number outside that range is a Tier 3 escalation, not a choice you make here.
- Observations for the install-gate, per-origin-disabled, Incognito, late-reply,
  and emit-point rows.

## 1. Flip the feature flag locally — never commit it

The bridge is behind `WEB_SEARCH_SURFACE_ENABLED`, which ships `false`. It is
mirrored in two files and **both** must be flipped or the content script returns
early and you will measure an install-gate on a machine that has the extension.

1. `extension/lib/flags.js` — `export const WEB_SEARCH_SURFACE_ENABLED = false;`
   → `true`
2. `extension/content/web-bridge.js` — the inline
   `const WEB_SEARCH_SURFACE_ENABLED = false;` → `true`

Confirm both, because the flag-sync test exists precisely because they drift:

```sh
grep -rn "WEB_SEARCH_SURFACE_ENABLED = " extension/
```

**Expect `tests/unit/web-bridge-flag-sync.test.js` to fail while flipped.** That
failure is the guard doing its job — it asserts the shipped default is `false`.
Do not "fix" it, and do not commit the flip.

When you are done measuring:

```sh
git checkout -- extension/lib/flags.js extension/content/web-bridge.js
npm test   # flag-sync test green again
```

## 2. Load the extension unpacked

`chrome://extensions` → **Developer mode** on → **Load unpacked** → select
`extension/`. Note the version it reports; the harness echoes `extVersion` back
from `COGIS_READY` and the two should agree.

## 3. Reach the harness on the real origin

**This is the step that cannot be shortcut.** `extension/manifest.json` matches
`https://cogis.ai/*` only, and the bridge's origin check is string equality
against `https://cogis.ai` — no glob, no regex, no dev override. `localhost`,
`127.0.0.1`, `file://`, and `https://www.cogis.ai` all fail to exercise the
bridge at all. You would measure a guaranteed install-gate and learn nothing.

### Path A — deploy the harness to `cogis.ai` (recommended)

`.github/workflows/pages.yml` publishes the `web/` tree and exposes
`workflow_dispatch`, so the harness can be published from the spike branch
**without merging the PR**:

1. GitHub → **Actions** → the Pages workflow → **Run workflow** → pick the spike
   branch → run.
2. Wait for the deploy, then open `https://cogis.ai/spike/s8-2.html`.
3. When you are finished measuring, re-run the same workflow from `dev` to put
   the published site back to the branch of record.

The harness is `noindex, nofollow`, makes no network calls (`connect-src 'none'`)
and writes no storage, so a temporary publish is low-risk. It is still a public
URL while it is up.

### Path B — local HTTPS with a spoofed origin

If you would rather not publish, Chrome can be made to resolve the real origin
string locally. **Use a throwaway Chrome profile** — the flags below weaken TLS
for the whole browser session.

```sh
# once: a cert for cogis.ai
openssl req -x509 -newkey rsa:2048 -nodes -days 30 \
  -keyout key.pem -out cert.pem -subj "/CN=cogis.ai" \
  -addext "subjectAltName=DNS:cogis.ai"

# serve the repo's web/ tree over HTTPS on 8443 (any static HTTPS server works)
```

Then launch Chrome with:

```
--host-resolver-rules="MAP cogis.ai 127.0.0.1:8443"
--ignore-certificate-errors
--user-data-dir=/tmp/s82-profile
```

This has been confirmed to produce `window.location.origin === "https://cogis.ai"`
with the content script injecting and replying, so it is a valid way to exercise
the bridge. **It is not a valid way to take the primary timing numbers**: it is
loopback, so the network leg is unrealistically fast. Use Path B for the
behavioural observations (install-gate, per-origin disable, late reply) and
Path A for the distribution.

## 4. DevTools setup for every run

- DevTools open, **Network** tab.
- **Disable cache** checked (this is what makes the load cold).
- **Preserve log** checked, so a hard reload does not eat the previous row.
- Reload with **Cmd/Ctrl + Shift + R** (hard reload) for every single run.

## 5. Reading a run

The page shows, and the console mirrors as `[s8.2-page]`:

| Field | Meaning |
| --- | --- |
| `handshake_ms` | first `COGIS_HELLO` emit → `COGIS_READY` receive. **This is the number the budget is chosen against.** |
| `since_last_hello_ms` | last HELLO → READY. Differs from the above only when re-emitting. |
| `first_hello_ms` | ms since navigation start at the first emit. Total time-to-decision is `first_hello_ms + handshake_ms`. |
| `ready_ms` / `gate_ms` | ms since navigation start for whichever outcome happened. |
| `hello_emits` | how many HELLOs went out. |
| drop counters | page-side rejections, by reason. **All-zero on a failed handshake means the bridge never heard the HELLO** — a lifecycle ordering loss, not a rejection. |

The **Copy this row into the runbook table** box is tab-separated; paste it
straight into the tables below.

Settings ride the query string (`?budget=`, `?hello=`, `?reemit=`) so a hard
reload preserves them. Nothing is persisted — no storage, no cookies.

`?budget=1200` is the default and is the **ceiling of the probe range, labelled a
probe**. It is deliberately not a chosen budget: measure with a generous budget
first so the probe itself does not false-positive your runs, then pick the budget
from the distribution afterwards.

## 6. Run the series

### 6a. Primary machine, ≥ 10 cold loads

`https://cogis.ai/spike/s8-2.html?budget=1200` — hard reload between each.

**Run as `?budget=1200&reemit=100`**, because 6d (below) was executed first and
had already shown that a single HELLO at the default emit point never arrives.
Measuring a distribution without the cadence would have produced ten gated runs
and no distribution.

| Run | state | handshake_ms | since_last_hello_ms | first_hello_ms | ready_ms | gate_ms | hello_emits | budget_ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | connected | 115.0 | 7.1 | 303.8 | 418.8 | — | 2 | 1200 |
| 2 | connected | 109.9 | 8.0 | 314.9 | 424.8 | — | 2 | 1200 |
| 3 | connected | 110.0 | 9.0 | 292.7 | 402.7 | — | 2 | 1200 |
| 4 | connected | 113.2 | 11.1 | 353.5 | 466.7 | — | 2 | 1200 |
| 5 | connected | 117.2 | 5.7 | 308.3 | 425.5 | — | 2 | 1200 |
| 6 | connected | 109.9 | 8.9 | 323.4 | 433.3 | — | 2 | 1200 |
| 7 | connected | 116.2 | 8.6 | 290.6 | 406.8 | — | 2 | 1200 |
| 8 | connected | 111.4 | 8.9 | 295.4 | 406.8 | — | 2 | 1200 |
| 9 | connected | 110.9 | 9.5 | 312.7 | 423.6 | — | 2 | 1200 |
| 10 | connected | 111.4 | 7.5 | 308.6 | 420.0 | — | 2 | 1200 |

Machine / OS / Chrome version: **Dell Latitude 5550 (Intel Core Ultra 7 155U @
1700 MHz, 12C/14T) / Windows 11 Business 25H2 (Build 26200.8973) / Chrome
150.0.7871.187 (64-bit, Stable), V8 15.0.245.21.** Extension: dev-unpacked
v0.6.0, flag flipped locally in both mirrors.

Sorted `handshake_ms`: 109.9 109.9 110.0 110.9 111.4 111.4 113.2 115.0 116.2 117.2

min **109.9** p50 **111.4** p95 **117.2** (nearest-rank) max **117.2**

**0 false positives (0/10).** Every run took exactly 2 emits — the first lost to
`document_idle`, the second answered in 5.7–11.1 ms (`since_last_hello_ms`). The
~110 ms `handshake_ms` is therefore mostly the wait for the next 100 ms re-emit
tick, not work the extension is doing.

**Any run that reaches the install-gate here is a false positive and
disqualifies the configuration** (spike: "Any missed handshake at the chosen
budget disqualifies it"). Record it rather than re-rolling it.

### 6b. Second profile, ≥ 3 cold loads

Either a second machine, or the primary under DevTools throttling: **Network →
Slow 4G** and **Performance → CPU: 4× slowdown**. Record which you used, because
the two are not equivalent evidence.

Profile used: **DevTools throttling (Slow 4G + 4× CPU) of the primary machine —
NOT a second machine.** This is the weaker of the two allowed options and the
spike carries it as residual risk R1.

`?budget=1200&reemit=100`, cold:

| Run | state | handshake_ms | since_last_hello_ms | first_hello_ms | ready_ms | gate_ms | hello_emits |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | connected | 371.0 | 65.0 | 3736.9 | 4107.9 | — | 4 |
| 2 | connected | 499.3 | 48.0 | 3744.1 | 4243.4 | — | 5 |
| 3 | connected | 665.3 | 82.3 | 3637.6 | 4302.9 | — | 5 |

min **371.0** max **665.3**. **0 false positives (0/3).**

`first_hello_ms` of ~3.6–3.7 s is the page fetch under Slow 4G. It does **not**
eat the budget: the clock starts at the first HELLO, not at navigation. A slow
network cannot false-positive the gate; only slow content-script injection can.
The cadence needed 4–5 emits to land here versus 2 unthrottled.

### 6c. Warm loads

Uncheck **Disable cache**, soft reload, 3–5 runs. These should be comfortably
under whatever the cold runs show; the budget defends the cold case.

`?budget=1200&reemit=100`:

| Run | state | handshake_ms | since_last_hello_ms | first_hello_ms | ready_ms | hello_emits |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | connected | 113.2 | 9.9 | 222.1 | 335.3 | 2 |
| 2 | connected | 116.7 | 8.4 | 311.7 | 428.4 | 2 |
| 3 | connected | 112.1 | 11.1 | 466.2 | 578.3 | 2 |

**They are not comfortably under the cold runs — they are the same.** 112.1–116.7
sits inside the cold spread of 109.9–117.2. The handshake is dominated by
`document_idle` scheduling and the re-emit tick, not by asset fetch, so the cache
barely moves it. Warm is not a separate regime and the budget does not need to
treat it as one.

### 6d. Emit-point comparison — do this before picking a budget

The content script is `run_at: document_idle`, which fires **after**
`DOMContentLoaded`. Whether a single `COGIS_HELLO` on the `DOMContentLoaded`
tick arrives before the bridge's listener exists is an open question, and if it
does not, the gate false-positives on machines that have the extension.

Extension installed and enabled for all four. **Run first, before 6a–6c**, at
`?budget=1200`:

| Config | state | handshake_ms | since_last_hello_ms | first_hello_ms | ready_ms | gate_ms | hello_emits | drops all zero? |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `?hello=dom-content-loaded` | **GATED** | — | — | 168.3 | — | 1383.1 | 1 | not transcribed |
| `?hello=load` | connected | 15.0 | 15.0 | 381.1 | 396.1 | — | 1 | n/a |
| `?hello=immediate` | **GATED** | — | — | 240.5 | — | 1441.6 | 1 | not transcribed |
| `?hello=dom-content-loaded&reemit=200` | connected | 218.5 | 12.0 | 269.1 | 487.6 | — | 2 | n/a |

**Result: the ordering loss is real on real hardware, and it matches the sandbox
repro from PR #35.** A single HELLO at `dom-content-loaded` or `immediate` gates;
`load` connects in 15.0 ms; the re-emit row connects on its **second** emit
(`since_last_hello_ms` 12.0 against `handshake_ms` 218.5 — the 200 ms difference
is one cadence tick, which is what "the first one was lost" looks like in the
numbers).

**Drop counters for these four rows were not separately transcribed** — the
cells are marked rather than back-filled. The zero-drop signature was observed
live during the two pre-measurement blockers above and in PR #35's sandbox pass
over these same configs; the attribution here rests on the lifecycle argument
plus those observations, not on a column that was never written down. Anyone
re-running 6d should transcribe the drop counters.

`?hello=load` was **rejected as the fix** despite connecting fastest: it makes
the install decision hostage to the `load` event, which under Slow 4G lands
seconds after the user is already staring at the page (see 6b's
`first_hello_ms` ≈ 3.7 s).

If the `dom-content-loaded` single-HELLO row gates while `load` or the re-emit
row connects, the handshake is being lost to lifecycle ordering. **That is an
addendum §3.9 change** (which emit point, or whether a re-emit cadence is part
of the contract) — escalate it; do not let the page paper over it, and do not
treat the resulting budget as valid until it is settled.

**Escalated and resolved:** addendum **v0.1.1** amends §3.9 — the page MAY
re-emit `COGIS_HELLO` at a **100 ms** cadence carrying the **same nonce**,
stopping on the first `COGIS_READY`, with the budget clock running from the
first emit. No extension-side change was required; same-nonce repeats were
already idempotent on the bridge.

## 7. Behavioural observations

Each of these is a spike row waiting on a description, not a number.

1. **Extension removed.** Remove it, hard reload. Expect the install-gate.
   Record how long after the budget the gate visibly renders.
2. **Extension disabled per-origin.** `chrome://extensions` → the extension →
   **Site access** → remove `cogis.ai` (or set *On click*). Hard reload. Confirm
   it looks **identical** to "not installed" and that the page does not hang.
3. **Incognito.** Do not grant Incognito access. Open the harness in an
   Incognito window. Record exactly what renders — the spike offers two
   acceptable answers (a normal install-gate, or gate plus "Enable Cogis in
   Incognito to search" copy) and asks you to pick one.
4. **Late reply.** `?budget=1&hello=load` forces `COGIS_READY` to arrive after
   the gate. Confirm the gate is **not** un-rendered, that the timing panel shows
   `late READY after gate: 1 (gate NOT un-rendered)`, and then decide whether
   that is the UX you want. The spike's default is to ignore late replies; the
   row stays open until you confirm the *judgement*, not the code.

### Observations — recorded 2026-07-31

Run at `?budget=900&reemit=100` unless noted.

| # | Case | Observed |
| --- | --- | --- |
| 1 | **Disabled per-origin** (`cogis.ai` site access off) | **GATED.** `first_hello_ms` 293.0; gate at **1194.7 ms** since navigation = first HELLO + 900 + ≈ 1.7 ms. 9 emits, all unanswered. Late `COGIS_READY`: none. Renders the **identical** install-gate to "not installed" — no per-origin state leaked. **PASS.** |
| 2 | **Incognito** (no Incognito access granted) | **GATED, plain install-gate.** `first_hello_ms` 559.3; gate at **1463.4 ms** = first HELLO + 900 + ≈ 4.1 ms. 9 emits. Late `COGIS_READY`: none. Outcome = the spike's **option 1** (normal install-gate, no Incognito-specific copy). **LOCKED.** |
| 3 | **Late reply** (`?budget=1&hello=load`) | **GATED at 1 ms budget**, gate rendered at **367.5 ms** since navigation (`first_hello_ms` 336.5). `COGIS_READY` then arrived late and the panel reported `late READY after gate: 1 (gate NOT un-rendered)`. Gate stayed on screen. **PASS — confirmed live on real hardware.** |
| 4 | **Copy check** | Gate renders **"Install the Cogis Chrome extension to search."** (visible in the E1/E2 screenshots). **LOCKED** as drafted; Incognito uses the same copy. |

**Gate-render latency across both timed gated runs: budget + ≤ 4.1 ms** after the
first HELLO. The render allowance does not need a budget line of its own.

**Extension physically removed was not separately timed.** Case 1 is
protocol-indistinguishable from it (bridge absent, zero READY, zero drops) and
stands in for it; the spike's false-negative row says so explicitly rather than
implying a run that did not happen.

**One invalid attempt, discarded:** the first late-reply try used a malformed
URL — `?budget=900&reemit=100?budget=1&hello=load` — with a second `?` instead of
`&`, so the budget stayed at 900 and the page simply connected at 40.7 ms. It
proved nothing and was re-run clean as case 3 above.

Notes: both blockers at the top of this file were hit and cleared before any of
the above was recorded.

## 8. Pick the budget

With the distribution in hand:

- Start from the cold-load p95 on the **slowest** profile you measured, plus
  headroom.
- It must land inside **400–1200 ms**. Outside that range is Tier 3 — escalate
  rather than choosing.
- Re-verify: at the chosen number, every installed run in 6a and 6b must have
  connected. `?budget=<candidate>` and a few more cold loads is the cheap check.
- Write the defence down in the spike's `Handshake budget` row — the number
  alone is not the finding, the distribution that justifies it is.

### Chosen: 900 ms

The unthrottled p95 (117.2) is useless as a starting point here — the spread
across 10 runs is 7.3 ms, so "p95 plus headroom" would produce a number with no
defence at all against the throttled tail. The budget is sized against the
**throttled max (665.3)** instead:

- 900 ≈ **1.35×** the worst handshake ever observed on an installed machine.
- 900 ≈ **7.7×** the unthrottled cold p95.
- 900 sits **300 ms below** the Tier-2 ceiling, leaving room to move for a
  genuinely slower profile without a Tier-3 escalation.

**Verification — throttled (Slow 4G + 4× CPU), `?budget=900&reemit=100`, cold:**

| Run | state | handshake_ms | since_last_hello_ms | first_hello_ms | ready_ms | hello_emits | budget_ms |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | connected | 511.5 | 87.8 | 3807.9 | 4319.4 | 4 | 900 |
| 2 | connected | 501.0 | 67.9 | 3902.7 | 4403.7 | 5 | 900 |
| 3 | connected | 496.9 | 50.5 | 3768.0 | 4264.9 | 5 | 900 |

3/3 connected with the timer **actually armed** at 900.

**The first verification attempt was mis-parameterised** and is recorded rather
than quietly dropped: it ran at `?budget=1200` while claiming to verify 900.
Its handshakes — throttled 564.1 / 599.2 / 501.5, unthrottled 111.8 / 115.0 —
are all under 900 and count as valid evidence in the false-positive tally, but
they are **not** a verification, because the number under test was not the
number armed. The `budget_ms` column is what made this visible in the
transcribed row instead of invisible in the operator's memory. Keep that column.

**Total: 0 false positives across 24 installed runs** (10 cold + 3 throttled@1200
+ 3 warm + 5 mis-parameterised@1200 + 3 throttled@900), worst handshake 665.3 ms.

## 9. Close out

1. Fill every `TBD` in `s8-2-install-gate-latency.md` you now have evidence for.
2. Enumerate residual risks (very slow machines above budget, extension-update
   reload windows, SW eviction) and how M8b's AC #1/#2 defend against each.
3. Lock the install-gate copy.
4. Tick the Definition of done boxes, flip **Status** off `OPEN`, and commit.
5. Revert the flag flip (step 1) and confirm `npm test` is green.

Only then does M8b PR-B implement against the number.

**Done, 2026-07-31.** Spike **CLOSED**, budget **900 ms**, addendum bumped to
**v0.1.1** with the §3.9 re-emit amendment. Note on step 2: SW eviction was
**retired, not mitigated** — the `COGIS_READY` reply is synchronous from the
content script, so the service worker is not on the handshake reply path at all.
See the spike's residual risks R1–R5.
