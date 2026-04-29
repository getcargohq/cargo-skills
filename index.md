```
██████    ████    █████    ██████   ██████
██    ░  ██  ██░  ██  ██   ██    ░  ██  ██░
██       ██████░  █████ ░  ██ ███   ██  ██░
██       ██  ██░  ██ ██    ██  ██░  ██  ██░
██████   ██  ██░  ██  ██   ██████░  ██████░
 ░░░░░░   ░░  ░░   ░░  ░░   ░░░░░░   ░░░░░░
```

# Cargo CLI — Skills Overview

This repository contains 8 skills at the repo root: one **outcome skill** (`cargo-gtm`) and seven **capability skills**.

- **`cargo-gtm`** — application library. The front door for any GTM task ("build a TAM list", "find 5 fintech CTOs", "monitor job changes"). Routes via internal recipes (`cargo-gtm/recipes/*.md`) and provider playbooks (`cargo-gtm/provider-playbooks/*.md`).
- **Capability skills** — standard library. One per CLI domain (orchestration, storage, connection, AI, analytics, billing, workspace management). Loaded by `cargo-gtm`, or directly when you need a specific CLI domain.

`cargo-gtm` delegates to capability skills; capability skills never reference `cargo-gtm` (one-way dependency).

## Installation

```bash
npm install -g @cargo-ai/cli
cargo-ai login --oauth                                   # browser sign-in (recommended)
# or: cargo-ai login --token <your-api-token>            # use an existing workspace-scoped API token
# Optional: pin a default workspace at login
cargo-ai login --oauth --workspace-uuid <uuid>
# Verify
cargo-ai whoami
```

Without a global install, prefix every command with `npx @cargo-ai/cli` instead of `cargo-ai`.

All commands output JSON to stdout. Failed commands exit non-zero and return `{"errorMessage": "..."}`.

## Keeping skills and CLI up to date

Both the skills repo and the CLI ship updates regularly. Re-run these to pull the latest:

```bash
# Update the skills (re-running the install pulls latest)
npx skills add getcargohq/cargo-skills@latest

# Update the CLI
npm install -g @cargo-ai/cli@latest
```

If the user (or agent) asks to **always** stay on the latest version, run both commands at the start of the session before any other Cargo work. Agents may proactively offer to refresh when:

- A documented command flag or response shape doesn't match what the CLI returns.
- A `workspace report` confirms the issue is fixed in a newer release.
- The user explicitly asks ("always keep cargo updated", "make sure I'm on latest", etc.).

For Claude Code users who want this automatic, configure a `SessionStart` hook in `.claude/settings.json` that runs both update commands.

## When the CLI fails or you're stuck — send a workspace management report

Whenever the CLI is failing in a way the skill references and `--help` cannot resolve, the user or agent is repeatedly retrying the same command without progress, the syntax for a flag / JSON payload is unclear, or a needed capability seems missing — escalate by submitting a report to **workspace management**:

```bash
cargo-ai workspaceManagement report create \
  --title "<one-line summary of the problem>" \
  --description "<exact command(s) tried, errorMessage, expected vs actual, UUIDs involved>"
```

Trigger conditions (any one is enough):

- A command failed ≥ 2 times in a row on the same task and the cause is not obvious.
- The CLI is being misused and the correct usage is not discoverable from the skills, examples, or `--help`.
- A documented behavior contradicts what you observe.
- A feature appears to be missing entirely.

This is the official feedback channel — every report is reviewed by the Cargo team and used to improve the CLI and these skills. **Do not give up silently — file a report.** See `cargo-workspace-management/SKILL.md` (Reports section) and `cargo-workspace-management/references/examples/reports.md` for templates.

---

## Skills at a glance

### Outcome skill

Load when the user states a real-world goal.

