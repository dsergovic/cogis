# `web/` — Cogis M8 web surface (subtree)

This is the source for the static site served at [`https://cogis.ai/`](https://cogis.ai/) via GitHub Pages.

## Current state (M8b — ChatGPT only)

`index.html` is the real search surface: searchbox, install-status pill, install-gate, and a single **ChatGPT** result group. Perplexity, Claude, and Gemini fold in during M8c; the debug-panel row is M8d; the DNS cutover and the extension flag flip are M8e.

The page is a renderer, not a search engine. It emits `COGIS_HELLO`, waits for `COGIS_READY`, and then hands queries to the extension over `postMessage`. It resolves nothing itself.

| File                         | Role                                                                                                                                         |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.html`                 | Markup and the exact §3.7 CSP meta. Ships every id and `data-cogis-*` hook the scripts bind to.                                              |
| `404.html`                   | Minimal "page not found" with a link back to `/`.                                                                                            |
| `assets/js/bridge-client.js` | Page half of the §3.9 envelope contract. Mirror of `extension/content/web-bridge.js` — a change to either lands in the same PR as the other. |
| `assets/js/render.js`        | Group rendering and the locked copy. ChatGPT only.                                                                                           |
| `assets/js/page.js`          | Wiring: install-gate budget, input handling, in-flight cancel.                                                                               |
| `assets/css/site.css`        | All styling. Self-hosted, no fonts fetched.                                                                                                  |

The M8 architecture, sub-milestones, and constraints live in [`../docs/agent_blueprint-m8-web-surface.md`](../docs/agent_blueprint-m8-web-surface.md). Read that first before adding anything here.

## Rules for this subtree

- **Flat classic scripts only.** No bundler, no framework, no `type="module"`, no inline `<script>` and no `on*=` attributes — `script-src 'self'` blocks the last two, and a module script is deferred, which would move the `COGIS_HELLO` emit off the tick S8.1 locked.
- **No off-origin resources.** No CDN scripts, no Google Fonts, no analytics, no `fetch`/XHR/WebSocket. `connect-src 'none'` enforces it.
- **CSP is the exact string in §3.7.** `tests/unit/page-contract-parity.test.js` compares it character for character against the addendum. Relaxing it is a Tier 3 escalation (§10).
- **No cookies, no `localStorage`, no `sessionStorage`, no IndexedDB.** No client-side persistence of any kind (§3.5).
- **The 900 ms install-gate budget and the 100 ms re-emit cadence ship as a pair.** The budget was measured with the cadence and is only valid with it — see [`../docs/spikes/s8-2-install-gate-latency.md`](../docs/spikes/s8-2-install-gate-latency.md) (CLOSED), residual risk R5.
- **No copy that claims to know why a handshake failed.** A withheld host permission, a disabled-per-origin extension, and an uninstalled extension are indistinguishable at the protocol level. Say what the page observed, never why.
- **`WEB_SEARCH_SURFACE_ENABLED=false`** in the extension until the M8e cutover.

## Deployment

GitHub Pages serves this folder from the `dev` branch for the duration of M8 development (§6 M8b, v0.1.1); the switch to `main` is M8e work. **Anything merged to `dev` under `web/` is live on the public apex**, so this folder must stay presentable on `dev`, not just on `main`. The `CNAME` file binds the site to the `cogis.ai` apex.

## Local preview

A `file://` or `127.0.0.1` origin will **not** exercise the bridge: the manifest matches `https://cogis.ai/*` and the origin gate is string equality, so any other origin renders the install-gate 100% of the time and proves nothing. For a local smoke that produces a genuine `https://cogis.ai` origin, use the origin-spoof recipe in [`../docs/spikes/s8-2-measurement-runbook.md`](../docs/spikes/s8-2-measurement-runbook.md) §3 Path B. Path B is valid for behavioral checks only — never for timing claims, because the transport is loopback.
