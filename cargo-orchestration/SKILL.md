---
name: cargo-orchestration
description: Interact with the Cargo platform via CLI. Use when the user wants to execute an action, run a workflow, trigger a batch, message an AI agent, query orchestration runtime tables (runs/batches/spans/records) with SQL, fetch segment records, resolve an action's output schema, or inspect a model schema.
version: "1.5.1"
compatibility: Requires @cargo-ai/cli (npm) and a Cargo account (browser sign-in via --oauth, or an API token)
homepage: https://github.com/getcargohq/cargo-skills
metadata:
  author: getcargo
  openclaw:
    requires:
      bins:
        - cargo-ai
    install:
      - kind: node
        package: "@cargo-ai/cli@latest"
        bins:
          - cargo-ai
    homepage: https://github.com/getcargohq/cargo-skills
---

# Cargo CLI — Orchestration

Runtime operations for the Cargo platform.

**What do you want to run?**

```
Need to run something?
├── One action, one record       → action execute
├── One action, many records     → action execute-batch
├── Multiple actions chained
│   ├── One-off / ad-hoc         → run create --nodes (one record)
│   │                              batch create --nodes (many records)
│   └── Reusable workflow        → build a tool, then run create --workflow-uuid
│                                  or batch create --workflow-uuid
└── Conversational AI agent      → message create
```

> **Terminology:** An orchestration **tool** is a saved on-demand workflow (listed via `tool list`). An **action** is a single operation you execute without building a workflow — it can embed a saved orchestration tool (`kind: "tool"`), call a third-party connector (`kind: "connector"`), invoke an AI agent (`kind: "agent"`), or run a built-in platform operation (`kind: "native"`).

> **Composing a node graph? Prefer built-in actions + expressions.** Use the
> actions Cargo already provides plus template expressions; avoid `python`,
> `script` (JS), and raw HTTP nodes unless you truly have no alternative. Reshape
> data → `variables`; call an LLM and get parsed JSON → native `agent` node; call an
> API → the integration's dedicated **connector action**; route → `branch`/`filter`/`switch`.
> See **`references/node-selection.md`**.

**References:**

> `references/examples/actions.md` — action execute and execute-batch examples
> `references/examples/tools.md` — tool (on-demand workflow) examples
> `references/examples/plays.md` — play (segment-driven automation) examples
> `references/examples/agents.md` — AI agent chat examples
> `references/examples/templates.md` — pre-built workflow templates
> `references/examples/queries.md` — `orchestration query execute` (ClickHouse: runs/batches/spans/records) SQL examples. For `storage query` (workspace storage), see the `cargo-storage` skill.
> `references/examples/segments.md` — segment fetch and filter examples
> `references/nodes.md` — full node creation guide (kinds, native actions, expressions, validation, routing)
> `references/node-selection.md` — **how to pick the right node and avoid unnecessary `python` nodes** (decision table, native LLM `agent` node, template-expression limits, the silent-undefined footgun, inspecting node data via `runContext`, Pyodide sandbox limits, what survives a `delay`, group result access)
> `references/filter-syntax.md` — complete filter condition reference
> `references/polling.md` — async polling patterns, error handling, retry strategies
> `references/response-shapes.md` — full JSON response structures
> `references/troubleshooting.md` — common errors, plus a "Debugging a workflow run" section for runs that succeed but produce wrong output (wrong-branch routing, empty downstream values)

> **Diagnosing after the fact?** For the ordered forensic runbooks built on these surfaces — trace one run, sweep a batch for errors grouped by root cause, profile a play's credit spend — load the [`cargo-diagnostics`](../cargo-diagnostics/SKILL.md) skill.

## Prerequisites

See [`../cargo/references/prerequisites.md`](../cargo/references/prerequisites.md) for install, login (`--oauth` / `--token`), JSON output conventions, and error shapes. Verify the session with `cargo-ai whoami` before running any of the commands below.

## Discover resources first

Most commands require UUIDs. Always discover them before acting.

```bash
cargo-ai orchestration play list            # all plays (name, workflowUuid, modelUuid, segmentUuid)
cargo-ai orchestration tool list            # all tools (name, workflowUuid, description)
cargo-ai orchestration workflow list        # all workflows (uuid only — no name)
cargo-ai orchestration template list       # all workflow templates (slug, name, kind)
cargo-ai ai agent list                     # all agents (uuid, name)
cargo-ai ai template list                  # all AI agent templates (slug, name, languageModelSlug)
cargo-ai storage model list                # all models (uuid, name, slug, columns)
cargo-ai storage dataset list              # all datasets
cargo-ai segmentation segment list         # all segments (uuid, name, modelUuid)
cargo-ai connection connector list         # all connectors
```

