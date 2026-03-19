# System of record query examples

**Rule: always get the DDL first.** Do not guess table names or column names.

## Basic query flow (DDL first)

```bash
# 1. List models to find the one you need
cargo-ai storage model list
# → Find model by name (e.g. "Companies"), extract uuid

# 2. Get DDL — this gives you the exact table name and all columns
cargo-ai storage model get-ddl <model-uuid>
```

DDL response:

```json
{
  "ddl": "CREATE TABLE `project.datasets_default.models_companies` (\n  `_id` STRING,\n  `name` STRING,\n  `domain` STRING,\n  `employee_count` INT64\n);",
  "language": "bigquery"
}
```

Use `datasets_default.models_companies` as the table name.

```bash
# 3. Query using the table name from DDL
cargo-ai system-of-record client query \
  "SELECT name, domain, employee_count FROM datasets_default.models_companies LIMIT 10"
```

Success response:

```json
{
  "outcome": "queried",
  "rows": [
    { "name": "Acme Corp", "domain": "acme.com", "employee_count": 500 },
    { "name": "Globex", "domain": "globex.com", "employee_count": 1200 }
  ]
}
```

Always check `outcome` first — `"notQueried"` means an error occurred (see the error handling section below).

## Query with WHERE clauses

```bash
# Get DDL first
cargo-ai storage model get-ddl <model-uuid>

# Filter by a column
cargo-ai system-of-record client query \
  "SELECT name, domain FROM datasets_default.models_companies WHERE employee_count > 100"

# Multiple conditions
cargo-ai system-of-record client query \
  "SELECT name, domain, revenue FROM datasets_default.models_companies WHERE employee_count > 100 AND country = 'US'"

# LIKE for partial matches
cargo-ai system-of-record client query \
  "SELECT name, domain FROM datasets_default.models_companies WHERE name LIKE '%tech%'"

# NULL checks
cargo-ai system-of-record client query \
  "SELECT name, domain FROM datasets_default.models_companies WHERE email IS NOT NULL"
```

## Aggregation queries

```bash
# Count records
cargo-ai system-of-record client query \
  "SELECT COUNT(*) as total FROM datasets_default.models_companies"

# Group by with counts
cargo-ai system-of-record client query \
  "SELECT country, COUNT(*) as count FROM datasets_default.models_companies GROUP BY country ORDER BY count DESC"

# Sum and average
cargo-ai system-of-record client query \
  "SELECT country, SUM(revenue) as total_revenue, AVG(employee_count) as avg_employees FROM datasets_default.models_companies GROUP BY country"
```

## Pagination with fetch

For large result sets, use `fetch` with `--limit` and `--offset`.

```bash
# First page
cargo-ai system-of-record client fetch \
  --query "SELECT * FROM datasets_default.models_companies ORDER BY name" \
  --limit 100 --offset 0

# Second page
cargo-ai system-of-record client fetch \
  --query "SELECT * FROM datasets_default.models_companies ORDER BY name" \
  --limit 100 --offset 100
```

## Download full results

For exporting to a file.

```bash
cargo-ai system-of-record client download \
  --query "SELECT name, domain, employee_count, revenue FROM datasets_default.models_companies ORDER BY revenue DESC"
```

## Query across multiple models

Get the DDL for each model, then join.

```bash
# 1. Get DDL for both models
cargo-ai storage model get-ddl <companies-model-uuid>
cargo-ai storage model get-ddl <deals-model-uuid>

# 2. Join query
cargo-ai system-of-record client query \
  "SELECT c.name, c.domain, d.stage, d.amount FROM datasets_default.models_companies c JOIN datasets_default.models_deals d ON c._id = d.company_id WHERE d.amount > 10000"
```

## Get SoR documentation

Useful to understand available tables and conventions before querying.

```bash
# List all systems of record
cargo-ai system-of-record sor list

# Get documentation for a specific SoR (returns plain text, not JSON)
cargo-ai system-of-record client get-documentation <slug>
```

## Date queries

```bash
# Records created in the last 30 days
cargo-ai system-of-record client query \
  "SELECT name, created_at FROM datasets_default.models_companies WHERE created_at >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)"

# Records in a specific range
cargo-ai system-of-record client query \
  "SELECT name, created_at FROM datasets_default.models_companies WHERE created_at BETWEEN '2025-01-01' AND '2025-03-31'"
```

## Subqueries

```bash
# Companies with above-average employee count
cargo-ai system-of-record client query \
  "SELECT name, employee_count FROM datasets_default.models_companies WHERE employee_count > (SELECT AVG(employee_count) FROM datasets_default.models_companies)"
```

## Error handling

If a query fails, the response has `outcome: "notQueried"`:

```json
{ "outcome": "notQueried", "errorMessage": "Table not found: datasets_default.models_nonexistent" }
```

Common causes:
- Wrong table name → re-check DDL output
- Syntax error → check SQL syntax for your warehouse dialect (BigQuery vs Snowflake)
- Permission error → verify SoR connection is active
