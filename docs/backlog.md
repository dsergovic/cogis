# Cogis backlog

Open follow-ups that are **not** binding Phase 1 blueprint work.  
Pick up during polish, the next natural milestone, or a short fix branch.  
Do **not** treat this file as agent context unless the operator attaches it.

**Integration branch:** `dev`  
**Last updated:** 2026-07-29

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
| BL-001 | deferred | **Tab close on cancel race** | When Cogis auto-opens a ChatGPT tab, fire-and-forget cancel/`tabs.remove` can race a superseding search that already adopted the tab → brief `unavailable` on rapid A→B search. Optional tab-litter cleanup. **Human accepted deferral after full M1 smoke (2026-07-28).** Fix: skip close while a newer `requestId` is active, or drop auto-close. |
| BL-002 | open | **SW / popup orchestration tests** | Unit suite covers pure helpers + WAR graph; little/no direct `chrome.runtime` / `chrome.tabs` / popup watchdog coverage. Gap that hid timeout and tab races in review. Add mocked-chrome tests when touching SW next. |
| BL-003 | open | **Live redacted fixtures** | M1 shipped stub fixtures. After successful local smokes, optionally replace with redacted live session/search shapes and pin confirmed `query` vs `q` in `local-pack` if not already locked in code. |
| BL-004 | open | **Icons** | Placeholder icons OK for dev-unpacked; replace before any store/public packaging. |
| BL-005 | open | **`chat.openai.com` host** | Still in host_permissions / matches for redirect legacy. Drop if unused after a period of chatgpt.com-only use. |

**M1 smoke (2026-07-28):** Unpacked load, empty hint, logged-in search, deep link `/c/{id}`, nonsense empty, in-flight cancel, overall product feel — **passed** (operator). WAR + unified adapter path validated in the wild.

---


## UI / product polish

| ID | Status | Item | Notes |
| --- | --- | --- | --- |
| BL-020 | open | **Per-lab collapse/expand toggle** | On each platform **card header** (left of the lab name): control to collapse/expand that lab’s result list. Persist not required for V1 (session-only OK). Keep keyboard/focus reasonable. |
| BL-021 | open | **M2 Spaces enumeration (gated)** | Perplexity Space-only threads deferred: `SPACE_THREAD_ENUMERATION_ENABLED=false` until one list endpoint is live-proven; then enable under fetch/space caps. |

## Cross-cutting / later milestones

| ID | Status | Item | Notes |
| --- | --- | --- | --- |
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
