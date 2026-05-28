```
██████    ████    █████    ██████   ██████
██    ░  ██  ██░  ██  ██   ██    ░  ██  ██░
██       ██████░  █████ ░  ██ ███   ██  ██░
██       ██  ██░  ██ ██    ██  ██░  ██  ██░
██████   ██  ██░  ██  ██   ██████░  ██████░
 ░░░░░░   ░░  ░░   ░░  ░░   ░░░░░░   ░░░░░░
```

# Cargo Agent Skills

Agent skill for [Cargo](https://getcargo.ai) — the AI-native revenue infrastructure. Teaches AI coding agents how to use the [Cargo CLI](https://www.npmjs.com/package/@cargo-ai/cli) to build, run, and manage revenue automation workflows programmatically.

## Install

```bash
npx skills add getcargohq/cargo-skills
```

Works with Claude Code, Cursor, Windsurf, GitHub Copilot, and any agent that supports the [skills.sh](https://skills.sh) standard.

For [OpenClaw](https://openclaw.ai), install the bundle from ClawHub:

```bash
clawhub install getcargohq/cargo-skills           # current workspace's skills/
clawhub install getcargohq/cargo-skills --global  # ~/.openclaw/skills (shared)
```

Each skill ships a `metadata.openclaw.install` block that pulls `@cargo-ai/cli@latest` from npm and exposes the `cargo-ai` bin on first run, so no separate prerequisite step is needed.

## Staying current

The Cargo CLI and these skills ship updates regularly. To always run the latest:

### Claude Code

The `cargo` router skill instructs the agent to refresh CLI + skills at the start of every session ([see `cargo/SKILL.md`](cargo/SKILL.md)) — works out of the box. If you want guaranteed enforcement instead of prompt-level guidance, drop a `SessionStart` hook into your project's `.claude/` folder:

`.claude/hooks/session-start.sh`:

```bash
#!/bin/bash
set -euo pipefail

# Only run in Claude Code on the web; local sessions manage CLI versions themselves.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

npm install -g @cargo-ai/cli@latest
npx -y skills add getcargohq/cargo-skills --all
```

`.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/session-start.sh"
          }
        ]
      }
    ]
  }
}
```

Make the script executable (`chmod +x .claude/hooks/session-start.sh`) and you're done — every Claude Code on the web session against that project will refresh both before the agent loop starts.

### OpenClaw

`metadata.openclaw.install` pins `@cargo-ai/cli@latest` so first install always fetches the latest CLI. To refresh an already-installed bundle:

```bash
clawhub install getcargohq/cargo-skills           # re-run to pull latest skills
npm install -g @cargo-ai/cli@latest               # bump the CLI
```

### Cursor / Windsurf / Copilot / other skills.sh agents

Re-run the install command — `skills add` clones the repo fresh each time, so the bundle is always current:

```bash
npx skills add getcargohq/cargo-skills            # refreshes skills
npm install -g @cargo-ai/cli@latest               # bumps the CLI
```

### Publishing new versions to ClawHub

`.github/workflows/clawhub-publish.yml` publishes every skill whose `version:` was bumped, on each GitHub release. One-time setup:

1. Sign in at [clawhub.ai](https://clawhub.ai) with the GitHub account that owns the `getcargohq` org publisher (run `clawhub publisher create getcargohq` first if it doesn't exist), then generate an API token from the web UI.
2. Add it as a repo secret named `CLAWHUB_TOKEN`.

Then bump the `version:` field in each changed `SKILL.md` (semver, e.g. `1.0.0` → `1.1.0`) and cut a release. The workflow authenticates with `clawhub login --token`, calls `clawhub skill publish ./<dir> --version <semver> --owner getcargohq` for each skill, skips ones whose published version is unchanged, and fails on any other error. Trigger a manual run with `workflow_dispatch` (optional `dry_run: true`) to preview.

## What this skill teaches

**Cargo** connects your data models (companies, contacts, deals) to external integrations (CRMs, enrichment providers, AI agents) and runs them as automated workflows. The repo ships ten skills at the root — one **router skill** (`cargo`, the overview / front door for any Cargo CLI task), one **outcome skill** (`cargo-gtm`, the front door for any GTM task), and eight **capability skills** (one per CLI domain).

### Router — `cargo`

Always-loadable overview. Explains the skill graph (router → outcome → capabilities), the UUID flow between skills, async polling, end-to-end use cases, and the most common gotchas. Bundles [`cargo/references/glossary.md`](cargo/references/glossary.md) for term-by-term definitions. Load first when starting any Cargo CLI task or when stitching multiple capability skills together.

### Outcome — `cargo-gtm`

Load when the user states a real-world goal. `cargo-gtm` is the meta-skill — it routes to phase guides, scenario recipes, and per-provider playbooks all bundled inside the same skill.

Built-in recipes:

| Recipe | Use when… |
|---|---|
| `prospecting.md` | Find people matching a description, enrich, verify, sync. End-to-end flagship. |
| `build-tam.md` | Build a Total Addressable Market list at scale (100–10,000 companies). |
| `linkedin-url-lookup.md` | Resolve a person's LinkedIn URL from name + company with strict identity validation. |
| `portfolio-prospecting.md` | Find every company backed by a specific investor / accelerator, then prospect into them. |
| `job-change-monitoring.md` | Detect job changes in a contact segment (waterfall.detectJobChange — cargo-unique). |
| `funding-watch.md` | Track companies that recently raised funding for outbound timing. |
| `tech-intent.md` | Find companies by tech-stack or hiring intent (theirStack-driven). |
| `icp-discovery.md` | Diff Closed-Won vs Closed-Lost segments, surface differentiating ICP signals. |

### Capabilities — CLI surface

Load when you need the syntax for a specific CLI domain.

| Domain            | What the agent learns                                                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Orchestration** | Execute single actions, chain actions into workflows, trigger batches across segments, poll async operations, query orchestration runtime tables (`runs`/`batches`/`spans`/`records`) with SQL, fetch segment data |
| **Storage**       | Inspect models and their DDL, create columns, navigate datasets, set relationships between models, query workspace storage with SQL                              |
| **Connection**    | Authenticate connectors, discover integration actions and their slugs across 120+ integrations                                                                     |
| **AI**            | Create and configure agents, upload files for RAG, connect MCP servers, inspect agent memories                                                                     |
| **Context**       | Browse, read, write, and edit the workspace's git-backed context repo (markdown/MDX GTM knowledge base); run shell commands in its runtime sandbox; inspect the knowledge graph |
| **Analytics**     | Download run results and outputs, export segment data, monitor error rates and success metrics                                                                     |
| **Billing**       | Track credit consumption per workflow or connector, check subscription status, view invoices                                                                       |
| **Workspace**     | Invite users, create and rotate API tokens, organize resources into folders, manage roles                                                                          |

## What can I ask for?

Prompts that route through `cargo-gtm`:

- *"Find me 5 fintech CTOs in NYC and verify their emails."* → `recipes/prospecting.md`
- *"Build a TAM list of seed-stage SaaS companies in Europe."* → `recipes/build-tam.md`
- *"Resolve the LinkedIn profile for John Smith at Acme Corp."* → `recipes/linkedin-url-lookup.md`
- *"Detect job changes among contacts in our customers segment."* → `recipes/job-change-monitoring.md`
- *"Find every company backed by Sequoia and prospect into the portfolio."* → `recipes/portfolio-prospecting.md`
- *"Show me everyone hiring data engineers AND running Snowflake."* → `recipes/tech-intent.md`
- *"What ICP signals differentiate our Closed-Won deals?"* → `recipes/icp-discovery.md`

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
cargo-ai login --oauth                          # browser sign-in (recommended)
# or: cargo-ai login --token <your-api-token>   # workspace-scoped API token
cargo-ai whoami
```

`--oauth` runs the OAuth 2.0 Device Authorization Flow against the Cargo OAuth provider — no setup required. For non-interactive environments (CI, scripts), use `--token` with a workspace-scoped API token from **Settings > API**. Token values are shown only once — store immediately in a secrets manager.

## Links

- [Cargo](https://getcargo.ai)
- [Cargo API docs](https://docs.getcargo.ai/api-reference/introduction)
- [skills.sh](https://skills.sh)