**Plays vs tools:** Both are backed by a workflow. A **play** is a segment-driven automation — it reacts to data changes in a segment (records added, updated, removed). A **tool** is an on-demand workflow — triggered manually, via API, or on a cron schedule. Workflows don't have a `name` field; use `play list` or `tool list` to find names and extract the `workflowUuid`.

**Retrieve in the UI:** plays live at `app.getcargo.io/workspaces/<WORKSPACE_UUID>/plays/<PLAY_UUID>` and tools at `app.getcargo.io/workspaces/<WORKSPACE_UUID>/tools/<TOOL_UUID>`. Get `<WORKSPACE_UUID>` from `cargo-ai whoami` under `workspace.uuid`.

**Designing a new tool or play?** Check templates first — they are pre-built node graphs for common automation patterns (enrichment pipelines, CRM syncs, lead scoring) and are an excellent starting point. List templates with `cargo-ai orchestration template list` and inspect a specific one with `cargo-ai orchestration template get <slug>`. Templates are tagged by `kind` so you can find ones suited for tools (`"kind":"tool"`) or plays (`"kind":"play"`) right away. See `references/examples/templates.md` for the full guide.

**Compatibility rules:**

- **`run create`** — only works with **tool** workflows (or no `workflowUuid`). Play workflows return `playNotCompatible`.
- **`batch create`** — allowed data kinds depend on the workflow type:
  - **Play** workflows: `segment`, `change`, `filter`, `recordIds`
  - **Tool** workflows (or no `workflowUuid`): `file`, `records`

## Quick reference

```bash
# Single actions
cargo-ai orchestration action execute --action '{"kind":"tool","toolUuid":"<uuid>","config":{}}' --data '{"domain":"acme.com"}'
cargo-ai orchestration action execute-batch --action '{"kind":"connector","integrationSlug":"clearbit","actionSlug":"enrichCompany","config":{}}' --records '[{...},{...}]'
cargo-ai orchestration action get-output-schema --action '{"kind":"connector","integrationSlug":"clearbit","actionSlug":"enrichCompany","config":{}}' # → {"schema": <JSON Schema>} without executing

# Workflows (chain multiple actions)
cargo-ai orchestration run create --workflow-uuid <uuid> --data '{"company":"Acme","domain":"acme.com"}'
cargo-ai orchestration run create --data '{"domain":"acme.com"}' --nodes '[...]'
cargo-ai orchestration batch create --workflow-uuid <uuid> --data '{"kind":"segment","segmentUuid":"..."}'

# AI agents
cargo-ai ai message create --chat-uuid <uuid> --parts '[{"type":"text","text":"..."}]'

# Data
cargo-ai orchestration query execute "SELECT count() FROM runs WHERE status='error'" # ClickHouse: spans, runs, batches, records
cargo-ai segmentation segment fetch --model-uuid <uuid> --filter '{"conjonction":"and","groups":[]}' --fetching-limit 100
# For SQL against workspace storage (Companies, Contacts, …), see the cargo-storage skill: `storage query execute`
```

## Polling async operations

All operations are asynchronous. Either poll until terminal state, or pass `--wait-until-finished` to block.

`action execute` returns a run. `action execute-batch` returns a batch. They poll the same way:

| Result type     | Poll command         | Interval | Done when                                      |
| --------------- | -------------------- | -------- | ---------------------------------------------- |
| Run             | `run get <uuid>`     | 2s       | `status` is `success`, `error`, or `cancelled` |
| Batch           | `batch get <uuid>`   | 5s       | `status` is `success`, `error`, or `cancelled` |
| Agent message   | `message get <uuid>` | 2s       | `status` is `success` or `error`               |

For long-running batches (1000+ records), increase the interval to 10-15s after the first minute.

## Execute actions

Run a single action — no workflow or node graph needed.

```bash
# One action, one record → returns a run
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"clearbit","actionSlug":"enrichCompany","config":{}}' \
  --data '{"domain":"acme.com"}' \
  --wait-until-finished

# One action, many records → returns a batch
cargo-ai orchestration action execute-batch \
  --action '{"kind":"tool","toolUuid":"<tool-uuid>","config":{}}' \
  --records '[{"domain":"acme.com"},{"domain":"globex.com"}]' \
  --wait-until-finished
```

