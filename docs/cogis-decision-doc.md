# Cogis.ai — Decision Document

**Status:** Open · working decision doc (not a README)  
**Maintain:** Aria (propose) · owner decides  
**Entity:** Refinery LLC · Brand working title: **Cogis.ai** · Category phrase: **Ephemeral Trust**  
**Last updated:** Mon Sep 7, 2026, ~10:20 AM ET  
**History / evolution:** See sibling files in `docs/` (overnight brief, Gemini notes, earlier drafts). This file is the current lock — treat it like any other dev artifact (edit locally; don’t treat chat as source of truth).

**How to use:** §0–§2 = product shape. §3 = what we locked vs pushed back on. §4 = steelman before greenlighting. §5 = costs (hosting-first). §8 = open questions.

---

## 0. One-screen lock (current)

| Decision | Lock |
|----------|------|
| Why it exists | Fun, open-source an important process, show that confirm-first / glass-box personal agents don’t need a giant closed stack. Not a capital war against closed SMS agents or frontier labs. |
| Category | **Glass-box desktop + SMS**, confirm-first, ephemeral trust — not “safer clone of a closed agent,” not “easier OpenClaw README” |
| Trust model | **Confirm-first** · **Ephemeral Trust** · nuke switch · no silent sends |
| Install bar | **Download → create account → log in.** Nothing else for normals |
| Twilio | **Embedded in signup** — provision / connect Twilio as part of Cogis signup, not “go get a SID and paste it here.” User’s Twilio where the platform allows; Cogis is not trying to eat SMS COGS. |
| BYOK paste | **Still scratched** as a DIY homework step. Embedded Twilio signup is the anti-paste path. |
| Inference | Prefer paths that keep Cogis burn near **hosting only** (local / cheap / user-routed). No appetite for another consumer subscription if we can avoid it. Details still open (§8). |
| Competitive honesty | Frontier chat products already surface **Connect Gmail / Calendar** next to the input box. We do **not** compete on “we also connect mail.” Wedge is open source + glass-box + confirm-first + SMS that feels normal. |
| Push-via-app | **Scratched** (extra download friction) |
| MVP loop | Still Gmail + Calendar as the first *workflow* to prove confirm-first — but messaging is trust/visibility, not “we uniquely connect your inbox.” |
| PoC kill switch | **$100 / month** total Cogis variable burn. Park or kill free paths before that trips. |
| Non-goals (near-term) | Act-first autonomy, restaurant/phone-tree ops, screen takeover, training on user content, OpenClaw-only distribution as the product, capital arms race on polish |

---

## 1. Why this exists (problem)

Personal AI today still forces a false choice:

1. **Closed cloud agents** — SMS convenience; permanent OAuth; act-first; data on their servers; invite / capital heat.
2. **Developer OSS** — local control; clone repos, Docker, `.env`, paste keys; hostile to non-techies.
3. **Intrusive desktop agents** — screen takeover, blocked productivity, unclear retention after the task.

**Frontier labs are already absorbing the “connect your tools” surface.** Chat products now put Connect Gmail / Calendar right over the input. Competing on that checkbox is a losing game for a small open project.

**Cogis thesis:** Open-source the *process* people actually care about — confirm-first work, a glass box you can watch, ephemeral trust, SMS that doesn’t feel like a science project — without asking normals to become ops engineers. Setup should feel like a consumer app. Costs should collapse toward **hosting**, not another subscription people won’t want.

This is allowed to be a fun project that matters on principle. If it gets attention, great; the doc doesn’t need a vanity thesis.

---

## 2. Product shape

### 2.1 Two surfaces, one product

| Surface | Job |
|---------|-----|
| **SMS** | Ambient entry. Talk to Cogis like a normal number. Light commands. “3 drafts ready — open Cogis.” Public belief needs this. |
| **Glass-box desktop** (Tauri-class) | Visible work. Real-time audit trail. Staging queue. Approve / tweak / reject. Nuke switch. OAuth connect. Where sovereignty is felt. |

Neither alone is enough:
- SMS-only → black-box trust failure (hard to inspect).
- Desktop-only → loses mass intuition (“I just text my assistant”).

### 2.2 Lifecycle

1. **Pre-signup (optional / tightly capped):** Demo text only if we ever expose a public number. No Gmail/Calendar. Hard rate limits. Prefer *not* putting Cogis on the hook for uncapped free SMS (§5).
2. **Signup:** Account + desktop install + login. **Twilio connect / provision happens here** as a first-class step (guided, in-flow — not a README scavenger hunt). OAuth Gmail/Calendar inside the app via normal browser pop-ups.
3. **Use:** SMS for ambient; desktop for confirm-first actions. Variable SMS cost aims to sit on the user’s Twilio. Inference aims to stay cheap enough that Cogis isn’t a second subscription.
4. **Session posture:** Short-lived task sessions, narrow application-level context, discard local task cache on done, always confirm irreversible actions. (Honest about OAuth limits — see §3.)

### 2.3 Four pillars (kept, with honesty notes)

