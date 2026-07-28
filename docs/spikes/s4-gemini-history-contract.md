# S4 — Gemini history contract

**Status:** Resolved (Phase 1, 2026-07-28)  
**Owner:** Human + Perplexity  
**Confidence:** High on deep-link pattern and logged-out signals; Low–Medium on search API (expect DOM-first, thin history search)

## Decisions locked for M4

| Field | Finding |
| --- | --- |
| **Preferred strategy** | **DOM-driving Gemini history UI** first. No stable, well-corroborated public “search all history” first-party endpoint comparable to ChatGPT search or Perplexity `list_ask_threads` was found at desk. If M4 live Network tab reveals a clean list/search endpoint with session cookies only, switch (Tier 2 note + fixture). |
| **Capability label** | **`title-match`** |
| **Deep link** | **Yes** — `https://gemini.google.com/app/{conversation_id}` |
| **Prefill** | **No reliable history-search prefill URL.** Cascade: deep link → else `https://gemini.google.com/app` home. |
| **Containers** | Gemini history is largely flat; “Gems” / other containers characterized live in M4. Treat “user’s own history list + any visible folders/gems the UI exposes” as scope; do not invent a Projects clone if the product has none. |
| **Auth** | Google account session on `gemini.google.com`. Logged-out shows multiple Sign in CTAs and “Sign in to save activity.” |

## Evidence

### Live logged-out UI (2026-07-28)

- `https://gemini.google.com/app` loads without redirect.
- Three Sign in entry points; sidebar message “Sign in to save activity.”
- History list empty/gated; New chat visible; prompt box rendered.
- No conversation ids in logged-out DOM.

### Deep links

Multiple public artifacts and tools reference:

`https://gemini.google.com/app/{conversation_id}`

(hex-like ids observed in the wild). Recent user reports note occasional deep-link fragility after Google-side changes — implement open-in-tab and tolerate home fallback.

### Search quality

Community and pre-blueprint expectation: history search is limited; not a first-class full-text product feature. Label **title-match**. Old chats may require scrolling the history rail (S6).

## Pointer mapping

- `platform`: `gemini`
- `title`: history item title
- `dateIso`: if shown; else null
- `deepLinkUrl`: `https://gemini.google.com/app/${id}` when id known
- `prefillSupported`: `false`
- `capability`: `title-match`

## Auth predicates

| State | Signals |
| --- | --- |
| Logged out | “Sign in” buttons; “Sign in to save activity”; empty history |
| Logged in | History items or empty-history-without-sign-in-prompt; account avatar/chip |
| Failure | Interstitial errors / workspace restrictions → unavailable |

## Residual risks

1. Thinnest platform — highest selector churn.  
2. Deep links have had breakage reports; keep cascade honest.  
3. Google account chooser / multiple accounts may confuse tab session.  
4. Enterprise Workspace policies out of scope.

## Definition of done

- [x] DOM-first strategy  
- [x] Capability title-match  
- [x] Deep link pattern  
- [x] Prefill none  
- [x] Limitations explicit  
