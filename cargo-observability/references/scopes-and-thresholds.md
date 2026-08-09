# Scopes & thresholds — the compatibility matrix

An alert measures a **scope** and breaches on a **threshold**. They are a matched pair: each metric can only be computed over the scopes that produce it. Get the pairing wrong and the alert (or a `preview`) returns `outcome: "notComputed"` with `The "<metric>" metric cannot be computed over a "<scope>" scope.`

## The matrix at a glance

| Scope `kind` | Source | Allowed threshold metrics |
| --- | --- | --- |
| `spans` | Per-node executions of a workflow (ClickHouse) | `errorRate`, `duration`, `credits`, `count` |
| `runs` | Whole runs (the eight-value run status) | `errorRate`, `duration`, `credits`, `count` |
| `records` | One row per record, latest state | `errorRate`, `duration`, `credits`, `count` |
| `orchestrationQuery` | Your SQL over `runs`/`batches`/`spans`/`records` | `query` |
| `storageQuery` | Your SQL over the workspace data warehouse | `query` |
| `model` | A storage model's records + sync state | `recordsCount`, `recordsShare`, `freshness`, `syncDuration` |

`operator` is always `gte` or `lte`; `value` is always a number.

---

## Scopes (the `--scope` JSON)

### Telemetry scopes — `spans`, `runs`, `records`

All three are windowed over the evaluation interval and share the same four metrics. They differ in what they count and how they filter.

**`spans`** — one row per node execution. The richest filter set:

```json
{
  "kind": "spans",
  "workflowUuid": "…",
  "parentAgentUuid": "…",
  "nodeKind": "native | connector | tool | agent",
  "nodeIntegrationSlug": "…",
  "nodeConnectorUuid": "…",
  "nodeActionSlug": "…",
  "nodeToolUuid": "…",
  "nodeAgentUuid": "…",
  "executionTitleOrErrorMessage": "substring match",
  "executionStatuses": ["pending", "success", "error"],
  "userUuid": "…"
}
```

Every field is optional; omit them all to watch every span in the workspace. Use `nodeActionSlug` / `nodeConnectorUuid` to pin the alert to a single provider action, `nodeAgentUuid` to watch one agent's calls.

**`runs`** — one row per run. Filters on the **full** run status set (not the three execution statuses):

```json
{
  "kind": "runs",
  "workflowUuid": "…",
  "statuses": ["error"],
  "releaseUuid": "…",
  "recordTitleOrErrorMessage": "substring match",
  "userUuid": "…"
}
```

**`records`** — one row per record holding its latest state (no idle/skipped; the same work as `runs`, keyed by record):

```json
{
  "kind": "records",
  "workflowUuid": "…",
  "statuses": ["error"],
  "releaseUuid": "…",
  "titleOrErrorMessage": "substring match",
  "userUuid": "…"
}
```

> `statuses` on `runs` uses the full run-status enum; on `records` it uses the record-status enum. When in doubt, `preview` with the statuses you want and check the `total`/`failed` counts. (Discover valid status values from `cargo-orchestration`.)

### Query scopes — `orchestrationQuery`, `storageQuery`

You supply the SQL; it must return a **single numeric value** (the first column of the first row). The query is expected to **window itself** — `--window-minutes` does not apply.

```json
{ "kind": "orchestrationQuery", "query": "select countIf(status='error')*100/count() from runs where created_at > now() - interval 1 hour" }
```

```json
{ "kind": "storageQuery", "query": "select count() from default.companies where enriched_at is null" }
```

- `orchestrationQuery` runs against the orchestration runtime tables (`runs`, `batches`, `spans`, `records`; no schema prefix; workspace-scoped) — same engine as `cargo-ai orchestration query execute`.
- `storageQuery` runs against the workspace data warehouse using `<datasetSlug>.<modelSlug>` table names — same engine as `cargo-ai storage query execute`. If no warehouse is connected, the alert errors with *"No data warehouse is connected to this workspace."*
- An aggregate over no rows is `NULL` (and ClickHouse renders `NaN`/`0/0` as `NULL` too) → the evaluation is treated as **`empty`**, not `0`. So a rate query on an idle window won't false-breach an `lte` threshold. If you want silence to breach, use a `count()` that returns a real `0` (see the dead-man's switch recipe).

