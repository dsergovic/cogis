# AGENTS.md

## Cursor Cloud specific instructions

### Repository state (read first)

`cogis` is a **Chrome MV3 extension** repo. Application code lives under `extension/`. Dev tooling (ESLint, Prettier, Vitest) is at the repo root via `package.json` + committed `package-lock.json`.

### Local / Cloud commands

```bash
npm ci
npm test
npm run lint
npm run format:check
```

Node **≥ 20**. Runtime is plain HTML/CSS/JS — no bundler, no secrets/API keys (blueprint §3.7).

### Load unpacked (manual smoke)

1. `chrome://extensions` → Developer mode → **Load unpacked** → select `extension/`
2. Stay logged into the target lab in the same browser profile
3. Reload the extension card after code changes

### CI (GitHub Actions)

Workflow: `.github/workflows/ci.yml`  
Required status check context (once enabled in branch rules): **`build-and-test`**

Runs on PRs and pushes to `dev` / `main`: `npm ci` → lint → format:check → test.

**Operator note:** Do not require `build-and-test` in the GitHub ruleset until this workflow has reported green at least once on a PR. Then: Settings → Rules → Protect dev and main → Require status checks → add `build-and-test`.

### Integration branch

Feature work targets **`dev`**. Do not merge to `dev`/`main` without operator approval.

### Hand-off doc

`docs/handoff-prompts.md` is the source of truth for milestone hand-off and dual-review prompts. It is **attached as agent context**, and you are expected to read **§2** (Definition of Done), **§3** (self-check tables — copy the applicable one into your PR body and fill the evidence column), and **§4** (Known traps).

Two limits: implement **only the milestone named in the prompt the operator pasted** — §5 lists every milestone's prompt, and reading ahead is not authorization to start one. §1, §7, and §8 are operator steps, not yours.

`docs/backlog.md` stays reference-only: cite `BL-0xx` IDs, do not work the backlog on your own initiative.
