# Response shapes

JSON response structures returned by Cargo CLI commands used in the `cargo-cli-orchestration` skill.

## cargo-ai orchestration play list

```json
{
  "plays": [
    {
      "uuid": "play-uuid",
      "name": "Enrich new companies",
      "workflowUuid": "workflow-uuid",
      "modelUuid": "model-uuid",
      "segmentUuid": "segment-uuid",
      "changeKinds": ["added", "updated"],
      "runCreationRule": "always",
      "isEnabled": true,
      "schedule": null,
      "description": "Enriches companies when they enter the segment",
      "healthThreshold": 80,
      "folderUuid": "folder-uuid-or-null",
      "createdAt": "2025-01-01T00:00:00Z",
      "updatedAt": "2025-01-15T00:00:00Z"
    }
  ]
}
```

**Key fields:** `name` (match by name), `workflowUuid` (needed for run/batch commands), `modelUuid`, `segmentUuid` (the segment the play watches).

## cargo-ai orchestration tool list

```json
{
  "tools": [
    {
      "uuid": "tool-uuid",
      "name": "Company Enrichment",
      "workflowUuid": "workflow-uuid",
      "description": "Enriches a company record with firmographic data",
      "creditsCost": { "kind": "minMax" },
      "triggers": [],
      "isReadOnly": false,
      "folderUuid": "folder-uuid-or-null",
      "createdAt": "2025-01-01T00:00:00Z",
      "updatedAt": "2025-01-15T00:00:00Z"
    }
  ]
}
```

**Key fields:** `name` (match by name), `workflowUuid` (needed for run/batch commands), `description`.

## cargo-ai orchestration workflow list

```json
{
  "workflows": [
    {
      "uuid": "abc-123",
      "workspaceUuid": "...",
      "playUuid": "play-uuid-or-null",
      "toolUuid": "tool-uuid-or-null",
      "folderUuid": "folder-uuid-or-null",
      "nodes": [],
      "lastBatch": {
        "uuid": "...",
        "status": "success",
        "runsStatus": "healthy",
        "createdAt": "2025-01-15T10:00:00Z",
        "finishedAt": "2025-01-15T10:05:00Z"
      },
      "deployedRelease": {
        "uuid": "...",
        "version": "3",
        "description": "Added email step",
        "deployedAt": "2025-01-10T09:00:00Z"
      },
      "createdAt": "2025-01-01T00:00:00Z",
      "updatedAt": "2025-01-15T10:05:00Z"
    }
  ]
}
```

**Key fields:** `uuid` (needed for run/batch commands), `playUuid`, `toolUuid`.

**Workflows don't have a `name` field.** Use `play list` or `tool list` instead — they have `name` and `workflowUuid` to cross-reference.

## cargo-ai ai agent list

```json
{
  "agents": [
    {
      "uuid": "agent-uuid",
      "name": "Sales Research Agent",
      "description": "Researches leads and enriches data",
      "isReadOnly": false,
      "folderUuid": "...",
      "createdAt": "2025-01-01T00:00:00Z",
      "updatedAt": "2025-01-15T00:00:00Z"
    }
  ]
}
```

**Key fields:** `uuid` (needed for chat create), `name` (match by name).

## cargo-ai storage model list

```json
{
  "models": [
    {
      "uuid": "model-uuid",
      "name": "Companies",
      "slug": "companies",
      "datasetUuid": "dataset-uuid",
      "idColumnSlug": "_id",
      "titleColumnSlug": "name",
      "playsCount": 5,
      "segmentsCount": 3,
      "isPaused": false,
      "columns": [
        { "slug": "name", "type": "string", "label": "Company Name" },
        { "slug": "domain", "type": "string", "label": "Domain" },
        { "slug": "employee_count", "type": "number", "label": "Employees" }
      ],
      "additionalColumns": [],
      "lastRun": {
        "uuid": "...",
        "status": "success",
        "createdAt": "2025-01-15T08:00:00Z",
        "finishedAt": "2025-01-15T08:02:00Z"
      },
      "createdAt": "2025-01-01T00:00:00Z",
      "updatedAt": "2025-01-15T08:02:00Z"
    }
  ]
}
```

**Key fields:** `uuid` (needed for segment fetch, get-ddl), `name`, `slug`, `columns[].slug` (for filter conditions).

