# Alert recipes

Copy-paste starting points. Every one is **`preview` first** to size the threshold, then `create`. Replace `<…>` placeholders with real UUIDs (discover them via `cargo-orchestration` / `cargo-storage` / `cargo-ai`). See `../scopes-and-thresholds.md` for every field and `../alert-lifecycle.md` for firing semantics.

---

## 1. Error-rate pager for one workflow

Page the on-call agent when a workflow's runs start failing.

```bash
# Preview against the last 24h to see the current rate
cargo-ai observability alert preview \
  --scope '{"kind":"runs","workflowUuid":"<workflow-uuid>"}' \
  --threshold '{"metric":"errorRate","operator":"gte","value":10}' \
  --window-minutes 1440

# Create it on a 30-min cadence with an agent notification
cargo-ai observability alert create \
  --name "CRM sync — error rate" \
  --description "Error rate ≥10% over 30 min" \
  --cron "*/30 * * * *" \
  --scope '{"kind":"runs","workflowUuid":"<workflow-uuid>"}' \
  --threshold '{"metric":"errorRate","operator":"gte","value":10}' \
  --actions '[{"kind":"agent","agentUuid":"<agent-uuid>","config":{"message":"🚨 {{alert.name}}: {{event.value}}% errors ({{event.windowStart}}–{{event.windowEnd}}). {{alert.url}}"}}]'
```

`errorRate` is a percent of *finished* runs; a quiet window with nothing finished is `empty`, not a false `0%`.

---

## 2. Credit-budget guard

Catch cost blowouts before the invoice does — total credits burned by a workflow over the window.

```bash
cargo-ai observability alert create \
  --name "Enrichment play — hourly credit ceiling" \
  --cron "0 * * * *" \
  --scope '{"kind":"spans","workflowUuid":"<workflow-uuid>","nodeKind":"connector"}' \
  --threshold '{"metric":"credits","aggregation":"sum","operator":"gte","value":500}' \
  --actions '[{"kind":"agent","agentUuid":"<agent-uuid>","config":{"message":"💸 {{alert.name}} burned {{event.value}} credits in the last hour ({{event.threshold}} ceiling). {{alert.url}}"}}]'
```

Scoping to `nodeKind: "connector"` measures only the paid provider calls. Preview at a couple of window sizes to learn the normal hourly spend before setting `value`.

---

## 3. p95 latency watch

Fire when a workflow (or a specific node) gets slow.

```bash
cargo-ai observability alert preview \
  --scope '{"kind":"spans","workflowUuid":"<workflow-uuid>","nodeActionSlug":"<action-slug>"}' \
  --threshold '{"metric":"duration","aggregation":"p95","operator":"gte","value":30}' \
  --window-minutes 180
```

Use the previewed `value` to set a realistic `p95` threshold, then `create` with a `--cron`. Aggregations: `avg` | `p50` | `p95` | `p99`.

---

## 4. Dead-man's switch — alert when a workflow STOPS running

The one pattern that needs `count lte 0`: `count` reports a real `0` on an empty window (not `empty`), so silence breaches.

```bash
cargo-ai observability alert create \
  --name "Nightly sync — did it run?" \
  --description "No runs in the last 24h = something broke upstream" \
  --cron "0 8 * * *" \
  --scope '{"kind":"runs","workflowUuid":"<workflow-uuid>"}' \
  --threshold '{"metric":"count","operator":"lte","value":0}' \
  --actions '[{"kind":"agent","agentUuid":"<agent-uuid>","config":{"message":"⚠️ {{alert.name}}: the nightly sync produced no runs. {{alert.url}}"}}]'
```

The cron interval **is** the window — run this once daily so "no runs" means "none in the last day".

---

## 5. Model freshness — stale sync

Breach when a model hasn't emitted new data in too long. `freshness` is in **minutes** and ignores the scope filter.

```bash
cargo-ai observability alert create \
  --name "Companies model — freshness" \
  --cron "*/30 * * * *" \
  --scope '{"kind":"model","modelUuid":"<model-uuid>"}' \
  --threshold '{"metric":"freshness","operator":"gte","value":120}' \
  --actions '[{"kind":"agent","agentUuid":"<agent-uuid>","config":{"message":"🕒 {{alert.name}}: {{event.value}} min since last emit. {{alert.url}}"}}]'
```

Related model metrics: `syncDuration gte <seconds>` (sync got slow), `recordsShare gte <percent>` (a filtered slice grew — needs a scope `filter`).

---

## 6. Empty-model dead-man's switch

`recordsCount` returns a real `0` on an empty model, so `lte 0` catches a model that emptied out or never populated.

```bash
cargo-ai observability alert create \
  --name "Leads model — not empty" \
  --cron "0 */6 * * *" \
  --scope '{"kind":"model","modelUuid":"<model-uuid>"}' \
  --threshold '{"metric":"recordsCount","operator":"lte","value":0}' \
  --actions '[{"kind":"agent","agentUuid":"<agent-uuid>","config":{"message":"📉 {{alert.name}}: the model is empty. {{alert.url}}"}}]'
```

Add a `filter` (segmentation shape, spelled `conjonction`) to count only a slice — e.g. records missing an enrichment column, then alert if that count climbs with `gte`.

---

## 7. Custom SQL-query alert

When no built-in metric fits, compute the value yourself. The query must return a **single number** and window itself.

Orchestration runtime (error rate over the last hour, self-windowed):

```bash
cargo-ai observability alert create \
  --name "Workspace-wide error rate" \
  --cron "*/15 * * * *" \
  --scope '{"kind":"orchestrationQuery","query":"select countIf(status = '"'"'error'"'"') * 100 / count() from runs where created_at > now() - interval 1 hour"}' \
  --threshold '{"metric":"query","operator":"gte","value":5}'
```

Storage warehouse (records missing enrichment):

```bash
cargo-ai observability alert create \
  --name "Unenriched companies backlog" \
  --cron "0 */4 * * *" \
  --scope '{"kind":"storageQuery","query":"select count() from default.companies where enriched_at is null"}' \
  --threshold '{"metric":"query","operator":"gte","value":1000}'
```

Notes:
- Validate the SQL with `cargo-ai orchestration query execute` / `cargo-ai storage query execute` first, then `alert preview` the whole scope+threshold.
- An aggregate over no rows is `NULL` → treated as `empty` (won't breach `lte`). For a "went silent" query alert, return a real `0` via `count()`.
- Shell-quoting SQL with single quotes is fiddly — the `'"'"'` dance above escapes a literal `'`. Alternatively build the JSON in a file and pass `--scope "$(cat scope.json)"`.

---

## Reading the results

```bash
cargo-ai observability alert list                 # every alert + its lastEvent status/value
cargo-ai observability event list <alert-uuid>    # firing history, newest first
```

An `unhealthy` event's `runUuids` are the runs its actions spawned — trace them with `cargo-ai orchestration run get <uuid>` or hand them to `cargo-diagnostics`. An `error` event means the metric couldn't be computed (bad query, deleted model) — read its `errorMessage` and fix the scope.
