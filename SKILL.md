---
name: cargo-skills
description: Master skill index for the Cargo CLI. Use this file to understand which skill to load, how the skills relate to each other, and how to chain them together to accomplish end-to-end revenue automation tasks on the Cargo platform.
license: MIT
compatibility: Requires @cargo-ai/cli (npm) and a Cargo API token
metadata:
  author: getcargo
  version: "1.0"
---

```
██████    ████    █████    ██████   ██████
██    ░  ██  ██░  ██  ██   ██    ░  ██  ██░
██       ██████░  █████ ░  ██ ███   ██  ██░
██       ██  ██░  ██ ██    ██  ██░  ██  ██░
██████   ██  ██░  ██  ██   ██████░  ██████░
 ░░░░░░   ░░  ░░   ░░  ░░   ░░░░░░   ░░░░░░
```

# Cargo CLI — Skills Overview

This repository contains seven skills for the [Cargo](https://getcargo.ai) AI-native revenue infrastructure. Each skill covers a distinct domain. This file tells you which skill to load for any given task and how to combine them.

## Installation

```bash
npm install -g @cargo-ai/cli
cargo-ai login --token <your-api-token>
# Optional: target a specific workspace
cargo-ai login --token <your-api-token> --workspace-uuid <uuid>
# Verify
cargo-ai whoami
```

Without a global install, prefix every command with `npx @cargo-ai/cli` instead of `cargo-ai`.

All commands output JSON to stdout. Failed commands exit non-zero and return `{"errorMessage": "..."}`.

---

## Skills at a glance

| Skill                                                 | Load when you need to…                                                                             |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| [`cargo-cli-orchestration`](#cargo-cli-orchestration) | Run workflows, trigger batches, chat with agents, query your data warehouse, fetch segment records |
| [`cargo-cli-analytics`](#cargo-cli-analytics)         | Download run results, export segment data, monitor error rates and metrics                         |
| [`cargo-cli-billing`](#cargo-cli-billing)             | Check credit usage, view subscription details, track costs per workflow or connector               |
| [`cargo-cli-storage`](#cargo-cli-storage)             | Inspect or modify data models, columns, datasets, and relationships                                |
| [`cargo-cli-connection`](#cargo-cli-connection)       | Manage connector authentication, discover available integrations and their actions                 |
| [`cargo-cli-ai`](#cargo-cli-ai)                       | Create and configure agents, upload files for RAG, manage MCP servers                              |
| [`cargo-cli-workspace`](#cargo-cli-workspace)         | Invite users, create API tokens, organize folders, manage roles                                    |

---

## How the skills relate

```
┌──────────────────────────────────────────────────────────────┐
│                    cargo-cli-workspace                       │
│             Authentication, users, tokens, folders           │
└──────────────────────────────────────────────────────────────┘

  ┌─────────────────┐   ┌───────────────────┐   ┌─────────────────┐
  │cargo-cli-storage│   │cargo-cli-connection│   │  cargo-cli-ai   │
  │ Models, columns,│   │ Connectors,        │   │ Agents, files,  │
  │ datasets        │   │ integration actions│   │ MCP servers     │
  └────────┬────────┘   └────────┬───────────┘   └────────┬────────┘
           │                     │  (UUIDs flow down)      │
           └─────────────────────┼─────────────────────────┘
                                 ▼
             ┌───────────────────────────────────────┐
             │        cargo-cli-orchestration        │
             │   Runs, batches, plays, tools, SoR    │
             └───────────────┬───────────────────────┘
                             │
              ┌──────────────┴──────────────┐
              ▼                             ▼
 ┌────────────────────────┐  ┌───────────────────────────┐
 │  cargo-cli-analytics   │  │    cargo-cli-billing      │
 │  Results, metrics,     │  │    Credit usage, costs    │
 │  exports               │  │                           │
 └────────────────────────┘  └───────────────────────────┘
```

**Dependency rules in practice:**

- `cargo-cli-workspace` provides auth context for every skill — set it up first.
- `cargo-cli-storage`, `cargo-cli-connection`, and `cargo-cli-ai` are peer skills that supply UUIDs to `cargo-cli-orchestration`. They don't depend on each other.
- Before querying via system-of-record, load `cargo-cli-storage` to get the DDL (exact table name).
- Before building a workflow node graph, load `cargo-cli-connection` to get `connectorUuid` and `actionSlug`.
- Before executing a workflow that uses an agent node, load `cargo-cli-ai` to get `agentUuid`.
- After runs complete, load `cargo-cli-analytics` to download results or measure performance.
- Load `cargo-cli-billing` to understand credit consumption for any of the above.

---

## Skill details

### cargo-cli-orchestration

**The execution hub.** Use for everything runtime: running tools on single records, triggering batches across segments, chatting with AI agents, querying your data warehouse with SQL, and fetching live segment data.

**Key commands:**

```bash
cargo-ai orchestration run create --workflow-uuid <uuid> --data '{...}'
cargo-ai orchestration batch create --workflow-uuid <uuid> --data '{"kind":"segment","segmentUuid":"..."}'
cargo-ai ai message create --chat-uuid <uuid> --parts '[{"type":"text","text":"..."}]'
cargo-ai system-of-record client query "SELECT * FROM <table> LIMIT 10"
cargo-ai segmentation segment fetch --model-uuid <uuid> --filter '{"conjonction":"and","groups":[]}'
```

**Critical rules:**

- `run create` works only with **tool** workflows. For plays, use `batch create`.
- Filter JSON uses `conjonction` (not `conjunction`) — this is intentional and will break silently if misspelled.
- Always get DDL before querying the system-of-record: `cargo-ai storage model get-ddl <model-uuid>`.
- Runs, batches, and agent messages are async — poll until terminal state. See [Async polling](#async-polling).

**References:** `cargo-cli-orchestration/SKILL.md`

---

### cargo-cli-analytics

**Measurement and export.** Use to download run results, export segment data, and monitor error rates and success metrics.

**Key commands:**

```bash
cargo-ai orchestration run get-metrics --workflow-uuid <uuid>
cargo-ai orchestration run download --workflow-uuid <uuid> --is-finished
cargo-ai orchestration run count --workflow-uuid <uuid> --statuses error
cargo-ai segmentation segment download --model-uuid <uuid> --filter '{"conjonction":"and","groups":[]}'
```

**Critical rules:**

- `segment download` requires `--model-uuid`, not `--segment-uuid`.
- For batch result download, get the `output-node-slug` from `release get <release-uuid>` → `nodes[].slug`.
- For billing and credit usage, use `cargo-cli-billing` instead.

**References:** `cargo-cli-analytics/SKILL.md`

---

### cargo-cli-billing

**Cost and credit management.** Use to track credit consumption per workflow, connector, or agent, check subscription status, and view invoices.

**Key commands:**

```bash
cargo-ai billing usage get-metrics --from <YYYY-MM-DD> --to <YYYY-MM-DD>
cargo-ai billing usage get-metrics --from <date> --to <date> --group-by workflow_uuid
cargo-ai billing subscription get
cargo-ai billing subscription get-invoices
```

**Critical rules:**

- Requires a token with **admin access**.
- Invoice amounts are in cents — divide by 100 for dollars.
- `subscriptionAvailableCreditsCount - subscriptionCreditsUsedCount` from `subscription get` = remaining credits.

**References:** `cargo-cli-billing/SKILL.md`

---

### cargo-cli-storage

**Data schema management.** Use to inspect models, create or update columns, navigate datasets, and understand your workspace's data structure.

**Key commands:**

```bash
cargo-ai storage model list
cargo-ai storage model get-ddl <model-uuid>   # always run before SoR queries
cargo-ai storage column list --model-uuid <uuid>
cargo-ai storage relationship set --from-model-uuid <uuid> --to-model-uuid <uuid>
```

**Critical rules:**

- Always run `model get-ddl` before querying via system-of-record — it contains the exact table name (e.g. `datasets_default.models_companies`).
- For advanced record queries (filtering, sorting, pagination), use `segmentation segment fetch` from `cargo-cli-orchestration`.

**References:** `cargo-cli-storage/SKILL.md`

---

### cargo-cli-connection

**Connector and integration management.** Use to authenticate external services, discover what actions they support, and get the `connectorUuid` and `actionSlug` values needed for workflow node graphs.

**Key commands:**

```bash
cargo-ai connection connector list
cargo-ai connection integration list
cargo-ai connection integration get <slug>          # third-party actions (HubSpot, Salesforce, etc.)
cargo-ai connection native-integration get          # built-in Cargo actions only (NOT third-party)
```

**Key concepts:**

- **Integration** = external service type (HubSpot, Clearbit, Salesforce, …)
- **Connector** = authenticated instance of an integration (referenced by `connectorUuid` in nodes)

**References:** `cargo-cli-connection/SKILL.md`

---

### cargo-cli-ai

**Agent resource management.** Use to create and configure agents, upload documents for retrieval-augmented generation (RAG), and connect MCP servers.

> For _using_ agents (sending messages, multi-turn chat, polling), use `cargo-cli-orchestration`.

**Key commands:**

```bash
cargo-ai ai agent list
cargo-ai ai agent create --name "Lead Researcher" --language-model-slug gpt-4o --temperature 0.3
cargo-ai ai file upload --file-path ./knowledge-base.pdf
cargo-ai ai mcp-server create --name "Internal Tools" --url "https://..."
cargo-ai ai memory list --agent-uuid <uuid>
```

**Model and temperature guidance:**

| Use case                            | Recommended model                   | Temperature   |
| ----------------------------------- | ----------------------------------- | ------------- |
| Classification, extraction, scoring | `gpt-4o-mini` or `claude-3-5-haiku` | `0.0` – `0.2` |
| Research, summarization, analysis   | `gpt-4o` or `claude-3-5-sonnet`     | `0.2` – `0.5` |
| Copywriting, personalization        | `gpt-4o` or `claude-3-5-sonnet`     | `0.5` – `0.8` |
| Brainstorming, creative ideation    | `gpt-4o` or `claude-opus`           | `0.7` – `1.0` |

Low temperature (`0.0`–`0.2`) = deterministic, consistent outputs. High temperature (`0.7`+) = creative, varied outputs. For production workflows processing thousands of records, prefer low temperature.

**References:** `cargo-cli-ai/SKILL.md`

---

### cargo-cli-workspace

**Workspace administration.** Use to invite users, create and rotate API tokens, organize plays/tools/agents into folders, and manage roles.

**Key commands:**

```bash
cargo-ai whoami
cargo-ai workspace user create --user-email user@example.com --role-slug <slug>
cargo-ai workspace token create --from-user
cargo-ai workspace folder create --name "Q1 Campaigns" --emoji-slug "rocket" --kind "play"
```

**Critical rules:**

- Most commands require a token with **admin access**.
- Token values are only shown **once** at creation — store immediately in a secrets manager (GitHub Secrets, AWS Secrets Manager, etc.).

**References:** `cargo-cli-workspace/SKILL.md`

---

## Async polling

All runs, batches, and agent messages are asynchronous. Always poll until a terminal state is reached.

| Operation     | Poll command                              | Interval | Terminal when                                  |
| ------------- | ----------------------------------------- | -------- | ---------------------------------------------- |
| Run           | `cargo-ai orchestration run get <uuid>`   | 2s       | `status` is `success`, `error`, or `cancelled` |
| Batch         | `cargo-ai orchestration batch get <uuid>` | 5s       | `status` is `success`, `error`, or `cancelled` |
| Agent message | `cargo-ai ai message get <uuid>`          | 2s       | `status` is `success` or `error`               |

For large batches (1000+ records), increase the interval to 10–15s after the first minute.

Pass `--wait-until-finished` to `run create` or `batch create` to block until the operation reaches a terminal state and return the final result — no manual polling needed.

**When a run returns `error` status:**

1. Read the run details: `cargo-ai orchestration run get <uuid>` — look at the node-level output for the specific node that failed.
2. Check the error message from the connector or agent node to understand the root cause.
3. Fix the input data or node config, then re-trigger.
4. For transient errors (rate limits, timeouts), add a `retry` config to the node: `{"maximumAttempts": 3, "initialInterval": 1000, "backoffCoefficient": 2}`.

See `cargo-cli-orchestration/references/troubleshooting.md` for a full list of error patterns.

---

## UUID flow between skills

Most `cargo-cli-orchestration` operations require UUIDs from other skills. This table maps which skill produces each UUID and which commands consume it.

| UUID            | Produced by                                | Consumed by                                                             |
| --------------- | ------------------------------------------ | ----------------------------------------------------------------------- |
| `workflowUuid`  | `orchestration play list` / `tool list`    | `run create`, `batch create`, `run get-metrics`, `run download`         |
| `modelUuid`     | `storage model list`                       | `segment fetch`, `segment download`, `system-of-record query` (via DDL) |
| `segmentUuid`   | `segmentation segment list`                | `batch create --data '{"kind":"segment",...}'`                          |
| `agentUuid`     | `ai agent list`                            | `ai chat create`, node graph (`kind: "agent"`)                          |
| `connectorUuid` | `connection connector list`                | Node graph (`kind: "connector"`), `billing usage --connector-uuid`      |
| `actionSlug`    | `connection integration get <slug>` (third-party) or `connection native-integration get` (built-in) | Node graph (`kind: "connector"` or `kind: "native"`) |
| `releaseUuid`   | `orchestration batch get` → `.releaseUuid` | `orchestration release get`, `batch download`                           |
| `batchUuid`     | `orchestration batch create`               | `batch get`, `batch download`, `run get-metrics --batch-uuid`           |
| `folderUuid`    | `workspace folder list`                    | `play list --folder-uuid`, `tool list --folder-uuid`                    |
| `roleSlug`      | `workspace role list`                      | `workspace user create --role-slug`                                     |

**Standard discovery sequence** before running a workflow:

```bash
# 1. Confirm identity
cargo-ai whoami

# 2. Find the tool or play to run
cargo-ai orchestration tool list
cargo-ai orchestration play list

# 3. Find the model and get its DDL (if querying via SoR)
cargo-ai storage model list
cargo-ai storage model get-ddl <model-uuid>

# 4. Find connectors needed by the workflow nodes
cargo-ai connection connector list

# 5. Find agents used in workflow nodes
cargo-ai ai agent list

# 6. Find the segment to process (for plays / batch with segment data)
cargo-ai segmentation segment list
```

---

## End-to-end use cases

### 1. Enrich a list of companies and push to CRM

**Skills needed:** `cargo-cli-storage`, `cargo-cli-connection`, `cargo-cli-orchestration`, `cargo-cli-analytics`

```
1. storage model get-ddl                   → get exact table name
2. connection connector list               → get enrichment + CRM connector UUIDs
3. connection integration get <slug>       → discover third-party action slugs (e.g. HubSpot, Clearbit)
4. orchestration tool list                 → find the enrichment tool
5. orchestration batch create      → run on a segment of companies
6. orchestration batch get         → poll until status is terminal
7. analytics run download          → export results
```

### 2. Score leads with AI and update the model

**Skills needed:** `cargo-cli-ai`, `cargo-cli-orchestration`, `cargo-cli-billing`

```
1. ai agent list                   → find or create the scoring agent
2. ai agent create                 → configure instructions, model, temperature 0.0
3. orchestration play list         → find the scoring play
4. orchestration batch create      → trigger on a segment of new leads
5. orchestration batch get         → poll until status is terminal
6. billing usage get-metrics       → check credit consumption
```

### 3. Build a custom enrichment workflow from scratch

**Skills needed:** `cargo-cli-connection`, `cargo-cli-orchestration`

```
1. connection connector list               → get connector UUID
2. connection integration get <slug>       → get actionSlug for the third-party service
3. orchestration node validate --nodes     → validate graph before running
4. orchestration run create --nodes        → run with custom node graph
5. orchestration run get                   → poll to terminal state
```

### 4. Monitor workflow health and alert on errors

**Skills needed:** `cargo-cli-orchestration`, `cargo-cli-analytics`

```
1. orchestration tool list / play list    → discover workflowUuid
2. analytics run count --statuses error   → count errors in period
3. analytics run get-metrics              → get success/error rate breakdown
4. analytics run download --statuses error → download failed runs for inspection
```

### 5. Bootstrap a fresh workspace

**Skills needed:** `cargo-cli-workspace`, `cargo-cli-storage`, `cargo-cli-connection`, `cargo-cli-ai`

```
1. workspace token create          → create a dedicated API token
2. workspace role list             → discover available roles
3. workspace user create           → invite team members
4. storage model create            → create Companies and Contacts models
5. storage column create           → add columns (name, domain, employee_count, etc.)
6. storage relationship set        → link Contacts → Companies
7. connection connector create     → connect enrichment and CRM integrations
8. ai agent create                 → configure an AI agent for research or scoring
9. workspace folder create         → organize plays and tools into folders
```

### 6. Export and analyze segment data

**Skills needed:** `cargo-cli-storage`, `cargo-cli-analytics`

```
1. storage model list              → get modelUuid
2. analytics segment download      → export with filter and sort
   --filter '{"conjonction":"and","groups":[
     {"conjonction":"and","conditions":[
       {"kind":"string","columnSlug":"country","operator":"is","values":["US"]}
     ]}
   ]}'
   --sort '[{"columnSlug":"created_at","kind":"desc"}]'
```

---

## Common gotchas

| Gotcha                             | Detail                                                                                                                                                                                                                                        |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `conjonction` spelling             | Filter JSON uses `conjonction` (not `conjunction`). This is intentional. A typo here fails silently — no records returned.                                                                                                                    |
| `run create` vs `batch create`     | `run create` only works with **tool** workflows. Using a play's `workflowUuid` returns `playNotCompatible`.                                                                                                                                   |
| `--model-uuid` vs `--segment-uuid` | `segment fetch` and `segment download` require `--model-uuid`. Get it from `segment list` → `.modelUuid`.                                                                                                                                     |
| DDL before SQL                     | Never guess table names. Always run `model get-ddl <uuid>` first. Table names look like `datasets_default.models_companies`.                                                                                                                  |
| Token shown once                   | API token values are only returned at creation. Store immediately.                                                                                                                                                                            |
| Invoice amounts in cents           | `subscription get-invoices` returns `amount` in cents. Divide by 100.                                                                                                                                                                         |
| Plays vs tools                     | **Play** = reacts to data changes (segment-driven). **Tool** = triggered on demand (manual, API, cron).                                                                                                                                       |
| Batch data kinds                   | Play workflows accept: `segment`, `change`, `filter`, `recordIds`. Tool workflows accept: `file`, `records`.                                                                                                                                  |
| Third-party connector rate limits  | Only `kind: "connector"` nodes (Clearbit, HubSpot, etc.) have rate limits — native nodes do not. Errors grow silently as the batch runs. Start at 1 record, then 50, then 500 before full-scale. Add `retry` with backoff to connector nodes. |
