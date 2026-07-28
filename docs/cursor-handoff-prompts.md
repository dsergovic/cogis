# Cogis — Cursor Hand-Off Prompts (Phase 2)

**Audience: human operator only.**  
**Do not attach this file in Cursor.** The agent gets `docs/agent_blueprint.md` (and the relevant `docs/spikes/*.md` finding when implementing a platform milestone). Nothing else from this file.

Framework: [Full-Lifecycle Agentic Software Engineering v1.1.0](https://github.com/dsergovic/research/blob/main/docs/Full-Lifecycle%20Agentic%20Software%20Engineering.md)  
Blueprint: `docs/agent_blueprint.md`  
Spikes: `docs/spikes/` (S1–S6 resolved 2026-07-28)

---

## Hand-off checklist (once per milestone)

1. `git checkout dev && git pull` — cut the milestone branch from current **`dev`** (integration / day-to-day working area; not `main`).
2. Confirm the spike finding for this milestone is merged and you accept it (S1→M1, S3→M2, S2→M3, S4→M4; S5/S6 are cross-cutting already folded in).
3. Open the repo in Cursor and start a **fresh agent chat** (never reuse a prior milestone’s chat).
4. Attach blueprint context: `@docs/agent_blueprint.md`  
   For platform milestones also attach:  
   - M1: `@docs/spikes/s1-chatgpt-search-contract.md` `@docs/spikes/s5-auth-state-detection.md` `@docs/spikes/s6-long-history-reach.md`  
   - M2: `@docs/spikes/s3-perplexity-thread-contract.md` + S5/S6  
   - M3: `@docs/spikes/s2-claude-recents-contract.md` + S5/S6  
   - M4: `@docs/spikes/s4-gemini-history-contract.md` + S5/S6  
   - M5/M6: blueprint only (plus M5 notes in blueprint §10).
5. Enable terminal auto-run for `npm`, `node`, `git` as you prefer; deny force-push and merge to `dev` or `main`.
6. Paste the milestone prompt below. Step away.
7. On completion: run `npm test`, `npm run lint`, `npm run format:check` yourself; load `extension/` unpacked and smoke the user stories you can; push the branch; open the PR **to `dev`**; review against blueprint behavioral AC; merge yourself into `dev`; reconcile blueprint Version/Changelog (Phase 4). Promote `dev` → `main` only as a separate human gate when you want a stabler line.

**Agent must not merge. Prefer agent opens PR; if your prompt says not to open PR, you open it.**

---

## Template (any milestone)

> Read `docs/agent_blueprint.md` and any spike files attached in this chat. Implement **Milestone \<N\> only**. Operate under the Mandatory Autonomy Guardrails and Implementer Independence tiers in the blueprint (framework §3 / §3.5): work exclusively on branch `feature/agent-m\<N\>-\<slug\>` cut from `dev`; respect the 5-attempt stop-loss and 25-attempt milestone budget; implement against the pre-approved **behavioral** acceptance criteria for this milestone; when codified tests are the first task, propose them and **stop for my approval** before continuing implementation if the blueprint requires that gate — for Cogis after spike resolution, codified tests may be authored as task 1 and implemented in the same milestone once written to match behavioral AC and spike contracts, but you must never weaken behavioral AC. Escalate anything on the blueprint escalation list instead of deciding it yourself. Note Tier 2 decisions under a **Choices made** heading in the PR description. Do not ask me for permission on individual file edits. Initialize directories and files as needed, run npm test/lint/format, fix errors automatically, verify green. Open a PR to `dev` when done. **Do not merge.** I am stepping away from the laptop.

---

## Ready-to-paste prompts per milestone

### M1 — ChatGPT only, end-to-end

> Read `docs/agent_blueprint.md`, `docs/spikes/s1-chatgpt-search-contract.md`, `docs/spikes/s5-auth-state-detection.md`, and `docs/spikes/s6-long-history-reach.md`. Implement **Milestone 1 only** (ChatGPT end-to-end, including Projects via search — not list-only). Operate under the Mandatory Autonomy Guardrails and Implementer Independence tiers in the blueprint: branch `feature/agent-m1-chatgpt-e2e` cut from `dev`; 5-attempt stop-loss; 25-attempt milestone budget; behavioral AC for M1 are binding; prefer session `GET /backend-api/conversations/search` per S1; deep links `https://chatgpt.com/c/{id}`; capability label full-text; never store auth tokens or message bodies; no other platforms. First tasks: scaffold extension + pinned devtooling + unit tests for pure logic, then ChatGPT adapter + popup. Capture redacted fixtures after first successful live shape if you can; otherwise ship fixture stubs and document the live-capture gap in Choices made. Escalate anything on the escalation list. Open a PR to `dev` with Choices made. **Do not merge.** I am stepping away.

### M2 — Perplexity

> Read `docs/agent_blueprint.md`, `docs/spikes/s3-perplexity-thread-contract.md`, `docs/spikes/s5-auth-state-detection.md`, and `docs/spikes/s6-long-history-reach.md`. Implement **Milestone 2 only** (Perplexity). Branch `feature/agent-m2-perplexity` cut from `dev`. Endpoint-first: `POST /rest/thread/list_ask_threads` with session cookies; capability title-match until proven otherwise; deep link `/search/{slug}`; prefill `?q=`; include Spaces per S3 ladder. Keep M1 green. Open PR to `dev`; **do not merge.**

### M3 — Claude

> Read `docs/agent_blueprint.md`, `docs/spikes/s2-claude-recents-contract.md`, `docs/spikes/s5-auth-state-detection.md`, and `docs/spikes/s6-long-history-reach.md`. Implement **Milestone 3 only** (Claude). Branch `feature/agent-m3-claude` cut from `dev`. Title-match; deep link `https://claude.ai/chat/{uuid}`; Projects in scope; session org APIs preferred over pure DOM when available. Keep prior milestones green. Open PR to `dev`; **do not merge.**

### M4 — Gemini

> Read `docs/agent_blueprint.md`, `docs/spikes/s4-gemini-history-contract.md`, `docs/spikes/s5-auth-state-detection.md`, and `docs/spikes/s6-long-history-reach.md`. Implement **Milestone 4 only** (Gemini). Branch `feature/agent-m4-gemini` cut from `dev`. DOM-first title-match; deep link `https://gemini.google.com/app/{id}`; honest limitations; four-platform fan-out timeouts 8s/15s. Keep prior green. Open PR to `dev`; **do not merge.**

### M5 — Selector hotfix manifest (data-only)

> Read `docs/agent_blueprint.md`. Implement **Milestone 5 only**. Branch `feature/agent-m5-selector-manifest` cut from `dev`. Local data-only pack + optional HTTPS fetch/merge from allowlisted `cogis.ai` path; fail closed to local; reject executable payloads; no eval/remote code. Open PR to `dev`; **do not merge.**

### M6 — Debug panel + optional ping

> Read `docs/agent_blueprint.md`. Implement **Milestone 6 only**. Branch `feature/agent-m6-debug-panel` cut from `dev`. Debug panel: per-platform latency, hit counts, selector pack version. Optional anonymous ping **default off**; payload only platformId, selectorPackVersion, errorClass (+ optional extension version). No query text storage or transmission. Open PR to `dev`; **do not merge.**

---

## Optional: live selector polish (human + short Cursor assist)

If M1 fails on live DOM/header drift, do **not** reopen product spikes. Run a short fix branch:

> Read the blueprint and S1. Fix only ChatGPT request headers/selectors so search returns pointers again. Update `local-pack.json` and redacted fixtures. No new platforms. Branch from `dev`; open PR to `dev`; do not merge.

---

## Local prerequisites

| Milestone | Requires locally |
| --- | --- |
| All | Node.js 20+ recommended, npm, Chrome stable, git |
| M1–M4 | Logged-in browser sessions for the platform under test; Load unpacked `extension/` |
| M5 | Optional local static host or mocked fetch for manifest tests |
| M6 | Same as M1–M4 |

---

## Operator smoke (Phase 4 quick list)

- US-1 recipe-style distinctive query  
- US-2 logged-out platform chip  
- US-3 nonsense empty  
- US-6 empty submit clears + hint  
- US-7 cancel in-flight  
- Click cascade: deep link when present  
