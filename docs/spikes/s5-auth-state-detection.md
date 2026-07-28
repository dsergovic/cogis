# S5 — Auth-state detection contract (all platforms)

**Status:** Resolved (Phase 1, 2026-07-28)  
**Owner:** Human + Perplexity  

## Predicate matrix

Use three outcomes per platform adapter before/during search:

| Outcome | Meaning | Popup chip |
| --- | --- | --- |
| `authenticated` | Session can attempt search | (none — proceed) |
| `login_required` | Clearly logged out | Please log in to {Platform} + link |
| `unavailable` | Ambiguous failure / 5xx / DOM break | {Platform} is temporarily unavailable |

Do **not** treat “zero hits” as login_required.

## ChatGPT

| Outcome | Primary signals |
| --- | --- |
| `login_required` | `data-testid="login-button"` visible **or** `GET /api/auth/session` without usable `accessToken` |
| `authenticated` | accessToken present **or** history nav populated / search 200 |
| `unavailable` | search 5xx, unexpected HTML, timeout |

Login link: `https://chatgpt.com/`

## Perplexity

| Outcome | Primary signals |
| --- | --- |
| `login_required` | Sidebar Sign In **or** `/library` auth modal pattern **or** list_ask_threads 401 |
| `authenticated` | list_ask_threads 200 JSON array (possibly empty) |
| `unavailable` | 5xx, non-JSON error, timeout |

Login link: `https://www.perplexity.ai/`

## Claude

| Outcome | Primary signals |
| --- | --- |
| `login_required` | URL contains `/login` **or** “Continue with Google/email” shell without app recents |
| `authenticated` | App shell + organizations/conversations accessible |
| `unavailable` | 5xx / timeout / unexpected block |

Login link: `https://claude.ai/login`

## Gemini

| Outcome | Primary signals |
| --- | --- |
| `login_required` | Visible “Sign in” CTAs + “Sign in to save activity” without history owner signals |
| `authenticated` | History rail without sign-in upsell **or** account chip present |
| `unavailable` | 5xx / timeout / interstitial |

Login link: `https://gemini.google.com/app`

## Implementation notes

- Prefer **network/session predicates** over brittle CSS when both exist (ChatGPT session, Perplexity list status).  
- CSS signals are backup and belong in the data-only selector pack.  
- Evaluate auth **per platform per request**; never global-fail the popup.
