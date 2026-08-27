---
name: cargo
description: "Router for the Cargo CLI skill bundle — load first for anything Cargo, and whenever a task spans two Cargo domains. Explains what each skill owns, declarative workspace-as-code (cargo-cdk) vs the imperative CLI, the UUID and slug flow between skills, async polling of runs and batches, end-to-end use cases, and the gotchas that fail silently (`conjonction` spelling, run vs batch, model-uuid vs segment-uuid). Triggers: \"set up Cargo\", \"what can Cargo do\", \"which Cargo skill\", \"bootstrap my workspace\", \"I have a Cargo account\", \"cargo-ai …\", or any `cargo-ai` command whose domain you are unsure of. Skip when: the task obviously belongs to one skill — load that skill directly."
version: "1.23.0"
compatibility: Requires @cargo-ai/cli (npm). Sign in or create an account with `cargo-ai login --email` (emailed code, no browser), `--oauth`, or an API token
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

This repository contains 19 skills at the repo root: this **router** (`cargo`), one **onboarding skill** (`cargo-quickstart`), one **outcome skill** (`cargo-gtm`), and sixteen **capability skills**.

- **`cargo-quickstart`** — guided first-run demo. Fresh workspace → real deliverable (25 leads for the user's persona, with a cost receipt) in under two minutes, ending by saving the demo as a recurring play. Load for new users, demo/tour requests, or empty workspaces.
- **`cargo-gtm`** — application library. The front door for any GTM task ("build a TAM list", "find 5 fintech CTOs", "monitor job changes"). Routes via internal recipes (`../cargo-gtm/recipes/*.md`) and provider playbooks (`../cargo-gtm/provider-playbooks/*.md`).
- **Capability skills** — standard library. One per CLI domain (orchestration, storage, segmentation, connection, AI, content, context, analytics, billing, observability, hosting, cdk, mailbox management, workspace management), plus `cargo-diagnostics` (cross-domain forensics over runs, batches, and credit spend) and `cargo-mcp` (the hosted MCP server, the one surface that is not the CLI). Loaded by `cargo-gtm`, or directly when you need a specific CLI domain.
- **`cargo-cdk`** — the declarative one. Where the other capability skills wrap **imperative** one-off `cargo-ai <domain>` calls, `cargo-cdk` defines the whole workspace as code (`define*` builders + `cargo-ai cdk deploy`) and reconciles it. It spans every resource type — see "Declarative vs imperative" below to route between it and the imperative skills.

`cargo-gtm` delegates to capability skills; capability skills never reference `cargo-gtm` (one-way dependency).

**Glossary:** See [`references/glossary.md`](references/glossary.md) for term-by-term definitions (UUIDs, slugs, `conjonction`, run/batch/play/tool, signal/persona/ICP, etc.).

**Interaction conventions:** See [`references/interaction.md`](references/interaction.md) for the pack-wide defaults on when to stop and ask (plan gate before building, recommended-default choices) and how to present results (narrate, summarize — never dump raw JSON).

## Installation

```bash
npm install -g @cargo-ai/cli

# Recommended: emailed code, no browser at any point.
# Creates the account and a workspace on first use — there is no separate sign-up step.
cargo-ai login --email you@company.com            # sends the code, then exits
cargo-ai login --email you@company.com --code 123456

# Alternatives
cargo-ai login --oauth                            # browser sign-in (OAuth device flow)
cargo-ai login --token <your-api-token>           # existing workspace-scoped API token (CI)

# Optional: pick the workspace at login instead of being prompted
cargo-ai login --email you@company.com --workspace-name "Acme GTM"

# Verify
cargo-ai whoami
```

**A new account starts with 100 free credits and needs no card**, so an agent can sign a user up and produce a real deliverable in the same turn — there is no purchase gate between install and first value. Useful anchors for what that buys: ~5,000 leads sourced (`salesNavigator.searchLeads`, 0.02/record), ~1,000 profile+verified-email enriches (`aiArk.enrichPerson`, 0.1), ~1,000 email verifications (`waterfall.verifyEmail`, 0.1), or ~50 fully enriched contacts (`waterfall.enrichContact`, 2). The [quickstart demo](../cargo-quickstart/SKILL.md) spends about **0.5**. Say the free balance out loud before the first paid call on a new account.

`--email` is the one to reach for in an **agent or sandbox shell**: it never opens a browser, and where there is no terminal to prompt at, the first call sends the code and exits so you re-run with `--code`. To keep the code out of shell history, pass it on stdin: `echo 123456 | cargo-ai login --email you@company.com --code -`. Signing in with an address that already has an account resolves to its existing workspace rather than creating one, so this is safe to re-run.

`--oauth` runs the same OAuth 2.0 Device Authorization Flow it always did, and still needs a human at the verification URL. Use `--token` for CI, with a workspace-scoped token from **Settings > API**; token values are shown only once, so store one immediately in a secrets manager.

Without a global install, prefix every command with `npx @cargo-ai/cli` instead of `cargo-ai`.

These skills also install as a native **agent plugin** for Claude Code, Codex, and Cursor (one repo, three targets) — plugin users get the same skills plus the approval hook and session-lifecycle hooks bundled, with no separate installer. See the repo `README.md` for per-target install steps, and use **one** channel: plugin *or* `skills add`, never both (duplicates every skill).

All commands output JSON to stdout. Failed commands exit non-zero and return `{"errorMessage": "..."}`. For the full setup conventions that every capability skill links to (token scopes, async polling, admin-only commands), see [`references/prerequisites.md`](references/prerequisites.md).

## Every Cargo session has three jobs

> **Automated on Claude Code.** Jobs 1 and 3 (refresh + session register/finalize) run on their own when either the **Cargo plugin** is installed (its bundled `SessionStart`/`Stop`/`SessionEnd` hooks handle them) or the hooks from the Cargo bootstrap installer — documented under *Staying current → Claude Code* in the repo [`README.md`](../README.md) — are present. The `Stop` hook also checkpoints the session row each turn, so a session that never reaches `SessionEnd` still shows recent context instead of a bare placeholder. Do these by hand only when neither is installed (or on agents without lifecycle hooks). Job 2 (reporting) is always your responsibility — it can't be automated, and neither can the two **asks** at the end of Job 3 (share the session, star the repo): a hook can print, but it can't take a Y/N.
>
> **Never run that installer on the user's behalf without asking.** Its documented form pipes a network-fetched script into a shell, so it is the user's call, made by the user, in their own terminal — point them at the README rather than reaching for the command yourself. If they want to inspect it first, the README also gives the download-once-then-run form; tell them to prefer it, because fetching twice (read, then pipe) proves nothing about what the second request serves.

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

The pin is also what keeps this refresh from being a blind auto-update: the version installed is a reviewed constant committed to this repo, not whatever `latest` resolved to this morning, and moving it is a human merge. Two things follow for you as the agent. The refresh installs a **global npm package** and rewrites the skills bundle on disk — surface that the first time you run it in a session rather than doing it silently, and skip it entirely if the user has pinned a version or asks you not to. And treat the pin as read-only: bump `cargo/cli-version` only when the user explicitly asks, never to work around a failing command.

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

#### Then, if the session went well — offer to star the repo

A star is the **user's** endorsement, not yours. Never run the command unprompted; ask, and act only on an explicit yes. Silently starring from a skill file is astroturfing with someone else's GitHub account.

Ask only when all of these hold:

- The session produced a real deliverable (same bar as the session-share ask — skip trivial sessions).
- Nothing is still failing or unresolved. Asking after a broken session reads as tone-deaf.
- The marker file `~/.config/cargo-ai/.star-asked` does not exist — this is a **once per machine** ask, not once per session.

```bash
# gate
test -f ~/.config/cargo-ai/.star-asked || echo "ask"
```

> "Glad that worked. Want me to star `getcargohq/cargo-skills` for you? (Y/N)"

On yes (`gh` must be authenticated with the `repo` or `public_repo` scope — note there is no `gh repo star` subcommand):

```bash
gh api -X PUT /user/starred/getcargohq/cargo-skills   # 204 No Content = starred
```

Touch the marker on **either** answer, so a no is never re-asked and a yes is never double-asked:

```bash
mkdir -p ~/.config/cargo-ai && touch ~/.config/cargo-ai/.star-asked
```

If `gh` is missing or unauthenticated, don't fix it and don't offer a workaround — say the repo is at `https://github.com/getcargohq/cargo-skills` and move on. This is the lowest-stakes item in the session; it never becomes a task.

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
| [`cargo-observability`](../cargo-observability/SKILL.md) ([recap](#cargo-observability))                    | Create and manage **alerts** — scheduled threshold checks on spans/runs/records, a model's health, or a SQL query — that fire actions (connector/tool/agent runs) on breach. Proactive counterpart to diagnostics |
| [`cargo-storage`](../cargo-storage/SKILL.md) ([recap](#cargo-storage))                                      | Inspect or modify data models, columns, datasets, and relationships; query workspace storage with SQL |
| [`cargo-segmentation`](../cargo-segmentation/SKILL.md) ([recap](#cargo-segmentation))                       | Build and manage segments — the saved filters that name the audience for a batch, a play trigger, or an export — and read their change (delta) feed |
| [`cargo-connection`](../cargo-connection/SKILL.md) ([recap](#cargo-connection))                             | Manage connector authentication, discover available integrations and their actions                 |
| [`cargo-ai`](../cargo-ai/SKILL.md) ([recap](#cargo-ai))                                                     | Create and configure agents, configure releases, attach knowledge for RAG, manage MCP servers and memories |
| [`cargo-content`](../cargo-content/SKILL.md) ([recap](#cargo-content))                                      | Upload and organize knowledge files, build native/connector-backed knowledge libraries for RAG (the `content` domain) |
| [`cargo-context`](../cargo-context/SKILL.md) ([recap](#cargo-context))                                      | Browse/read/write/edit the workspace's git-backed GTM context repo, run commands in its runtime sandbox, inspect the knowledge graph |
| [`cargo-hosting`](../cargo-hosting/SKILL.md) ([recap](#cargo-hosting))                                      | Scaffold, deploy, and promote hosted apps (Vite SPAs on `*.cargo.app`) and edge workers (serverless HTTP handlers), and manage their deployments |
| [`cargo-cdk`](../cargo-cdk/SKILL.md) ([recap](#cargo-cdk))                                                   | **Declarative — spans every resource type.** Define a whole workspace in code (`define*` builders) and deploy it with `cargo-ai cdk` (init → types → plan → deploy). Use for workspace-as-code / reproducible / version-controlled setups; see "Declarative vs imperative" above. |
| [`cargo-mailbox-management`](../cargo-mailbox-management/SKILL.md) ([recap](#cargo-mailbox-management))        | Provision sending mailboxes Cargo owns, run warm-up and the 5→40/day send ramp, send with the `sendEmail` action, and read threads, replies, delivery events, and suppressions |
| [`cargo-workspace-management`](../cargo-workspace-management/SKILL.md) ([recap](#cargo-workspace-management)) | Invite users, create API tokens, organize folders, manage roles, report CLI issues to management   |
| [`cargo-mcp`](../cargo-mcp/SKILL.md) ([recap](#cargo-mcp))                                                   | Drive Cargo from the hosted MCP server at `https://mcp.getcargo.io/mcp` with no CLI install — connect a client, discover and price an action, execute one record or a batch, poll it, read models; and route between the MCP tools and the CLI |

> **Agent knowledge for RAG:** **files** + **libraries** live in the `content` domain → [`cargo-content`](../cargo-content/SKILL.md); how they attach to an agent → [`cargo-ai`](../cargo-ai/SKILL.md). (Files/libraries moved out of the old `ai file …` path in CLI ≥ 1.0.19.)

### These skills vs an MCP server

**Three distinct things wear the name MCP here.** They share no answers, so
establish which one is meant before replying:

| | What it is | Skill |
|---|---|---|
| **Hosted server** | Cargo's own endpoint at `https://mcp.getcargo.io/mcp`. Thirteen platform tools (discover, price, execute, poll, read models), plus whatever this workspace published. The way to drive Cargo with no CLI installed. | [`cargo-mcp`](../cargo-mcp/SKILL.md) |
| **Workspace server** | A curated set *this workspace* publishes (`ai mcp-server create --actions … --resources …`), served to any stdio client by `cargo-ai mcp`. | [`cargo-ai`](../cargo-ai/SKILL.md) |
| **Agent MCP client** | Somebody else's MCP server attached *to* a Cargo agent (`release update-draft --mcp-clients`). | [`cargo-ai`](../cargo-ai/SKILL.md) |

The first is new and is what "does Cargo have an MCP server?" now means. It
authenticates by OAuth discovered from its own `401` challenge, or by a
workspace-scoped bearer token:

```bash
claude mcp add --transport http cargo https://mcp.getcargo.io/mcp
```

The second is the curation path, and remains the right answer when a workspace
wants to expose one approved tool rather than the whole platform:

```bash
claude mcp add cargo -- cargo-ai mcp                    # the platform MCP
claude mcp add cargo -- cargo-ai mcp --server <uuid>    # a curated server instead
```

With no `--server`, the bridge uses `CARGO_MCP_SERVER_UUID` when set, otherwise the platform `/mcp`. (Older CLIs instead fell back to "the workspace's only MCP server" and failed outright when there wasn't exactly one.)

Route between the CLI and either MCP surface by shape of the request:

| | **These skills (CLI)** | **An MCP server** |
|---|---|---|
| What it is | The whole CLI surface, every domain | The platform runtime tools, plus whatever the workspace chose to expose |
| Best for | Anything that builds something reusable: workflows, plays, schema changes, CDK deploys, diagnostics, exports, warehouse SQL | In-conversation execution: look this record up, enrich this list, run this one approved tool |
| Cost control | Full pilot → approval → receipt discipline ([`../cargo-gtm/references/cost-discipline.md`](../cargo-gtm/references/cost-discipline.md)) | Per-call; `search_actions` returns each action's credit cost before you run it |
| Reproducible | Yes — commands, plays, and CDK files are artifacts | No — a tool call leaves no artifact behind |

Rule of thumb: **anything the user will want to re-run or version belongs in the CLI.** Never fan an MCP tool out record-by-record over a list — that is what `execute_action_batch` (and `orchestration action execute-batch` on the CLI) exists for, and it is cheaper and observable. Conversely, when the workspace has already curated a tool for a job, calling it beats hand-assembling the same thing from raw actions.

### CLI domains without a dedicated skill yet

The CLI exposes several domains that no capability skill wraps yet. Reach for them directly (`cargo-ai <domain> --help`) when a task needs them, and file a `workspaceManagement report` if the surface is unclear:

| CLI domain | Covers |
| --- | --- |
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

             ┌───────────────────────────────────────┐
             │        cargo-mailbox-management       │
             │  Sending inboxes Cargo owns: warm-up, │
             │  send ramp, threads, replies, events, │
             │  suppressions. The send itself is the │
             │  `sendEmail` orchestration action.    │
             └───────────────────────────────────────┘
   (owns the mailbox; orchestration owns the send — and every
    send is gated by cargo-gtm's acceptable-use checks)

             ┌───────────────────────────────────────┐
             │           cargo-observability         │
             │  Scheduled threshold alerts over the  │
             │  telemetry above (spans/runs/records), │
             │  a model's health, or a SQL query —    │
             │  fire actions as runs on breach.       │
             └───────────────────────────────────────┘
     (watches orchestration/storage; fires orchestration
      actions — proactive counterpart to cargo-diagnostics)
```

**Dependency rules in practice:**

- `cargo-gtm` delegates to capability skills via relative paths (`../cargo-orchestration/...`). Capability skills never reference `cargo-gtm`.
- `cargo-workspace-management` provides auth context for every skill — set it up first.
- `cargo-storage`, `cargo-connection`, and `cargo-ai` are peer skills that supply UUIDs to `cargo-orchestration`. They don't depend on each other.
- `cargo-content` owns workspace **files** and **libraries** (the `content` domain). It produces file/library UUIDs that `cargo-ai` consumes as agent release `resources` (RAG). Uploaded content files also surface read-only under `.files/` in the `cargo-context` runtime sandbox.
- `cargo-mailbox-management` owns **sending inboxes** (the `mailboxManagement` domain) — provisioning, warm-up, the send ramp, threads, events, and the workspace suppression list. It deliberately does **not** send: delivery is the `sendEmail` native action under `cargo-orchestration`, which is why a send inherits orchestration's pacing, retry and credit accounting. The mailbox itself is also declarable as code via CDK's `defineMailbox` (with `defineDomain` for the sending domain).
- `cargo-cdk` is **cross-cutting**: it's a declarative *authoring mode* that produces the very connectors/models/plays/agents/etc. the imperative capability skills manage one at a time. Route to it when the task is "manage the workspace as code" (reproducible, in git, multi-resource); route to the imperative domain skills for one-off ops, reads, and ad-hoc queries. See "Declarative vs imperative" under Skills at a glance.
- `cargo-context` is **orthogonal** to the workflow-execution flow. It touches the git-backed GTM knowledge base (markdown/MDX), not storage or workflow runs. Use it for capturing/editing the workspace's prose context — personas, plays, proof, objections, signals — and for inspecting the typed knowledge graph.
- For SQL queries against storage, use `cargo-ai storage query execute "<sql>"` (tables as `<datasetSlug>.<modelSlug>`). Load `cargo-storage` to discover dataset and model slugs, and to fetch the DDL when you need column types or the SQL dialect.
- For SQL queries against orchestration runtime tables (`runs`, `batches`, `spans`, `records`) — error rates, per-node failures, time-series — use `cargo-ai orchestration query execute "<sql>"`. Workspace scoping is automatic; tables are referenced without a schema prefix.
- Before building a workflow node graph, load `cargo-connection` to get `connectorUuid` and `actionSlug`. If any node calls a **credits-based provider action**, also load `cargo-gtm` and read that provider's playbook (`../cargo-gtm/provider-playbooks/<slug>.md`) — including its **Recurring use** section whenever the workflow is a scheduled tool or play, since a bad config or wrong cadence re-bills on every run. This applies even when the task arrived through `cargo-orchestration` or `cargo-cdk` directly, without a GTM framing.
- Before executing a workflow that uses an agent node, load `cargo-ai` to get `agentUuid`.
- After runs complete, load `cargo-analytics` to download results or measure performance. **For action output retrieval, prefer `cargo-ai orchestration run download-outputs` over `run download` — the former returns a signed-URL CSV/JSON of just the output node's data.**
- Load `cargo-billing` to understand credit consumption for any of the above.
- When a run failed, a run "succeeded but looks wrong", a batch has errors, or a play costs too much, load `cargo-diagnostics` — it sequences the `run get` / orchestration-SQL / billing surfaces into forensic runbooks (trace one run, sweep a batch, profile credit spend).
- To be told about a problem *before* you go looking — an error-rate spike, a cost ceiling, a slow node, a stalled sync, a workflow that stopped running — load `cargo-observability`. It creates **alerts**: scheduled threshold checks over the same telemetry (`spans`/`runs`/`records`), a model's health, or a SQL query, that fire actions on breach. Diagnostics is reactive (explain what happened); observability is proactive (watch for it). Alerts can also be declared as code via CDK's `defineAlert`.

---

## Per-skill critical rules

The non-obvious rules for each skill — the things that fail silently or cost money if you guess. Each skill's own SKILL.md carries the full surface; these are the ones worth knowing *before* you pick.

### cargo-gtm

**Recipes shipped:**

| Recipe | Use when… |
|---|---|
| `recipes/source-planning.md` | Decide the source before spending: probe candidates, cost per hit. |
| `recipes/prospecting.md` | End-to-end find → enrich → verify → sync (P1/P2/P3 variants). |
| `recipes/build-tam.md` | Build a Total Addressable Market list at scale (100–10,000 companies). |
| `recipes/linkedin-url-lookup.md` | Resolve LinkedIn URL from name + company with strict validation. |
| `recipes/portfolio-prospecting.md` | Investor / accelerator → portfolio companies → contacts. |
| `recipes/job-change-monitoring.md` | `waterfall.detectJobChange` (cargo-unique) on a contact segment. |
| `recipes/funding-watch.md` | Track companies that recently raised funding. |
| `recipes/tech-intent.md` | Find companies by tech-stack or hiring-intent signals. |
| `recipes/icp-discovery.md` | Diff Closed-Won vs Closed-Lost segments, surface ICP signals. |
| `recipes/custom-datapoints.md` | Design which custom attributes + live signals to collect, gated on a real source and cost. |
| `recipes/outreach-activation.md` | Turn a signal segment into send-ready outreach (enrich → verify → personalize → sequencer handoff). |
| `recipes/ads-audience-activation.md` | Push a segment to Google Ads Customer Match / LinkedIn Matched Audiences. |
| `recipes/review-and-iterate.md` | Human review loop for judgment output; corrections become permanent rules. |
| `recipes/re-engagement.md` | Wake up stale contacts only when a fresh signal fires (job change, funding, tech intent). |
| `recipes/lost-deal-revival.md` | Revive Closed-Lost CRM deals by branching on `lost_reason` (champion left, budget, timing). |
| `recipes/account-expansion.md` | Multi-thread customer accounts — net-new buyers, deduped against the Contacts model. |

**Priority provider stack** (recipes lead with these): salesNavigator (sourcing), cargo native (firmographics + signals), aiArk (LinkedIn-anchored enrich + cheapest search), waterfall (multi-source enrichment + email verify + job-change), FullEnrich (premium contact lookup), apolloio (1-credit niche-coverage enrich), theirStack (tech-stack + hiring intent), peopleDataLabs (heavyweight backfill). **Already have LinkedIn URLs (or an event URL)?** Don't source — go straight to `aiArk.enrichPerson` (0.1, profile **+ verified email**, bills 0 on no-email), or `linkedin` (`enrichProfile`/`enrichCompany` 0.25, `extractEventAttendees`) when you don't need the email; these are the cheapest URL-anchored enriches and easy to miss because the stack above is sourcing-first.

**Critical rules:**
- **Acceptable use gates every step that touches a person** (`../cargo-gtm/references/acceptable-use.md`): B2B professional identities from licensed providers only, three free blocking checks before any outreach step (*basis*, *suppression*, *relevance*), and a refusal list — undifferentiated fan-out, consumer targeting, lists with no stated origin, contacting a suppressed record, filter or identity evasion, auto-dialing, batch-blasting LinkedIn engagement actions. The pack never sends: outreach stops at send-ready variables for the user's own sequencer.
- All recipes use credits-based actions (`cargo-ai connection integration list` → 145 credits-based actions across 120 integrations).
- Action shape: `{"kind":"connector","integrationSlug":"<slug>","actionSlug":"<slug>"}` — no `config` on a top-level action, and **`connectorUuid` is never nested inside one**; it sits at the top level of a node.
- Output retrieval: `cargo-ai orchestration run download-outputs --output-node-slug <slug>` (NOT `run download`).
- peopleDataLabs filter shape: `searchX` uses cargo's `{conjonction, groups, conditions}` shape; `queryX` takes a PDL **SQL string** — never Elasticsearch.

### cargo-orchestration

**Critical rules:**

- See the decision flowchart at the top of `../cargo-orchestration/SKILL.md` for when to use `action execute` vs `run create` vs `batch create`.
- **Never enroll a full batch on the first attempt.** `batch create` / `action execute-batch` fan out across every record in the source. Sample **10–20 records**, report observed cost + hit-rate, then ask the user to approve the full enrollment — quoting the **record count** and the **credit estimate**. Mechanics: `../cargo-orchestration/SKILL.md` → "Create a batch"; spend rules: `../cargo-gtm/references/cost-discipline.md` §1.
- **Search for the action; never browse the catalog for it.** `cargo-ai orchestration action list <keywords> [--kind connector|native|tool|agent] [--integration-slug <slug>] [--limit 20]` covers the integration catalog, Cargo native actions, workspace tools, and agents in one free call, and returns a ready-to-paste `action` object (`connectorUuid` resolved) plus the action's **credit costs**. Its sibling `cargo-ai connection action search <keywords>` is connector-only but adds `--credits-only` and `--category`, the two filters `action list` lacks. Both beat paging `connection integration list`; reach for `integration get <slug>` only once you have picked the action and need its full input schema.
- **Omit `config` on `action execute` / `action execute-batch`** — inputs go in `--data` / `--records`. That is the shape `action list` returns, so its result pastes straight in. **`action get-output-schema` is the exception and still requires it** (`400` at `action.config` without `"config": {}`), as do workflow **nodes**, alert `--actions`, play `healthAlertActions`, and agent / MCP-server `--actions`. Inputs misplaced in `config` are now dropped rather than rejected — the action runs with no input and the error never mentions `config`.
- **`action execute` is the default for running an operation; `node execute` is debug-only.** Use `node execute` only to test a single node of a workflow you're authoring — it requires `--workflow-uuid`, `--release-uuid`, `--node`, `--computed-config` and `--context` (all five). Anything else — enrich a record, call a connector action, invoke a tool or agent — goes through `action execute` / `action execute-batch`.
- **Prefer built-in actions + expressions when building a node graph.** Avoid `python`, `script` (JS), and raw HTTP nodes unless necessary: use `variables` for transforms, the native `agent` node for LLM calls, the integration's dedicated connector action for APIs, and `branch`/`filter`/`switch` for routing. See `../cargo-orchestration/references/node-selection.md`.
- **Show a node graph, don't describe it.** Before deploying a draft, and whenever the user asks what a workflow or play does: `cargo-ai orchestration node diagram --workflow-uuid <uuid> --raw` (free, runs nothing, CLI ≥ 1.0.54; `references/node-diagram.md`). Routing, fallback edges, and which nodes bill are what's being approved. Let the command draw it rather than transcribing — node **slugs repeat within a release**, so a hand-drawn diagram keyed on slug merges nodes that aren't the same.
- Filter JSON uses `conjonction` (not `conjunction`) — breaks silently if misspelled.
- Query orchestration runtime tables (ClickHouse) with `cargo-ai orchestration query execute "<sql>"` against `runs`, `batches`, `spans`, `records` (no schema prefix; workspace scoping is automatic).
- For SQL against workspace storage (Companies, Contacts, …), use `cargo-ai storage query execute "<sql>"` — documented in `cargo-storage`.
- All operations are async — poll or pass `--wait-until-finished`. See [Async polling](#async-polling).

### cargo-analytics

**Critical rules:**

- `segment download` requires `--model-uuid`, not `--segment-uuid`.
- For batch result download, get the `output-node-slug` from `release get <release-uuid>` → `nodes[].slug`.
- For billing and credit usage, use `cargo-billing` instead.
- Analytics answers "what happened" (metrics, counts, exports). When the question is **why** — a failing run, a batch full of errors, surprising cost — hand off to `cargo-diagnostics`; its sweep runbook picks up exactly where analytics' error counts leave off.

### cargo-billing

**Critical rules:**

- Requires a token with **admin access**.
- Invoice amounts are in cents — divide by 100 for dollars.
- `subscriptionAvailableCreditsCount - subscriptionCreditsUsedCount` from `subscription get` = remaining credits.

### cargo-diagnostics

**Critical rules:**

- Start with the **sweep** when you don't know which run to look at; it ends with exemplar UUIDs for the **trace**.
- `runContext` is the source of truth for what a node produced; an execution's `title` is a truncated summary — never evidence.
- Credit attribution (`billing …`) needs an **admin** token; the SQL and `run get` steps don't.
- Any fix that re-runs paid nodes goes through the pilot gate in `../cargo-gtm/references/cost-discipline.md`.
- Diagnostics explains; it doesn't export. For bulk retrieval after the diagnosis (`run download-outputs`, `batch download`, `segment download`) go back to `cargo-analytics`.
- Present conclusions first, evidence as compact tables — per `references/interaction.md` (in the `cargo` router skill).

### cargo-observability

**Critical rules:**

- **`preview` before `create`.** `alert preview --scope … --threshold … [--window-minutes 60]` evaluates now without firing — the only way to size a threshold against reality and to catch an invalid scope/threshold pairing (`outcome: "notComputed"`) before it becomes a schedule that errors every tick.
- **Scope and threshold are a matched pair.** Telemetry metrics (`errorRate`, `duration`+aggregation, `credits`+aggregation, `count`) need `spans`/`runs`/`records`; `query` needs a query scope; `recordsCount`/`recordsShare`/`freshness`/`syncDuration` need `model`. Full matrix + units in `references/scopes-and-thresholds.md`.
- **Empty window vs real zero.** Most metrics report an idle window as `empty` (healthy, no fire). Only `count` and `recordsCount` return a real `0` — pair with `lte 0` for a **dead-man's switch** (alert when a workflow *stops*, a model *empties*).
- **Firing is at-most-once and costs credits.** Actions fire as runs (`runUuids` on the event); a sustained breach re-fires once per tick it's still true, never on the same rows twice. If an action calls a paid provider, apply `../cargo-gtm/references/cost-discipline.md` — a scheduled alert re-bills on every breach.
- **`--enabled` is strict** (`true`/`false` only); model-scope `filter` uses the segmentation shape spelled **`conjonction`**.
- Permissions are `observability:read` / `observability:write` (not admin-only). The declarative equivalent is CDK's `defineAlert` — see `cargo-cdk`.

### cargo-storage

**Critical rules:**

- Query via `cargo-ai storage query execute "<sql>"` (or `storage query download --query "<sql>"` for full exports) using `<datasetSlug>.<modelSlug>` table names (e.g. `default.companies`). `model get-ddl` is optional — useful for column types and SQL dialect.
- For SQL against orchestration runtime tables (`runs`/`batches`/`spans`/`records`), use `cargo-ai orchestration query execute "<sql>"` — documented in `cargo-orchestration`.
- For advanced record queries (filtering, sorting, pagination), use `segmentation segment fetch` — documented in `cargo-segmentation`.
- `storage relationship set` **replaces** the dataset's whole relationship set — anything absent from the payload is deleted. `list` first, send the full array back.

### cargo-segmentation

**Critical rules:**

- Filter JSON uses `conjonction` (not `conjunction`). A misspelling is **not** an error — the filter silently matches nothing.
- **Size before you spend.** `segment fetch --limit 1` counts an inline filter for free; a saved segment's `recordsCount` is the authoritative size. Quote it before proposing any paid run over the audience.
- `segment download` takes `--model-uuid` **plus the filter**, never `--segment-uuid`.
- `change list` needs `--segment-uuid`; `change fetch` needs the **change** UUID plus `--kinds` (`added`/`updated`/`removed`/`unchanged`).
- `updatedRecordsCount` stays `0` unless the segment was created with `--tracking-column-slugs` — those columns define what "updated" means.
- Segments named `GENERATED_PLAY_SEGMENT` (`fromPlay: true`) are owned by a play. Never edit or remove them by hand.

### cargo-connection

**Key concepts:**

- **Integration** = external service type (HubSpot, Clearbit, Salesforce, …)
- **Connector** = authenticated instance of an integration (referenced by `connectorUuid` in nodes)

### cargo-ai

**Critical rules:**

- Knowledge for RAG attaches to an agent via the release's `resources`: **files** + **libraries** come from [`cargo-content`](#cargo-content). Wire them in with `release update-draft --resources …` then `release deploy-draft`.
- **`cargo-ai mcp` with no `--server` now bridges the first-party platform MCP** (`mcp.getcargo.io/mcp`), not "the workspace's only MCP server". `ai mcp-server` still builds a curated server; pass its uuid with `--server`. See "These skills vs Cargo's MCP surfaces" above.
- **CLI ≥ 1.0.19:** files and libraries moved out of the `ai` domain into the top-level **`content`** domain (now the `cargo-content` skill). The old `cargo-ai ai file …` commands no longer exist.

> For _using_ agents (sending messages, multi-turn chat, polling), use `cargo-orchestration`.

See `../cargo-ai/SKILL.md` for model and temperature guidance by use case.

### cargo-content

**Critical rules:**

- New top-level **`content`** domain in CLI ≥ 1.0.19 — `cargo-ai content file …` / `cargo-ai content library …`. The old `cargo-ai ai file …` path is gone (`unknown command` → you're on the old path; bump the CLI).
- A file or library is inert until attached to an agent's deployed release `resources` — that wiring lives in [`cargo-ai`](#cargo-ai).
- Uploaded content files are also readable (read-only) under `.files/` in the `cargo-context` runtime sandbox.
- For batch-run **input** files (CSVs that drive a batch), use `cargo-ai workspaceManagement file upload` (a different surface) — see `cargo-workspace-management`.

### cargo-context

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

### cargo-hosting

**Lifecycle:** `init` (local scaffold) → `create` (slot + globally-unique slug) → `deployment create` (build+upload) → `deployment promote` (go live).

**Critical rules:**

- `--slug` is the live subdomain — **globally unique within the hosting domain**.
- **Deploying ≠ going live.** `deployment create` builds; the URL only moves on `deployment promote`. `deployment get-promoted` shows what's live.
- `--source` is the **package root**, not `dist/` — the build (`npm ci && vite build` for apps, bundling for workers) runs server-side.
- Builds are async — poll `deployment get` until terminal before promoting.
- `--app-uuid` / `--worker-uuid` are mutually exclusive on deployment commands; `remove` cascades to deployments.
- Folders come from [`cargo-workspace-management`](#cargo-workspace-management); `--folder-uuid null` moves to root.

### cargo-cdk

entire Cargo workspace in TypeScript (`defineConnector`/`defineModel`/`defineAgent`/
`definePlay`/`defineTool`/`defineMcpServer`/`defineContext`/`defineSegment`/
`defineFolder`/`defineFile`/`defineWorker`/`defineApp`/`defineAlert`/`defineDomain`/
`defineMailbox`) and reconcile
it to live infra with `cargo-ai cdk`. Spans **every** resource type, so it overlaps
every imperative capability skill — route with "Declarative vs imperative" above.

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
- **`definePlay`/`defineTool` graphs with credits-based connector actions:** read
  the provider's playbook in `../cargo-gtm/provider-playbooks/` (esp. its
  **Recurring use** section) before `cdk deploy` — a deployed play re-bills its
  nodes on every scheduled run.

**Recipes shipped:** `recipes/scaffold-a-workspace.md`, `add-connector-and-model.md`,
`build-an-agent.md`, `migrate-existing-workspace.md`, `deploy-from-ci.md`.

**Cookbooks:** ~20 pre-written GTM outcomes (TAM building,
inbound flow, contact sourcing, account scoring, AI SDR, …) live in
[`getcargohq/gtm-skills`](https://github.com/getcargohq/gtm-skills) beside its one-off
skills. The menu is local:
[`../cargo-cdk/references/cookbooks.md`](../cargo-cdk/references/cookbooks.md).
Check it before authoring a common GTM outcome from scratch.

**The routing question is one-off versus standing.** "Build our TAM" is `cargo-gtm`
when the user wants a list today, and `tam-building` when they want a pipeline that
keeps producing it. The words are the same; listen for whether the result is meant to
keep arriving. Each cookbook is a self-contained worked example the installing agent
copies into the project and adapts, not a template to fill in:
`npx skills add getcargohq/gtm-skills/<name>`. See the section in
`../cargo-cdk/SKILL.md` for the caveats and the `--force` warning.

### cargo-mailbox-management

**Critical rules:**

- **A mailbox is a *monthly, recurring* credit charge**, not a per-record one — 100–160 credits per mailbox per month (`mailboxManagement pricing get` for live figures), for as long as it exists. `mailbox remove` is the only way to stop it; there is no pause. Quote the fleet size and the **credit estimate** per month, and get an explicit yes, before the first `create`.
- **This domain does not send.** Delivery is the native action `sendEmail` (`{"kind":"native","actionSlug":"sendEmail"}`, inputs in `--data`), **0.1 credits per send**, run through `cargo-orchestration`. A play that calls it **re-bills** — and re-contacts — on every run.
- **Volume is a ramp, not a setting.** Real sends go 5/day → 40/day linearly over 45 days from `warmupStartedAt`. A mailbox that never ran `start-warmup` is pinned at 5/day forever, `stop-warmup` resets the anchor to day 0, and `dailySendLimit` can only *tighten* the ramp, never loosen it.
- **Every send is gated by `../cargo-gtm/references/acceptable-use.md` §3** (basis, suppression, relevance). Suppression is workspace-wide, checked before every send, has no removal command, and `List-Unsubscribe` writes to it automatically. Raising the ramp — or spreading one campaign across extra mailboxes to clear the same volume — is the §2 evasion refusal.
- **Nothing here is async** — no run to poll. The exception that looks like one: `mailbox create` returns `status: "pending"`, cleared by `mailbox refresh-status`, not by `run get`.
- `--type outlook` is accepted by the flag and **always** fails (`transportNotSupported` — Graph delivery hasn't shipped). `--statuses`/`--kinds`/`--reasons` are comma-separated **with no spaces**. `mailbox list` is the only list with **no `count`**, and `mailbox`/`suppression` lists have **no default limit** (max 1000) where message/thread/event default to 50.
- **`bounced` has no producer yet** — nothing parses delivery-status notifications, so bounces write no events and do not auto-suppress. Never report an empty bounce count as a clean list.
- **There is no CLI surface for sending domains.** `mailbox create --domain-uuid` is required and `domainManagement` has no `cargo-ai` commands — take the UUID from the web app or CDK's `defineDomain`. Permissions are `mailboxManagement:read` / `:write` (not admin-only).

### cargo-workspace-management

**Critical rules:**

- Most commands require a token with **admin access**.
- `workspaceManagement token create` requires `--name` (the legacy `--from-user` flag was removed). Pick a name that makes the token's purpose obvious in `token list` later.
- Token values are only shown **once** at creation — store immediately in a secrets manager (GitHub Secrets, AWS Secrets Manager, etc.).
- **Always send a `workspaceManagement report create`** when the CLI errors, is being used incorrectly, or you (user or agent) are struggling to make progress on a CLI task — see the section at the top of this file and `../cargo-workspace-management/references/examples/reports.md`.

### cargo-mcp

**Critical rules:**

- **`whoami` first, every session.** The token binds the session to exactly one workspace with no override. A wrong-workspace session returns real records belonging to someone else, which reads as success.
- **Never loop `execute_action` over a list** — `execute_action_batch` is cheaper, observable, and returns one object plus an output CSV.
- `search_actions` returns each action's `credits[].cost`, so quote the price before running it, and sample 10–20 records before a full fan-out.
- `query_models` is not SQL: it lists records with a limit and offset, and will not aggregate or join. Route those to `cargo-storage`.
- The tool list varies by workspace — the endpoint serves the platform tools plus whatever that workspace published with `defineMcpServer`.

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