Action kinds: `tool`, `connector`, `agent`, `native`. See `references/examples/actions.md` for all action kinds, parameters, retry config, response shapes, and end-to-end examples.

### Resolve an action's output schema (without executing)

**Never guess what an action outputs.** Two free sources — no run, no credits:

1. **Connector actions:** the integration catalog carries the output schema inline — `integration get <slug>` (and `integration list`) return `actions.<actionSlug>.output.schema` next to the input `config.jsonSchema`. Not every action declares one.
2. **Any action kind** (`tool` / `connector` / `agent` / `native`) — resolve it with the same `--action` object as `action execute`:

```bash
cargo-ai orchestration action get-output-schema \
  --action '{"kind":"connector","integrationSlug":"clearbit","actionSlug":"enrichCompany","config":{}}'
# → {"schema": {"type": "object", "properties": {...}}}  — the JSON Schema is under the top-level "schema" key
```

Actions that declare no output schema fail with `"Action has no output schema."` (non-zero exit, status 404) — that's the signal to fall back to inspecting `runContext` from a real run. Use these to:

- Know which fields a downstream node can read (`{{nodes.<slug>.<field>}}`) **before** wiring the graph.
- See an `agent` action's real output envelope — a default free-text agent resolves to `{"schema":{"type":"object","properties":{"answer":{"type":"string"}}}}`, which is why downstream references need `{{nodes.<slug>.answer...}}`.
- Map an action's output onto storage columns without a throwaway run.

See `references/examples/actions.md` ("Resolve an action's output schema") for verified per-kind examples and the response/error shapes.

## Create a run

A run processes a single record through a workflow. Use `run create` when you need to **chain multiple actions** together via a node graph, or when running an existing tool workflow.

**Runs only work with tool workflows.** Play workflows return `playNotCompatible` — use `batch create` instead.

```bash
cargo-ai orchestration run create \
  --workflow-uuid <tool.workflowUuid> \
  --data '{"company":"Acme","domain":"acme.com"}'
# → Poll with: cargo-ai orchestration run get <run-uuid>

# Or wait synchronously — blocks until the run reaches a terminal state and returns the final result
cargo-ai orchestration run create \
  --workflow-uuid <tool.workflowUuid> \
  --data '{"company":"Acme","domain":"acme.com"}' \
  --wait-until-finished
```

Also supports `--release-uuid` to pin a specific release.

**Cancelling runs:**

```bash
cargo-ai orchestration run cancel --workflow-uuid <uuid> --uuids run-uuid-1,run-uuid-2
```

See `references/examples/tools.md` for file uploads, monitoring, and cancellation. See `references/nodes.md` for custom node graphs.

## Create a batch

Batches process multiple records at once. Allowed data kinds depend on the workflow type:

- **Play** workflows: `segment`, `change`, `filter`, `recordIds`
- **Tool** workflows (or no `workflowUuid`): `file`, `records`

```bash
# Play workflow — run on a segment
cargo-ai orchestration batch create \
  --workflow-uuid <play.workflowUuid> \
  --data '{"kind":"segment","segmentUuid":"..."}'

# Tool workflow — run on a file
cargo-ai orchestration batch create \
  --workflow-uuid <tool.workflowUuid> \
  --data '{"kind":"file","s3Filename":"..."}'
# → Poll with: cargo-ai orchestration batch get <batch-uuid>

# Or wait synchronously — blocks until the batch reaches a terminal state and returns the final result
cargo-ai orchestration batch create \
  --workflow-uuid <play.workflowUuid> \
  --data '{"kind":"segment","segmentUuid":"..."}' \
  --wait-until-finished
```

**Downloading results:** get the `releaseUuid` from batch get, then `cargo-ai orchestration release get <release-uuid>` to find `nodes[].slug`, then `cargo-ai orchestration batch download --uuid <batch-uuid> --output-node-slug <slug>`.

**Cancelling a batch:**

```bash
cargo-ai orchestration batch cancel <batch-uuid>
```

See `references/examples/plays.md` and `references/examples/tools.md` for filtering, record IDs, file uploads, monitoring, and cancellation.

## Send a message to an AI agent

```bash
cargo-ai ai agent list                                    # 1. Find the agent
cargo-ai ai chat create \                                 # 2. Create a chat
  --trigger '{"type":"draft"}' \
  --agent-uuid <agent-uuid> --name "Research session"
cargo-ai ai message create \                              # 3. Send a message
  --chat-uuid <chat-uuid> \
  --parts '[{"type":"text","text":"Find the VP of Sales at Acme Corp"}]'
# → Extract assistantMessage.uuid, poll with: cargo-ai ai message get <uuid>
#   Done when .message.status is "success" (read .parts) or "error" (read .errorMessage)
```

