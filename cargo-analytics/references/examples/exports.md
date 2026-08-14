# Data export examples

## Download all finished runs

```bash
cargo-ai orchestration run download \
  --workflow-uuid <uuid> \
  --is-finished
```

## Download runs by status

```bash
# Only successful runs
cargo-ai orchestration run download \
  --workflow-uuid <uuid> \
  --statuses success

# Both success and error (for analysis)
cargo-ai orchestration run download \
  --workflow-uuid <uuid> \
  --statuses success,error

# Only error runs (for debugging)
cargo-ai orchestration run download \
  --workflow-uuid <uuid> \
  --statuses error
```

## Download runs in a date range

```bash
cargo-ai orchestration run download \
  --workflow-uuid <uuid> \
  --created-after 2025-01-01 \
  --created-before 2025-01-31
```

## Download runs from a specific batch

```bash
cargo-ai orchestration run download \
  --workflow-uuid <uuid> \
  --batch-uuid <batch-uuid>
```

## Download batch output by node

```bash
# 1. Get the batch and its release UUID
cargo-ai orchestration batch get <batch-uuid>
# → Extract releaseUuid

# 2. Find the output node slug
cargo-ai orchestration release get <release-uuid>
# → Read nodes[].slug — pick the output node's slug

# 3. Download
cargo-ai orchestration batch download \
  --uuid <batch-uuid> \
  --output-node-slug <node-slug>
```

## Export all segment data

```bash
# 1. List segments to find the modelUuid
cargo-ai segmentation segment list
# → Extract modelUuid (NOT segment uuid)

# 2. Full export
cargo-ai segmentation segment download \
  --model-uuid <model-uuid> \
  --filter '{"conjonction":"and","groups":[]}'
```

## Export segment data with sorting and limit

```bash
cargo-ai segmentation segment download \
  --model-uuid <model-uuid> \
  --filter '{"conjonction":"and","groups":[]}' \
  --sort '[{"columnSlug":"created_at","kind":"desc"}]' \
  --limit 5000
```

## Export filtered segment data

```bash
# Export only churned accounts
cargo-ai segmentation segment download \
  --model-uuid <model-uuid> \
  --filter '{
    "conjonction": "and",
    "groups": [{
      "conjonction": "and",
      "conditions": [
        {"kind": "string", "columnSlug": "status", "operator": "is", "values": ["churned"]}
      ]
    }]
  }'

# Export US companies with 100+ employees
cargo-ai segmentation segment download \
  --model-uuid <model-uuid> \
  --filter '{
    "conjonction": "and",
    "groups": [{
      "conjonction": "and",
      "conditions": [
        {"kind": "string", "columnSlug": "country", "operator": "is", "values": ["US"]},
        {"kind": "number", "columnSlug": "employee_count", "operator": "greaterThan", "value": 100}
      ]
    }]
  }'

# Export records created after a date
cargo-ai segmentation segment download \
  --model-uuid <model-uuid> \
  --filter '{
    "conjonction": "and",
    "groups": [{
      "conjonction": "and",
      "conditions": [
        {"kind": "date", "columnSlug": "created_at", "operator": "greaterThan", "value": "2025-01-01"}
      ]
    }]
  }'
```

## Export a segment with non-null email

```bash
cargo-ai segmentation segment download \
  --model-uuid <model-uuid> \
  --filter '{
    "conjonction": "and",
    "groups": [{
      "conjonction": "and",
      "conditions": [
        {"kind": "string", "columnSlug": "email", "operator": "isNotNull"}
      ]
    }]
  }'
```