## cargo-ai segmentation segment list

```json
{
  "segments": [
    {
      "uuid": "segment-uuid",
      "name": "Enterprise accounts",
      "slug": "enterprise-accounts",
      "modelUuid": "model-uuid",
      "recordsCount": 1520,
      "filter": { "conjonction": "and", "groups": [] },
      "sort": null,
      "limit": null,
      "createdAt": "2025-01-01T00:00:00Z",
      "updatedAt": "2025-01-15T00:00:00Z"
    }
  ]
}
```

**Key fields:** `uuid` (for run/batch data), `modelUuid` (needed for segment fetch — use this, not the segment uuid), `name`, `recordsCount`.

**IMPORTANT:** `segment fetch` requires `--model-uuid`, not `--segment-uuid`. Get `modelUuid` from the segment list response.

## cargo-ai orchestration action execute

```json
{
  "run": {
    "uuid": "run-uuid",
    "status": "pending",
    "createdAt": "2025-01-15T10:00:00Z"
  }
}
```

With `--wait-until-finished`, returns the terminal run state (same shape as `run get`).

**Status values:** `pending`, `running`, `success`, `error`, `cancelled`.

## cargo-ai orchestration action execute-batch

```json
{
  "batch": {
    "uuid": "batch-uuid",
    "status": "pending",
    "createdAt": "2025-01-15T10:00:00Z"
  }
}
```

With `--wait-until-finished`, returns the terminal batch state (same shape as `batch get`).

## cargo-ai orchestration run create

```json
{
  "run": {
    "uuid": "run-uuid",
    "workflowUuid": "...",
    "status": "pending",
    "batchUuid": null,
    "releaseUuid": "...",
    "createdAt": "2025-01-15T10:00:00Z"
  }
}
```

**Status values:** `pending`, `running`, `success`, `error`, `cancelled`.

## cargo-ai orchestration run get

```json
{
  "run": {
    "uuid": "run-uuid",
    "workflowUuid": "...",
    "status": "success",
    "batchUuid": null,
    "releaseUuid": "...",
    "recordId": "...",
    "recordTitle": "...",
    "contextS3Filename": "...",
    "computedConfigsS3Filename": "...",
    "executions": [
      {
        "nodeUuid": "...",
        "nodeSlug": "qualify",
        "nodeKind": "agent",
        "nodeActionSlug": "...",
        "nodeChildIndex": 0,
        "nextNodeUuid": "...",
        "status": "success",
        "title": "✅ {\"qualified\":true,\"score\":8,...}",
        "creditsUsedCount": 1,
        "startedAt": "...",
        "updatedAt": "...",
        "finishedAt": "..."
      }
    ],
    "createdAt": "2025-01-15T10:00:00Z",
    "finishedAt": "2025-01-15T10:00:05Z"
  },
  "runContext": {
    "start":   { "_id": "...", "domain": "acme.com" },
    "qualify": { "answer": { "qualified": true, "score": 8, "reasoning": "..." } },
    "is_qualified": { "condition": true },
    "post_slack": { "ok": true, "channel": "C123", "ts": "..." },
    "end": { "qualified": true, "score": 8, "slack_message_ts": "..." }
  },
  "runComputedConfigs": {
    "qualify": { "...resolved config that was sent to the node..." }
  }
}
```

**Key fields for debugging:**

- `run.executions[].title` — quick human-readable summary of each node's output; **may be truncated**, do not treat as the full output.
- `runContext.<nodeSlug>` — the actual per-node output, keyed by `nodeSlug`. This is the canonical source for what `{{nodes.<slug>...}}` resolves to downstream. Agent nodes wrap their structured output under `.answer` (e.g. `runContext.qualify.answer.qualified`).
- `runComputedConfigs.<nodeSlug>` — the resolved config values each node was actually called with (after template expression evaluation).

## cargo-ai orchestration batch create

```json
{
  "batch": {
    "uuid": "batch-uuid",
    "workflowUuid": "...",
    "status": "pending",
    "createdAt": "2025-01-15T10:00:00Z"
  }
}
```

## cargo-ai orchestration batch get