| Skill                                     | Load when you need to…                                                                             |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------- |
| [`cargo-gtm`](#cargo-gtm)                 | Any GTM task — sourcing, enrichment, verification, scoring, sequencing, CRM sync, signal monitoring (job changes, funding, tech-stack/hiring intent). Routes via recipes (`recipes/`), guides (`guides/`), and provider playbooks (`provider-playbooks/`). |

### Capability skills

Load for a specific CLI domain.

| Skill                                                                 | Load when you need to…                                                                             |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| [`cargo-orchestration`](#cargo-orchestration)                         | Execute actions, run workflows, trigger batches, chat with agents, query your data warehouse       |
| [`cargo-analytics`](#cargo-analytics)                                 | Download run results, export segment data, monitor error rates and metrics                         |
| [`cargo-billing`](#cargo-billing)                                     | Check credit usage, view subscription details, track costs per workflow or connector               |
| [`cargo-storage`](#cargo-storage)                                     | Inspect or modify data models, columns, datasets, and relationships                                |
| [`cargo-connection`](#cargo-connection)                               | Manage connector authentication, discover available integrations and their actions                 |
| [`cargo-ai`](#cargo-ai)                                               | Create and configure agents, upload files for RAG, manage MCP servers                              |
| [`cargo-workspace-management`](#cargo-workspace-management)           | Invite users, create API tokens, organize folders, manage roles, report CLI issues to management   |

---

## How the skills relate

```
            ┌─────────────────────────────────────┐
            │              cargo-gtm              │
            │   Outcome / front door for GTM      │
            │   Recipes, guides, provider-playbks │
            └─────────────────┬───────────────────┘
                              │ delegates to ↓ (one-way)
       ┌──────────────────────┴──────────────────────┐
       │                                             │
┌──────────────────────────────────────────────────────────────┐
│              cargo-workspace-management                      │
│         Authentication, users, tokens, folders               │
└──────────────────────────────────────────────────────────────┘

  ┌─────────────────┐   ┌────────────────────┐   ┌─────────────────┐
  │  cargo-storage  │   │  cargo-connection  │   │    cargo-ai     │
  │ Models, columns,│   │ Connectors,        │   │ Agents, files,  │
  │ datasets        │   │ integration actions│   │ MCP servers     │
  └────────┬────────┘   └─────────┬──────────┘   └────────┬────────┘
           │                      │  (UUIDs flow down)    │
           └──────────────────────┼───────────────────────┘
                                  ▼
             ┌───────────────────────────────────────┐
             │          cargo-orchestration          │
             │   Runs, batches, plays, tools, SoR    │
             └───────────────┬───────────────────────┘
                             │
              ┌──────────────┴──────────────┐
              ▼                             ▼
 ┌────────────────────────┐  ┌───────────────────────────┐
 │    cargo-analytics     │  │       cargo-billing       │
 │  Results, metrics,     │  │    Credit usage, costs    │
 │  exports               │  │                           │
 └────────────────────────┘  └───────────────────────────┘
```

**Dependency rules in practice:**

- `cargo-gtm` delegates to capability skills via relative paths (`../cargo-orchestration/...`). Capability skills never reference `cargo-gtm`.
- `cargo-workspace-management` provides auth context for every skill — set it up first.
- `cargo-storage`, `cargo-connection`, and `cargo-ai` are peer skills that supply UUIDs to `cargo-orchestration`. They don't depend on each other.
- Before querying via system-of-record, load `cargo-storage` to get the DDL (exact table name).
- Before building a workflow node graph, load `cargo-connection` to get `connectorUuid` and `actionSlug`.
- Before executing a workflow that uses an agent node, load `cargo-ai` to get `agentUuid`.
- After runs complete, load `cargo-analytics` to download results or measure performance. **For action output retrieval, prefer `cargo-ai orchestration run download-outputs` over `run download` — the former returns a signed-URL CSV/JSON of just the output node's data.**
- Load `cargo-billing` to understand credit consumption for any of the above.

---

## Skill details

### cargo-gtm

**The outcome skill — front door for any GTM task.** Bundles routing (`SKILL.md`), phase guides (`guides/`), scenario recipes (`recipes/`), per-provider playbooks (`provider-playbooks/`), references (`references/`), and a sub-agent (`agents/`).

**Recipes shipped:**

| Recipe | Use when… |
|---|---|
| `recipes/prospecting.md` | End-to-end find → enrich → verify → sync (P1/P2/P3 variants). |
| `recipes/build-tam.md` | Build a Total Addressable Market list at scale (100–10,000 companies). |
| `recipes/linkedin-url-lookup.md` | Resolve LinkedIn URL from name + company with strict validation. |
| `recipes/portfolio-prospecting.md` | Investor / accelerator → portfolio companies → contacts. |
| `recipes/job-change-monitoring.md` | `waterfall.detectJobChange` (cargo-unique) on a contact segment. |
| `recipes/funding-watch.md` | Track companies that recently raised funding. |
| `recipes/tech-intent.md` | Find companies by tech-stack or hiring-intent signals. |
| `recipes/icp-discovery.md` | Diff Closed-Won vs Closed-Lost segments, surface ICP signals. |

**Priority provider stack** (recipes lead with these): salesNavigator (sourcing), cargo native (firmographics + signals), waterfall (multi-source enrichment + email verify + job-change), FullEnrich (premium contact lookup), theirStack (tech-stack + hiring intent), peopleDataLabs (heavyweight backfill).

**Critical rules:**
- All recipes use credits-based actions (`cargo-ai connection integration list` → 141 credits-based actions across 120 integrations).
- Action shape: `{"kind":"connector","integrationSlug":"<slug>","actionSlug":"<slug>","config":{}}` — **no `connectorUuid` in `config`**.
- Output retrieval: `cargo-ai orchestration run download-outputs --output-node-slug <slug>` (NOT `run download`).
- peopleDataLabs filter shape: `searchX` uses cargo's `{conjonction, groups, conditions}` shape; `queryX` takes a PDL **SQL string** — never Elasticsearch.

**References:** `cargo-gtm/SKILL.md`

---

### cargo-orchestration

**The execution hub.** Execute actions, run workflows, chat with AI agents, query your data warehouse, and fetch segment records.

**Critical rules:**

- See the decision flowchart at the top of `cargo-orchestration/SKILL.md` for when to use `action execute` vs `run create` vs `batch create`.
- Filter JSON uses `conjonction` (not `conjunction`) — breaks silently if misspelled.
- Always get DDL before querying the system-of-record: `cargo-ai storage model get-ddl <model-uuid>`.
- All operations are async — poll or pass `--wait-until-finished`. See [Async polling](#async-polling).

**References:** `cargo-orchestration/SKILL.md`

---

### cargo-analytics

**Measurement and export.** Download run results, export segment data, and monitor error rates and success metrics.

**Critical rules:**

- `segment download` requires `--model-uuid`, not `--segment-uuid`.
- For batch result download, get the `output-node-slug` from `release get <release-uuid>` → `nodes[].slug`.
- For billing and credit usage, use `cargo-billing` instead.

**References:** `cargo-analytics/SKILL.md`

---

### cargo-billing

**Cost and credit management.** Track credit consumption per workflow, connector, or agent; check subscription status; view invoices.

**Critical rules:**

- Requires a token with **admin access**.
- Invoice amounts are in cents — divide by 100 for dollars.
- `subscriptionAvailableCreditsCount - subscriptionCreditsUsedCount` from `subscription get` = remaining credits.

**References:** `cargo-billing/SKILL.md`

---

### cargo-storage

**Data schema management.** Inspect models, create or update columns, navigate datasets, understand workspace data structure.

**Critical rules:**

- Always run `model get-ddl` before querying via system-of-record — it contains the exact table name (e.g. `datasets_default.models_companies`).
- For advanced record queries (filtering, sorting, pagination), use `segmentation segment fetch` from `cargo-orchestration`.

**References:** `cargo-storage/SKILL.md`

---

### cargo-connection

**Connector and integration management.** Authenticate external services, discover supported actions, get the `connectorUuid` and `actionSlug` values needed for workflow node graphs.

**Key concepts:**

- **Integration** = external service type (HubSpot, Clearbit, Salesforce, …)
- **Connector** = authenticated instance of an integration (referenced by `connectorUuid` in nodes)

**References:** `cargo-connection/SKILL.md`

---

### cargo-ai

**Agent resource management.** Create and configure agents, upload documents for retrieval-augmented generation (RAG), connect MCP servers.

> For _using_ agents (sending messages, multi-turn chat, polling), use `cargo-orchestration`.

See `cargo-ai/SKILL.md` for model and temperature guidance by use case.

**References:** `cargo-ai/SKILL.md`

---

### cargo-workspace-management

**Workspace administration.** Invite users, create and rotate API tokens, organize plays/tools/agents into folders, manage roles, and **submit reports to workspace management when the CLI fails or is being misused**.

**Critical rules:**

- Most commands require a token with **admin access**.
- `workspaceManagement token create` requires `--name` (the legacy `--from-user` flag was removed). Pick a name that makes the token's purpose obvious in `token list` later.
- Token values are only shown **once** at creation — store immediately in a secrets manager (GitHub Secrets, AWS Secrets Manager, etc.).
- **Always send a `workspaceManagement report create`** when the CLI errors, is being used incorrectly, or you (user or agent) are struggling to make progress on a CLI task — see the section at the top of this file and `cargo-workspace-management/references/examples/reports.md`.

**References:** `cargo-workspace-management/SKILL.md`

---

## Async polling

All operations are asynchronous. Pass `--wait-until-finished` to block, or poll:

| Result type   | Poll command                              | Interval | Terminal when                                  |
| ------------- | ----------------------------------------- | -------- | ---------------------------------------------- |
| Run           | `cargo-ai orchestration run get <uuid>`   | 2s       | `status` is `success`, `error`, or `cancelled` |
| Batch         | `cargo-ai orchestration batch get <uuid>` | 5s       | `status` is `success`, `error`, or `cancelled` |
| Agent message | `cargo-ai ai message get <uuid>`          | 2s       | `status` is `success` or `error`               |

`action execute` returns a run; `action execute-batch` returns a batch — same polling applies.

See `cargo-orchestration/references/polling.md` for retry strategies, error handling, and large-batch guidance.

---

## UUID flow between skills

Most `cargo-orchestration` operations require UUIDs from other skills. This table maps which skill produces each UUID and which commands consume it.

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
| `folderUuid`    | `workspaceManagement folder list`                    | `play list --folder-uuid`, `tool list --folder-uuid`                    |
| `roleSlug`      | `workspaceManagement role list`                      | `workspaceManagement user create --role-slug`                                     |

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

### Retrieve in the UI

Each resource has a dedicated page in the Cargo app. Use these URL patterns to cross-reference a UUID returned by the CLI with the UI, or to extract a UUID from a URL the user pastes.

| Resource | URL pattern                                                         |
| -------- | ------------------------------------------------------------------- |
| Play     | `app.getcargo.io/workspaces/<WORKSPACE_UUID>/plays/<PLAY_UUID>`     |
| Tool     | `app.getcargo.io/workspaces/<WORKSPACE_UUID>/tools/<TOOL_UUID>`     |
| Agent    | `app.getcargo.io/workspaces/<WORKSPACE_UUID>/agents/<AGENT_UUID>`   |
| Model    | `app.getcargo.io/workspaces/<WORKSPACE_UUID>/models/<MODEL_UUID>`   |

The workspace UUID is returned by `cargo-ai whoami` under `workspace.uuid`.

---

## End-to-end use cases

### 1. Enrich a single company (simplest path)

**Skills needed:** `cargo-orchestration`

```
1. orchestration action execute            → run a connector action on one record
   --action '{"kind":"connector","integrationSlug":"clearbit","actionSlug":"company_enrich","config":{}}'
   --data '{"domain":"acme.com"}' --wait-until-finished
```

### 2. Enrich a list of companies and push to CRM

**Skills needed:** `cargo-storage`, `cargo-connection`, `cargo-orchestration`, `cargo-analytics`

```
1. storage model get-ddl                   → get exact table name
2. connection connector list               → get enrichment + CRM connector UUIDs
3. connection integration get <slug>       → discover third-party action slugs (e.g. HubSpot, Clearbit)
4. orchestration tool list                 → find the enrichment tool
5. orchestration batch create      → run on a segment of companies
6. orchestration batch get         → poll until status is terminal
7. analytics run download          → export results
```

### 3. Score leads with AI and update the model

**Skills needed:** `cargo-ai`, `cargo-orchestration`, `cargo-billing`

```
1. ai agent list                   → find or create the scoring agent
2. ai agent create                 → configure instructions, model, temperature 0.0
3. orchestration play list         → find the scoring play
4. orchestration batch create      → trigger on a segment of new leads
5. orchestration batch get         → poll until status is terminal
6. billing usage get-metrics       → check credit consumption
```

### 4. Build a custom enrichment workflow from scratch

**Skills needed:** `cargo-connection`, `cargo-orchestration`

```
1. connection connector list               → get connector UUID
2. connection integration get <slug>       → get actionSlug for the third-party service
3. orchestration node validate --nodes     → validate graph before running
4. orchestration run create --nodes        → run with custom node graph
5. orchestration run get                   → poll to terminal state
```

### 5. Monitor workflow health and alert on errors

**Skills needed:** `cargo-orchestration`, `cargo-analytics`

```
1. orchestration tool list / play list    → discover workflowUuid
2. analytics run count --statuses error   → count errors in period
3. analytics run get-metrics              → get success/error rate breakdown
4. analytics run download --statuses error → download failed runs for inspection
```

### 6. Bootstrap a fresh workspace

**Skills needed:** `cargo-workspace-management`, `cargo-storage`, `cargo-connection`, `cargo-ai`

```
1. workspaceManagement token create --name <label>   → create a dedicated, named API token
2. workspaceManagement role list             → discover available roles
3. workspaceManagement user create           → invite team members
4. storage model create            → create Companies and Contacts models
5. storage column create           → add columns (name, domain, employee_count, etc.)
6. storage relationship set        → link Contacts → Companies
7. connection connector create     → connect enrichment and CRM integrations
8. ai agent create                 → configure an AI agent for research or scoring
9. workspaceManagement folder create         → organize plays and tools into folders
```

### 7. Export and analyze segment data

**Skills needed:** `cargo-storage`, `cargo-analytics`

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
| Token shown once                   | API token values are only returned at creation. Store immediately. `workspaceManagement token create` requires `--name` (no more `--from-user`).                                                                                                        |
| Invoice amounts in cents           | `subscription get-invoices` returns `amount` in cents. Divide by 100.                                                                                                                                                                         |
| Plays vs tools                     | **Play** = reacts to data changes (segment-driven). **Tool** = triggered on demand (manual, API, cron).                                                                                                                                       |
| Batch data kinds                   | Play workflows accept: `segment`, `change`, `filter`, `recordIds`. Tool workflows accept: `file`, `records`.                                                                                                                                  |
| Third-party connector rate limits  | Only `kind: "connector"` nodes (Clearbit, HubSpot, etc.) have rate limits — native nodes do not. Errors grow silently as the batch runs. Start at 1 record, then 50, then 500 before full-scale. Add `retry` with backoff to connector nodes. |
