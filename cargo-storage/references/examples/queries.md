# Storage query examples

Run SQL against workspace storage with `cargo-ai storage query execute`. Tables are referenced as `<datasetSlug>.<modelSlug>` and rewritten to the underlying storage table under the hood. No DDL lookup is required for the table name — just use the dataset and model slugs.

For column slugs, run `cargo-ai storage column list --model-uuid <uuid>` or `cargo-ai storage model get-ddl <model-uuid>` (the DDL also shows column types and the SQL dialect).

## Basic query flow

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

## Query with WHERE clauses

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

## Aggregation queries

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

## Pagination

Page through large result sets with SQL `LIMIT` and `OFFSET` clauses. Always include an `ORDER BY` so pages are stable across calls.

```bash
# First page
cargo-ai storage query execute \
  "SELECT * FROM default.companies ORDER BY name LIMIT 100 OFFSET 0"

# Second page
cargo-ai storage query execute \
  "SELECT * FROM default.companies ORDER BY name LIMIT 100 OFFSET 100"
```

## Download full results

For exporting full result sets to a file, use `storage query download`. The response is a signed URL.

```bash
cargo-ai storage query download \
  --query "SELECT name, domain, employee_count, revenue FROM default.companies ORDER BY revenue DESC"

# Choose the format (csv default, parquet supported)
cargo-ai storage query download \
  --query "SELECT * FROM default.companies" --format parquet
```

## Query across multiple models

Join on `<datasetSlug>.<modelSlug>` table references:

```bash
cargo-ai storage query execute \
  "SELECT c.name, c.domain, d.stage, d.amount FROM default.companies c JOIN default.deals d ON c._id = d.company_id WHERE d.amount > 10000"
```

## Common table expressions

```bash
cargo-ai storage query execute \
  "WITH recent AS (SELECT * FROM default.companies WHERE created_at >= CURRENT_DATE - INTERVAL '30' DAY) SELECT count(*) FROM recent"
```

## Date queries

```bash
# Records created in the last 30 days
cargo-ai storage query execute \
  "SELECT name, created_at FROM default.companies WHERE created_at >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)"

# Records in a specific range
cargo-ai storage query execute \
  "SELECT name, created_at FROM default.companies WHERE created_at BETWEEN '2025-01-01' AND '2025-03-31'"
```

## Subqueries

```bash
# Companies with above-average employee count
cargo-ai storage query execute \
  "SELECT name, employee_count FROM default.companies WHERE employee_count > (SELECT AVG(employee_count) FROM default.companies)"
```

## Error handling

If a query fails, the command exits non-zero. Failure shapes:

```json
{ "errorMessage": "Table not found: default.nonexistent" }
```

```json
{ "reason": "clientNotFound" }
```

Common causes:
- Wrong dataset or model slug → re-check with `storage dataset list` and `storage model list`
- Syntax error → check SQL syntax for your storage SQL dialect (BigQuery vs Snowflake) — `storage model get-ddl` reports `language`
- `clientNotFound` → no storage client is configured for this workspace

## Discovery commands

```bash
cargo-ai storage dataset list                  # all datasets (uuid, slug)
cargo-ai storage model list                    # all models (uuid, name, slug)
cargo-ai storage model get-ddl <model-uuid>    # column types and SQL dialect
cargo-ai storage column list --model-uuid <uuid>  # column slugs for a model
```
