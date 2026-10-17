# Troubleshooting

Common errors and recovery steps for `cargo-analytics` commands.

## General

| Symptom | Cause | Fix |
|---------|-------|-----|
| `{"errorMessage": "..."}` with non-zero exit | Any CLI error | Read the `errorMessage` — it usually says exactly what's wrong |
| `command not found: cargo-ai` | CLI not installed or not in PATH | Run `npm install -g @cargo-ai/cli` or prefix with `npx @cargo-ai/cli` |
| `Unauthorized` or `Forbidden` | Bad or expired credentials | Re-run `cargo-ai login --oauth` (browser sign-in) or `cargo-ai login --token <token>`; verify with `cargo-ai whoami` |

## Run metrics and counts

| Symptom | Cause | Fix |
|---------|-------|-----|
| `run get-metrics` returns empty array | No runs exist for that workflow/period | Verify the `--workflow-uuid`; try without date filters to check if any runs exist |
| Error count seems too high | Counting across all time | Scope with `--created-after` and `--created-before` for a specific period |
| `run count` returns 0 unexpectedly | Filter combination too narrow | Remove filters one at a time to isolate which one excludes all runs |

## Downloads and exports

| Symptom | Cause | Fix |
|---------|-------|-----|
| `run download` returns empty | No runs match the filters | Loosen filters — drop the date and status constraints and pass `--workflow-uuid` alone |
| `run download` file has only the `_`-prefixed columns | The workflow resolves to zero active nodes (all archived, or the UUID doesn't exist in this workspace), so there are no node columns to add | Confirm the UUID with `workflow list` / `play list`. Loosening filters won't help; the cause is the workflow, not the runs |
| `400 unrecognized_keys: <flag>` on a run command | The CLI offers a flag the API's request schema doesn't accept | Drop the flag and express the filter another way — `--statuses success,error` covers "finished". Then report it: `workspaceManagement report create` |
| `batch download` rows have no `cargo_*` columns | Wrong `--output-node-slug` (there is no "node not found" error: the output is silently omitted), or the CSV was already cached by an earlier download of the same batch | Re-run `release get <release-uuid>` and check `nodes[].slug`; note the file is cached per batch, so a second call with another slug returns the first file |
| `batch download` returns `batchNotFinished` | The batch has no `finishedAt` yet | Wait for a terminal status (`batch get <uuid>`), then download |
| `segment download` returns empty | Wrong model UUID or over-filtered | Verify `--model-uuid` (not `--segment-uuid`); try empty filter `{"conjonction":"and","groups":[]}` first |
| Parse error on filter JSON | Malformed JSON or wrong spelling | Check: it's `conjonction` (not `conjunction`); validate JSON syntax; see the `cargo-orchestration` skill's `references/filter-syntax.md` |
