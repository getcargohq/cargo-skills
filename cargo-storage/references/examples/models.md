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

## Get the DDL (for SQL queries)

Always get the DDL before writing system-of-record queries — it contains the exact table name.

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

Extract the table name from the `ddl` field: `datasets_default.models_companies`.

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
# 1. Find the model
cargo-ai storage model list

# 2. Get the full schema with column types
cargo-ai storage model get <model-uuid>

# 3. Get the exact table name for SQL
cargo-ai storage model get-ddl <model-uuid>

# 4. Now you can write a system-of-record query using the exact table name and column slugs
cargo-ai system-of-record client query \
  "SELECT uuid, name, domain FROM datasets_default.models_companies LIMIT 10"
```
