---
title: Autonomous GTM Meeting Machine — Build Plan
description: A Universal-Paperclips-style autonomous optimizer that books meetings by itself, with OpenClaw as the brain and Cargo as the execution plane.
---

# Autonomous GTM Meeting Machine

> A self-running optimizer whose only North Star is **meetings booked**. OpenClaw is the
> brain (control plane); Cargo is the hands (execution plane). Credits are the scarce
> resource. The machine sources its own universe, times its own outreach, learns what
> books, unlocks new capabilities as it grows, and earns more autonomy as it proves
> itself — like *Universal Paperclips*, but the clip is a booked meeting.

---

## 0. Operating model — it's an optimizer, not a pipeline

The system is not a funnel that runs top-to-bottom. It is a single objective function
with an economy, an upgrade tree, and a strategy-search subroutine.

| Paperclips mechanic | This machine |
|---|---|
| Clips made | **Meetings booked** (the only metric to maximize) |
| Wire + money | **Credits** (Cargo billing = the resource meter) |
| Auto-clippers / mega-clippers | enrich / send / signal Cargo actions (production) |
| Projects panel | **Unlockable capability tree** (§9) |
| Quantum compute / yomi | **Exploration budget** — credits spent searching strategy (§8) |
| Trust → processors/memory | **Autonomy dial** — throttle + credit cap that grow as book-rate proves out (§10) |

**Phase 5 end state:** the operator sets one number — *"book me N qualified meetings/week"* —
and the machine self-scales sourcing, spend, channels, and strategy to hit it.

---

## 1. Architecture — our own runtime, three layers

We build this ourselves on **OpenClaw + Cargo**. No external orchestration dependency. The *look and
feel* is the inspiration: an autonomous agent that runs a GTM motion behind a live dashboard — an
activity feed, a credit gauge, a daily throttle, a meetings counter, an inbox — the way a
NanoCorp-style "company in a box" app presents itself. We borrow the **shape** (heartbeat loop,
budget governor, routines, governance, dashboard); we own the code.

```
Runtime  (thin, ours — the "app")
  scheduler/heartbeat · budget governor · activity feed + dashboard · approval queue
        │ wakes the brain on interval + on inbound events
OpenClaw (brain)
  runs the EMPC allocator policy each tick; calls cargo-ai
        │ JSON in/out, async
Cargo    (execution plane / hands)
  source · enrich · verify · detect signals · sequence · CRM sync
  storage = GTM system of record · billing = the credit/wire gauge
        │
        └── inbox + calendar ── net-new infra (part of our runtime)
```

**The runtime we build is deliberately thin** — most of the intelligence is the brain's policy and
Cargo's primitives. It provides exactly five things, each mirroring a panel of the inspiration app:

| Runtime component | Dashboard panel it powers | What it does |
|---|---|---|
| **scheduler / heartbeat** | activity feed | wakes the brain on a cron + on inbound reply events (fast/main/growth ticks, §6–7) |
| **budget governor** | credits + daily-usage gauge | reads `cargo-ai billing`, enforces the floor + daily throttle, hard-stops sends |
| **state ledger** | tasks / pipeline | Cargo storage (`Contacts`/`prospect_events`/`experiments`) — durable, resumable |
| **approval queue** | (governance) | routes high-value/ambiguous replies to a human before booking |
| **inbox + calendar** | email + meetings | the one net-new capability Cargo doesn't cover (§12) |

**Rules:**
- The brain holds only *ephemeral per-tick state*. Everything durable lives in **Cargo storage**, so
  the brain is crash-safe and resumable; the runtime keeps only scheduling/cost bookkeeping.
- Cargo never decides anything. It is a stateless, JSON-in/JSON-out toolbox.
- The meeting-machine *program* is a **skill** (`cargo-meeting-machine`) the brain loads — every
  `SKILL.md` ships an `openclaw:` metadata block (`bins: [cargo-ai]` + node install), so OpenClaw
  discovers, installs, and binds the CLI natively. The runtime just schedules and governs.

---

## 2. State model (Cargo storage) — the game board

Three models, created via `cargo-ai storage model create` + `column create`.

### `Contacts` — current state (one row per prospect, overwritten in place)

