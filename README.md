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

| Lab        | Status | Capability |
| ---------- | ------ | ---------- |
| ChatGPT    | Done   | full-text  |
| Claude     | Done   | full-text  |
| Gemini     | Done   | full-text  |
| Perplexity | Done   | full-text  |
| Grok (web) | Done   | full-text  |

**Full-text means the lab's own search, not ours.** ChatGPT, Claude,
Perplexity, Gemini, and Grok all run genuine search over message bodies,
not just titles — Cogis just relays whatever the lab's own search returns; it never
reads, ranks, or re-filters conversation content itself. Two things follow
from that: results can match on body text — or, confirmed live for Claude,
the content of an attached file — that doesn't appear anywhere in the title
shown, and a multi-word query may be matched per-word (OR) rather
than as an exact phrase, depending on how that lab's search works. That's
the lab's relevance behavior, not a Cogis bug. Gemini goes further still —
its search is semantic, not keyword-based, so it can return "relevant"
results for a query with no literal word overlap at all, and will rarely if
ever report zero results for an account with any chat history.

ChatGPT, Claude, Grok, and Perplexity all expose an API their own official
web app calls, reachable straight from the extension's background. Perplexity's
edge additionally requires the request to originate from a real
perplexity.ai page (not the extension background), so that one runs from a
small content script in a background tab instead. Gemini has no such API to
call at all — its search runs on Google's internal `batchexecute` RPC
protocol with a session-bound token, which this project won't attempt to
replicate — so Gemini is fully DOM-driven: a background tab navigates to
Gemini's own "Search chats" UI, types the query in, and reads the rendered
results. Both tab-driven labs are noticeably slower than the two
direct-API ones as a result — tracked in
[#48](https://github.com/dsergovic/cogis/issues/48), not addressed yet.

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
