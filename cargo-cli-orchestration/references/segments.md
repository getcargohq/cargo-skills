# Segment data examples

**Remember:** `segment fetch` and `segment download` require `--model-uuid`, not `--segment-uuid`. Get the `modelUuid` from `segment list`.

**Remember:** filter JSON uses `conjonction` (not `conjunction`).

## Fetch all records (no filter)

```bash
# 1. Find the model UUID
cargo-ai segmentation segment list
# → Extract modelUuid from the segment you want

# 2. Fetch with empty filter
cargo-ai segmentation segment fetch \
  --model-uuid <model-uuid> \
  --filter '{"conjonction":"and","groups":[]}' \
  --fetching-limit 100 --fetching-offset 0
```

Response:

```json
{
  "records": [
    { "_id": "rec-1", "name": "Acme Corp", "domain": "acme.com", "employee_count": 500 },
    { "_id": "rec-2", "name": "Globex", "domain": "globex.com", "employee_count": 1200 }
  ],
  "count": 2,
  "columns": [
    { "slug": "_id", "type": "string", "label": "ID", "modelUuid": "model-uuid" },
    { "slug": "name", "type": "string", "label": "Company Name", "modelUuid": "model-uuid" }
  ]
}
```

## Fetch with pagination

```bash
# Page 1
cargo-ai segmentation segment fetch \
  --model-uuid <model-uuid> \
  --filter '{"conjonction":"and","groups":[]}' \
  --fetching-limit 50 --fetching-offset 0

# Page 2
cargo-ai segmentation segment fetch \
  --model-uuid <model-uuid> \
  --filter '{"conjonction":"and","groups":[]}' \
  --fetching-limit 50 --fetching-offset 50

# Page 3
cargo-ai segmentation segment fetch \
  --model-uuid <model-uuid> \
  --filter '{"conjonction":"and","groups":[]}' \
  --fetching-limit 50 --fetching-offset 100
```

## Fetch with sorting

```bash
# Sort by creation date (newest first)
cargo-ai segmentation segment fetch \
  --model-uuid <model-uuid> \
  --filter '{"conjonction":"and","groups":[]}' \
  --sort '[{"columnSlug":"created_at","kind":"desc"}]' \
  --fetching-limit 100

# Sort by employee count (highest first)
cargo-ai segmentation segment fetch \
  --model-uuid <model-uuid> \
  --filter '{"conjonction":"and","groups":[]}' \
  --sort '[{"columnSlug":"employee_count","kind":"desc"}]' \
  --fetching-limit 50
```

## Filter by string column

```bash
# Companies in the US
cargo-ai segmentation segment fetch \
  --model-uuid <model-uuid> \
  --filter '{
    "conjonction": "and",
    "groups": [{
      "conjonction": "and",
      "conditions": [
        {"kind": "string", "columnSlug": "country", "operator": "is", "values": ["US"]}
      ]
    }]
  }' \
  --fetching-limit 100

# Companies whose name contains "tech"
cargo-ai segmentation segment fetch \
  --model-uuid <model-uuid> \
  --filter '{
    "conjonction": "and",
    "groups": [{
      "conjonction": "and",
      "conditions": [
        {"kind": "string", "columnSlug": "name", "operator": "contains", "values": "tech"}
      ]
    }]
  }' \
  --fetching-limit 100
```

## Filter by number column

```bash
# Companies with 100+ employees
cargo-ai segmentation segment fetch \
  --model-uuid <model-uuid> \
  --filter '{
    "conjonction": "and",
    "groups": [{
      "conjonction": "and",
      "conditions": [
        {"kind": "number", "columnSlug": "employee_count", "operator": "greaterThan", "value": 100}
      ]
    }]
  }' \
  --fetching-limit 100

# Companies with 50–200 employees
cargo-ai segmentation segment fetch \
  --model-uuid <model-uuid> \
  --filter '{
    "conjonction": "and",
    "groups": [{
      "conjonction": "and",
      "conditions": [
        {"kind": "number", "columnSlug": "employee_count", "operator": "between", "firstValue": 50, "lastValue": 200}
      ]
    }]
  }' \
  --fetching-limit 100
```

## Filter by date column

```bash
# Created after a specific date
cargo-ai segmentation segment fetch \
  --model-uuid <model-uuid> \
  --filter '{
    "conjonction": "and",
    "groups": [{
      "conjonction": "and",
      "conditions": [
        {"kind": "date", "columnSlug": "created_at", "operator": "greaterThan", "value": "2025-01-01"}
      ]
    }]
  }' \
  --fetching-limit 100

# Created in a date range
cargo-ai segmentation segment fetch \
  --model-uuid <model-uuid> \
  --filter '{
    "conjonction": "and",
    "groups": [{
      "conjonction": "and",
      "conditions": [
        {"kind": "date", "columnSlug": "created_at", "operator": "between", "firstValue": "2025-01-01", "lastValue": "2025-03-31"}
      ]
    }]
  }' \
  --fetching-limit 100
```

## Filter by boolean column