| column | type | role |
|---|---|---|
| `email`, `first_name`, `last_name`, `linkedin_url` | string | identity |
| `company` | relationship → Companies | firmographics |
| `stage` | string (enum) | the state machine (§5) |
| `tier` | number | firmographic priority band (1 = best) |
| `score` | number | ICP fit (brain-written) |
| `expected_value` | number | expected pipeline $ if booked (§11) |
| `last_signal`, `last_signal_at` | string / date | timing trigger |
| `next_action_at` | date | **scheduler key** — `WHERE next_action_at <= now()` |
| `sequence_step` | number | which follow-up touch |
| `opener_template_id` | string | which bandit arm was used |
| `disqualify_reason` | string | audit |

### `prospect_events` — append-only history (rel → Contacts), the learning substrate

`contact_id`, `event_type`, `occurred_at`, `payload` (object), `source_run_id`,
`credits_spent` (number), `opener_template_id`, `signal_stack` (array).

> Each tick writes an event **and** updates the `Contacts` row together, so state and
> history never drift. EMPC (§4) and the growth loop (§7) are computed from this table.

### `experiments` — strategy registry (the bandit's memory)

`experiment_id`, `kind` (opener | signal | segment | send_window), `variant`,
`status` (exploring | promoted | retired), `trials`, `meetings`, `credits_spent`,
`empc`, `updated_at`.

---

## 3. Tool surface OpenClaw binds (verified command shapes)

| Brain tool | Exact `cargo-ai` command |
|---|---|
| `check_budget` | `cargo-ai billing subscription get` → `available - used` |
| `source_tam` | `action execute` `salesNavigator.searchAccounts` / `peopleDataLabs.queryCompanies` / `theirStack.searchCompanies` |
| `match_warm` | `action execute-batch` `cargo.matchBusiness` |
| `enrich_firmo` | `action execute-batch` `cargo.enrichBusinessFirmographics` |
| `find_contacts` | `action execute-batch` `salesNavigator.searchLeads` |
| `enrich_contact` | `action execute-batch` `waterfall.enrichProspectDetails` (escalate → `FullEnrich.findEmail`) |
| `verify` | `action execute-batch` `waterfall.verifyEmail` (keep `status=="valid"`) |
| `poll_signals` | `action execute-batch` `waterfall.detectJobChange` (+ funding / `theirStack` intent) |
| `icp_discover` | `storage query execute` Won vs Lost diff + `cargo.enrich*` (§ icp-discovery recipe) |
| `personalize` | `action execute-batch` `anthropic.instruct` (model = bandit arm) |
| `get_context` | `cargo-ai context …` (personas / proof / objections) |
| `send_outreach` | discover via `connection integration get <sequencer>`, then `action execute-batch` |
| `read_working_set` | `storage query execute "SELECT … FROM default.contacts WHERE next_action_at <= now() AND stage IN (...)"` |
| `write_state` | storage upsert + append `prospect_events` |

Action shape is always `{"kind":"connector","integrationSlug":"<slug>","actionSlug":"<slug>","config":{}}`
— **no `connectorUuid` in `config`**. All ops are async: `--wait-until-finished` for inline,
poll `run/batch get` for fan-out.

---

## 4. Core engine — the EMPC allocator (the "make a paperclip" decision)

Every tick, the brain enumerates every possible spend and allocates the marginal credit to
the highest **expected meetings (or pipeline $) per credit**. TAM, signals, enrichment, and
openers stop being separate features — they become candidates competing for the same credit.

```
ALLOCATE(budget):
  candidates = all eligible actions across all stages
               (source_tam, enrich_tier, poll_signals, send, follow_up, book, explore)
  for c in candidates:
      c.empc = (historical_book_rate(c) * expected_value(c)) / c.credit_cost   # §11
  while budget > FLOOR and throttle_remaining and candidates:
      c = argmax(empc) respecting deliverability + autonomy caps
      execute(c); record event(credits_spent); update empc incrementally
```

`historical_book_rate` and `expected_value` are SQL aggregates over `prospect_events`.
Cold-start: seed with priors, let exploration (§8) fill the table.

---

## 5. Stage machine

```
sourced → enriched → verified → scored ─┬─→ queued → contacted → [follow_up] → replied → booking → meeting_booked
                                        └─→ disqualified                                  └─→ lost / bounced
```

Transition logic per stage (driven by the allocator, gated by `next_action_at`):

