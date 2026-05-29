---
name: cargo-meeting-machine
description: Run an autonomous, self-improving GTM optimizer whose only goal is booked meetings. Use when an agent (OpenClaw under a Paperclip heartbeat, or any scheduled runtime) should source, enrich, signal-time, personalize, send, and book meetings on its own — allocating a credit budget to the highest expected meetings-per-credit each cycle. The program is this skill; Cargo is the execution plane; the host runtime supplies the heartbeat, budget, and governance.
version: "0.1.0"
compatibility: Requires @cargo-ai/cli (npm) and a Cargo account. Designed to run as a skill inside a Paperclip company on an OpenClaw agent, but works under any scheduler that can invoke it on a cron/heartbeat.
homepage: https://github.com/getcargohq/cargo-skills
metadata:
  author: getcargo
  openclaw:
    requires:
      bins:
        - cargo-ai
    install:
      - kind: node
        package: "@cargo-ai/cli@latest"
        bins:
          - cargo-ai
    homepage: https://github.com/getcargohq/cargo-skills
---

# Cargo Meeting Machine — autonomous meeting-booking optimizer

> One metric: **meetings booked.** One resource: **credits.** Each cycle, spend the marginal
> credit on the highest expected meetings-per-credit. Learn what books, unlock new capability as
> you grow, and earn autonomy as you prove it — *Universal Paperclips*, where the clip is a meeting.

This skill is the **program**. It does not provide a runtime — it assumes a host that wakes it on a
schedule and enforces a budget:

