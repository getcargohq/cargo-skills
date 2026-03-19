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

## What this skill teaches

**Cargo** connects your data models (companies, contacts, deals) to external integrations (CRMs, enrichment providers, AI agents) and runs them as automated workflows. This skill covers the full CLI surface:

| Domain            | What the agent learns                                                                                                                           |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Orchestration** | Run tools on single records, trigger batches across segments, poll async operations, query the data warehouse with SQL, fetch live segment data |
| **Storage**       | Inspect models and their DDL, create columns, navigate datasets, set relationships between models                                               |
| **Connection**    | Authenticate connectors (HubSpot, Clearbit, Salesforce…), discover integration actions and their slugs                                          |
| **AI**            | Create and configure agents, upload files for RAG, connect MCP servers, inspect agent memories                                                  |
| **Analytics**     | Download run results, export segment data, monitor error rates and success metrics                                                              |
| **Billing**       | Track credit consumption per workflow or connector, check subscription status, view invoices                                                    |
| **Workspace**     | Invite users, create and rotate API tokens, organize resources into folders, manage roles                                                       |

## Use cases

### Run an existing workflow

Ask your agent to trigger a play or tool — it will discover the `workflowUuid`, construct the right input, trigger the batch or run, and poll until completion.

> "Run the lead enrichment tool on Acme Inc."
> "Trigger the scoring play on our new MQL segment."

### Build a workflow from scratch

The agent can construct a full node graph — fetching the connector UUID, looking up the action slug, validating the graph, and executing it — without you touching the UI.

> "Build and run a workflow that enriches company domains with Clearbit and writes the result back to the Companies model."

### Query your data warehouse

The agent fetches the DDL first (to get the exact table name), then writes and executes the SQL query.

> "How many companies in our model have `employee_count` above 500 and are headquartered in the US?"

### Score or research records with an AI agent

The agent creates or finds a configured Cargo agent, sends a message, polls for the response, and surfaces the result.

> "Use the lead researcher agent to find the LinkedIn of every contact added this week."

### Monitor workflow health

The agent pulls error counts and success metrics for a workflow and flags anything outside normal range.

> "Show me the error rate for the CRM sync play over the last 7 days."

### Export segment data

The agent downloads a filtered, sorted export of any model segment directly to a file.

> "Export all US companies with fewer than 200 employees, sorted by creation date."

### Bootstrap a new workspace

The agent handles the full setup sequence: create models, add columns, set relationships, connect integrations, configure agents, and invite team members.

> "Set up a fresh Cargo workspace with Companies and Contacts models, a Clearbit connector, and a GPT-4o scoring agent."

### Track credit usage and costs

The agent queries billing metrics broken down by workflow, connector, or date range.

> "How many credits did the enrichment play consume last month?"

## Prerequisites

```bash
npm install -g @cargo-ai/cli@^1.0.5
cargo-ai login --token <your-api-token>
cargo-ai whoami
```

Get an API token from your workspace under **Settings > API**. Token values are shown only once — store immediately in a secrets manager.

## Links

- [Cargo](https://getcargo.ai)
- [Cargo API docs](https://docs.getcargo.ai/api-reference/introduction)
- [skills.sh](https://skills.sh)
