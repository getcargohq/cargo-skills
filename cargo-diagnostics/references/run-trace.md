# Run trace — explain one run end-to-end

Use this when you have (or can find) a single run UUID and need to answer "what actually happened to this record?" — a hard failure, or the more common case: `status: "success"` with wrong or empty output.

> Field-by-field semantics for everything used here live in [`../../cargo-orchestration/references/troubleshooting.md`](../../cargo-orchestration/references/troubleshooting.md) ("Debugging a workflow run"). This runbook is the ordered procedure.

## 0. Find the run if you only have a record or a symptom

```bash
# Recent runs for a workflow (most recent first)
cargo-ai orchestration query execute \
  "SELECT uuid, status, created_at, credits_used_count
   FROM runs
   WHERE workflow_uuid = '<workflow-uuid>'
   ORDER BY created_at DESC
   LIMIT 20"
```

If you're coming from a batch sweep, you already have exemplar UUIDs — skip ahead.

## 1. Pull the trace

```bash
cargo-ai orchestration run get <run-uuid>
```

Read three fields, in this order:

1. **`run.executions[]`** — the node-by-node path. For each node: `nodeSlug`, `status`, `nextNodeUuid`, `nodeChildIndex`, `creditsUsedCount`. This tells you **where execution went**, including which child a `branch` took (`nodeChildIndex` `0` = matched/yes, `1` = not matched/no).
2. **`runContext`** — per-node output keyed by `nodeSlug`. This is the actual data downstream expressions saw as `{{nodes.<slug>...}}`. It is the source of truth; the `title` on an execution is a truncated summary, never evidence.
3. **`runComputedConfigs`** — what each node was *actually called with* after expression resolution. When a node received garbage, this shows the garbage.

Don't paste the raw response into the conversation — extract the two or three nodes that matter (see "Presenting" below).

## 2. Diagnose by symptom

| Symptom | Where to look | Typical conclusion |
| --- | --- | --- |
| Run `error` | First `executions[]` item with `status: "error"`; its `runContext.<slug>` entry carries the error detail | Failing node identified — match it against the error-pattern table in [`troubleshooting.md`](../../cargo-orchestration/references/troubleshooting.md) ("Run error recovery") |
| Run `success`, output empty | `runContext.<upstreamSlug>` of the node that produced the empty value | Expression path doesn't exist — commonly agent output nested under `.answer` (`{{nodes.qualify.answer.qualified}}`, not `{{nodes.qualify.qualified}}`) |
| Wrong branch taken | The branch node's `nodeChildIndex` + the `runContext` of the node its condition references | Condition resolved falsy because the referenced path is missing/undefined — verify the real shape in `runContext` |
| Connector node "worked" but downstream empty | `runContext.<connectorSlug>` | Partial provider response; the real field names differ from the ones referenced (e.g. `contact.email` vs `email`) |
| One node absurdly slow | Spans timing query below | Rate-limited or retrying connector; see the batch-sizing section of `troubleshooting.md` |

Per-node timing for the slow-node case:

```bash
cargo-ai orchestration query execute \
  "SELECT node_slug, execution_status,
          dateDiff('second', execution_started_at, execution_finished_at) AS duration_s
   FROM spans
   WHERE run_uuid = '<run-uuid>'
   ORDER BY duration_s DESC"
```

## 3. Confirm the fix on the same record

Stage → approve → deploy → re-run the exact record IDs that exposed the bug — the command sequence is in [`troubleshooting.md`](../../cargo-orchestration/references/troubleshooting.md) ("Re-run a single record after fixing"). Re-running paid nodes counts as a paid action: pilot gate + receipt per [`../../cargo-gtm/references/cost-discipline.md`](../../cargo-gtm/references/cost-discipline.md).

## Presenting a trace

Per [`../../cargo/references/interaction.md`](../../cargo/references/interaction.md): conclusion first, then a compact path table — one row per relevant node (`nodeSlug` → status → the one field that matters), then the recommended fix. Example shape:

```
The run "succeeded" but the branch took the no-path: the condition reads
{{nodes.qualify.qualified}}, but the agent's output is nested under .answer.

| node      | status  | evidence                                        |
|-----------|---------|--------------------------------------------------|
| qualify   | success | runContext.qualify.answer.qualified = true       |
| branch_1  | success | nodeChildIndex = 1 (no-path) — condition falsy   |

Fix: change the condition to {{nodes.qualify.answer.qualified}} and re-run
record <id> to confirm (1 record ≈ <n> credits).
```
