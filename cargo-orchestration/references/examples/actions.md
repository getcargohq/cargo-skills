# Action examples

## What is an action?

An **action** is a single operation you can execute without building a workflow. Use `action execute` for one record, or `action execute-batch` for multiple records.

Actions come in four kinds:

| Kind        | What it does                         | Required fields                                |
| ----------- | ------------------------------------ | ---------------------------------------------- |
| `tool`      | Run an orchestration tool            | `toolUuid` or `templateSlug` or `releaseUuid`  |
| `connector` | Call a third-party service           | `integrationSlug` + `actionSlug`               |
| `agent`     | Invoke an AI agent                   | `agentUuid` or `templateSlug` or `releaseUuid` |
| `native`    | Run a built-in platform action       | `actionSlug`                                   |

`config` is where a **node** keeps its configuration; a top-level action has none — its inputs go in `--data` (single) or `--records` (batch). Omit the key on `execute` / `execute-batch`: that is the shape `action list` returns, and `"config": {}` is merely tolerated there.

**`get-output-schema` is the exception — it still requires `config`.** Hand it the action object from `action list` unchanged and it fails `400 — expected record, received undefined` at `action.config`; add `"config": {}` for that command only (the examples below do). Nodes, alert `--actions`, play `healthAlertActions`, and agent / MCP-server `--actions` require it as well.

> **When to use actions vs workflows:** Actions are for running a **single operation** without building a workflow graph. If you need to **chain multiple operations** together (enrichment → scoring → CRM push), use `run create --nodes` or `batch create --nodes` instead. See `tools.md` for workflow examples.

---

## Find an action — `action list`

Free: no run, no credits. Searches the integration catalog, Cargo native actions, this workspace's tools, and its agents in one call.

```bash
cargo-ai orchestration action list enrich company
cargo-ai orchestration action list --kind tool
cargo-ai orchestration action list send --kind connector --integration-slug slack
cargo-ai orchestration action list verify email --limit 5
```

| Flag | Meaning |
| --- | --- |
| `[query...]` | Space-separated keywords. **All** terms must match (AND), against action slug, name, description, and integration. Omit to browse. |
| `--kind` | One of `connector`, `native`, `tool`, `agent`. `tool` and `agent` need a signed-in workspace. |
| `--integration-slug` | Restrict connector results to one integration. |
| `--limit` | Default 20, max 50. |

Response:

```json
{
  "query": "enrich company",
  "totalMatches": 37,
  "results": [
    {
      "name": "Enrich company",
      "description": "Return firmographics for a domain…",
      "score": 12,
      "action": {
        "kind": "connector",
        "integrationSlug": "cargo",
        "actionSlug": "enrichCompany",
        "connectorUuid": "<uuid>"
      },
      "connectors": [{ "uuid": "<uuid>", "slug": "cargo", "name": "Cargo" }],
      "credits": [{ "...": "cost table for this action" }],
      "autocompletes": [{ "slug": "<slug>", "params": { "...": "..." } }]
    }
  ]
}
```

Notes worth knowing:

- **`results[].action` is the payload** — pass it verbatim to `execute`, `execute-batch`, or `get-output-schema`. `connectorUuid` is resolved to the integration's default connector (or the first one) and sits **at the top level of the action, never inside `config`**.
- **`credits`** is the action's cost table when it bills — the cheapest pre-flight cost check there is. Cross-check a GTM provider's playbook (`../../../cargo-gtm/provider-playbooks/<slug>.md`) before fanning out.
- **`autocompletes`** flags config fields that need a picked id (HubSpot object type, Slack channel, Metabase question). Resolve those to concrete values before running — over MCP that is the `autocomplete_action` tool; over the CLI, use the integration's own list actions.
- Ranking: action slug/name > integration > description. `score` is comparable within one response only.
- Structural native nodes (`start`, `end`, `branch`, `delay`, `filter`, `group`, `split`, `switch`, `note`) are excluded — they belong in a node graph, not in `action execute`. See `nodes.md`.
- `unknown command` means the CLI predates `action list` — refresh it (`npm install -g @cargo-ai/cli@…`).

---

## Execute one action on one record

