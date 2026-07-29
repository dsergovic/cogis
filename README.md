# Cogis — AI Search

Single-purpose Chrome Manifest V3 extension that searches the user's own conversation history and returns clickable pointers into each AI lab. A **launcher**, not a knowledge base.

**V1 distribution:** `dev-unpacked` only. Load the `extension/` folder in Chrome — there is no hosted app server.

## Milestone status

| Milestone | Scope                                              | Status                    |
| --------- | -------------------------------------------------- | ------------------------- |
| M1        | ChatGPT end-to-end (including Projects via search) | In progress / this branch |
| M2–M4     | Perplexity, Claude, Gemini                         | Not started               |
| M5–M6     | Selector pack remote merge, debug panel            | Not started               |

## Load unpacked

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select the `extension/` directory in this repo
4. Pin **Cogis — AI Search** and open the popup
5. Stay logged into [ChatGPT](https://chatgpt.com/) in the same browser profile
6. After code changes, click **Reload** on the extension card before re-testing

The ChatGPT content script dynamically imports shared `extension/lib/*` modules. Those paths are declared under `web_accessible_resources` for chatgpt hosts only (required for MV3 content-script `import()`).

## Develop

```bash
npm ci
npm test
npm run lint
npm run format:check
```

DevDependencies only (ESLint 9, Prettier 3, Vitest 3). Runtime is plain HTML/CSS/JS — no bundler.

## Capability (M1)

| Platform | Capability    | Deep link                    |
| -------- | ------------- | ---------------------------- |
| ChatGPT  | **full-text** | `https://chatgpt.com/c/{id}` |

Popup footnote: _Some AIs do not support full-text search._

ChatGPT search uses the session-authenticated first-party endpoint `GET /backend-api/conversations/search` (Projects included). List-only history is not used.

## Privacy & ToS

See [NOTICE](./NOTICE). No API keys. No stored auth. No message-body storage.

## License

[MIT](./LICENSE)
