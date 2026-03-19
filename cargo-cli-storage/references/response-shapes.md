# Response shapes

JSON response structures returned by Cargo CLI commands used in the `cargo-cli-storage` skill.

## cargo-ai storage model list

```json
{
  "models": [
    {
      "uuid": "model-uuid",
      "workspaceUuid": "...",
      "slug": "companies",
      "name": "Companies",
      "datasetUuid": "dataset-uuid",
      "extractorSlug": "hubspot_companies",
      "idColumnSlug": "uuid",
      "titleColumnSlug": "name",
      "timeColumnSlug": null,
      "columns": [
        { "slug": "name", "type": "string", "label": "Name", "kind": "original", "originalSlug": "name" },
        { "slug": "domain", "type": "string", "label": "Domain", "kind": "original", "originalSlug": "domain" }
      ],
      "additionalColumns": [
        { "slug": "full_name", "type": "string", "label": "Full Name", "kind": "computed", "expression": { "kind": "jsExpression", "expression": "..." }, "columnsUsed": ["first_name", "last_name"] },
        { "slug": "total_deals", "type": "number", "label": "Total Deals", "kind": "metric", "relationshipUuid": "...", "aggregation": { "function": "count", "columnSlug": "uuid" } }
      ],
      "playsCount": 2,
      "segmentsCount": 1,
      "isPaused": false,
      "lastRun": {
        "uuid": "run-uuid",
        "status": "success",
        "errorMessage": null,
        "createdAt": "2025-01-15T00:00:00Z",
        "finishedAt": "2025-01-15T00:01:00Z"
      },
      "createdAt": "2025-01-01T00:00:00Z",
      "updatedAt": "2025-01-15T00:00:00Z"
    }
  ]
}
```

**Key fields:** `uuid`, `slug`, `name`, `datasetUuid`, `idColumnSlug`, `columns` (original columns), `additionalColumns` (custom/computed/metric/lookup columns).

Columns have no `uuid` — they are identified by `slug` within the model.

## cargo-ai storage model get

Same structure as a single item from `model list`, nested under `model`:

```json
{
  "model": {
    "uuid": "model-uuid",
    "slug": "companies",
    "name": "Companies",
    "datasetUuid": "dataset-uuid",
    "columns": [...],
    "additionalColumns": [...]
  }
}
```

## cargo-ai storage model get-ddl

```json
{
  "ddl": "CREATE TABLE `datasets_default.models_companies` (\n  `uuid` STRING,\n  `name` STRING,\n  `domain` STRING,\n  `employee_count` INT64,\n  `created_at` TIMESTAMP\n)",
  "language": "bigquery"
}
```

**Key fields:** `ddl` (contains the exact table name and column names), `language` (SQL dialect).

Always extract the table name from `ddl` before writing system-of-record queries. The table name pattern is typically `datasets_<dataset-slug>.models_<model-slug>`.

## cargo-ai storage dataset list

```json
{
  "datasets": [
    {
      "uuid": "dataset-uuid",
      "slug": "default",
      "workspaceUuid": "...",
      "config": { "kind": "object" },
      "createdAt": "2025-01-01T00:00:00Z"
    }
  ]
}
```

## cargo-ai storage dataset get

```json
{
  "dataset": {
    "uuid": "dataset-uuid",
    "slug": "default",
    "workspaceUuid": "...",
    "config": { "kind": "object" }
  }
}
```

## cargo-ai storage column list

Returns the model's columns (both original and additional). All columns share base fields: `slug`, `type`, `label`, `kind`. Columns have no `uuid` — use `slug` to identify them.

```json
{
  "columns": [
    {
      "slug": "name",
      "type": "string",
      "label": "Name",
      "kind": "original",
      "originalSlug": "name"
    },
    {
      "slug": "full_name",
      "type": "string",
      "label": "Full Name",
      "kind": "computed",
      "expression": { "kind": "jsExpression", "expression": "..." },
      "columnsUsed": ["first_name", "last_name"]
    }
  ]
}
```

Kind-specific fields are included alongside the base fields:

**`computed`**
```json
{
  "kind": "computed",
  "expression": { "kind": "jsExpression", "value": "record.first_name + \" \" + record.last_name" },
  "columnsUsed": ["first_name", "last_name"]
}
```

**`metric`**
```json
{
  "kind": "metric",
  "relationshipUuid": "relationship-uuid",
  "aggregation": {
    "function": "count",
    "columnSlug": "uuid"
  },
  "filter": null
}
```

**`lookup`**
```json
{
  "kind": "lookup",
  "join": {
    "toModelUuid": "company-model-uuid",
    "fromColumnSlug": "company_uuid",
    "toColumnSlug": "uuid"
  },
  "extractColumnSlug": "name",
  "filter": null
}
```

## cargo-ai storage relationship list

```json
{
  "relationships": [
    {
      "uuid": "relationship-uuid",
      "fromModelUuid": "contacts-model-uuid",
      "toModelUuid": "companies-model-uuid",
      "fromColumnSlug": "company_uuid",
      "toColumnSlug": "uuid",
      "relation": "manyToOne"
    }
  ]
}
```

## cargo-ai storage record list

```json
{
  "records": [
    {
      "uuid": "record-uuid",
      "name": "Acme Corp",
      "domain": "acme.com",
      "employee_count": 500
    }
  ]
}
```
