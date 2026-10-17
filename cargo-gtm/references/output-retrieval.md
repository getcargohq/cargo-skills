# Output retrieval — `run download-outputs` vs `run download`

How to extract action results from the platform after a run or batch finishes. **Always prefer `run download-outputs`** for the actual data; reserve `run download` for debugging.

## The two commands

| CLI command | Maps to API | Returns | Use for |
|---|---|---|---|
| `cargo-ai orchestration run download` | `POST /v1/orchestration/runs/download` | `{"url": "..."}`: signed URL to a gzipped CSV, one row per run (`_uuid`, `_record_id`, `_record_title`, `_created_at`, `_finished_at`, `_status`, `_error_message`) plus one column per node slug holding that node's execution title. No node outputs. | Debugging: which runs failed, with what error, and which nodes executed |
| `cargo-ai orchestration run download-outputs` | `POST /v1/orchestration/runs/download-outputs` | `{"url": "..."}` (or `{"reason": "noRunsFound"\|"tooManyRuns"\|"unknown"}`): signed URL to a CSV (default) or JSON file, one row per run: the `_uuid`/`_status`/`_error_message` run columns, the first node's input and the output node's data. CSV flattens them to `input_<key>` / `output_<key>` columns; JSON keeps `input` / `output` objects | **Canonical way to get action results.** Faster, cheaper, output-focused. |

## When to use each

### Use `run download-outputs` when

- You ran an action / tool / play and want the resulting enriched records.
- You're feeding outputs into the next step of a pipeline.
- You're handing the dataset to the user as a CSV.
- You only care about one specific node's output (the terminal `output` / `end` node).

This is the default for saved workflows, tools and plays. For a direct `action execute-batch`, use `cargo-ai orchestration batch download --uuid <batch-uuid>` instead (see below).

### Use `run download` when

- A run failed and you need its `_status` and `_error_message`.
- You need to see which nodes executed (e.g., which conditional branches fired): each executed node has a non-empty column.
- For per-node outputs, timing or credit attribution, use `cargo-diagnostics` (run trace) instead: `run download` does not carry them.

## `run download-outputs` reference

```bash
cargo-ai orchestration run download-outputs \
  --workflow-uuid <uuid> \
  [--output-node-slug <slug>] \
  [--format json|csv] \
  [--batch-uuid <uuid>] \
  [--release-uuid <uuid>] \
  [--statuses idle,pending,running,success,error,cancelling,cancelled,skipped] \
  [--parent-batch-uuid <uuid>] \
  [--parent-uuid <uuid>] \
  [--parent-node-uuid <uuid>] \
  [--is-group-parent] \
  [--record-id <id>] \
  [--record-title <title>] \
  [--is-finished] \
  [--executions-filter <json>] \
  [--created-after <iso8601>] \
  [--created-before <iso8601>] \
  [--limit <n>] \
  [--offset <n>]
```

**Required**: `--workflow-uuid`. Without `--output-node-slug`, the output columns come from the last executed node of each successful run (failed runs keep only their input). One export holds at most 10,000 runs (`--limit` defaults to 10,000, more returns `{"reason":"tooManyRuns"}`); page with `--offset`. Do not pass `--record-title-or-id` here: the CLI lists it, but the endpoint's strict body schema rejects it with a 400.

The response is a JSON object: `{"url": "<signed-url>"}`. The signed URL is short-lived — fetch immediately:

```bash
URL=$(cargo-ai orchestration run download-outputs --workflow-uuid <uuid> --output-node-slug <slug> --format json | jq -r .url)
curl -fsSL "$URL" > /tmp/outputs.json
```

## Finding the `output-node-slug`

Two paths:

```bash
# From the deployed release of a saved workflow / tool / play:
cargo-ai orchestration release get <release-uuid> | jq '.release.nodes[] | {slug, name, kind}'
# → Look for the terminal node, typically slug "output" or "end"
```

For ad-hoc `action execute` / `execute-batch` calls, the action runs as a single root node whose slug is always `action` (not the `actionSlug`). For a batch, skip this and use `batch download`:

```bash
cargo-ai orchestration batch download --uuid <batch-uuid>
# → {"url": "<signed CSV URL>"}, or {"reason": "batchNotFinished"|...}
```

The CSV holds each input record's columns plus, for successful runs, every top-level key of the action output as `cargo_<key>` (nested objects become dotted columns such as `cargo_person.company_name`; an array output, as from search actions, lands in one `cargo` column). Failed runs keep only the input columns.

For multi-step `run create --nodes` calls, the slug is whatever you assigned to the terminal node in your node graph.

## Examples

### Pull all enriched records from a finished batch

```bash
cargo-ai orchestration run download-outputs \
  --workflow-uuid abc-123-… \
  --output-node-slug output \
  --batch-uuid def-456-… \
  --format json
```

### Pull only successful records

```bash
cargo-ai orchestration run download-outputs \
  --workflow-uuid abc-123-… \
  --output-node-slug output \
  --statuses success \
  --format csv
```

### Pull records by external recordId

```bash
cargo-ai orchestration run download-outputs \
  --workflow-uuid abc-123-… \
  --output-node-slug output \
  --record-id "lead-456"
```

### Filter by node-execution status (e.g., only rows where the enrich step succeeded)

```bash
cargo-ai orchestration run download-outputs \
  --workflow-uuid abc-123-… \
  --output-node-slug output \
  --executions-filter '{"conjonction":"and","groups":[{"conjonction":"and","conditions":[{"kind":"node","nodeSlug":"enrich","status":"success"}]}]}'
```

## Why this matters for recipes

Cargo's orchestration layer is async by default. After firing an `action execute-batch` or `batch create`, you have two options:

1. **Wait inline**: pass `--wait-until-finished`. On `action execute` this prints the finished run; on `action execute-batch` and `batch create` it prints the batch object only (status and counts, no rows).
2. **Poll, then download**: fire async, poll status, then download once finished: `batch download --uuid` for a direct action batch, `run download-outputs` for a saved workflow.

Either way, the rows of a batch come from a download, never from the `--wait-until-finished` response.

## See also

- [`../../cargo-analytics/SKILL.md`](../../cargo-analytics/SKILL.md#downloading-run-results) — full reference for `run download` and `run download-outputs`.
- [`../../cargo-orchestration/references/polling.md`](../../cargo-orchestration/references/polling.md) — polling strategies for async runs and batches.
- [`../../cargo-orchestration/references/response-shapes.md`](../../cargo-orchestration/references/response-shapes.md) — full JSON shape of run / batch responses.
