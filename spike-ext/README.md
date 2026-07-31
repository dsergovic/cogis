# `spike-ext/` — S8.1 throwaway bridge extension

**This is not the Cogis extension.** This is a throwaway, matched only to `https://cogis.ai/*`, used to prove the S8.1 postMessage handshake contract live in Chrome. It is deleted after S8.1 is filled (or, if we decide it has ongoing diagnostic value, migrated into the real extension behind a debug flag).

Do not build against this. Do not distribute this. The real bridge lives in `extension/content/web-bridge.js` and lands in M8a.

## Contract under test

The addendum's [`docs/agent_blueprint-m8-web-surface.md`](../docs/agent_blueprint-m8-web-surface.md) §3.9 defines the normative handshake and envelope rules. This extension implements them exactly, plus:

- Console logs every observation with a `[s8.1-bridge]` or `[s8.1-sw]` prefix.
- Persists drop counters (`originDropCount`, `nonceDropCount`, `malformedDropCount`) in `chrome.storage.session` under the key `s81Counters`. The spike page reads them via `chrome.runtime.sendMessage` to the SW.

## Load unpacked

1. Copy this whole `spike-ext/` folder onto your local machine (or clone the repo).
2. Open Chrome → `chrome://extensions/`.
3. Enable **Developer mode** (top right toggle).
4. Click **Load unpacked** and select the `spike-ext/` folder.
5. The extension "Cogis S8.1 Spike (throwaway)" appears. Pin it to the toolbar if you want.
6. In `chrome://extensions/`, click the extension's **service worker** link to open the SW DevTools console. Leave that window open.

## Run the observations

1. Open [`https://cogis.ai/spike/s8-1.html`](https://cogis.ai/spike/s8-1.html) in a **new tab**.
2. Open DevTools on that tab (**Console** panel).
3. The page's buttons drive the observations. See [`docs/spikes/s8-1-postmessage-handshake-contract.md`](../docs/spikes/s8-1-postmessage-handshake-contract.md) for the full matrix — the intent is that every row in that file becomes a real observed value from these console outputs.

Between observation runs, **hard-reload the page** (`Ctrl+Shift+R`) to reset the session nonce. Each cold load produces a fresh handshake.

## Unload

When S8.1 is closed:

1. `chrome://extensions/` → remove **Cogis S8.1 Spike (throwaway)**.
2. Delete the `spike-ext/` folder from your local clone (a follow-up PR removes it from the repo).
3. Also delete `web/spike/s8-1.html` from the deployed site by that same follow-up PR.
