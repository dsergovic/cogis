# S7 — Grok history contract

**Status:** **OPEN — stub.** Not a finding. Every field below is `TBD`.  
**Owner:** Human + Perplexity — **or** the first task inside M7 (blueprint §10 M7 — Grok) if this file is still a stub when M7 is handed off.  
**Confidence:** None. Nothing here has been observed live.

> **This file does not authorize any implementation claim.** A `TBD` field is not a default to code against — it is a question. M7 cannot claim its behavioral AC (blueprint §10) against a stub. Fill this in from **live investigation on a logged-in Grok account**, commit it, then implement against it.
>
> **Do not invent endpoints, selectors, URL patterns, or origins.** An unobserved field stays `TBD` and the behavior falls back to the honest default: no deep link, `title-match`, and `unavailable` rather than `empty`. Fabricating a contract here is worse than leaving it open, because everything downstream treats this file as evidence.

## Decisions to lock for M7

| Field | Finding |
| --- | --- |
| **Origin(s)** | **TBD.** Candidates to check live: `grok.com`, `grok.x.ai`, `x.com` (Grok surfaced inside X). Record which origin actually serves the history UI and which ones only redirect — `host_permissions` must be narrow, and a redirect target is not automatically a permission we need. |
| **History surface** | **TBD — unknown whether a searchable history list exists at all.** Determine: is there a history rail / conversations list, does it have its own search box, and is history per-origin or shared across the candidates above. |
| **Preferred strategy** | **TBD.** Session-cookie first-party endpoint **only if observed live in the Network tab**; otherwise DOM-first, per the M4/Gemini precedent. |
| **Capability label** | **TBD — default `title-match`.** Upgrade to `full-text` only with live proof that history search matches message bodies, not just titles. |
| **Deep link** | **TBD.** No pattern assumed. Until a real `/{id}`-style pattern is observed, `deepLinkUrl` stays `null` and the cascade falls back to the origin home/app surface. |
| **Prefill** | **TBD.** Only if a stable query-param URL is observed. |
| **Containers** | **TBD.** Does Grok have a Projects/Spaces equivalent? If the product has none, say so — do not invent a clone (blueprint §4.3). |
| **Auth** | **TBD.** Needs an S5-style predicate set; see below. |

## Auth predicates (S5 shape) — to fill

| State | Signals |
| --- | --- |
| Logged out | **TBD** — capture the actual sign-in shell copy/markers |
| Logged in | **TBD** — capture a positive owner signal, not merely "no sign-in button" |
| Failure | **TBD** — interstitials, rate limits, region/entitlement blocks ⇒ `unavailable`, never `empty` |

Mapping rules are **not** TBD — they are inherited from S5 and are binding regardless of what this spike finds: `401` ⇒ login copy; `403` ⇒ `unavailable` **unless** a login shell is detected; a logged-out state must never surface as a false `empty`.

## Long-history reach (S6 shape) — to fill

- **TBD** — if the adapter ends up DOM-driven, record the scroll/scan ceiling and state it as an `empty`-by-design platform limit, kept **textually separate** from failure truncation (which must never report `empty`).

## Pointer mapping — to fill

- `platform`: `grok`
- `title`: **TBD**
- `dateIso`: **TBD** (null when not shown)
- `deepLinkUrl`: **TBD** — `null` until a pattern is proven
- `prefillSupported`: **TBD** — `false` until proven
- `capability`: **TBD** — `title-match` until proven otherwise

## Residual risks

**TBD** — to be enumerated once the surface is known. Record each one so M7's PR body can address it under **Choices made** per §2.2 of `docs/handoff-prompts.md`.

## Definition of done

- [ ] Origins confirmed live (and narrowed for `host_permissions`)
- [ ] History surface characterized (exists / searchable / where)
- [ ] Strategy chosen with live evidence (endpoint vs DOM-first)
- [ ] Capability label proven, not assumed
- [ ] Deep-link pattern proven, or explicitly recorded as none
- [ ] Container scope characterized (or "no equivalent")
- [ ] Auth predicates captured in the S5 shape
- [ ] Reach ceiling recorded in the S6 shape (if DOM-driven)
- [ ] Residual risks listed
- [ ] Status flipped from **OPEN — stub** to **Resolved**, with a date