```bash
# Tool action
cargo-ai orchestration action execute \
  --action '{"kind":"tool","toolUuid":"<tool-uuid>"}' \
  --data '{"domain":"acme.com"}'

# Connector action
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"clearbit","actionSlug":"enrichCompany"}' \
  --data '{"domain":"acme.com"}'

# Agent action
cargo-ai orchestration action execute \
  --action '{"kind":"agent","agentUuid":"<agent-uuid>"}' \
  --data '{"company":"Acme Corp"}'
```

Returns a `run` object. Poll with `run get <uuid>` until terminal, or pass `--wait-until-finished`:

```bash
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"clearbit","actionSlug":"enrichCompany"}' \
  --data '{"domain":"acme.com"}' \
  --wait-until-finished
```

Custom polling interval (default 5000ms):

```bash
cargo-ai orchestration action execute \
  --action '{"kind":"tool","toolUuid":"<tool-uuid>"}' \
  --data '{"domain":"acme.com"}' \
  --wait-until-finished --polling-interval 2000
```

### Response

```json
{
  "run": {
    "uuid": "run-uuid",
    "status": "pending",
    "createdAt": "2025-01-15T10:00:00Z"
  }
}
```

With `--wait-until-finished`, the response contains the terminal run state:

```json
{
  "run": {
    "uuid": "run-uuid",
    "status": "success",
    "createdAt": "2025-01-15T10:00:00Z",
    "finishedAt": "2025-01-15T10:00:05Z"
  }
}
```

**Status values:** `pending`, `running`, `success`, `error`, `cancelled`.

---

## Execute one action on many records

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"tool","toolUuid":"<tool-uuid>"}' \
  --records '[{"domain":"acme.com"},{"domain":"globex.com"},{"domain":"initech.com"}]'
```

Returns a `batch` object. Poll with `batch get <uuid>` until terminal, or pass `--wait-until-finished`:

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"clearbit","actionSlug":"enrichCompany"}' \
  --records '[{"domain":"acme.com"},{"domain":"globex.com"}]' \
  --wait-until-finished
```

### Webhook notification

Get notified when the batch completes instead of polling:

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"tool","toolUuid":"<tool-uuid>"}' \
  --records '[{"domain":"acme.com"},{"domain":"globex.com"}]' \
  --webhook-url "https://hooks.example.com/done" \
  --webhook-secret "my-secret"
```

### Response

```json
{
  "batch": {
    "uuid": "batch-uuid",
    "status": "pending",
    "createdAt": "2025-01-15T10:00:00Z"
  }
}
```

With `--wait-until-finished`:

```json
{
  "batch": {
    "uuid": "batch-uuid",
    "status": "success",
    "runsCount": 3,
    "executedRunsCount": 3,
    "failedRunsCount": 0,
    "creditsUsedCount": 3,
    "createdAt": "2025-01-15T10:00:00Z",
    "finishedAt": "2025-01-15T10:00:15Z"
  }
}
```

---

## Retry configuration

Add a `retry` object to the action for automatic retries on transient failures:

```bash
cargo-ai orchestration action execute \
  --action '{
    "kind":"connector",
    "integrationSlug":"clearbit",
    "actionSlug":"enrichCompany",
    "retry":{"maximumAttempts":3,"initialInterval":1000,"backoffCoefficient":2}
  }' \
  --data '{"domain":"acme.com"}' \
  --wait-until-finished
```

---

## Discovering action parameters

To find the right values for each action kind:

```bash
# Tool actions — find toolUuid
cargo-ai orchestration tool list
# → Extract .tools[].uuid

# Connector actions — find integrationSlug + actionSlug
cargo-ai connection integration list
cargo-ai connection integration get <slug>
# → Extract actions from the integration

# Agent actions — find agentUuid
cargo-ai ai agent list
# → Extract .agents[].uuid