```bash
# Only customers
cargo-ai segmentation segment fetch \
  --model-uuid <model-uuid> \
  --filter '{
    "conjonction": "and",
    "groups": [{
      "conjonction": "and",
      "conditions": [
        {"kind": "boolean", "columnSlug": "is_customer", "operator": "isTrue"}
      ]
    }]
  }' \
  --fetching-limit 100
```

## Combine multiple conditions (AND)

```bash
# US companies with 100+ employees, created after 2025-01-01
cargo-ai segmentation segment fetch \
  --model-uuid <model-uuid> \
  --filter '{
    "conjonction": "and",
    "groups": [{
      "conjonction": "and",
      "conditions": [
        {"kind": "string", "columnSlug": "country", "operator": "is", "values": ["US"]},
        {"kind": "number", "columnSlug": "employee_count", "operator": "greaterThan", "value": 100},
        {"kind": "date", "columnSlug": "created_at", "operator": "greaterThan", "value": "2025-01-01"}
      ]
    }]
  }' \
  --sort '[{"columnSlug":"employee_count","kind":"desc"}]' \
  --fetching-limit 50
```

## Sort by multiple columns

```bash
cargo-ai segmentation segment fetch \
  --model-uuid <model-uuid> \
  --filter '{"conjonction":"and","groups":[]}' \
  --sort '[{"columnSlug":"country","kind":"asc"},{"columnSlug":"employee_count","kind":"desc"}]' \
  --fetching-limit 100
```

## OR logic across groups

```bash
# Companies in the US OR companies with 500+ employees
cargo-ai segmentation segment fetch \
  --model-uuid <model-uuid> \
  --filter '{
    "conjonction": "or",
    "groups": [
      {
        "conjonction": "and",
        "conditions": [
          {"kind": "string", "columnSlug": "country", "operator": "is", "values": ["US"]}
        ]
      },
      {
        "conjonction": "and",
        "conditions": [
          {"kind": "number", "columnSlug": "employee_count", "operator": "greaterThan", "value": 500}
        ]
      }
    ]
  }' \
  --fetching-limit 100
```

## Filter for non-null values

```bash
# Only records with an email
cargo-ai segmentation segment fetch \
  --model-uuid <model-uuid> \
  --filter '{
    "conjonction": "and",
    "groups": [{
      "conjonction": "and",
      "conditions": [
        {"kind": "string", "columnSlug": "email", "operator": "isNotNull"}
      ]
    }]
  }' \
  --fetching-limit 100
```

## Filter records NOT enrolled in a workflow

Find records that have never been processed by a specific play or tool. First get the `workflowUuid` from `play list` or `tool list`.

```bash
# 1. Find the workflow UUID from the play
cargo-ai orchestration play list
# → Extract play.workflowUuid

# 2. Fetch records that have never entered this workflow
cargo-ai segmentation segment fetch \
  --model-uuid <model-uuid> \
  --filter '{
    "conjonction": "and",
    "groups": [{
      "conjonction": "and",
      "conditions": [
        {
          "kind": "enrollment",
          "workflowUuid": "<workflow-uuid>",
          "activityKind": "workflowEntered",
          "frequency": {"operator": "not"},
          "period": {"operator": "moreThan", "value": 0, "unit": "day"}
        }
      ]
    }]
  }' \
  --fetching-limit 100
```

## Filter records enrolled in a workflow in the last 30 days

```bash
cargo-ai segmentation segment fetch \
  --model-uuid <model-uuid> \
  --filter '{
    "conjonction": "and",
    "groups": [{
      "conjonction": "and",
      "conditions": [
        {
          "kind": "enrollment",
          "workflowUuid": "<workflow-uuid>",
          "activityKind": "workflowEntered",
          "frequency": {"operator": "moreThan", "value": 0},
          "period": {"operator": "lessThan", "value": 30, "unit": "day"}
        }
      ]
    }]
  }' \
  --fetching-limit 100
```

## Combine enrollment with other conditions

US companies not yet enrolled in the enrichment workflow:

```bash
cargo-ai segmentation segment fetch \
  --model-uuid <model-uuid> \
  --filter '{
    "conjonction": "and",
    "groups": [{
      "conjonction": "and",
      "conditions": [
        {"kind": "string", "columnSlug": "country", "operator": "is", "values": ["US"]},
        {
          "kind": "enrollment",
          "workflowUuid": "<workflow-uuid>",
          "activityKind": "workflowEntered",
          "frequency": {"operator": "not"},
          "period": {"operator": "moreThan", "value": 0, "unit": "day"}
        }
      ]
    }]
  }' \
  --fetching-limit 100
```

## Fetch with enrichment and sync

Enrichment triggers any connected enrichment tools on the records. Sync writes the results back to the model.

```bash
cargo-ai segmentation segment fetch \
  --model-uuid <model-uuid> \
  --filter '{"conjonction":"and","groups":[]}' \
  --fetching-limit 50 \
  --enrich --sync
```

## Discover column slugs before filtering

```bash
# List models to see all columns with their slugs and types
cargo-ai storage model list
# → models[].columns[].slug — use these in filter conditions
# → models[].columns[].type — use to pick the right condition kind:
#     "string" → kind "string"
#     "number" → kind "number"
#     "date" → kind "date"
#     "boolean" → kind "boolean"
#     "object" → kind "object"
#     "array" → kind "array"
```