1. **Frictionless local install** — compiled Mac/Windows app; no terminal, no GitHub required for users.
2. **Just-in-time / ephemeral trust** — no permanent “act as me forever” posture; confirm-first for send/write.
3. **Glass-box HUD** — side panel / widget; human-readable trail; work while it works.
4. **Local secure enclave + nuke** — tokens in OS keychain; red-button kill of sessions/caches/network.

### 2.4 Explicitly out of MVP

- Restaurant booking ops, phone trees, vendor WhatsApp last-mile (capital territory for closed players).
- Screen capture / computer-use takeover.
- Act-first silent send.
- Training on user mail/calendar by default (or ever without explicit opt-in — default is never).
- DIY “paste your Twilio SID / LLM key” as the main path.
- Positioning as “the Connect Gmail button they forgot.”

---

## 3. Agreed vs pushbacks

### 3.1 Agreed (locked or strongly aligned)

| Topic | Agreement |
|-------|-----------|
| New space | Not a clone of a closed SMS agent; not a prettier OpenClaw README |
| Install bar | Download / account / login only for normals |
| Confirm-first | Draft → approve → execute for high-stakes |
| Glass-box desktop | Required trust surface |
| SMS for public belief | Ambient channel; must feel normal |
| Scratch push-via-app | Extra download = wrong friction |
| Scratch DIY BYOK paste | No scavenger-hunt keys in the default path |
| Twilio in signup | Embed connect/provision in signup to cut config pain |
| Hosting-first economics | Chase burn down to hosting; low tolerance for another subscription |
| Don’t out-compete frontier “Connect” UI | Open source + trust UX is the angle |
| Gmail+Calendar as first workflow | Still the wedge *loop*, not the marketing claim |
| Naming | Cogis / Ephemeral Trust as working brand + category |
| PoC burn cap | $100/mo kill switch |

### 3.2 Pushbacks to keep as constraints

| Topic | Pushback | Current resolution |
|-------|----------|-------------------|
| Literal “5-minute OAuth only to Alex’s thread” | Google/Microsoft OAuth does not grant per-sender 5-min scopes. Overclaiming is a trust landmine. | **Honest ephemeral trust:** short session + app-enforced scope + confirm + discard; copy must not fake IdP granularity |
| DIY Twilio / LLM key paste | Fails install bar for normals | **Embedded Twilio signup**; inference path still open but not paste-homework |
| LiteLLM / Ollama as *required* launch architecture | Can smell like a developer product if it’s the only story | **Optional / later**; default path should still feel consumer |
| Competing on last-mile ops / capital polish | We lose that war on purpose | **Stay narrow**; open-source the process |
| OpenClaw-as-the-product | Fine as distribution later; wrong as the consumer brand | Optional skill path; **Cogis is the product** |
| Hosted SMS + hosted LLM forever | Variable COGS explode on any GitHub spike; subscription fatigue is real | **Pivot:** Twilio on user via signup flow; Cogis burn → hosting (+ tiny PoC cap) |

### 3.3 Still open

See §8. Biggest forks: outbound policy; whether any Cogis-hosted free SMS exists at all; inference routing (local vs cheap hosted vs user-routed without paste theater); open-source boundary; go / park.

---

## 4. Steelman — why Cogis could fail

Argue against it hard:

1. **Two-surface tax.** SMS + desktop = twice the product, compliance, and support. Many people never open the desktop → confirm-first collapses into SMS yes/no theater.
2. **Twilio-in-signup still has friction.** Even embedded flows drop people (carrier, A2P, credit card on Twilio). “Not paste” ≠ “no friction.”
3. **Hosting-only is aspirational until inference is solved.** Agents are chatty. If Cogis pays Sonnet-class turns, “no subscription” is fiction.
4. **OAuth honesty gap.** Overclaim JIT scopes and one security write-up torches Ephemeral Trust.
5. **Desktop download still leaks.** Easier than Docker; harder than texting a closed agent.
6. **Platform risk.** iMessage routing, A2P 10DLC, Google OAuth policy, carrier filtering.
7. **Category swallow.** Frontier labs and big chat products can ship “good enough + trusted brand” and erase narrative-only projects — especially on Connect Gmail/Calendar.
8. **Open-source expectation mismatch.** GitHub crowd may demand full self-host + raw keys — which fights the consumer install bar.
9. **Capital asymmetry is real.** Closed players can buy polish, ops, and ads. We are not in that race.
10. **Confirm-first feels slower.** Unless the HUD is *faster* than doing the task manually, power users bounce.

**Steelman conclusion:** Cogis only makes sense if (a) trust is visibly better, (b) signup actually embeds Twilio without homework, (c) Cogis burn stays near hosting under the $100 PoC cap, and (d) we stop pretending we can out-Connect frontier chat. Fun + open process is a valid reason to build — it’s not a moat by itself.

---

## 5. Cost model — hosting first

### 5.1 What we’re optimizing for

| Object | Who should pay |
|--------|----------------|
| GitHub stars / clones | Basically free (bandwidth / attention) |
| SMS | **User’s Twilio** after embedded signup |
| Agent turns / LLM | Prefer local or near-zero; avoid Cogis eating uncapped hosted inference |
| Auth, updates, tiny API | **Cogis hosting** — the intended residual burn |

