# Batch error sweep — group failures by root cause

Use this when many runs are involved and you don't yet know where to look: a batch reports errors, a play's error rate spiked, or "some records didn't come through". The output of a sweep is a **small table of failure groups with an exemplar run UUID each** — not a list of every failed run.

> SQL syntax, table columns, and query caps: [`../../cargo-orchestration/references/examples/queries.md`](../../cargo-orchestration/references/examples/queries.md). All queries below are read-only and workspace-scoped automatically.

## 1. Size the problem

```bash
# For one batch
cargo-ai orchestration query execute \
  "SELECT status, count() FROM runs WHERE batch_uuid = '<batch-uuid>' GROUP BY status"

# For a play/workflow over time
cargo-ai orchestration query execute \
  "SELECT countIf(status='error') / count() AS error_rate, count() AS total
   FROM runs
   WHERE workflow_uuid = '<workflow-uuid>' AND created_at > now() - INTERVAL 7 DAY"
```

Calibration: error rates under ~5% on connector-heavy workflows are often provider coverage, not defects (see the over-provision rule in [`cost-discipline.md`](../../cargo-gtm/references/cost-discipline.md)). A spike above that, or errors on native nodes, is worth the sweep.

## 2. Find where failures concentrate

```bash
# Which node fails most
cargo-ai orchestration query execute \
  "SELECT node_slug, count() AS failures
   FROM spans
   WHERE execution_status='error' AND execution_started_at > now() - INTERVAL 1 DAY
   GROUP BY node_slug
   ORDER BY failures DESC"
```

Scope with `batch_uuid`/`workflow_uuid` predicates when you have them. Two shapes to distinguish:

- **Concentrated** (one node owns most failures) → a config, credential, or expression defect at that node. Proceed to step 3 with that node.
- **Spread across connector nodes, clustered in time** → third-party rate limiting. Confirm with the "signs you are being rate-limited" checklist in [`troubleshooting.md`](../../cargo-orchestration/references/troubleshooting.md); the fix is retry config + smaller sub-batches, not per-run debugging.

## 3. Pick exemplars and read the actual errors

```bash
cargo-ai orchestration query execute \
  "SELECT uuid, created_at
   FROM runs
   WHERE batch_uuid = '<batch-uuid>' AND status='error'
   ORDER BY created_at ASC
   LIMIT 3"
```

Take 2–3 exemplars per failure group and trace each with [`run-trace.md`](run-trace.md) — the error detail lives in `run get`'s `runContext`, not in the SQL tables. Failures with the same node + same error pattern are one group; resist tracing every run.

## 4. Decide: fix, re-run, or report

| Root cause shape | Action |
| --- | --- |
| Expression/branch defect (same wrong output every time) | Fix the node, re-test on exemplar record IDs, then re-run only the failed records: `run download --statuses error` → fix → `batch create --data '{"kind":"recordIds",...}'` (sequence in [`troubleshooting.md`](../../cargo-orchestration/references/troubleshooting.md), "Run error recovery") |
| Expired connector credentials | Re-authenticate the connector (`connection connector update` or the Cargo app), then re-run failed records |
| Provider rate limiting | Retry config + sequential sub-batches; don't chase individual rows |
| Provider coverage (no email exists, company not found) | Expected loss — drop the rows per the over-provision rule; do **not** re-run them through more providers |
| CLI/platform behavior contradicts the docs | File it — this is exactly what the report channel is for: `cargo-ai workspaceManagement report create --title "..." --description "<commands, errorMessage verbatim, expected vs actual, UUIDs>"` |

Any re-run of paid nodes is a paid action: pilot gate + receipt per [`cost-discipline.md`](../../cargo-gtm/references/cost-discipline.md).

## Presenting a sweep

Per [`../../cargo/references/interaction.md`](../../cargo/references/interaction.md): conclusion first ("one root cause explains 18 of 20 failures"), then the groups table, then the recommended action per group. Example shape:

```
Batch <uuid>: 20 of 250 runs errored. Two groups:

| group | runs | node        | root cause                            | action                    |
|-------|------|-------------|----------------------------------------|---------------------------|
| 1     | 18   | find_email  | connector token expired (401 verbatim) | re-auth, re-run 18 records |
| 2     | 2    | enrich_co   | provider has no data for these domains | drop rows (coverage)      |

Re-running group 1 ≈ <n> credits. Proceed?
```
