# Output retrieval — `run download-outputs` vs `run download`

How to extract action results from the platform after a run or batch finishes. **Always prefer `run download-outputs`** for the actual data; reserve `run download` for debugging.

## The two commands

| CLI command | Maps to API | Returns | Use for |
|---|---|---|---|
| `cargo-ai orchestration run download` | `POST /v1/orchestration/runs/download-runs` | Newline-delimited JSON of full run records (status, executions, `runContext.<nodeSlug>` per-node outputs, timing) | Debugging — what did each node output? Why did this run fail? |
| `cargo-ai orchestration run download-outputs` | `POST /v1/orchestration/runs/download-outputs` | `{"url": "..."}` — signed URL to a CSV (default) or JSON file with input + output node data per record | **Canonical way to get action results.** Faster, cheaper, output-focused. |

## When to use each

### Use `run download-outputs` when

- You ran an action / tool / play and want the resulting enriched records.
- You're feeding outputs into the next step of a pipeline.
- You're handing the dataset to the user as a CSV.
- You only care about one specific node's output (the terminal `output` / `end` node).

This is the default in every recipe in this skill.

### Use `run download` when

- A run failed and you need to inspect every node's `runContext` to find the breakage.
- You want timing / credit attribution per node.
- You need the full execution trace (e.g., which conditional branches fired).

## `run download-outputs` reference

```bash
cargo-ai orchestration run download-outputs \
  --workflow-uuid <uuid> \
  --output-node-slug <slug> \
  [--format json|csv] \
  [--batch-uuid <uuid>] \
  [--release-uuid <uuid>] \
  [--statuses pending,running,finished,failed,cancelled] \
  [--parent-batch-uuid <uuid>] \
  [--parent-uuid <uuid>] \
  [--parent-node-uuid <uuid>] \
  [--is-group-parent] \
  [--record-id <id>] \
  [--record-title <title>] \
  [--record-title-or-id <value>] \
  [--is-finished] \
  [--executions-filter <json>] \
  [--created-after <iso8601>] \
  [--created-before <iso8601>]
```

**Required**: `--workflow-uuid` and `--output-node-slug`.

The response is a JSON object: `{"url": "<signed-url>"}`. The signed URL is short-lived — fetch immediately:

```bash
URL=$(cargo-ai orchestration run download-outputs --workflow-uuid <uuid> --output-node-slug <slug> --format json --is-finished | jq -r .url)
curl -fsSL "$URL" > /tmp/outputs.json
```

## Finding the `output-node-slug`

Two paths:

```bash
# From the deployed release of a saved workflow / tool / play:
cargo-ai orchestration release get <release-uuid> | jq '.nodes[] | {slug, name, kind}'
# → Look for the terminal node, typically slug "output" or "end"
```

For ad-hoc `action execute` calls, the slug is the action's `actionSlug` itself (the action becomes a single-node workflow internally).

For multi-step `run create --nodes` calls, the slug is whatever you assigned to the terminal node in your node graph.

## Examples

### Pull all enriched records from a finished batch

```bash
cargo-ai orchestration run download-outputs \
  --workflow-uuid abc-123-… \
  --output-node-slug output \
  --batch-uuid def-456-… \
  --format json \
  --is-finished
```

### Pull only successful records

```bash
cargo-ai orchestration run download-outputs \
  --workflow-uuid abc-123-… \
  --output-node-slug output \
  --statuses finished \
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
  --executions-filter '{"enrich":{"status":"finished"}}'
```

## Why this matters for recipes

Cargo's orchestration layer is async by default. After firing an `action execute-batch` or `batch create`, you have two options:

1. **Wait inline**: pass `--wait-until-finished` and read the response. Works for small runs (< 50 records).
2. **Poll, then download**: fire async, poll status, then `run download-outputs` once finished. Required for large runs.

Every recipe in this skill that fans out across >50 records uses path 2 with `download-outputs`. Path 1 inline reads only work because `--wait-until-finished` returns the run object directly — but it doesn't scale.

## See also

- [`../../cargo-analytics/SKILL.md`](../../cargo-analytics/SKILL.md#downloading-run-results) — full reference for `run download` and `run download-outputs`.
- [`../../cargo-orchestration/references/polling.md`](../../cargo-orchestration/references/polling.md) — polling strategies for async runs and batches.
- [`../../cargo-orchestration/references/response-shapes.md`](../../cargo-orchestration/references/response-shapes.md) — full JSON shape of run / batch responses.