| stage | action | next |
|---|---|---|
| `sourced` | enrich → verify | `verified` / `bounced` |
| `verified` | score = LLM(contact, ICP) | `queued` (≥ bar) / `disqualified` |
| `queued` | `get_context` → personalize(opener arm) → `send_outreach` | `contacted`, `next_action_at=+3d` |
| `contacted` | if due & no reply: follow-up; `sequence_step++` | `lost` when `step > MAX` |
| `replied` | classify intent (built in §6) | positive→`booking`, objection→handle, negative→`disqualified` |
| `booking` | propose times → on accept → calendar invite → CRM sync | **`meeting_booked`** |

---

## 6. The two-speed loop

The single biggest conversion lever is reply latency, so the brain runs two clocks.

### Fast tick (reply-only, sub-minute) — speed-to-lead
Triggered by an inbound webhook (§12). Classifies the reply with the LLM, jumps straight to
the `replied` / `booking` branch, interrupts cadence. Responding in minutes vs hours is
often a 2–3× booking lift.

### Main tick (interval, e.g. every 10–15 min, throttle-bounded)
```
1. budget = check_budget(); if budget < FLOOR: pause sends, alert, exit
2. if signal_cadence_due(): poll_signals(monitored segments) → write signals + events
3. work = read_working_set()                     # everything due, by next_action_at
4. ALLOCATE(budget) over work[:throttle_remaining]  # §4 — the optimizer
5. append events + update stage cols              # state + history together
6. log tick summary (per-stage counts, credits spent, EMPC)
```

---

## 7. Growth loop — strategy search (runs nightly, the "always iterate" core)

```
GROWTH TICK:
1. measure   → SQL over prospect_events: book-rate & EMPC by {signal, title, segment, opener, send_window, tier}
2. attribute → which inputs produce meetings vs burn credits
3. reallocate→ shift budget/throttle toward high-EMPC; suppress low
4. bandit    → promote winning opener/signal arms in `experiments`, retire losers
5. propose   → spin up ONE new experiment (new signal / persona / opener / segment)
6. closed-loop ICP → diff firmographics of contacts that BOOKED vs the TAM;
                     auto-tighten/expand sourcing filters toward bookers (lookalike-from-bookers)
```

This is what makes TAM self-correcting and the machine compounding rather than static.

---

## 8. Exploration vs exploitation (the yomi budget)

Reserve a fixed slice of credits (start ~15%) for **exploration** — untested signals, new
ICP segments, new openers — and spend the rest on proven winners. The bandit shifts the split:
more exploitation as confidence rises; snap back to exploration when book-rate decays. This
keeps the machine discovering new meeting sources instead of grinding a decaying vein.

---

## 9. Project tree (unlockables)

Each project activates autonomously when the machine has the **data or budget** to run it.
You don't build all of it up front — the machine grows into it.

| Tier | Project | Unlocks at | Effect |
|---|---|---|---|
| **1 Bootstrap** | verify + first-touch sender; firmographic ICP filter | day 0 | basic clip production |
| **2 Automate** | signal monitoring (`detectJobChange`, funding); cadence engine; **speed-to-lead fast path** | loop stable | +meetings/credit via timing |
| **3 Optimize** | **opener bandit**; send-window learner; tier + just-in-time enrichment | ≥N events | continuous reply-rate lift |
| **4 Compound** | **closed-loop ICP / lookalike-from-bookers**; multi-thread accounts; **champion-left double play** | first ~20 meetings | self-tightening TAM, 2 meetings per job change |
| **5 Expand** | new channel (LinkedIn); auto-discover segments; referral mining; inbound capture | budget self-funds | net-new meeting sources |

---

## 10. Autonomy dial + guardrails (the trust mechanic)

Measured performance buys autonomy — the system cannot run away because bad metrics throttle
it down automatically.

- **Budget gate** before every spend (`check_budget` ≥ floor). Credits are the circuit-breaker.
- **Autonomy ramp:** book-rate healthy + bounce-rate low → throttle and credit-cap auto-**raise**;
  deliverability dips / spam complaints → auto-**lower** + alert human.
- **Supervised → autonomous:** starts with human approval at low throttle, earns full autonomy
  as metrics prove out.
- **Verify before send** (drop non-`valid` emails) — protect sender reputation.
- **Human escape hatch:** high-value or ambiguous replies route to a human queue, never auto-booked.
- **Idempotency:** `next_action_at` + `stage` make every tick safe to re-run after a crash.
- **Negative-signal suppression:** `detectJobChange LEFT`, bounces, dead domains → stop spending,
  reallocate.

