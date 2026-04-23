# Troubleshooting

Common errors and recovery steps for `cargo-cli-orchestration` commands.

> For async polling patterns, partial batch failures, and retry node configuration, see `references/polling.md`.

## General

| Symptom                                      | Cause                            | Fix                                                                       |
| -------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------- |
| `{"errorMessage": "..."}` with non-zero exit | Any CLI error                    | Read the `errorMessage` — it usually says exactly what's wrong            |
| `command not found: cargo-ai`                | CLI not installed or not in PATH | Run `npm install -g @cargo-ai/cli` or prefix with `npx @cargo-ai/cli`     |
| `Unauthorized` or `Forbidden`                | Bad or expired API token         | Re-run `cargo-ai login --token <token>` and verify with `cargo-ai whoami` |

## Runs and batches

| Symptom                             | Cause                                              | Fix                                                                                                         |
| ----------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Run stuck in `pending`              | Workflow may be paused or have no deployed release | Check that the play/tool `isEnabled` is `true`; verify a release exists with `release list --workflow-uuid` |
| Batch never finishes                | Individual runs may be erroring or stuck           | List runs for the batch: `run list --workflow-uuid <uuid> --batch-uuid <uuid>` and check for errors         |
| `Workflow not found`                | Wrong UUID                                         | Re-run `play list` or `tool list` and double-check the `workflowUuid`                                       |
| `playNotCompatible` on `run create` | Used a play's `workflowUuid` with `run create`     | Plays don't support `run create` — use `batch create` instead                                               |
| `invalidDataKind` on `batch create` | Data kind not allowed for the workflow type        | Plays accept: `segment`, `change`, `filter`, `recordIds`. Tools accept: `file`, `records`                   |
| Run finishes with `error` status    | Workflow step failed                               | Get run details with `run get <uuid>` — the error usually points to a specific node                         |

## AI agents

| Symptom                                                              | Cause                                    | Fix                                                                        |
| -------------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------- |
| Assistant message stuck in `pending` or `generating` for a long time | Agent may be running multi-step actions   | Wait longer (up to 60s for complex tasks); check with `message get <uuid>` |
| Message returns `error` status                                       | Agent encountered an unrecoverable error | Read `.message.errorMessage`; try again with simpler input or fewer actions |
| `Chat not found`                                                     | Wrong UUID or chat was deleted           | Re-create with `chat create`                                               |
| `Agent not found`                                                    | Wrong UUID                               | Re-run `agent list` to get current UUIDs                                   |

## System of record queries

| Symptom                                        | Cause                                  | Fix                                                                               |
| ---------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------- |
| `outcome: "notQueried"` with "Table not found" | Wrong table name                       | Re-run `storage model get-ddl <uuid>` and use the exact table name from the DDL   |
| `outcome: "notQueried"` with syntax error      | SQL dialect mismatch                   | Check whether your SoR is BigQuery, Snowflake, etc. and adjust syntax accordingly |
| `outcome: "notQueried"` with permission error  | SoR connection issue                   | Verify the connection is active in Cargo; try `sor list` to check status          |
| Query returns empty rows                       | Filter too restrictive, or wrong table | Verify table name with DDL; try a broader query first (`SELECT * ... LIMIT 5`)    |

## Debugging a workflow run

A run can finish with `status: "success"` and still be wrong — wrong branch taken, empty downstream values, no Slack message sent. Use this checklist when behavior doesn't match expectations.

### 1. Pull the per-node executions and context

```bash
cargo-ai orchestration run get <run-uuid>
```

The response has three top-level fields:

| Field                | What it gives you                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| `run.executions[]`   | Node-by-node trace (which node ran, status, routing)                                             |
| `runContext`         | Full per-node output, keyed by `nodeSlug` — the actual data referenced as `{{nodes.<slug>...}}`  |
| `runComputedConfigs` | Per-node resolved config values (what each node was actually called with), also keyed by `nodeSlug` |

Each `executions[]` item has:

| Field            | What it tells you                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------ |
| `nodeSlug`       | Which node ran                                                                                   |
| `status`         | `success` / `error` for this node                                                                |
| `nextNodeUuid`   | Where execution went next — for a `branch`, this reveals which child was taken                   |
| `nodeChildIndex` | Index into `childrenUuids` that was followed (`0` = matched/yes, `1` = not matched/no for branch)|
| `title`          | Human-readable **summary only** — may be truncated; do not treat as the full output              |
| `creditsUsedCount` | Per-node cost; agent and connector nodes are non-zero, native nodes are zero                  |

`title` is a quick sanity check, not a source of truth — it can be truncated. To verify the exact data a node produced, read `runContext.<nodeSlug>` from the same response. Deep-dive into it to confirm the path you're referencing in `{{nodes.<slug>....}}` actually exists (for example, an agent's structured output is nested under `.answer`, so the right path is `{{nodes.<slug>.answer.<field>}}` and not `{{nodes.<slug>.<field>}}`).

### 2. Spot wrong-branch routing

If a `branch` node's `title` says "❌ Condition is not matched" but you expected the yes-path, the condition expression resolved to falsy. Most common causes:

| Cause | Fix |
|---|---|
| Path in the expression doesn't exist | Read `runContext.<upstreamSlug>` from `run get <run-uuid>` and check the actual shape — common case: an agent's output is nested under `.answer`, so `{{nodes.qualify.qualified}}` resolves to undefined while `{{nodes.qualify.answer.qualified}}` works |
| Stringified boolean comparison | `{{nodes.qualify.answer.qualified === true}}` may evaluate the inner expression as a string template — prefer the truthy form `{{nodes.qualify.answer.qualified}}` |
| Field actually missing from the output | The upstream node didn't produce it — `runContext.<upstreamSlug>` will confirm. For agents, this usually means revisiting the prompt + `jsonSchema` |
| Typo in slug or field | Slugs are case-sensitive; `nodes.Qualify.answer.qualified` won't resolve |

