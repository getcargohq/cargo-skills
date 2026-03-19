# Column examples

## List columns for a model

```bash
cargo-ai storage column list --model-uuid <uuid>
```

Response includes `uuid`, `slug`, `type`, `label`, and `position` for each column.

## Create a string column

```bash
cargo-ai storage column create \
  --model-uuid <uuid> \
  --column '{"slug":"website_url","type":"string","label":"Website URL","kind":"custom"}'
```

## Create a number column

```bash
cargo-ai storage column create \
  --model-uuid <uuid> \
  --column '{"slug":"arr","type":"number","label":"Annual Recurring Revenue","kind":"custom"}'
```

## Create a date column

```bash
cargo-ai storage column create \
  --model-uuid <uuid> \
  --column '{"slug":"last_contacted_at","type":"date","label":"Last Contacted At","kind":"custom"}'
```

## Create a boolean column

```bash
cargo-ai storage column create \
  --model-uuid <uuid> \
  --column '{"slug":"is_customer","type":"boolean","label":"Is Customer","kind":"custom"}'
```

## Create a computed column

Computed columns derive their value from an expression over other columns.

```bash
cargo-ai storage column create \
  --model-uuid <uuid> \
  --column '{"slug":"full_name","type":"string","label":"Full Name","kind":"computed","expression":{"kind":"jsExpression","expression":"{{record.first_name}} {{record.last_name}}","instructTo":"none","fromRecipe":false},"columnsUsed":["first_name","last_name"]}'
```

`columnsUsed` is optional but recommended for dependency tracking.

## Create a metric column

Metric columns aggregate data from a related model via a relationship.

```bash
cargo-ai storage column create \
  --model-uuid <uuid> \
  --column '{"slug":"total_deals","type":"number","label":"Total Deals","kind":"metric","relationshipUuid":"<relationship-uuid>","aggregation":{"function":"count","columnSlug":"uuid"}}'
```

With an optional filter:

```bash
cargo-ai storage column create \
  --model-uuid <uuid> \
  --column '{"slug":"open_deals","type":"number","label":"Open Deals","kind":"metric","relationshipUuid":"<relationship-uuid>","aggregation":{"function":"count","columnSlug":"uuid"},"filter":{"conjonction":"and","groups":[{"conjonction":"and","conditions":[{"kind":"string","slug":"status","operator":"is","value":"open"}]}]}}'
```

## Create a lookup column

Lookup columns pull a field value from a related model via a join.

```bash
cargo-ai storage column create \
  --model-uuid <uuid> \
  --column '{"slug":"company_name","type":"string","label":"Company Name","kind":"lookup","join":{"toModelUuid":"<company-model-uuid>","fromColumnSlug":"company_uuid","toColumnSlug":"uuid"},"extractColumnSlug":"name"}'
```

With an optional filter:

```bash
cargo-ai storage column create \
  --model-uuid <uuid> \
  --column '{"slug":"primary_contact_email","type":"string","label":"Primary Contact Email","kind":"lookup","join":{"toModelUuid":"<contacts-model-uuid>","fromColumnSlug":"uuid","toColumnSlug":"company_uuid"},"extractColumnSlug":"email","filter":{"conjonction":"and","groups":[{"conjonction":"and","conditions":[{"kind":"boolean","slug":"is_primary","operator":"isTrue"}]}]}}'
```

## Update a column

Pass the full column object via `--column`. Columns are identified by `slug` (no UUID).

```bash
cargo-ai storage column update \
  --model-uuid <uuid> \
  --column '{"slug":"website_url","type":"string","label":"Website","kind":"custom"}'
```

## Remove a column

```bash
cargo-ai storage column remove --model-uuid <uuid> --column-slug website_url
```

## Reorder a column

Move a column to a specific position index (0-based).

```bash
cargo-ai storage column reorder --model-uuid <uuid> --column-slug website_url --to-index 2
```

## Column types reference

| Type      | Use for                  |
| --------- | ------------------------ |
| `string`  | Text, names, URLs, slugs |
| `number`  | Counts, amounts, scores  |
| `boolean` | Flags, yes/no values     |
| `date`    | Timestamps, dates        |
| `object`  | Nested JSON objects      |
| `array`   | Lists of values          |
| `vector`  | Embedding vectors        |
| `any`     | Untyped / mixed values   |

## Column kinds reference

| Kind       | Use for                                                     | Required extra fields                                                                                    |
| ---------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `custom`   | User-defined fields                                         | —                                                                                                        |
| `computed` | Values derived from an expression over other columns        | `expression`; optionally `columnsUsed`                                                                   |
| `metric`   | Aggregated values from a related model                      | `relationshipUuid`, `aggregation.function`, `aggregation.columnSlug`; optionally `filter`                |
| `lookup`   | A single field value pulled from a related model via a join | `join.toModelUuid`, `join.fromColumnSlug`, `join.toColumnSlug`, `extractColumnSlug`; optionally `filter` |

Column `slug` values are used in filter conditions (see `cargo-cli-orchestration` skill's `references/filter-syntax.md`) and in system-of-record SQL queries.
