# Cogis — AI Search Pre-Blueprint

**Project:** Cogis
**Repository:** [`dsergovic/cogis`](https://github.com/dsergovic/cogis) (private)
**Framework:** [Full-Lifecycle Agentic Software Engineering v1.1.0](https://github.com/dsergovic/research/blob/main/docs/Full-Lifecycle%20Agentic%20Software%20Engineering.md) — this document is the Phase 0 artifact.
**Status:** Phase 0 complete. Every open question raised during Phase 0 review has a written answer below. The next step is compiling `docs/agent_blueprint.md` from this document.
**Version:** 0.2.0

---

## 1. Intent

Cogis is a **cross-AI chat-history launcher**. The user has spent months developing ideas across ChatGPT, Claude, Perplexity, and Gemini — recipes, code, research threads, half-finished writing — and cannot remember which lab a given conversation lived in. Cogis solves that one problem: type a query once, get grouped results from all supported labs, click a result to jump straight to that lab (either to the specific chat if possible, or to the lab with the query pre-filled).

Cogis is not a knowledge base. It does not read, store, index, summarize, or redistribute conversation content. It is a directory of pointers to conversations the user already owns, retrieved live on demand.

**Win condition for V1:** the user types a query in Cogis, sees a grouped list of hits across the four supported labs within a few seconds, and can click any hit to land on that lab's page. Nothing more.

## 2. Users and distribution

Cogis is a **single-user Chrome extension**. One user at a time, using their own already-authenticated browser sessions. Not multi-tenant. Not enterprise. Not team-shared.

The extension is intended to be publicly released — this is not a personal-use-only tool. It will be public and open source. Distribution is via the **Chrome Web Store** eventually; V1 development runs as an unpacked dev build (`dev-unpacked`). Web Store listing is out of scope for V1 and is itself an escalation to the human when we get there (there are ToS and posture questions that need explicit sign-off before listing — see §11).

Other browsers (Firefox, Edge, Brave, Arc) are welcome but must not impact the Chrome-first V1. MV3 is mostly portable, so a port is plausible in a later version.

## 3. Architecture

**One deployable: a Chrome MV3 extension.** No hosted web app, no companion server, no database, no external API surface owned by us.

The extension's **popup is the V1 search surface.** The user clicks the toolbar icon, types a query in the popup, and sees grouped results rendered in that same popup. There is no `cogis.ai/search` page for V1. `cogis.ai` may exist as a marketing/install page, but the search UI lives inside the extension and only inside the extension.

Data flow, at the level Phase 0 needs to lock:

1. User types a query in the popup.
2. The extension's service worker fans out the query to per-platform content scripts running in the user's existing tabs (opening a background tab where none exists).
3. Each content script drives the target lab's own search UI (or, where available, a first-party endpoint reachable from the user's session cookies — see §7) and collects the resulting list of conversation pointers.
4. Results stream back to the popup, grouped by platform, sorted by date descending within each group, and rendered as the user clicks a hit.

Nothing is stored between queries. No local cache in V1 (see §4). No persistent state beyond the manifest's own permissions.

## 4. What Cogis does not do (non-goals)

- **No caching.** Every query re-hits every platform. If the user types the same query twice, they wait twice. This is a deliberate V1 tradeoff — cache complexity is worse than the latency cost while we're still validating the core loop.
- **No message-body scraping, indexing, storage, or redistribution.** Cogis reads what the labs' own search UIs return (titles, timestamps, URLs). It does not scroll into conversations to extract content.
- **No cross-referencing with PortableAI or PortableChat, ever.** Cogis is a launcher. PortableAI/PortableChat are portability projects. Different repos, different Chrome listings, no shared code, no shared docs beyond generic framework docs from `dsergovic/research`.
- **No API keys.** Cogis never asks the user for an API key, OAuth token, or long-lived credential. It uses only the existing browser session cookies the user already has.
- **No stored auth state.** Cogis does not store, cache, or exfiltrate authentication state. Session cookies live where they already live — in the browser, owned by each lab's origin.
- **No shared/team-chat surfaces.** Only the user's own conversations.
- **No SSO-gated enterprise tenants** (ChatGPT Enterprise, Claude for Work with SSO, etc.). If a user is on one of these, Cogis may work or may not; we do not commit to it.
- **No DeepSeek.** Removed from scope.
- **No `cogis.ai/search` as a V1 search surface.** Explicitly a V2 consideration.
- **No native-messaging host or local HTTP endpoint** for external tools (Cursor, CLIs, PortableChat) to query the federated index. This is a **reserved V2 seam** — we design V1 so it doesn't preclude adding one, but we do not build it now.
- **No other browsers in V1.** Firefox / Edge / Brave / Arc are V2+.

## 5. Supported platforms and search-capability policy

Four platforms in V1: **ChatGPT, Claude, Perplexity, Gemini.**

Search capability differs per platform. Cogis's V1 policy: **full-text search where the platform supports it; title-match where it doesn't; the UI labels which is which per-platform.** A small footnote in the results panel — *"Some AIs do not support full-text search"* — makes the degradation visible to the user.

Current understanding (subject to spike confirmation in §9):

- **ChatGPT:** Server-side full-text search via the sidebar's Cmd/Ctrl-K palette. Includes old chats not currently loaded in the DOM. Full-text is a first-class V1 feature here.
- **Claude:** Recents search is title/preview-match. Full-text inside a chat is not a first-class UI feature. Cogis reports Claude results as title-match with the capability label.
- **Perplexity:** Thread search is title-match by default. Full-text behavior needs spike confirmation. There is also a session-cookie-authenticated first-party endpoint that returns the user's thread list; prefer that over DOM-driving (see §7).
- **Gemini:** History search is limited; full-text is not a first-class feature. Title-match with capability label.

**Search scope per platform includes both default history and the user's own Spaces / Projects** (V1b decision). Perplexity Spaces, ChatGPT Projects, and Claude Projects are first-class containers — chats inside them do not appear in the default history — so Cogis must enumerate the user's Spaces/Projects list on each platform and search inside each one. This is real V1 scope, not a nice-to-have.

## 6. Results UX

- **Grouped by platform**, one section per lab.
- **Sorted by date descending within each group**, or in whatever order the lab's own search returns them if that ordering is stable and reasonable.
- **Each result shows:** platform, chat title, date. A short blurb/context preview would be nice, but is not V1 — it is a V2 consideration, explicitly ranked below shipping V1 fast.
- **Clicking a result** either (a) opens the specific chat in a new tab if a direct link is available, or (b) opens the platform with the query pre-filled if not. Which of (a) vs. (b) applies per-platform is itself a spike finding (§9).
- **Per-platform capability label** on each group ("full-text" or "title-match") so the user understands why Claude returned less than ChatGPT.
- **Partial failure is visible, not fatal.** If the user is logged out of Claude, the Claude group renders a "Please log in to Claude" chip with a link. If a lab's DOM has changed and the platform temporarily returns nothing usable, the group renders "Claude is temporarily unavailable" and (aspirationally) offers a way to ping the maintainer to update selectors. The other three groups still render.

## 7. Authentication posture

**Session-cookie authenticated first-party endpoints where they exist; DOM-driving where they don't; graceful failure where the user isn't logged in.** In preference order:

1. **First-party endpoint reachable from the existing browser session.** No API key, no stored state, no separate auth flow — just the same session cookies the browser already has. Perplexity currently exposes such an endpoint for the user's thread list; if the other three ever ship comparable session-cookie surfaces, Cogis uses them under the same rule.
2. **DOM-driving the lab's own search UI** in a background/foreground tab, using the user's live session. This is the general-case fallback.
3. **Graceful failure** with a "please log in" or "temporarily unavailable" chip, per §6.

Cogis never asks the user for an API key. Cogis never stores auth state — session cookies remain owned by each lab's origin, unmodified.

## 8. Readiness and latency handling

The naive "wait 1500ms and hope the DOM has updated" pattern is out. Per-platform readiness is detected with a **MutationObserver on the results container**, resolving when the results list stabilizes. Where a target's re-render pattern thrashes the observer, a debounced polling fallback is permitted as a Tier 2 implementer decision (per framework §3.5) — noted in the PR, output identical, no framework escalation.

Visual feedback during the search-in-flight is required: the popup shows per-group loading state so the user can see which platforms have returned and which are still working. The screen must not jump as results arrive — layout is allocated up front, results fill in place.

Old chats (300 days back or further) must be findable. Where this requires scrolling the sidebar to load history into the DOM before the search box will see it, that's an accepted per-platform limitation to characterize in a spike (§9) — not a V1 blocker.

## 9. Named spike tasks (Phase 1 will formalize these)

Per framework §3.5 Tier 3, spikes are owned by Human + Perplexity. The agent may be commissioned to gather evidence; it does not own or close a spike on its own initiative. Findings are written up and folded back into `agent_blueprint.md` before the milestone that depends on them.

Spike list, minimum:

- **S1 — ChatGPT search contract (M1 spike).** Confirm current DOM contract for the Cmd/Ctrl-K sidebar-search palette; confirm server-side full-text behavior for chats not currently loaded in the DOM; confirm whether direct-to-chat deep-links are available; confirm ChatGPT Projects enumeration and per-project search behavior.
- **S2 — Claude Recents contract.** DOM contract for Recents search; confirm title/preview-only; confirm Claude Projects enumeration.
- **S3 — Perplexity thread contract.** Verify the session-cookie-authenticated thread-list endpoint and its response shape; confirm Spaces enumeration; confirm whether full-text is available anywhere in the surface.
- **S4 — Gemini history contract.** DOM contract for Gemini history search; confirm scope and depth; document the (expected) limitation.
- **S5 — Auth-state detection contract per platform.** How does each platform's DOM signal "logged in and can see the sidebar" vs. "logged out" vs. "logged in but no projects visible"? Cogis needs a clean predicate per platform.
- **S6 — Long-history reach per platform.** Does the platform's own search reach chats that aren't currently loaded in the sidebar DOM, or must Cogis scroll-and-load first? Characterize per platform.

## 10. Milestone shape

**M1 is narrow: ChatGPT only, end-to-end.** Extension shell, popup with search input, service worker, ChatGPT content script, result rendering, capability label, graceful-failure states. Nothing else. The full behavioral acceptance criteria for M1 are authored in Phase 1 as part of `agent_blueprint.md`; codified assertions are typed up as the first task of M1 where they depend on live DOM shape (per framework §3, Guardrail #3).

Each subsequent platform is its own milestone, each with its own spike and implementation:

- **M2 — Perplexity** (session-cookie endpoint preferred over DOM).
- **M3 — Claude** (title-match with capability label).
- **M4 — Gemini** (title-match with capability label; expected to be the thinnest).

Cross-cutting milestones after M4:

- **M5 — Selector hotfix manifest** (data-only, fetched from a cogis.ai path on startup; never executable — see §12).
- **M6 — Telemetry / debug panel** (per-platform latency, hit counts, last-known-good selector version).

## 11. ToS posture

Cogis drives the user's own logged-in sessions to retrieve conversation pointers the user already owns. It does not:

- Bypass authentication, MFA, or rate limits.
- Impersonate the user against any lab's servers.
- Store, redistribute, or resell conversation content.
- Scrape or index conversation bodies.

The extension operates under the user's own credentials, in the user's own browser, at the user's own request. This posture will be stated verbatim in a `NOTICE` (or dedicated section of the `README`) in the repository, so it is visible both to the user and to anyone forking the project.

Chrome Web Store review is largely automated and does not, in practice, police alignment with each target lab's ToS — that enforcement, when it happens, comes from the labs themselves against extension users or authors. Cogis's posture is meant to keep the risk surface small enough that this is not a live concern for personal use, but **listing on the Chrome Web Store is itself an escalation** (framework §3, Guardrail #4): the human decides when and whether to list, after reviewing each target lab's then-current ToS. The agent never lists Cogis autonomously.

## 12. Selector hotfix manifest

Per §10 M5, the extension may fetch a **remote selector manifest** from a cogis.ai path on startup to keep per-platform selectors current without requiring a Chrome Web Store release for every DOM change upstream.

Hard design constraint: **this manifest is data-only.** It contains CSS selectors, wait predicates as strings, and URL patterns as strings. It contains **no executable code, ever** — no JavaScript, no `eval`, no dynamic `import()`, no template-string evaluation of remote content. Extensions that fetch and execute remote code fail Chrome Web Store review under MV3; Cogis does not do that.

Behavior changes ship as an extension version bump. Selector changes ship as manifest data. That line is not crossed.

## 13. Additional requirements from Phase 0 review

These items were called out in Phase 0 and must appear in `agent_blueprint.md`:

- **Auth-state detection per platform** with a clean "please connect X" UX (see §6 and S5).
- **Selector abstraction with versioning** — an internal abstraction layer plus the remote data-only manifest above.
- **Telemetry / observability for the maintainer** — a debug panel showing per-platform latency, hit counts, and last-known-good selector version.
- **Privacy posture, stated explicitly** — queries never leave the local machine; `cogis.ai` does not log queries; session cookies are never captured by the extension.
- **Testing strategy for sites we don't control** — at minimum, recorded HAR fixtures per platform for regression tests, and a nightly smoke test the extension runs against itself. Live DOM contracts (S1–S4) are characterized as spikes, not asserted as fixed.

## 14. V2 seams (reserved, not built)

Design V1 so the following remain plausible additions without a rewrite. None of these ship in V1:

- **`cogis.ai/search` as an additional search surface** (extension bridges to page via `postMessage`, with origin lock and a nonce handshake — never wide-open `"*"`).
- **Native-messaging host or local HTTP endpoint** so external tools (Cursor, CLIs, PortableChat, other user tooling) can query the federated index.
- **Firefox / Edge / Brave / Arc ports.**
- **Snippet / context preview** in results.
- **Result ranking** beyond grouped-by-platform, date-descending.
- **Additional platforms** beyond the V1 four (DeepSeek explicitly not on this list — see §4).

---

## Changelog

| Version | Date | Change |
| --- | --- | --- |
| 0.2.0 | 2026-07-28 | Phase 0 review complete under framework v1.1.0. Framing shifted from cross-lab knowledge base to launcher; architecture collapsed to Chrome MV3 extension with popup-as-search-surface (no hosted web app in V1); DeepSeek removed; capability-labeled full-text established as V1 policy (full-text where supported, title-match with label where not); search scope set to default history plus user's Spaces / Projects per platform (V1b); session-cookie-only authentication rule stated (never API keys, never stored state); MutationObserver-based readiness with polling fallback under framework §3.5 Tier 2; remote selector manifest constrained to data-only; ToS posture and Chrome Web Store listing established as human escalations; V2 seams reserved (cogis.ai search surface, native-messaging host, other browsers, context preview); milestone shape set to M1-narrow (ChatGPT only end-to-end), each subsequent platform its own milestone; six named spike tasks listed for Phase 1 to formalize; starter code section from the original pre-blueprint removed. |
| 0.1.0 | 2026-07-26 | Initial pre-blueprint (versioned retroactively — original brainstorm of cross-lab AI-search concept, ChatGPT+Claude+Perplexity+Gemini+DeepSeek scope, `mysite.com`-plus-extension architecture, first-pass DOM notes and starter code). |