### 3. Re-run a single record after fixing

```bash
# Stage the fix without deploying (per workflow safety)
cargo-ai orchestration draft-release update \
  --workflow-uuid <play.workflowUuid> --nodes '[...]'

# After approval, deploy (do NOT pass --version — it collides with the global flag)
cargo-ai orchestration draft-release deploy \
  --workflow-uuid <play.workflowUuid> --nodes '[...]' \
  --form-fields 'null' --description "Fix branch condition"

# Re-test against the same record IDs that exposed the bug
cargo-ai orchestration batch create \
  --workflow-uuid <play.workflowUuid> \
  --data '{"kind":"recordIds","modelUuid":"<model>","ids":["id1","id2","id3"]}'
```

### 4. Common silent-failure modes

| Symptom in `run get` | Likely cause |
|---|---|
| Run is `success` but nothing downstream of a node fired | Downstream expression resolved to undefined — open `runContext.<upstreamSlug>` from `run get` and compare against the path you wrote |
| Branch always takes the same child | Condition references a non-existent path; `{{...}}` resolved to undefined which is falsy — verify against `runContext.<upstreamSlug>` |
| `find_email`/connector node ran but downstream values are empty | Connector returned a partial response — read `runContext.<nodeSlug>` from `run get` to see the exact shape, then use the actual field names (e.g. `nodes.find_email.email` may be `nodes.find_email.contact.email` for some integrations) |
| Slack post succeeded but message body has `{{...}}` literals | Template syntax error — a stray space or a missing closing `}}` makes the template engine treat the segment as plain text |
| End-node variables are all empty in a successful run | The `value` expressions reference paths that don't exist; cross-check each upstream node's `runContext.<slug>` from `run get` (don't rely on `title` — it may be truncated) |

## Run error recovery

When a run reaches `status: "error"`, follow this sequence:

1. **Inspect the run:** `cargo-ai orchestration run get <run-uuid>` — look at each node's output for error details.
2. **Identify the failing node:** The error message typically names the connector, agent, or native node that failed.
3. **Common causes and fixes:**

| Error pattern | Likely cause | Fix |
|---|---|---|
| Rate limit / 429 from connector | Too many requests to external API | Add `retry` config to the node with exponential backoff; reduce batch size |
| Connector credentials expired | OAuth token or API key is stale | Re-authenticate the connector in the Cargo app or via `connection connector update` |
| Agent `maxSteps` exceeded | Agent ran too many tool calls | Increase `--max-steps` on the message, or simplify the agent's task |
| `filter` node stopped execution | Record didn't meet the filter condition | This is expected behavior, not an error — adjust the filter if needed |
| Null reference in expression | Upstream node returned empty/null | Add a `filter` node before the failing node to skip records with missing data |
| `outcome: "notQueried"` on SoR | Wrong table name or SQL syntax error | Re-run `model get-ddl <uuid>` and use the exact table name |

4. **Re-trigger after fixing:** Create a new run with the corrected data or node config.
5. **For systematic failures:** Use `run download --statuses error` to export all failed records, fix the data, then re-batch with `batch create --data '{"kind":"recordIds",...}'`.

## Batch sizing and third-party connector rate limits

> **Scope:** Rate limits only apply to **third-party connector nodes** (`kind: "connector"`) — integrations like Clearbit, HubSpot, Salesforce, etc. Native nodes (`kind: "native"`) have no rate limits.

Third-party connector rate limits are the most common production failure mode for large batches. The pattern below avoids hitting them.

**Recommended approach — start small and scale:**

| Batch size | What to do |
|---|---|
| 1 record | Run a single record first with `run create`. Confirm it succeeds and check per-record credit cost. |
| 10–50 records | Run a small pilot batch with `batch create --data '{"kind":"recordIds",...}'`. Check error rate with `run count --statuses error`. |
| 100–500 records | If error rate is < 5%, proceed. Monitor with `run count` mid-batch. |
| 1000+ records | Only after validating at smaller scale. Increase polling interval to 10–15s. Set `retry` on connector nodes. |

**Signs you are being rate-limited by a third-party connector:**

- Error count grows proportionally as the batch runs (not all failures upfront).
- Connector error messages include `429`, `rate limit`, or `too many requests`.
- Errors are clustered in time rather than spread evenly.

**Mitigations:**

- Add `retry` with exponential backoff to the connector node (see `references/polling.md`).
- Split large batches into smaller sub-batches run sequentially.
- Use `--data '{"kind":"recordIds",...}'` to process in controlled chunks rather than an entire segment at once.

## Segment fetch

| Symptom                    | Cause                             | Fix                                                                                                           |
| -------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Empty results              | Wrong model UUID or over-filtered | Verify `--model-uuid` (not `--segment-uuid`); try with empty filter `{"conjonction":"and","groups":[]}` first |
| Parse error on filter JSON | Malformed JSON or wrong spelling  | Check: it's `conjonction` (not `conjunction`); validate JSON syntax; see `references/filter-syntax.md`        |
| `Model not found`          | Wrong UUID                        | Re-run `storage model list` or `segment list` to get the correct `modelUuid`                                  |
| Wrong columns in results   | Column slug mismatch              | Run `storage model list` and check `columns[].slug` for exact slugs                                           |
