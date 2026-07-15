---
name: cargo
description: Router and overview for the Cargo CLI agent skills. Explains the fifteen skills (this router + one onboarding skill cargo-quickstart + one outcome skill cargo-gtm + twelve capability skills, including cargo-cdk for declarative workspace-as-code and cargo-diagnostics for run/batch/cost forensics), when to use the declarative CDK vs the imperative CLI, the UUID flow between them, async polling, end-to-end use cases (enrich one record, enrich and sync to CRM, AI lead scoring, custom workflow, error monitoring, fresh-workspace bootstrap, segment export, GTM context authoring), and common gotchas (`conjonction` spelling, run vs batch, model-uuid vs segment-uuid). Load first whenever working with the Cargo CLI, when unsure which sub-skill applies, when stitching multiple sub-skills together, when bootstrapping a workspace, or when the user asks about Cargo skills in general.
version: "1.14.2"
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

This repository contains 15 skills at the repo root: this **router** (`cargo`), one **onboarding skill** (`cargo-quickstart`), one **outcome skill** (`cargo-gtm`), and twelve **capability skills**.

- **`cargo-quickstart`** — guided first-run demo. Fresh workspace → real deliverable (25 leads for the user's persona, with a cost receipt) in under two minutes, ending by saving the demo as a recurring play. Load for new users, demo/tour requests, or empty workspaces.
- **`cargo-gtm`** — application library. The front door for any GTM task ("build a TAM list", "find 5 fintech CTOs", "monitor job changes"). Routes via internal recipes (`../cargo-gtm/recipes/*.md`) and provider playbooks (`../cargo-gtm/provider-playbooks/*.md`).
- **Capability skills** — standard library. One per CLI domain (orchestration, storage, connection, AI, content, context, analytics, billing, hosting, cdk, workspace management), plus `cargo-diagnostics` (cross-domain forensics over runs, batches, and credit spend). Loaded by `cargo-gtm`, or directly when you need a specific CLI domain.
- **`cargo-cdk`** — the declarative one. Where the other capability skills wrap **imperative** one-off `cargo-ai <domain>` calls, `cargo-cdk` defines the whole workspace as code (`define*` builders + `cargo-ai cdk deploy`) and reconciles it. It spans every resource type — see "Declarative vs imperative" below to route between it and the imperative skills.

`cargo-gtm` delegates to capability skills; capability skills never reference `cargo-gtm` (one-way dependency).

**Glossary:** See [`references/glossary.md`](references/glossary.md) for term-by-term definitions (UUIDs, slugs, `conjonction`, run/batch/play/tool, signal/persona/ICP, etc.).

**Interaction conventions:** See [`references/interaction.md`](references/interaction.md) for the pack-wide defaults on when to stop and ask (plan gate before building, recommended-default choices) and how to present results (narrate, summarize — never dump raw JSON).

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

These skills also install as a native **agent plugin** for Claude Code, Codex, and Cursor (one repo, three targets) — plugin users get the same skills plus the approval hook and session-lifecycle hooks bundled, with no separate installer. See the repo `README.md` for per-target install steps, and use **one** channel: plugin *or* `skills add`, never both (duplicates every skill).

All commands output JSON to stdout. Failed commands exit non-zero and return `{"errorMessage": "..."}`. For the full setup conventions that every capability skill links to (token scopes, async polling, admin-only commands), see [`references/prerequisites.md`](references/prerequisites.md).

## Every Cargo session has three jobs

> **Automated on Claude Code.** Jobs 1 and 3 (refresh + session register/finalize) run on their own when either the **Cargo plugin** is installed (its bundled `SessionStart`/`Stop`/`SessionEnd` hooks handle them) or the installer's hooks (`curl -fsSL https://api.getcargo.io/install.sh | sh`) are present. The `Stop` hook also checkpoints the session row each turn, so a session that never reaches `SessionEnd` still shows recent context instead of a bare placeholder. Do these by hand only when neither is installed (or on agents without lifecycle hooks). Job 2 (reporting) is always your responsibility — it can't be automated.

### 1. At session start — refresh and register

Before any other Cargo command, refresh the CLI and skills, then register the session in workspace management:

```bash
# Refresh — idempotent, ~10s. Skills first, then the CLI at the version the
# bundle pins. The pin file `cli-version` sits in the same directory as this
# SKILL.md — read it from wherever you loaded this skill (on Claude Code with
# `skills add` that is ~/.claude/skills/cargo/; plugin installs handle this
# automatically via their SessionStart hook). Fall back to latest.
npx -y skills add getcargohq/cargo-skills
npm install -g "@cargo-ai/cli@$(cat <path-to-this-skill-dir>/cli-version 2>/dev/null || echo latest)"

# Register the session (placeholders OK — overwritten at session end)
cargo-ai workspaceManagement session upsert \
  --session-id <session-id> \
  --title "Agent session <session-id>" \
  --summary "Session in progress."
```

Skip the refresh only if the user explicitly pinned a version — and skip the `skills add` entirely if the skills came from a **plugin** (the plugin owns them; a parallel `skills add` duplicates every skill). Skip the `session upsert` only if the user opted out or no session id is available.

**Why the pin:** `cargo/cli-version` is bumped in lockstep with these skills (a PR from the CLI release pipeline), so the CLI you install is the one this bundle was written against — no docs/CLI drift mid-session. If the pin file is missing or unreadable, `latest` is the safe fallback. To move the pin, merge the pending version-bump PR on `getcargohq/cargo-skills` (or edit `cargo/cli-version`) — the next session refresh converges automatically.

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

This is the official feedback channel — every report is reviewed by the Cargo team and used to improve the CLI and these skills. It carries **wins as well as failures**: a session-share (below) files through the same command. **Do not give up silently — file a report.** See `../cargo-workspace-management/SKILL.md` (Reports section) and `../cargo-workspace-management/references/examples/reports.md` for templates.

### 3. At session end — finalize the session row, then ask to share

Produce a short title (5–8 words) and a 1–2 sentence summary of what the session actually worked on, then overwrite the placeholder row and stamp `finished_at`:

```bash
cargo-ai workspaceManagement session upsert \
  --session-id <claude-session-id> \
  --title "<5-8 word title>" \
  --summary "<1-2 sentence summary of what was accomplished or attempted>" \
  --finished
```

`--title` and `--summary` are required (NOT NULL). `--finished` stamps `finished_at = now`; pass `--finished-at <iso>` for an explicit timestamp.

**Then ask once, at the natural end of the session:**

> "Send this session's activity to the Cargo team so they can improve the experience? (Y/N)"

On yes, file a session-share report (consented session traces are the fastest product-learning loop the team has):

```bash
cargo-ai workspaceManagement report create \
  --title "Session share: <5-8 word session title>" \
  --description "<what the user tried to accomplish, the commands/recipes used, what worked, where friction appeared, credits spent — no secrets or record-level data>"
```

On no, don't ask again this session. Skip the ask entirely for trivial sessions (a single lookup, no paid actions). See `../cargo-workspace-management/references/examples/reports.md` for the session-share template.

---

## Skills at a glance

### Declarative (CDK) vs imperative (CLI) — pick the mode first

Two ways to create/manage the same Cargo resources. Decide which the task wants
before picking a domain:

- **Declarative → [`cargo-cdk`](../cargo-cdk/SKILL.md).** The user is managing
  resources **as an artifact**: "set up / bootstrap a whole workspace as code",
  "make this reproducible / version-controlled / in git", "deploy these
  connectors + models + agents together", or anything that should be re-runnable
  and diffable across environments. Define it in `define*` files and
  `cargo-ai cdk deploy`.
- **Imperative → the matching capability skill below.** The user is doing a
  **one-off operation** or **exploring**: "create one connector", "add a column",
  "list connectors", "run this workflow", "query storage", "read a memory". A read,
  ad-hoc query, or single mutation that needn't live in code.

When unsure: should the result be committed and re-deployable? Yes → CDK. A quick
action or a read → the capability skill.

### Onboarding skill

Load for a brand-new user or an empty workspace.

| Skill                                                                    | Load when you need to…                                                                             |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| [`cargo-quickstart`](../cargo-quickstart/SKILL.md)                       | Run the guided first-run demo: one persona question → 25 leads in under two minutes → cost receipt → save as a recurring play. Routes to `cargo-gtm` afterwards. |

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
| [`cargo-diagnostics`](../cargo-diagnostics/SKILL.md) ([recap](#cargo-diagnostics))                          | Diagnose after the fact: trace why one run misbehaved, sweep a batch/play for errors grouped by root cause, profile where a play's credits go |
| [`cargo-storage`](../cargo-storage/SKILL.md) ([recap](#cargo-storage))                                      | Inspect or modify data models, columns, datasets, and relationships; query workspace storage with SQL |
| [`cargo-connection`](../cargo-connection/SKILL.md) ([recap](#cargo-connection))                             | Manage connector authentication, discover available integrations and their actions                 |
| [`cargo-ai`](../cargo-ai/SKILL.md) ([recap](#cargo-ai))                                                     | Create and configure agents, configure releases, attach knowledge for RAG, manage MCP servers and memories |
| [`cargo-content`](../cargo-content/SKILL.md) ([recap](#cargo-content))                                      | Upload and organize knowledge files, build native/connector-backed knowledge libraries for RAG (the `content` domain) |
| [`cargo-context`](../cargo-context/SKILL.md) ([recap](#cargo-context))                                      | Browse/read/write/edit the workspace's git-backed GTM context repo, run commands in its runtime sandbox, inspect the knowledge graph |
| [`cargo-hosting`](../cargo-hosting/SKILL.md) ([recap](#cargo-hosting))                                      | Scaffold, deploy, and promote hosted apps (Vite SPAs on `*.cargo.app`) and edge workers (serverless HTTP handlers), and manage their deployments |
| [`cargo-cdk`](../cargo-cdk/SKILL.md) ([recap](#cargo-cdk))                                                   | **Declarative — spans every resource type.** Define a whole workspace in code (`define*` builders) and deploy it with `cargo-ai cdk` (init → types → plan → deploy). Use for workspace-as-code / reproducible / version-controlled setups; see "Declarative vs imperative" above. |
| [`cargo-workspace-management`](../cargo-workspace-management/SKILL.md) ([recap](#cargo-workspace-management)) | Invite users, create API tokens, organize folders, manage roles, report CLI issues to management   |

> **Agent knowledge for RAG:** **files** + **libraries** live in the `content` domain → [`cargo-content`](../cargo-content/SKILL.md); how they attach to an agent → [`cargo-ai`](../cargo-ai/SKILL.md). (Files/libraries moved out of the old `ai file …` path in CLI ≥ 1.0.19.)

### CLI domains without a dedicated skill yet

The CLI exposes several domains that no capability skill wraps yet. Reach for them directly (`cargo-ai <domain> --help`) when a task needs them, and file a `workspaceManagement report` if the surface is unclear:

| CLI domain | Covers |
| --- | --- |
| `segmentation` | Segments and changes (`segment list/get/create/fetch/download`, `change`). Some of this is already used from `cargo-orchestration`/`cargo-analytics`. |
| `expression` | Recipes and expression evaluation (`eval`, `recipe`) — generate/evaluate the template expressions used in node graphs. |
| `system-of-record` | System-of-record, client, and log operations. |
| `revenue-organization` | Allocations, capacities, members, territories (revenue/territory planning). |
| `user-management` | Current-user operations with no workspace context. |

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
  │ Models, columns,│   │ Connectors,        │   │ Agents, docs,   │
  │ datasets        │   │ integration actions│   │ MCP, memory     │
  └────────┬────────┘   └─────────┬──────────┘   └────────┬────────┘
                                              (cargo-content feeds
                                               files/libraries to agents)
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

             ┌───────────────────────────────────────┐
             │               cargo-cdk               │
             │  Declarative authoring layer: define  │
             │  connectors/models/plays/agents/… as  │
             │  code, deploy with `cargo-ai cdk`.    │
             └───────────────────────────────────────┘
    (cross-cutting: PRODUCES the same resources the imperative
     skills manage — an alternative mode, not a workflow stage)
```

**Dependency rules in practice:**

- `cargo-gtm` delegates to capability skills via relative paths (`../cargo-orchestration/...`). Capability skills never reference `cargo-gtm`.
- `cargo-workspace-management` provides auth context for every skill — set it up first.
- `cargo-storage`, `cargo-connection`, and `cargo-ai` are peer skills that supply UUIDs to `cargo-orchestration`. They don't depend on each other.
- `cargo-content` owns workspace **files** and **libraries** (the `content` domain). It produces file/library UUIDs that `cargo-ai` consumes as agent release `resources` (RAG). Uploaded content files also surface read-only under `.files/` in the `cargo-context` runtime sandbox.
- `cargo-cdk` is **cross-cutting**: it's a declarative *authoring mode* that produces the very connectors/models/plays/agents/etc. the imperative capability skills manage one at a time. Route to it when the task is "manage the workspace as code" (reproducible, in git, multi-resource); route to the imperative domain skills for one-off ops, reads, and ad-hoc queries. See "Declarative vs imperative" under Skills at a glance.
- `cargo-context` is **orthogonal** to the workflow-execution flow. It touches the git-backed GTM knowledge base (markdown/MDX), not storage or workflow runs. Use it for capturing/editing the workspace's prose context — personas, plays, proof, objections, signals — and for inspecting the typed knowledge graph.
- For SQL queries against storage, use `cargo-ai storage query execute "<sql>"` (tables as `<datasetSlug>.<modelSlug>`). Load `cargo-storage` to discover dataset and model slugs, and to fetch the DDL when you need column types or the SQL dialect.
- For SQL queries against orchestration runtime tables (`runs`, `batches`, `spans`, `records`) — error rates, per-node failures, time-series — use `cargo-ai orchestration query execute "<sql>"`. Workspace scoping is automatic; tables are referenced without a schema prefix.
- Before building a workflow node graph, load `cargo-connection` to get `connectorUuid` and `actionSlug`.
- Before executing a workflow that uses an agent node, load `cargo-ai` to get `agentUuid`.
- After runs complete, load `cargo-analytics` to download results or measure performance. **For action output retrieval, prefer `cargo-ai orchestration run download-outputs` over `run download` — the former returns a signed-URL CSV/JSON of just the output node's data.**
- Load `cargo-billing` to understand credit consumption for any of the above.
- When a run failed, a run "succeeded but looks wrong", a batch has errors, or a play costs too much, load `cargo-diagnostics` — it sequences the `run get` / orchestration-SQL / billing surfaces into forensic runbooks (trace one run, sweep a batch, profile credit spend).

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
- Analytics answers "what happened" (metrics, counts, exports). When the question is **why** — a failing run, a batch full of errors, surprising cost — hand off to `cargo-diagnostics`; its sweep runbook picks up exactly where analytics' error counts leave off.

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

### cargo-diagnostics

**Forensics over runs, batches, and spend.** Three runbooks that sequence existing surfaces (`run get`, `orchestration query execute`, `billing usage get-metrics`) into diagnoses: `references/run-trace.md` (explain one run end-to-end — executions, `runContext`, branch routing, per-node credits), `references/batch-error-sweep.md` (group a batch/play's failures by root cause, hand back exemplar run UUIDs), `references/play-optimize-credits.md` (attribute spend to workflows → nodes → providers, then apply cost levers in priority order).

**Critical rules:**

- Start with the **sweep** when you don't know which run to look at; it ends with exemplar UUIDs for the **trace**.
- `runContext` is the source of truth for what a node produced; an execution's `title` is a truncated summary — never evidence.
- Credit attribution (`billing …`) needs an **admin** token; the SQL and `run get` steps don't.
- Any fix that re-runs paid nodes goes through the pilot gate in `../cargo-gtm/references/cost-discipline.md`.
- Diagnostics explains; it doesn't export. For bulk retrieval after the diagnosis (`run download-outputs`, `batch download`, `segment download`) go back to `cargo-analytics`.
- Present conclusions first, evidence as compact tables — per `references/interaction.md` (in the `cargo` router skill).

**References:** `../cargo-diagnostics/SKILL.md`

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

**Agent resource management.** Create and configure agents, configure releases, attach knowledge for retrieval-augmented generation (RAG), connect MCP servers, manage memories.

**Critical rules:**

- Knowledge for RAG attaches to an agent via the release's `resources`: **files** + **libraries** come from [`cargo-content`](#cargo-content). Wire them in with `release update-draft --resources …` then `release deploy-draft`.
- **CLI ≥ 1.0.19:** files and libraries moved out of the `ai` domain into the top-level **`content`** domain (now the `cargo-content` skill). The old `cargo-ai ai file …` commands no longer exist.

> For _using_ agents (sending messages, multi-turn chat, polling), use `cargo-orchestration`.

See `../cargo-ai/SKILL.md` for model and temperature guidance by use case.

**References:** `../cargo-ai/SKILL.md`

---

### cargo-content

**Workspace knowledge files & libraries.** Upload, list, rename, move, and remove **files** (PDFs, CSVs, text); create and sync **libraries** — `native` (workspace-managed) or `connector`-backed (synced from an external source via an unstructured-data extractor). These are the RAG knowledge resources agents reference.

**Critical rules:**

- New top-level **`content`** domain in CLI ≥ 1.0.19 — `cargo-ai content file …` / `cargo-ai content library …`. The old `cargo-ai ai file …` path is gone (`unknown command` → you're on the old path; bump the CLI).
- A file or library is inert until attached to an agent's deployed release `resources` — that wiring lives in [`cargo-ai`](#cargo-ai).
- Uploaded content files are also readable (read-only) under `.files/` in the `cargo-context` runtime sandbox.
- For batch-run **input** files (CSVs that drive a batch), use `cargo-ai workspaceManagement file upload` (a different surface) — see `cargo-workspace-management`.

**References:** `../cargo-content/SKILL.md`

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
- Set `title` + `description` frontmatter on every `.md`/`.mdx` file — a **strong convention, not enforced**: missing/malformed frontmatter is still committed, it just indexes poorly (graph falls back to filename + first paragraph, and reads `summary`, not `description`).
- Graph **edges** form only from frontmatter `references:`, markdown links, or wikilinks — a bare path in prose creates no edge. Cite source files in `references:`.
- For domains, conventions, and per-domain templates, see `../cargo-context/references/conventions.md`.

**Lifecycle:**

- For bootstrapping a fresh workspace's context from a domain (ICP, personas, proof, signals — idempotent, skips already-seeded domains), see [`../cargo-context/references/examples/bootstrap-from-domain.md`](../cargo-context/references/examples/bootstrap-from-domain.md).
- For the full bootstrap + ongoing call-driven refresh playbook (Phase 1 + Phase 2 + cadence), see [`../cargo-context/references/examples/lifecycle.md`](../cargo-context/references/examples/lifecycle.md).

**References:** `../cargo-context/SKILL.md`

---

### cargo-hosting

**Cargo Hosting.** Scaffold, deploy, and manage hosted **apps** (Vite SPAs on `https://<slug>.cargo.app`, built on `@cargo-ai/app-sdk`) and **workers** (serverless edge `fetch(request, env)` handlers on `@cargo-ai/worker-sdk`), plus the **deployments** that ship and promote them.

**Lifecycle:** `init` (local scaffold) → `create` (slot + globally-unique slug) → `deployment create` (build+upload) → `deployment promote` (go live).

**Critical rules:**

- `--slug` is the live subdomain — **globally unique within the hosting domain**.
- **Deploying ≠ going live.** `deployment create` builds; the URL only moves on `deployment promote`. `deployment get-promoted` shows what's live.
- `--source` is the **package root**, not `dist/` — the build (`npm ci && vite build` for apps, bundling for workers) runs server-side.
- Builds are async — poll `deployment get` until terminal before promoting.
- `--app-uuid` / `--worker-uuid` are mutually exclusive on deployment commands; `remove` cascades to deployments.
- Folders come from [`cargo-workspace-management`](#cargo-workspace-management); `--folder-uuid null` moves to root.

**References:** `../cargo-hosting/SKILL.md`

---

### cargo-cdk

**Declarative workspace-as-code — the imperative skills' counterpart.** Define an
entire Cargo workspace in TypeScript (`defineConnector`/`defineModel`/`defineAgent`/
`definePlay`/`defineTool`/`defineMcpServer`/`defineContext`/`defineSegment`/
`defineFolder`/`defineFile`/`defineWorker`/`defineApp`) and reconcile it to live
infra with `cargo-ai cdk`. Spans **every** resource type, so it overlaps every
imperative capability skill — route with "Declarative vs imperative" above.

**Lifecycle:** `cdk init` (scaffold from a template) → `cdk types` (type config
against the workspace) → author `define*` files → `cdk plan` (offline diff) →
`cdk deploy` (create/update, write state) → `cdk destroy`. Plus `refresh` (drift),
`import` (adopt existing), `rollback`.

**Critical rules:**

- **Commit `cargo.state.json`** — it links code to created resources and is the
  *only* handle on deployed plays/agents (no slug); losing it orphans them.
- **Wire by handle, not `.uuid`** — pass a `define*` handle or `xxRef("uuid")`.
- **Secrets** go through `secret("ENV_VAR")` — resolved at deploy, never written to
  state or the content hash. Export the env var first.
- **`--yes`** is required for non-interactive `deploy`/`destroy` (CI).
- **Run `cargo-ai cdk types`** after workspace integrations change so config
  type-checks; typing is a bonus, deploy works without it.

**Recipes shipped:** `recipes/scaffold-a-workspace.md`, `add-connector-and-model.md`,
`build-an-agent.md`, `migrate-existing-workspace.md`, `deploy-from-ci.md`.

**References:** `../cargo-cdk/SKILL.md`

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
