# Connector examples

## List all connectors

```bash
cargo-ai connection connector list
```

## Filter connectors by integration

```bash
cargo-ai connection connector list --integration-slug clearbit
# → Returns only connectors for the Clearbit integration
```

## Get a single connector

```bash
cargo-ai connection connector get <connector-uuid>
# → Returns the full connector object (same shape as an item from connector list)
```

## Find a connector UUID for use in a workflow

```bash
# 1. List connectors (optionally filter by integration)
cargo-ai connection connector list --integration-slug clearbit
# → Extract the "uuid" field from the right connector

# 2. Use the UUID in your workflow node's connectorUuid config
```

## Create a connector

```bash
cargo-ai connection connector create \
  --integration-slug clearbit \
  --slug clearbit_production \
  --name "Clearbit - Production"
```

`--slug` is a unique identifier (no spaces), `--name` is the display name. For credit-based integrations (`useCredits: true`), this is all that's needed. For credential-based integrations, pass `--config` with the integration-specific credentials JSON.

## Update a connector

```bash
cargo-ai connection connector update --uuid <connector-uuid> --name "Clearbit - Staging"
cargo-ai connection connector update --uuid <connector-uuid> --config '{"apiKey":"new-key"}'
```

## Remove a connector

```bash
# Check usage first — list connectors and check playsCount and toolsCount
cargo-ai connection connector list
# → High counts mean the connector is heavily used — remove dependencies before deleting

cargo-ai connection connector remove <connector-uuid>
```

## Check if a slug is available

```bash
cargo-ai connection connector exists-by-slug --slug clearbit_production
# → { "exists": true }
```

## Connector usage audit

Find all connectors and how many plays/tools use each:

```bash
cargo-ai connection connector list
# → Check playsCount and toolsCount fields for each connector
```

## Rate limit awareness

Some connectors have rate limits (visible in the `rateLimit` field from `connector list`):

```bash
cargo-ai connection connector list
# → Check rateLimit.unit (day/hour/minute) and rateLimit.max for each connector
# → Design batches to stay within these limits
```
