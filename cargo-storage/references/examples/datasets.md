# Dataset examples

## List all datasets

Datasets group related models together.

```bash
cargo-ai storage dataset list
```

Response includes `uuid`, `name`, and `slug` for each dataset.

## Get a specific dataset

```bash
cargo-ai storage dataset get <dataset-uuid>
```

## List models in a dataset

```bash
cargo-ai storage model list --dataset-uuid <dataset-uuid>
```

## Discover workspace data structure

Full flow to understand how data is organized:

```bash
# 1. List all datasets
cargo-ai storage dataset list
# → Note the dataset UUIDs and slugs

# 2. For each dataset, list its models
cargo-ai storage model list --dataset-uuid <dataset-uuid>
# → See which models (tables) belong to each dataset

# 3. Inspect a model's columns
cargo-ai storage model get <model-uuid>
# → See column slugs and types for each model
```

The dataset `slug` appears in DDL table names (e.g. `datasets_default` for the dataset with slug `default`).
