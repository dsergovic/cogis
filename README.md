# Cogis — AI Search

A single-purpose Chrome extension that searches **your own** conversation history across AI labs and jumps you straight back into the original chat. A launcher, not a knowledge base.

## The rules (non-negotiable)

- **No caching.** Every search re-hits every lab, live. Type the same query twice, it searches twice.
- **No stored query or result data.** Nothing about a search is written to disk, `chrome.storage`, or anywhere else.
- **No central logging or telemetry.** Cogis has no backend. Nothing phones home. No analytics, no crash reporting, no "anonymous" usage pings.
- **No API keys, no stored auth.** Cogis uses the session cookies already in your browser. It never asks for a credential and never persists one.
- **No message-body scraping.** Only title, date, and a link back to the conversation ever leave a lab's own page.

See [`NOTICE`](./NOTICE) for the full privacy/ToS posture.

## Status

Early rebuild. See [Issues](https://github.com/dsergovic/cogis/issues) for what's tracked. Labs land one at a time, each verified against its live, logged-in contract before the adapter is written — no lab ships from guesswork.

| Lab        | Status      |
| ---------- | ----------- |
| ChatGPT    | Not started |
| Claude     | Not started |
| Gemini     | Not started |
| Perplexity | Not started |
| Grok (web) | Not started |

## Load unpacked

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select the `extension/` directory in this repo
4. Pin **Cogis — AI Search** and open the popup
5. Stay logged into whichever labs you want to search, in the same Chrome profile
6. After code changes, click **Reload** on the extension card

## Develop

```bash
npm ci
npm test
npm run lint
npm run format:check
```

DevDependencies only (ESLint 9, Prettier 3, Vitest 3). Runtime is plain HTML/CSS/JS — no bundler, no framework.

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs lint, format check, and unit tests on PRs and pushes to `dev` / `main`. Status check context: **`build-and-test`**.

## License

[MIT](./LICENSE)
