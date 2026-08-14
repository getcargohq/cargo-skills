# Cargo Skills — GTM engineering for AI coding agents

[![cargo-ai cli](https://img.shields.io/npm/v/@cargo-ai/cli?label=cargo-ai%20cli&color=black)](https://www.npmjs.com/package/@cargo-ai/cli)
[![skills.sh](https://img.shields.io/badge/skills.sh-17%20skills-black)](https://www.skills.sh)
[![License](https://img.shields.io/github/license/getcargohq/cargo-skills?color=black)](LICENSE)

Seventeen agent skills that turn Claude Code, Codex, Cursor, and any [skills.sh](https://skills.sh)-compatible agent into a go-to-market engineering workstation: **build lead lists, find and verify emails and phone numbers, enrich companies and contacts through provider waterfalls, score and qualify leads, write outreach, sync to your CRM, and monitor buying signals** (job changes, funding rounds, tech-stack and hiring intent) — then make any of it a scheduled, always-on workflow.

They run on the [Cargo CLI](https://www.npmjs.com/package/@cargo-ai/cli) against [Cargo](https://getcargo.ai), the AI-native revenue infrastructure: **138 integrations** (HubSpot, Salesforce, Attio, Pipedrive, Outreach, Salesloft, Lemlist, Smartlead, Instantly, Snowflake, BigQuery, Slack, Google Ads, Meta and LinkedIn audiences, and more), **50 credits-based data providers** with per-action costs documented up front, models and SQL over workspace storage, AI agents with RAG, alerting, hosted apps, and a full workspace-as-code CDK.

```
██████    ████    █████    ██████   ██████
██    ░  ██  ██░  ██  ██   ██    ░  ██  ██░
██       ██████░  █████ ░  ██ ███   ██  ██░
██       ██  ██░  ██ ██    ██  ██░  ██  ██░
██████   ██  ██░  ██  ██   ██████░  ██████░
 ░░░░░░   ░░  ░░   ░░  ░░   ░░░░░░   ░░░░░░
```

Tell your agent what you want and it picks the skill:

> *"Find me 50 VPs of Sales at Series B fintechs and verify their emails."*
> *"Enrich this CSV with company size, funding stage, and tech stack."*
> *"Alert me when my enrichment error rate goes above 5%."*
> *"Set up our whole workspace as code so I can review it in a PR."*

**A new account starts with 100 free credits — no card.** That is ~5,000 leads sourced, or ~1,000 verified-email enrichments, and the [two-minute quickstart demo](#onboarding--cargo-quickstart) spends about 0.5 of them. Your agent can install, sign you up, and hand back a real list in one turn.

Machine-readable index for agents and crawlers: [`llms.txt`](llms.txt).

## Install

### Fastest — paste one line into your agent

Paste this prompt into Claude Code, Codex, or Cursor:

```
Install Cargo by following every step in https://api.getcargo.io/agent-install.txt
```

The agent runs the whole setup itself: installs the CLI at the bundle's pinned version, walks you through browser sign-in, installs the skills bundle for its own platform (the plugin on Claude Code; `skills add` on Codex/Cursor), verifies the hooks landed, and offers the two-minute [quickstart demo](#onboarding--cargo-quickstart). The hosted instructions are deterministic numbered steps, so the agent can't skip the parts that matter.

### Manual — skills.sh

```bash
npx skills add getcargohq/cargo-skills
```

Works with Claude Code, Codex, Cursor, Windsurf, GitHub Copilot, [Hermes Agent](#hermes-agent), and any agent that supports the [skills.sh](https://skills.sh) standard. These skills have been installed **54,885 times** across the bundle on skills.sh (August 2026).

### Hermes Agent

[Hermes](https://github.com/NousResearch/hermes-agent) reads the same `SKILL.md` standard, so all seventeen skills work there with no Cargo-side changes. Install them whichever way suits you:

```bash
# From inside Hermes, via the skills.sh source
hermes skills install skills-sh/getcargohq/cargo-skills/cargo-gtm

# Or straight from GitHub, one skill at a time
hermes skills install getcargohq/cargo-skills/cargo-gtm

# Or the whole bundle from outside Hermes
npx skills add getcargohq/cargo-skills --agent hermes-agent
```

The last one writes all seventeen to `.hermes/skills/` (or `~/.hermes/skills/` with `-g`). Cross-skill references resolve because the skills land as siblings — the same layout every other channel uses.

To subscribe to the whole repo as a [tap](https://hermes-agent.nousresearch.com/docs), add it and then point it at the repo root, since these skills live at the top level rather than under `skills/`:

```bash
hermes skills tap add getcargohq/cargo-skills
# then set "path": "." for this entry in ~/.hermes/skills/.hub/taps.json
```

**Two things differ on Hermes.** The plugin channel below is Claude Code / Codex / Cursor only, so its approval hook doesn't apply — Hermes gates tool calls with its own approval policy, and its `pre_tool_call` hooks can only *block* a call, never pre-approve one. Expect `cargo-ai` commands to prompt. And with no bundled session-lifecycle hooks, [the session's three jobs](cargo/SKILL.md) (refresh, register, finalize) are the agent's to run by hand — the router skill already accounts for agents without lifecycle hooks.

### Just one job — `gtm-skills`

If you want a single outcome rather than the whole workstation, [`getcargohq/gtm-skills`](https://github.com/getcargohq/gtm-skills) packages twelve of them as standalone skills named after the job:

```bash
npx skills add getcargohq/gtm-skills/find-work-email
```

`find-b2b-leads`, `build-tam-list`, `find-linkedin-url`, `enrich-linkedin-profile`, `find-work-email`, `verify-email-list`, `enrich-company-data`, `find-stakeholders`, `track-job-changes`, `track-funding-rounds`, `find-companies-using-tech`, `find-portfolio-companies`. Each one installs alone, carries its own cost table, and runs end to end inside the 100 free credits.

Install those **or** this pack, not both — each standalone skill defers to `cargo-gtm` when the pack is present, so the same request is never claimed twice.

### Agent plugin (alternative channel — Claude Code, Codex, Cursor)

The repo also installs as a native **agent plugin**: one source, three targets, sharing the same seventeen skills plus three things `skills add` can't deliver:

- **An approval hook** ([`hooks/approve-cli.sh`](hooks/approve-cli.sh)) that auto-approves safe `cargo-ai` calls (reads, queries, run/batch operations) while credentials (`login`), token minting, report egress, `cdk deploy`/`destroy`, and any `remove`/`delete` always still prompt. Allow-only — it can never override a deny rule. Wired per target: `PreToolUse` (Claude Code), `PermissionRequest` (Codex), `beforeShellExecution` (Cursor).
- **Session-lifecycle hooks** (Claude Code only): plugin-bundled `SessionStart`/`Stop`/`SessionEnd` scripts keep the CLI at the bundle's pinned version and log the session to `workspace_management.sessions` — no installer needed. They defer automatically when the installer's copies exist under `~/.claude/hooks/`, so running both never double-registers a session. Unlike the installer's, the plugin's `SessionStart` does **not** run `skills add` (the plugin owns the skills).
- **Native subagents** (Claude Code only): `cargo-execution-planner` (costed GTM plans with pilot + budget reconciliation, read-only) and `cargo-list-builder` (parallel sourcing fan-out that executes only pre-approved slices), both on the cheap model tier — [`agents/`](agents/).

Optional extra — a **statusline** with live Cargo context (workspace · credits · CLI pin state). Statuslines are user-level config, so wire it yourself in `~/.claude/settings.json`:

```json
{ "statusLine": { "type": "command", "command": "node ~/.claude/plugins/marketplaces/cargo/hooks/cargo-statusline.mjs" } }
```

(Adjust the path to wherever the plugin/marketplace is checked out. Renders from a small cache and never blocks — a detached child refreshes workspace/credits every ~2 minutes.)

**Claude Code** (≥ v2.1.154):

```
/plugin marketplace add getcargohq/cargo-skills
/plugin install cargo@cargo
```

**Codex:**

```bash
codex plugin marketplace add getcargohq/cargo-skills
# then install "cargo" from the Plugins menu
```

**Cursor:** open **Customize** in the sidebar → add the `getcargohq/cargo-skills` marketplace → install the **Cargo** plugin (UI-driven; the `.cursor-plugin/` manifests are picked up automatically).

**Claude Cowork** (Claude Desktop): open **Customize** in the sidebar → **+** next to **Personal plugins** → **Create plugin** → **Add marketplace** → enter `https://github.com/getcargohq/cargo-skills` → install the **Cargo** plugin. Two sandbox-specific notes:

- **Network egress:** in the session's **Settings → Capabilities**, turn on network egress and allow at least `api.getcargo.io` and `registry.npmjs.org` (or all domains) so the CLI can install and reach Cargo.
- **Sign-in:** the Cowork sandbox has no TTY, so the browser sign-in flow can't complete there. Mint a workspace API token at [app.getcargo.io](https://app.getcargo.io) → **Settings → API** and have the agent run `cargo-ai login --token <token>` instead. Start the session on a project folder — auth persists in that folder, so later Cowork sessions on the same folder reuse it.

**Pick one channel.** Plugin install and `skills add` both register the skills; using both duplicates them (plugin copies are namespaced `cargo:<skill>`). Plugin users should uninstall the `skills add` copies (and skip the installer) and update via `/plugin marketplace update cargo` + `/plugin update cargo@cargo` instead.

For [OpenClaw](https://openclaw.ai), install the bundle from ClawHub:

```bash
clawhub install getcargohq/cargo-skills           # current workspace's skills/
clawhub install getcargohq/cargo-skills --global  # ~/.openclaw/skills (shared)
```

Each skill ships a `metadata.openclaw.install` block that pulls `@cargo-ai/cli@latest` from npm and exposes the `cargo-ai` bin on first run, so no separate prerequisite step is needed.

## Staying current

The Cargo CLI and these skills ship updates regularly. The bundle pins the CLI version it was written against in [`cargo/cli-version`](cargo/cli-version) — the CLI release pipeline PRs a bump here, and merging that PR is the deliberate "skills + CLI verified together" promotion. Session hooks and the install docs read the pin and fall back to `latest` when it's unreadable, so the pin can never block an install.

### Claude Code

The Cargo installer wires this up for you. Run it once and answer **y** at the plugin prompt:

```bash
curl -fsSL https://api.getcargo.io/install.sh | sh
```

This pipes a network-fetched script straight into a shell, which is worth exactly as
much trust as you place in Cargo. The script is not obfuscated. To read the exact bytes
you run, download once and execute that file — fetching twice (`| less`, then `| sh`)
proves nothing, since the second request can be served different content:

```bash
curl -fsSL https://api.getcargo.io/install.sh -o cargo-install.sh
less cargo-install.sh
sh cargo-install.sh
```

Everything it does is also doable by hand: `npm install -g @cargo-ai/cli` plus the
[plugin install](#agent-plugin-alternative-channel--claude-code-codex-cursor) above.

It installs the CLI (at the bundle's pinned version) and the **Cargo plugin**, whose bundled hooks then keep everything current automatically: every new Claude Code session (1) converges `@cargo-ai/cli` to the pin and refreshes the plugin itself for the next session, (2) checkpoints the session row each turn so progress is captured even if the session never ends cleanly, and (3) logs the session to `workspace_management.sessions` with an AI-generated title and summary at the end. All hooks swallow errors, so a missing `cargo-ai`/`claude`/`jq` binary never blocks a session. Set `CARGO_INSTALL_HOOKS=0` to skip the prompt — the installer then falls back to `skills add` and scaffolds nothing.

(Older installer versions scaffolded standalone `SessionStart`/`Stop`/`SessionEnd` hooks under `~/.claude/hooks/` instead; the plugin's hooks defer to those when present, and re-running the installer migrates them away.)

Without the installer, the `cargo` router skill still instructs the agent to refresh CLI + skills at the start of every session ([see `cargo/SKILL.md`](cargo/SKILL.md)) — that works out of the box, just without the hard enforcement and session logging the hooks provide.

### OpenClaw

`metadata.openclaw.install` pins `@cargo-ai/cli@latest` so first install always fetches the latest CLI. To refresh an already-installed bundle:

```bash
clawhub install getcargohq/cargo-skills           # re-run to pull latest skills
npm install -g "@cargo-ai/cli@$(cat ~/.openclaw/skills/cargo/cli-version 2>/dev/null || echo latest)"
```

### Cursor / Windsurf / Copilot / other skills.sh agents

Re-run the install command — `skills add` clones the repo fresh each time, so the bundle is always current:

```bash
npx skills add getcargohq/cargo-skills            # refreshes skills (brings the pin with it)
npm install -g "@cargo-ai/cli@$(cat ~/.claude/skills/cargo/cli-version 2>/dev/null || echo latest)"
```

### Publishing new versions to ClawHub

`.github/workflows/clawhub-publish.yml` publishes every skill whose `version:` was bumped, on each GitHub release. One-time setup:

1. Sign in at [clawhub.ai](https://clawhub.ai) with the GitHub account that owns the `cargo-ai` org publisher (run `clawhub publisher create cargo-ai` first if it doesn't exist), then generate an API token from the web UI.
2. Add it as a repo secret named `CLAWHUB_TOKEN`.

Then bump the `version:` field in each changed `SKILL.md` (semver, e.g. `1.0.0` → `1.1.0`) and cut a release. The workflow authenticates with `clawhub login --token`, calls `clawhub skill publish ./<dir> --version <semver> --owner cargo-ai` for each skill, skips ones whose published version is unchanged, and fails on any other error. Trigger a manual run with `workflow_dispatch` (optional `dry_run: true`) to preview.

## What this skill teaches

**Cargo** connects your data models (companies, contacts, deals) to external integrations (CRMs, enrichment providers, AI agents) and runs them as automated workflows. The repo ships seventeen skills at the root — one **router skill** (`cargo`, the overview / front door for any Cargo CLI task), one **onboarding skill** (`cargo-quickstart`, the guided first-run demo), one **outcome skill** (`cargo-gtm`, the front door for any GTM task), and fourteen **capability skills** (one per CLI domain, plus the cross-domain `cargo-diagnostics`). Most capability skills wrap the **imperative** CLI (one-off `cargo-ai <domain>` operations); `cargo-cdk` is the **declarative** one — define a whole workspace in code and deploy it — and `cargo-diagnostics` sequences the run/SQL/billing surfaces into forensic runbooks (trace a run, sweep a batch for errors, profile credit spend).

### Router — `cargo`

Always-loadable overview. Explains the skill graph (router → outcome → capabilities), the UUID flow between skills, async polling, end-to-end use cases, and the most common gotchas. Bundles [`cargo/references/glossary.md`](cargo/references/glossary.md) for term-by-term definitions. Load first when starting any Cargo CLI task or when stitching multiple capability skills together.

### Onboarding — `cargo-quickstart`

Guided first-run demo: one question ("who do you sell to?") → 25 leads matching that persona in under two minutes → cost receipt → save the pull as a recurring play. The fastest way to feel what Cargo is on a fresh workspace.

### Outcome — `cargo-gtm`

Load when the user states a real-world goal. `cargo-gtm` is the meta-skill — it routes to phase guides, scenario recipes, and per-provider playbooks all bundled inside the same skill.

Built-in recipes:

| Recipe | Use when… |
|---|---|
| `source-planning.md` | **Read first when the source isn't obvious.** Probe candidate sources on 5–10 rows and cost them per *hit* before any fan-out. |
| `prospecting.md` | Find people matching a description, enrich, verify, sync. End-to-end flagship. |
| `build-tam.md` | Build a Total Addressable Market list at scale (100–10,000 companies). |
| `linkedin-url-lookup.md` | Resolve a person's LinkedIn URL from name + company with strict identity validation. |
| `portfolio-prospecting.md` | Find every company backed by a specific investor / accelerator, then prospect into them. |
| `job-change-monitoring.md` | Detect job changes in a contact segment (waterfall.detectJobChange — cargo-unique). |
| `funding-watch.md` | Track companies that recently raised funding for outbound timing. |
| `tech-intent.md` | Find companies by tech-stack or hiring intent (theirStack-driven). |
| `icp-discovery.md` | Diff Closed-Won vs Closed-Lost segments, surface differentiating ICP signals. |
| `custom-datapoints.md` | Design which custom attributes and live signals to collect for an ICP — each gated on a real catalog source, cost, and probed coverage. |
| `outreach-activation.md` | Turn a signal segment into send-ready outreach (enrich → verify → personalize → sequencer handoff). |
| `ads-audience-activation.md` | Push a segment to paid media — Google Ads Customer Match / LinkedIn Matched Audiences — and read the match rate. |
| `review-and-iterate.md` | Human review loop for judgment output: sheet handoff, grouped corrections, permanent fixes, kept as an eval set. |
| `re-engagement.md` | Wake up stale contacts only when a fresh signal fires (job change, funding, tech intent). |
| `lost-deal-revival.md` | Revive Closed-Lost CRM deals by branching on `lost_reason` (champion left, budget, timing). |
| `account-expansion.md` | Multi-thread existing customer accounts — net-new buyers, deduped against the Contacts model. |
| `save-as-play.md` | Convert a successful ad-hoc run into a durable scheduled play or cron tool. |
| `import-gtm-data.md` | Import existing GTM data (CSV/CRM exports) into models, QA-audit it, rebuild recurring logic as plays with a parity check. |
| `clay-to-cargo.md` | Migrate a Clay table specifically: extract the column configuration rather than the CSV, map every column family to its Cargo action, and prove parity against Clay's own output before switching. |

### Capabilities

The standard library. Load when you need the syntax for a specific CLI domain — plus the two cross-cutting entries: **CDK** (the declarative mode) and **Diagnostics** (forensic runbooks over the other surfaces).

| Domain            | What the agent learns                                                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Orchestration** | Execute single actions, chain actions into workflows, trigger batches across segments, poll async operations, query orchestration runtime tables (`runs`/`batches`/`spans`/`records`) with SQL, fetch segment data |
| **Storage**       | Inspect models and their DDL, create columns, navigate datasets, set relationships between models, query workspace storage with SQL                              |
| **Segmentation**  | Build and manage segments — the saved filters that name the audience for a batch, a play trigger, or an export — size an audience before spending on it, and read the change (delta) feed |
| **Connection**    | Authenticate connectors, discover integration actions and their slugs across 120+ integrations                                                                     |
| **AI**            | Create and configure agents, configure releases, attach knowledge for RAG, connect MCP servers, inspect agent memories                                             |
| **Content**       | Upload and organize knowledge files; build `native` and `connector`-backed knowledge libraries for RAG (the `content` domain)                                       |
| **Context**       | Browse, read, write, and edit the workspace's git-backed context repo (markdown/MDX GTM knowledge base); run shell commands in its runtime sandbox; inspect the knowledge graph |
| **Analytics**     | Download run results and outputs, export segment data, monitor error rates and success metrics                                                                     |
| **Billing**       | Track credit consumption per workflow or connector, check subscription status, view invoices                                                                       |
| **Observability** | Create and manage **alerts** — scheduled threshold checks on workflow telemetry (spans/runs/records), a model's health, or a SQL query — that fire actions (connector/tool/agent runs) on breach; preview, list, and inspect their firing history |
| **Hosting**       | Scaffold, deploy, and promote hosted apps (Vite SPAs on `*.cargo.app`) and edge workers (serverless HTTP handlers), and manage their deployments                   |
| **Workspace**     | Invite users, create and rotate API tokens, organize resources into folders, manage roles                                                                          |
| **CDK** *(declarative)* | Define an entire workspace in code (`define*` builders) and deploy it with `cargo-ai cdk` (init → types → plan → deploy → destroy). Spans every resource type; use for workspace-as-code / reproducible / version-controlled setups |
| **Diagnostics** *(cross-domain)* | Explain workflow behavior after the fact: trace why one run misbehaved, sweep a batch or play for errors grouped by root cause, profile where a play's credits go. Forensic runbooks over the run / orchestration-SQL / billing surfaces |

## What can I ask for?

Prompts that route through `cargo-gtm`:

- *"Find me 5 fintech CTOs in NYC and verify their emails."* → `recipes/prospecting.md`
- *"Build a TAM list of seed-stage SaaS companies in Europe."* → `recipes/build-tam.md`
- *"Resolve the LinkedIn profile for John Smith at Acme Corp."* → `recipes/linkedin-url-lookup.md`
- *"Detect job changes among contacts in our customers segment."* → `recipes/job-change-monitoring.md`
- *"Find every company backed by Sequoia and prospect into the portfolio."* → `recipes/portfolio-prospecting.md`
- *"Show me everyone hiring data engineers AND running Snowflake."* → `recipes/tech-intent.md`
- *"What ICP signals differentiate our Closed-Won deals?"* → `recipes/icp-discovery.md`
- *"What custom data points should we be collecting on our accounts?"* → `recipes/custom-datapoints.md`

For ad-hoc CLI work (modify a model, list connectors, query storage, edit the GTM context repo), load the matching capability skill directly.

## Use cases

### Execute a single action

Ask your agent to run one action on a record — it will pick the right action kind (connector, tool, or agent), execute it, and return the result.

> "Enrich acme.com with waterfall."
> "Run the lead scorer on this contact."

### Run an existing workflow

Ask your agent to trigger a play or tool — it will discover the `workflowUuid`, construct the right input, trigger the batch or run, and poll until completion.

> "Run the lead enrichment tool on Acme Inc."
> "Trigger the scoring play on our new MQL segment."

### Build a workflow from scratch

The agent can construct a full node graph — fetching the connector UUID, looking up the action slug, validating the graph, and executing it — without you touching the UI.

> "Build and run a workflow that enriches company domains with waterfall and writes the result back to the Companies model."

### Query storage with SQL

The agent fetches the DDL first (to get the exact table name), then writes and executes the SQL query.

> "How many companies in our model have `employee_count` above 500 and are headquartered in the US?"

### Score or research records with an AI agent

The agent creates or finds a configured Cargo agent, sends a message, polls for the response, and surfaces the result.

> "Use the lead researcher agent to find the LinkedIn of every contact added this week."

### Edit the workspace's GTM context

The agent browses, reads, and edits the git-backed context repo (personas, plays, proof, objections, etc.) via the runtime sandbox, and uses the knowledge graph to audit cross-references.

> "Add a persona file for Head of RevOps at mid-market SaaS."
> "Find every play that references the funding signal but has no proof attached."

### Monitor workflow health

The agent pulls error counts and success metrics for a workflow and flags anything outside normal range.

> "Show me the error rate for the CRM sync play over the last 7 days."

### Get alerted when something breaks

The agent creates a scheduled **alert** — an error-rate spike, a credit ceiling, a slow node, a stalled sync, or a workflow that stopped running — that fires a notification (or any action) on breach, without you having to look.

> "Alert me when the CRM sync's error rate goes above 10%, and page the on-call agent."

### Export segment data

The agent downloads a filtered, sorted export of any model segment directly to a file.

> "Export all US companies with fewer than 200 employees, sorted by creation date."

### Bootstrap a new workspace

The agent handles the full setup sequence: create models, add columns, set relationships, connect integrations, configure agents, and invite team members.

> "Set up a fresh Cargo workspace with Companies and Contacts models, a waterfall connector, and a GPT-4o scoring agent."

### Track credit usage and costs

The agent queries billing metrics broken down by workflow, connector, or date range.

> "How many credits did the enrichment play consume last month?"

## Prerequisites

```bash
npm install -g @cargo-ai/cli

# Recommended: emailed code, no browser. Creates the account on first use.
cargo-ai login --email you@company.com          # sends the code, then exits
cargo-ai login --email you@company.com --code 123456

# or: cargo-ai login --oauth                    # browser sign-in (OAuth device flow)
# or: cargo-ai login --token <your-api-token>   # workspace-scoped API token (CI)
cargo-ai whoami
```

`--email` mails a one-time code and creates the account and a workspace on first use, so there is no separate sign-up step and no browser at any point. It is the right channel for an **agent or sandbox shell**: where there is no terminal to prompt at, the first call sends the code and exits, so you re-run with `--code`. Pass the code on stdin to keep it out of shell history: `echo 123456 | cargo-ai login --email you@company.com --code -`.

`--oauth` runs the OAuth 2.0 Device Authorization Flow against the Cargo OAuth provider — no setup required, but it needs a human at the verification URL. For non-interactive environments (CI, scripts), use `--token` with a workspace-scoped API token from **Settings > API**. Token values are shown only once — store immediately in a secrets manager.

## Links

- [Cargo](https://getcargo.ai)
- [Cargo API docs](https://docs.getcargo.ai/api-reference/introduction)
- [skills.sh](https://skills.sh)