# Connector actions — find connectorUuid (optional, for authenticated connectors)
cargo-ai connection connector list
# → Extract .connectors[].uuid
```

---

## Resolve an action's output schema

**Never guess what an action outputs.** There are two free ways to discover what an action **produces** — no run, no credits.

### 1. Connector actions: read `output.schema` from the integration catalog

`integration get <slug>` (and `integration list`) return each action's output schema inline, next to its input schema:

```bash
cargo-ai connection integration get waterfall
# → .integration.actions.verifyEmail.config.schema   — input (what you pass)
# → .integration.actions.verifyEmail.output.schema   — output (what it emits)
```

**Not every action declares an output schema** — e.g. `waterfall.verifyEmail`, `clearbit.enrichCompany`, and most `hubspot` record actions do, while `waterfall.detectJobChange`, `waterfall.searchProspects`, and `salesNavigator.searchAccounts` don't (no `output` key). When it's absent, the only way to see the real shape is `runContext` from an actual run.

### 2. Any action kind: `action get-output-schema`

For non-connector kinds (`tool`, `agent`, `native`) — or when you already have the action object in hand — resolve the same schema without touching the catalog:

```bash
cargo-ai orchestration action get-output-schema \
  --action '{"kind":"connector","integrationSlug":"clearbit","actionSlug":"enrichCompany","config":{}}'
```

It accepts the same `--action` object as `action execute`, so it works for every kind:

```bash
# Tool action — resolves the tool workflow's output-node schema
cargo-ai orchestration action get-output-schema \
  --action '{"kind":"tool","toolUuid":"<tool-uuid>","config":{}}'

# Agent action — resolves the deployed release's output schema
cargo-ai orchestration action get-output-schema \
  --action '{"kind":"agent","agentUuid":"<agent-uuid>","config":{}}'

# Native action
cargo-ai orchestration action get-output-schema \
  --action '{"kind":"native","actionSlug":"<slug>","config":{}}'
```

### Response

The JSON Schema sits under a top-level **`schema`** key (not returned bare), and for connector actions it is exactly the catalog's `output.schema` — e.g. `waterfall` / `verifyEmail` resolves to:

```json
{
  "schema": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "properties": {
      "email": { "type": "string" },
      "domain": { "type": "string" },
      "email_status": { "type": "string" },
      "smtp_provider": { "type": "string" },
      "mx_records": { "type": "array", "items": { "type": "string" } }
    }
  }
}
```

An `agent` action without a structured `output.jsonSchema` resolves to `{"schema":{"type":"object","properties":{"answer":{"type":"string"}}}}` — the free-text answer envelope. This is the authoritative confirmation that downstream references must go through `.answer` (`{{nodes.<slug>.answer}}`, or `{{nodes.<slug>.answer.<field>}}` for structured agents).

Two distinct failure modes, both non-zero exit with `status: 404`:

- `"Action not found."` — the `actionSlug` / `toolUuid` / `agentUuid` doesn't exist. Slugs are exact and case-sensitive (`enrichCompany`, not `company_enrich`); list them via `integration get <slug>` → `.integration.actions` keys.
- `"Action has no output schema."` — the action exists but declares no output schema (its catalog entry has no `output` key). Fall back to running it once and reading `runContext.<nodeSlug>` from `run get`.

### Why it's useful

- **Wire a node graph correctly the first time.** Know which fields exist before referencing them downstream as `{{nodes.<slug>.<field>}}` — avoids the silent-`undefined` footgun (see `../node-selection.md`).
- **Know an agent's output envelope** (`.answer` vs structured fields) before writing branch/filter expressions against it.
- **Map onto storage columns** ahead of a batch, without a throwaway run to inspect the output.

---

## End-to-end: enrich a company with a connector action

```bash
# 1. Find the integration and action
cargo-ai connection integration get clearbit
# → Find actionSlug: "enrichCompany" (slugs are exact — keys of .integration.actions)

# 2. Execute
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"clearbit","actionSlug":"enrichCompany"}' \
  --data '{"domain":"acme.com"}' \
  --wait-until-finished
# → Done. Check run.status for success/error.
```

## End-to-end: run a tool action on multiple leads

```bash
# 1. Find the tool
cargo-ai orchestration tool list
# → Find "Lead Enrichment", extract uuid

# 2. Execute batch
cargo-ai orchestration action execute-batch \
  --action '{"kind":"tool","toolUuid":"<tool-uuid>"}' \
  --records '[
    {"email":"alice@acme.com","company":"Acme"},
    {"email":"bob@globex.com","company":"Globex"},
    {"email":"carol@initech.com","company":"Initech"}
  ]' \
  --wait-until-finished
# → Check batch.status, batch.failedRunsCount
```