**Target:** Cogis P&L looks like a small hosting bill, not a usage reseller. PoC kill switch: **$100/mo**.

### 5.2 Old viral-SMS warning (still true if we host a public number)

If Cogis ever exposes a **public free SMS number** paid by us, GitHub attention becomes a firehose on *our* Twilio + LLM. Prefer: no public uncapped demo number; or demo so tightly capped it can’t matter.

Rough planning numbers (US, Sep 2026 order-of-magnitude) if *we* ever ate SMS+LLM again:
- SMS all-in ~**$0.015**/segment
- Meaningful agent action ~**$0.05–$0.15** at Sonnet-class rates
- That path is exactly what the Sep 7 pivot is trying to **leave**

### 5.3 Required controls before anything public

1. No uncapped Cogis-paid free SMS.
2. Per-account / per-phone caps if any demo path exists.
3. Daily COGS alert vs the **$100/mo** PoC kill switch.
4. 10DLC / STOP / abuse basics if SMS is on.
5. Clear signup copy: Twilio account / billing is theirs; Cogis isn’t a silent SMS reseller.

### 5.4 Pricing posture (not locked)

Default aspiration: **no Cogis subscription** if hosting stays tiny. If inference forces a fee later, it should be honest usage or a tiny optional boost — not “another $20 AI sub.” Exact price TBD; economics must match the hosting-first story.

---

## 6. Competitive map (generic)

| | Closed SMS / act-first agents | Developer OSS stacks | Cogis (target) |
|--|-------------------------------|----------------------|----------------|
| Onboarding | Text / invite | CLI / Docker / keys | App install + account + login |
| Channel | SMS / chat apps | Many gateways | SMS + glass-box desktop |
| Trust | Act-first, standing access | User-configured | Confirm-first, ephemeral posture |
| Visibility | Black box | Logs / terminal | Glass-box HUD |
| Keys / vendors | Hidden behind their bill | BYOK culture | Twilio embedded in signup; no DIY paste |
| “Connect Gmail” | Table stakes / frontier UI | DIY OAuth | Same connectors — **not** the differentiator |
| Capital | Large | Community | Bootstrap / hobby-serious |
| Weakness | Trust debt | Non-techie hostile | Two-surface cost, Twilio signup drop-off, inference still open |

---

## 7. 90-day build sketch (decision-ready, not a backlog)

**Days 0–30 — Doctrine + spine**  
Threat model; action taxonomy (read / draft / send / calendar write); Twilio embedded-signup spike; account auth; desktop shell with nuke + audit log; cost dashboard vs $100 cap.

**Days 31–60 — MVP loop**  
Gmail+Calendar OAuth; staging queue; SMS ↔ desktop “drafts ready”; confirm-first send/event create; prove hosting-first bill in practice.

**Days 61–90 — Proof**  
Handful of design partners; publish a plain-language trust checklist; decide open-source boundary (client vs server vs protocol); honest demo that doesn’t claim fake OAuth scopes.

**Success criteria (pick ≥2):** zero silent outbound in pilot; Cogis monthly burn stays under $100; time-to-first-approved-send < 1 day after install; at least one external write-up on the trust posture / open process.

---

## 8. Open questions

1. **Outbound policy:** Always human approve forever, or progressive allowlists after N clean confirms?
2. **Any Cogis-hosted free SMS at all?** Or SMS only after Twilio-in-signup?
3. **Inference path:** Local-first, cheap hosted under the $100 cap, or user-routed without paste theater — what’s the default for normals?
4. **Brand:** Cogis.ai standalone vs Refinery-visible vs Surveymatic adjacency?
5. **Open-source boundary:** Client only, protocol, full stack — what ships public first?
6. **Go / park:** Run the 90-day wedge, or keep Cogis as a docs-and-spike lane while Surveymatic ships?

---

## 9. Changelog

| Date | Change |
|------|--------|
| 2026-09-06 AM | Overnight strategy brief; early one-pager |
| 2026-09-06 PM | Ephemeral Trust draft; glass-box + SMS lock; scratch push-app; scratch DIY BYOK; hosted SMS + billed inference (later revised) |
| 2026-09-06 ~3:30 PM | First full decision doc: agreements, steelman, GitHub/SMS cost model |
| 2026-09-07 AM | Renamed off “living”; parked in `docs/cogis-decision-doc.md` with sibling evolution notes |
| 2026-09-07 ~10:20 AM | **Pivot:** don’t compete on Connect Gmail/Calendar vs frontier chat; open-source angle; Twilio embedded in signup; hosting-first costs + $100 PoC cap; strip personal voice and named closed competitors from the working doc |

---

## 10. Maintenance

When a product decision lands on Cogis, update **§0 and §9** the same day. Keep sibling `docs/` files as history — this file stays the current lock. Don’t let chat or a second one-pager diverge.

*End of decision doc (v2 — Sep 7 pivot).*
