# Cogis — AI Search

Single-purpose Chrome Manifest V3 extension that searches the user's own conversation history and returns clickable pointers into each AI lab. A **launcher**, not a knowledge base.

**V1 distribution:** `dev-unpacked` only. Load the `extension/` folder in Chrome — there is no hosted app server.

## Milestone status

| Milestone | Scope                                              | Status          |
| --------- | -------------------------------------------------- | --------------- |
| M1        | ChatGPT end-to-end (including Projects via search) | Merged to `dev` |
| M2        | Perplexity end-to-end (Library + gated Spaces)     | Merged to `dev` |
| M3        | Claude end-to-end (Recents + Projects)             | In progress     |
| M4        | Gemini                                             | Not started     |
| M5–M6     | Selector pack remote merge, debug panel            | Not started     |

## Load unpacked

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select the `extension/` directory in this repo
4. Pin **Cogis — AI Search** and open the popup
5. Stay logged into [ChatGPT](https://chatgpt.com/), [Perplexity](https://www.perplexity.ai/), and/or [Claude](https://claude.ai/) in the same browser profile
6. After code changes, click **Reload** on the extension card before re-testing

Content scripts dynamically import shared `extension/lib/*` modules. Those paths are declared under `web_accessible_resources` per lab host (required for MV3 content-script `import()`).

## Develop

```bash
npm ci
npm test
npm run lint
npm run format:check
```

DevDependencies only (ESLint 9, Prettier 3, Vitest 3). Runtime is plain HTML/CSS/JS — no bundler.

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs lint, format check, and unit tests on PRs and pushes to `dev` / `main`. The job name — and branch-protection check context — is **`build-and-test`**.

After the first green run: Settings → Rules → require status check `build-and-test` on `dev` and `main`.

## Capability (M1–M3)

| Platform   | Capability      | Deep link                                 | Prefill                               |
| ---------- | --------------- | ----------------------------------------- | ------------------------------------- |
| ChatGPT    | **full-text**   | `https://chatgpt.com/c/{id}`              | —                                     |
| Perplexity | **title-match** | `https://www.perplexity.ai/search/{slug}` | `https://www.perplexity.ai/search?q=` |
| Claude     | **title-match** | `https://claude.ai/chat/{uuid}`           | —                                     |

Popup footnote: _Some AIs do not support full-text search._

- ChatGPT: session-authenticated `GET /backend-api/conversations/search` (Projects included).
- Perplexity: session-cookie `POST /rest/thread/list_ask_threads` with `search_term` (Library). Spaces-only recovery via unproven per-Space routes is **gated off** until a live-proven path lands; C may still return Space-tagged threads when the lab includes them.
- Claude: session-cookie org APIs (`GET /api/organizations` → paginated `chat_conversations` + Projects enumeration). Client-side title filter; no stable prefill URL. **Reach ceiling:** root history scanned ≈ 5 × pageSize (~100 conversations). **Projects:** routes inferred from third-party clients / not yet live Network-tab confirmed — Project-only findability unverified until operator smoke; ladder failures surface as unavailable rather than empty (see BL-022). DOM Recents search fallback deferred (BL-023; M1/M2 endpoint-only precedent).

## Privacy & ToS

See [NOTICE](./NOTICE). No API keys. No stored auth. No message-body storage.

## License

[MIT](./LICENSE)
