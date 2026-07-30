# Cogis — AI Search

Single-purpose Chrome Manifest V3 extension that searches the user's own conversation history and returns clickable pointers into each AI lab. A **launcher**, not a knowledge base.

**V1 distribution:** `dev-unpacked` only. Load the `extension/` folder in Chrome — there is no hosted app server.

## Milestone status

| Milestone | Scope                                              | Status          |
| --------- | -------------------------------------------------- | --------------- |
| M1        | ChatGPT end-to-end (including Projects via search) | Merged to `dev` |
| M2        | Perplexity end-to-end (Library + gated Spaces)     | Merged to `dev` |
| M3        | Claude end-to-end (Recents + Projects)             | Merged to `dev` |
| M4        | Gemini                                             | Merged to `dev` |
| M5        | Selector hotfix manifest (data-only)               | In progress     |
| M6        | Debug panel + optional ping                        | Not started     |

## Docs

- [`docs/agent_blueprint.md`](./docs/agent_blueprint.md) — binding Phase 1 blueprint: architecture, behavioral acceptance criteria, escalation list
- [`docs/spikes/`](./docs/spikes/README.md) — S1–S6 lab contract findings
- [`docs/handoff-prompts.md`](./docs/handoff-prompts.md) — **official source of truth** for milestone hand-off prompts: implementer (Cursor) and dual-review (Perplexity Computer). Attached as agent context; the operator pastes only the short per-milestone block
- [`docs/backlog.md`](./docs/backlog.md) — deferred follow-ups (`BL-0xx`)

## Load unpacked

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select the `extension/` directory in this repo
4. Pin **Cogis — AI Search** and open the popup
5. Stay logged into [ChatGPT](https://chatgpt.com/), [Perplexity](https://www.perplexity.ai/), [Claude](https://claude.ai/), and/or [Gemini](https://gemini.google.com/app) in the same browser profile
6. After code changes, click **Reload** on the extension card before re-testing

Content scripts dynamically import shared `extension/lib/*` modules. Those paths are declared under `web_accessible_resources` per lab host (required for MV3 content-script `import()`).

## Develop

```bash
npm ci
npm test
npm run lint
npm run format:check
```

DevDependencies only (ESLint 9, Prettier 3, Vitest 3). Runtime is plain HTML/CSS/JS — no bundler.

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs lint, format check, and unit tests on PRs and pushes to `dev` / `main`. The job name — and branch-protection check context — is **`build-and-test`**.

After the first green run: Settings → Rules → require status check `build-and-test` on `dev` and `main`.

## Capability matrix (M1–M4)

| Platform   | Capability      | Strategy                        | Deep link                                 | Prefill                               |
| ---------- | --------------- | ------------------------------- | ----------------------------------------- | ------------------------------------- |
| ChatGPT    | **full-text**   | Session search endpoint         | `https://chatgpt.com/c/{id}`              | —                                     |
| Perplexity | **title-match** | Session `list_ask_threads`      | `https://www.perplexity.ai/search/{slug}` | `https://www.perplexity.ai/search?q=` |
| Claude     | **title-match** | Org session APIs                | `https://claude.ai/chat/{uuid}`           | —                                     |
| Gemini     | **title-match** | **DOM-first** history rail scan | `https://gemini.google.com/app/{id}`      | —                                     |

Popup footnote: _Some AIs do not support full-text search._

- ChatGPT: session-authenticated `GET /backend-api/conversations/search` (Projects included).
- Perplexity: session-cookie `POST /rest/thread/list_ask_threads` with `search_term` (Library). Spaces-only recovery via unproven per-Space routes is **gated off** until a live-proven path lands; C may still return Space-tagged threads when the lab includes them.
- Claude: session-cookie org APIs (`GET /api/organizations` → paginated `chat_conversations` + Projects enumeration). Client-side title filter; no stable prefill URL. **Reach ceilings (soft caps):** root ≈ 5 × pageSize (~100 conversations); per-project ≈ 3 × pageSize (~60). Soft caps still report `empty` by design when the scanned window has no title match (unread older history is a documented platform limit — **BL-024**). **Incomplete scans are different:** HTTP failure, deadline/fetch truncation, or unattempted/failed Projects → `unavailable`/`timeout`, not `empty` (see BL-022). **Projects:** routes inferred / not yet live Network-tab confirmed — Project-only findability unverified until operator smoke; ladder uses breadth-first page-1 across projects. DOM Recents search fallback deferred (BL-023; M1/M2 endpoint-only precedent).
- Gemini: **DOM-first** history rail (S4) — no stable first-party history search endpoint at desk. Title-match on `/app/{id}` links; cascade deep link → `https://gemini.google.com/app` (no prefill). **Reach ceilings (soft caps):** ≈ 8 scroll rounds / ~120 distinct history items still authorize `empty` by design when the **history rail (or empty-history state) is proven** and the scanned window has no title match (S6 — unread older history is a platform limit). A proven rail without the full Sign-in upsell is an S5 owner/authenticated signal (chip not required). The full S5 login shell still wins over a rail-only heuristic (logged-out empty-history copy must not become `empty`). **Incomplete scans are different:** budget exhausted mid-scroll → `timeout` (`history_budget_exhausted`); missing/unproven history rail → `unavailable` (`history_rail_missing`); never `empty`. Account chip alone does not prove the rail. Selectors are stub-level pending live polish (highest churn; M5). Flat history + any visible Gems/folder links exposing `/app/` ids; no invented Projects clone.

## Selector pack (M5)

Bundled `extension/lib/selectors/local-pack.json` (mirrored by `local-pack.js`) is always enough to search. On startup (and when a content script first loads its adapter), the extension may HTTPS-fetch an optional data-only hotfix from `https://cogis.ai/packs/selectors.json` in the background with a short fetch timeout. The remote document may overlay CSS selectors, wait-predicate strings, and same-host URL / relative endpoint path strings only — absolute off-host endpoints are rejected. Fetch or parse failure, timeout, and any executable-looking payload **fail closed to the local pack**; content scripts hydrate from local immediately so **search is never blocked** on the remote fetch. No `eval`, `new Function`, or remote code import. Pack version / source are exposed via `getSelectorPackStatus()` for the M6 debug panel.

## Privacy & ToS

See [NOTICE](./NOTICE). No API keys. No stored auth. No message-body storage. Selector-manifest fetch carries no query text.

## License

[MIT](./LICENSE)
