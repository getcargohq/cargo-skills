---
name: cargo-storage
description: Manage models, datasets, columns, and relationships using the Cargo CLI. Use when the user wants to inspect or modify data models, create or update columns, list datasets, set model relationships, or understand the schema of their Cargo workspace.
license: MIT
compatibility: Requires @cargo-ai/cli (npm) and a Cargo account (browser sign-in via --oauth, or an API token)
metadata:
  author: getcargo
  version: "1.0"
---

# Cargo CLI — Storage

Data layer management: inspecting and modifying models, datasets, columns, relationships, and records.

> See `references/response-shapes.md` for full JSON response structures.
> See `references/troubleshooting.md` for common errors and how to fix them.
> See `references/examples/models.md` for model CRUD, DDL inspection, and schema discovery examples.
> See `references/examples/datasets.md` for dataset listing and navigation examples.
> See `references/examples/columns.md` for column creation and management examples.

## Prerequisites

```bash
npm install -g @cargo-ai/cli
cargo-ai login --oauth                                  # browser sign-in (recommended)
# or: cargo-ai login --token <your-api-token>           # workspace-scoped API token (non-interactive)
# Pin a default workspace at login (with --oauth)
cargo-ai login --oauth --workspace-uuid <uuid>
```

Verify with `cargo-ai whoami`. All commands output JSON to stdout. Without a global install, prefix every command with `npx @cargo-ai/cli` instead of `cargo-ai`.

Failed commands exit non-zero and return `{"errorMessage": "..."}`.

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

**Querying:** Use `cargo-ai storage query execute "<sql>"` to query storage. Tables are referenced as `<datasetSlug>.<modelSlug>` (e.g. `default.companies`). Run `model get-ddl` for column types and SQL dialect when writing more involved queries. See the `cargo-orchestration` skill for query examples.

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

## Help

Every command supports `--help`:

```bash
cargo-ai storage model list --help
cargo-ai storage column create --help
cargo-ai storage relationship set --help
```
