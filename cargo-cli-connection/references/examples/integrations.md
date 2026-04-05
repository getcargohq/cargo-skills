# Integration examples

## List all available integrations

```bash
cargo-ai connection integration list
```

Response includes `slug`, `name`, `description`, and `category` for each available integration.

## Filter integrations

```bash
# By category
cargo-ai connection integration list --category enrichment

# By name search
cargo-ai connection integration list --search "hubspot"

# By exact slug
cargo-ai connection integration list --slug clearbit

# Only those with actions (usable in workflow nodes)
cargo-ai connection integration list --has-actions true

# Only those with extractors (can sync data into models)
cargo-ai connection integration list --has-extractors true
```

**Categories:** `engagement`, `marketing`, `sales`, `finance`, `analytics`, `freeform`, `success`, `support`, `enrichment`, `storage`, `custom`.

## Find an integration slug

```bash
cargo-ai connection integration list --search "hubspot"
# → Extract the "slug" value
# → Use slug when creating connectors: --integration-slug <slug>
```

## Get full integration details (actions + config schemas)

```bash
cargo-ai connection integration list --slug clearbit
# → Returns the full integration object including .manifest.actions and their config.jsonSchema
```

Use this to discover all available actions for an integration and the exact config fields each action expects. This is the authoritative source before building a connector node — field names vary between integrations and are not validated by `node validate`.

```bash
# Extract the config schema for a specific action
cargo-ai connection integration list --slug sql | \
  jq '.integrations[0].manifest.actions.upsertRecords.config.jsonSchema'
```

## Get integration documentation (plain text)

```bash
cargo-ai connection integration get-documentation clearbit
cargo-ai connection integration get-documentation hubspot
```

Returns plain text documentation for the integration. Useful for a quick overview, but does not include machine-readable config schemas — use `integration list --slug <slug>` when you need the exact field names for node configs.

## Discover actions for a specific integration (e.g. HubSpot)

```bash
# Full manifest with action schemas
cargo-ai connection integration list --slug hubspot
# → .integrations[0].manifest.actions — keyed by actionSlug
# → Each action includes .config.jsonSchema for building workflow nodes

# Plain text overview
cargo-ai connection integration get-documentation hubspot
```

**Use `integration list --slug <slug>` when you need service-specific action config schemas** — HubSpot, Salesforce, SQL, Clearbit, etc.

## Discover native (built-in Cargo) actions and extractors

```bash
cargo-ai connection native-integration get
# → Returns built-in Cargo actions ONLY — NOT HubSpot or other third-party actions
# → actions: keyed by actionSlug (generic platform utilities)
# → extractors: keyed by extractor slug
```

**Important:** `native-integration get` does **not** return HubSpot-specific or other third-party connector actions. To get those, use `integration get <slug>` instead.

Use `actionSlug` values in workflow node configs (see `cargo-cli-orchestration/references/nodes.md`).

## Set up a connector for use in workflows (full flow)

```bash
# 1. Find the integration slug
cargo-ai connection integration list --search "hubspot"
# → Extract the "slug" value

# 2. Create the connector
cargo-ai connection connector create \
  --integration-slug hubspot \
  --slug hubspot_production \
  --name "HubSpot - Production"
# → Note the returned connector UUID

# 3. Get the integration details to discover available actions
cargo-ai connection integration get hubspot
# → Or get plain text docs: cargo-ai connection integration get-documentation hubspot

# 4. Use the connector UUID and action slug in a workflow node
# See cargo-cli-orchestration references/nodes.md for node syntax
```

## Common integration slugs

| Service       | Slug           |
| ------------- | -------------- |
| Clearbit      | `clearbit`     |
| HubSpot       | `hubspot`      |
| Salesforce    | `salesforce`   |
| Apollo.io     | `apolloio`     |
| HTTP (custom) | `http`         |
| Slack         | `slack`        |
| Google Sheets | `googleSheets` |
| SQL (BigQuery, Snowflake, etc.) | `sql` |

Run `integration list` for the complete current list.

---

## SQL integration — action config reference

The SQL integration uses different field names from CRM connectors like Salesforce. Always use `integration list --slug sql` to confirm schemas, but the key actions are documented below.

### `upsertRecords` — MERGE a row by matching column

```json
{
  "kind": "connector",
  "integrationSlug": "sql",
  "actionSlug": "upsertRecords",
  "connectorUuid": "<your-sql-connector-uuid>",
  "config": {
    "database": "my-bq-project",
    "schema": "my_dataset",
    "table": "my_table",
    "matchingColumnSlug": "domain",
    "matchingValue": {
      "kind": "templateExpression",
      "expression": "{{ nodes.start.domain }}",
      "instructTo": "none",
      "fromRecipe": false
    },
    "mappings": [
      {
        "columnSlug": "domain",
        "value": {
          "kind": "templateExpression",
          "expression": "{{ nodes.start.domain }}",
          "instructTo": "none",
          "fromRecipe": false
        }
      },
      {
        "columnSlug": "parent_domain",
        "value": {
          "kind": "templateExpression",
          "expression": "{{ nodes.start.parent_domain }}",
          "instructTo": "none",
          "fromRecipe": false
        }
      }
    ]
  }
}
```

> **Note:** The target table is specified as three separate fields (`database`, `schema`, `table`) — not as a single `objectType` string. Using `objectType` passes `node validate` but leaves all three fields empty in the UI and fails at runtime.
