# Query examples

Two read-only SQL surfaces are exposed by the CLI:

- **`cargo-ai storage query execute "<sql>"`** — your connected data warehouse (Companies, Contacts, Deals…). Tables are referenced as `<datasetSlug>.<modelSlug>`.
- **`cargo-ai orchestration query execute "<sql>"`** — orchestration runtime tables (`spans`, `runs`, `batches`, `records`) for execution analytics. Tables are referenced by short name; workspace scoping is applied automatically.

Both are read-only, exit non-zero on error with `{"errorMessage": "..."}`, and return `{"rows": [...]}` on success.

---

## Storage queries — data warehouse

Run SQL against your connected data warehouse with `cargo-ai storage query execute`. Tables are referenced as `<datasetSlug>.<modelSlug>` and rewritten to the underlying warehouse table under the hood. No DDL lookup is required for the table name — just use the dataset and model slugs.

For column slugs, run `cargo-ai storage column list --model-uuid <uuid>` or `cargo-ai storage model get-ddl <model-uuid>` (the DDL also shows column types and the SQL dialect).

### Basic query flow

```bash
# 1. Discover the dataset slug and the model slug
cargo-ai storage dataset list   # → datasets[].slug (e.g. "default")
cargo-ai storage model list     # → models[].slug   (e.g. "companies")

# 2. Query using <datasetSlug>.<modelSlug> as the table name
cargo-ai storage query execute \
  "SELECT name, domain, employee_count FROM default.companies LIMIT 10"
```

Success response:

```json
{
  "rows": [
    { "name": "Acme Corp", "domain": "acme.com", "employee_count": 500 },
    { "name": "Globex", "domain": "globex.com", "employee_count": 1200 }
  ]
}
```

Failed commands exit non-zero with `{"errorMessage": "..."}` (or `{"reason": "clientNotFound"|"unknown"}`). See the error handling section below.

### Query with WHERE clauses

```bash
# Filter by a column
cargo-ai storage query execute \
  "SELECT name, domain FROM default.companies WHERE employee_count > 100"

# Multiple conditions
cargo-ai storage query execute \
  "SELECT name, domain, revenue FROM default.companies WHERE employee_count > 100 AND country = 'US'"

# LIKE for partial matches
cargo-ai storage query execute \
  "SELECT name, domain FROM default.companies WHERE name LIKE '%tech%'"

# NULL checks
cargo-ai storage query execute \
  "SELECT name, domain FROM default.companies WHERE email IS NOT NULL"
```

### Aggregation queries

```bash
# Count records
cargo-ai storage query execute \
  "SELECT COUNT(*) as total FROM default.companies"

# Group by with counts
cargo-ai storage query execute \
  "SELECT country, COUNT(*) as count FROM default.companies GROUP BY country ORDER BY count DESC"

# Sum and average
cargo-ai storage query execute \
  "SELECT country, SUM(revenue) as total_revenue, AVG(employee_count) as avg_employees FROM default.companies GROUP BY country"
```

### Pagination

Page through large result sets with SQL `LIMIT` and `OFFSET` clauses. Always include an `ORDER BY` so pages are stable across calls.

```bash
# First page
cargo-ai storage query execute \
  "SELECT * FROM default.companies ORDER BY name LIMIT 100 OFFSET 0"

# Second page
cargo-ai storage query execute \
  "SELECT * FROM default.companies ORDER BY name LIMIT 100 OFFSET 100"
```

### Download full results

For exporting full result sets to a file, use `storage query download`:

```bash
cargo-ai storage query download \
  --query "SELECT name, domain, employee_count, revenue FROM default.companies ORDER BY revenue DESC"

# Choose the format (csv default, parquet supported)
cargo-ai storage query download \
  --query "SELECT * FROM default.companies" --format parquet
```

### Query across multiple models

Just join on `<datasetSlug>.<modelSlug>` table references:

```bash
cargo-ai storage query execute \
  "SELECT c.name, c.domain, d.stage, d.amount FROM default.companies c JOIN default.deals d ON c._id = d.company_id WHERE d.amount > 10000"
```

