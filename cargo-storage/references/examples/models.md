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
