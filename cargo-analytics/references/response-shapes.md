# Response shapes

JSON response structures returned by Cargo CLI commands used in the `cargo-analytics` skill.

> For billing response shapes (usage metrics, subscription, invoices), see the `cargo-billing` skill.

## cargo-ai orchestration run get-metrics

```json
{
  "runMetrics": [
    {
      "nodeUuid": "node-uuid-1",
      "totalExecutionsCount": 1000,
      "idleExecutionsCount": 0,
      "pendingExecutionsCount": 5,
      "runningExecutionsCount": 10,
      "successExecutionsCount": 950,
      "errorExecutionsCount": 30,
      "cancelledExecutionsCount": 5,
      "skippedExecutionsCount": 0,
      "creditsUsedCount": 450
    }
  ]
}
```

**Key fields:** `nodeUuid` (identifies the workflow node), `successExecutionsCount`, `errorExecutionsCount`, `creditsUsedCount`.

To compute an error rate: `errorExecutionsCount / totalExecutionsCount`.

## cargo-ai orchestration run count

```json
{
  "count": 42
}
```

## cargo-ai orchestration run list

```json
{
  "runs": [
    {
      "uuid": "run-uuid",
      "workflowUuid": "...",
      "status": "success",
      "batchUuid": "batch-uuid-or-null",
      "releaseUuid": "...",
      "recordId": "rec-123",
      "recordTitle": "Acme Corp",
      "createdAt": "2025-01-15T10:00:00Z",
      "finishedAt": "2025-01-15T10:00:05Z"
    }
  ]
}
```

## cargo-ai segmentation segment download

Returns raw data as a downloadable payload (typically CSV or JSON depending on the CLI output format). The response is streamed to stdout.

## cargo-ai orchestration batch download

Returns `{"url": "..."}` — a signed URL to a file, **not** the data on stdout. Each row is a batch record joined to its run's output for the chosen node (defaulting to the last executed node), so a record whose run errored comes back with its input fields and no output.

## cargo-ai orchestration run download

Returns `{"url": "..."}` — a signed URL to a **gzipped CSV**. One row per run: `_uuid`, `_workspace_uuid`, `_workflow_uuid`, `_record_id`, `_record_title`, `_created_at`, `_finished_at`, `_status`, `_error_message`, then one column per node slug holding that execution's `title` (a truncated summary, not the node's output). No `runContext`, no `executions[]`.

## cargo-ai orchestration run download-outputs

Returns `{"url": "..."}` — a signed URL to CSV (default) or JSON. One row per run: the `_`-prefixed run metadata above, plus `input` (first node's resolved config) and `output` (chosen node's context, defaulting to the last executed node).