---

## 11. Optimize for pipeline $, not raw meeting count

Not all meetings are equal. The allocator maximizes **expected pipeline value**, not meeting
count: `EMPC = book_rate × expected_value / credit_cost`. `expected_value` is learned per
segment/tier from won-deal sizes (via `icp-discovery` + CRM). This makes the machine chase
enterprise logos when they justify the extra credits and SMB volume when they don't — turning
"more meetings" into "more revenue."

---

## 12. The one thing to build outside Cargo — inbox + calendar

Cargo gets you to *qualified + sent* and back to *replied*; it does **not** book the meeting.

- **Inbound:** email/inbox webhook → push reply into OpenClaw → LLM classify → drives `replied`.
- **Booking:** calendar integration (Cal.com / Google Calendar API / Nylas) → propose times →
  send invite → `meeting_booked`.

This is the only net-new infrastructure. Everything above the line is configuration of existing
Cargo primitives.

---

## 13. TAM front-end — the wire supply

TAM is the universe; signals decide timing; the loop closes. Source broad and cheap; spend
enrichment only where intent justifies it (sourcing ≈ 0.05 cred/co, but full contact enrichment
≈ 6 cred/contact).

1. **ICP-derived, not gut-feel** — run `icp-discovery` (Won vs Lost diff) → ranked filters →
   feed to `build-tam`. Raises book-rate of the whole universe at the source. Re-run quarterly.
2. **Source the universe cheap** — `salesNavigator.searchAccounts` (default at scale) →
   `cargo.matchBusiness` → `enrichBusinessFirmographics` to warm + dedupe.
3. **Tier + drip** — leave TAM at `sourced`; score firmographically (free); enrich contacts
   **just-in-time** as the loop pulls capacity (pull-based on pipeline coverage, not bulk dump).
4. **TAM × signal = contacted set** — broad cheap membership layer + signal overlay decides
   who's hot now.
5. **Coverage recovery** — escalate only high-tier enrichment misses to `FullEnrich`/PDL.
6. **Freshness decay** — re-source on cadence; `detectJobChange LEFT` prunes; suppress dead domains.

Sourcing decision tree (by primary filter): industry/size/geo → `salesNavigator`; funding/investor
→ `peopleDataLabs.queryCompanies` (PDL SQL); tech stack → `theirStack.searchCompanies`; hiring →
`theirStack.searchJobs`; local SMBs → `serper.searchPlaces`.

---

## 14. Roadmap

| Milestone | Deliverable | Proves |
|---|---|---|
| **M-1 Runtime** | stand up the thin runtime app: scheduler/heartbeat, budget governor (credit floor + daily throttle), activity feed; load `cargo-skills` + `cargo-meeting-machine` onto an OpenClaw brain | the app + brain + skills exist |
| **M0 State** | create `Contacts` + `prospect_events` + `experiments` models & columns | game board exists |
| **M0.3 TAM** | `icp-discovery → build-tam` + tier/drip; rows land at `sourced` | self-feeding wire supply |
| **M1 Hands** | bind the tool surface; run enrich→verify→personalize→send on 20 contacts manually | pipeline works end-to-end |
| **M2 Brain** | EMPC allocator drives M1 by `next_action_at`; one segment, one opener | autonomy on a fixed list |
| **M3 Eyes** | wire `poll_signals` (detectJobChange first) → auto-enroll to `sourced` | self-feeding by signal |
| **M4 Close** | inbox webhook + reply classifier + calendar booking → `meeting_booked` | **books a real meeting** |
| **M5 Compound** | growth loop + bandit + closed-loop ICP + expected-value weighting | meeting rate trends up on its own |
| **M6 Govern** | budget thresholds + daily throttle, approval queue, the three routines, cost/activity dashboard | safe to leave running |

**Build order rationale:** stand up the **thin runtime** (scheduler + budget governor) and load the
skills first (M-1), then the **state ledger** and the **EMPC allocator policy** (the seed crystal),
run the smallest Phase-2 loop, then layer signals, closing, and the growth loop.

### Build layout — where each piece lives

