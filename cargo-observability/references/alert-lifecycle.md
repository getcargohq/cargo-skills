# Alert lifecycle — how evaluation and firing actually work

What happens on each cron tick, why an alert never double-fires, the empty-window rule, and the full templating context an action gets. Read this before you rely on an alert for anything time-sensitive.

## One evaluation tick

On every scheduled tick, for an enabled alert:

1. **Build the window.** `windowEndedAt = now − ClickHouse indexing lag` (spans land through Kinesis + a materialized view, so the tail of the window is left for the next tick to avoid missing late rows). `windowStartedAt = the alert's last `lastEvaluatedAt`, or its `updatedAt` on the first ever tick. Telemetry scopes measure over `[windowStartedAt, windowEndedAt]`; a `model` is measured point-in-time; a query scope windows itself.
2. **Compute the value** for the scope + threshold (see `scopes-and-thresholds.md`).
3. **Claim the window atomically** — advance the cursor (`lastEvaluatedAt → windowEndedAt`) only if the alert is still enabled, not deleted, and no other activity already advanced it. If the claim is lost, the tick records nothing and fires nothing.
4. **Record an event** and, on breach, **fire the actions**.

If `windowStartedAt >= windowEndedAt` (an empty or already-evaluated window — e.g. a retry, or overlapping ticks during a schedule change) the tick is a no-op: an alert never re-fires on spans it already saw.

## The three event outcomes

Every tick that claims its window writes exactly one event:

| Compute outcome | Event `status` | Fires actions? | `value` |
| --- | --- | --- | --- |
| breached | `unhealthy` | **yes** | the measured value |
| not breached | `healthy` | no | the measured value |
| `empty` (nothing to measure) | `healthy` | no | `null` |
| `notComputed` (bad SQL, deleted model, corrupt pairing) | `error` | no | `null` (+ `errorMessage`) |

`event list <alertUuid>` returns these newest-first. A run of `unhealthy` events is a sustained breach; an `error` event means the alert can't measure what it was told to — fix the scope/query/model.

## At-most-once firing (and what that means for you)

Firing is deliberately **at-most-once**, not at-least-once. The cursor is claimed *before* actions fire, so a Temporal retry or an overlapping cron can't fire the same breach twice. Actions spawn runs — which cost credits and can include agents that open PRs or send messages — so a rare *miss* is preferred to a *duplicate*.

Consequences:

- **A sustained breach is re-detected, not re-fired on the same rows.** Each tick only sees rows since the last cursor advance. If the condition is still breaching on the *next* window's rows, you get another `unhealthy` event then. So on a 30-minute cron, an ongoing error spike pages roughly every 30 minutes — it does not spam.
- **A one-tick blip fires once.** Good for "tell me the moment X happens".
- **Disabling or deleting an alert mid-evaluation cancels the firing** for that tick.
- **Design actions to be safe to receive repeatedly** (a notification, an idempotent ticket), since a long breach produces one firing per tick it's true for.

## The empty-vs-zero rule

An idle/empty window is reported as **`empty`** (→ `healthy`, no fire) for almost every metric — you don't want a latency or error-rate alert firing "0" every quiet hour.

The exceptions are **`count`** (telemetry scopes) and **`recordsCount`** (model scope): an empty window is a real **`0`**. Paired with **`lte 0`** they become **dead-man's switches** that breach *because* nothing happened — the only way to alert on *absence* (a workflow that stopped, a model that emptied). See `scopes-and-thresholds.md` for the per-metric table.

The same principle protects query alerts: an aggregate over no rows is `NULL` (ClickHouse also renders `NaN`/`0÷0` as `NULL`), which the alert treats as `empty` rather than `0` — so a rate query on an idle window won't false-breach an `lte` threshold. If you *want* silence to breach, write a `count()` that returns a genuine `0`.

## Actions: what fires, and the templating context

On breach, **each action in `--actions` is fired as its own run** through the orchestration action service (`skipConcurrencyCheck` is on — an alert must fire even when the workspace is at its run-concurrency limit). All the runs of one firing share a single trace; their uuids are stored on the event as `runUuids`. Firing is best-effort per action: one action failing to start is logged and skipped, never blocking the others or the event.

`--actions` is the shared orchestration `Action[]` union — the same shape used everywhere in `cargo-orchestration`:

```json
[
  {"kind":"agent","agentUuid":"…","config":{ "message":"…" }},
  {"kind":"connector","integrationSlug":"…","actionSlug":"…","config":{ … }},
  {"kind":"tool","toolUuid":"…","config":{ … }},
  {"kind":"native","actionSlug":"…","config":{ … }}
]
```

Each action's target (`agentUuid` / `toolUuid` / `connectorUuid`) is **validated to exist in the workspace** at create/update time — a mistyped uuid is rejected up front, not silently at breach. (An action whose target is deleted *afterwards* fails at fire time and is recorded on the event.)

### Firing context (templating)

Before each action runs, its `config` is interpolated against the firing context. The action's evaluated `config` becomes the run's input **data** (the action executes with an empty config), so put your bindings in `config`:

| Variable | Value |
| --- | --- |
| `{{alert.uuid}}` | The alert's UUID. |
| `{{alert.name}}` | The alert's name. |
| `{{alert.url}}` | Deep link to the alert in the app. |
| `{{event.value}}` | The measured value (rounded to 2 dp). |
| `{{event.threshold}}` | The threshold `value` it crossed. |
| `{{event.operator}}` | `gte` / `lte`. |
| `{{event.windowStart}}` | Window start, ISO 8601. |
| `{{event.windowEnd}}` | Window end, ISO 8601. |
| `{{event.spansUrl}}` | Deep link to the workspace's spans view. |

Example agent action that composes a human-readable page:

```json
[{"kind":"agent","agentUuid":"<agent-uuid>","config":{
  "message":"🚨 {{alert.name}} breached: {{event.value}} {{event.operator}} {{event.threshold}} over {{event.windowStart}}–{{event.windowEnd}}. Alert: {{alert.url}} · Spans: {{event.spansUrl}}"
}}]
```

## Schedules

- `--cron` accepts a 5-field cron expression **or** `@every <interval>` (e.g. `@every 15m`), evaluated in **UTC**.
- Minimum interval is **once a minute** — tighter `@every` values are rejected (every tick scans ClickHouse and may fire paid runs). Named-weekday cron expressions the interval parser can't measure are allowed through, since a 5-field cron can't fire more than once a minute anyway.
- The UI presets bottom out at **30 minutes**; the CDK template defaults to **5 minutes**. Pick the loosest cadence that still catches the problem in time — it's cheaper and quieter.
- Create with `--disabled` to stage an alert without evaluating it; `alert update --uuid <uuid> --enabled true` starts the schedule. `--enabled false` pauses it (the schedule stops; the alert and its history remain).
