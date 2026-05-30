---
name: cargo
description: Router and overview for the Cargo CLI agent skills. Explains the nine skills (one outcome skill cargo-gtm + eight capability skills), the UUID flow between them, async polling, end-to-end use cases (enrich one record, enrich and sync to CRM, AI lead scoring, custom workflow, error monitoring, fresh-workspace bootstrap, segment export, GTM context authoring), and common gotchas (`conjonction` spelling, run vs batch, model-uuid vs segment-uuid). Load first whenever working with the Cargo CLI, when unsure which sub-skill applies, when stitching multiple sub-skills together, when bootstrapping a workspace, or when the user asks about Cargo skills in general.
version: "1.1.0"
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
```
██████    ████    █████    ██████   ██████
██    ░  ██  ██░  ██  ██   ██    ░  ██  ██░
██       ██████░  █████ ░  ██ ███   ██  ██░
██       ██  ██░  ██ ██    ██  ██░  ██  ██░
██████   ██  ██░  ██  ██   ██████░  ██████░
 ░░░░░░   ░░  ░░   ░░  ░░   ░░░░░░   ░░░░░░
```

# Cargo CLI — Skills Overview

This repository contains 9 skills at the repo root: one **outcome skill** (`cargo-gtm`) and eight **capability skills**.

- **`cargo-gtm`** — application library. The front door for any GTM task ("build a TAM list", "find 5 fintech CTOs", "monitor job changes"). Routes via internal recipes (`../cargo-gtm/recipes/*.md`) and provider playbooks (`../cargo-gtm/provider-playbooks/*.md`).
- **Capability skills** — standard library. One per CLI domain (orchestration, storage, connection, AI, context, analytics, billing, workspace management). Loaded by `cargo-gtm`, or directly when you need a specific CLI domain.

`cargo-gtm` delegates to capability skills; capability skills never reference `cargo-gtm` (one-way dependency).

**Glossary:** See [`references/glossary.md`](references/glossary.md) for term-by-term definitions (UUIDs, slugs, `conjonction`, run/batch/play/tool, signal/persona/ICP, etc.).

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

All commands output JSON to stdout. Failed commands exit non-zero and return `{"errorMessage": "..."}`. For the full setup conventions that every capability skill links to (token scopes, async polling, admin-only commands), see [`references/prerequisites.md`](references/prerequisites.md).

## Every Cargo session has three jobs

### 1. At session start — refresh and register

Before any other Cargo command, refresh the CLI and skills, then register the session in workspace management:

```bash
# Refresh — idempotent, ~10s
npm install -g @cargo-ai/cli@latest
npx -y skills add getcargohq/cargo-skills

# Register the session (placeholders OK — overwritten at session end)
cargo-ai workspaceManagement session upsert \
  --session-id <claude-session-id> \
  --title "Claude Code session <claude-session-id>" \
  --summary "Session in progress."
```

Skip the refresh only if the user explicitly pinned a version. Skip the `session upsert` only if the user opted out or no `session_id` is available.

### 2. Mid-session — re-refresh, or escalate when stuck

**Re-refresh** the CLI and skills mid-session when:

- A documented CLI flag or response shape doesn't match what you observe (a fix may have shipped since session start).
- The user explicitly asks ("bump cargo", "make sure I'm on latest").

**Send a workspace management report** when the CLI is failing in a way the skill references and `--help` cannot resolve, the user or agent is repeatedly retrying the same command without progress, the syntax for a flag / JSON payload is unclear, or a needed capability seems missing:

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

This is the official feedback channel — every report is reviewed by the Cargo team and used to improve the CLI and these skills. **Do not give up silently — file a report.** See `../cargo-workspace-management/SKILL.md` (Reports section) and `../cargo-workspace-management/references/examples/reports.md` for templates.

### 3. At session end — finalize the session row

Produce a short title (5–8 words) and a 1–2 sentence summary of what the session actually worked on, then overwrite the placeholder row and stamp `finished_at`:

```bash
cargo-ai workspaceManagement session upsert \
  --session-id <claude-session-id> \
  --title "<5-8 word title>" \
  --summary "<1-2 sentence summary of what was accomplished or attempted>" \
  --finished
```

`--title` and `--summary` are required (NOT NULL). `--finished` stamps `finished_at = now`; pass `--finished-at <iso>` for an explicit timestamp.

## Claude Code: scaffold a hook pair to automate the lifecycle

If you are running in Claude Code and the user's project does not already have `SessionStart` + `SessionEnd` hooks for the lifecycle above (check `.claude/settings.json` and `.claude/hooks/`), offer **once per session** to scaffold them — phrase it as a single yes/no question ("Want me to wire up SessionStart + SessionEnd hooks so the CLI/skills auto-refresh and every session is tracked in workspace management?"). On yes, write `.claude/hooks/session-start.sh` + `.claude/hooks/session-end.sh`, merge the `SessionStart` + `SessionEnd` entries into `.claude/settings.json`, and `chmod +x` both scripts. Recipes:

