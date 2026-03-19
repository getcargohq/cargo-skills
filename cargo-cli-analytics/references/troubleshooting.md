# Troubleshooting

Common errors and recovery steps for `cargo-cli-analytics` commands.

## General

| Symptom | Cause | Fix |
|---------|-------|-----|
| `{"errorMessage": "..."}` with non-zero exit | Any CLI error | Read the `errorMessage` — it usually says exactly what's wrong |
| `command not found: cargo-ai` | CLI not installed or not in PATH | Run `npm install -g @cargo-ai/cli@^1.0.5` or prefix with `npx @cargo-ai/cli@^1.0.5` |
| `Unauthorized` or `Forbidden` | Bad or expired API token | Re-run `cargo-ai login --token <token>` and verify with `cargo-ai whoami` |

## Run metrics and counts

| Symptom | Cause | Fix |
|---------|-------|-----|
| `run get-metrics` returns empty array | No runs exist for that workflow/period | Verify the `--workflow-uuid`; try without date filters to check if any runs exist |
| Error count seems too high | Counting across all time | Scope with `--created-after` and `--created-before` for a specific period |
| `run count` returns 0 unexpectedly | Filter combination too narrow | Remove filters one at a time to isolate which one excludes all runs |

## Downloads and exports

| Symptom | Cause | Fix |
|---------|-------|-----|
| `run download` returns empty | No runs match the filters | Loosen filters; try `--is-finished` without date or status constraints |
| `batch download` fails with "node not found" | Wrong `--output-node-slug` | Re-run `release get <release-uuid>` and check `nodes[].slug` for the correct value |
| `segment download` returns empty | Wrong model UUID or over-filtered | Verify `--model-uuid` (not `--segment-uuid`); try empty filter `{"conjonction":"and","groups":[]}` first |
| Parse error on filter JSON | Malformed JSON or wrong spelling | Check: it's `conjonction` (not `conjunction`); validate JSON syntax; see the `cargo-cli-orchestration` skill's `references/filter-syntax.md` |