```json
{
  "batch": {
    "uuid": "batch-uuid",
    "workflowUuid": "...",
    "releaseUuid": "...",
    "status": "success",
    "runsStatus": "healthy",
    "runsCount": 100,
    "executedRunsCount": 100,
    "failedRunsCount": 2,
    "creditsUsedCount": 48,
    "errorMessage": null,
    "createdAt": "2025-01-15T10:00:00Z",
    "finishedAt": "2025-01-15T10:05:00Z"
  }
}
```

Poll until `status` is `success`, `error`, or `cancelled`. Note: `batch get` also returns `releaseUuid` — needed to discover output node slugs via `release get`.

## cargo-ai ai chat create

```json
{
  "chat": {
    "uuid": "chat-uuid",
    "agentUuid": "agent-uuid",
    "name": "Research session",
    "createdAt": "2025-01-15T10:00:00Z"
  }
}
```

**Key field:** `chat.uuid` (needed for message create).

## cargo-ai ai message create

```json
{
  "userMessage": {
    "uuid": "user-msg-uuid",
    "chatUuid": "chat-uuid",
    "status": "success",
    "parts": [{ "type": "text", "text": "Find the VP of Sales at Acme Corp" }]
  },
  "assistantMessage": {
    "uuid": "assistant-msg-uuid",
    "chatUuid": "chat-uuid",
    "status": "pending",
    "parts": []
  }
}
```

**Key field:** `assistantMessage.uuid` (needed for polling).

## cargo-ai ai message get

```json
{
  "message": {
    "uuid": "assistant-msg-uuid",
    "chatUuid": "chat-uuid",
    "status": "success",
    "parts": [
      { "type": "text", "text": "The VP of Sales at Acme Corp is John Smith..." }
    ],
    "errorMessage": null
  }
}
```

**Status values:** `pending`, `generating`, `success`, `error`.

## cargo-ai segmentation segment fetch

```json
{
  "records": [
    { "_id": "rec-1", "name": "Acme Corp", "domain": "acme.com", "employee_count": 500 },
    { "_id": "rec-2", "name": "Globex", "domain": "globex.com", "employee_count": 1200 }
  ],
  "count": 2,
  "columns": [
    { "slug": "_id", "type": "string", "label": "ID", "modelUuid": "model-uuid" },
    { "slug": "name", "type": "string", "label": "Company Name", "modelUuid": "model-uuid" },
    { "slug": "domain", "type": "string", "label": "Domain", "modelUuid": "model-uuid" },
    { "slug": "employee_count", "type": "number", "label": "Employees", "modelUuid": "model-uuid" }
  ]
}
```

## cargo-ai storage model get-ddl

```json
{
  "ddl": "CREATE TABLE `project.datasets_default.models_companies` (\n  `_id` STRING,\n  `name` STRING,\n  `domain` STRING,\n  `employee_count` INT64\n);",
  "language": "bigquery"
}
```

The table name in the DDL follows the pattern `datasets_{datasetSlug}.models_{modelSlug}` (or `datasets_{datasetSlug}__models_{modelSlug}` in BigQuery dataset-scoped). Use this name in SoR queries.

## cargo-ai system-of-record client query / fetch

Returns a discriminated union — always check `outcome` first:

**Success:**

```json
{
  "outcome": "queried",
  "rows": [
    { "name": "Acme Corp", "domain": "acme.com", "employee_count": 500 },
    { "name": "Globex", "domain": "globex.com", "employee_count": 1200 }
  ]
}
```

**Failure:**

```json
{
  "outcome": "notQueried",
  "errorMessage": "Table not found: datasets_default.models_nonexistent"
}
```

Always check `outcome === "queried"` before reading `rows`. On `"notQueried"`, read `errorMessage` for the SQL error.

## cargo-ai system-of-record client get-documentation

**Returns plain text (not JSON).** This is the only CLI command that does not return JSON. The output is the SoR documentation string which may include markdown formatting.

## cargo-ai orchestration release list

```json
{
  "releases": [
    {
      "uuid": "release-uuid",
      "workflowUuid": "...",
      "version": "3",
      "description": "Added email step",
      "createdAt": "2025-01-10T09:00:00Z"
    }
  ]
}
```

Supports `--workflow-uuid`, `--limit`, `--offset`.

## cargo-ai orchestration release get

