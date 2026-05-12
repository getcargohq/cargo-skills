# Orchestration query examples

Run SQL against orchestration runtime tables — `runs`, `batches`, `spans`, `records` — with `cargo-ai orchestration query execute`. Use this for ad-hoc analytics on workflow execution (error rates, throughput, slowest nodes, per-node failure breakdowns) without the workflow-scoped filters of `run get-metrics` / `run count`.

The backing store is ClickHouse; queries are read-only and exit non-zero with `{"errorMessage": "..."}` on error.

> For SQL against workspace storage (Companies, Contacts, Deals…), use `cargo-ai storage query execute "<sql>"` — documented in the `cargo-storage` skill (`references/examples/queries.md`).

## Basic query flow

```bash
cargo-ai orchestration query execute \
  "SELECT count() FROM runs WHERE status = 'error'"
```

Success response:

```json
{
  "rows": [{ "count()": 42 }]
}
```

## Tables

Tables are referenced **without** a schema prefix. The query engine scopes every read to your workspace automatically.

| Table     | Use it for                                                                 |
| --------- | -------------------------------------------------------------------------- |
| `runs`    | Per-record workflow executions (status, timing, executions array, batch)   |
| `batches` | Batch-level rows: counts (`runs_count`, `failed_runs_count`), credit usage |
| `spans`   | Flattened per-node execution rows (one row per node execution)             |
| `records` | Materialized view over `runs` keyed by record id                           |

Common columns: `workspace_uuid`, `workflow_uuid`, `batch_uuid`, `release_uuid`, `status`, `created_at`, `updated_at`, `finished_at`, `credits_used_count`. See the migration files in `apps/backend/src/domains/orchestration/migrations/` for the full schema.

## Example queries

```bash
# Error rate across the whole workspace
cargo-ai orchestration query execute \
  "SELECT countIf(status='error') / count() AS error_rate FROM runs WHERE created_at > now() - INTERVAL 1 DAY"

# Errors per workflow over the last week
cargo-ai orchestration query execute \
  "SELECT workflow_uuid, count() AS errors FROM runs WHERE status='error' AND created_at > now() - INTERVAL 7 DAY GROUP BY workflow_uuid ORDER BY errors DESC"

# Batch status breakdown
cargo-ai orchestration query execute \
  "SELECT status, count() FROM batches GROUP BY status"

# Slowest node executions in the last hour
cargo-ai orchestration query execute \
  "SELECT node_slug, node_kind, dateDiff('second', execution_started_at, execution_finished_at) AS duration_s
   FROM spans
   WHERE execution_finished_at > now() - INTERVAL 1 HOUR
   ORDER BY duration_s DESC
   LIMIT 20"

# Per-node failure counts
cargo-ai orchestration query execute \
  "SELECT node_slug, count() AS failures
   FROM spans
   WHERE execution_status='error' AND execution_started_at > now() - INTERVAL 1 DAY
   GROUP BY node_slug
   ORDER BY failures DESC"

# Credit spend by workflow this month
cargo-ai orchestration query execute \
  "SELECT workflow_uuid, sum(credits_used_count) AS credits
   FROM batches
   WHERE created_at >= toStartOfMonth(now())
   GROUP BY workflow_uuid
   ORDER BY credits DESC"
```

## Common table expressions

```bash
cargo-ai orchestration query execute \
  "WITH recent AS (SELECT * FROM runs WHERE created_at > now() - INTERVAL 1 DAY)
   SELECT status, count() FROM recent GROUP BY status"
```

## Limits and restrictions

Orchestration queries run as a read-only ClickHouse user with per-query caps:

| Limit                | Value      |
| -------------------- | ---------- |
| `max_execution_time` | 30s        |
| `max_result_rows`    | 10 000     |
| `max_rows_to_read`   | 10 000 000 |
| `max_columns_to_read`| 50         |
| `max_subquery_depth` | 5          |

DDL, introspection functions, table functions (`merge`, `cluster`, `remote`, `url`, `s3`, `file`, …), dictionary accessors, and the query cache are all denied. Wrap heavy aggregations in time filters (`created_at > now() - INTERVAL N DAY`) to stay under the row-scan cap.

## Error handling

```json
{ "errorMessage": "Code: 158. Memory limit exceeded ..." }
```

Common causes:
- Scanned too many rows → narrow the time window with a `created_at`/`execution_started_at` predicate
- Forbidden function (e.g. `system.tables`, `cluster()`, `url()`) → use only `SELECT` against the four tables above
- Too many result rows → add a `LIMIT` or aggregate before returning
