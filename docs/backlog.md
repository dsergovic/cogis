# Cogis backlog

Open follow-ups that are **not** binding Phase 1 blueprint work.  
Pick up during polish, the next natural milestone, or a short fix branch.  
Do **not** treat this file as agent context unless the operator attaches it.

**Integration branch:** `dev`  
**Last updated:** 2026-07-31 (M8c live smoke)

---

## How to use

| Status | Meaning |
| --- | --- |
| `open` | Not done |
| `deferred` | Consciously postponed (OK to ship without) |
| `done` | Fixed; leave a one-line note + date, prune later |

Add new rows at the top of the relevant section. Prefer one line + link to PR/issue when useful.

---

## Deferred from M1 (ChatGPT E2E)

| ID | Status | Item | Notes |
| --- | --- | --- | --- |
| BL-001 | open | **Tab close on cancel race** | Pass-1 on PR #16 rejected the first fix (await-via-activeId unreachable after popup CANCEL; skip-all-close → permanent litter). Pass-2 in flight: cancel-by-`searchState` + epoch freshness + close orphans not in newer `state.tabs`. Keep open until verify-only + operator smoke. |
| BL-002 | open | **SW / popup orchestration tests** | Unit suite covers pure helpers + WAR graph; little/no direct `chrome.runtime` / `chrome.tabs` / popup watchdog coverage. Gap that hid timeout and tab races in review. Add mocked-chrome tests when touching SW next. |
| BL-003 | open | **Live redacted fixtures** | M1 shipped stub fixtures. After successful local smokes, optionally replace with redacted live session/search shapes and pin confirmed `query` vs `q` in `local-pack` if not already locked in code. |
| BL-004 | open | **Icons** | Placeholder icons OK for dev-unpacked; replace before any store/public packaging. |
| BL-005 | open | **`chat.openai.com` host** | Still in host_permissions / matches for redirect legacy. Drop if unused after a period of chatgpt.com-only use. |

**M1 smoke (2026-07-28):** Unpacked load, empty hint, logged-in search, deep link `/c/{id}`, nonsense empty, in-flight cancel, overall product feel — **passed** (operator). WAR + unified adapter path validated in the wild.

---


## UI / product polish