Also supports `--actions`, `--resources`, `--language-model-slug`, `--temperature`, `--max-steps`, and `--wait-until-finished` (blocks until the assistant message reaches a terminal status). See `references/examples/agents.md` for multi-turn conversations, action/resource injection, and model selection.

## Inspect records

Records are individual items processed by a workflow. Use these commands to list, count, download, or cancel records within a workflow.

```bash
# List records for a workflow
cargo-ai orchestration record list --workflow-uuid <uuid> --limit 50

# Filter by batch or status
cargo-ai orchestration record list --workflow-uuid <uuid> --batch-uuid <uuid> --statuses error

# Count records
cargo-ai orchestration record count --workflow-uuid <uuid>

# Download records as a file
cargo-ai orchestration record download --workflow-uuid <uuid>

# Get per-node execution metrics
cargo-ai orchestration record get-metrics --workflow-uuid <uuid>

# Cancel records
cargo-ai orchestration record cancel --workflow-uuid <uuid> --ids record-id-1,record-id-2
```

## Query orchestration history (orchestration query)

Run SQL against orchestration runtime tables — `spans`, `runs`, `batches`, `records` — with `orchestration query execute`. Use this for ad-hoc analytics on workflow execution (error rates, throughput, slowest nodes) without the workflow-scoped filters of `run get-metrics` / `run count`.

```bash
cargo-ai orchestration query execute "SELECT count() FROM runs WHERE status = 'error'"
cargo-ai orchestration query execute "SELECT status, count() FROM batches GROUP BY status"
cargo-ai orchestration query execute "SELECT * FROM spans ORDER BY execution_started_at DESC LIMIT 10"
```

Tables are referenced without a schema prefix — just `spans`, `runs`, `batches`, or `records`. Workspace scoping is applied automatically. The query is read-only; DDL, table functions, dictionary accessors, and introspection are denied. See `references/examples/queries.md` for the schemas, example queries, and limits.

## Fetch segment data

Retrieve live records from a segment. **IMPORTANT:** requires `--model-uuid` (not `--segment-uuid`). Get the `modelUuid` from `segment list`. Filter JSON uses `conjonction` (not `conjunction`) — this is intentional.

```bash
cargo-ai segmentation segment fetch \
  --model-uuid <uuid> \
  --filter '{"conjonction":"and","groups":[]}' \
  --fetching-limit 100 --fetching-offset 0
```

Supports `--sort`, `--enrich`, and `--sync`. See `references/filter-syntax.md` for the full filter syntax and `references/examples/segments.md` for filtering, pagination, sorting, enrollment filters, and enrichment.

**Managing segments:**

```bash
# Update a segment's name or filter
cargo-ai segmentation segment update --uuid <segment-uuid> --name "Updated Name"
cargo-ai segmentation segment update --uuid <segment-uuid> --filter '{"conjonction":"and","groups":[...]}'

# Remove a segment (fails if linked to a workflow)
cargo-ai segmentation segment remove <segment-uuid>
```

## Use a workflow template

Templates are pre-built node graphs for common automation patterns (enrichment pipelines, CRM syncs, lead scoring). Browse with `template list`, inspect with `template get <slug>`, fill in placeholders, validate, and run.

```bash
cargo-ai orchestration template list              # list available templates
cargo-ai orchestration template get <slug>        # get template nodes + config
```

See `references/examples/templates.md` for the full guide including placeholder conventions and end-to-end examples.

## Validate and test nodes

Always validate custom node graphs before running them.

```bash
cargo-ai orchestration node validate --nodes '[...]'
# → { "outcome": "valid" } or { "outcome": "notValid", "invalidNodes": [...] }
```

For debugging, use `node compute` (dry-run expressions) or `node execute` (live test, costs credits). For runs that complete with `status: success` but produce wrong output (wrong branch taken, empty downstream values), use `run.executions[].title` from `run get` only as a quick summary — it may be truncated — and read `runContext.<nodeSlug>` (returned at the top level of the same `run get <run-uuid>` response) to verify field-level data. See `references/troubleshooting.md` → "Debugging a workflow run" and `references/nodes.md` for the full node creation guide, validation error codes, and examples.

## Help

Every command supports `--help`:

```bash
cargo-ai orchestration run create --help
cargo-ai orchestration template list --help
cargo-ai orchestration node validate --help
cargo-ai ai message create --help
cargo-ai orchestration query execute --help
```
