# Cogis.ai — Decision Document

**Status:** Open (not a README, not a one-pager)  
**Owner:** David Sergovic (decide) · Aria (maintain)  
**Entity:** Refinery LLC · Brand working title: **Cogis.ai** · Category phrase: **Ephemeral Trust**  
**Last updated:** Sun Sep 6, 2026, ~3:30 PM ET  
**Supersedes / folds in:** Instinct overnight strategy brief (`instinct-oss-strategy-brief.md`), Cogis Ephemeral Trust one-pager (David draft), Aria–David chat locks through Sep 6 afternoon  

**How to use this doc:** Read §0–§2 for the locked product shape. Read §3 for agreements vs pushbacks. Read §4 steelman before greenlighting. Read §5 before opening free SMS or shipping a public GitHub. Open questions live in §8 and on Desk.

---

## 0. One-screen lock (current)

| Decision | Lock |
|----------|------|
| Category | New space: **glass-box desktop + SMS**, not “safer Instinct,” not “easier OpenClaw” |
| Trust model | **Confirm-first** · **Ephemeral Trust** · nuke switch · no silent sends |
| Install bar | **Download → create account → log in.** Nothing else for normals |
| BYOK | **Scratched entirely** (no Twilio keys, no LLM keys for the default path) |
| Inference | **Cogis-billed** (hosted model spend under Refinery accounts) |
| SMS | **Cogis-hosted Twilio** (user texts a normal number); free demo texts before full use; paid for real services |
| Push-via-app | **Scratched** (extra download friction) |
| MVP loop | Gmail + Calendar · draft → approve in glass box → execute · then revoke session posture |
| Non-goals (near-term) | Act-first autonomy, Resy/phone-tree ops, screen takeover, training on user content, OpenClaw-only distribution as the product |

---

## 1. Why this exists (problem)

Personal AI today forces a false choice:

1. **Instinct-class cloud black box** — SMS convenience; permanent OAuth; act-first; data on their servers; invite FOMO; ~$2.5B raise on use-layer packaging.
2. **OpenClaw-class developer OSS** — local control; clone repos, Docker, `.env`, paste keys; hostile to non-techies.
3. **Intrusive desktop agents** — screen takeover, blocked productivity, unclear retention after the task.

**Cogis thesis:** Frictionless consumer setup *and* zero-standing-trust architecture are compatible. SMS makes it feel real to the public. The glass-box desktop is where trust is earned and high-stakes actions are approved. Hosted inference + hosted SMS keep the install bar intact.

David’s strategic conviction (overnight, reinforced afternoon): frontier labs did the hard AI work; Instinct is a more advanced OpenClaw-shaped *product*, not a $2.5B-defensible tech moat; someone will do the open/trustworthy version — it might as well be us — **but** it cannot require developer setup or key pasting if we want the broader public.

---

## 2. Product shape (substantial)

### 2.1 Two surfaces, one product

| Surface | Job |
|---------|-----|
| **SMS** | Ambient entry. Free “talk to Cogis” before deep commitment. Light commands. “3 drafts ready — open Cogis.” Required for broader public belief. |
| **Glass-box desktop** (Tauri-class native app) | Visible work. Real-time audit trail. Staging queue for drafts. Approve / tweak / reject. Nuke switch. OAuth connect. Where sovereignty is felt. |

Neither surface alone is enough:
- SMS-only → Instinct’s trust failure mode (black box, hard to inspect).
- Desktop-only → loses mass intuition (“I just text my assistant”).

### 2.2 Lifecycle

1. **Pre-signup:** User texts Cogis’s public number. Demo conversation only. No Gmail/Calendar. Hard rate limits. Captcha / phone reputation / abuse controls mandatory (see §5).
2. **Signup:** Account + desktop install + login. OAuth Gmail/Calendar inside the app (standard browser pop-ups — *this* is “normal,” not key paste).
3. **Use:** SMS for ambient; desktop for confirm-first Gmail/Calendar actions. Cogis pays model + SMS costs; user pays Cogis (subscription / usage) — never pastes vendor keys.
4. **Session posture:** Prefer short-lived task sessions, narrow *application-level* context, discard local task cache on done, always confirm irreversible actions. (See §3 on OAuth honesty.)

### 2.3 Four pillars (from David’s draft — kept, with honesty notes)

