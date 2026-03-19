# Response shapes

JSON response structures returned by Cargo CLI commands used in the `cargo-cli-analytics` skill.

> For billing response shapes (usage metrics, subscription, invoices), see the `cargo-cli-billing` skill.

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

Returns the output data for the specified node as a downloadable payload. The response is streamed to stdout.
