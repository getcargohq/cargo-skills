---
name: cargo
description: "Router for the Cargo CLI skill bundle — load first for anything Cargo, and whenever a task spans two Cargo domains. Explains what each skill owns, declarative GTM as Code projects (cargo-project) vs the imperative CLI, the UUID and slug flow between skills, async polling of runs and batches, end-to-end use cases, and the gotchas that fail silently (inputs in a top-level action's `config` stripped without an error, run vs batch, model-uuid vs segment-uuid). Triggers: \"set up Cargo\", \"what can Cargo do\", \"which Cargo skill\", \"bootstrap my workspace\", \"I have a Cargo account\", \"cargo-ai …\", or any `cargo-ai` command whose domain you are unsure of. Skip when: the task obviously belongs to one skill — load that skill directly."
version: "1.32.8"
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
- **Capability skills** — standard library. One per CLI domain (orchestration, storage, segmentation, connection, AI, content, context, analytics, billing, observability, hosting, project, mailbox management, workspace management), plus `cargo-diagnostics` (cross-domain forensics over runs, batches, and credit spend) and `cargo-mcp` (the hosted MCP server, the one surface that is not the CLI). Loaded by `cargo-gtm`, or directly when you need a specific CLI domain.
- **`cargo-project`** — the declarative one. Where the other capability skills wrap **imperative** one-off `cargo-ai <domain>` calls, `cargo-project` declares the whole workspace in a project — the folder holding `cargo.json` (`define*` builders + `cargo-ai project deploy`) — and reconciles it. It spans every resource type — see "Declarative vs imperative" below to route between it and the imperative skills.

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
cargo-ai login --agentid                          # an agent signing in as itself, through AgentID
cargo-ai login --token <your-api-token>           # existing workspace-scoped API token (CI)

# Optional: pick the workspace at login instead of being prompted
cargo-ai login --email you@company.com --workspace-name "Acme GTM"

# Verify
cargo-ai whoami
```

**Look before signing up.** With no account at all, `cargo-ai orchestration action list <keywords>`, `connection integration list|get` and `orchestration action execute … --dry-run` (connector and native actions: validates `--data`, prints sample output in the finished-run shape with the credit price, calls nothing) work against the public catalog; `project plan` and `project types` do too.

**A new account starts with 100 free credits and needs no card**, so an agent can sign a user up and produce a real deliverable in the same turn — there is no purchase gate between install and first value. Useful anchors for what that buys: ~500 leads sourced (`salesNavigator.searchLeads`, 0.2/record), ~1,000 profile+verified-email enriches (`aiArk.enrichPerson`, 0.1), ~1,000 email verifications (`waterfall.verifyEmail`, 0.1), or ~50 fully enriched contacts (`waterfall.enrichContact`, 2). The [quickstart demo](../cargo-quickstart/SKILL.md) spends about **5**. Say the free balance out loud before the first paid call on a new account.

`--email` is the one to reach for in an **agent or sandbox shell**: it never opens a browser, and where there is no terminal to prompt at, the first call sends the code and exits so you re-run with `--code`. To keep the code out of shell history, pass it on stdin: `echo 123456 | cargo-ai login --email you@company.com --code -`. Signing in with an address that already has an account resolves to its existing workspace rather than creating one, so this is safe to re-run.

**The first sign-in creates a workspace named `Personal`** (seeded in the background with starter connectors, datasets, tools and agents — a brand-new workspace can look emptier than it is for a minute). `--workspace-name <name>` reuses a workspace of that name (case-insensitive) if one exists; otherwise it **renames** that `Personal` workspace when it is the account's only one, at most 10 minutes old, and you are its only member; only failing both does it create a new one. So `login --email … --workspace-name "Acme GTM"` on a fresh account yields one workspace, not two.

`--oauth` runs the same OAuth 2.0 Device Authorization Flow it always did, and still needs a human at the verification URL. `--agentid` signs an **agent** in as its own identity: it prints an Auth0 URL for the AgentID connection and waits on `http://127.0.0.1:52701/callback` (5-minute timeout); open the URL once (a second visit starts a different sign-in) and approve the token as AgentID instructs (`cargo-ai login --help` names the command). `--email`, `--oauth` and `--agentid` all save a self-renewing session to `~/.config/cargo-ai/credentials.json` (the system temp dir where home isn't writable — it lasts as long as the sandbox). Use `--token` for CI, with a workspace-scoped token from **Settings > API**; store the token value in a secrets manager (`token list` also returns your own tokens' values, so treat its output as a secret).

Without a global install, prefix every command with `npx @cargo-ai/cli` instead of `cargo-ai`.

These skills also install as a native **agent plugin** for Claude Code, Codex, and Cursor (one repo, three targets) — plugin users get the same skills plus the approval hook and session-lifecycle hooks bundled, with no separate installer. See the repo `README.md` for per-target install steps, and use **one** channel: plugin *or* `skills add`, never both (duplicates every skill).

