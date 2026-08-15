# Async polling reference

All runs, batches, and agent messages in Cargo are asynchronous. This file is the single source of truth for polling patterns, intervals, terminal states, and error handling.

## Skip polling with `--wait-until-finished`

For runs and batches, pass `--wait-until-finished` to `run create` or `batch create` to block until the operation reaches a terminal state and return the final result directly — no manual polling needed:

```bash
# Blocks until the run finishes, returns the final run result
cargo-ai orchestration run create \
  --workflow-uuid <uuid> \
  --data '{"domain":"acme.com"}' \
  --wait-until-finished

# Blocks until the batch finishes, returns the final batch result
cargo-ai orchestration batch create \
  --workflow-uuid <uuid> \
  --data '{"kind":"filter","modelUuid":"...","filter":{"conjonction":"and","groups":[]}}' \
  --wait-until-finished
```

Use `--wait-until-finished` for short-lived runs or when you need the result immediately. For large batches (1000+ records) or long-running workflows, manual polling gives you more control and visibility.

## Polling table

| Operation | Create command | Poll command | Interval | Terminal state |
|---|---|---|---|---|
| Run | `orchestration run create` | `orchestration run get <uuid>` | 2s | `status` is `success`, `error`, or `cancelled` |
| Batch | `orchestration batch create` | `orchestration batch get <uuid>` | 5s | `status` is `success`, `error`, or `cancelled` |
| Agent message | `ai message create` | `ai message get <uuid>` | 2s | `status` is `success` or `error` |

For large batches (1000+ records), increase the polling interval to 10–15s after the first minute to avoid rate-limiting.

---

## Waiting for completion

For runs and batches, pass `--wait-until-finished` to `run create` or `batch create` to block until the operation reaches a terminal state and return the final result — no manual polling needed:

```bash
# Blocks until the run finishes, returns the final run result
cargo-ai orchestration run create \
  --workflow-uuid <uuid> \
  --data '{"domain":"acme.com"}' \
  --wait-until-finished

# Blocks until the batch finishes, returns the final batch result
cargo-ai orchestration batch create \
  --workflow-uuid <uuid> \
  --data '{"kind":"filter","modelUuid":"...","filter":{"conjonction":"and","groups":[]}}' \
  --wait-until-finished
```

For agent messages, poll manually with `ai message get <uuid>` until `status` is `success` or `error`.

---

## What to do when a terminal state is an error

### Run returns `status: "error"`

1. Read node-level output to find the failing node:
   ```bash
   cargo-ai orchestration run get <run-uuid>
   # → Inspect each node's output for error indicators
   ```
2. Check the error message from the connector, agent, or native node.
3. Identify the cause — common patterns:
   - **Connector error:** rate limit, invalid input, credential expired → fix connector config or input data
   - **Agent error:** prompt too long, model quota exceeded → simplify prompt or switch model
   - **Filter node stopped execution:** this is not an error — it means the record didn't meet the filter condition
4. Fix the input data or node config and re-trigger.

### Batch finishes with partial failures

A batch with `status: "success"` can still have individual run failures. After the batch reaches a terminal state:

```bash
# Count errors in the batch
cargo-ai orchestration run count \
  --workflow-uuid <uuid> \
  --batch-uuid <batch-uuid> \
  --statuses error

# Download only failed runs for inspection
cargo-ai orchestration run download \
  --workflow-uuid <uuid> \
  --batch-uuid <batch-uuid> \
  --statuses error

# Check run counts
cargo-ai orchestration batch get <batch-uuid>
# → .runsCount = total records submitted
# → .executedRunsCount = records that completed (success or error)
# → .failedRunsCount = records that errored
```

**Partial retry pattern** — re-run only the failed records:

Get the failed records' IDs from `run list` (JSON on stdout, `runs[].recordId`) or, past its 100-row page, from orchestration SQL. **Not** from `run download` — that returns a signed URL to a gzipped CSV whose column is `_record_id`, so piping its stdout into `jq '.recordId'` yields nothing.

```bash
# 1a. Up to 100 failed records — straight from run list
RECORD_IDS=$(cargo-ai orchestration run list \
  --workflow-uuid <uuid> \
  --batch-uuid <batch-uuid> \
  --statuses error \
  --limit 100 | jq -c '[.runs[].recordId]')

# 1b. More than that — SQL, which has no page cap
RECORD_IDS=$(cargo-ai orchestration query execute \
  "SELECT record_id FROM runs
   WHERE batch_uuid = '<batch-uuid>' AND status = 'error'" \
  | jq -c '[.rows[].record_id]')

# 2. Re-trigger with only those record IDs
cargo-ai orchestration batch create \
  --workflow-uuid <uuid> \
  --data "{\"kind\":\"recordIds\",\"recordIds\":$RECORD_IDS}"
```

Re-running bills the paid nodes again — apply the pilot gate in [`../../cargo-gtm/references/cost-discipline.md`](../../cargo-gtm/references/cost-discipline.md) before enrolling the whole failed set.

### Agent message returns `status: "error"`

```bash
cargo-ai ai message get <msg-uuid>
# → Read .message.errorMessage for the root cause
```

Common causes:
- Agent ran out of steps (`maxSteps` exceeded) — increase `--max-steps` on the next call.
- Model quota or rate limit — retry after a delay.
- Tool call failed inside the agent — simplify the task or check the tool's connector credentials.

---

## Adding retry to nodes

For transient failures (rate limits, timeouts), add a `retry` config to the node definition:

```json
{
  "uuid": "...",
  "slug": "enrich",
  "kind": "connector",
  "retry": {
    "maximumAttempts": 3,
    "initialInterval": 1000,
    "backoffCoefficient": 2
  },
  ...
}
```

- `maximumAttempts` — how many times to try before marking the node as failed
- `initialInterval` — milliseconds before the first retry
- `backoffCoefficient` — multiplier for each subsequent retry interval (2 = exponential backoff)

Use `fallbackOnFailure: true` if you want execution to continue to the next node even when all retries are exhausted.

---

## Stuck / never-finishing operations

| Symptom | Likely cause | Fix |
|---|---|---|
| Run stuck in `pending` for >30s | Workflow not enabled, no deployed release | Check `isEnabled` on the tool/play; verify a release exists with `release list --workflow-uuid <uuid>` |
| Batch never reaches a terminal `status` | Individual runs are stuck or erroring | Run `run list --workflow-uuid <uuid> --batch-uuid <uuid>` to inspect per-record status |
| Agent message stuck in `generating` for >60s | Agent running multi-step actions | Wait up to 120s for complex agents; check `message get` for partial progress |
| Batch shows `executedRunsCount` less than `runsCount` after a long time | Some records are stuck | Check `run list` for `pending` or `generating` statuses; contact support if persistent |
