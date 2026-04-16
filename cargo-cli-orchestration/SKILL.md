---
name: cargo-cli-orchestration
description: Interact with the Cargo platform via CLI. Use when the user wants to run a workflow, trigger a batch, message an AI agent, query a data warehouse, fetch segment records, or inspect a model schema.
license: MIT
compatibility: Requires @cargo-ai/cli (npm) and a Cargo API token
metadata:
  author: getcargo
  version: "1.3"
---

# Cargo CLI — Orchestration

Runtime operations for the Cargo platform.

**What do you want to do?**

| Goal                                          | Command                    | Section                 |
| --------------------------------------------- | -------------------------- | ----------------------- |
| Run **one action** on **one** record           | `action execute`           | Execute a single action |
| Run **one action** on **many** records         | `action execute-batch`     | Execute a batch action  |
| **Chain actions** into a workflow on one record | `run create` (with nodes) | Create a run            |
| **Chain actions** across many records          | `batch create`             | Create a batch          |
| Chat with an **AI agent**                      | `message create`           | Send a message          |
| **Query** your data warehouse                  | `system-of-record client`  | Query the SoR           |
| **Fetch** live segment records                 | `segment fetch`            | Fetch segment data      |
| **Inspect** a model's table shape              | `storage model get-ddl`    | Quick reference         |

**Choosing the right approach:**

- **`action execute`** — run a single action (connector, tool, or agent) on one record. Simplest path when you only need one step.
- **`action execute-batch`** — run a single action on multiple records at once.
- **`run create` / `batch create`** — chain multiple actions together into a workflow (pass `--nodes` with a node graph). Use when you need multi-step logic, branching, or data flowing between steps.
- **Build a tool** — if you'll reuse the same workflow repeatedly, create a tool with a persisted node graph and deploy it. Then trigger it with `run create --workflow-uuid` or `batch create --workflow-uuid`.

> See `references/response-shapes.md` for full JSON response structures.
> See `references/filter-syntax.md` for the complete filter condition reference.
> See `references/polling.md` for all async polling patterns, error handling, and retry strategies.
> See `references/troubleshooting.md` for common errors and how to fix them.
> See `references/nodes.md` for the full node creation guide (kinds, native actions, expressions, validation, routing, and examples).
> See `references/templates.md` for using pre-built workflow templates.
> See `references/plays.md` for play (segment-driven automation) examples.
> See `references/tools.md` for tool (on-demand workflow) examples.
> See `references/agents.md` for AI agent chat examples.
> See `references/queries.md` for system of record query examples.
> See `references/segments.md` for segment fetch and filter examples.

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

**Actions vs workflows:** If you only need to run a **single action** (one connector call, one tool, one agent), use `action execute` — no workflow or node graph required. If you need to **chain multiple actions** together, use `run create` with `--nodes` or build a tool.

**Designing a new tool or play?** Check templates first — they are pre-built node graphs for common automation patterns (enrichment pipelines, CRM syncs, lead scoring) and are an excellent starting point. List templates with `cargo-ai orchestration template list` and inspect a specific one with `cargo-ai orchestration template get <slug>`. Templates are tagged by `kind` so you can find ones suited for tools (`"kind":"tool"`) or plays (`"kind":"play"`) right away. See `references/templates.md` for the full guide.

**Compatibility rules:**

- **`run create`** — only works with **tool** workflows (or no `workflowUuid`). Play workflows return `playNotCompatible`.
- **`batch create`** — allowed data kinds depend on the workflow type:
  - **Play** workflows: `segment`, `change`, `filter`, `recordIds`
  - **Tool** workflows (or no `workflowUuid`): `file`, `records`

## Quick reference

```bash
cargo-ai orchestration action execute --action '{"kind":"tool","toolUuid":"<uuid>","config":{}}' --data '{"domain":"acme.com"}'
cargo-ai orchestration action execute-batch --action '{"kind":"connector","integrationSlug":"clearbit","actionSlug":"company_enrich","config":{}}' --records '[{"domain":"acme.com"},{"domain":"globex.com"}]'
cargo-ai orchestration run create --workflow-uuid <uuid> --data '{"company":"Acme","domain":"acme.com"}'
cargo-ai orchestration run create --data '{"domain":"acme.com"}' --nodes '[...]'
cargo-ai orchestration run create --workflow-uuid <uuid> --data '{"company":"Acme","domain":"acme.com"}' --wait-until-finished
cargo-ai orchestration batch create --workflow-uuid <uuid> --data '{"kind":"segment","segmentUuid":"..."}'
cargo-ai orchestration batch create --workflow-uuid <uuid> --data '{"kind":"segment","segmentUuid":"..."}' --wait-until-finished
cargo-ai ai message create --chat-uuid <uuid> --parts '[{"type":"text","text":"..."}]'
cargo-ai system-of-record client query "SELECT * FROM companies LIMIT 10"
cargo-ai segmentation segment fetch --model-uuid <uuid> --filter '{"conjonction":"and","groups":[]}' --fetching-limit 100
cargo-ai storage model get-ddl <model-uuid>
```

## Polling async operations

Runs, batches, and agent messages are asynchronous. Either poll until they reach a terminal state, or pass `--wait-until-finished` to `run create` or `batch create` to block and return the final result in one command.

