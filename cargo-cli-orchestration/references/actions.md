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

Every action object also requires a `config` field (use `{}` for defaults).

> **When to use actions vs workflows:** Actions are for running a **single step**. If you need to chain multiple steps together (enrichment → scoring → CRM push), use `run create --nodes` or `batch create --nodes` instead. See `tools.md` for workflow examples.

---

## Execute one action on one record

```bash
# Tool action
cargo-ai orchestration action execute \
  --action '{"kind":"tool","toolUuid":"<tool-uuid>","config":{}}' \
  --data '{"domain":"acme.com"}'

# Connector action
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"clearbit","actionSlug":"company_enrich","config":{}}' \
  --data '{"domain":"acme.com"}'

# Agent action
cargo-ai orchestration action execute \
  --action '{"kind":"agent","agentUuid":"<agent-uuid>","config":{}}' \
  --data '{"company":"Acme Corp"}'
```

Returns a `run` object. Poll with `run get <uuid>` until terminal, or pass `--wait-until-finished`:

```bash
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"clearbit","actionSlug":"company_enrich","config":{}}' \
  --data '{"domain":"acme.com"}' \
  --wait-until-finished
```

Custom polling interval (default 5000ms):

```bash
cargo-ai orchestration action execute \
  --action '{"kind":"tool","toolUuid":"<tool-uuid>","config":{}}' \
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
  --action '{"kind":"tool","toolUuid":"<tool-uuid>","config":{}}' \
  --records '[{"domain":"acme.com"},{"domain":"globex.com"},{"domain":"initech.com"}]'
```

Returns a `batch` object. Poll with `batch get <uuid>` until terminal, or pass `--wait-until-finished`:

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"clearbit","actionSlug":"company_enrich","config":{}}' \
  --records '[{"domain":"acme.com"},{"domain":"globex.com"}]' \
  --wait-until-finished
```

### Webhook notification

Get notified when the batch completes instead of polling:

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"tool","toolUuid":"<tool-uuid>","config":{}}' \
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
    "actionSlug":"company_enrich",
    "config":{},
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

## End-to-end: enrich a company with a connector action

```bash
# 1. Find the integration and action
cargo-ai connection integration get clearbit
# → Find actionSlug: "company_enrich"

# 2. Execute
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"clearbit","actionSlug":"company_enrich","config":{}}' \
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
  --action '{"kind":"tool","toolUuid":"<tool-uuid>","config":{}}' \
  --records '[
    {"email":"alice@acme.com","company":"Acme"},
    {"email":"bob@globex.com","company":"Globex"},
    {"email":"carol@initech.com","company":"Initech"}
  ]' \
  --wait-until-finished
# → Check batch.status, batch.failedRunsCount
```
