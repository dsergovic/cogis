# S8.2 measurement runbook

Click-by-click procedure for the operator taking the S8.2 cold-load
measurements. The spike itself — what the numbers mean and which rows they
close — is `s8-2-install-gate-latency.md`; the protocol summary there and the
steps here are the same procedure at two levels of detail.

> **You are the instrument here, not the code.** Nothing in this repo may fill a
> measured field in the spike doc. Every number below is transcribed by hand from
> a real cold load on real hardware.

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

| Run | state | handshake_ms | since_last_hello_ms | first_hello_ms | ready_ms | gate_ms | hello_emits | budget_ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 |  |  |  |  |  |  |  |  |
| 2 |  |  |  |  |  |  |  |  |
| 3 |  |  |  |  |  |  |  |  |
| 4 |  |  |  |  |  |  |  |  |
| 5 |  |  |  |  |  |  |  |  |
| 6 |  |  |  |  |  |  |  |  |
| 7 |  |  |  |  |  |  |  |  |
| 8 |  |  |  |  |  |  |  |  |
| 9 |  |  |  |  |  |  |  |  |
| 10 |  |  |  |  |  |  |  |  |

Machine / OS / Chrome version: _______________

min ____ p50 ____ p95 ____ max ____

**Any run that reaches the install-gate here is a false positive and
disqualifies the configuration** (spike: "Any missed handshake at the chosen
budget disqualifies it"). Record it rather than re-rolling it.

### 6b. Second profile, ≥ 3 cold loads

Either a second machine, or the primary under DevTools throttling: **Network →
Slow 4G** and **Performance → CPU: 4× slowdown**. Record which you used, because
the two are not equivalent evidence.

Profile used: _______________

| Run | state | handshake_ms | first_hello_ms | ready_ms | gate_ms | hello_emits |
| --- | --- | --- | --- | --- | --- | --- |
| 1 |  |  |  |  |  |  |
| 2 |  |  |  |  |  |  |
| 3 |  |  |  |  |  |  |

### 6c. Warm loads

Uncheck **Disable cache**, soft reload, 3–5 runs. These should be comfortably
under whatever the cold runs show; the budget defends the cold case.

| Run | handshake_ms | first_hello_ms |
| --- | --- | --- |
| 1 |  |  |
| 2 |  |  |
| 3 |  |  |

### 6d. Emit-point comparison — do this before picking a budget

The content script is `run_at: document_idle`, which fires **after**
`DOMContentLoaded`. Whether a single `COGIS_HELLO` on the `DOMContentLoaded`
tick arrives before the bridge's listener exists is an open question, and if it
does not, the gate false-positives on machines that have the extension.

Extension installed and enabled for all four:

| Config | state | handshake_ms | hello_emits | drops all zero? |
| --- | --- | --- | --- | --- |
| `?hello=dom-content-loaded` |  |  |  |  |
| `?hello=load` |  |  |  |  |
| `?hello=immediate` |  |  |  |  |
| `?hello=dom-content-loaded&reemit=200` |  |  |  |  |

If the `dom-content-loaded` single-HELLO row gates while `load` or the re-emit
row connects, the handshake is being lost to lifecycle ordering. **That is an
addendum §3.9 change** (which emit point, or whether a re-emit cadence is part
of the contract) — escalate it; do not let the page paper over it, and do not
treat the resulting budget as valid until it is settled.

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

Notes: _______________

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

## 9. Close out

1. Fill every `TBD` in `s8-2-install-gate-latency.md` you now have evidence for.
2. Enumerate residual risks (very slow machines above budget, extension-update
   reload windows, SW eviction) and how M8b's AC #1/#2 defend against each.
3. Lock the install-gate copy.
4. Tick the Definition of done boxes, flip **Status** off `OPEN`, and commit.
5. Revert the flag flip (step 1) and confirm `npm test` is green.

Only then does M8b PR-B implement against the number.