| Piece | Home | Why |
|---|---|---|
| Runtime app (scheduler, budget governor, dashboard, approval queue) | **its own repo** — the thin app we build | borrows the autonomous-business *shape*; no external orchestration dependency |
| Cargo capability skills | loaded onto the OpenClaw brain ← `cargo-skills` bundle | execution plane, installed as-is |
| **Meeting-machine program** | `cargo-meeting-machine/SKILL.md` (a skill) | the EMPC allocator policy + stage machine + routing — the skill *is* the program |
| GTM domain state | **Cargo storage** (Contacts / prospect_events / experiments) | system of record, CRM-sync-ready |
| Scheduling / cost bookkeeping | the runtime app's own small store | lightweight; everything important is in Cargo |
| inbox + calendar | **the runtime app** (the only net-new code) | Cargo doesn't book meetings |

---

## 15. Open decisions

1. **Stage ownership** — does this autopilot *own* the funnel (Cargo `stage` is truth) or mirror
   an existing CRM deal stage? Determines sync direction.
2. **Cold or signal-only?** Signal-only is far cheaper and where `detectJobChange` is uniquely
   differentiated; cold adds the TAM front-end (§13).
3. **OpenClaw ↔ Cargo binding** — shell out to the CLI (documented path) or native MCP?
4. **Inbox + calendar provider** — Cal.com / Google Calendar API / Nylas (§12).
5. **Objective** — raw meetings now, or expected pipeline $ from the start (§11)?

---

## Appendix A — M0 commands (the seed)

> Discover UUIDs first: `cargo-ai storage dataset list` (for `--dataset-uuid`),
> `cargo-ai storage model list`. Then:

```bash
# Contacts model
cargo-ai storage model create --slug contacts --name "Contacts" \
  --dataset-uuid <uuid> --extractor-slug <slug> --config '{}'

# Stage + scheduler columns (repeat column create per column)
cargo-ai storage column create --model-uuid <contacts-uuid> \
  --column '{"slug":"stage","type":"string","label":"Stage","kind":"custom"}'
cargo-ai storage column create --model-uuid <contacts-uuid> \
  --column '{"slug":"next_action_at","type":"date","label":"Next Action At","kind":"custom"}'
cargo-ai storage column create --model-uuid <contacts-uuid> \
  --column '{"slug":"score","type":"number","label":"Score","kind":"custom"}'
cargo-ai storage column create --model-uuid <contacts-uuid> \
  --column '{"slug":"tier","type":"number","label":"Tier","kind":"custom"}'
cargo-ai storage column create --model-uuid <contacts-uuid> \
  --column '{"slug":"expected_value","type":"number","label":"Expected Value","kind":"custom"}'
cargo-ai storage column create --model-uuid <contacts-uuid> \
  --column '{"slug":"opener_template_id","type":"string","label":"Opener Template","kind":"custom"}'
# ... last_signal, last_signal_at, sequence_step, disqualify_reason, identity cols

# prospect_events model
cargo-ai storage model create --slug prospect_events --name "Prospect Events" \
  --dataset-uuid <uuid> --extractor-slug <slug> --config '{}'
cargo-ai storage column create --model-uuid <events-uuid> \
  --column '{"slug":"event_type","type":"string","label":"Event Type","kind":"custom"}'
cargo-ai storage column create --model-uuid <events-uuid> \
  --column '{"slug":"occurred_at","type":"date","label":"Occurred At","kind":"custom"}'
cargo-ai storage column create --model-uuid <events-uuid> \
  --column '{"slug":"payload","type":"object","label":"Payload","kind":"custom"}'
cargo-ai storage column create --model-uuid <events-uuid> \
  --column '{"slug":"credits_spent","type":"number","label":"Credits Spent","kind":"custom"}'
# ... source_run_id, opener_template_id, signal_stack

# Relationships
cargo-ai storage relationship set --from-model-uuid <events-uuid> --to-model-uuid <contacts-uuid>
cargo-ai storage relationship set --from-model-uuid <contacts-uuid> --to-model-uuid <companies-uuid>

# experiments model (bandit memory) — analogous create + columns
```

## Appendix B — key invariants

- Filter JSON uses `conjonction` (not `conjunction`).
- Action shape carries **no `connectorUuid`** in `config`.
- Output retrieval: `cargo-ai orchestration run download-outputs --output-node-slug <slug>`.
- `segment fetch` requires `--model-uuid`, not `--segment-uuid`.
- Every spend is gated by `check_budget` — credits are the governor.
- Write the event and update the stage in the same tick — never let state and history drift.