1. **Frictionless local install** — compiled Mac/Windows app; no terminal, no GitHub required for users.  
2. **Just-in-time / ephemeral trust** — no permanent “act as me forever” product posture; confirm-first for send/write.  
3. **Glass-box HUD** — side panel / widget; human-readable trail; work while it works.  
4. **Local secure enclave + nuke** — tokens in OS keychain; red-button kill of sessions/caches/network.

### 2.4 Explicitly out of MVP

- Restaurant booking ops, phone trees, vendor WhatsApp last-mile (Instinct capital territory).  
- Screen capture / computer-use takeover.  
- Act-first silent send.  
- Training on user mail/calendar by default (or ever without explicit opt-in — default is never).  
- Developer-facing BYOK of any kind.

---

## 3. Aria ↔ David: agreed vs disagreed

### 3.1 Agreed (locked or strongly aligned)

| Topic | Agreement |
|-------|-----------|
| New space | Not a clone of Instinct or a prettier OpenClaw README |
| Install bar | Download / account / login only for normals |
| Confirm-first | Draft → approve → execute for high-stakes |
| Glass-box desktop | Required trust surface |
| SMS required for public | Ambient channel; free trial text before full use |
| Scratch push-via-app | Extra download = wrong friction |
| Scratch BYOK entirely | No Twilio SID/token, no LLM API keys in the default path |
| Cogis / Ephemeral Trust naming | Working brand + category phrase |
| Gmail+Calendar wedge | First real loop; not “full life OS” |
| Instinct valuation thesis | Soft tech moat; capital/polish/invite heat are the real advantages; trust is the attack surface |

### 3.2 Aria pushbacks (David should keep these as constraints)

| Topic | Aria pushback | Current resolution |
|-------|---------------|-------------------|
| Literal “5-minute OAuth only to Alex’s thread” | Google/Microsoft OAuth does not grant per-sender 5-min scopes. Marketing that claims otherwise is a trust landmine. | **Honest ephemeral trust:** short session + app-enforced scope + confirm + discard; copy must not fake IdP granularity |
| Twilio BYOK for mass market | Harder than LLM keys; fails install bar | **Scratched entirely** (David) |
| LLM key paste as unlock | Stretches non-techie bar | **Scratched;** Cogis-billed inference |
| LiteLLM / Ollama as launch architecture | Smells like developer product | **Defer;** power features later if ever |
| Competing on Instinct last-mile ops | Capital war we lose | **Stay narrow** on Gmail/Cal + confirm UX |
| OpenClaw-as-the-product | Distribution yes, brand no for non-techies | Optional later skill path; **Cogis is the consumer product** |

### 3.3 Still open (not locked)

See §8. Biggest forks: outbound always-human vs progressive allowlists; free-SMS abuse budget; Surveymatic vs separate Cogis brand; when (if ever) to open-source the core.

---

## 4. Steelman — why Cogis could fail (read before go)

Argue *against* Cogis as hard as Instinct’s board would:

1. **Two-surface tax.** SMS + desktop means twice the product, compliance, and support. Instinct ships belief with one surface. Many users will never open the desktop → confirm-first collapses back into SMS yes/no theater, which is weak for long drafts.
2. **SMS is a cost and abuse weapon.** Free pre-signup text is a gift to scrapers and LLM-junk traffic. One Hacker News / GitHub spike without auth gates can vaporize a month of budget overnight (§5).
3. **Hosted inference = margin risk.** Confirm-first agents are chatty (plan, tool calls, drafts, rewrites). Sonnet-class pricing makes “unlimited assistant” suicidal without hard caps.
4. **OAuth honesty gap.** If marketing overclaims JIT scopes, one security blogger can torch Ephemeral Trust the way Instinct’s ToS week torched them.
5. **Desktop download friction still exists.** “Install a program” is easier than Docker — still harder than texting Instinct. Conversion funnel will leak.
6. **Platform risk.** Apple iMessage routing, A2P 10DLC, Google OAuth policy, and carrier filtering can kneecap SMS agents without warning.
7. **Category swallow.** OpenAI (Steinberger / personal agents), Anthropic, Google, and Cognition (Poke) can ship “good enough + trusted brand” and erase startups that only had a narrative.
8. **“Open” expectation mismatch.** If Cogis trends on GitHub as open-source, the crowd will demand self-host + BYOK — which we just scratched for product reasons. Virality channel may fight product doctrine.
9. **Capital asymmetry.** Instinct has ~$350M. They can buy trust fixes, human ops, and ads while Cogis is still wiring Twilio 10DLC.
10. **Confirm-first feels slower.** Power users who loved Instinct’s aggression may call Cogis “clippy with extra steps” unless the HUD is *faster* than doing the task manually.