```json
{
  "release": {
    "uuid": "release-uuid",
    "workflowUuid": "...",
    "userUuid": "...",
    "version": "3",
    "description": "Added email step",
    "nodes": [
      { "uuid": "node-uuid-1", "slug": "enrich_company", "name": "Enrich Company" },
      { "uuid": "node-uuid-2", "slug": "send_email", "name": "Send Email" },
      { "uuid": "node-uuid-3", "slug": "output", "name": "Output" }
    ],
    "createdAt": "2025-01-10T09:00:00Z"
  }
}
```

**Key field:** `nodes[].slug` — needed for `batch download --output-node-slug`.

## cargo-ai ai chat list

```json
{
  "chats": [
    {
      "uuid": "chat-uuid",
      "agentUuid": "agent-uuid",
      "name": "Research session",
      "createdAt": "2025-01-15T10:00:00Z"
    }
  ]
}
```

Supports `--agent-uuid`, `--limit`, `--offset` for filtering.

## cargo-ai orchestration record list

```json
{
  "records": [
    {
      "id": "record-id",
      "title": "Acme Corp",
      "workflowUuid": "...",
      "runUuid": "run-uuid",
      "releaseUuid": "release-uuid",
      "batchUuid": "batch-uuid",
      "status": "success",
      "errorMessage": null,
      "isGroupParent": false,
      "parentRunUuid": null,
      "parentNodeUuid": null,
      "parentBatchUuid": null,
      "createdAt": "2025-01-15T10:00:00Z",
      "updatedAt": "2025-01-15T10:01:00Z"
    }
  ],
  "count": 42
}
```

**`status`** values: `pending`, `running`, `success`, `error`, `cancelled`, `cancelling`.

Supports `--workflow-uuid` (required), `--batch-uuid`, `--release-uuid`, `--statuses`, `--limit`, `--offset`.

## cargo-ai orchestration record count

```json
{
  "count": 42
}
```

Same filter params as `record list`.

## cargo-ai orchestration record download

```json
{
  "url": "https://signed-download-url..."
}
```

Returns a signed URL to download records as a file.

## cargo-ai orchestration record get-metrics

```json
{
  "recordMetrics": [
    {
      "nodeUuid": "node-uuid",
      "totalExecutionsCount": 100,
      "pendingExecutionsCount": 0,
      "runningExecutionsCount": 0,
      "successExecutionsCount": 95,
      "errorExecutionsCount": 5,
      "cancelledExecutionsCount": 0,
      "creditsUsedCount": 95
    }
  ]
}
```

Broken down per node. Supports `--workflow-uuid` (required), `--release-uuid`, `--batch-uuid`, `--created-after`, `--created-before`.

## cargo-ai segmentation segment get

```json
{
  "segment": {
    "uuid": "segment-uuid",
    "workspaceUuid": "...",
    "userUuid": "...",
    "modelUuid": "model-uuid",
    "slug": "high-value-accounts",
    "name": "High-Value Accounts",
    "filter": { "conjonction": "and", "groups": [] },
    "sort": null,
    "limit": null,
    "recordsCount": 1234,
    "fromPlay": false,
    "trackingColumnSlugs": null,
    "syncedAt": "2025-01-15T10:00:00Z",
    "lastChange": {
      "uuid": "change-uuid",
      "slug": "2025-01-15",
      "totalRecordsCount": 1234
    },
    "createdAt": "2025-01-01T00:00:00Z",
    "updatedAt": "2025-01-15T10:00:00Z",
    "deletedAt": null
  }
}
```

**Key fields:** `uuid`, `modelUuid`, `name`, `filter`, `recordsCount`, `lastChange`.

## cargo-ai segmentation segment create

```json
{
  "segment": {
    "uuid": "segment-uuid",
    "modelUuid": "model-uuid",
    "slug": "new-segment",
    "name": "New Segment",
    "filter": { "conjonction": "and", "groups": [] },
    "recordsCount": 0,
    ...
  }
}
```

Same shape as `segment get`.

## cargo-ai segmentation change list

```json
{
  "changes": [
    {
      "uuid": "change-uuid",
      "workspaceUuid": "...",
      "segmentUuid": "segment-uuid",
      "slug": "2025-01-15",
      "totalRecordsCount": 1234,
      "addedRecordsCount": 10,
      "updatedRecordsCount": 5,
      "removedRecordsCount": 2,
      "unchangedRecordsCount": 1217,
      "createdAt": "2025-01-15T00:00:00Z"
    }
  ]
}
```
