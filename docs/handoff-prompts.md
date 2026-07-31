# Cogis — Hand-Off Prompts (Phase 2)

**This file is the official source of truth for all Cogis hand-off prompts — implementer and reviewer, M1 through M7, plus M8 sub-milestones.**

Do not keep parallel copies of these prompts in chat memory, session notes, or a scratch doc. If a prompt needs to change, change it **here** and reference it. If a chat contains a prompt that disagrees with this file, this file wins.

Framework: [Full-Lifecycle Agentic Software Engineering v1.1.0](https://github.com/dsergovic/research/blob/main/docs/Full-Lifecycle%20Agentic%20Software%20Engineering.md)  
Blueprint: `docs/agent_blueprint.md`  
M8 addendum: `docs/agent_blueprint-m8-web-surface.md` (authorizes the M8 web search surface; source of truth for M8 sub-milestones)  
Spikes: `docs/spikes/` (S1–S6 resolved 2026-07-28; **S7 Grok open**, **S8.1–S8.3 open** — stub only, live fill-in required)  
Backlog: `docs/backlog.md`

## How this file is used: attach once, paste one paragraph

**Attach this file in Cursor** alongside `docs/agent_blueprint.md` (and `docs/agent_blueprint-m8-web-surface.md` for M8 sub-milestones) and the milestone's spike findings. Then paste **only** the short ready-to-paste block from §5 for the one milestone you are handing off.

The operator's clipboard work is one paragraph. Everything long — the Definition of Done (§2), the self-check tables (§3), the known traps (§4) — stays **in this file** as the agent's checklist. The agent reads those sections from the attached file and copies the relevant §3 table into the PR body itself. **The operator never pastes §2, §3, or §4 into a chat.**

Two rules survive from the older operator-only posture:

- **The agent implements only the milestone named in the pasted prompt.** Attaching this file exposes every milestone's prompt; that is not an invitation to start M4 while M3 is open, or to read ahead and pre-build.
- **§1, §7, and §8 remain operator work.** Branch cutting, local prerequisites, and the smoke list are not agent tasks.

## What is in this file

| § | Section | Who reads it |
| --- | --- | --- |
| 1 | Hand-off checklist | Operator |
| 2 | Definition of Done before opening the PR | Implementer, from the attached file |
| 3 | Self-check tables (3.1 platform M1–M4 **and M7**; 3.2 data/UI M5–M6) | Implementer copies the applicable table into the PR body |
| 4 | Known traps (permanent) | Implementer, from the attached file |
| 5 | **Implementer hand-offs (Cursor)** — template + short paste blocks M1–M7 | Operator pastes one block |
| 6 | **Dual-review hand-offs (Perplexity Computer)** — policy + short paste blocks | Operator pastes one block; reviewers read §6.1–§6.2 from the repo |
| 7 | Local prerequisites | Operator |
| 8 | Operator smoke (Phase 4 quick list) | Operator |

---

## 1. Hand-off checklist (once per milestone)

1. `git checkout dev && git pull` — cut the milestone branch from current **`dev`** (integration / day-to-day working area; not `main`).
2. Confirm the spike finding for this milestone is merged and you accept it (S1→M1, S3→M2, S2→M3, S4→M4, S7→M7; S5/S6 are cross-cutting and already folded in). **S7 is the exception:** it ships as an open stub, so either you fill it in first (Human/Computer) or the M7 prompt makes writing it the agent's first task.
3. Open the repo in Cursor and start a **fresh agent chat** (never reuse a prior milestone's chat).
4. Attach context — **this is the step that replaces copy-paste**: `@docs/agent_blueprint.md` **and `@docs/handoff-prompts.md`** (so §2, §3, and §4 are readable in-chat without you pasting them).  
   For platform milestones also attach:
   - M1: `@docs/spikes/s1-chatgpt-search-contract.md` `@docs/spikes/s5-auth-state-detection.md` `@docs/spikes/s6-long-history-reach.md`
   - M2: `@docs/spikes/s3-perplexity-thread-contract.md` + S5/S6
   - M3: `@docs/spikes/s2-claude-recents-contract.md` + S5/S6
   - M4: `@docs/spikes/s4-gemini-history-contract.md` + S5/S6
   - M7: `@docs/spikes/s7-grok-history-contract.md` + S5/S6 — attach the file even while it is an open stub; the §5.7 prompt tells the agent to author the finding from live investigation as task 1 if it is still `TBD`.
   - M8a: `@docs/agent_blueprint-m8-web-surface.md` `@docs/spikes/s8-1-postmessage-handshake-contract.md` + S5 (S6 is not relevant — no history reach). **Attach the addendum, not the parent blueprint alone** — the addendum is the M8 source of truth. S8.1 attaches even while it is an open stub; the §5.8 prompt tells the agent to author the finding from live investigation as task 1 if it is still `TBD`.
   - M5/M6: no spikes — the two attachments above are the whole set (plus M5 notes in blueprint §10).
5. Enable terminal auto-run for `npm`, `node`, `git` as you prefer; deny force-push and merge to `dev` or `main`.
6. Paste **only** the short §5.x block for this one milestone. Do **not** paste §2, §3, or §4 by hand — the block tells the agent to read them from the attached file. Step away.
7. On the agent's PR: run the dual review per §6, then run the §8 operator smoke yourself with `extension/` loaded unpacked.
8. Merge to `dev` yourself once review and smoke pass, then reconcile blueprint Version/Changelog and `docs/backlog.md` (Phase 4). Promote `dev` → `main` only as a separate human gate when you want a stabler line.

**Agent must not merge.** Prefer the agent opens the PR; if your prompt says not to open one, you open it.

---

## 2. Definition of Done before opening the PR

Every implementer prompt in §5 points here. An agent that has not satisfied all of the following has not finished the milestone, regardless of how much code it wrote.

### 2.1 Green gates

```bash
npm test
npm run lint
npm run format:check
```

All three pass locally on the branch head that gets pushed. `docs/` and `AGENTS.md` are Prettier-ignored; `README.md` is **not** — README edits must survive `format:check`.

### 2.2 PR body: Choices made

- Every Tier 2 decision, one bullet each, with the reason.
- **Every residual risk listed in the attached spike finding(s) appears here** with how the implementation handles it — verified live, handled behind an honest coverage signal, or deferred with a `BL-0xx` backlog ID. A spike residual risk that is silently absent from Choices made is an incomplete hand-off.
- Any deviation from a blueprint preference, flagged as Tier 2 or escalated as Tier 3 — never silently swapped.

### 2.3 PR body: Self-check table

Complete the self-check table from §3 in the PR body — **§3.1 for platform milestones (M1–M4 and M7)**, **§3.2 (shorter) for M5–M6**. Every row gets a concrete evidence pointer (test name, `file:line`, or "operator smoke — pending"), not a bare checkmark. Rows that cannot be proven yet are marked **unverified** with a backlog ID; they are not marked done.

### 2.4 Honesty rules (non-negotiable)

- **No overclaiming.** Do not write "never returns a false empty", "fully covered", or "live-verified" unless a test or a captured live response proves it. Unproven ⇒ say *unverified* and add the backlog row.
- **Soft reach ceilings are not truncation.** A documented page/scan ceiling that reports `empty` by design (unread older history is a platform limit) must be described **separately** from failure truncation, which must never report `empty`. Conflating the two in either direction is a blocker: it either hides real failures or turns a known limit into a fake error.
- **Test-plan checkboxes are claims.** Leave unchecked what you did not run; never pre-tick operator smoke.

### 2.5 Where M5/M6 differ — and where M7 does not

M5 (data-only selector pack) and M6 (debug panel + optional ping) have no lab fan-out, no auth mapping, and no container-coverage problem. They use the shorter §3.2 table. §2.1, §2.2, and §2.4 still apply in full — for M5/M6 the honesty rules bite on *fail-closed* and *default-off* claims instead of on `empty`.

**M7 (Grok) is not one of these.** It adds a fifth lab, so it is a **platform** milestone exactly like M1–M4: full lab fan-out, auth mapping, container coverage, and the `empty`-honesty rules in their original form. M7 uses the **§3.1** table, not §3.2, and the §4 traps apply to it in full.

### 2.6 Where M8 sub-milestones sit

M8 sub-milestones (M8a–M8e) are **surface** milestones, not platform ones. They introduce the `cogis.ai/` web surface and the `postMessage` bridge that backs it, but they add **zero** platforms and change **zero** adapters (parent blueprint §4.1 platform set stays frozen through M8; adapter changes during M8 are a separate hotfix branch, not M8 work — addendum §6 global constraint).

They use the **§3.2 (data/UI) self-check table as the primary rubric** — the same honesty rules that bind M5/M6 (fail-closed, default-off, data-only) bind the bridge (drop-and-count on origin/nonce/envelope mismatch, `WEB_SEARCH_SURFACE_ENABLED=false` produces zero observable effect, no page-side execution of anything the bridge sends).

On top of §3.2, every M8 sub-milestone also completes the **§3.3 M8 bridge / surface checklist** below. §2.1, §2.2, and §2.4 still apply in full; the §4 Known traps for platform milestones do **not** apply to M8 sub-milestones except where a live-behavior regression against M1–M7 shows up in §3.2 SD-5.

**Source of truth for M8 behavioral AC is `docs/agent_blueprint-m8-web-surface.md` (the M8 addendum), not the parent blueprint** — parent blueprint §§3, 6, 8, 9, 10, 12, 14 are pending a future `v0.4.0` reconciliation. When the addendum and the parent disagree on anything M8-related, the addendum wins until reconciliation lands.

---

## 3. Self-check tables

**The implementer copies the applicable table out of this file into the PR body and fills the evidence column.** The operator does not paste these tables into the chat — the agent has the file attached and reads it here.

### 3.1 Platform milestones (M1–M4, M7)

| # | Check | Evidence |
| --- | --- | --- |
| SC-1 | **Honesty matrix** — for each terminal state (`hits`, `empty`, `login`, `unavailable`, `timeout`) list the exact conditions that authorize it, and confirm no unproven-coverage path can reach `empty` | |
| SC-2 | **Partial hits are success** — if any authenticated page or container returned results, the group reports those hits (with a partial/truncation signal), never a blanket `unavailable` | |
| SC-3 | **Incomplete coverage ≠ empty** — HTTP failure, deadline or fetch truncation, unattempted containers, failed containers, and budget skips resolve to `unavailable`/`timeout`; only a fully scanned window with zero matches yields `empty` | |
| SC-4 | **Mixed failure** — one container succeeds while another fails ⇒ coverage is `truncated`; mixed success must not authorize `empty` | |
| SC-5 | **Auth mapping** — `401` ⇒ login copy; `403` ⇒ `unavailable` **unless** a login shell is detected (then login); the login-shell signal has a test | |
| SC-6 | **Cap after filter** — with a client-side title filter: normalize the full page **uncapped** → filter → then apply the max-results cap. Capping before the filter silently drops hits | |
| SC-7 | **Content-script reachability** — an already-open lab tab is adopted only after the content script is confirmed reachable; otherwise inject or open per the readiness rules | |
| SC-8 | **Discarded tab** — a discarded, frozen, or unloaded lab tab is reloaded or replaced, not treated as ready | |
| SC-9 | **Cancel isolation** — superseded `requestId` results are dropped across every wired platform, and cancel does not tear down a newer in-flight request or the tab it already adopted | |
| SC-10 | **errorCode diagnosability** — every non-hit terminal state carries a specific `errorCode`, surfaced at least in the console so operator smoke can tell causes apart | |
| SC-11 | **Prior-milestone regression** — all earlier milestones' behavioral AC still hold; name the tests or smoke steps that prove it | |
| SC-12 | **Reach ceilings** — soft caps documented as `empty`-by-design platform limits (README + selector pack notes), textually separate from failure truncation | |
| SC-13 | **Spike residual risks** — each residual risk from the attached spike(s) is addressed in Choices made, with a backlog ID where deferred | |
| SC-14 | **Privacy** — no auth token or message-body persistence; the normalizer drops body fields when present in a raw lab payload, with a fixture proving it | |

### 3.2 Data / UI milestones (M5–M6) and M8 sub-milestones (primary rubric)

| # | Check | Evidence |
| --- | --- | --- |
| SD-1 | **Fail-closed / default-off proven by test** — M5: remote unreachable or malformed ⇒ local pack; M6: ping off ⇒ zero network calls; **M8: `WEB_SEARCH_SURFACE_ENABLED=false` ⇒ zero observable effect from any `webBridge:*` message** | |
| SD-2 | **Data-only, no execution** — no `eval`, no `new Function`, no dynamic remote import; executable-looking payload keys are rejected (M5); **the bridge never eval/execs anything from the page and never posts anything to the page until a valid `COGIS_HELLO` (M8)** | |
| SD-3 | **Privacy** — query text is never stored in `chrome.storage` or transmitted anywhere the popup wouldn't already send it; the panel shows no message bodies (M6); **`cogis.ai` origin never receives query text; the bridge never exposes cookies, tokens, DOM contents, or adapter internals to the page (M8)** | |
| SD-4 | **Diagnosability** — pack version, per-platform status, and `errorCode` are visible to the surface this milestone owns; **M8: bridge drop counters (origin/nonce/malformed) visible in the M6 debug panel from M8d onward, or in the console before then** | |
| SD-5 | **Prior-milestone regression** — M1–M4 (and M6, and M7 if landed) behavior unchanged with the panel closed and ping off; **for M8: unchanged with the flag off, and unchanged in the popup surface with the flag on** | |
| SD-6 | **Escalation items not silently decided** — anything on the blueprint escalation list (enabling a production ping endpoint, widening the pack beyond data-only, **widening the bridge `matches` beyond `https://cogis.ai/*`, adding a `fetch` from the page, relaxing the page CSP**) was escalated, not chosen | |

### 3.3 M8 bridge / surface checklist (in addition to §3.2)

| # | Check | Evidence |
| --- | --- | --- |
| SB-1 | **Origin lock is string equality** — `event.origin === "https://cogis.ai"` on every inbound message on both sides; single-value allowlist; no glob, no substring, no regex; every mismatch drops silently and increments `originDropCount` | |
| SB-2 | **Nonce echo required post-handshake** — session nonce set at `COGIS_HELLO`, echoed on every subsequent message; mismatch drops and increments `nonceDropCount`; the nonce is neither logged nor persisted | |
| SB-3 | **Envelope allowlist** — `type` present and in the addendum §3.9 allowlist; unknown/missing/malformed drops and increments `malformedDropCount`; oversized payloads beyond the Tier 2 cap drop | |
| SB-4 | **No `postMessage("*")` anywhere** — every reply passes the explicit `"https://cogis.ai"` target-origin argument; grep-level check acceptable as evidence | |
| SB-5 | **`event.source === window` on page side; `sender.tab.url.startsWith("https://cogis.ai/")` on SW side** — both boundaries enforce a second origin check independent of the bridge | |
| SB-6 | **Bridge `matches` is apex-only** — `https://cogis.ai/*` only; not `https://www.cogis.ai/*`, not any subdomain, not any other origin | |
| SB-7 | **WAR graph is complete** — the WAR-guard unit test (M1 pattern) fails if any transitively-imported file used by `web-bridge.js` is missing from `web_accessible_resources` | |
| SB-8 | **Cancel isolation across the bridge** — a `WEB_BRIDGE_CANCEL` for a superseded `requestId` drops in-flight chunks across every platform group, identical to popup cancel; a newer request is not torn down by a stale cancel | |
| SB-9 | **Timeout budgets unchanged** — five-platform (or four-platform, depending on M7 status) fan-out via the bridge respects the same 8s/15s budgets as the popup path; no new timeout paths introduced | |
| SB-10 | **Popup surface unchanged** — with the flag on **or** off, the popup fan-out is byte-identical to pre-M8 behavior; the M1–M7 self-check tables from the shipping milestones still hold | |
| SB-11 | **Addendum spike residual risks** — each residual risk from the attached S8.x spike(s) is addressed in Choices made, with a backlog ID where deferred | |
| SB-12 | **Escalation items not silently decided** — widening `matches` beyond apex, adding any page-side `fetch`, adding page-side telemetry, or introducing a bundler for `web/` was escalated, not chosen (addendum §10) | |

---

## 4. Known traps

Permanent list, distilled from shipped-milestone review scars. These apply to **every platform milestone (M1–M4, and M7 as a platform milestone)** and to any later fix branch that touches a lab adapter. Read them before writing the adapter, not after review flags them.

- **Cap after the client-side title filter, not before.** Normalize the whole page, filter by title, *then* cap. Capping the raw page first throws away matches sitting further down it.
- **Partial results are success.** If any authenticated page or container came back with hits, return them. Reporting `unavailable` because one later page failed loses results the user can see with their own eyes.
- **Incomplete, failed, or unattempted container coverage must never authorize `empty`.** "We did not look" and "we looked and found nothing" are different answers. Only the second one is `empty`.
- **Multi-container fan-out is breadth-first, or explicitly `truncated`.** Page 1 across all containers beats pages 1–5 of the first container. If the budget cuts the scan short, say `truncated` — do not pretend the scan completed.
- **Do not adopt an existing lab tab without proving content-script reachability.** An open tab is not a ready tab: it may predate the extension load, be discarded, or sit on a URL the content script never matched.
- **Surface `errorCode` at least in the console.** Operator smoke cannot distinguish "logged out", "endpoint drifted", and "budget exhausted" from an identical grey `unavailable` chip.
- **Document soft reach ceilings separately from truncation honesty.** A soft ceiling is a known platform limit that legitimately yields `empty`; truncation is a failure that must not. One paragraph each, never merged into one sentence.

---

## 5. Implementer hand-offs (Cursor)

Paste one of these into a **fresh Cursor agent chat** with the §1 step 4 attachments — blueprint, this file, and the milestone's spikes.

**Minimum operator paste** — the whole clipboard job for a milestone looks like this:

```text
@docs/agent_blueprint.md @docs/handoff-prompts.md @docs/spikes/s2-claude-recents-contract.md
<paste §5.3 block>
```

Nothing else. If you find yourself scrolling up to copy a table, stop: the agent can read it in the attached file, and §5.x already told it to.

### 5.0 Template (any milestone)

> Read `docs/agent_blueprint.md`, any spike files attached in this chat, and — in the attached `docs/handoff-prompts.md` — **§2 (Definition of Done)**, **§3 (self-check table: use §3.1 for platform milestones — M1–M4 and M7 — and §3.2 for M5–M6)**, and **§4 (Known traps)**. Do not ask me to paste those sections; read them from the file. Implement **Milestone \<N\> only** — ignore the other milestones' prompts in §5 of that file. Operate under the Mandatory Autonomy Guardrails and Implementer Independence tiers in the blueprint (framework §3 / §3.5): work exclusively on branch `feature/agent-m\<N\>-\<slug\>` cut from `dev`; respect the 5-attempt stop-loss and 25-attempt milestone budget; implement against the pre-approved **behavioral** acceptance criteria for this milestone. Codified tests may be authored as task 1 and implemented in the same milestone once written to match behavioral AC and spike contracts — but you must never weaken behavioral AC. Escalate anything on the blueprint escalation list instead of deciding it yourself. Note Tier 2 decisions under a **Choices made** heading in the PR description. Do not ask me for permission on individual file edits. Initialize directories and files as needed, run npm test/lint/format, fix errors automatically, verify green.
>
> Before opening the PR you must satisfy **§2** in full and have worked **§4** as a checklist. Copy the applicable **§3** table into the PR body yourself and fill every evidence cell — that table is your job to transcribe, not mine. The PR body carries Choices made (including how you handled every residual risk from the attached spikes) plus the filled self-check table with real evidence pointers. Do not claim anything you have not tested. Open a PR to `dev` when done. **Do not merge.** I am stepping away from the laptop.

### 5.1 M1 — ChatGPT only, end-to-end

> Read `docs/agent_blueprint.md`, `docs/spikes/s1-chatgpt-search-contract.md`, `docs/spikes/s5-auth-state-detection.md`, `docs/spikes/s6-long-history-reach.md`, and **§2, §3.1, and §4 of the attached `docs/handoff-prompts.md`**. Implement **Milestone 1 only** (ChatGPT end-to-end, including Projects via search — not list-only); ignore the other milestones in §5 of that file. Operate under the Mandatory Autonomy Guardrails and Implementer Independence tiers in the blueprint: branch `feature/agent-m1-chatgpt-e2e` cut from `dev`; 5-attempt stop-loss; 25-attempt milestone budget; behavioral AC for M1 are binding; prefer session `GET /backend-api/conversations/search` per S1; deep links `https://chatgpt.com/c/{id}`; capability label full-text; never store auth tokens or message bodies; no other platforms. First tasks: scaffold extension + pinned devtooling + unit tests for pure logic, then ChatGPT adapter + popup. Capture redacted fixtures after the first successful live shape if you can; otherwise ship fixture stubs and document the live-capture gap in Choices made. Escalate anything on the escalation list.
>
> Work the **§4 Known traps** list as a checklist — M1 owns the tab-adoption, cancel-isolation, and `errorCode` paths that every later milestone inherits, so get them right here. Satisfy **§2** and copy the **§3.1 platform self-check table** into the PR body with filled evidence cells before opening the PR. Open a PR to `dev` with Choices made. **Do not merge.** I am stepping away.

### 5.2 M2 — Perplexity

> Read `docs/agent_blueprint.md`, `docs/spikes/s3-perplexity-thread-contract.md`, `docs/spikes/s5-auth-state-detection.md`, `docs/spikes/s6-long-history-reach.md`, and **§2, §3.1, and §4 of the attached `docs/handoff-prompts.md`**. Implement **Milestone 2 only** (Perplexity) — ignore the other milestones in §5 of that file. Branch `feature/agent-m2-perplexity` cut from `dev`. Endpoint-first: `POST /rest/thread/list_ask_threads` with session cookies; capability title-match until proven otherwise; deep link `/search/{slug}`; prefill `?q=`; include Spaces per the S3 ladder. Keep M1 green. If a Spaces route is not live-proven, gate it off rather than ship an unproven probe, and record the gate in Choices made with a backlog ID.
>
> Title-match means a client-side filter: **cap after filtering, never before** (see §4 Known traps). Satisfy **§2** and copy the **§3.1 platform self-check table** into the PR body with filled evidence cells. Open PR to `dev`; **do not merge.**

### 5.3 M3 — Claude

> Read `docs/agent_blueprint.md`, `docs/spikes/s2-claude-recents-contract.md`, `docs/spikes/s5-auth-state-detection.md`, `docs/spikes/s6-long-history-reach.md`, and **§2, §3.1, and §4 of the attached `docs/handoff-prompts.md`**. Implement **Milestone 3 only** (Claude) — ignore the other milestones in §5 of that file. Branch `feature/agent-m3-claude` cut from `dev`. Title-match; deep link `https://claude.ai/chat/{uuid}`; Projects in scope; session org APIs preferred over pure DOM when available. Keep prior milestones green.
>
> Claude fans out across root Recents **and** Projects, so the container-coverage traps in §4 are the whole milestone: breadth-first across projects, mixed success ⇒ `truncated`, unattempted or failed coverage never authorizes `empty`, soft page ceilings documented as a separate platform limit. Any Projects route you could not confirm in the Network tab is **unverified** in Choices made with a backlog ID — do not claim Project-only findability works. Satisfy **§2** and copy the **§3.1 platform self-check table** into the PR body with filled evidence cells. Open PR to `dev`; **do not merge.**

### 5.4 M4 — Gemini

> Read `docs/agent_blueprint.md`, `docs/spikes/s4-gemini-history-contract.md`, `docs/spikes/s5-auth-state-detection.md`, `docs/spikes/s6-long-history-reach.md`, and **§2, §3.1, and §4 of the attached `docs/handoff-prompts.md`**. Implement **Milestone 4 only** (Gemini) — ignore the other milestones in §5 of that file. Branch `feature/agent-m4-gemini` cut from `dev`. DOM-first title-match; deep link `https://gemini.google.com/app/{id}`; honest limitations from S4; four-platform fan-out timeouts 8s/15s. Keep prior milestones green. README gains the per-platform capability matrix.
>
> DOM-first raises two §4 traps above the others: never adopt an existing Gemini tab without proving content-script reachability (and handle a discarded tab), and keep the reach limitation honest — a DOM scan that did not reach the item is `unavailable`/`timeout`, not `empty`. Satisfy **§2** and copy the **§3.1 platform self-check table** into the PR body with filled evidence cells. Open PR to `dev`; **do not merge.**

### 5.5 M5 — Selector hotfix manifest (data-only)

> Read `docs/agent_blueprint.md` and **§2, §3.2, and §4 of the attached `docs/handoff-prompts.md`**. Implement **Milestone 5 only** — ignore the other milestones in §5 of that file. Branch `feature/agent-m5-selector-manifest` cut from `dev`. Local data-only pack + optional HTTPS fetch/merge from an allowlisted `cogis.ai` path; fail closed to the local pack; reject executable payloads; no `eval`, no `new Function`, no dynamic remote import. Any proposal to widen the remote pack beyond data-only is an escalation, not a Tier 2 choice.
>
> Satisfy **§2** and copy the shorter **§3.2 data/UI self-check table** into the PR body with filled evidence cells. The §2.4 honesty rules apply to your fail-closed claim: do not state that a malformed payload falls back to local unless a test proves it. Open PR to `dev`; **do not merge.**

### 5.6 M6 — Debug panel + optional ping

> Read `docs/agent_blueprint.md` and **§2, §3.2, and §4 of the attached `docs/handoff-prompts.md`**. Implement **Milestone 6 only** — ignore the other milestones in §5 of that file. Branch `feature/agent-m6-debug-panel` cut from `dev`. Debug panel: per-platform latency, hit counts, last status, selector pack version. Optional anonymous ping **default off**; payload only `platformId`, `selectorPackVersion`, `errorClass` (+ optional extension version). No query text storage or transmission. Pointing any build at a production ping endpoint is an escalation.
>
> Satisfy **§2** and copy the shorter **§3.2 data/UI self-check table** into the PR body with filled evidence cells. Prove default-off with a test asserting zero network calls, and confirm M1–M5 behavior is unchanged with the panel closed. Open PR to `dev`; **do not merge.**

### 5.7 M7 — Grok

Grok is the **fifth** platform and the first one added after the V1 four. It only exists as a milestone because `docs/agent_blueprint.md` now carries a human-approved **M7 — Grok** section; escalation-list item #10 (adding a platform) is satisfied by that section and by nothing else. If the blueprint section is missing from the attached file, stop and escalate instead of pasting this block.

The S7 spike ships as an **open stub**, so this block does double duty: it authorizes the agent to author the finding from live investigation before implementing against it.

> Read `docs/agent_blueprint.md` — specifically the **M7 — Grok** section and its behavioral acceptance criteria — plus `docs/spikes/s7-grok-history-contract.md`, `docs/spikes/s5-auth-state-detection.md`, `docs/spikes/s6-long-history-reach.md`, and **§2, §3.1, and §4 of the attached `docs/handoff-prompts.md`**. Do not ask me to paste those sections; read them from the files. Implement **Milestone 7 only** — Grok (xAI) as the fifth platform. Ignore the other milestones in §5 of that file. Branch `feature/agent-m7-grok` cut from `dev`.
>
> **Task 1 — the spike, if it is still open.** `docs/spikes/s7-grok-history-contract.md` is a stub with `TBD` fields. If it has not been filled in, your **first task** is to write a short spike finding from **live investigation** in the same shape as `s4-gemini-history-contract.md`, covering: the actual history surface (is there a searchable history list, and where), auth signals for logged-in / logged-out / failure per the S5 predicate style, whether capability is honestly **title-match** or provably **full-text**, the deep-link URL pattern, and which host origins are real. Commit that finding, then implement against it. **Never invent an endpoint, a selector, or a URL pattern you did not observe** — an unobserved field stays `TBD` and the behavior falls back to the honest default. Product decisions that land on the blueprint escalation list are still escalations, not spike outcomes you may decide yourself.
>
> **Implementation — mirror the M1–M4 contracts, do not invent a new shape.** A fifth platform touches the same places the first four did: a `platforms.js` entry (id `grok`, label, capability, origin, loginUrl, hostPatterns), `PLATFORM_ORDER`, a platform block in `lib/selectors/local-pack.json`, `content/grok.js`, `lib/grok-adapter.js`, a `web_accessible_resources` entry matching the Grok origins, **narrow** `host_permissions` (only origins S7 proved — widening toward `<all_urls>` or unrelated origins is escalation #8), the popup result card/group, a debug-panel stats row if the M6 panel needs one, and unit tests plus redacted fixtures.
>
> **Strategy.** Prefer a session-cookie first-party endpoint **only if you proved it live**; otherwise go DOM-first with a client-side **title-match** filter and label it title-match. Claiming full-text without proof is an overclaim under §2.4. **Deep links only when the pattern is proven** — otherwise the click cascade falls back to the origin home/app surface, and `deepLinkUrl` stays `null`. No fake deep links.
>
> **Keep M1–M6 green.** The fan-out becomes **five platforms** and must still respect the 8s per-platform / 15s wall budgets and cancel semantics — a fifth group must not push the wall or let a superseded `requestId` leak into a newer request.
>
> Work the **§4 Known traps** list as an explicit checklist; on a DOM-first platform the ones that bite are false `empty` (an unproven or unreached history surface is `unavailable`/`timeout`, never `empty`), auth mapping per S5 (`403` without a login shell is `unavailable`, not logged-out), tab-adoption readiness (never adopt an existing Grok tab without proving content-script reachability, and handle a discarded tab), and cancel isolation across all five platforms.
>
> Satisfy **§2** in full and copy the **§3.1 platform self-check table** into the PR body yourself with every evidence cell filled — real test names or `file:line`, `unverified` + a `BL-0xx` row where you could not prove it. The PR body carries **Choices made** (including every residual risk from S7/S5/S6) plus that table. Open a PR to `dev`. **Do not merge.** I am stepping away.

### 5.8 M8a — Bridge protocol + content script (flag-gated, no page)

M8a is the **first M8 sub-milestone** and the first **surface** milestone in the project. Escalation-list item #14 (adding a hosted surface) is satisfied by `docs/agent_blueprint-m8-web-surface.md` and by nothing else. If the addendum is missing from the attached files, stop and escalate instead of pasting this block.

The S8.1 spike ships as an **open stub**, so this block does double duty: it authorizes the agent to author the finding from live investigation before implementing against it.

> Read `docs/agent_blueprint-m8-web-surface.md` — the M8 addendum — in full, especially **§3.9 (bridge protocol contract)** and **§6 M8a (behavioral AC)**. That addendum is the source of truth for M8; when it disagrees with `docs/agent_blueprint.md`, the addendum wins. Also read `docs/spikes/s8-1-postmessage-handshake-contract.md`, `docs/spikes/s5-auth-state-detection.md`, and — in the attached `docs/handoff-prompts.md` — **§2 (Definition of Done, especially §2.6 for where M8 sub-milestones sit)**, **§3.2 (primary rubric) and §3.3 (M8 bridge / surface checklist)**, and **§4 (Known traps)** — note that §4 traps apply to M8 sub-milestones only via SD-5 (prior-milestone regression), not directly. Do not ask me to paste those sections; read them from the files. Implement **Milestone 8a only** — ignore the other milestones in §5 of that file, including the other M8 sub-milestones. Operate under the Mandatory Autonomy Guardrails and Implementer Independence tiers in the blueprint framework: branch `feature/agent-m8a-bridge-protocol` cut from `dev`; 5-attempt stop-loss; 25-attempt milestone budget; addendum §6 M8a behavioral AC are binding. **Never invent a bridge field, timing tolerance, or drop counter you did not observe live** — an unobserved rule stays `TBD` in the spike and behavior falls back to the honest default (origin string equality, session nonce, drop-and-count).
>
> **Task 1 — the spike, if it is still open.** `docs/spikes/s8-1-postmessage-handshake-contract.md` is a stub with `TBD` fields. If it has not been filled in, your **first task** is to write a short spike finding from **live investigation** in the same shape as `s4-gemini-history-contract.md`, covering the fields listed in the S8.1 "Decisions to lock for M8a" table (handshake envelope both directions, origin string, `event.source`/`sender.tab.url` checks, `document_idle` timing on ≥3 cold loads, isolated-world module import graph, nonce format and lifetime) plus the origin-lock and envelope-validation drop rows the stub enumerates. Commit that finding, then implement against it.
>
> **Implementation — M8a is the extension side of the bridge only. No `web/` subtree. No DNS. No page.**
>
> Concretely:
>
> - New content script `extension/content/web-bridge.js` matched **only** to `https://cogis.ai/*` (apex; not `www`, not any subdomain, not any other origin). Sole channel between the (future) page and the service worker.
> - `extension/manifest.json` gains `https://cogis.ai/*` in `host_permissions` and a new `content_scripts` block for `web-bridge.js`. Widening `host_permissions` beyond that single origin is escalation #8, not a Tier 2 choice.
> - `extension/lib/flags.js` (new or extended) with `WEB_SEARCH_SURFACE_ENABLED = false` as the default. When `false`, the bridge and the SW handlers must hard-return with **zero observable effect** (no adapter call, no counter increment beyond the drop counter, no console noise). Prove this by test — that is SD-1 for M8.
> - Service worker gains `webBridge:search` and `webBridge:cancel` message handlers that are **thin wrappers over the existing popup message contract**. **No adapter changes** — addendum §6 global constraint. If a live-behavior discrepancy in an adapter shows up while wiring the bridge, that is a separate hotfix branch outside M8, not something you fix inside M8a.
> - Extend the WAR-guard unit test (the M1 pattern) so it fails if any file transitively imported by `web-bridge.js` is missing from `web_accessible_resources`. Populate the WAR entry with only what the bridge actually imports.
> - Add unit tests for: origin allowlist (accept `https://cogis.ai`, drop each row in the S8.1 origin-lock table), nonce echo, envelope allowlist (accept the addendum §3.9 types, drop unknown/malformed), request-ID cancel via the bridge (superseded id drops across all platform groups), and the drop counters incrementing on each mismatch case. Use `postMessage` fixtures under `tests/fixtures/web-bridge/` — redacted like every other fixture.
>
> **Do not build the page.** The addendum §3.9 explicitly requires that the bridge protocol contract mirror in `web/assets/js/bridge-client.js` on the page side, but that mirror lands in **M8b, not M8a**. M8a is flag-gated with no page at all. If you find yourself creating anything under `web/`, stop — that is scope creep and belongs in M8b.
>
> **Do not touch adapters.** If a test in `content/*.js` or `lib/*-adapter.js` needs to be updated to accommodate the new bridge message types, that is a bug in the wrapper design — the wrapper is thin over the popup contract by definition. Fix the wrapper, not the adapter.
>
> **Keep M1–M7 (whatever has landed) green.** With the flag `false`, the popup surface must be byte-identical to pre-M8. With the flag flipped to `true` **in a test harness only**, popup fan-out must still respect 8s/15s budgets and cancel semantics; a fifth (or fourth) group must not push the wall.
>
> Work the **§3.3 M8 bridge / surface checklist** as an explicit checklist before opening the PR — SB-1 through SB-12 are the shape of the review. §4 Known traps apply to M8a only via SD-5 (do not regress M1–M7).
>
> Satisfy **§2** in full. Copy the **§3.2 table (primary rubric, extended with M8 rows)** and the **§3.3 M8 bridge / surface checklist** into the PR body yourself with every evidence cell filled — real test names or `file:line`, `unverified` + a `BL-0xx` row where you could not prove it. The PR body carries **Choices made** (including every residual risk from S8.1 and any relevant S5/S6 residuals) plus both tables. Open a PR to `dev`. **Do not merge.** I am stepping away.

### 5.9 Optional: live selector polish (human + short Cursor assist)

If a platform milestone fails on live DOM/header drift, do **not** reopen product spikes. Run a short fix branch:

> Read the blueprint, the relevant spike, and **§4 of the attached `docs/handoff-prompts.md`**. Fix only the request headers/selectors for \<platform\> so search returns pointers again. Update `local-pack.json` and redacted fixtures. No new platforms, no new behavior. The §4 Known traps still apply — in particular, do not "fix" a failure by letting it report `empty`. A fix branch does not need the full §3 table; §2.1 green gates and §2.4 honesty rules still bind. Branch from `dev`; open PR to `dev`; do not merge.

---

## 6. Dual-review hand-offs (Perplexity Computer)

**This section is for the dual Claude + Codex PR review workflow, which runs in Perplexity Computer — not in Cursor.** Cursor implements; Computer reviews. Never hand a review prompt to the implementing agent, and never hand an implementation prompt to the reviewers.

**Same paste discipline as §5.** Reviewers clone the repo to run the gates, so they can read this file at `docs/handoff-prompts.md` — the policy in §6.1 and the blocking/non-blocking split in §6.2 are theirs to read, not yours to paste. If the Computer Space is already scoped to the repo, the paste is just the §6.3 or §6.4 block; if it is not, add the repo or attach `docs/handoff-prompts.md` once per Space rather than pasting policy per review.

### 6.1 Review loop policy

- **One dual review per PR, then one verify-only pass.** Pass 1: both reviewers read the PR at a pinned HEAD and produce findings independently. The implementer fixes **only the listed blockers**. Pass 2 is **verify-only** — confirm each blocker is resolved and no regression was introduced. It is not an opportunity to open fresh review surface.
- **Fix only listed blockers.** A finding not raised in pass 1 does not become a pass-2 blocker unless the pass-1 fixes created it.
- **Residual product or docs concerns go to `docs/backlog.md` with a `BL-0xx` ID. Do not request changes for them.** A review that keeps a PR open on a product preference has stopped being a review.
- **Do not re-litigate accepted precedents** unless *this* PR regresses them. Standing precedents as of M3:
  - Endpoint-only adapters; DOM fallback deferred (M1/M2 precedent) — **BL-023**
  - Perplexity Spaces enumeration gated off until a route is live-proven — **BL-021**
  - Soft page ceilings authorize `empty` by design; docs-only handling for now — **BL-024**
  - Unverified Claude Projects routes shipped behind honest coverage signals — **BL-022**
  - Max results per platform = 20 (Tier 2 default)
  - Stub fixtures pending live capture — **BL-003**
- **Reviewer disagreement is recorded, not resolved by attrition.** If Claude and Codex split on a non-blocking product call, note both positions in the PR thread, take the operator call, and file the backlog row.

### 6.2 Blocking vs non-blocking

**Blocking** — the PR does not merge until fixed:

- Correctness or honesty defects: a false `empty`, partial results reported as total failure, mixed success authorizing `empty`, truncation presented as a completed scan
- Auth mislabeling: `403` shown as logged-out without a login shell, or a login state shown as `unavailable`
- Security or privacy: stored auth tokens, stored or transmitted message bodies or query text, remote code execution paths, over-broad host permissions
- Red gates (`npm test` / `lint` / `format:check`) or a broken unpacked extension load
- A violated blueprint behavioral AC, or a prior-milestone regression
- An escalation-list item decided silently instead of escalated
- Scope creep beyond the milestone, or a new dependency added without escalation
- An overclaim in the PR body or README that no test supports

**Non-blocking** — comment or backlog row, then let the change set stand:

- Style, naming, file layout, comment wording
- Product preferences (e.g. how ceiling copy should read) where current behavior is documented and honest
- Extra test coverage that would be nice but does not hide a live defect
- Future-milestone scope, refactors, polish
- Anything already accepted as a precedent in §6.1

### 6.3 Ready-to-paste dual-review prompt (pass 1)

> Review PR #\<N\> on `dsergovic/cogis` (milestone M\<N\>, targeting `dev`). This is a **dual review**: the parent runs both Claude and Codex over the same pinned diff and each writes its own findings independently — do not read or converge on the other reviewer's output before writing yours.
>
> Read `docs/handoff-prompts.md` in the repo first: **§6.1** (review loop policy and accepted precedents), **§6.2** (blocking vs non-blocking), **§2** (the Definition of Done the implementer was held to), and **§4** (Known traps). Those are your rubric — read them from the file rather than asking me to paste them.
>
> Steps:
>
> 1. **Verify HEAD.** Record the exact head SHA under review (`gh pr view <N> --json headRefOid`) and review that commit. If the branch moves mid-review, restart against the new SHA and say so.
> 2. **Run the gates yourself** on that SHA: `npm ci && npm test && npm run lint && npm run format:check`. Report actual output; do not assume CI is green.
> 3. Read the blueprint behavioral AC for this milestone, the spike findings it depends on, and the PR body's Choices made + self-check table. Verify the self-check evidence pointers actually exist and actually prove what they claim — an evidence cell naming a test that does not assert the behavior is itself a blocker.
> 4. Work the **§4 Known traps** list as an explicit checklist against the diff.
> 5. **Write findings to a review file outside the repo** (e.g. `/tmp/cogis-review/pr<N>-<reviewer>-pass1.md`) so review artifacts never land in the PR. One file per reviewer.
> 6. Classify every finding as **blocking** or **non-blocking** using the §6.2 lists verbatim. Everything not on the blocking list is non-blocking → comment or backlog row, not a change request.
> 7. Do not re-litigate the accepted precedents in §6.1 unless this PR regresses one.
>
> **Do not post anything to GitHub yet** — hold the findings until the operator asks for them. **Do not approve and do not merge**; merge is a human gate.

### 6.4 Ready-to-paste second pass (verify-only)

> Second dual review of PR #\<N\> — **verify-only mode**. The implementer has pushed fixes for the pass-1 blockers only. §6.1 of `docs/handoff-prompts.md` in the repo defines this pass; re-read it rather than asking for a paste.
>
> 1. Record the new head SHA and diff it against the pass-1 SHA.
> 2. Re-run `npm test`, `npm run lint`, `npm run format:check` on the new SHA.
> 3. For each pass-1 **blocking** finding: mark it resolved, partially resolved, or unresolved, and point at the specific change that resolves it. Confirm the PR body and self-check table were updated to match the new behavior.
> 4. Check only for regressions introduced by the fixes. **Do not open new review surface.** A newly noticed issue is a blocker only if the pass-1 fixes created it; otherwise it is a backlog row.
> 5. Write to `/tmp/cogis-review/pr<N>-<reviewer>-pass2.md`. Hold for the operator. **Do not approve. Do not merge.**

### 6.5 Human merge gate

Reviewers never merge and never approve. After pass 2 is clean, the operator runs the §8 smoke, merges to `dev`, and reconciles the blueprint changelog and `docs/backlog.md`. Promotion of `dev` → `main` is a separate, later human decision (**BL-011**).

---

## 7. Local prerequisites

| Milestone | Requires locally |
| --- | --- |
| All | Node.js 20+, npm, Chrome stable, git, `gh` CLI for the review passes |
| M1–M4 | Logged-in browser sessions for the platform under test; Load unpacked `extension/` |
| M5 | Optional local static host or mocked fetch for manifest tests |
| M6 | Same as M1–M4 |
| M7 | Same as M1–M4 — a **logged-in Grok session** in the same browser profile (the S7 spike cannot be filled in, and M7 cannot be smoked, from a logged-out account) |
| M8a | Same base as M1–M4 for the unpacked extension; **no `cogis.ai` DNS yet** (M8a is flag-gated with no page). Filling S8.1 needs a local page that loads from an origin string equal to `https://cogis.ai` — a locally-hosted `127.0.0.1:8080` will not exercise the origin-lock codepath. Options: a `HOSTS` entry mapping `cogis.ai` to `127.0.0.1` with a self-signed cert on `https://cogis.ai`, a preview URL served from a temporary GitHub Pages deploy with the DNS pointing there, or the addendum's future `web/` preview once M8b lands. **Any of these is Tier 2**; the spike documents which one was used |

---

## 8. Operator smoke (Phase 4 quick list)

- US-1 recipe-style distinctive query
- US-2 logged-out platform chip
- US-3 nonsense empty
- US-6 empty submit clears + hint
- US-7 cancel in-flight
- Click cascade: deep link when present
- Container scope for this milestone's platform (Projects / Spaces) — findable, or the limitation is written down
- Console `errorCode` legible on every non-hit state

**Once M7 lands the fan-out is five platforms, not four.** Re-run US-7 (cancel) and the timeout checks with all five groups live: the added group must not push the 15s wall, and a superseded `requestId` must stay dropped across every group including Grok.

---

## Changelog

| Date | Change |
| --- | --- |
| 2026-07-31 | **M8a hand-off.** Propagated M8 through the file: source-of-truth line and §5 now include M8 sub-milestones; the M8 addendum is named as the M8 source of truth (parent blueprint drift acknowledged, `v0.4.0` reconciliation deferred). Added **§2.6** stating where M8 sub-milestones sit (surface, not platform; §3.2 primary rubric plus new §3.3 checklist; §4 traps apply only via SD-5). Extended **§3.2** with M8-specific rows (SD-1 flag-off zero effect, SD-2 no eval + no pre-handshake post, SD-3 no query text at `cogis.ai` origin + no leak of cookies/tokens/DOM through the bridge, SD-4 drop counters visible, SD-5 popup byte-identical with flag off, SD-6 bridge-widening escalations). Added new **§3.3 M8 bridge / surface checklist** (SB-1–SB-12) covering origin-lock string equality, nonce echo, envelope allowlist, no `postMessage("*")`, second-origin checks on both boundaries, apex-only `matches`, WAR graph completeness, cancel isolation, unchanged timeout budgets, popup byte-identity, addendum spike residuals, and bridge-widening escalations. Added **§5.8 M8a — Bridge protocol + content script** (previous "live selector polish" renumbered to **§5.9**), which authorizes authoring the open S8.1 spike as task 1 from live investigation. Added an M8a row to §7 local prerequisites noting the origin-lock harness requirement (a `127.0.0.1` origin will not exercise the codepath). Spikes-line updated for S8.1–S8.3 open stubs. |
| 2026-07-30 | **M7 Grok hand-off.** Propagated M7 through the file: source-of-truth line and §5 now read M1–M7; §3.1 is the platform table for M1–M4 **and M7**; §2.5 states M7 is a platform milestone (not a data/UI one); §4 traps apply to it; §1 lists the S7 attachment; §7 adds the logged-in-Grok prerequisite; §8 notes five-platform fan-out. Added **§5.7 M7 — Grok** (previous "live selector polish" renumbered to **§5.8**), which authorizes authoring the open S7 spike as task 1 from live investigation. Companion: blueprint gains an **M7 — Grok** section, without which escalation #10 still blocks the platform add. |
| 2026-07-30 | Switched the hand-off from copy-paste to attach-once. This file is now **attached in Cursor** instead of withheld; the operator pastes only the short §5.x block, and each §5.x prompt tells the agent to read §2/§3/§4 from the attached file and transcribe the §3 table into the PR body itself. §6 review prompts reference §6.1/§6.2 in the repo instead of inlining them. |
| 2026-07-30 | Renamed from `cursor-handoff-prompts.md`; declared the official source of truth for all hand-off prompts. Split implementer (Cursor) and dual-review (Perplexity Computer) audiences. Added §2 Definition of Done, §3 self-check tables, §4 Known traps, and §6 review loop policy from M3 review lessons. |
| 2026-07-28 | Initial operator hand-off prompts alongside blueprint 0.2.0. |