**Steelman conclusion:** Cogis only wins if (a) trust is demonstrably better, (b) SMS demo is tightly capped, (c) desktop confirm is delightful and fast, and (d) unit economics are capped by product before marketing. Narrative alone is not a moat — that is exactly the critique of Instinct’s raise.

---

## 5. Cost model — “what if this catches from GitHub?”

### 5.1 Critical distinction

| Viral object | What it costs you |
|--------------|-------------------|
| **GitHub stars / clones** of an open repo | Mostly bandwidth + support attention. Cheap unless you also turn on free hosted SMS/LLM. |
| **Active SMS users** texting Cogis | **Twilio + LLM** every message. This is the real burn. |
| **Signed-up desktop users** with Gmail connected | LLM + occasional SMS notifications + light infra. |

**GitHub popularity ≠ users.** Treat stars as marketing; treat **inbound SMS and agent turns** as the P&L.

### 5.2 Unit cost assumptions (order-of-magnitude, US, Sep 2026)

**SMS (Twilio-hosted by Cogis)**  
- Base US long-code SMS: **~$0.0083** in + **~$0.0083** out per segment (Twilio published).  
- Carrier pass-through often pushes **effective ~$0.012–$0.013** per segment.  
- Budget planning number used below: **~$0.015 per segment** all-in (conservative).  
- Number rental: ~$1.15/mo long code; toll-free ~$2.15/mo; 10DLC brand/campaign fees small monthly until scale.  
- Long replies = multiple segments (160 chars / UCS-2 worse).

**LLM (Claude Sonnet-class workhorse)**  
- Planning figure: **~$3 / MTok input**, **~$15 / MTok output** (Sonnet 4.6 / Sonnet 5 standard band).  
- Illustrative **agent turn** (read thread context + plan + draft reply): ~8k in + 1.5k out ≈ **$0.024 + $0.023 ≈ $0.05/turn**.  
- Heavy turns (big threads, tools, multi-draft): **$0.15–$0.50+**.  
- Planning blends below use **$0.08 average LLM cost per meaningful agent action** and **$0.02 per light SMS chat turn** (small context).

**Infra**  
- Auth, API, Twilio webhooks, desktop update CDN: start **~$50–300/mo**; not the spike risk.  
- Spike risk = **variable SMS + LLM**.

### 5.3 Scenario table (monthly) — hosted Cogis path

Assumptions: free pre-signup SMS allowed; average free user sends **20 inbound + 20 outbound segments/mo** (~$0.60 SMS) + **10 light LLM turns** (~$0.20) ≈ **~$0.80/user/mo** fully free.  
Signed-up active user: **40 SMS segments** (~$0.60) + **40 agent actions** (~$3.20) ≈ **~$3.80 COGS/user/mo** before margin.

| Scenario | What happened | Free SMS users | Paid / signed-up actives | Rough monthly COGS (SMS+LLM) | Notes |
|----------|---------------|----------------|---------------------------|------------------------------|-------|
| A. Quiet pilot | You + 20 friends | 20 | 10 | **~$50–80** | Noise floor |
| B. HN / Twitter blip | Landing page spike | 500 | 50 | **~$600** | Mostly free abuse + curious |
| C. GitHub trending (dangerous) | README goes #1; bots discover public SMS number | 5,000 | 200 | **~$4.8k** | Free SMS is the firehose |
| D. Real product-market blip | Organic + press | 2,000 | 1,000 | **~$5.4k** | Still fine if paid converts |
| E. Instinct-adjacent viral | “Trust alternative” narrative | 20,000 | 5,000 | **~$35k** | Needs paid conversion **this week** or kill free SMS |
| F. Meltdown | Uncapped free SMS + scrapers | 100,000 | 1,000 | **~$84k+** | Product failure, not success |

**Formula to remember:**  
`monthly_cogs ≈ (free_users × $0.80) + (paid_actives × $3.80)` under the assumptions above. Re-estimate when you have real telemetry.

### 5.4 GitHub-specific warning

