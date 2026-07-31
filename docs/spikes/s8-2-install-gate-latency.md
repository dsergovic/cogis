# S8.2 — Install-gate detection latency

**Status:** **OPEN — stub.** Not a finding. Every field below is `TBD`.
**Owner:** Human + Perplexity — **or** the first task inside M8b (see `docs/agent_blueprint-m8-web-surface.md` §6) if this file is still a stub when M8b is handed off.
**Confidence:** None. Nothing here has been observed live.

> **This file does not authorize any implementation claim.** A `TBD` field is not a default to code against — it is a question. M8b cannot claim its install-gate AC against a stub. Fill this in from **live observation of real cold loads on real machines**, commit it, then implement against it.
>
> **Do not invent a handshake budget from a whiteboard.** A budget that is too short false-positives the install-gate on machines that actually have the extension; a budget that is too long makes the "no extension" case feel broken. Both are user-visible harm; pick a number that survives the measured distribution, not one that looks tidy.

## Decisions to lock for M8b

| Field | Finding |
| --- | --- |
| **Handshake budget (ms)** | **TBD.** The addendum recommends a *probe range* of **400–1200 ms**; the spike picks one number inside that range and defends it. Outside the range is Tier 3, not Tier 2. |
| **Measurement fixture** | **TBD.** Describe how latency is measured (`performance.now()` at page emit vs page receive; a hidden debug field on `COGIS_READY` carrying the SW-side timestamp is acceptable if it is stripped from the shipped envelope). |
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

## Residual risks

**TBD** — to be enumerated once the budget is chosen. Likely candidates: cold-start on very slow machines exceeding the budget, extension-update reloads producing a transient no-handshake window, service-worker eviction between the page load and the handshake. Record each and how M8b's AC #1 and #2 defend against it.

## Definition of done

- [ ] Handshake latency measured on ≥ 10 cold loads on ≥ 2 machine profiles (or 1 machine + throttled DevTools profile)
- [ ] Budget picked and defended with the measured distribution
- [ ] False-positive rate at chosen budget observed to be 0/N on installed runs
- [ ] Install-gate render latency measured on uninstalled runs
- [ ] Extension-disabled-per-origin case observed
- [ ] Incognito case observed and behavior recorded
- [ ] Late-reply behavior confirmed (ignore, do not un-render)
- [ ] Install-gate copy locked
- [ ] Residual risks enumerated with mitigations