- [`../README.md#claude-code`](../README.md#claude-code) — auto-refresh CLI + skills at session start
- [`../cargo-workspace-management/references/examples/sessions.md`](../cargo-workspace-management/references/examples/sessions.md) — session tracking with AI-generated title/summary at session end

Both flows can share a single `session-start.sh` (refresh + register) and a single `session-end.sh` (summarize + finalize). Do not offer if the hooks are already present, if the user declined earlier in the session, or if the project clearly isn't using Claude Code.

---

## Skills at a glance

### Outcome skill

Load when the user states a real-world goal.

| Skill                                                       | Load when you need to…                                                                             |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| [`cargo-gtm`](../cargo-gtm/SKILL.md) ([recap](#cargo-gtm))  | Any GTM task — sourcing, enrichment, verification, scoring, sequencing, CRM sync, signal monitoring (job changes, funding, tech-stack/hiring intent). Routes via recipes (`recipes/`), guides (`guides/`), and provider playbooks (`provider-playbooks/`). |

### Capability skills

Load for a specific CLI domain. The first link in each row jumps to the actual SKILL.md; the parenthetical jumps to the recap on this page.

| Skill                                                                                                       | Load when you need to…                                                                             |
| ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| [`cargo-orchestration`](../cargo-orchestration/SKILL.md) ([recap](#cargo-orchestration))                    | Execute actions, run workflows, trigger batches, chat with agents, query orchestration with SQL (ClickHouse) |
| [`cargo-analytics`](../cargo-analytics/SKILL.md) ([recap](#cargo-analytics))                                | Download run results, export segment data, monitor error rates and metrics                         |
| [`cargo-billing`](../cargo-billing/SKILL.md) ([recap](#cargo-billing))                                      | Check credit usage, view subscription details, track costs per workflow or connector               |
| [`cargo-storage`](../cargo-storage/SKILL.md) ([recap](#cargo-storage))                                      | Inspect or modify data models, columns, datasets, and relationships; query workspace storage with SQL |
| [`cargo-connection`](../cargo-connection/SKILL.md) ([recap](#cargo-connection))                             | Manage connector authentication, discover available integrations and their actions                 |
| [`cargo-ai`](../cargo-ai/SKILL.md) ([recap](#cargo-ai))                                                     | Create and configure agents, upload files for RAG, manage MCP servers                              |
| [`cargo-context`](../cargo-context/SKILL.md) ([recap](#cargo-context))                                      | Browse/read/write/edit the workspace's git-backed GTM context repo, run commands in its runtime sandbox, inspect the knowledge graph |
| [`cargo-workspace-management`](../cargo-workspace-management/SKILL.md) ([recap](#cargo-workspace-management)) | Invite users, create API tokens, organize folders, manage roles, report CLI issues to management   |

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

             ┌───────────────────────────────────────┐
             │             cargo-context             │
             │  Git-backed GTM markdown knowledge:   │
             │  personas, plays, proof, signals…     │
             └───────────────────────────────────────┘
           (orthogonal: not part of the workflow flow)
```

**Dependency rules in practice:**

- `cargo-gtm` delegates to capability skills via relative paths (`../cargo-orchestration/...`). Capability skills never reference `cargo-gtm`.
- `cargo-workspace-management` provides auth context for every skill — set it up first.
- `cargo-storage`, `cargo-connection`, and `cargo-ai` are peer skills that supply UUIDs to `cargo-orchestration`. They don't depend on each other.
- `cargo-context` is **orthogonal** to the workflow-execution flow. It touches the git-backed GTM knowledge base (markdown/MDX), not storage or workflow runs. Use it for capturing/editing the workspace's prose context — personas, plays, proof, objections, signals — and for inspecting the typed knowledge graph.
- For SQL queries against storage, use `cargo-ai storage query execute "<sql>"` (tables as `<datasetSlug>.<modelSlug>`). Load `cargo-storage` to discover dataset and model slugs, and to fetch the DDL when you need column types or the SQL dialect.
- For SQL queries against orchestration runtime tables (`runs`, `batches`, `spans`, `records`) — error rates, per-node failures, time-series — use `cargo-ai orchestration query execute "<sql>"`. Workspace scoping is automatic; tables are referenced without a schema prefix.
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
| `recipes/outreach-activation.md` | Turn a signal segment into send-ready outreach (enrich → verify → personalize → sequencer handoff). |
| `recipes/re-engagement.md` | Wake up stale contacts only when a fresh signal fires (job change, funding, tech intent). |
| `recipes/lost-deal-revival.md` | Revive Closed-Lost CRM deals by branching on `lost_reason` (champion left, budget, timing). |
| `recipes/account-expansion.md` | Multi-thread customer accounts — net-new buyers, deduped against the Contacts model. |

**Priority provider stack** (recipes lead with these): salesNavigator (sourcing), cargo native (firmographics + signals), waterfall (multi-source enrichment + email verify + job-change), FullEnrich (premium contact lookup), theirStack (tech-stack + hiring intent), peopleDataLabs (heavyweight backfill).

**Critical rules:**
- All recipes use credits-based actions (`cargo-ai connection integration list` → 141 credits-based actions across 120 integrations).
- Action shape: `{"kind":"connector","integrationSlug":"<slug>","actionSlug":"<slug>","config":{}}` — **no `connectorUuid` in `config`**.
- Output retrieval: `cargo-ai orchestration run download-outputs --output-node-slug <slug>` (NOT `run download`).
- peopleDataLabs filter shape: `searchX` uses cargo's `{conjonction, groups, conditions}` shape; `queryX` takes a PDL **SQL string** — never Elasticsearch.

**References:** `../cargo-gtm/SKILL.md`

---

### cargo-orchestration

**The execution hub.** Execute actions, run workflows, chat with AI agents, query orchestration runtime tables (`runs`/`batches`/`spans`/`records`) with SQL, and fetch segment records.

**Critical rules:**

- See the decision flowchart at the top of `../cargo-orchestration/SKILL.md` for when to use `action execute` vs `run create` vs `batch create`.
- **Prefer built-in actions + expressions when building a node graph.** Avoid `python`, `script` (JS), and raw HTTP nodes unless necessary: use `variables` for transforms, the native `agent` node for LLM calls, the integration's dedicated connector action for APIs, and `branch`/`filter`/`switch` for routing. See `../cargo-orchestration/references/node-selection.md`.
- Filter JSON uses `conjonction` (not `conjunction`) — breaks silently if misspelled.
- Query orchestration runtime tables (ClickHouse) with `cargo-ai orchestration query execute "<sql>"` against `runs`, `batches`, `spans`, `records` (no schema prefix; workspace scoping is automatic).
- For SQL against workspace storage (Companies, Contacts, …), use `cargo-ai storage query execute "<sql>"` — documented in `cargo-storage`.
- All operations are async — poll or pass `--wait-until-finished`. See [Async polling](#async-polling).

**References:** `../cargo-orchestration/SKILL.md`

---

### cargo-analytics

**Measurement and export.** Download run results, export segment data, and monitor error rates and success metrics.

**Critical rules:**

- `segment download` requires `--model-uuid`, not `--segment-uuid`.
- For batch result download, get the `output-node-slug` from `release get <release-uuid>` → `nodes[].slug`.
- For billing and credit usage, use `cargo-billing` instead.

**References:** `../cargo-analytics/SKILL.md`

---

### cargo-billing

**Cost and credit management.** Track credit consumption per workflow, connector, or agent; check subscription status; view invoices.

**Critical rules:**

- Requires a token with **admin access**.
- Invoice amounts are in cents — divide by 100 for dollars.
- `subscriptionAvailableCreditsCount - subscriptionCreditsUsedCount` from `subscription get` = remaining credits.

**References:** `../cargo-billing/SKILL.md`

---

### cargo-storage

**Data schema management and SQL queries.** Inspect models, create or update columns, navigate datasets, understand workspace data structure, and run SQL against workspace storage.

**Critical rules:**

- Query via `cargo-ai storage query execute "<sql>"` (or `storage query download --query "<sql>"` for full exports) using `<datasetSlug>.<modelSlug>` table names (e.g. `default.companies`). `model get-ddl` is optional — useful for column types and SQL dialect.
- For SQL against orchestration runtime tables (`runs`/`batches`/`spans`/`records`), use `cargo-ai orchestration query execute "<sql>"` — documented in `cargo-orchestration`.
- For advanced record queries (filtering, sorting, pagination), use `segmentation segment fetch` from `cargo-orchestration`.

**References:** `../cargo-storage/SKILL.md`

---

### cargo-connection

**Connector and integration management.** Authenticate external services, discover supported actions, get the `connectorUuid` and `actionSlug` values needed for workflow node graphs.

**Key concepts:**

- **Integration** = external service type (HubSpot, Clearbit, Salesforce, …)
- **Connector** = authenticated instance of an integration (referenced by `connectorUuid` in nodes)

**References:** `../cargo-connection/SKILL.md`

---

### cargo-ai

**Agent resource management.** Create and configure agents, upload documents for retrieval-augmented generation (RAG), connect MCP servers.

> For _using_ agents (sending messages, multi-turn chat, polling), use `cargo-orchestration`.

See `../cargo-ai/SKILL.md` for model and temperature guidance by use case.

**References:** `../cargo-ai/SKILL.md`

---

### cargo-context

**GTM context repository.** Browse, read, write, and edit the workspace's git-backed knowledge base of typed markdown/MDX files — personas, plays, proof, objections, signals, ICPs, etc. — via the runtime sandbox. Inspect cross-references with the knowledge graph.

**Key concepts:**

- **Context repository** = the GitHub repo backing the workspace's context. Canonical example: [`getcargohq/cargo-workspaces`](https://github.com/getcargohq/cargo-workspaces). Files use `kebab-case.md` names, YAML frontmatter with required `title` + `description`, and `domain/slug` cross-refs (no `.md`).
- **Runtime sandbox** = a checked-out, executable copy of the context repo. `runtime write` and `runtime edit` push to the default branch; `runtime execute` does **not** push.
- **Knowledge graph** = the typed graph over every md/mdx file, with frontmatter and outbound cross-refs per node. Built via `cargo-ai context graph get`.

**Critical rules:**

- `runtime write` / `runtime edit` commit and push. `runtime execute` is ephemeral — use it for `grep`/`ls`/inspection, never for persistent changes.
- `runtime edit --old-string` must match the file content **exactly once**. Read first, copy whitespace verbatim.
- Every file requires both `title` and `description` in frontmatter — missing values break the knowledge graph.
- For domains, conventions, and per-domain templates, see `../cargo-context/references/conventions.md`.

**Lifecycle:**

- For bootstrapping a fresh workspace's context from a domain (ICP, personas, proof, signals — idempotent, skips already-seeded domains), see [`../cargo-context/references/examples/bootstrap-from-domain.md`](../cargo-context/references/examples/bootstrap-from-domain.md).
- For the full bootstrap + ongoing call-driven refresh playbook (Phase 1 + Phase 2 + cadence), see [`../cargo-context/references/examples/lifecycle.md`](../cargo-context/references/examples/lifecycle.md).

**References:** `../cargo-context/SKILL.md`

---

### cargo-workspace-management

**Workspace administration.** Invite users, create and rotate API tokens, organize plays/tools/agents into folders, manage roles, and **submit reports to workspace management when the CLI fails or is being misused**.

**Critical rules:**

- Most commands require a token with **admin access**.
- `workspaceManagement token create` requires `--name` (the legacy `--from-user` flag was removed). Pick a name that makes the token's purpose obvious in `token list` later.
- Token values are only shown **once** at creation — store immediately in a secrets manager (GitHub Secrets, AWS Secrets Manager, etc.).
- **Always send a `workspaceManagement report create`** when the CLI errors, is being used incorrectly, or you (user or agent) are struggling to make progress on a CLI task — see the section at the top of this file and `../cargo-workspace-management/references/examples/reports.md`.

**References:** `../cargo-workspace-management/SKILL.md`

---

## Async polling

All operations are asynchronous. Pass `--wait-until-finished` to block, or poll:

| Result type   | Poll command                              | Interval | Terminal when                                  |
| ------------- | ----------------------------------------- | -------- | ---------------------------------------------- |
| Run           | `cargo-ai orchestration run get <uuid>`   | 2s       | `status` is `success`, `error`, or `cancelled` |
| Batch         | `cargo-ai orchestration batch get <uuid>` | 5s       | `status` is `success`, `error`, or `cancelled` |
| Agent message | `cargo-ai ai message get <uuid>`          | 2s       | `status` is `success` or `error`               |

`action execute` returns a run; `action execute-batch` returns a batch — same polling applies.

See `../cargo-orchestration/references/polling.md` for retry strategies, error handling, and large-batch guidance.

---

## UUID flow between skills

See [`references/uuid-flow.md`](references/uuid-flow.md) — producer/consumer table for every UUID and slug that crosses skill boundaries (`workflowUuid`, `modelUuid`, `connectorUuid`, `actionSlug`, …), the standard discovery sequence to run before any workflow, and the `app.getcargo.io` URL patterns for resolving UUIDs in the UI.

---

## End-to-end use cases

See [`references/use-cases.md`](references/use-cases.md) — 8 worked recipes (single-record enrich, batch + CRM sync, AI lead scoring, custom workflow from scratch, error monitoring, fresh-workspace bootstrap, segment export with filter+sort, GTM context audit) showing which skills to load and the command sequence for each.

---

## Common gotchas

See [`references/gotchas.md`](references/gotchas.md) — silent-failure footguns and frequently confused command pairs (`conjonction` spelling, `run create` vs `batch create`, `--model-uuid` vs `--segment-uuid`, storage query table naming, token-shown-once, invoice cents, third-party connector rate limits, `context runtime execute` vs `write`/`edit`, …).
