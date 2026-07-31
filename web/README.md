# `web/` — Cogis M8 web surface (subtree)

This is the source for the static site served at [`https://cogis.ai/`](https://cogis.ai/) via GitHub Pages.

## Current state (M8e-preview placeholder)

Only `index.html` exists and it deliberately renders a minimal "In development" placeholder. The real search surface lands in **M8b**.

The M8 architecture, sub-milestones, and constraints live in [`../docs/agent_blueprint-m8-web-surface.md`](../docs/agent_blueprint-m8-web-surface.md). Read that first before adding anything here.

## Rules for this subtree (M8 phase 0 through M8b)

- **No product surface language** until M8b.
- **No bridge protocol implementation.** The `postMessage` bridge lives in the extension (`extension/content/web-bridge.js`), not in the page — the page emits `COGIS_HELLO` and listens for `COGIS_READY` per [`../docs/agent_blueprint-m8-web-surface.md`](../docs/agent_blueprint-m8-web-surface.md) §3.9.
- **No off-origin resources.** No CDN scripts, no Google Fonts, no analytics, no fetch.
- **CSP is `default-src 'none'`.** Anything that needs to be added should tighten, not loosen, this policy.
- **`WEB_SEARCH_SURFACE_ENABLED=false`** in the extension until M8e cutover.
- **No cookies, no `localStorage` writes.** No client-side persistence.

## Deployment

GitHub Pages serves this folder from the `dev` branch (or `main` after M8e cutover). The `CNAME` file binds the site to the `cogis.ai` apex. `www.cogis.ai` redirects to apex via GitHub Pages' built-in behavior (see [`../docs/spikes/s8-3-github-pages-apex-and-www.md`](../docs/spikes/s8-3-github-pages-apex-and-www.md) once filled).

## Local preview

Open `web/index.html` in a browser directly, or serve the folder with any static server. Note that a `file://` or `127.0.0.1` origin will **not** exercise the bridge's origin-lock codepath, which requires the origin string to equal `https://cogis.ai` — see [`../docs/spikes/s8-1-postmessage-handshake-contract.md`](../docs/spikes/s8-1-postmessage-handshake-contract.md) for the S8.1 spike setup.
