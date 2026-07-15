---
name: cargo-storage
description: Manage models, datasets, columns, and relationships and query workspace storage with SQL using the Cargo CLI. Use when the user wants to inspect or modify data models, create or update columns, list datasets, set model relationships, understand the schema, or run SQL against storage.
version: "1.1.1"
compatibility: Requires @cargo-ai/cli (npm) and a Cargo account (browser sign-in via --oauth, or an API token)
homepage: https://github.com/getcargohq/cargo-skills
metadata:
  author: getcargo
  openclaw:
    requires:
      bins:
        - cargo-ai
    install:
      - kind: node
        package: "@cargo-ai/cli@latest"
        bins:
          - cargo-ai
    homepage: https://github.com/getcargohq/cargo-skills
---

# Cargo CLI — Storage

Data layer management: inspecting and modifying models, datasets, columns, relationships, and records, and running SQL queries against workspace storage.

> See `references/response-shapes.md` for full JSON response structures.
> See `references/troubleshooting.md` for common errors and how to fix them.
> See `references/examples/models.md` for model CRUD, DDL inspection, and schema discovery examples.
> See `references/examples/datasets.md` for dataset listing and navigation examples.
> See `references/examples/columns.md` for column creation and management examples.
> See `references/examples/queries.md` for `storage query execute` / `storage query download` SQL examples (WHERE, aggregations, joins, pagination, exports).

## Prerequisites

See [`../cargo/references/prerequisites.md`](../cargo/references/prerequisites.md) for install, login (`--oauth` / `--token`), JSON output conventions, and error shapes. Verify the session with `cargo-ai whoami` before running any of the commands below.

## Discover resources first

Always list before inspecting or modifying.

```bash
cargo-ai storage dataset list              # all datasets (uuid, slug)
cargo-ai storage model list                # all models (uuid, name, slug, columns)
cargo-ai storage model list --dataset-uuid <uuid>   # models in a specific dataset
```

**Retrieve in the UI:** models live at `app.getcargo.io/workspaces/<WORKSPACE_UUID>/models/<MODEL_UUID>`. Get `<WORKSPACE_UUID>` from `cargo-ai whoami` under `workspace.uuid`.

## Quick reference

```bash
cargo-ai storage model list
cargo-ai storage model get <model-uuid>
cargo-ai storage model get-ddl <model-uuid>
cargo-ai storage dataset list
cargo-ai storage column list --model-uuid <uuid>
cargo-ai storage relationship list --model-uuid <uuid>
cargo-ai storage record list --model-uuid <uuid>
cargo-ai storage query execute "SELECT * FROM default.companies LIMIT 10"
cargo-ai storage query download --query "SELECT * FROM default.companies"
```

## Models

Models are structured tables in your workspace (e.g. Companies, Contacts).

```bash
# List all models
cargo-ai storage model list

# List models in a dataset
cargo-ai storage model list --dataset-uuid <uuid>

# Get a single model (includes columns)
cargo-ai storage model get <model-uuid>

# Get the DDL (full schema, table name and SQL dialect)
cargo-ai storage model get-ddl <model-uuid>
# → Useful for column discovery and SQL dialect (BigQuery vs Snowflake) before writing queries

# Create a model
cargo-ai storage model create \
  --slug contacts \
  --name "Contacts" \
  --dataset-uuid <uuid> \
  --extractor-slug <extractor-slug> \
  --config '{}'

# Update a model
cargo-ai storage model update --uuid <model-uuid> --name "New Name"

# Remove a model
cargo-ai storage model remove <model-uuid>
```

