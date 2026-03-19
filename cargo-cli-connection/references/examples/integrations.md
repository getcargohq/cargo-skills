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

## Get full integration details

```bash
cargo-ai connection integration get clearbit
# → Returns the full integration object with actions, extractors, and configuration schemas
```

Use this to discover all available actions and extractors for an integration, including their `config.jsonSchema` for building workflow nodes.

## Get integration documentation

```bash
cargo-ai connection integration get-documentation clearbit
cargo-ai connection integration get-documentation hubspot
```

Returns plain text documentation for the integration, including available actions and their configuration.

## Discover native actions and extractors

```bash
cargo-ai connection native-integration get
# → actions: keyed by actionSlug (e.g. "company_enrich", "send_email")
# → extractors: keyed by extractor slug
```

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

Run `integration list` for the complete current list.
