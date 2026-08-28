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

`storage model list` takes **no options** — it always returns every model in the
workspace. Each one carries a `datasetUuid`, so narrow it client-side:

```bash
cargo-ai storage model list | jq '[.models[] | select(.datasetUuid == "<dataset-uuid>")]'
```

## Discover workspace data structure

Full flow to understand how data is organized:

```bash
# 1. List all datasets
cargo-ai storage dataset list
# → Note the dataset UUIDs and slugs

# 2. Group the models by dataset (one call — `model list` has no filter flag)
cargo-ai storage model list | jq 'group_by(.datasetUuid) | map({datasetUuid: .[0].datasetUuid, models: map(.slug)})'
# → See which models (tables) belong to each dataset

# 3. Inspect a model's columns
cargo-ai storage model get <model-uuid>
# → See column slugs and types for each model
```

The dataset `slug` appears in DDL table names (e.g. `datasets_default` for the dataset with slug `default`).
