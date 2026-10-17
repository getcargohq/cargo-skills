# Response shapes

JSON response structures returned by Cargo CLI commands used in the `cargo-storage` skill.

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
        { "slug": "total_deals", "type": "number", "label": "Total Deals", "kind": "metric", "relationshipUuid": "...", "aggregation": { "function": "COUNT", "columnSlug": "uuid" } }
      ],
      "unification": null,
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

`unification` is `null` unless the model unifies. When set it is either
`{"source":"integration"}` or the `custom` shape (`type`, `uniqueColumns`,
optionally `selectedColumnSlugs` / `timeColumnSlug` / `parent` / `filter`) —
see the Unification section of `SKILL.md`.

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

**Key fields:** `ddl` (contains the storage-native table name and column names), `language` (SQL dialect).

For `cargo-ai storage query execute`, reference tables as `<datasetSlug>.<modelSlug>` (e.g. `default.companies`).

## cargo-ai storage dataset list

```json
{
  "datasets": [
    {
      "uuid": "dataset-uuid",
      "slug": "default",
      "workspaceUuid": "...",
      "kind": "native",
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
    "kind": "connector",
    "connectorUuid": "connector-uuid"
  }
}
```

## cargo-ai storage column list

Returns an array of **strings**, not column objects: each column's storage name. Original columns keep their slug; added columns are prefixed by kind (`custom__`, `computed__`, `metric__`, `lookup__`). That prefixed name is what `storage query execute` SQL reads.

```json
{
  "columns": ["name", "domain", "computed__full_name", "custom__website_url"]
}
```

For the column objects (`slug`, `type`, `label`, `kind`), read `storage model get <uuid>` → `model.columns` (original) and `model.additionalColumns`. Columns have no `uuid`: use `slug` to identify them.

Kind-specific fields on `additionalColumns` entries, alongside the base fields:

**`computed`**
```json
{
  "kind": "computed",
  "expression": { "kind": "jsExpression", "expression": "record.first_name + \" \" + record.last_name", "instructTo": "none", "fromRecipe": false },
  "columnsUsed": ["first_name", "last_name"]
}
```

**`metric`**
```json
{
  "kind": "metric",
  "relationshipUuid": "relationship-uuid",
  "aggregation": {
    "function": "COUNT",
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
      "workspaceUuid": "workspace-uuid",
      "fromDatasetUuid": "dataset-uuid",
      "fromModelUuid": "contacts-model-uuid",
      "fromColumnSlug": "account_id",
      "fromPropertySlug": "hubspot___contacts[0]",
      "toDatasetUuid": "dataset-uuid",
      "toModelUuid": "companies-model-uuid",
      "toColumnSlug": "id",
      "relation": "manyToOne"
    }
  ]
}
```

Workspace-wide — the command takes no flags. `fromDatasetUuid` always equals
`toDatasetUuid`. `fromPropertySlug` / `toPropertySlug` are `null` unless the
relationship keys off a nested property of a connector column, and every entry
also carries `fromSelectedColumnSlugs` / `toSelectedColumnSlugs` (`null` when
not limited).

`relationship set` returns the same shape, holding the dataset's full set after
the replace.

## cargo-ai storage record list

```json
{
  "isRefreshing": false,
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

## cargo-ai storage query execute

Tables are referenced as `<datasetSlug>.<modelSlug>` and rewritten to the underlying storage table under the hood.

**Success:**

```json
{
  "isRefreshing": false,
  "rows": [
    { "name": "Acme Corp", "domain": "acme.com", "employee_count": 500 },
    { "name": "Globex", "domain": "globex.com", "employee_count": 1200 }
  ]
}
```

**Failure (non-zero exit):**

```json
{ "errorMessage": "Table not found: default.nonexistent" }
```

```json
{ "reason": "clientNotFound" }
```

```json
{ "reason": "unknown" }
```

## cargo-ai storage query download

Used for full exports. Same table-naming convention as `storage query execute` (`<datasetSlug>.<modelSlug>`). Pass the SQL via `--query`; the response is an array of signed URLs (the result can span several files).

**Success:**

```json
{
  "isRefreshing": false,
  "urls": ["https://signed-url-to-csv-or-parquet-file"]
}
```

`isRefreshing: true` (here and on `query execute`) means a model refresh was still running, so very recent writes may be missing.

**Failure (non-zero exit):**

```json
{ "errorMessage": "Table not found: default.nonexistent" }
```