Pair either query scope with the `query` threshold — the SQL computes the value, the threshold just carries the comparison:

```json
{ "metric": "query", "operator": "gte", "value": 10 }
```

### Model scope — `model`

Watches a storage model's records and its sync health:

```json
{ "kind": "model", "modelUuid": "…", "filter": { "conjonction": "and", "groups": [ … ] } }
```

- `filter` is optional and uses the **segmentation filter shape** — note the spelling **`conjonction`** (silently ignored if misspelled). It narrows the record metrics (`recordsCount`, `recordsShare`) and is **ignored** by the sync metrics (`freshness`, `syncDuration`). Discover the filter shape and model UUIDs from `cargo-storage` / `cargo-orchestration`.
- A model is measured **point-in-time** — as it stands at the tick. The cron controls *how often* it's checked, not what's measured; `--window-minutes` doesn't apply.

---

## Thresholds (the `--threshold` JSON)

### Telemetry metrics (for `spans` / `runs` / `records`)

| Metric | Extra field | Value means | Empty window |
| --- | --- | --- | --- |
| `errorRate` | — | `failed × 100 / finished` (**percent**). `total` on the event is the finished denominator. | Nothing *finished* → `empty` (healthy, no fire). |
| `duration` | `aggregation`: `avg`\|`p50`\|`p95`\|`p99` | The chosen aggregate of duration **in seconds**, over finished rows only. Preview to see the current level before setting `value`. | No rows → `empty`. |
| `credits` | `aggregation`: `sum`\|`avg`\|`p95` | Credit spend aggregated over the window. | No rows → `empty`. |
| `count` | — | Number of rows **started** in the window (running ones included) — "did work happen". | A real **`0`**, *not* `empty` — so `count lte 0` is a dead-man's switch. |

```json
{"metric":"errorRate","operator":"gte","value":10}
{"metric":"duration","aggregation":"p95","operator":"gte","value":30}
{"metric":"credits","aggregation":"sum","operator":"gte","value":500}
{"metric":"count","operator":"lte","value":0}
```

### Query metric (for `orchestrationQuery` / `storageQuery`)

```json
{"metric":"query","operator":"gte","value":10}
```

### Model metrics (for `model`)

| Metric | Value means | Notes |
| --- | --- | --- |
| `recordsCount` | Live count of records matching the scope `filter`. | An empty model is a real **`0`** (not `empty`), so `recordsCount lte 0` is a dead-man's switch for an empty/broken model. |
| `recordsShare` | `matching × 100 / total` (**percent**) — the filter's share of the model. | Needs a scope `filter` to be meaningful. A model with **0** total records is `empty` (no share to report), not `0%`. Costs two warehouse queries. |
| `freshness` | **Minutes** since the model last emitted (falls back to the model's `createdAt` if it never has). | A model that never synced ages from creation, so `freshness gte <mins>` can breach a sync that never ran. |
| `syncDuration` | **Seconds** the model's last completed sync took (`finishedAt − createdAt` of `lastRun`). | While a sync is still in flight there's no duration → `empty` (won't false-breach an `lte`). |

```json
{"metric":"recordsCount","operator":"lte","value":0}
{"metric":"recordsShare","operator":"gte","value":30}
{"metric":"freshness","operator":"gte","value":60}
{"metric":"syncDuration","operator":"gte","value":300}
```

---

## The empty-vs-zero rule (why it matters)

Most metrics report an idle/empty window as **`empty`** → a `healthy` event, no fire. That's deliberate: you don't want an error-rate or latency alert screaming "0!" every quiet night.

Two metrics are the exception and return a real **`0`** on an empty window — **`count`** (telemetry) and **`recordsCount`** (model). Paired with **`lte`**, they become **dead-man's switches**: they breach *because* nothing happened. This is the only way to alert on absence — a workflow that stopped running, a model that emptied out. Every other metric treats absence as "nothing to measure", not "a low value". See the lifecycle reference for the full statement, and the recipes for a ready-made dead-man's switch.