| ID | Status | Item | Notes |
| --- | --- | --- | --- |
| BL-034 | open | **Collapse all / Expand all on the web surface** | Two links at the top of the results region that drive every group's collapsed state at once. Depends on BL-033 (there is nothing to drive until per-group collapse exists on the page). Session-only like BL-020 — no persisted preference, no new `chrome.storage` key, no page-side storage (§8.1: the page stores nothing). Worth considering for the popup too once the page pattern is proven; the popup has per-lab collapse but no all-at-once control. |
| BL-033 | open | **Per-lab collapse/expand toggle on the web surface** | BL-020 shipped this in the popup (down-arrow button left of each lab name, session-only `data-cogis-collapsed`, keyboard-focusable with `:focus-visible`); the M8c `cogis.ai` page did not inherit it. Port the popup pattern to `web/assets/js/render.js` + `web/assets/css/site.css`. Constraint: the `--group-min-h` reservation exists so the layout cannot jump before the first chunk lands (§6 M8b AC #8) — a collapse toggle must not defeat it while a group is still `loading`. Noted during the M8c live smoke, 2026-07-31. |
| BL-020 | done | **Per-lab collapse/expand toggle** | Shipped on `feature/hotfix-smoke-tabs-collapse`: down-arrow button left of each lab name; session-only (`data-cogis-collapsed`); keyboard-focusable with `:focus-visible`. |
| BL-021 | open | **M2 Spaces enumeration (gated)** | Perplexity Space-only threads deferred: `SPACE_THREAD_ENUMERATION_ENABLED=false` until one list endpoint is live-proven; then enable under fetch/space caps. |
| BL-022 | open | **M3 Claude Projects live confirmation** | Projects directory + `…/projects/{id}/conversations` inferred (S2 residual #2). Adapter keeps ladder (breadth-first page-1) but treats directory/all-fetch/truncated/budget-skip as coverage-unproven → `unavailable`/`timeout` (not false `empty`). Confirm routes in Network tab; then tighten README and drop caveat. |
| BL-023 | open | **M3 Claude DOM Recents fallback** | S2/blueprint mention DOM Recents/search fallback; M3 ships endpoint-only (M1/M2 precedent). Discuss before calling M3 complete if live endpoints drift; optional content-script Recents filter. |
| BL-024 | open | **M3 Claude soft page-ceiling empty copy** | Soft root (~100) / per-project (~60) caps still authorize `empty` by design (pass-4 product call; Codex would gate). Options: (1) docs-only — current; (2) `empty` + legible “most recent ~N” copy/errorCode; (3) treat ceiling like truncated (never empty). Parent prefers (1) now, optional (2) later. |
| BL-025 | open | **M4 Gemini live selector polish** | S4 residual #1: thinnest platform / highest CSS churn. Pack selectors are stub-level (`historyItem` = `a[href*="/app/"]`). Confirm against a logged-in personal account; tighten `local-pack` without changing honesty rules. |
| BL-026 | open | **M4 Gemini multi-account / chooser** | S4 residual #3: Google account chooser may confuse which session a background tab uses. Documented limitation; optional future: prefer active Gemini tab’s account chip over opening a new tab. |
| BL-027 | open | **M4 Gemini deep-link fragility** | S4 residual #2: occasional `/app/{id}` breakage after Google-side changes. Cascade already falls back to `https://gemini.google.com/app`. Re-verify in operator smoke; no fake deep links. |
| BL-028 | open | **M8 HTML conformance validator** | §6 M8b AC #12 says "HTML validates". `tests/unit/page-contract-parity.test.js` covers structural sanity only (doctype, `lang`, balanced containers, charset/title) because a real validator (`html-validate`, `vnu`) is a new devDependency and the stack lock keeps `web/` toolless. Add one when the page grows past two files, or accept the structural check as the standing bar. |

## S8.2 close-out follow-ups (from PR #36 review)

| ID | Status | Item | Notes |
| --- | --- | --- | --- |
| BL-030 | open | **`docs/spikes/README.md` S8.1 row stale** | S8.1 row still reads "Open — stub only"; the spike is CLOSED (see `docs/spikes/s8-1-postmessage-handshake-contract.md` and `docs/case-studies/s8-1-case-study.md`). Left untouched in PR #36 as out of scope. Two-line sync — a browsing inconvenience, not a factual conflict, since the spike file itself is authoritative. |
| BL-031 | open | **Promote R2 to a spike stub (post-M8e)** | S8.2 R2 (`docs/spikes/s8-2-install-gate-latency.md` §Residual risks): extension update/reload leaves a transient no-handshake window on already-open `cogis.ai` tabs. The re-emit cadence does **not** help — re-emitting into a tab with no listener is still nothing. Not measured; not a blocker for M8b/M8c/M8d. Worth an explicit stub (`docs/spikes/s8-4-update-window-gap.md` or similar) before M8e / Web Store publish, when auto-update lands in the wild. Cost is one stale tab showing an install-gate until reloaded. |
| BL-032 | open | **Delete `github-pages` deployment branch rule for `spike/s8-2-install-gate-latency`** | Rule added to the `github-pages` environment on 2026-07-31 so `workflow_dispatch` from the spike branch could publish the harness to `cogis.ai/spike/s8-2.html` for measurement. Merging PR #36 restores the `dev`-only publish posture in the workflow; the environment rule should be removed to match. Safety cleanup, no functional impact until someone next dispatches from an unmerged branch. |

## Cross-cutting / later milestones

| ID | Status | Item | Notes |
| --- | --- | --- | --- |
| BL-012 | open | **Project glossary** | Add `docs/glossary.md` as project-specific terminology (agents, labs, adapters, packs, WAR, capability labels, states, milestones, spikes, addenda, etc.) accretes. Populate incrementally as new terms enter the docs; cross-link from `README.md` and `docs/agent_blueprint.md` §1. Living reference, not a full audit. |
| BL-010 | open | Operator quick note → GitHub Issue | Separate product idea (pre-filled issue URL; no stored PAT). Not in M1–M6 locks. Track outside or promote to a future milestone when ready. |
| BL-011 | open | Promote `dev` → `main` | Human gate when a stabler line is wanted; not every milestone. |

---

## Parking lot (do not implement without blueprint change)

- Extra platforms beyond ChatGPT / Perplexity / Claude / Gemini  
- Result caching, cloud sync, accounts  
- PortableAI / PortableChat coupling (explicitly out of scope)  
- Bundlers / frameworks (blueprint stack lock)

---

## Changelog

| Date | Change |
| --- | --- |
| 2026-07-28 | Initial backlog after M1 smoke pass; BL-001 deferred by operator choice. |
| 2026-07-29 | BL-020 per-lab collapse toggle; BL-021 gated Spaces follow-up after M2 scope narrow. |
| 2026-07-29 | BL-022 Claude Projects live confirmation; BL-023 Claude DOM Recents fallback (M3 review). |
| 2026-07-29 | BL-024 Claude soft page-ceiling empty copy (pass-4 product call). |
| 2026-07-29 | BL-025/026/027 Gemini live selectors, multi-account chooser, deep-link fragility (M4 S4 residuals). |
| 2026-07-30 | BL-001 tab litter / supersede close race + BL-020 per-lab collapse marked done (hotfix branch). |
| 2026-07-31 | BL-030/031/032 S8.2 close-out follow-ups (PR #36 review nits): README S8.1 row sync, R2 update-window stub, github-pages deployment branch rule cleanup. |
| 2026-07-31 | BL-028 HTML conformance validator gap recorded while landing M8b PR-B. |
| 2026-07-31 | BL-033/034 web-surface collapse controls filed from the M8c live smoke (PR #39 merged). |
