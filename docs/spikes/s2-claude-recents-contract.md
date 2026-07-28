# S2 — Claude Recents contract

**Status:** Resolved (Phase 1, 2026-07-28)  
**Owner:** Human + Perplexity  
**Confidence:** High on deep-link pattern and logged-out auth wall; Medium on search capability (title/preview) and Projects API; Medium on exact list endpoint query params

## Decisions locked for M3

| Field | Finding |
| --- | --- |
| **Preferred strategy** | **First-party session endpoints** under `https://claude.ai/api/organizations/{orgId}/…` when reachable with session cookies; DOM Recents/search fallback. |
| **Capability label** | **`title-match`** (Recents / chat list search is not marketed as full-text body search; treat as title/preview unless live probe upgrades). |
| **Deep link** | **Yes** — `https://claude.ai/chat/{conversation_uuid}` |
| **Prefill** | **No stable public prefill URL** for history search. Cascade: deep link → else open `https://claude.ai/` (lab home) and optionally focus Recents search via content script. |
| **Projects** | First-class product surface. Chats inside Projects need enumeration of projects then chats (or a search API that includes them). Exact routes confirmed in M3 live Network tab; do not ship list-only of root recents. |
| **Auth** | Session cookies on `claude.ai`. Org id from `GET /api/organizations` (pattern used by multiple open-source clients). |
| **Logged-out UX** | Hard redirect `claude.ai/` → `claude.ai/login` — strong auth signal. |

## Evidence

### Live logged-out UI (2026-07-28)

- Immediate redirect to `https://claude.ai/login`.
- CTAs: Continue with Google, Continue with email.
- No recents, no search UI when logged out.
- Marketing/pricing rendered on login page.

### URL and API patterns (third-party)

- Chat deep links: `https://claude.ai/chat/{uuid}` widely used in public repos and share references.
- List/create conversation APIs observed in open-source clients:
  - `GET https://claude.ai/api/organizations`
  - `GET/POST https://claude.ai/api/organizations/{orgId}/chat_conversations`
  - Conversation detail: `.../chat_conversations/{id}?tree=true&…` (body — **not** for V1 pointer search)

### Product expectation (pre-blueprint)

Claude Recents search is title/preview-class; full-text inside a chat is not a first-class global history feature. Label **title-match**.

## Pointer mapping

- `platform`: `claude`
- `title`: conversation name/title from list/search
- `dateIso`: updated_at / created_at when present
- `deepLinkUrl`: `https://claude.ai/chat/${uuid}`
- `prefillSupported`: `false` (URL); content-script assist optional
- `capability`: `title-match`

## Auth predicates

| State | Signals |
| --- | --- |
| Logged out | Location `/login`; “Continue with Google/email”; no chat shell |
| Logged in | App shell with recents; organizations endpoint 200 |
| Failure | 403/5xx on org or conversations → unavailable |

## Residual risks

1. Official web search-within-recents DOM is less documented than ChatGPT — expect selector churn.  
2. Projects API path names need live confirmation.  
3. Enterprise SSO tenants are non-goals; may break org enumeration.  
4. Anti-bot / CSRF headers may be required for some methods — prefer GET list with cookies first.

## Definition of done

- [x] Capability label  
- [x] Deep link pattern  
- [x] Prefill limitation  
- [x] Projects required (enumeration ladder)  
- [x] Auth predicates  
