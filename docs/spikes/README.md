# Cogis spike findings

Written findings for framework Tier 3 spikes. Owned by Human + Perplexity.

| Spike | File | Status | Date |
| --- | --- | --- | --- |
| S1 ChatGPT search contract | [s1-chatgpt-search-contract.md](./s1-chatgpt-search-contract.md) | Resolved (desk + public UI + third-party reverse-eng; live selector polish deferred to M1 codified tests) | 2026-07-28 |
| S2 Claude Recents contract | [s2-claude-recents-contract.md](./s2-claude-recents-contract.md) | Resolved (same evidence bar) | 2026-07-28 |
| S3 Perplexity thread contract | [s3-perplexity-thread-contract.md](./s3-perplexity-thread-contract.md) | Resolved (endpoint-first) | 2026-07-28 |
| S4 Gemini history contract | [s4-gemini-history-contract.md](./s4-gemini-history-contract.md) | Resolved (thin surface) | 2026-07-28 |
| S5 Auth-state detection | [s5-auth-state-detection.md](./s5-auth-state-detection.md) | Resolved (matrix) | 2026-07-28 |
| S6 Long-history reach | [s6-long-history-reach.md](./s6-long-history-reach.md) | Resolved (matrix) | 2026-07-28 |
| S7 Grok history contract | [s7-grok-history-contract.md](./s7-grok-history-contract.md) | **Open — stub only** (all fields `TBD`; live fill-in required before M7 can claim its AC) | — |

**Evidence bar note:** Local Comet browser (user cookies) was unavailable in the Phase 1 session. Findings combine official docs, logged-out live UI probes (2026-07-28), and multiple independent open-source reverse-engineering sources. Residual risk is limited to brittle CSS selectors and occasional endpoint param drift — handled as M-milestone first-task codified tests + M5 selector pack, not as open product questions.
