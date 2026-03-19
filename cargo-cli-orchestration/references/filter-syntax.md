# Filter syntax

Complete reference for building segment filter conditions in the Cargo CLI.

> **CRITICAL — common silent failure:**
> Every filter object uses the key `conjonction` — **not** `conjunction`.
> This is intentional (French spelling). A typo here does **not** throw an error — it simply returns no records.
> Double-check this spelling every time you write a filter. Search for `conjunction` in your JSON before running.

## Structure

A filter has two levels of nesting: top-level groups joined by a conjunction, and each group contains conditions joined by their own conjunction.

```json
{
  "conjonction": "and",
  "groups": [
    {
      "conjonction": "and",
      "conditions": [
        { "kind": "string", "columnSlug": "domain", "operator": "contains", "values": "acme" }
      ]
    }
  ]
}
```

- Top-level `conjonction`: `"and"` or `"or"` — joins the groups
- Group-level `conjonction`: `"and"` or `"or"` — joins the conditions within a group
- Empty filter (all records): `{"conjonction":"and","groups":[]}`

## Condition kinds and operators

### string

```json
{ "kind": "string", "columnSlug": "name", "operator": "is", "values": ["Acme Corp"] }
{ "kind": "string", "columnSlug": "name", "operator": "isNot", "values": ["Test"] }
{ "kind": "string", "columnSlug": "name", "operator": "contains", "values": "acme" }
{ "kind": "string", "columnSlug": "name", "operator": "doesNotContain", "values": "test" }
{ "kind": "string", "columnSlug": "name", "operator": "startsWith", "values": "A" }
{ "kind": "string", "columnSlug": "name", "operator": "endsWith", "values": "Corp" }
{ "kind": "string", "columnSlug": "name", "operator": "isNull" }
{ "kind": "string", "columnSlug": "name", "operator": "isNotNull" }
{ "kind": "string", "columnSlug": "name", "operator": "isEmpty" }
{ "kind": "string", "columnSlug": "name", "operator": "isNotEmpty" }
```

Operators with values: `is`, `isNot`, `contains`, `doesNotContain`, `startsWith`, `endsWith`.
`values` can be a string or an array of strings.

Operators without values: `isNull`, `isNotNull`, `isEmpty`, `isNotEmpty`.

### number

```json
{ "kind": "number", "columnSlug": "employee_count", "operator": "is", "value": 500 }
{ "kind": "number", "columnSlug": "employee_count", "operator": "isNot", "value": 0 }
{ "kind": "number", "columnSlug": "employee_count", "operator": "greaterThan", "value": 100 }
{ "kind": "number", "columnSlug": "employee_count", "operator": "lowerThan", "value": 1000 }
{ "kind": "number", "columnSlug": "employee_count", "operator": "between", "firstValue": 100, "lastValue": 500 }
{ "kind": "number", "columnSlug": "employee_count", "operator": "isNull" }
{ "kind": "number", "columnSlug": "employee_count", "operator": "isNotNull" }
```

Note: single-value operators use `value` (not `values`). `between` uses `firstValue` and `lastValue`.

### date

```json
{ "kind": "date", "columnSlug": "created_at", "operator": "is", "value": "2025-01-15" }
{ "kind": "date", "columnSlug": "created_at", "operator": "isNot", "value": "2025-01-15" }
{ "kind": "date", "columnSlug": "created_at", "operator": "greaterThan", "value": "2025-01-01" }
{ "kind": "date", "columnSlug": "created_at", "operator": "lowerThan", "value": "2025-06-01" }
{ "kind": "date", "columnSlug": "created_at", "operator": "between", "firstValue": "2025-01-01", "lastValue": "2025-06-30" }
{ "kind": "date", "columnSlug": "created_at", "operator": "isNull" }
{ "kind": "date", "columnSlug": "created_at", "operator": "isNotNull" }
```

Same structure as `number` but `value`/`firstValue`/`lastValue` are ISO date strings.

### boolean

```json
{ "kind": "boolean", "columnSlug": "is_customer", "operator": "isTrue" }
{ "kind": "boolean", "columnSlug": "is_customer", "operator": "isFalse" }
{ "kind": "boolean", "columnSlug": "is_customer", "operator": "isNull" }
{ "kind": "boolean", "columnSlug": "is_customer", "operator": "isNotNull" }
```

### object / array

```json
{ "kind": "object", "columnSlug": "metadata", "operator": "isNull" }
{ "kind": "object", "columnSlug": "metadata", "operator": "isNotNull" }
{ "kind": "object", "columnSlug": "metadata", "operator": "matchConditions" }
```

For `matchConditions`, nest `objectProperty` conditions inside.

### objectProperty

Used to filter on nested properties within object or array columns:

```json
{
  "kind": "objectProperty",
  "columnSlug": "metadata",
  "propertyName": "industry",
  "operator": "is",
  "value": "SaaS"
}
```

Supports: `is`, `isNot`, `contains`, `doesNotContain`, `startsWith`, `endsWith`, `greaterThan`, `lowerThan`, `between`, `isNull`, `isNotNull`, `isEmpty`, `isNotEmpty`.