**Querying:** Use `cargo-ai storage query execute "<sql>"` (or `storage query download --query "<sql>"` for full exports) to run SQL against storage. Tables are referenced as `<datasetSlug>.<modelSlug>` (e.g. `default.companies`) and rewritten to the underlying storage table under the hood. See [Query with SQL](#query-with-sql) below.

## Datasets

Datasets are logical groupings of models.

```bash
# List all datasets
cargo-ai storage dataset list

# Get a single dataset
cargo-ai storage dataset get <dataset-uuid>
```

## Columns

Columns define the schema of a model.

```bash
# List columns for a model
cargo-ai storage column list --model-uuid <uuid>

# Create a column
cargo-ai storage column create \
  --model-uuid <uuid> \
  --column '{"slug":"my_column","type":"string","label":"My Column","kind":"custom"}'

# Update a column (pass the full column object — columns are identified by slug, not UUID)
cargo-ai storage column update \
  --model-uuid <uuid> \
  --column '{"slug":"my_column","type":"string","label":"Updated Label","kind":"custom"}'

# Remove a column
cargo-ai storage column remove --model-uuid <uuid> --column-slug <slug>

# Reorder a column (move to a specific index)
cargo-ai storage column reorder --model-uuid <uuid> --column-slug <slug> --to-index 2
```

Column types: `string`, `number`, `boolean`, `date`, `object`, `array`, `vector`, `any`.

Column kinds: `custom` (user-defined), `computed` (expression over other columns), `metric` (aggregated from a related model), `lookup` (single field pulled from a related model via a join).

## Preview what you built

A column list doesn't tell the user whether the model is right — rows do. Two checkpoints (the pack-wide convention lives in [`../cargo/references/interaction.md`](../cargo/references/interaction.md) §4):

**1. Right after `model create` / `column create` — show the schema, not rows.** A new model is empty; a `LIMIT 10` here returns nothing and reads as failure. Echo the columns as a compact table instead (column, type, what will fill it).

**2. As soon as data lands — show the rows.** After a batch, play, or import writes into the model, preview it:

```bash
cargo-ai storage query execute \
  "SELECT * FROM <dataset-slug>.<model-slug> LIMIT 10"
```

Show ~10 rows and only the columns that carry meaning. Storage queries are free, so this costs nothing but a few lines of output — and it's the first moment the user can actually see what they built. When a play fills a *new* column, preview that column next to the record's identifying fields (`name`, `domain`) so filled vs. empty is obvious.

If the preview comes back empty or all-null when it shouldn't, that's a finding — surface it rather than reporting the write as a success. See [`cargo-diagnostics`](../cargo-diagnostics/SKILL.md) to trace why.

## Relationships

Relationships link models together (e.g. Contacts belong to Companies).

```bash
# List relationships for a model
cargo-ai storage relationship list --model-uuid <uuid>

# Set a relationship between two models
cargo-ai storage relationship set \
  --from-model-uuid <uuid> \
  --to-model-uuid <uuid>
```

## Records

```bash
# List records in a model
cargo-ai storage record list --model-uuid <uuid>
```

For advanced record queries (filtering, sorting, pagination), use `segmentation segment fetch` from the `cargo-orchestration` skill.

## Query with SQL

Run SQL against workspace storage with `storage query execute`. Tables are referenced as `<datasetSlug>.<modelSlug>` (e.g. `default.companies`) and rewritten to the underlying storage table under the hood — no DDL lookup is needed for the table name.

```bash
cargo-ai storage query execute \
  "SELECT name, domain FROM default.companies LIMIT 10"
# → { "rows": [...] } on success; non-zero exit with { "errorMessage": "..." } on error
```

For full exports, use `storage query download` — it returns a signed URL to a CSV (default) or Parquet file:

```bash
cargo-ai storage query download \
  --query "SELECT name, domain, revenue FROM default.companies ORDER BY revenue DESC"

cargo-ai storage query download \
  --query "SELECT * FROM default.companies" --format parquet
```

Get column slugs from `storage column list --model-uuid <uuid>` (or run `storage model get-ddl <model-uuid>` for the full schema and SQL dialect). Page through large result sets with `LIMIT` / `OFFSET` directly in the SQL.

See `references/examples/queries.md` for WHERE clauses, aggregations, joins, date queries, pagination, and the failure shapes returned on error.

## Help

Every command supports `--help`:

```bash
cargo-ai storage model list --help
cargo-ai storage column create --help
cargo-ai storage relationship set --help
cargo-ai storage query execute --help
cargo-ai storage query download --help
```
