# S6 — Long-history reach (all platforms)

**Status:** Resolved (Phase 1, 2026-07-28)  
**Owner:** Human + Perplexity  

## Matrix

| Platform | Native reach beyond sidebar DOM? | Scroll-load required? | V1 implication |
| --- | --- | --- | --- |
| **ChatGPT** | **Yes** — official docs: search covers past conversations including those trimmed from sidebar cache; archived remain searchable | **No** for search path | Use search endpoint / search UI; do not infinite-scroll sidebar as primary |
| **Perplexity** | **Yes** via paginated `list_ask_threads` (`offset` / `limit`) | **No** for endpoint path | Page until empty, hit cap, or timeout; default render max 20 |
| **Claude** | **Partial / unknown** at desk — list APIs are paginated in third-party clients; Recents UI may virtualize | **Maybe** for DOM path | Prefer paginated API if available; else scroll-with-budget then search filter |
| **Gemini** | **Limited** — history rail often needs scroll; search depth weak | **Likely yes** for DOM path | Scroll-with-budget inside 8s; document misses as platform limit |

## Shared rules

1. Never block the popup on exhaustive history load past the **8s** platform timeout.  
2. Partial results are success; note truncation only in debug (M6).  
3. “Chat older than N days not found” is **not** automatically `unavailable` if the adapter completed cleanly with empty/partial hits.  
4. US-5 (scroll-to-reveal on the **destination** lab page after click) is separate from search-time scroll.

## Evidence highlights

- ChatGPT Help: sidebar is a compact cache; search fetches fully; archived searchable.  
- Perplexity open-source clients page `list_ask_threads` until short page.  
- Gemini community tooling exists largely because native history UX is weak (folders/timeline extensions) — supports “thin native search” finding.