For `between`: use `value` and `otherValue`.

### segment

Filter records that belong (or don't belong) to another segment:

```json
{ "kind": "segment", "operator": "in", "segmentUuid": "other-segment-uuid" }
{ "kind": "segment", "operator": "notIn", "segmentUuid": "other-segment-uuid" }
```

### enrollment

Filter records based on whether they have been enrolled (or not) in a workflow. Useful to find records that have never been processed by a play/tool.

**Records NOT enrolled in a workflow (never entered):**

```json
{
  "kind": "enrollment",
  "workflowUuid": "<workflow-uuid>",
  "activityKind": "workflowEntered",
  "frequency": { "operator": "not" },
  "period": { "operator": "moreThan", "value": 0, "unit": "day" }
}
```

**Records enrolled more than 3 times:**

```json
{
  "kind": "enrollment",
  "workflowUuid": "<workflow-uuid>",
  "activityKind": "workflowEntered",
  "frequency": { "operator": "moreThan", "value": 3 },
  "period": { "operator": "moreThan", "value": 0, "unit": "day" }
}
```

**Records that left a workflow in the last 30 days:**

```json
{
  "kind": "enrollment",
  "workflowUuid": "<workflow-uuid>",
  "activityKind": "workflowLeft",
  "frequency": { "operator": "moreThan", "value": 0 },
  "period": { "operator": "lessThan", "value": 30, "unit": "day" }
}
```

**Records where a specific node was executed:**

```json
{
  "kind": "enrollment",
  "workflowUuid": "<workflow-uuid>",
  "activityKind": "workflowNodeExecuted",
  "nodeSlug": "enrich_company",
  "frequency": { "operator": "moreThan", "value": 0 },
  "period": { "operator": "moreThan", "value": 0, "unit": "day" }
}
```

`activityKind` values: `workflowEntered`, `workflowNodeExecuted`, `workflowLeft`.

`frequency.operator` values: `not` (never), `moreThan`, `lessThan`, `exactly`.

`period.operator` values: `moreThan`, `lessThan`, `exactly`. `unit` is always `"day"`.

`nodeSlug` is optional — only used with `workflowNodeExecuted`.

### occurrence

Filter records based on related model activity (e.g. a contact's company has certain events).

```json
{
  "kind": "occurrence",
  "relatedModelUuid": "<related-model-uuid>",
  "frequency": { "operator": "moreThan", "value": 0 },
  "period": { "operator": "lessThan", "value": 30, "unit": "day" },
  "conjonction": "and",
  "conditions": [
    { "kind": "string", "columnSlug": "event_type", "operator": "is", "values": ["meeting_booked"] }
  ]
}
```

Same `frequency` and `period` syntax as enrollment. The `conditions` array can contain any string/number/date/boolean conditions to filter the related model's records.

### sql

Raw SQL clause (advanced):

```json
{ "kind": "sql", "name": "custom_filter", "clause": "revenue > 1000000 AND country = 'US'" }
```

## Complete example

Filter for companies with 100+ employees whose name contains "tech", created after 2025-01-01:

```json
{
  "conjonction": "and",
  "groups": [
    {
      "conjonction": "and",
      "conditions": [
        { "kind": "number", "columnSlug": "employee_count", "operator": "greaterThan", "value": 100 },
        { "kind": "string", "columnSlug": "name", "operator": "contains", "values": "tech" },
        { "kind": "date", "columnSlug": "created_at", "operator": "greaterThan", "value": "2025-01-01" }
      ]
    }
  ]
}
```

## OR logic

Filter for companies in the US OR with 500+ employees:

```json
{
  "conjonction": "or",
  "groups": [
    {
      "conjonction": "and",
      "conditions": [
        { "kind": "string", "columnSlug": "country", "operator": "is", "values": ["US"] }
      ]
    },
    {
      "conjonction": "and",
      "conditions": [
        { "kind": "number", "columnSlug": "employee_count", "operator": "greaterThan", "value": 500 }
      ]
    }
  ]
}
```

## Sort syntax

Sort is an **array** of sort objects. Each object has `columnSlug` and `kind`.

```json
[{"columnSlug": "created_at", "kind": "desc"}]
```

- `columnSlug` — the column slug to sort by (from `model list` → `columns[].slug`)
- `kind` — `"asc"` (ascending) or `"desc"` (descending)

Multiple sort columns (first by country ascending, then by employee count descending):

```json
[{"columnSlug": "country", "kind": "asc"}, {"columnSlug": "employee_count", "kind": "desc"}]
```

Usage with `--sort`:

```bash
cargo-ai segmentation segment fetch \
  --model-uuid <uuid> \
  --filter '{"conjonction":"and","groups":[]}' \
  --sort '[{"columnSlug":"created_at","kind":"desc"}]' \
  --fetching-limit 100
```

## Tips

- Get available column slugs from `cargo-ai storage model list` → `columns[].slug`
- Use the column `type` to pick the right condition `kind` (string → string, number → number, etc.)
- An empty filter `{"conjonction":"and","groups":[]}` returns all records
- `relatedModelUuid` is optional on conditions — only needed for cross-model filters
