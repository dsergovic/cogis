# S8.3 — GitHub Pages apex + `www` redirect + custom-domain HTTPS

**Status:** **OPEN — stub.** Not a finding. Every field below is `TBD`.
**Owner:** Human + Perplexity — **or** the first task inside M8e (see `docs/agent_blueprint-m8-web-surface.md` §6) if this file is still a stub when M8e is handed off.
**Confidence:** None. DNS state and certificate timing must be observed against the actual `cogis.ai` zone before M8e can claim its AC.

> **This file does not authorize any implementation claim.** A `TBD` field is not a default to code against — it is a question. M8e cannot claim its AC against a stub. Fill this in from **live inspection of the `cogis.ai` DNS zone, the GitHub Pages custom-domain settings, and the served certificate**, commit it, then cut over.
>
> **Do not invent DNS records.** GitHub Pages' documented apex-IP set changes over time; take the values from the current GitHub docs at the time of cutover, not from this stub.

## Decisions to lock for M8e

| Field | Finding |
| --- | --- |
| **Apex DNS strategy** | **TBD.** Options in preference order: (1) `ALIAS`/`ANAME` at apex pointing to `dsergovic.github.io`, if the current DNS provider supports it; (2) four `A` records at apex pointing to GitHub Pages' documented apex IPs at the time of cutover. Record which the `cogis.ai` provider supports and which was applied. |
| **`www` DNS record** | **TBD.** `CNAME www.cogis.ai → dsergovic.github.io` (owner-repo-name subdomain, not the pages URL). Confirm applied. |
| **`web/CNAME` file contents** | **TBD.** Exactly the apex host `cogis.ai` (no protocol, no path, no trailing newline beyond the file's natural terminator). Confirm bytes on disk match. |
| **GitHub Pages source** | **TBD.** Repository Settings → Pages → Source = `main` branch, folder = `/web`. Confirm applied. Confirm that `dev` never publishes. |
| **Enforce HTTPS toggle** | **TBD.** Repository Settings → Pages → "Enforce HTTPS" enabled. Confirm applied. |
| **Custom-domain certificate** | **TBD.** Let's Encrypt certificate issued by GitHub Pages for `cogis.ai` **and** `www.cogis.ai`. Confirm both are on the cert and cover the expected SANs. Record issue timestamp and expiry. |
| **`www` → apex redirect** | **TBD.** GitHub Pages auto-configures a 301 from `www.cogis.ai` to the apex when both hostnames are configured as custom domains. Confirm with `curl -I https://www.cogis.ai/` — expected `HTTP/2 301` + `location: https://cogis.ai/`. |
| **`http://` → `https://` redirect** | **TBD.** With Enforce HTTPS on, GitHub Pages 301s all `http://` traffic to `https://`. Confirm with `curl -I http://cogis.ai/` and `curl -I http://www.cogis.ai/`. |
| **Propagation window** | **TBD.** Time from DNS change → global resolution → GitHub Pages cert issuance. Record actual observed timing for the cutover. |
| **Cache-Control for HTML** | **TBD.** GitHub Pages defaults are usually acceptable; record the observed `Cache-Control` header on `index.html` and confirm it isn't so aggressive that a bug fix takes hours to reach users. If it is, add a `_headers` file only if the provider supports it (GH Pages does not, natively — this stays a documentation note). |

## Bridge content-script scope check — to prove

| Origin visited | Bridge injected? |
| --- | --- |
| `https://cogis.ai/` | **TBD — expected YES** (manifest `matches`) |
| `https://www.cogis.ai/` | **TBD — expected NO** (not in `matches`); the 301 fires first, so the bridge only ever sees the apex origin |
| `https://cogis.ai/some/path` | **TBD — expected YES** (path wildcard) |
| `https://cogis.ai:8080/` | **TBD — expected NO** (custom port not in `matches`) |
| `http://cogis.ai/` | **TBD — expected NO** (scheme mismatch); Enforce-HTTPS 301 fires first anyway |

Verify by loading each origin (with DevTools open) and confirming the presence/absence of the bridge's characteristic console line (a single "cogis: web bridge ready" log, gated behind the debug flag, is acceptable for this verification and must be stripped from production).

## Rollback paths — to prove

| Scenario | Action | Expected recovery time |
| --- | --- | --- |
| Page renders broken UI, extension fine | Flip `WEB_SEARCH_SURFACE_ENABLED = false` and ship an extension version bump | **TBD** — expected < 1 hour if the human is available to build/sign/upload; the page shows install-gate forever until the flag returns |
| Page needs to disappear entirely | Remove `web/CNAME` on `main`, or unpublish the GitHub Pages custom domain in repo settings | **TBD** — expected on the order of DNS + browser cache; document the DNS TTL on `cogis.ai` |
| Certificate does not issue | Wait for GitHub Pages to retry (documented backoff); confirm both hostnames are set as custom domains simultaneously | **TBD** — record the actual retry cadence observed |

## Residual risks

**TBD** — likely candidates: DNS provider not supporting `ALIAS`/`ANAME` (falls back to A-records with occasional GitHub IP churn); cert issuance failing when only apex is configured before `www`; browser DNS cache masking a broken record during smoke; Enforce-HTTPS toggle not yet available in GitHub Pages UI until the cert issues (documented GH Pages ordering quirk). Enumerate each so M8e's AC #1, #2, and #6 defend against it.

## Definition of done

- [ ] Apex DNS records applied and confirmed with `dig +short cogis.ai`
- [ ] `www` CNAME applied and confirmed with `dig +short www.cogis.ai`
- [ ] `web/CNAME` file contents confirmed byte-for-byte
- [ ] GitHub Pages source set to `main`/`/web`; Enforce HTTPS enabled
- [ ] Certificate issued and observed to cover both apex and `www`
- [ ] `www → apex` 301 confirmed via `curl -I`
- [ ] `http → https` 301 confirmed via `curl -I` for both hostnames
- [ ] Bridge scope check completed for the five rows above
- [ ] Rollback paths (a) and (b) rehearsed and timed
- [ ] Residual risks enumerated with mitigations
