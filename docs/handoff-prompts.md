# Cogis — Hand-Off Prompts (Phase 2)

**This file is the official source of truth for all Cogis hand-off prompts — implementer and reviewer, M1 through M6.**

Do not keep parallel copies of these prompts in chat memory, session notes, or a scratch doc. If a prompt needs to change, change it **here** and reference it. If a chat contains a prompt that disagrees with this file, this file wins.

**Audience: human operator only.**  
**Do not attach this file in Cursor.** A Cursor implementer gets `docs/agent_blueprint.md` plus the relevant `docs/spikes/*.md` findings — nothing else from this file. The pasted prompt is the only channel through which this file reaches an agent.

Framework: [Full-Lifecycle Agentic Software Engineering v1.1.0](https://github.com/dsergovic/research/blob/main/docs/Full-Lifecycle%20Agentic%20Software%20Engineering.md)  
Blueprint: `docs/agent_blueprint.md`  
Spikes: `docs/spikes/` (S1–S6 resolved 2026-07-28)  
Backlog: `docs/backlog.md`

## What is in this file

| § | Section | Audience |
| --- | --- | --- |
| 1 | Hand-off checklist | Operator |
| 2 | Definition of Done before opening the PR | Operator → pasted into implementer prompts |
| 3 | Self-check tables (3.1 platform M1–M4; 3.2 data/UI M5–M6) | Implementer completes in PR body |
| 4 | Known traps (permanent) | Implementer |
| 5 | **Implementer hand-offs (Cursor)** — template + ready-to-paste M1–M6 | Operator → Cursor |
| 6 | **Dual-review hand-offs (Perplexity Computer)** — policy + ready-to-paste | Operator → Computer |
| 7 | Local prerequisites | Operator |
| 8 | Operator smoke (Phase 4 quick list) | Operator |

---

## 1. Hand-off checklist (once per milestone)

1. `git checkout dev && git pull` — cut the milestone branch from current **`dev`** (integration / day-to-day working area; not `main`).
2. Confirm the spike finding for this milestone is merged and you accept it (S1→M1, S3→M2, S2→M3, S4→M4; S5/S6 are cross-cutting and already folded in).
3. Open the repo in Cursor and start a **fresh agent chat** (never reuse a prior milestone's chat).
4. Attach blueprint context: `@docs/agent_blueprint.md`  
   For platform milestones also attach:
   - M1: `@docs/spikes/s1-chatgpt-search-contract.md` `@docs/spikes/s5-auth-state-detection.md` `@docs/spikes/s6-long-history-reach.md`
   - M2: `@docs/spikes/s3-perplexity-thread-contract.md` + S5/S6
   - M3: `@docs/spikes/s2-claude-recents-contract.md` + S5/S6
   - M4: `@docs/spikes/s4-gemini-history-contract.md` + S5/S6
   - M5/M6: blueprint only (plus M5 notes in blueprint §10).
5. Enable terminal auto-run for `npm`, `node`, `git` as you prefer; deny force-push and merge to `dev` or `main`.
6. Paste the milestone prompt from §5, followed by the literal text of §2, the relevant §3 table, and §4. Step away.
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

Complete the self-check table from §3 in the PR body — **§3.1 for platform milestones (M1–M4)**, **§3.2 (shorter) for M5–M6**. Every row gets a concrete evidence pointer (test name, `file:line`, or "operator smoke — pending"), not a bare checkmark. Rows that cannot be proven yet are marked **unverified** with a backlog ID; they are not marked done.

### 2.4 Honesty rules (non-negotiable)

- **No overclaiming.** Do not write "never returns a false empty", "fully covered", or "live-verified" unless a test or a captured live response proves it. Unproven ⇒ say *unverified* and add the backlog row.
- **Soft reach ceilings are not truncation.** A documented page/scan ceiling that reports `empty` by design (unread older history is a platform limit) must be described **separately** from failure truncation, which must never report `empty`. Conflating the two in either direction is a blocker: it either hides real failures or turns a known limit into a fake error.
- **Test-plan checkboxes are claims.** Leave unchecked what you did not run; never pre-tick operator smoke.

### 2.5 Where M5/M6 differ

M5 (data-only selector pack) and M6 (debug panel + optional ping) have no lab fan-out, no auth mapping, and no container-coverage problem. They use the shorter §3.2 table. §2.1, §2.2, and §2.4 still apply in full — for M5/M6 the honesty rules bite on *fail-closed* and *default-off* claims instead of on `empty`.

---

## 3. Self-check tables

### 3.1 Platform milestones (M1–M4)

Copy into the PR body and fill the evidence column.

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

### 3.2 Data / UI milestones (M5–M6)

| # | Check | Evidence |
| --- | --- | --- |
| SD-1 | **Fail-closed / default-off proven by test** — M5: remote unreachable or malformed ⇒ local pack; M6: ping off ⇒ zero network calls | |
| SD-2 | **Data-only, no execution** — no `eval`, no `new Function`, no dynamic remote import; executable-looking payload keys are rejected (M5) | |
| SD-3 | **Privacy** — query text is never stored in `chrome.storage` or transmitted; the panel shows no message bodies (M6) | |
| SD-4 | **Diagnosability** — pack version, per-platform status, and `errorCode` are visible to the surface this milestone owns | |
| SD-5 | **Prior-milestone regression** — M1–M4 behavior unchanged with the panel closed and ping off | |
| SD-6 | **Escalation items not silently decided** — anything on the blueprint escalation list (enabling a production ping endpoint, widening the pack beyond data-only) was escalated, not chosen | |

---

## 4. Known traps

Permanent list, distilled from shipped-milestone review scars. These apply to **every platform milestone (M1–M4)** and to any later fix branch that touches a lab adapter. Read them before writing the adapter, not after review flags them.

- **Cap after the client-side title filter, not before.** Normalize the whole page, filter by title, *then* cap. Capping the raw page first throws away matches sitting further down it.
- **Partial results are success.** If any authenticated page or container came back with hits, return them. Reporting `unavailable` because one later page failed loses results the user can see with their own eyes.
- **Incomplete, failed, or unattempted container coverage must never authorize `empty`.** "We did not look" and "we looked and found nothing" are different answers. Only the second one is `empty`.
- **Multi-container fan-out is breadth-first, or explicitly `truncated`.** Page 1 across all containers beats pages 1–5 of the first container. If the budget cuts the scan short, say `truncated` — do not pretend the scan completed.
- **Do not adopt an existing lab tab without proving content-script reachability.** An open tab is not a ready tab: it may predate the extension load, be discarded, or sit on a URL the content script never matched.
- **Surface `errorCode` at least in the console.** Operator smoke cannot distinguish "logged out", "endpoint drifted", and "budget exhausted" from an identical grey `unavailable` chip.
- **Document soft reach ceilings separately from truncation honesty.** A soft ceiling is a known platform limit that legitimately yields `empty`; truncation is a failure that must not. One paragraph each, never merged into one sentence.

---

## 5. Implementer hand-offs (Cursor)

Paste one of these into a **fresh Cursor agent chat** with the §1 step 4 attachments.

> **Operator note:** this file is never attached in Cursor, so paste §2 (Definition of Done), §3.1 or §3.2 (self-check table), and §4 (Known traps) as literal text **below** the milestone prompt. The prompt's reference to "the Definition of Done and Known traps included in this message" then resolves.

### 5.0 Template (any milestone)

> Read `docs/agent_blueprint.md` and any spike files attached in this chat. Implement **Milestone \<N\> only**. Operate under the Mandatory Autonomy Guardrails and Implementer Independence tiers in the blueprint (framework §3 / §3.5): work exclusively on branch `feature/agent-m\<N\>-\<slug\>` cut from `dev`; respect the 5-attempt stop-loss and 25-attempt milestone budget; implement against the pre-approved **behavioral** acceptance criteria for this milestone. Codified tests may be authored as task 1 and implemented in the same milestone once written to match behavioral AC and spike contracts — but you must never weaken behavioral AC. Escalate anything on the blueprint escalation list instead of deciding it yourself. Note Tier 2 decisions under a **Choices made** heading in the PR description. Do not ask me for permission on individual file edits. Initialize directories and files as needed, run npm test/lint/format, fix errors automatically, verify green.
>
> Before opening the PR you must satisfy the **Definition of Done** and complete the **Self-check table** included in this message, and you must have read the **Known traps** list. The PR body carries Choices made (including how you handled every residual risk from the attached spikes) plus the filled self-check table with real evidence pointers. Do not claim anything you have not tested. Open a PR to `dev` when done. **Do not merge.** I am stepping away from the laptop.

### 5.1 M1 — ChatGPT only, end-to-end

> Read `docs/agent_blueprint.md`, `docs/spikes/s1-chatgpt-search-contract.md`, `docs/spikes/s5-auth-state-detection.md`, and `docs/spikes/s6-long-history-reach.md`. Implement **Milestone 1 only** (ChatGPT end-to-end, including Projects via search — not list-only). Operate under the Mandatory Autonomy Guardrails and Implementer Independence tiers in the blueprint: branch `feature/agent-m1-chatgpt-e2e` cut from `dev`; 5-attempt stop-loss; 25-attempt milestone budget; behavioral AC for M1 are binding; prefer session `GET /backend-api/conversations/search` per S1; deep links `https://chatgpt.com/c/{id}`; capability label full-text; never store auth tokens or message bodies; no other platforms. First tasks: scaffold extension + pinned devtooling + unit tests for pure logic, then ChatGPT adapter + popup. Capture redacted fixtures after the first successful live shape if you can; otherwise ship fixture stubs and document the live-capture gap in Choices made. Escalate anything on the escalation list.
>
> Apply the **Known traps** list in this message — M1 owns the tab-adoption, cancel-isolation, and `errorCode` paths that every later milestone inherits, so get them right here. Satisfy the **Definition of Done** and complete the **platform Self-check table** in the PR body before opening the PR. Open a PR to `dev` with Choices made. **Do not merge.** I am stepping away.

### 5.2 M2 — Perplexity

> Read `docs/agent_blueprint.md`, `docs/spikes/s3-perplexity-thread-contract.md`, `docs/spikes/s5-auth-state-detection.md`, and `docs/spikes/s6-long-history-reach.md`. Implement **Milestone 2 only** (Perplexity). Branch `feature/agent-m2-perplexity` cut from `dev`. Endpoint-first: `POST /rest/thread/list_ask_threads` with session cookies; capability title-match until proven otherwise; deep link `/search/{slug}`; prefill `?q=`; include Spaces per the S3 ladder. Keep M1 green. If a Spaces route is not live-proven, gate it off rather than ship an unproven probe, and record the gate in Choices made with a backlog ID.
>
> Title-match means a client-side filter: **cap after filtering, never before** (see Known traps in this message). Satisfy the **Definition of Done** and complete the **platform Self-check table** in the PR body. Open PR to `dev`; **do not merge.**

### 5.3 M3 — Claude

> Read `docs/agent_blueprint.md`, `docs/spikes/s2-claude-recents-contract.md`, `docs/spikes/s5-auth-state-detection.md`, and `docs/spikes/s6-long-history-reach.md`. Implement **Milestone 3 only** (Claude). Branch `feature/agent-m3-claude` cut from `dev`. Title-match; deep link `https://claude.ai/chat/{uuid}`; Projects in scope; session org APIs preferred over pure DOM when available. Keep prior milestones green.
>
> Claude fans out across root Recents **and** Projects, so the container-coverage traps in this message are the whole milestone: breadth-first across projects, mixed success ⇒ `truncated`, unattempted or failed coverage never authorizes `empty`, soft page ceilings documented as a separate platform limit. Any Projects route you could not confirm in the Network tab is **unverified** in Choices made with a backlog ID — do not claim Project-only findability works. Satisfy the **Definition of Done** and complete the **platform Self-check table** in the PR body. Open PR to `dev`; **do not merge.**

### 5.4 M4 — Gemini

> Read `docs/agent_blueprint.md`, `docs/spikes/s4-gemini-history-contract.md`, `docs/spikes/s5-auth-state-detection.md`, and `docs/spikes/s6-long-history-reach.md`. Implement **Milestone 4 only** (Gemini). Branch `feature/agent-m4-gemini` cut from `dev`. DOM-first title-match; deep link `https://gemini.google.com/app/{id}`; honest limitations from S4; four-platform fan-out timeouts 8s/15s. Keep prior milestones green. README gains the per-platform capability matrix.
>
> DOM-first raises two traps in this message above the others: never adopt an existing Gemini tab without proving content-script reachability (and handle a discarded tab), and keep the reach limitation honest — a DOM scan that did not reach the item is `unavailable`/`timeout`, not `empty`. Satisfy the **Definition of Done** and complete the **platform Self-check table** in the PR body. Open PR to `dev`; **do not merge.**

### 5.5 M5 — Selector hotfix manifest (data-only)

> Read `docs/agent_blueprint.md`. Implement **Milestone 5 only**. Branch `feature/agent-m5-selector-manifest` cut from `dev`. Local data-only pack + optional HTTPS fetch/merge from an allowlisted `cogis.ai` path; fail closed to the local pack; reject executable payloads; no `eval`, no `new Function`, no dynamic remote import. Any proposal to widen the remote pack beyond data-only is an escalation, not a Tier 2 choice.
>
> Satisfy the **Definition of Done** and complete the shorter **data/UI Self-check table** in the PR body. The honesty rules apply to your fail-closed claim: do not state that a malformed payload falls back to local unless a test proves it. Open PR to `dev`; **do not merge.**

### 5.6 M6 — Debug panel + optional ping

> Read `docs/agent_blueprint.md`. Implement **Milestone 6 only**. Branch `feature/agent-m6-debug-panel` cut from `dev`. Debug panel: per-platform latency, hit counts, last status, selector pack version. Optional anonymous ping **default off**; payload only `platformId`, `selectorPackVersion`, `errorClass` (+ optional extension version). No query text storage or transmission. Pointing any build at a production ping endpoint is an escalation.
>
> Satisfy the **Definition of Done** and complete the shorter **data/UI Self-check table** in the PR body. Prove default-off with a test asserting zero network calls, and confirm M1–M5 behavior is unchanged with the panel closed. Open PR to `dev`; **do not merge.**

### 5.7 Optional: live selector polish (human + short Cursor assist)

If a platform milestone fails on live DOM/header drift, do **not** reopen product spikes. Run a short fix branch:

> Read the blueprint and the relevant spike. Fix only the request headers/selectors for \<platform\> so search returns pointers again. Update `local-pack.json` and redacted fixtures. No new platforms, no new behavior. The Known traps in this message still apply — in particular, do not "fix" a failure by letting it report `empty`. Branch from `dev`; open PR to `dev`; do not merge.

---

## 6. Dual-review hand-offs (Perplexity Computer)

**This section is for the dual Claude + Codex PR review workflow, which runs in Perplexity Computer — not in Cursor.** Cursor implements; Computer reviews. Never hand a review prompt to the implementing agent, and never hand an implementation prompt to the reviewers.

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
> Steps:
>
> 1. **Verify HEAD.** Record the exact head SHA under review (`gh pr view <N> --json headRefOid`) and review that commit. If the branch moves mid-review, restart against the new SHA and say so.
> 2. **Run the gates yourself** on that SHA: `npm ci && npm test && npm run lint && npm run format:check`. Report actual output; do not assume CI is green.
> 3. Read the blueprint behavioral AC for this milestone, the spike findings it depends on, and the PR body's Choices made + self-check table. Verify the self-check evidence pointers actually exist and actually prove what they claim — an evidence cell naming a test that does not assert the behavior is itself a blocker.
> 4. Work the **Known traps** list (§4 of `docs/handoff-prompts.md`) as an explicit checklist against the diff.
> 5. **Write findings to a review file outside the repo** (e.g. `/tmp/cogis-review/pr<N>-<reviewer>-pass1.md`) so review artifacts never land in the PR. One file per reviewer.
> 6. Classify every finding as **blocking** or **non-blocking** per §6.2. Blocking means: correctness/honesty defect, auth mislabel, security/privacy issue, red gate, violated behavioral AC, prior-milestone regression, silent escalation-list decision, scope creep or unescalated dependency, or an unsupported claim in the PR body. Everything else is non-blocking → comment or backlog row, not a change request.
> 7. Do not re-litigate the accepted precedents in §6.1 unless this PR regresses one.
>
> **Do not post anything to GitHub yet** — hold the findings until the operator asks for them. **Do not approve and do not merge**; merge is a human gate.

### 6.4 Ready-to-paste second pass (verify-only)

> Second dual review of PR #\<N\> — **verify-only mode**. The implementer has pushed fixes for the pass-1 blockers only.
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

---

## Changelog

| Date | Change |
| --- | --- |
| 2026-07-30 | Renamed from `cursor-handoff-prompts.md`; declared the official source of truth for all hand-off prompts. Split implementer (Cursor) and dual-review (Perplexity Computer) audiences. Added §2 Definition of Done, §3 self-check tables, §4 Known traps, and §6 review loop policy from M3 review lessons. |
| 2026-07-28 | Initial operator hand-off prompts alongside blueprint 0.2.0. |
