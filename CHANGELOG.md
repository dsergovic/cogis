# Changelog

All notable changes to Cogis are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## 2026-09-16
### Added
- Initial `CHANGELOG.md`.
### Docs
- Updates to the Cogis decision doc.

Authors: David Sergovic

## 2026-09-07
### Docs
- Documentation pass across the project docs set ("Docs init").

Authors: David Sergovic

## 2026-08-23 – 2026-08-24
### Added
- Extension toolbar icon: bold "C" in Segoe UI, white background, black border.
### Fixed
- Icon background made transparent, with a larger bold "C" filling the icon.
- Icon "C" shrunk slightly to stop it clipping in the real toolbar.
- Icon "C" vertical centering corrected.
- `grok-adapter` and `popup.html` brought in line with Prettier's line-width rule.

Authors: David Sergovic, Claude Sonnet 5

## 2026-08-22
### Changed
- Popup redesigned with a search-engine-style layout.
- General search-quality improvements.

Authors: David Sergovic

## 2026-08-21
Lean V1 rebuild: the extension was rebuilt from a lean scaffold, replacing the M1–M8 blueprint-era prototype (see the 2026-07-26 – 2026-08-01 section below) with live-verified per-platform adapters.

### Added
- Lean V1 scaffold, dropping the earlier phase-based process docs and scope creep.
- ChatGPT adapter (background-fetched, live-verified).
- Claude adapter (background-fetched, live-verified).
- Perplexity adapter (background-fetched, live-verified).
- Gemini adapter (DOM-driven, live-verified).
- Grok (web) adapter (background-fetched, live-verified).
- Cogis now opens as a centered popup window instead of a toolbar dropdown.
- Popup UI polish: a "Ready" state, stay-open-on-blur, and per-lab result collapse.
- Collapse-arrow styling, lab-name toggle, and modal-like link click behavior.
- Long result titles are truncated for display, with the full title available on hover.
### Fixed
- Perplexity search now runs from a page context instead of the background, and self-heals its tab messaging via scripting injection.
- Content scripts guarded against a double-injection crash.
### Docs
- Noted attached-file content as another full-text match source.

Authors: David Sergovic, Claude Sonnet 5

## 2026-07-26 – 2026-08-01 (superseded)
Initial blueprint-driven build-out of the extension through milestones M1–M8, plus the S8.1/S8.2 spikes for the `cogis.ai` web bridge and install-gate latency. This whole phase was superseded by the 2026-08-21 lean V1 rebuild above; full detail lives in git history rather than being repeated here.

### Added
- M1: extension scaffold and end-to-end ChatGPT search.
- M2: Perplexity endpoint-first search with a Spaces ladder.
- M3: Claude org-API search with Projects scope.
- M4: Gemini DOM-first title-match adapter.
- M5: data-only selector pack with fail-closed remote merge.
- M6: debug panel and a default-off anonymous ping.
- M8: `cogis.ai` web search surface, first ChatGPT-only, then extended to all four labs (later reverted behind a flag).
- S8.1: throwaway spike proving out the postMessage handshake contract for the web bridge; formalized, then torn down.
- S8.2: install-gate latency measurement spike, closed at 900 ms.
- CI: GitHub Actions build-and-test workflow, and a Pages workflow publishing the `web/` subtree.
### Fixed
- Numerous PR-review follow-ups across M1–M5 (content-script ownership and timeouts, Spaces probe gating, Projects coverage/honesty, Gemini history-rail signal handling).
- Re-search tab litter and orphaned tabs; popup footer pinning and layout regressions (later reverted).
### Docs
- Phase 0/1 blueprint, backlog entries, M7 (Grok) hand-off prompts, and a lessons-learned writeup.

Authors: David Sergovic, Claude Sonnet 5