- **Runtime host:** [Paperclip](https://github.com/paperclipai/paperclip) supplies the **heartbeat**
  (wakeup queue), **budget policy** (warning thresholds + hard stops), **routines/cron**, **task
  system** (atomic checkout, persistent context), and **governance/approvals**. Run this skill from
  three Paperclip routines (below). Any scheduler that can invoke an agent on a cron works too.
- **Execution plane:** Cargo — every external action goes through the `cargo-ai` CLI. Load the
  capability skills as needed (they are peers in this repo).
- **System of record:** Cargo storage (`Contacts`, `prospect_events`, `experiments`). Runtime/task/
  cost state lives in the host (Paperclip Postgres). Two stores, clean split.

See the full design in [`../plans/autonomous-gtm-meeting-machine.md`](../plans/autonomous-gtm-meeting-machine.md).

## The objective

Maximize **expected pipeline value of booked meetings**, subject to the credit budget:

```
EMPC(action) = book_rate(action) × expected_value(action) ÷ credit_cost(action)
```

`book_rate` and `expected_value` are SQL aggregates over the `prospect_events` ledger. Raw meeting
count is the day-0 proxy; switch to expected pipeline $ as won-deal sizes accumulate.

## How it runs — three routines on the host's heartbeat

| Routine (Paperclip schedule) | Cadence | What it does |
|---|---|---|
| **fast tick** | on inbound-reply webhook (sub-minute) | classify the reply, jump to `replied`/`booking`, interrupt cadence — speed-to-lead is the biggest conversion lever |
| **main tick** | every 10–15 min | run the EMPC allocator over everything due; source/enrich/send/follow-up within budget + throttle |
| **growth tick** | nightly | strategy search: re-measure EMPC per segment/opener/signal, promote winning bandit arms, refresh ICP from bookers |

The host's budget policy is the governor: when remaining credits hit the floor, the hard stop fires
and sends pause. Do **not** re-implement budget logic here — read it and respect it.

## The decision each main tick — EMPC allocator

```
1. budget ← cargo-ai billing subscription get        # available - used; host also enforces a hard stop
   if budget < FLOOR: skip sends this cycle
2. if signal_cadence_due: poll_signals(monitored segments) → write signals + events
3. work ← read_working_set()                          # everything due, by next_action_at
4. candidates ← all eligible actions across stages (source, enrich, signal, send, follow_up, book, explore)
   for c in candidates: c.empc ← book_rate(c) × expected_value(c) / credit_cost(c)
   while budget > FLOOR and throttle_remaining and candidates:
        c ← argmax(empc) respecting deliverability + approval gates
        execute(c) via cargo-ai; append prospect_events(credits_spent); update stage; recompute empc
5. emit a tick summary (per-stage counts, credits spent, EMPC) to the host's structured log
```

Reserve a fixed slice of budget (start ~15%) for **exploration** (untested signals/segments/openers);
spend the rest on proven winners. Shift toward exploitation as confidence rises; snap back when
book-rate decays.

## Stage machine

```
sourced → enriched → verified → scored ─┬─→ queued → contacted → [follow_up] → replied → booking → meeting_booked
                                        └─→ disqualified                                  └─→ lost / bounced
```

| stage | action | next |
|---|---|---|
| `sourced` | enrich → verify | `verified` / `bounced` |
| `verified` | score = LLM(contact, ICP) | `queued` (≥ bar) / `disqualified` |
| `queued` | get context → personalize (bandit opener) → send | `contacted`, `next_action_at = +3d` |
| `contacted` | if due & no reply: follow-up; `sequence_step++` | `lost` when `step > MAX` |
| `replied` | classify intent (fast tick) | positive→`booking`, objection→handle, negative→`disqualified` |
| `booking` | propose times → invite → CRM sync | **`meeting_booked`** |

Write the event and update the stage in the same tick — never let state and history drift.

## Tool routing — which capability skill / command per step

Load the capability skill the first time you need its domain, then issue the `cargo-ai` command.

| Step | Skill | Command (action shape: `{"kind":"connector","integrationSlug":"<slug>","actionSlug":"<slug>","config":{}}`) |
|---|---|---|
| budget | [`cargo-billing`](../cargo-billing/SKILL.md) | `cargo-ai billing subscription get` |
| source TAM | [`cargo-gtm`](../cargo-gtm/recipes/build-tam.md) | `salesNavigator.searchAccounts` / `peopleDataLabs.queryCompanies` / `theirStack.searchCompanies` |
| ICP from data | [`cargo-gtm`](../cargo-gtm/recipes/icp-discovery.md) | Won-vs-Lost diff via `storage query execute` + `cargo.enrich*` |
| warm / dedupe | [`cargo-orchestration`](../cargo-orchestration/SKILL.md) | `cargo.matchBusiness`, `cargo.enrichBusinessFirmographics` |
| enrich contact | [`cargo-orchestration`](../cargo-orchestration/SKILL.md) | `waterfall.enrichProspectDetails` → escalate `FullEnrich.findEmail` |
| verify | [`cargo-orchestration`](../cargo-orchestration/SKILL.md) | `waterfall.verifyEmail` (keep `status=="valid"`) |
| signals | [`cargo-gtm`](../cargo-gtm/recipes/job-change-monitoring.md) | `waterfall.detectJobChange` (cargo-unique), funding, tech-intent |
| personalize | [`cargo-gtm`](../cargo-gtm/recipes/outreach-activation.md) | `anthropic.instruct` (model = bandit arm) |
| context | [`cargo-context`](../cargo-context/SKILL.md) | personas / proof / objections for the opener |
| send / sequence | [`cargo-connection`](../cargo-connection/SKILL.md) | discover via `connection integration get <sequencer>`, then `action execute-batch` |
| state | [`cargo-storage`](../cargo-storage/SKILL.md) | `storage query execute` (read) + storage upsert (write) |

All ops are async — pass `--wait-until-finished` inline, or poll `run/batch get`. No `connectorUuid`
in `config`. Filter JSON uses `conjonction` (not `conjunction`).

## State model (Cargo storage)

Create once (M0). See the plan's Appendix A for exact `storage model/column create` commands.

- **`Contacts`** — current state: `stage`, `tier`, `score`, `expected_value`, `last_signal`,
  `next_action_at`, `sequence_step`, `opener_template_id`, identity, `company` (rel → Companies).
- **`prospect_events`** — append-only ledger (rel → Contacts): `event_type`, `occurred_at`,
  `payload`, `credits_spent`, `opener_template_id`, `signal_stack`, `source_run_id`. The learning
  substrate for EMPC and the growth tick.
- **`experiments`** — bandit memory: `kind`, `variant`, `status`, `trials`, `meetings`,
  `credits_spent`, `empc`.

## The one net-new piece — inbox + calendar

Cargo gets you to *qualified + sent* and back to *replied*; it does **not** book the meeting. Build
this as a Paperclip adapter-plugin / routine:

- **Inbound:** email webhook → fast tick → LLM classify → drives `replied`.
- **Booking:** Cal.com / Google Calendar API / Nylas → propose times → invite → `meeting_booked`.

## Guardrails (mostly the host's job)

- **Budget** — host enforces warning thresholds + hard stops; this skill reads remaining credits and
  gates spend on the floor. Never bypass.
- **Approvals** — high-value or ambiguous replies route to the host's approval gate, never auto-booked.
- **Autonomy ramp** — healthy book-rate + low bounce → host raises throttle/cap; deliverability dips →
  lower + alert. Configure as a budget/governance policy, not code here.
- **Verify before send**, suppress negative signals (`detectJobChange LEFT`, bounces, dead domains).
- **Idempotency** — `next_action_at` + `stage` make every tick safe to re-run (host tasks are atomic).

## When stuck — file a report

If a `cargo-ai` command fails ≥2× on the same task, or a documented behavior contradicts what you
observe, file `cargo-ai workspaceManagement report create` (see
[`../cargo-workspace-management/SKILL.md`](../cargo-workspace-management/SKILL.md)). Do not give up
silently.

## References

- [`../plans/autonomous-gtm-meeting-machine.md`](../plans/autonomous-gtm-meeting-machine.md) — full build plan, milestones, M0 commands.
- [`../cargo-gtm/SKILL.md`](../cargo-gtm/SKILL.md) — recipes for every sourcing/enrichment/signal step.
- [`../cargo/SKILL.md`](../cargo/SKILL.md) — skills overview and session lifecycle.
- [Paperclip](https://github.com/paperclipai/paperclip) — the runtime host (heartbeat, budgets, routines, governance).