| Operation       | Poll command         | Interval | Done when                                      |
| --------------- | -------------------- | -------- | ---------------------------------------------- |
| Action execute  | `run get <uuid>`     | 2s       | `status` is `success`, `error`, or `cancelled` |
| Action batch    | `batch get <uuid>`   | 5s       | `status` is `success`, `error`, or `cancelled` |
| Run             | `run get <uuid>`     | 2s       | `status` is `success`, `error`, or `cancelled` |
| Batch           | `batch get <uuid>`   | 5s       | `status` is `success`, `error`, or `cancelled` |
| Agent message   | `message get <uuid>` | 2s       | `status` is `success` or `error`               |

For long-running batches (1000+ records), increase the interval to 10-15s after the first minute.

Pass `--wait-until-finished` to `run create` or `batch create` to block until the operation reaches a terminal state and return the final result — no manual polling needed.

## Execute a single action

Use `action execute` when you want to run **one action** on **one record** — no workflow or node graph needed. This is the simplest way to trigger a connector, tool, or agent action.

```bash
# Execute a tool action
cargo-ai orchestration action execute \
  --action '{"kind":"tool","toolUuid":"<tool-uuid>","config":{}}' \
  --data '{"email":"user@example.com"}'

# Execute a connector action
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"clearbit","actionSlug":"company_enrich","config":{}}' \
  --data '{"domain":"acme.com"}' \
  --wait-until-finished

# Execute an agent action
cargo-ai orchestration action execute \
  --action '{"kind":"agent","agentUuid":"<agent-uuid>","config":{}}' \
  --data '{"company":"Acme Corp"}'
```

Returns a `run` object. Poll with `run get <uuid>` or pass `--wait-until-finished` to block.

**Action kinds:**

| Kind          | Required fields                                      | Description                          |
| ------------- | ---------------------------------------------------- | ------------------------------------ |
| `tool`        | `toolUuid` or `templateSlug` or `releaseUuid`        | Execute an orchestration tool        |
| `connector`   | `integrationSlug` + `actionSlug`                     | Execute a third-party service action |
| `agent`       | `agentUuid` or `templateSlug` or `releaseUuid`       | Execute an AI agent                  |
| `native`      | `actionSlug`                                         | Execute a built-in platform action   |

Optional `retry` config: `{"maximumAttempts": 3, "initialInterval": 1000, "backoffCoefficient": 2}`.

## Execute a batch action

Use `action execute-batch` when you want to run **one action** on **multiple records**. Same action kinds as `action execute`.

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"tool","toolUuid":"<tool-uuid>","config":{}}' \
  --records '[{"email":"a@b.com"},{"email":"c@d.com"}]'

# With webhook notification
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"clearbit","actionSlug":"company_enrich","config":{}}' \
  --records '[{"domain":"acme.com"},{"domain":"globex.com"}]' \
  --webhook-url "https://hooks.example.com/done" \
  --wait-until-finished
```

Returns a `batch` object. Poll with `batch get <uuid>` or pass `--wait-until-finished`.

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

Templates are pre-built node graphs for common automation patterns. They serve two purposes:
- **Inspiration when building** — browse templates to understand how to structure a new tool or play, then copy and adapt the node graph into your draft release
- **Bootstrap a run** — plug a template's nodes directly into `run create` or `batch create` without touching the tool's stored definition

```bash
cargo-ai orchestration template list              # list available templates
cargo-ai orchestration template get <slug>        # get template nodes + config
```

**Pattern:**

```bash
# 1. Browse templates
cargo-ai orchestration template list

# 2. Get the node graph
cargo-ai orchestration template get company-enrichment
# → Copy "nodes" array, fill in __REPLACE_WITH_*__ placeholders

# 3. Validate before running
cargo-ai orchestration node validate --nodes '[...nodes...]'
# → { "outcome": "valid" }

# 4. Run
cargo-ai orchestration run create \
  --workflow-uuid <tool.workflowUuid> \
  --data '{"domain":"acme.com"}' \
  --nodes '[...validated nodes...]'
```

See `references/templates.md` for the full guide including play templates and placeholder conventions.

## Validate and test nodes

Before running a custom node graph, validate its structure. For debugging, compute (dry-run) or execute a single node in isolation.

```bash
# Validate a node graph — catches structural errors before running
cargo-ai orchestration node validate --nodes '[...]'
# → { "outcome": "valid" }
# → { "outcome": "notValid", "invalidNodes": [{ "node": {...}, "reason": "connectorNotFound" }] }

# Compute a node — evaluate expressions without executing side effects
cargo-ai orchestration node compute \
  --node '{...node definition...}' \
  --context '{"nodes":{"start":{"domain":"acme.com"}}}'

# Execute a single node — run one node with its computed config (makes real API calls)
cargo-ai orchestration node execute \
  --workflow-uuid <uuid> \
  --release-uuid <uuid> \
  --node '{...node definition...}' \
  --computed-config '{...}' \
  --context '{"nodes":{"start":{"domain":"acme.com"}}}'
```

**When to use each:**

| Command          | Use for                                                        |
| ---------------- | -------------------------------------------------------------- |
| `node validate`  | Structural check — missing start node, bad UUIDs, bad slugs   |
| `node compute`   | Expression preview — see what a config resolves to from context|
| `node execute`   | Live test — run one node against real services (costs credits) |

See `references/nodes.md` for validation error codes and node graph construction.

## Help

Every command supports `--help`:

```bash
cargo-ai orchestration run create --help
cargo-ai orchestration template list --help
cargo-ai orchestration node validate --help
cargo-ai ai message create --help
cargo-ai system-of-record client --help
```
