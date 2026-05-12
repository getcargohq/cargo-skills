# Troubleshooting

Common errors and recovery steps for `cargo-storage` commands.

## General

| Symptom | Cause | Fix |
|---------|-------|-----|
| `{"errorMessage": "..."}` with non-zero exit | Any CLI error | Read the `errorMessage` — it usually says exactly what's wrong |
| `command not found: cargo-ai` | CLI not installed or not in PATH | Run `npm install -g @cargo-ai/cli` or prefix with `npx @cargo-ai/cli` |
| `Unauthorized` or `Forbidden` | Bad or expired credentials | Re-run `cargo-ai login --oauth` (browser sign-in) or `cargo-ai login --token <token>`; verify with `cargo-ai whoami` |

## Models

| Symptom | Cause | Fix |
|---------|-------|-----|
| `model get` returns not found | Wrong UUID | Re-run `model list` to get the correct UUID |
| `model get-ddl` returns empty DDL | Model has no sync connection to storage | Confirm the model has an extractor configured and has synced at least once |
| Table not found in `storage query execute` | Wrong dataset or model slug | Verify with `dataset list` and `model list`; tables are referenced as `<datasetSlug>.<modelSlug>` |
| `model remove` returns an error | Model is referenced by segments, plays, or tools | Remove or update the dependent resources before deleting the model |

## Columns

| Symptom | Cause | Fix |
|---------|-------|-----|
| `column create` fails with slug conflict | A column with that slug already exists | Use `column list --model-uuid <uuid>` to check existing slugs; choose a unique slug |
| `column update` returns not found | Wrong column slug or model UUID | Re-run `column list --model-uuid <uuid>` to get the correct column slugs |
| Column type mismatch in queries | Using string operators on a number column | Match the condition type to the column type; see the `cargo-orchestration` skill's `references/filter-syntax.md` |

## Relationships

| Symptom | Cause | Fix |
|---------|-------|-----|
| `relationship set` fails | One or both model UUIDs are wrong | Verify both model UUIDs with `model list` |
| `relationship list` returns empty | No relationships defined for that model | This is expected if relationships haven't been configured yet |

## Records

| Symptom | Cause | Fix |
|---------|-------|-----|
| `record list` returns empty | No records in the model, or wrong model UUID | Verify with `model list`; check that data has been synced |
| Need filtered record access | `record list` doesn't support filtering | Use `segmentation segment fetch` from the `cargo-orchestration` skill for filtering, sorting, and pagination |

## Queries (`storage query execute` / `storage query download`)

| Symptom | Cause | Fix |
|---------|-------|-----|
| `errorMessage` with "Table not found" | Wrong dataset or model slug | Verify with `storage dataset list` and `storage model list`. Tables are `<datasetSlug>.<modelSlug>` |
| `errorMessage` with syntax error | SQL dialect mismatch | Check whether your storage backend is BigQuery, Snowflake, etc. and adjust syntax accordingly. `storage model get-ddl` reports `language` |
| `reason: "clientNotFound"` | No storage client configured | Verify the workspace has an active storage connection |
| Query returns empty `rows` | Filter too restrictive, or wrong model | Try a broader query first (`SELECT * FROM <dataset>.<model> LIMIT 5`) |
| Column not found | Wrong column slug | Run `storage column list --model-uuid <uuid>` to get exact slugs |
