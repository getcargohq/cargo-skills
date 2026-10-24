# Model examples

## Discover all models

```bash
cargo-ai storage model list
```

Response includes `uuid`, `name`, `slug`, `datasetUuid`, and `columns[]` for each model.

## Find a model by name

```bash
# List all models and filter by name in the output
cargo-ai storage model list
# → Find the entry where "name" matches what you're looking for, then extract "uuid"
```

## Get a model's full schema

```bash
cargo-ai storage model get <model-uuid>
# → Returns the model with all columns, their types and slugs
```

## Get the DDL (column types and SQL dialect)

`storage query execute` accepts `<datasetSlug>.<modelSlug>` (e.g. `default.companies`) as the table name, so you don't need the DDL just for the table name. Run `model get-ddl` when you need column types or the SQL dialect.

```bash
cargo-ai storage model get-ddl <model-uuid>
```

Example response:
```json
{
  "ddl": "CREATE TABLE `datasets_default.models_companies` (\n  `uuid` STRING,\n  `name` STRING,\n  `domain` STRING,\n  `employee_count` INT64\n)",
  "language": "bigquery"
}
```

The `language` field tells you which SQL dialect to use.

## Create a model

```bash
# First, find the dataset UUID
cargo-ai storage dataset list

# Create the model
cargo-ai storage model create \
  --slug prospects \
  --name "Prospects" \
  --dataset-uuid <dataset-uuid> \
  --extractor-slug <extractor-slug> \
  --config '{}'
```

## Update a model

```bash
cargo-ai storage model update --uuid <model-uuid> --name "Qualified Prospects"
```

## Remove a model

```bash
cargo-ai storage model remove <model-uuid>
```

Note: This will fail if the model is referenced by segments, plays, or tools. Remove or update those resources first.

## Schema discovery workflow

Full flow to understand a model before querying it:

```bash
# 1. Find the model and its dataset slug
cargo-ai storage model list
cargo-ai storage dataset list

# 2. Get the full schema with column types (optional — also returns SQL dialect)
cargo-ai storage model get <model-uuid>
cargo-ai storage model get-ddl <model-uuid>

# 3. Query using <datasetSlug>.<modelSlug> as the table name
cargo-ai storage query execute \
  "SELECT uuid, name, domain FROM default.companies LIMIT 10"
```

## Connector models worth knowing

A few extractors whose behavior isn't obvious from their name. Find the dataset
with `storage dataset list` (the connector's own dataset), then `model create`
with the extractor slug.

- **`attio.fetchListRecords`** — the records that are members of one Attio list
  (`objectId` + `listId`; a list UUID or API slug works). Keyed on `record_id`;
  a record with several entries in the list is one row. Each sync **replaces** the
  snapshot, so records removed from the list leave the model. Minimum interval 30
  minutes. The matching write is the `attio.addToList` action, which upserts the
  entry (re-running never duplicates it; entry values overwrite).
- **`hubspot.fetchFormSubmissions`** — one model per HubSpot form (`formId`), one
  row per submission, with the form's fields as columns. HubSpot's endpoint can't
  filter, so the model's `filter` is applied on Cargo's side — and a play watching
  the model in real time pushes its own trigger condition down the same way, so
  only matching submissions reach the play.
- **`amplitude.fetchEvents`** — an optional `filter` (segmentation shape,
  `conjonction`) keeps only matching events. Amplitude still exports the full
  hour; the rest are dropped before they're written, so the filter saves rows,
  not export time. Dates compare as UTC instants (`2024-06-01` or
  `2024-06-01T12:00:00Z`).