### Common table expressions

```bash
cargo-ai storage query execute \
  "WITH recent AS (SELECT * FROM default.companies WHERE created_at >= CURRENT_DATE - INTERVAL '30' DAY) SELECT count(*) FROM recent"
```

### Date queries

```bash
# Records created in the last 30 days
cargo-ai storage query execute \
  "SELECT name, created_at FROM default.companies WHERE created_at >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)"

# Records in a specific range
cargo-ai storage query execute \
  "SELECT name, created_at FROM default.companies WHERE created_at BETWEEN '2025-01-01' AND '2025-03-31'"
```

### Subqueries

```bash
# Companies with above-average employee count
cargo-ai storage query execute \
  "SELECT name, employee_count FROM default.companies WHERE employee_count > (SELECT AVG(employee_count) FROM default.companies)"
```

### Error handling

If a query fails, the command exits non-zero. Failure shapes:

```json
{ "errorMessage": "Table not found: default.nonexistent" }
```

```json
{ "reason": "clientNotFound" }
```

Common causes:
- Wrong dataset or model slug → re-check with `storage dataset list` and `storage model list`
- Syntax error → check SQL syntax for your warehouse dialect (BigQuery vs Snowflake) — `storage model get-ddl` reports `language`
- `clientNotFound` → no warehouse client is configured for this workspace

---

## Orchestration queries — execution analytics

Run SQL against orchestration runtime tables with `cargo-ai orchestration query execute`. Use this when `run get-metrics` and `run count` are too coarse — for cross-workflow analytics, per-node failure breakdowns, time-series, or arbitrary joins between executions and the records they processed.

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

### Tables

Tables are referenced **without** a schema prefix. The query engine scopes every read to your workspace automatically.

| Table     | Use it for                                                                 |
| --------- | -------------------------------------------------------------------------- |
| `runs`    | Per-record workflow executions (status, timing, executions array, batch)   |
| `batches` | Batch-level rows: counts (`runs_count`, `failed_runs_count`), credit usage |
| `spans`   | Flattened per-node execution rows (one row per node execution)             |
| `records` | Materialized view over `runs` keyed by record id                           |

Common columns: `workspace_uuid`, `workflow_uuid`, `batch_uuid`, `release_uuid`, `status`, `created_at`, `updated_at`, `finished_at`, `credits_used_count`. See the migration files in `apps/backend/src/domains/orchestration/migrations/` for the full schema.

### Example queries

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

### Common table expressions

```bash
cargo-ai orchestration query execute \
  "WITH recent AS (SELECT * FROM runs WHERE created_at > now() - INTERVAL 1 DAY)
   SELECT status, count() FROM recent GROUP BY status"
```

### Limits and restrictions

Orchestration queries run as a read-only ClickHouse user with per-query caps:

| Limit                | Value     |
| -------------------- | --------- |
| `max_execution_time` | 30s       |
| `max_result_rows`    | 10 000    |
| `max_rows_to_read`   | 10 000 000 |
| `max_columns_to_read` | 50       |
| `max_subquery_depth` | 5         |

DDL, introspection functions, table functions (`merge`, `cluster`, `remote`, `url`, `s3`, `file`, …), dictionary accessors, and the query cache are all denied. Wrap heavy aggregations in time filters (`created_at > now() - INTERVAL N DAY`) to stay under the row-scan cap.

### Error handling

```json
{ "errorMessage": "Code: 158. Memory limit exceeded ..." }
```

Common causes:
- Scanned too many rows → narrow the time window with a `created_at`/`execution_started_at` predicate
- Forbidden function (e.g. `system.tables`, `cluster()`, `url()`) → use only `SELECT` against the four tables above
- Too many result rows → add a `LIMIT` or aggregate before returning

---

## Discovery commands

```bash
# Discover warehouse datasets and models
cargo-ai storage dataset list
cargo-ai storage model list

# Get the schema of a single model (column types and SQL dialect)
cargo-ai storage model get-ddl <model-uuid>
```
