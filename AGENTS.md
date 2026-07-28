# AGENTS.md

## Cursor Cloud specific instructions

### Repository state (read first)

`cogis` is currently a **documentation-only, Phase 1 blueprint repository**. It contains
only `LICENSE` and markdown docs under `docs/`. There is **no application code, no
`package.json`, no lockfile, no tests, no lint config, and no build** yet.

Because of this, there is nothing to install, build, or run today:

- Running lint / tests / a build is **not applicable** until the toolchain is scaffolded.
- There is no dev server or hosted app to start.

### What the product will be

The blueprint (`docs/agent_blueprint.md`) specifies a **Google Chrome Manifest V3
extension** ("Cogis — AI Search"). Key implications for future dev/testing:

- The extension is meant to be **loaded unpacked** from an `extension/` directory via
  `chrome://extensions` (Developer mode → "Load unpacked"). It is **not** a web server and
  cannot be exercised headlessly like a normal web app. Manual verification requires a
  Chrome browser and logged-in accounts on the target labs (ChatGPT/Claude/Perplexity/Gemini).
- Runtime is browser-native (plain HTML/CSS/JS, no bundler/framework/TypeScript in V1).
- There are **no secrets/API keys** by design (see blueprint §3.7).

### Toolchain that will be introduced at milestone M1

Per blueprint §7 (do not re-litigate), the future dev toolchain is **npm-based** with a
committed `package-lock.json`, and dev-dependencies only for lint/format/test:

- `npm run lint` — ESLint 9.x
- `npm run format:check` / `npm run format` — Prettier 3.x
- `npm test` — Vitest 3.x

Node.js and npm are already available on this VM (Node 22.x / npm 10.x), which satisfies
the intended toolchain. Once M1 scaffolds `package.json` + lockfile, install with
`npm ci` (falls back to `npm install` when no lockfile is present) and use the scripts above.

### Update script behavior

The startup update script is intentionally guarded: it runs `npm ci`/`npm install` only
if a `package.json`/lockfile exists, and is otherwise a no-op while the repo remains
docs-only. It stays valid before and after the M1 scaffold lands.