All commands output JSON to stdout. Failed commands exit non-zero and print `{"error": "...", "status": ..., "body": {...}}` to stderr (the API's own `errorMessage` sits inside `body`). For the full setup conventions that every capability skill links to (token scopes, async polling, admin-only commands), see [`references/prerequisites.md`](references/prerequisites.md).

## Every Cargo session has three jobs

> **Automated on Claude Code.** Jobs 1 and 3 (refresh + session register/finalize) run on their own when either the **Cargo plugin** is installed (its bundled `SessionStart`/`Stop`/`SessionEnd` hooks handle them) or legacy `SessionStart`/`Stop`/`SessionEnd` hooks left under `~/.claude/hooks/` by the retired bootstrap installer are present (the plugin's hooks defer to those when they exist). The `Stop` hook also checkpoints the session row each turn, so a session that never reaches `SessionEnd` still shows recent context instead of a bare placeholder. Do these by hand only when neither is installed (or on agents without lifecycle hooks). Job 2 (reporting) is always your responsibility — it can't be automated, and neither can the two **asks** at the end of Job 3 (share the session, star the repo): a hook can print, but it can't take a Y/N.
>
> **Installing Cargo is the user's call, not an action you take.** The `curl … install.sh | sh`
> bootstrap is **retired** — it installs nothing now, prints a notice and exits non-zero, so never
> reach for it or repeat it as advice. Point the user at the plugin install in the repo
> [`README.md`](../README.md). An agent asked to do the setup itself follows
> `https://api.getcargo.io/INSTALL.md`, which installs the CLI, signs the user in, and installs the
> skills for whichever agent it is — read it before running it, and still confirm before installing
> a global npm package on someone's machine.

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

### Declarative (project) vs imperative (CLI) — pick the mode first

Two ways to create/manage the same Cargo resources. Decide which the task wants
before picking a domain:

- **Declarative → [`cargo-project`](../cargo-project/SKILL.md).** The user is managing
  resources **as an artifact**: "set up / bootstrap a whole workspace in a project",
  "make this reproducible / version-controlled / in git", "deploy these
  connectors + models + agents together", or anything that should be re-runnable
  and diffable across environments. Define it in `define*` files and
  `cargo-ai project deploy`.
- **Imperative → the matching capability skill below.** The user is doing a
  **one-off operation** or **exploring**: "create one connector", "add a column",
  "list connectors", "run this workflow", "query storage", "read a memory". A read,
  ad-hoc query, or single mutation that needn't live in code.

When unsure: should the result be committed and re-deployable? Yes → a project. A quick
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
| [`cargo-content`](../cargo-content/SKILL.md) ([recap](#cargo-content))                                      | Upload and organize knowledge files, build native/connector-backed knowledge libraries for RAG, and store/serve any file by path with a signed or public link (the `content` domain) |
| [`cargo-context`](../cargo-context/SKILL.md) ([recap](#cargo-context))                                      | Browse/read/write/edit the workspace's git-backed GTM context repo, run commands in its runtime sandbox, inspect the knowledge graph |
| [`cargo-hosting`](../cargo-hosting/SKILL.md) ([recap](#cargo-hosting))                                      | Scaffold, deploy, and promote hosted apps (Vite SPAs) and edge workers (serverless HTTP handlers), manage their deployments, and give workers env vars and secrets |
| [`cargo-project`](../cargo-project/SKILL.md) ([recap](#cargo-project))                                                   | **Declarative — spans every resource type.** Declare a whole workspace in a project (`define*` builders) and deploy it with `cargo-ai project` (init → types → plan → deploy). Use for GTM as Code / reproducible / version-controlled setups; see "Declarative vs imperative" above. |
| [`cargo-mailbox-management`](../cargo-mailbox-management/SKILL.md) ([recap](#cargo-mailbox-management))        | Provision sending mailboxes Cargo owns, run warm-up and the 5→40/day send ramp, send with the `sendEmail` action, and read threads, replies, delivery events, and suppressions |
| [`cargo-workspace-management`](../cargo-workspace-management/SKILL.md) ([recap](#cargo-workspace-management)) | Invite users, create API tokens, organize folders, manage roles, report CLI issues to management   |
| [`cargo-mcp`](../cargo-mcp/SKILL.md) ([recap](#cargo-mcp))                                                   | Drive Cargo from the hosted MCP server at `https://mcp.getcargo.io/mcp` with no CLI install — connect a client, discover and price an action, execute one record or a batch, poll it, read models; and route between the MCP tools and the CLI |

> **Agent knowledge for RAG:** **files** + **libraries** live in the `content` domain → [`cargo-content`](../cargo-content/SKILL.md); how they attach to an agent → [`cargo-ai`](../cargo-ai/SKILL.md). (Files/libraries moved out of the old `ai file …` path in CLI ≥ 1.0.19.)

### These skills vs an MCP server

**Three distinct things wear the name MCP here.** They share no answers, so
establish which one is meant before replying:

| | What it is | Skill |
|---|---|---|
| **Hosted server** | Cargo's own endpoint at `https://mcp.getcargo.io/mcp`. Seventeen fixed platform tools (discover, price, execute, poll, read models, read context, usage). A workspace's curated servers are served separately, at `/v1/ai/mcpServers/<uuid>/mcp`. The way to drive Cargo with no CLI installed. | [`cargo-mcp`](../cargo-mcp/SKILL.md) |
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
| Best for | Anything that builds something reusable: workflows, plays, schema changes, project deploys, diagnostics, exports, warehouse SQL | In-conversation execution: look this record up, enrich this list, run this one approved tool |
| Cost control | Full pilot → approval → receipt discipline ([`../cargo-gtm/references/cost-discipline.md`](../cargo-gtm/references/cost-discipline.md)) | Per-call; `search_actions` returns each action's credit cost before you run it |
| Reproducible | Yes — commands, plays, and project files are artifacts | No — a tool call leaves no artifact behind |

Rule of thumb: **anything the user will want to re-run or version belongs in the CLI.** Never fan an MCP tool out record-by-record over a list — that is what `execute_action_batch` (and `orchestration action execute-batch` on the CLI) exists for, and it is cheaper and observable. Conversely, when the workspace has already curated a tool for a job, calling it beats hand-assembling the same thing from raw actions.

### CLI domains without a dedicated skill yet

The CLI exposes several domains that no capability skill wraps yet. Reach for them directly (`cargo-ai <domain> --help`) when a task needs them, and file a `workspaceManagement report` if the surface is unclear:

| CLI domain | Covers |
| --- | --- |
| `expression` | The template / JS expressions node configs are written in. `eval evaluate --expression '<json>' --variables '<json>'` resolves one against sample variables (the quickest check on a `{{…}}` before a run), and `eval generate --prompt "…" --variables '<json>'` drafts one from plain English. **Recipes** are saved, reusable expressions: `recipe list`, `recipe get <uuidOrShortId> [version]`, `recipe create --name … --kind jsExpression\|templateExpression --expression … [--instruct-to ai\|none] [--placeholders '<json>']`, `recipe create-new-version`, `recipe archive <uuid>`; `favorite-recipe create\|delete` pins one for the workspace. |
| `system-of-record` | The warehouse the workspace's storage lives in (`bigQuery` or `snowflake`). `sor list\|get\|create --kind … --config '<json>'\|update\|remove`; **`sor migrate <uuid>`** applies Cargo's pending schema migrations to that warehouse, in order, stopping at the first that fails; **`sor cutover <uuid>`** moves the workspace onto that system of record, copying its tables across in the background (one cutover per workspace at a time). Both are admin operations on live storage — confirm before running either. `client query "<sql>"`, `client fetch`, `client download` and `client get-documentation <slug>` talk to the warehouse directly; `log list` / `log get-metrics` read its sync logs. For everyday SQL over models, `storage query execute` (cargo-storage) is the right door. |
| `revenue-organization` | Territory and capacity planning for a sales team: `member list\|get\|update\|archive\|unarchive` and `member sync --connector-uuid <crm-connector>` (pull reps from the CRM), `territory list\|get\|create\|update\|remove`, `capacity list\|get\|create\|update\|remove`, and `allocation list\|get\|remove` — the assignments the native **`allocate`** action (`{"kind":"native","actionSlug":"allocate"}`, "choose members of your team") writes when a workflow routes a record to a rep. |
| `user-management` | Current-user operations with no workspace context. |

### Top-level commands outside every domain

Five commands sit at the root of the CLI rather than under a domain, and no skill wraps them.
They are listed here so you recognize them when a user names one — not as a routing target:

| Command | What it is |
| --- | --- |
| `cargo-ai doctor` | Diagnoses the setup in one JSON object: installed version vs latest, the **skills-bundle pin**, credentials, and API reachability. Exits with the most severe failure. The fastest answer to "why is this command not working" before you start reading skills. |
| `cargo-ai start` (alias `onboard`) | Signs the user in if needed, then continues into one of: a coding agent (`--continue claude\|cursor\|codex\|gemini`), `code` to scaffold a project, `cli` for the palette, or `demo` for the guided tour. Takes `--email`/`--code`/`--oauth`, `--workspace-name`, `--directory`, `--icp`. |
| `cargo-ai ask` | Chat in the terminal. Defaults to **Claude Code on this machine** against the working directory (`--dir`); `--agent-uuid` attaches a workspace agent to that same local session. `--print` gives one turn as JSON on stdout, `--continue` reopens the last chat. Also reachable as `cargo-ai --chat`. |
| `cargo-ai book-demo` | Opens the calendar to book a demo with Cargo sales. `--no-open` prints the URL instead. |
| `cargo-ai` (bare) | The interactive palette, when the terminal can render it. Bare `cargo-ai project` prints the group help; it does not run `info` or `init`. |

Two of these overlap work the skills describe by hand: `doctor` is a better first step than
hand-checking the pin, and `start --continue demo` is the CLI's own version of the
[`cargo-quickstart`](../cargo-quickstart/SKILL.md) tour. Prefer the skill when you want control
over what gets spent; prefer the command when the user just wants it done.

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
             │               cargo-project               │
             │  Declarative authoring layer: define  │
             │  connectors/models/plays/agents/… as  │
             │  code, deploy with `cargo-ai project`.    │
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
- `cargo-content` owns workspace **files** and **libraries** (the `content` domain). It produces file/library UUIDs that `cargo-ai` consumes as agent release `resources` (RAG), and it is also the **file store**: write and read by path, list a folder, hand out a signed or public link — from the CLI, a worker (`createCargoObjects`), a play (`writeFile`/`readFile`/`getFileUrl` nodes) or an agent (a writable folder). Files with `mirrorToContext: true` (the default for uploads and `defineFile`, not for path writes) are also committed to the context repo under `.files/`, read-only from the `cargo-context` runtime.
- `cargo-mailbox-management` owns **sending inboxes** (the `mailboxManagement` domain) — provisioning, warm-up, the send ramp, threads, events, and the workspace suppression list. It deliberately does **not** send: delivery is the `sendEmail` native action under `cargo-orchestration`, which is why a send inherits orchestration's pacing, retry and credit accounting. The mailbox itself is also declarable in a project via `defineMailbox` (with `defineDomain` for the sending domain).
- `cargo-project` is **cross-cutting**: it's a declarative *authoring mode* that produces the very connectors/models/plays/agents/etc. the imperative capability skills manage one at a time. Route to it when the task is "manage the workspace from a project" (GTM as Code: reproducible, in git, multi-resource); route to the imperative domain skills for one-off ops, reads, and ad-hoc queries. See "Declarative vs imperative" under Skills at a glance.
- `cargo-context` is **orthogonal** to the workflow-execution flow. It touches the git-backed GTM knowledge base (markdown/MDX), not storage or workflow runs. Use it for capturing/editing the workspace's prose context — personas, plays, proof, objections, signals — and for inspecting the typed knowledge graph.
- For SQL queries against storage, use `cargo-ai storage query execute "<sql>"` (tables as `<datasetSlug>.<modelSlug>`). Load `cargo-storage` to discover dataset and model slugs, and to fetch the DDL when you need column types or the SQL dialect.
- For SQL queries against orchestration runtime tables (`runs`, `batches`, `spans`, `records`) — error rates, per-node failures, time-series — use `cargo-ai orchestration query execute "<sql>"`. Workspace scoping is automatic; tables are referenced without a schema prefix.
- Before building a workflow node graph, load `cargo-connection` to get `connectorUuid` and `actionSlug`. If any node calls a **credits-based provider action**, also load `cargo-gtm` and read that provider's playbook (`../cargo-gtm/provider-playbooks/<slug>.md`) — including its **Recurring use** section whenever the workflow is a scheduled tool or play, since a bad config or wrong cadence re-bills on every run. This applies even when the task arrived through `cargo-orchestration` or `cargo-project` directly, without a GTM framing.
- Before executing a workflow that uses an agent node, load `cargo-ai` to get `agentUuid`.
- After runs complete, load `cargo-analytics` to download results or measure performance. **For action output retrieval, prefer `cargo-ai orchestration run download-outputs` over `run download` — the former returns a signed-URL CSV/JSON of just the output node's data.**
- Load `cargo-billing` to understand credit consumption for any of the above.
- When a run failed, a run "succeeded but looks wrong", a batch has errors, or a play costs too much, load `cargo-diagnostics` — it sequences the `run get` / orchestration-SQL / billing surfaces into forensic runbooks (trace one run, sweep a batch, profile credit spend).
- To be told about a problem *before* you go looking — an error-rate spike, a cost ceiling, a slow node, a stalled sync, a workflow that stopped running — load `cargo-observability`. It creates **alerts**: scheduled threshold checks over the same telemetry (`spans`/`runs`/`records`), a model's health, or a SQL query, that fire actions on breach. Diagnostics is reactive (explain what happened); observability is proactive (watch for it). Alerts can also be declared in a project via `defineAlert`.

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

**Priority provider stack** (recipes lead with these): salesNavigator (sourcing), aiArk (LinkedIn-anchored enrich + the catalog's cheapest company enrich and search), waterfall (multi-source enrichment + email verify + job-change), FullEnrich (premium contact lookup), apolloio (1-credit niche-coverage enrich), theirStack (tech-stack + hiring intent), peopleDataLabs (heavyweight backfill). **Already have LinkedIn URLs (or an event URL)?** Don't source — go straight to `aiArk.enrichPerson` (0.1, profile **+ verified email**, bills 0 on no-email), or `linkedin` (`enrichProfile`/`enrichCompany` 0.25, `extractEventAttendees`) when you don't need the email; these are the cheapest URL-anchored enriches and easy to miss because the stack above is sourcing-first.

**Critical rules:**
- **Acceptable use gates every step that touches a person** (`../cargo-gtm/references/acceptable-use.md`): B2B professional identities from licensed providers only, three free blocking checks before any outreach step (*basis*, *suppression*, *relevance*), and a refusal list — undifferentiated fan-out, consumer targeting, lists with no stated origin, contacting a suppressed record, filter or identity evasion, auto-dialing, batch-blasting LinkedIn engagement actions, batch or automated posting / replying / liking / DMing from the user's X account (`xAccount`). The pack never sends: outreach stops at send-ready variables for the user's own sequencer.
- All recipes use credits-based actions — **190** of the 594 the catalog exposes, priced in [`../cargo-gtm/references/credits-cost-table.md`](../cargo-gtm/references/credits-cost-table.md) and regenerated from `cargo-ai orchestration action list --kind connector` / `--kind native` (free, reads the catalog), which return a `credits` array on every billed action. The other 404 actions carry no *provider* price — but nothing that runs in a workflow is free: **every node execution bills 0.01 credits (1 per 100)**, structural natives (`branch`, `filter`, `switch`, `variables`) included. The cost table prices actions, not steps; see [`../cargo-billing/SKILL.md`](../cargo-billing/SKILL.md) → "The execution charge".
- Action shape: `{"kind":"connector","integrationSlug":"<slug>","actionSlug":"<slug>"}` — no `config` on a top-level action, and **`connectorUuid` is never nested inside one**; it sits at the top level of a node.
- Output retrieval: `cargo-ai orchestration run download-outputs --output-node-slug <slug>` (NOT `run download`).
- peopleDataLabs filter shape: `searchX` uses cargo's `{conjonction, groups, conditions}` shape; `queryX` takes a PDL **SQL string** — never Elasticsearch.

### cargo-orchestration

**Critical rules:**

- See the decision flowchart at the top of `../cargo-orchestration/SKILL.md` for when to use `action execute` vs `run create` vs `batch create`.
- **Never enroll a full batch on the first attempt.** `batch create` / `action execute-batch` fan out across every record in the source. Sample **10–20 records**, report observed cost + hit-rate, then ask the user to approve the full enrollment — quoting the **record count** and the **credit estimate**. Mechanics: `../cargo-orchestration/SKILL.md` → "Create a batch"; spend rules: `../cargo-gtm/references/cost-discipline.md` §1.
- **Search for the action; never browse the catalog for it.** `cargo-ai orchestration action list <keywords> [--kind connector|native|tool|agent] [--integration-slug <slug>] [--limit 20]` covers the integration catalog, Cargo native actions, workspace tools, and agents in one free call, and returns a ready-to-paste `action` object (`connectorUuid` resolved) plus the action's **credit costs**. Its sibling `cargo-ai connection action search <keywords>` is connector-only but adds `--credits-only`, the one filter `action list` lacks. Both beat paging `connection integration list`; reach for `integration get <slug>` only once you have picked the action and need its full input schema.
- **Omit `config` on `action execute` / `action execute-batch`** — inputs go in `--data` / `--records`. That is the shape `action list` returns, so its result pastes straight in. `action get-output-schema` takes the same shape (inputs, when its schema depends on them, in `--data`). Workflow **nodes**, alert `--actions`, play `healthAlertActions`, and agent / MCP-server `--actions` still carry `config`. Inputs misplaced in `config` are stripped without an error that names `config`, so they never arrive: an action with a required input is refused before it runs on that missing field, one without runs on nothing. A misspelled or undeclared input key is refused before the run is created (`invalidData`, `Unknown field: <key>`, nested keys included; in a batch one bad record refuses the whole batch) — except on tool actions, extra top-level batch columns, and inside workflow nodes, where an unknown key is still dropped silently.
- **`action execute` is the default for running an operation; `node execute` is debug-only.** Use `node execute` only to test a single node of a workflow you're authoring — it requires `--workflow-uuid`, `--release-uuid`, `--node`, `--computed-config` and `--context` (all five). Anything else — enrich a record, call a connector action, invoke a tool or agent — goes through `action execute` / `action execute-batch`.
- **Build node graphs from dedicated actions + expressions, in this order:** (1) a dedicated action, found first with `orchestration action list <keywords>` (connector actions, and native ones like `agent`, `modelUpsert`, `branch`, `group`); (2) an expression for the glue, since it's inline JavaScript in the field that needs the value; (3) HTTP, only if no action exists for that API; (4) a `script`/`python` node, only if the logic can't fit in an expression. See `../cargo-orchestration/references/node-selection.md`.
- **Show a node graph, don't describe it.** Before deploying a draft, and whenever the user asks what a workflow or play does: `cargo-ai orchestration node diagram --workflow-uuid <uuid> --raw` (free, runs nothing, CLI ≥ 1.0.54; `references/node-diagram.md`). Routing, fallback edges, and which nodes bill are what's being approved. Let the command draw it rather than transcribing — node **slugs repeat within a release**, so a hand-drawn diagram keyed on slug merges nodes that aren't the same.
- Filter JSON uses `conjonction` (not `conjunction`). It is a required key, so a misspelling is rejected with a 400.
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
- `subscriptionAvailableCreditsCount + additionalAvailableCreditsCount - subscriptionCreditsUsedCount` from `subscription get` (under `.subscription`) = remaining credits.
- **Every node execution bills 0.01 credits (1 per 100)** — structural natives included, errored executions included. It is attributed to *no* node (`executions[].creditsUsedCount` is provider cost only), so any estimate or per-node profile built without it under-counts. Only `usage get-metrics --unit orchestration.executions` shows it; `--unit` takes exactly `billing.credits` / `orchestration.executions` / `storage.records` / `hosting.events`, and with no `--unit` those four interleave in one `items[]` array with different meanings for `count`.

### cargo-diagnostics

**Critical rules:**

- Start with the **sweep** when you don't know which run to look at; it ends with exemplar UUIDs for the **trace**. With no UUID at all, `orchestration trace list --started-after <iso> --statuses error,degraded` lists what failed, one row per trigger across child runs; `span list` / `span count` filter node executions by batch, provider, action or error text without SQL. Both need a start date (`--started-after` / `--execution-started-after`).
- **`degraded` means a fallback absorbed a failure** — the run succeeded, a node errored. Sweep it together with `error`.
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
- Permissions are `observability:read` / `observability:write` (not admin-only). The declarative equivalent is a project's `defineAlert` — see `cargo-project`.

### cargo-storage

**Critical rules:**

- Query via `cargo-ai storage query execute "<sql>"` (or `storage query download --query "<sql>"` for full exports) using `<datasetSlug>.<modelSlug>` table names (e.g. `default.companies`). `model get-ddl` is optional — useful for column types and SQL dialect.
- For SQL against orchestration runtime tables (`runs`/`batches`/`spans`/`records`), use `cargo-ai orchestration query execute "<sql>"` — documented in `cargo-orchestration`.
- For advanced record queries (filtering, sorting, pagination), use `segmentation segment fetch` — documented in `cargo-segmentation`.
- `storage relationship set` **replaces** the dataset's whole relationship set — anything absent from the payload is deleted. `list` first, send the full array back.

### cargo-segmentation

**Critical rules:**

- Filter JSON uses `conjonction` (not `conjunction`). It is required at the filter and the group level, so a misspelling is rejected with a 400, and a group with `conditions: []` is rejected too.
- **Size before you spend.** `segment fetch --fetching-limit 1` counts an inline filter for free (read `count`; `--limit` caps the membership itself, so `--limit 1` reports 1); a saved segment's `recordsCount` is the authoritative size. Quote it before proposing any paid run over the audience.
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
- **A coding agent (`--harness-slug` + `--repository` on a release or a new chat) pushes as the Cargo GitHub app**, which must be installed on the repo; its token is scoped to that repo, it works on `cargo/<name>` branches and never pushes the default branch, and a mention on its PR continues the chat. Harness and repository are fixed when a chat is created — passing them with `--chat-uuid` is refused.
- **CLI ≥ 1.0.19:** files and libraries moved out of the `ai` domain into the top-level **`content`** domain (now the `cargo-content` skill). The old `cargo-ai ai file …` commands no longer exist.

> For _using_ agents (sending messages, multi-turn chat, polling), use `cargo-orchestration`.

See `../cargo-ai/SKILL.md` for model and temperature guidance by use case.

### cargo-content

**Critical rules:**

- New top-level **`content`** domain in CLI ≥ 1.0.19 — `cargo-ai content file …` / `cargo-ai content library …`. The old `cargo-ai ai file …` path is gone (`unknown command` → you're on the old path; bump the CLI).
- A file or library is inert until attached to an agent's deployed release `resources` — that wiring lives in [`cargo-ai`](#cargo-ai).
- **`upload` and `put` default differently.** `upload` (and `defineFile`) indexes the file for agent search and mirrors it into the context repo under `.files/` (committed and pushed); `content file put` and every other path write store it only — not searchable by an agent until written with `--index vectorStore`, and not in git.
- **Links are unauthenticated.** `content file url` returns a signed link anyone can open until it expires (default 1 h, max 3 h); a `public` file has a stable no-auth link until made private. Share either only when the user asked to share that file.
- For batch-run **input** files (CSVs that drive a batch), use `cargo-ai workspaceManagement file upload` (a different surface) — see `cargo-workspace-management`.

### cargo-context

**Key concepts:**

- **Context repository** = the GitHub repo backing the workspace's context. Canonical example: [`getcargohq/cargo-workspaces`](https://github.com/getcargohq/cargo-workspaces). Files use `kebab-case.md` names, YAML frontmatter with required `title` + `description`, and `domain/slug` cross-refs (no `.md`).
- **Runtime sandbox** = a checked-out, executable copy of the context repo. `runtime write` and `runtime edit` push to the default branch; `runtime execute` does **not** push.
- **Knowledge graph** = the typed graph over every md/mdx file, with frontmatter and outbound cross-refs per node. Built via `cargo-ai context graph get`.

**Critical rules:**

- `runtime write` / `runtime edit` commit and push. `runtime execute` is ephemeral — use it for `grep`/`ls`/inspection, never for persistent changes.
- `runtime edit --old-string` must match the file content **exactly once** (unless `--replace-all`). Read first, copy whitespace verbatim.
- Set `title` + `description` frontmatter on every `.md`/`.mdx` file — a **strong convention, not enforced**: missing/malformed frontmatter is still committed by `runtime write`/`edit`, it just indexes poorly (graph falls back to filename + first paragraph, and reads `summary`, not `description`). Context declared in a project (`defineContext`) is stricter: `project check`/`plan`/`deploy` fail on frontmatter that doesn't parse and on a `references:` entry, `[[wikilink]]` or relative `.md` link that matches no declared file (missing `title`/`description` still passes).
- Graph **edges** form only from frontmatter `references:`, markdown links, or wikilinks — a bare path in prose creates no edge. Cite source files in `references:`.
- For domains, conventions, and per-domain templates, see `../cargo-context/references/conventions.md`.

**Lifecycle:**

- For bootstrapping a fresh workspace's context from a domain (ICP, personas, proof, signals — idempotent, skips already-seeded domains), see [`../cargo-context/references/examples/bootstrap-from-domain.md`](../cargo-context/references/examples/bootstrap-from-domain.md).
- For the full bootstrap + ongoing call-driven refresh playbook (Phase 1 + Phase 2 + cadence), see [`../cargo-context/references/examples/lifecycle.md`](../cargo-context/references/examples/lifecycle.md).

### cargo-hosting

**Lifecycle:** `init` (local scaffold) → `create` (slot + workspace-unique slug) → `deployment create` (build+upload) → `deployment promote` (go live).

**Critical rules:**

- `--slug` is unique **per workspace**; the live host is `<slug>-<workspace prefix>.<root>`, and apps and workers have different roots. Read `url` from `get` instead of composing it. App → worker calls are therefore **cross-origin**: the worker must answer CORS.
- **`CARGO_API_TOKEN` is not injected by default.** `createCargoApi` throws without it. The one exception: a worker with a service user set (`hosting worker update --uuid <uuid> --run-as-user-uuid <service-user-uuid>`) gets a temporary token for that user as `CARGO_API_TOKEN` at each publish, unless the worker or workspace env already sets the key. Otherwise mint a token and store it as a secret env var: workspace-wide with `workspaceManagement envVar create --secret`, or per worker with `hosting worker env set --worker-uuid <uuid> --key CARGO_API_TOKEN --secret` (value from `--value -` on stdin, or the local variable of the same name), or `defineWorker({ env })` in a project. Env vars bind at promote, so **redeploy + promote after any change**.
- A worker `catch` that returns a sanitized error must `console.error(err)` first. Only uncaught errors reach the logs with a stack.
- **Deploying ≠ going live.** `deployment create` builds; the URL only moves on `deployment promote`. `deployment get-promoted` shows what's live.
- `--source` is the **package root**, not `dist/` — the build runs server-side: the app's own `build` script if `package.json` declares one (it owns the whole build), otherwise the detected framework's default (`vite build`, `next build`, …); bundling for workers.
- App env vars need a public prefix (`VITE_`, `NEXT_PUBLIC_`, …), are compiled into a public bundle, and **cannot be secret** (`secretNotSupportedForApp`).
- Cargo-owned hosts send `X-Robots-Tag: noindex`; an app is indexable only on a custom domain (`POST /v1/hosting/custom-domains`) with prerendered HTML.
- Builds are async — poll `deployment get` until terminal before promoting.
- `--app-uuid` / `--worker-uuid` are mutually exclusive on deployment commands; `remove` cascades to deployments.
- Folders come from [`cargo-workspace-management`](#cargo-workspace-management); `--folder-uuid null` moves to root.

### cargo-project

Declare an entire Cargo workspace in a project, the folder holding `cargo.json`, in TypeScript (`defineConnector`/`defineModel`/`defineAgent`/
`definePlay`/`defineTool`/`defineMcpServer`/`defineContext`/`defineSegment`/
`defineFolder`/`defineFile`/`defineWorker`/`defineApp`/`defineCapacity`/`defineTerritory`/
`defineMember`/`defineRole`/`defineUser`/`defineRelationship`/`defineCustomIntegration`/
`defineScript`/`defineAlert`/`defineDomain`/
`defineMailbox`, plus run-once `defineBatch`/`defineRun` executions) and reconcile
it to live infra with `cargo-ai project`. Spans **every** resource type, so it overlaps
every imperative capability skill — route with "Declarative vs imperative" above.

**Lifecycle:** `project init` (scaffold the Cargo template, `getcargohq/cargo-manifest` — context, cadence
and evals; `cargo.json` and `cargo.state.json` at the root, the resources it deploys in `infra/`) → `project types` (type config
against the workspace) → author `define*` files → `project plan` (diff against the workspace-held state; creates nothing) →
`project deploy` (create/update, write state) → `project destroy`. Plus `refresh` (drift, naming the fields),
`import` (adopt existing), `pull` (generate `define*` from a live workspace and adopt it),
`rollback`, `check` (validate offline, no state), `info` (what is here), `graph` (Mermaid of the
live workspace, or `--project [--plan]` offline), `state` (inspect/repoint/remove; `connect` to
deploy from GitHub). `project plan` works signed out, against the last cached state.

**Critical rules:**

- **Commit `cargo.state.json`** — but know it is a **pointer** (`{"stateUuid": "…"}`),
  not the state. The deploy state lives in the workspace and is the *only* handle on
  deployed plays/agents/alerts (no slug); lose the pointer and `project state bind`
  recovers it, lose the state and they orphan. `project state list|create|bind|remove`.
- **A project is the folder holding `cargo.json`** (`{ "resources": "infra" }`). Every
  command walks up to the nearest one (as far as the repo root) and stops without it,
  printing `echo '{ "resources": "infra" }' > cargo.json`. `cargo.state.json` sits beside
  `cargo.json`, never in `infra/`; a leftover `infra/cargo.state.json` stops commands with
  the `mv` to run. A repo with several projects has one `cargo.json` each.
- **Wire by handle, not `.uuid`** — pass a `define*` handle or `xxRef("uuid")`.
- **Three value helpers, not one.** `secret("ENV_VAR")` reads *your* environment at
  deploy and stays out of state and the content hash (so a rotated secret needs
  `deploy --refresh` to actually land); `env("ENV_VAR")` enters the hash on purpose;
  `workspaceEnv("NAME")` is a pointer the server re-reads on every use, so rotating it
  in the workspace needs no redeploy.
- **`--yes`** is required for non-interactive `deploy`/`destroy` (CI).
- **Run `cargo-ai project types`** after workspace integrations change so config
  type-checks; typing is a bonus, deploy works without it.
- **`definePlay`/`defineTool` graphs with credits-based connector actions:** read
  the provider's playbook in `../cargo-gtm/provider-playbooks/` (esp. its
  **Recurring use** section) before `project deploy` — a deployed play re-bills its
  nodes on every scheduled run.
- **`defineBatch` / `defineRun` run once, on the next deploy, with no undo.** Files
  under `outputs/` declare executions that start a real batch or run after the
  resources apply; a ledger in the workspace-held state makes each id run exactly once
  (no retry — a new id runs it again). One over a segment or filter is a **full
  batch**: pilot and approve it per `../cargo-gtm/references/cost-discipline.md`
  before it is deployed. Guide: `../cargo-project/guides/executions.md`.
- **Deploy from GitHub by connecting the repo, not with a token in Actions.**
  `cargo-ai project state connect` plans every PR in a comment and deploys every push
  to the production branch — and the branch head the moment it connects. A merge over
  100 sends of a kind, 5,000 audience adds or 2,500 credits fails `Needs approval: large
  impact` until the PR is labelled `cargo:approve-impact`, which only the user's yes
  should add. Running an Actions deploy as well fails (`stateAutoDeployed`). Recipe:
  `../cargo-project/recipes/deploy-from-ci.md`.

**Recipes shipped:** `recipes/scaffold-a-project.md`, `add-connector-and-model.md`,
`build-an-agent.md`, `migrate-existing-workspace.md`, `deploy-from-ci.md`.

**Cookbooks:** ~20 pre-written GTM outcomes (TAM building,
account scoring, call capture, inbound qualification, CRM enrichment, …) live in
[`getcargohq/gtm-skills`](https://github.com/getcargohq/gtm-skills) beside its one-off
skills. The menu is local:
[`../cargo-project/references/cookbooks.md`](../cargo-project/references/cookbooks.md).
Check it before authoring a common GTM outcome from scratch.

**The routing question is one-off versus standing.** "Build our TAM" is `cargo-gtm`
when the user wants a list today, and `tam-building` when they want a pipeline that
keeps producing it. The words are the same; listen for whether the result is meant to
keep arriving. Each cookbook is a self-contained worked example the installing agent
copies into the project and adapts, not a template to fill in:
`npx skills add getcargohq/gtm-skills/<name>`. See the section in
`../cargo-project/SKILL.md` for the caveats and the `--force` warning.

### cargo-mailbox-management

**Critical rules:**

- **A mailbox is a *monthly, recurring* credit charge**, not a per-record one — 100–125 credits per mailbox per month (shared and private 100, google 125; `mailboxManagement pricing get` for live figures), for as long as it exists. `mailbox remove` is the only way to stop it; there is no pause. Quote the fleet size and the **credit estimate** per month, and get an explicit yes, before the first `create`.
- **This domain does not send.** Delivery is the native action `sendEmail` (`{"kind":"native","actionSlug":"sendEmail"}`, inputs in `--data`), **0.1 credits per send**, run through `cargo-orchestration`. A play that calls it **re-bills** — and re-contacts — on every run.
- **Volume is a ramp, not a setting.** Real sends go 5/day → 40/day linearly over 45 days from `warmupStartedAt`. A mailbox that never ran `start-warmup` is pinned at 5/day forever, `stop-warmup` resets the anchor to day 0, and `dailySendLimit` can only *tighten* the ramp, never loosen it.
- **Every send is gated by `../cargo-gtm/references/acceptable-use.md` §3** (basis, suppression, relevance). Suppression is workspace-wide, checked before every send, has no removal command, and `List-Unsubscribe` writes to it automatically. Raising the ramp — or spreading one campaign across extra mailboxes to clear the same volume — is the §2 evasion refusal.
- **Nothing here is async** — no run to poll. The exception that looks like one: `mailbox create` returns `status: "pending"`, cleared by `mailbox refresh-status`, not by `run get`.
- `--type outlook` is accepted by the flag and **always** fails (`transportNotSupported` — Graph delivery hasn't shipped). `--statuses`/`--kinds`/`--reasons` are comma-separated **with no spaces**. `mailbox list` is the only list with **no `count`**, and `mailbox`/`suppression` lists have **no default limit** (max 1000) where message/thread/event default to 50.
- **`bounced` has no producer yet** — nothing parses delivery-status notifications, so bounces write no events and do not auto-suppress. Never report an empty bounce count as a clean list.
- **There is no CLI surface for sending domains.** `mailbox create --domain-uuid` is required and `domainManagement` has no `cargo-ai` commands — take the UUID from the web app or a project's `defineDomain`. Permissions are `mailboxManagement:read` / `:write` (not admin-only).

### cargo-workspace-management

**Critical rules:**

- Most commands require a token with **admin access**.
- **Automation runs as a service user, never a person.** A service user (`kind: "service"`) is created through the API, the web app or `defineUser` — `user create` in the CLI only invites people. Assigning one as a worker's or coding agent's run-as user needs your permissions to cover all of its own (`runAsUserNotPermitted`).
- `workspaceManagement token create` requires `--name` (the legacy `--from-user` flag was removed). Pick a name that makes the token's purpose obvious in `token list` later.
- Token values are secrets, and `token list` returns them for your own tokens (and service-user tokens, for admins), not only `token create`. Store them in a secrets manager (GitHub Secrets, AWS Secrets Manager, etc.) and never paste `token list` output.
- **Always send a `workspaceManagement report create`** when the CLI errors, is being used incorrectly, or you (user or agent) are struggling to make progress on a CLI task — see the section at the top of this file and `../cargo-workspace-management/references/examples/reports.md`.

### cargo-mcp

**Critical rules:**

- **`whoami` first, every session.** The token binds the session to exactly one workspace with no override. A wrong-workspace session returns real records belonging to someone else, which reads as success.
- **Never loop `execute_action` over a list** — `execute_action_batch` is cheaper, observable, and returns one object plus an output CSV.
- `search_actions` returns each action's `credits[].cost`, so quote the price before running it, and sample 10–20 records before a full fan-out.
- `query_models` runs one read-only SQL `SELECT` (joins, aggregates and CTEs allowed) with a small row cap (default 20, max 50): aggregate in SQL rather than paging rows out. Full exports go to `cargo-storage`.
- The platform endpoint serves the same fixed tool list to every workspace. A server published with `defineMcpServer` / `ai mcp-server create` is a separate endpoint (`cargo-ai mcp --server <uuid>`).

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

See [`references/gotchas.md`](references/gotchas.md) — silent-failure footguns and frequently confused command pairs (`conjonction` spelling, `run create` vs `batch create`, `--model-uuid` vs `--segment-uuid`, storage query table naming, token values are secrets, invoice cents, third-party connector rate limits, `context runtime execute` vs `write`/`edit`, …).
