# S1 — ChatGPT search contract

**Status:** Resolved (Phase 1, 2026-07-28)  
**Owner:** Human + Perplexity  
**Confidence:** High on capability, deep links, Projects via search; Medium on exact DOM selectors / request headers (confirm in M1 live run)

## Decisions locked for M1

| Field | Finding |
| --- | --- |
| **Preferred strategy** | **First-party session endpoint** `GET /backend-api/conversations/search` (pointer fields only). DOM-driving the “Search chats” UI is fallback if endpoint shape drifts. |
| **Capability label** | **`full-text`** |
| **Deep link** | **Yes** — `https://chatgpt.com/c/{conversation_id}` |
| **Prefill** | **Partial** — no stable documented URL that opens the history-search palette with a query. Cascade step 2 = open ChatGPT and focus search UI with query available to the content script (not a shareable prefill URL). If focus fails → lab home `https://chatgpt.com/`. |
| **Projects** | **In scope via search endpoint.** Plain `GET /backend-api/conversations` list does **not** reliably include chats that live only inside Projects; **search does** include them. M1 must use search (or equivalent that covers Projects), not list-only. |
| **Auth** | Session cookies on `chatgpt.com` → `GET /api/auth/session` yields `accessToken` for `Authorization: Bearer …` on backend-api calls. Never persist token outside the page/session worker memory for the request. |
| **Long history** | Native search reaches chats not in the sidebar cache (including archived). See S6. |

## Evidence

### Official product docs

OpenAI Help: [How do I search my chat history in ChatGPT?](https://help.openai.com/en/articles/10056348-how-do-i-search-my-chat-history-in-chatgpt) (retrieved 2026-07-28):

- Entry: left-sidebar magnifying glass; **Ctrl+K** (Windows) / **Cmd+K** (Mac).
- Scope: **title and content** of past conversations; exact keyword matches.
- Archived chats remain searchable; deleted chats do not.
- Sidebar only keeps a compact recent cache; search forces full fetch.

### Live logged-out UI (cloud browser, 2026-07-28)

- `https://chatgpt.com/` loads without hard redirect.
- Auth CTAs: `data-testid="login-button"`, `data-testid="signup-button"`.
- Sidebar shell present: `nav[aria-label="Chat history"]` empty when logged out.
- Search control present: `button[aria-label="Search chats"]`.
- No `/c/{id}` links in logged-out DOM.

### Third-party reverse engineering (corroborated)

Multiple independent sources document:

| Endpoint | Role |
| --- | --- |
| `GET /api/auth/session` | Session → `accessToken` |
| `GET /backend-api/conversations` | Paginated list (default history; **Projects often missing**) |
| `GET /backend-api/conversations/search?query=…` | Full-text search across conversations **including Projects** |
| `GET /backend-api/conversation/{id}` | Full tree (Cogis must **not** use this for V1 search results — body scrape non-goal) |

Sources include public reverse-eng notes such as [vivim-platform ChatGPT backend-api endpoints](https://github.com/owenservera/vivim-platform/blob/main/extensions/BLUEPRINTS/ai-api-protocols/chatgpt/chatgpt-backend-api-endpoints.md), [paprwork conversations API notes](https://github.com/Papr-ai/paprwork/blob/main/docs/CHATGPT_CONVERSATIONS_API.md), and exporter gists documenting `/backend-api/conversations` pagination. Projects gap called out explicitly in chatgpt-exporter documentation: list omits Project-only chats; search finds them.

### Deep link pattern

Widely observed production pattern: `https://chatgpt.com/c/{uuid}`. Shared links use `https://chatgpt.com/share/{id}` ([OpenAI Shared Links FAQ](https://help.openai.com/articles/7925741-chatgpt-shared-links-faq)) — **not** used for launcher deep links (those are snapshots for others).

## Pointer record mapping (implementer)

From search hit → Cogis pointer:

- `platform`: `chatgpt`
- `title`: search item title
- `dateIso`: from `update_time` / `create_time` when present (Unix seconds → ISO)
- `deepLinkUrl`: `https://chatgpt.com/c/${id}`
- `prefillSupported`: `false` for URL-prefill; content-script assist optional
- `capability`: `full-text`

**Do not** attach message bodies, snippets longer than lab-provided title, or raw tokens to stored state (V1 stores nothing between queries anyway).

## Auth predicates (feeds S5)

| State | Signals |
| --- | --- |
| Logged out | `data-testid="login-button"` visible; `/api/auth/session` lacks usable `accessToken`; history nav empty |
| Logged in searchable | Session endpoint returns user + accessToken; search returns 200 with items or empty list |
| Logged in but failing | 401/403 on backend-api → treat as login_required or unavailable per status |

## Selector hints (brittle — pack in local-pack.json)

- `button[aria-label="Search chats"]`
- `nav[aria-label="Chat history"]`
- `data-testid="login-button"`
- `data-testid="create-new-chat-button"`

Exact result-row selectors for DOM fallback: **confirm in M1 live** and write into selector pack.

## Residual risks

1. Search query param name (`query` vs `q`) and response JSON field names may drift — pin via fixture after first successful live capture.  
2. Sentinel / anti-bot may throttle automated calls; prefer same-origin fetch from content script with page cookies over extension-origin fetch if CORS/blocks appear.  
3. Workspace / team accounts may add headers (`chatgpt-account-id`) — if personal account works without it, keep minimal; multi-account is non-goal.  
4. CSS for DOM fallback will break; M5 remote pack is the mitigation.

## Definition of done

- [x] Search entry + full-text capability documented  
- [x] Deep-link pattern documented  
- [x] Prefill limitation documented  
- [x] Projects approach documented (search, not list-only)  
- [x] Auth predicate sketch documented  
- [x] Residual risks listed  

**Human approval of this finding unlocks M1 adapter implementation** (scaffold/tests may proceed in parallel).
