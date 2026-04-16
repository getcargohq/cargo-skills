---
name: cargo-cli-orchestration
description: Interact with the Cargo platform via CLI. Use when the user wants to execute an action, run a workflow, trigger a batch, message an AI agent, query a data warehouse, fetch segment records, or inspect a model schema.
license: MIT
compatibility: Requires @cargo-ai/cli (npm) and a Cargo API token
metadata:
  author: getcargo
  version: "1.4"
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

**References:**

> `references/actions.md` — action execute and execute-batch examples
> `references/tools.md` — tool (on-demand workflow) examples
> `references/plays.md` — play (segment-driven automation) examples
> `references/agents.md` — AI agent chat examples
> `references/nodes.md` — full node creation guide (kinds, native actions, expressions, validation, routing)
> `references/templates.md` — pre-built workflow templates
> `references/queries.md` — system of record query examples
> `references/segments.md` — segment fetch and filter examples
> `references/response-shapes.md` — full JSON response structures
> `references/filter-syntax.md` — complete filter condition reference
> `references/polling.md` — async polling patterns, error handling, retry strategies
> `references/troubleshooting.md` — common errors and how to fix them

## Prerequisites

```bash
npm install -g @cargo-ai/cli
cargo-ai login --token <your-api-token>
cargo-ai login --token <your-api-token> --workspace-uuid <uuid>
```

Verify with `cargo-ai whoami`. All commands output JSON to stdout. Without a global install, prefix every command with `npx @cargo-ai/cli` instead of `cargo-ai`.

Failed commands exit non-zero and return `{"errorMessage": "..."}`.

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
cargo-ai system-of-record sor list         # all systems of record
cargo-ai connection connector list         # all connectors
```

**Plays vs tools:** Both are backed by a workflow. A **play** is a segment-driven automation — it reacts to data changes in a segment (records added, updated, removed). A **tool** is an on-demand workflow — triggered manually, via API, or on a cron schedule. Workflows don't have a `name` field; use `play list` or `tool list` to find names and extract the `workflowUuid`.

**Designing a new tool or play?** Check templates first — they are pre-built node graphs for common automation patterns (enrichment pipelines, CRM syncs, lead scoring) and are an excellent starting point. List templates with `cargo-ai orchestration template list` and inspect a specific one with `cargo-ai orchestration template get <slug>`. Templates are tagged by `kind` so you can find ones suited for tools (`"kind":"tool"`) or plays (`"kind":"play"`) right away. See `references/templates.md` for the full guide.

**Compatibility rules:**

- **`run create`** — only works with **tool** workflows (or no `workflowUuid`). Play workflows return `playNotCompatible`.
- **`batch create`** — allowed data kinds depend on the workflow type:
  - **Play** workflows: `segment`, `change`, `filter`, `recordIds`
  - **Tool** workflows (or no `workflowUuid`): `file`, `records`

## Quick reference

```bash
# Single actions
cargo-ai orchestration action execute --action '{"kind":"tool","toolUuid":"<uuid>","config":{}}' --data '{"domain":"acme.com"}'
cargo-ai orchestration action execute-batch --action '{"kind":"connector","integrationSlug":"clearbit","actionSlug":"company_enrich","config":{}}' --records '[{...},{...}]'

# Workflows (chain multiple actions)
cargo-ai orchestration run create --workflow-uuid <uuid> --data '{"company":"Acme","domain":"acme.com"}'
cargo-ai orchestration run create --data '{"domain":"acme.com"}' --nodes '[...]'
cargo-ai orchestration batch create --workflow-uuid <uuid> --data '{"kind":"segment","segmentUuid":"..."}'

# AI agents
cargo-ai ai message create --chat-uuid <uuid> --parts '[{"type":"text","text":"..."}]'

# Data
cargo-ai system-of-record client query "SELECT * FROM companies LIMIT 10"
cargo-ai segmentation segment fetch --model-uuid <uuid> --filter '{"conjonction":"and","groups":[]}' --fetching-limit 100
cargo-ai storage model get-ddl <model-uuid>
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
  --action '{"kind":"connector","integrationSlug":"clearbit","actionSlug":"company_enrich","config":{}}' \
  --data '{"domain":"acme.com"}' \
  --wait-until-finished

# One action, many records → returns a batch
cargo-ai orchestration action execute-batch \
  --action '{"kind":"tool","toolUuid":"<tool-uuid>","config":{}}' \
  --records '[{"domain":"acme.com"},{"domain":"globex.com"}]' \
  --wait-until-finished
```

Action kinds: `tool`, `connector`, `agent`, `native`. See `references/actions.md` for all action kinds, parameters, retry config, response shapes, and end-to-end examples.

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

See `references/tools.md` for file uploads, monitoring, and cancellation. See `references/nodes.md` for custom node graphs.

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

See `references/plays.md` and `references/tools.md` for filtering, record IDs, file uploads, monitoring, and cancellation.

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

Also supports `--actions`, `--resources`, `--language-model-slug`, `--temperature`, `--max-steps`, and `--wait-until-finished` (blocks until the assistant message reaches a terminal status). See `references/agents.md` for multi-turn conversations, action/resource injection, and model selection.

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

## Query the system of record

Run SQL against your connected data warehouse. **Always get the DDL first** — it contains the exact table name and columns. Do not guess table names.

```bash
cargo-ai storage model get-ddl <model-uuid>
# → Use the table name from DDL (e.g. datasets_default.models_companies)

cargo-ai system-of-record client query \
  "SELECT * FROM datasets_default.models_companies LIMIT 10"
# → Check outcome: "queried" (success) or "notQueried" (error)
```

Also supports `fetch` (paginated), `download` (full export), and `get-documentation` (plain text, not JSON). See `references/queries.md` for WHERE clauses, aggregations, joins, date queries, and pagination.

## Fetch segment data

Retrieve live records from a segment. **IMPORTANT:** requires `--model-uuid` (not `--segment-uuid`). Get the `modelUuid` from `segment list`. Filter JSON uses `conjonction` (not `conjunction`) — this is intentional.

```bash
cargo-ai segmentation segment fetch \
  --model-uuid <uuid> \
  --filter '{"conjonction":"and","groups":[]}' \
  --fetching-limit 100 --fetching-offset 0
```

Supports `--sort`, `--enrich`, and `--sync`. See `references/filter-syntax.md` for the full filter syntax and `references/segments.md` for filtering, pagination, sorting, enrollment filters, and enrichment.

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

See `references/templates.md` for the full guide including placeholder conventions and end-to-end examples.

## Validate and test nodes

Always validate custom node graphs before running them.

```bash
cargo-ai orchestration node validate --nodes '[...]'
# → { "outcome": "valid" } or { "outcome": "notValid", "invalidNodes": [...] }
```

For debugging, use `node compute` (dry-run expressions) or `node execute` (live test, costs credits). See `references/nodes.md` for the full node creation guide, validation error codes, and examples.

## Help

Every command supports `--help`:

```bash
cargo-ai orchestration run create --help
cargo-ai orchestration template list --help
cargo-ai orchestration node validate --help
cargo-ai ai message create --help
cargo-ai system-of-record client --help
```
