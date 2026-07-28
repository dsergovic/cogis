# S3 — Perplexity thread contract

**Status:** Resolved (Phase 1, 2026-07-28)  
**Owner:** Human + Perplexity  
**Confidence:** High on list endpoint + deep links + prefill URL; Medium on Spaces enumeration endpoint shape; Medium on whether `search_term` is full-text or title-only

## Decisions locked for M2

| Field | Finding |
| --- | --- |
| **Preferred strategy** | **Session-cookie first-party endpoint** (not DOM-first): `POST https://www.perplexity.ai/rest/thread/list_ask_threads?version=2.18&source=default` |
| **Capability label** | **`title-match`** until a live probe proves `search_term` matches bodies; UI may upgrade label only after human-amended finding |
| **Deep link** | **Yes** — `https://www.perplexity.ai/search/{slug}` |
| **Prefill** | **Yes** — `https://www.perplexity.ai/search?q={urlencodedQuery}` (also used by third-party launchers) |
| **Spaces** | Spaces UI at `https://www.perplexity.ai/spaces` (auth-gated). Default `list_ask_threads` covers Library/History threads; **Spaces-only threads require additional enumeration** (see below). |
| **Auth** | Browser session cookie (commonly `__Secure-next-auth.session-token` / Auth.js variants). Same-origin authenticated `fetch` from content script / page context. Never copy cookie to extension storage. |
| **API version header** | Web client uses `x-app-apiversion: 2.18` and `x-app-apiclient: default` (version string will drift — selector/config pack field). |

## Evidence

### Live logged-out UI (2026-07-28)

- Home search works logged out; Library (`/library`, sidebar label “History”) and Spaces (`/spaces`) show auth modals.
- Invalid thread slug → home + “This session does not exist.”
- Thread URL pattern `/search/{slug}` confirmed via robots/public behavior.

### Open-source clients (corroborated)

[byteowlz/hstry perplexity provider](https://github.com/byteowlz/hstry/blob/main/extension/providers/perplexity.js) and [jacob-bd/perplexity-web-mcp constants](https://github.com/jacob-bd/perplexity-web-mcp/blob/main/src/perplexity_web_mcp/constants.py):

```http
POST /rest/thread/list_ask_threads?version=2.18&source=default
Content-Type: application/json
x-app-apiclient: default
x-app-apiversion: 2.18

{"limit":20,"ascending":false,"offset":0,"search_term":"<query>"}
```

List item fields used by exporters (pointer-relevant): `title`, `slug`, `last_query_datetime`, `uuid` / `context_uuid`, `display_model`.

Thread detail (body — **do not use for V1 results**): `GET /rest/thread/{slug}?…`

Billing/session pattern also documented in [CodexBar Perplexity notes](https://github.com/steipete/CodexBar/blob/main/docs/perplexity.md) (cookie names; different endpoint).

### Prefill

`https://www.perplexity.ai/search?q=` is used in the wild (e.g. desktop wrappers) to open Perplexity with a query.

## Spaces enumeration

| Approach | Notes |
| --- | --- |
| A. Discover Spaces list endpoint via Network tab on `/spaces` in M2 spike polish | Preferred once live session available |
| B. DOM-drive Spaces directory + per-Space thread lists | Fallback |
| C. Rely on `search_term` if it already returns Space threads | Best if true — verify first in M2 |

**M2 acceptance:** must find a thread that exists only in a Space **or** document a hard platform limitation with blueprint amendment. Implementer tries C then A then B; choice among working strategies is Tier 2 only after one works; “give up on Spaces” is Tier 4.

## Pointer mapping

- `platform`: `perplexity`
- `title`: `item.title`
- `dateIso`: from `last_query_datetime`
- `deepLinkUrl`: `https://www.perplexity.ai/search/${slug}`
- `prefillSupported`: `true` (URL prefill)
- `capability`: `title-match` (until proven otherwise)

## Auth predicates

| State | Signals |
| --- | --- |
| Logged out | Sidebar “Sign In”; `/library` auth modal; list endpoint 401/empty unauthorized |
| Logged in | Library shows sessions; list endpoint 200 with array |
| Failure | Non-auth 5xx / HTML error page → unavailable |

## Residual risks

1. `version=2.18` will age out — keep in data pack.  
2. `search_term` semantics unknown (title vs full-text) — label conservatively.  
3. Spaces API not pinned in third-party sources as cleanly as list_ask_threads.  
4. Rate limits / bot detection on rapid POST.

## Definition of done

- [x] Endpoint-vs-DOM decision: **endpoint-first**  
- [x] Capability label decision  
- [x] Cascade flags (deep link + URL prefill)  
- [x] Spaces approach ladder documented  
- [x] Auth predicates sketched  
