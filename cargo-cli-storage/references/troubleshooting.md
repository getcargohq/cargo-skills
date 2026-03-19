# Troubleshooting

Common errors and recovery steps for `cargo-cli-storage` commands.

## General

| Symptom | Cause | Fix |
|---------|-------|-----|
| `{"errorMessage": "..."}` with non-zero exit | Any CLI error | Read the `errorMessage` — it usually says exactly what's wrong |
| `command not found: cargo-ai` | CLI not installed or not in PATH | Run `npm install -g @cargo-ai/cli` or prefix with `npx @cargo-ai/cli` |
| `Unauthorized` or `Forbidden` | Bad or expired API token | Re-run `cargo-ai login --token <token>` and verify with `cargo-ai whoami` |

## Models

| Symptom | Cause | Fix |
|---------|-------|-----|
| `model get` returns not found | Wrong UUID | Re-run `model list` to get the correct UUID |
| `model get-ddl` returns empty DDL | Model has no sync connection to the warehouse | Confirm the model has an extractor configured and has synced at least once |
| Table not found when querying SoR | Using the model name instead of the DDL table name | Always use `model get-ddl` to get the exact table name before querying |
| `model remove` returns an error | Model is referenced by segments, plays, or tools | Remove or update the dependent resources before deleting the model |

## Columns

| Symptom | Cause | Fix |
|---------|-------|-----|
| `column create` fails with slug conflict | A column with that slug already exists | Use `column list --model-uuid <uuid>` to check existing slugs; choose a unique slug |
| `column update` returns not found | Wrong column slug or model UUID | Re-run `column list --model-uuid <uuid>` to get the correct column slugs |
| Column type mismatch in queries | Using string operators on a number column | Match the condition type to the column type; see the `cargo-cli-orchestration` skill's `references/filter-syntax.md` |

## Relationships

| Symptom | Cause | Fix |
|---------|-------|-----|
| `relationship set` fails | One or both model UUIDs are wrong | Verify both model UUIDs with `model list` |
| `relationship list` returns empty | No relationships defined for that model | This is expected if relationships haven't been configured yet |

## Records

| Symptom | Cause | Fix |
|---------|-------|-----|
| `record list` returns empty | No records in the model, or wrong model UUID | Verify with `model list`; check that data has been synced |
| Need filtered record access | `record list` doesn't support filtering | Use `segmentation segment fetch` from the `cargo-cli-orchestration` skill for filtering, sorting, and pagination |
