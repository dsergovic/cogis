# ChatGPT fixtures

These JSON files are **stubs** derived from S1 + public reverse-eng shapes. They are stripped of real cookies and tokens.

## Live-capture gap

A redacted fixture from a successful live `GET /backend-api/conversations/search` response was **not** captured in this milestone environment (no logged-in ChatGPT session available to the agent). After the first successful local smoke:

1. Save the JSON response with cookies/tokens removed.
2. Replace `search.hits.stub.json` (or add `search.hits.live.json`).
3. Confirm query param (`query` vs `q`) and item field names against `extension/lib/results.js`.
4. Pin the winning param in `local-pack.json` / `local-pack.js` `searchQueryParams` and drop the alternate probe if desired.
