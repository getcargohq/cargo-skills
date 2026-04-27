# Run analytics examples

## Get metrics for a workflow

```bash
cargo-ai orchestration run get-metrics --workflow-uuid <uuid>
```

Response:

```json
{
  "runMetrics": [
    {
      "nodeUuid": "node-uuid-1",
      "totalExecutionsCount": 1000,
      "successExecutionsCount": 950,
      "errorExecutionsCount": 30,
      "cancelledExecutionsCount": 5,
      "creditsUsedCount": 450
    }
  ]
}
```

Error rate per node = `errorExecutionsCount / totalExecutionsCount`. High error rate on a specific node means that step is failing.

## Metrics scoped to a specific release

```bash
cargo-ai orchestration run get-metrics \
  --workflow-uuid <uuid> \
  --release-uuid <release-uuid>
```

## Metrics scoped to a specific batch

```bash
cargo-ai orchestration run get-metrics \
  --workflow-uuid <uuid> \
  --batch-uuid <batch-uuid>
```

## Metrics for a date range

```bash
cargo-ai orchestration run get-metrics \
  --workflow-uuid <uuid> \
  --created-after 2025-01-01 \
  --created-before 2025-01-31
```

## Count errors

```bash
# Total error count
cargo-ai orchestration run count \
  --workflow-uuid <uuid> \
  --statuses error
```

Response:

```json
{ "count": 42 }
```

```bash
# Errors in a specific period
cargo-ai orchestration run count \
  --workflow-uuid <uuid> \
  --statuses error \
  --created-after 2025-01-15 \
  --created-before 2025-01-16

# Errors in a specific batch
cargo-ai orchestration run count \
  --workflow-uuid <uuid> \
  --statuses error \
  --batch-uuid <batch-uuid>
```

## Count finished runs

```bash
cargo-ai orchestration run count \
  --workflow-uuid <uuid> \
  --is-finished

# In a date range
cargo-ai orchestration run count \
  --workflow-uuid <uuid> \
  --is-finished \
  --created-after 2025-01-01 \
  --created-before 2025-01-31
```

## Count successful runs

```bash
cargo-ai orchestration run count \
  --workflow-uuid <uuid> \
  --statuses success
```

## Per-workflow cost analysis (full flow)

```bash
# 1. List workflows
cargo-ai orchestration workflow list

# 2. Get usage grouped by workflow
cargo-ai billing usage get-metrics \
  --from 2025-01-01 --to 2025-01-31 \
  --group-by workflow_uuid

# 3. Drill into a specific workflow
cargo-ai billing usage get-metrics \
  --from 2025-01-01 --to 2025-01-31 \
  --workflow-uuid <uuid>

# 4. Get run-level metrics
cargo-ai orchestration run get-metrics \
  --workflow-uuid <uuid> \
  --created-after 2025-01-01 \
  --created-before 2025-01-31
```

## Error monitoring and debugging (full flow)

```bash
# 1. Count errors
cargo-ai orchestration run count \
  --workflow-uuid <uuid> \
  --statuses error

# 2. Spot-check: count errors in the last 24 hours
cargo-ai orchestration run count \
  --workflow-uuid <uuid> \
  --statuses error \
  --created-after 2025-01-15 \
  --created-before 2025-01-16

# 3. Download error runs for inspection
cargo-ai orchestration run download \
  --workflow-uuid <uuid> \
  --statuses error \
  --created-after 2025-01-15

# 4. Check per-node error rates
cargo-ai orchestration run get-metrics \
  --workflow-uuid <uuid>
# → Compare errorExecutionsCount vs totalExecutionsCount per node
# → High error rate on a specific node = that step is failing
```

## List runs with filters

```bash
# All runs for a workflow (paginated)
cargo-ai orchestration run list \
  --workflow-uuid <uuid> \
  --limit 20

# Only error runs
cargo-ai orchestration run list \
  --workflow-uuid <uuid> \
  --statuses error \
  --limit 10

# Runs from a specific batch
cargo-ai orchestration run list \
  --workflow-uuid <uuid> \
  --batch-uuid <batch-uuid>

# Runs for a specific record
cargo-ai orchestration run list \
  --workflow-uuid <uuid> \
  --record-id <record-id>
```
