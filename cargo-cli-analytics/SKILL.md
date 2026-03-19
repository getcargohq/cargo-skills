---
name: cargo-cli-analytics
description: Download workflow run results, export segment data, and monitor run metrics using the Cargo CLI. Use when the user wants run metrics, error rates, data export, or download results for their Cargo workspace. For billing and credit usage, use the cargo-cli-billing skill instead.
license: MIT
compatibility: Requires @cargo-ai/cli (npm) and a Cargo API token
metadata:
  author: getcargo
  version: "1.4"
---

# Cargo CLI — Analytics

Measurement and export: monitoring run metrics, downloading run and batch results, and exporting segment data.

> See `references/response-shapes.md` for full JSON response structures.
> See `references/troubleshooting.md` for common errors and how to fix them.
> See `references/examples/run-analytics.md` for run metrics and error monitoring.
> See `references/examples/exports.md` for data export and download examples.
> For billing, usage metrics, and subscription: use the `cargo-cli-billing` skill.

## Prerequisites

```bash
npm install -g @cargo-ai/cli
cargo-ai login --token <your-api-token>
cargo-ai login --token <your-api-token> --workspace-uuid <uuid>
```

Verify with `cargo-ai whoami`. All commands output JSON to stdout. Without a global install, prefix every command with `npx @cargo-ai/cli` instead of `cargo-ai`.

Failed commands exit non-zero and return `{"errorMessage": "..."}`.

## Discover resources first

Most analytics commands require UUIDs. Discover them before querying.

```bash
cargo-ai orchestration play list            # all plays (name, workflowUuid)
cargo-ai orchestration tool list            # all tools (name, workflowUuid)
cargo-ai orchestration workflow list        # all workflows (uuid only — no name)
cargo-ai ai agent list                     # all agents (uuid, name)
cargo-ai connection connector list          # all connectors (uuid, name, integrationSlug)
cargo-ai storage model list                # all models (uuid, name, slug)
```

## Quick reference

```bash
cargo-ai orchestration run get-metrics --workflow-uuid <uuid>
cargo-ai orchestration run download --workflow-uuid <uuid> --is-finished
cargo-ai orchestration run count --workflow-uuid <uuid> --statuses error
cargo-ai segmentation segment download --model-uuid <uuid> --filter '{"conjonction":"and","groups":[]}'
```

## Workflow run metrics

Aggregated metrics for workflow runs (success/error rates, credits per node).

```bash
# Metrics for a workflow
cargo-ai orchestration run get-metrics --workflow-uuid <uuid>

# Scoped to a release, batch, or date range
cargo-ai orchestration run get-metrics --workflow-uuid <uuid> --release-uuid <uuid>
cargo-ai orchestration run get-metrics --workflow-uuid <uuid> --batch-uuid <uuid>
cargo-ai orchestration run get-metrics --workflow-uuid <uuid> \
  --created-after <start-date> --created-before <end-date>
```

## Run count

Count runs matching specific criteria — useful for monitoring.

```bash
cargo-ai orchestration run count --workflow-uuid <uuid> --statuses error
cargo-ai orchestration run count --workflow-uuid <uuid> --is-finished \
  --created-after <start-date> --created-before <end-date>
cargo-ai orchestration run count --workflow-uuid <uuid> --batch-uuid <uuid>
```

Supports: `--statuses`, `--batch-uuid`, `--release-uuid`, `--is-finished`, `--created-after`, `--created-before`, `--record-id`, `--record-title`.

## Downloading run results

```bash
# All finished runs
cargo-ai orchestration run download --workflow-uuid <uuid> --is-finished

# Date range
cargo-ai orchestration run download --workflow-uuid <uuid> \
  --created-after <start-date> --created-before <end-date>

# Specific statuses
cargo-ai orchestration run download --workflow-uuid <uuid> --statuses success,error

# From a specific batch
cargo-ai orchestration run download --workflow-uuid <uuid> --batch-uuid <uuid>
```

## Downloading batch results

```bash
cargo-ai orchestration batch download --uuid <batch-uuid> --output-node-slug <node-slug>
```

To find the `output-node-slug`: run `cargo-ai orchestration release get <release-uuid>` (get the release UUID from the batch) and look at `nodes[].slug`.

## Handling partial batch failures

A batch with `status: "success"` can still contain individual run failures. Always inspect the batch for errors before treating results as complete.

**Step 1 — Check the batch summary:**

```bash
cargo-ai orchestration batch get <batch-uuid>
# → .runsCount          = total records submitted
# → .executedRunsCount  = records that reached a terminal state (success or error)
# → .failedRunsCount    = records that errored
```

**Step 2 — Count errors for the batch:**

```bash
cargo-ai orchestration run count \
  --workflow-uuid <uuid> \
  --batch-uuid <batch-uuid> \
  --statuses error
```

**Step 3 — Download failed runs to inspect root causes:**

```bash
cargo-ai orchestration run download \
  --workflow-uuid <uuid> \
  --batch-uuid <batch-uuid> \
  --statuses error
```

**Step 4 — Re-run only the failed records:**

After fixing the underlying issue (connector credentials, bad input data, rate limits):

```bash
# Extract record IDs from the failed run download, then:
cargo-ai orchestration batch create \
  --workflow-uuid <uuid> \
  --data '{"kind":"recordIds","recordIds":["id1","id2","id3"]}'
```

**Filtering by node output slug:**

To download only a specific node's output from a batch (e.g. just the enrichment node, not the full run):

```bash
# 1. Get the release UUID from the batch
cargo-ai orchestration batch get <batch-uuid>
# → .releaseUuid

# 2. Find the node slug
cargo-ai orchestration release get <release-uuid>
# → nodes[].slug

# 3. Download that node's output
cargo-ai orchestration batch download \
  --uuid <batch-uuid> \
  --output-node-slug <node-slug>
```

## Segment data export

Filter JSON uses `conjonction` (not `conjunction`) — this is intentional. See the `cargo-cli-orchestration` skill's `references/filter-syntax.md` for the full filter syntax.

```bash
# Full export (all records)
cargo-ai segmentation segment download \
  --model-uuid <uuid> \
  --filter '{"conjonction":"and","groups":[]}'

# With sorting and limit
cargo-ai segmentation segment download \
  --model-uuid <uuid> \
  --filter '{"conjonction":"and","groups":[]}' \
  --sort '[{"columnSlug":"created_at","kind":"desc"}]' \
  --limit 1000
```

**IMPORTANT:** `segment download` requires `--model-uuid`, not `--segment-uuid`. Get the `modelUuid` from `segment list`.

For live paginated queries with enrichment, use `segmentation segment fetch` from the `cargo-cli-orchestration` skill.

## Help

Every command supports `--help`:

```bash
cargo-ai billing usage get-metrics --help
cargo-ai orchestration run download --help
cargo-ai segmentation segment download --help
```
