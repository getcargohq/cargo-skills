---
name: cargo-cli-connection
description: Manage connectors and integrations using the Cargo CLI. Use when the user wants to list, create, update, or remove connectors, discover available integrations, or understand what connector actions are available for use in workflows.
license: MIT
compatibility: Requires @cargo-ai/cli@^1.0.5 (npm) and a Cargo API token
metadata:
  author: getcargo
  version: "1.0"
---

# Cargo CLI — Connections

Connector and integration management: listing connectors, discovering available integrations, and managing authenticated connector instances.

> See `references/response-shapes.md` for full JSON response structures.
> See `references/troubleshooting.md` for common errors and how to fix them.
> See `references/examples/connectors.md` for connector CRUD and discovery examples.
> See `references/examples/integrations.md` for listing available integrations and OAuth flows.
> For third-party connector rate limit handling and retry config in workflows, see `cargo-cli-orchestration/references/polling.md` and `cargo-cli-orchestration/references/troubleshooting.md`. Native integrations do not have rate limits.

## Prerequisites

```bash
npm install -g @cargo-ai/cli@^1.0.5
cargo-ai login --token <your-api-token>
cargo-ai login --token <your-api-token> --workspace-uuid <uuid>
```

Verify with `cargo-ai whoami`. All commands output JSON to stdout. Without a global install, prefix every command with `npx @cargo-ai/cli@^1.0.5` instead of `cargo-ai`.

Failed commands exit non-zero and return `{"errorMessage": "..."}`.

## Key concepts

**Integration:** The external service type (e.g. HubSpot, Clearbit, Salesforce). Integrations define what actions are available.

**Connector:** An authenticated instance of an integration. One integration can have multiple connectors (e.g. two different HubSpot accounts). Connectors are what you reference in workflow node graphs.

## Discover resources first

```bash
cargo-ai connection connector list                        # all authenticated connectors
cargo-ai connection integration list                      # all available integration types
cargo-ai connection integration list --search "hubspot"   # search by name
cargo-ai connection integration get <slug>                # third-party-specific actions (e.g. HubSpot)
cargo-ai connection native-integration get                # built-in Cargo actions only (NOT third-party)
```

### `integration get` vs `native-integration get`

These two commands return **different sets of actions** and are not interchangeable:

| Command | What it returns | When to use |
|---|---|---|
| `integration get <slug>` | Actions specific to a third-party service (e.g. HubSpot contact CRUD, deal management, Salesforce queries) | When you need service-specific actions to use in a connector node — **use this for HubSpot, Salesforce, Clearbit, etc.** |
| `native-integration get` | Generic built-in Cargo actions (e.g. HTTP requests, data transforms, internal utilities) | When you need Cargo-native capabilities that don't belong to any specific third-party connector |

**Example:** To find HubSpot-specific actions, use `integration get hubspot` — not `native-integration get`. The latter will only return generic actions unrelated to HubSpot.

## Quick reference

```bash
cargo-ai connection connector list --integration-slug <slug>
cargo-ai connection connector create --integration-slug <slug> --slug <slug> --name <name>
cargo-ai connection connector update --uuid <uuid> --name <name>
cargo-ai connection connector remove <connector-uuid>
cargo-ai connection connector get <connector-uuid>
cargo-ai connection integration list
cargo-ai connection integration get <slug>
cargo-ai connection integration get-documentation <slug>
cargo-ai connection native-integration get
```

## Connectors

Connectors are authenticated connections to external services.

```bash
# List all connectors
cargo-ai connection connector list

# Create a connector
cargo-ai connection connector create \
  --integration-slug clearbit \
  --slug clearbit_production \
  --name "Clearbit - Production"

# Update a connector
cargo-ai connection connector update --uuid <connector-uuid> --name "Clearbit - Staging"

# Remove a connector
cargo-ai connection connector remove <connector-uuid>

# Check if a connector slug is taken
cargo-ai connection connector exists-by-slug --slug clearbit_production
```

**Note:** Creating a connector requires `--slug` (unique identifier) in addition to `--name` (display name) and `--integration-slug`. For OAuth-based integrations, the authentication flow is completed separately via `connection integration complete-oauth`.

## Integrations

Integrations define the available services and their connector actions.

```bash
# List all available integrations
cargo-ai connection integration list

# Filter by category
cargo-ai connection integration list --category enrichment

# Search by name
cargo-ai connection integration list --search "hubspot"

# Find by exact slug
cargo-ai connection integration list --slug clearbit

# Only integrations that have actions (usable in workflow nodes)
cargo-ai connection integration list --has-actions true

# Only integrations that have extractors (can sync data into models)
cargo-ai connection integration list --has-extractors true

# Get built-in Cargo actions and extractors (NOT third-party connector actions)
cargo-ai connection native-integration get
```

**Integration categories:** `engagement`, `marketing`, `sales`, `finance`, `analytics`, `freeform`, `success`, `support`, `enrichment`, `storage`, `custom`.

Use `integration get <slug>` to discover all actions available for a specific third-party service (e.g. HubSpot, Salesforce). Use `native-integration get` only for built-in Cargo actions — it does **not** return HubSpot or other service-specific actions. Actions are referenced by `actionSlug` in workflow node graphs (see the `cargo-cli-orchestration` skill's `references/nodes.md`).

## Using connector actions in workflows

Connector actions are used as nodes in workflow graphs. To use an action:

```bash
# 1. Find your connector UUID
cargo-ai connection connector list
# → Filter the output by integrationSlug to find the right connector

# 2. Discover available actions for the integration
cargo-ai connection integration get <integration-slug>
# → actions are keyed by actionSlug, with config.jsonSchema for each
# → Or use get-documentation for a plain text overview
# → Or use native-integration get for built-in Cargo actions (not third-party)

# 3. Reference the connector and action in a node graph
# See cargo-cli-orchestration references/nodes.md for the full node syntax
```

Example connector node (Clearbit company enrichment):

```json
{
  "uuid": "node-uuid",
  "slug": "enrich",
  "kind": "connector",
  "integrationSlug": "clearbit",
  "actionSlug": "company_enrich",
  "connectorUuid": "<clearbit-connector-uuid>",
  "config": {
    "domain": {
      "kind": "templateExpression",
      "expression": "{{nodes.start.domain}}",
      "instructTo": "none",
      "fromRecipe": false
    }
  },
  "childrenUuids": ["end-node-uuid"],
  "fallbackOnFailure": false,
  "position": { "x": 0, "y": 166 }
}
```

## Help

Every command supports `--help`:

```bash
cargo-ai connection connector list --help
cargo-ai connection connector create --help
cargo-ai connection integration list --help
```