If Cogis is **open-source on GitHub** and also offers a **public free SMS number**:
- Stars drive curiosity texts → **your** Twilio/LLM bill.
- Self-hosters who run their own stack do **not** cost you (good) — but they will demand BYOK (doctrine conflict).
- Safest viral shape: **open the desktop client / protocol**; keep **SMS and inference behind account + spend caps**. Do not publish an uncapped public demo number in the README.

### 5.5 Required cost controls (non-negotiable before public SMS)

1. Per-phone daily/weekly SMS caps (free tier).  
2. Per-account LLM budget hard stop.  
3. Bot / carrier reputation filtering; STOP handling; 10DLC compliance.  
4. Kill switch for free tier (feature flag).  
5. Alerting: daily COGS vs budget (align with David’s broader spend discipline; Surveymatic GTM cap is separate — Cogis needs its **own** monthly burn cap before launch).  
6. No tool-use / Gmail on free pre-signup path (already locked).

### 5.6 Illustrative pricing (not locked — for economics only)

To survive scenario E with margin: e.g. **$20–30/mo** subscription covering ~40 agent actions + SMS notifications, with overage. Free SMS demo: **≤10 messages lifetime** or **3 days**, then force signup. Exact price TBD; the point is **COGS must sit under price with headroom for support.**

---

## 6. Competitive map (living)

| | Instinct | OpenClaw | Cogis (target) |
|--|----------|----------|----------------|
| Onboarding | Text invite | CLI / Docker / keys | App install + account + login |
| Channel | SMS / iMessage / calls | Many gateways | SMS + glass-box desktop |
| Trust | Act-first, permanent access posture | User-configured | Confirm-first, ephemeral posture |
| Visibility | Black box | Logs / terminal | Glass-box HUD |
| Keys | Hidden (they pay models) | BYOK culture | **Cogis pays models; no user keys** |
| Capital | ~$350M | Foundation / community | Refinery bootstrap |
| Weakness | Trust debt, ToS, valuation froth | Non-techie hostile | Two-surface cost, SMS burn, slower feel |

---

## 7. 90-day build sketch (decision-ready, not a backlog)

**Days 0–30 — Doctrine + spine**  
Threat model; action taxonomy (read / draft / send / calendar write); Twilio 10DLC; account auth; desktop shell with nuke + audit log UI; free-SMS caps designed **before** public number.

**Days 31–60 — MVP loop**  
Gmail+Calendar OAuth; staging queue; SMS ↔ desktop “drafts ready”; confirm-first send/event create; COGS dashboard.

**Days 61–90 — Proof**  
5–10 design partners (privacy-conscious founders/ops); trust checklist published; side-by-side demo vs act-first failure modes; decide open-source boundary (client vs server vs neither).

**Success criteria (pick ≥2):** zero silent outbound in pilot; free-SMS daily COGS never exceeds agreed cap; time-to-first-approved-send < 1 day; ≥1 external write-up on trust posture.

---

## 8. Open questions for David (Desk)

1. **Outbound policy:** Always human approve forever, or progressive allowlists after N clean confirms?  
2. **Free SMS budget:** Lifetime message cap vs days vs both? What’s the hard monthly $ burn you’ll allow before kill switch?  
3. **Brand:** Cogis.ai standalone vs Refinery-visible vs Surveymatic adjacency?  
4. **Open-source boundary:** Closed; open client only; open core later — given GitHub virality cost dynamics?  
5. **Go / no-go / park:** Ship the 90-day wedge, or stay Surveymatic-only until runway clearer?

---

## 9. Document changelog

| Date | Change |
|------|--------|
| 2026-09-06 AM | Instinct overnight brief filed; Desk one-pager existed |
| 2026-09-06 PM | David Cogis Ephemeral Trust draft; Aria agreed new space + install bar; pushed JIT OAuth honesty; deferred local-model toggles |
| 2026-09-06 PM | Lock glass-box **and** SMS; scratch push-app; explore Twilio BYOK → **scratch BYOK entirely**; hosted SMS + Cogis-billed inference |
| 2026-09-06 ~3:30 PM | **This living decision doc** created: agreements/pushbacks, steelman, GitHub/SMS cost model |

---

## 10. Aria maintenance rule

When David locks a new product decision on Cogis, Aria updates **§0 and §9** the same day, then syncs Desk. Do not let this rot into a second conflicting one-pager.

*End of living document (v1).*
